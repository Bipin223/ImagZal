import { strToU8, zipSync } from 'fflate';
import { decodeToCanvas, encodeCanvas } from './convert';
import { baseName } from './formats';

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export interface ImageOutput {
  blob: Blob;
  width: number;
  height: number;
}

function emptyCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available in this browser.');
  return context;
}

function scaledCanvas(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const canvas = emptyCanvas(source.width * scale, source.height * scale);
  const context = contextOf(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / source.width, height / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  context.drawImage(
    source,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawContain(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / source.width, height / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  context.drawImage(
    source,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function blob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as unknown as BlobPart], { type });
}

/** Re-encode until the file fits the requested size (JPEG/WEBP only). */
export async function compressToTarget(
  file: File,
  targetBytes: number,
  format: Extract<ImageFormat, 'jpeg' | 'webp'>,
): Promise<ImageOutput & { quality: number; scale: number; hit: boolean }> {
  const source = await decodeToCanvas(file);
  const scales = [1, 0.82, 0.66, 0.52, 0.4, 0.3];
  let fallback: { blob: Blob; quality: number; scale: number; width: number; height: number } | null =
    null;

  try {
    for (const scale of scales) {
      const canvas = scale === 1 ? source : scaledCanvas(source, scale);
      let low = 0.32;
      let high = 0.92;
      let found:
        | { blob: Blob; quality: number; scale: number; width: number; height: number }
        | null = null;
      let smallest:
        | { blob: Blob; quality: number; scale: number; width: number; height: number }
        | null = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const quality = (low + high) / 2;
        const candidate = await encodeCanvas(canvas, { format, quality });
        const entry = {
          blob: candidate,
          quality,
          scale,
          width: canvas.width,
          height: canvas.height,
        };
        if (!smallest || candidate.size < smallest.blob.size) smallest = entry;
        if (candidate.size <= targetBytes) {
          found = entry;
          low = quality;
        } else {
          high = quality;
        }
      }

      if (found) {
        if (canvas !== source) {
          canvas.width = 0;
          canvas.height = 0;
        }
        return { ...found, hit: true };
      }
      if (smallest && (!fallback || smallest.blob.size < fallback.blob.size)) fallback = smallest;

      if (canvas !== source) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  } finally {
    source.width = 0;
    source.height = 0;
  }

  if (!fallback) throw new Error('This image could not be compressed.');
  return { ...fallback, hit: false };
}

export interface ResizeOptions {
  width?: number;
  height?: number;
  mode: 'fit' | 'crop';
  format: ImageFormat;
  quality: number;
}

export async function resizeImage(file: File, options: ResizeOptions): Promise<ImageOutput> {
  const source = await decodeToCanvas(file);
  const ratio = source.height / source.width;
  let width = options.width && options.width > 0 ? Math.round(options.width) : 0;
  let height = options.height && options.height > 0 ? Math.round(options.height) : 0;
  if (!width && !height) throw new Error('Enter a width or a height.');
  if (!width) width = Math.max(1, Math.round(height / ratio));
  if (!height) height = Math.max(1, Math.round(width * ratio));

  const canvas = emptyCanvas(width, height);
  const context = contextOf(canvas);

  try {
    if (options.mode === 'crop') {
      drawCover(context, source, 0, 0, width, height);
    } else {
      if (options.format === 'jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
      }
      drawContain(context, source, 0, 0, width, height);
    }

    const output = await encodeCanvas(canvas, {
      format: options.format,
      quality: options.quality,
    });
    return { blob: output, width, height };
  } finally {
    source.width = 0;
    source.height = 0;
    canvas.width = 0;
    canvas.height = 0;
  }
}

export type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'tile';

export interface WatermarkImageOptions {
  text: string;
  position: WatermarkPosition;
  opacity: number;
  sizePercent: number;
  color: 'light' | 'dark';
  format: ImageFormat;
  quality: number;
}

export async function watermarkImage(
  file: File,
  options: WatermarkImageOptions,
): Promise<ImageOutput> {
  const text = options.text.trim();
  if (!text) throw new Error('Enter the watermark text.');

  const source = await decodeToCanvas(file);
  const canvas = scaledCanvas(source, Math.min(1, 4096 / Math.max(source.width, source.height)));
  const context = contextOf(canvas);
  const size = Math.max(12, (Math.min(canvas.width, canvas.height) * options.sizePercent) / 100);
  const padding = Math.min(canvas.width, canvas.height) * 0.045;

  context.font = `600 ${size}px Poppins, Arial, sans-serif`;
  context.globalAlpha = options.opacity;
  context.fillStyle = options.color === 'light' ? '#ffffff' : '#111827';
  context.shadowColor = options.color === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';
  context.shadowBlur = size * 0.18;
  context.textBaseline = 'middle';

  const width = context.measureText(text).width;
  const height = size;
  const spots: Array<[number, number]> = [];

  if (options.position === 'tile') {
    const step = width + padding * 2;
    for (let y = padding + height / 2; y < canvas.height; y += Math.max(step * 0.6, height * 2.6)) {
      for (let x = -width; x < canvas.width + width; x += step) {
        spots.push([x, y]);
      }
    }
    context.textAlign = 'left';
    for (const [x, y] of spots) context.fillText(text, x, y);
  } else {
    let x = padding;
    let y = canvas.height / 2;
    if (options.position.includes('right')) x = canvas.width - width - padding;
    if (options.position === 'center') x = (canvas.width - width) / 2;
    if (options.position.includes('top')) y = padding + height / 2;
    if (options.position.includes('bottom')) y = canvas.height - padding - height / 2;
    context.textAlign = 'left';
    context.fillText(text, x, y);
  }

  context.globalAlpha = 1;
  context.shadowBlur = 0;

  try {
    const output = await encodeCanvas(canvas, { format: options.format, quality: options.quality });
    return { blob: output, width: canvas.width, height: canvas.height };
  } finally {
    source.width = 0;
    source.height = 0;
    canvas.width = 0;
    canvas.height = 0;
  }
}

export interface ImageInfo {
  width: number;
  height: number;
  bytes: number;
  type: string;
  hasExif: boolean;
}

export async function inspectImage(file: File): Promise<ImageInfo> {
  const source = await decodeToCanvas(file);
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  let exif = false;
  for (let index = 0; index < head.length - 6; index += 1) {
    if (
      head[index] === 0x45 &&
      head[index + 1] === 0x78 &&
      head[index + 2] === 0x69 &&
      head[index + 3] === 0x66 &&
      head[index + 4] === 0
    ) {
      exif = true;
      break;
    }
  }
  const info = {
    width: source.width,
    height: source.height,
    bytes: file.size,
    type: file.type || 'image/*',
    hasExif: exif,
  };
  source.width = 0;
  source.height = 0;
  return info;
}

export async function stripMetadata(
  file: File,
  format: ImageFormat,
  quality: number,
): Promise<ImageOutput> {
  const source = await decodeToCanvas(file);
  try {
    const blob = await encodeCanvas(source, { format, quality });
    return { blob, width: source.width, height: source.height };
  } finally {
    source.width = 0;
    source.height = 0;
  }
}

const FAVICON_SIZES = [16, 32, 48, 64, 180, 192, 512];

export interface FaviconPack {
  zip: Blob;
  files: Array<{ name: string; bytes: number }>;
}

export async function makeFaviconPack(file: File): Promise<FaviconPack> {
  const source = await decodeToCanvas(file);
  const entries: Record<string, Uint8Array> = {};
  const files: Array<{ name: string; bytes: number }> = [];

  try {
    for (const size of FAVICON_SIZES) {
      const canvas = emptyCanvas(size, size);
      const context = contextOf(canvas);
      drawContain(context, source, 0, 0, size, size);
      const encoded = await encodeCanvas(canvas, { format: 'png', quality: 1 });
      const bytes = new Uint8Array(await encoded.arrayBuffer());
      const name = `icon-${size}.png`;
      entries[name] = bytes;
      files.push({ name, bytes: bytes.length });
      canvas.width = 0;
      canvas.height = 0;
    }

    const icoCanvas = emptyCanvas(256, 256);
    const icoContext = contextOf(icoCanvas);
    drawContain(icoContext, source, 0, 0, 256, 256);
    const ico = await encodeCanvas(icoCanvas, { format: 'ico', quality: 1 });
    const icoBytes = new Uint8Array(await ico.arrayBuffer());
    entries['favicon.ico'] = icoBytes;
    files.push({ name: 'favicon.ico', bytes: icoBytes.length });
    icoCanvas.width = 0;
    icoCanvas.height = 0;
  } finally {
    source.width = 0;
    source.height = 0;
  }

  const manifest = {
    name: 'ImagZal',
    short_name: 'ImagZal',
    icons: FAVICON_SIZES.map((size) => ({
      src: `/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
    })),
    theme_color: '#f6f6f4',
    background_color: '#f6f6f4',
    display: 'standalone',
  };
  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  entries['site.webmanifest'] = manifestBytes;
  files.push({ name: 'site.webmanifest', bytes: manifestBytes.length });

  return { zip: blob(zipSync(entries, { level: 6 }), 'application/zip'), files };
}

export type PassportPreset = 'np' | 'us';
export type SheetSize = '4x6' | 'a4';

const PASSPORT_MM: Record<PassportPreset, [number, number]> = {
  np: [35, 45],
  us: [50.8, 50.8],
};

export interface PassportResult {
  blob: Blob;
  width: number;
  height: number;
  count: number;
}

export async function makePassportSheet(
  file: File,
  preset: PassportPreset,
  sheet: SheetSize,
): Promise<PassportResult> {
  const dpi = 300;
  const [mmWidth, mmHeight] = PASSPORT_MM[preset];
  const photoWidth = Math.round((mmWidth / 25.4) * dpi);
  const photoHeight = Math.round((mmHeight / 25.4) * dpi);
  const [sheetWidth, sheetHeight] =
    sheet === '4x6' ? [Math.round(4 * dpi), Math.round(6 * dpi)] : [Math.round(8.27 * dpi), Math.round(11.69 * dpi)];

  const source = await decodeToCanvas(file);
  const photo = emptyCanvas(photoWidth, photoHeight);
  drawCover(contextOf(photo), source, 0, 0, photoWidth, photoHeight);

  const margin = Math.round(dpi * 0.12);
  const gap = Math.round(dpi * 0.08);
  const columns = Math.max(1, Math.floor((sheetWidth - margin * 2 + gap) / (photoWidth + gap)));
  const rows = Math.max(1, Math.floor((sheetHeight - margin * 2 + gap) / (photoHeight + gap)));

  const canvas = emptyCanvas(sheetWidth, sheetHeight);
  const context = contextOf(canvas);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, sheetWidth, sheetHeight);

  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = margin + column * (photoWidth + gap);
      const y = margin + row * (photoHeight + gap);
      context.drawImage(photo, x, y);
      context.strokeStyle = 'rgba(0,0,0,0.18)';
      context.lineWidth = 2;
      context.strokeRect(x, y, photoWidth, photoHeight);
      count += 1;
    }
  }

  const output = await encodeCanvas(canvas, { format: 'jpeg', quality: 0.94 });
  const result = { blob: output, width: sheetWidth, height: sheetHeight, count };
  source.width = 0;
  source.height = 0;
  photo.width = 0;
  photo.height = 0;
  canvas.width = 0;
  canvas.height = 0;
  return result;
}

export interface CollageOptions {
  columns: number;
  gap: number;
  width: number;
  format: ImageFormat;
  quality: number;
  background: string;
}

export async function makeCollage(files: File[], options: CollageOptions): Promise<ImageOutput> {
  if (!files.length) throw new Error('Add at least one photo.');
  const columns = Math.max(1, Math.min(options.columns, files.length));
  const rows = Math.ceil(files.length / columns);
  const gap = Math.max(0, options.gap);
  const cell = Math.max(80, Math.floor((options.width - gap * (columns + 1)) / columns));
  const width = cell * columns + gap * (columns + 1);
  const height = cell * rows + gap * (rows + 1);

  const canvas = emptyCanvas(width, height);
  const context = contextOf(canvas);
  context.fillStyle = options.background;
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < files.length; index += 1) {
    const source = await decodeToCanvas(files[index]);
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawCover(
      context,
      source,
      gap + column * (cell + gap),
      gap + row * (cell + gap),
      cell,
      cell,
    );
    source.width = 0;
    source.height = 0;
  }

  try {
    const output = await encodeCanvas(canvas, {
      format: options.format,
      quality: options.quality,
    });
    return { blob: output, width, height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function imageFormatOf(file: File): ImageFormat {
  const type = file.type.toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpeg';
}

export function outputName(file: File, suffix: string, format: ImageFormat): string {
  const ext = format === 'jpeg' ? 'jpg' : format;
  return `${baseName(file.name)}-${suffix}.${ext}`;
}

export function formatExt(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}
