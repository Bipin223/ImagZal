import UTIF from 'utif';
import type { UTIFImage } from 'utif';
import { baseName, extensionOf, outputExt } from './formats';
import type { OutputFormat } from './formats';

export interface ConvertOptions {
  format: OutputFormat;
  /** 0..1, used by lossy encoders. */
  quality: number;
}

export interface ConvertResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

const MIME: Record<OutputFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  return ctx;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This file could not be decoded as an image.'));
    image.src = url;
  });
}

async function decodeWithElement(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const width = image.naturalWidth || image.width || 1024;
    const height = image.naturalHeight || image.height || 1024;
    const canvas = makeCanvas(width, height);
    context(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeWithBitmap(blob: Blob): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
      } as ImageBitmapOptions);
      try {
        const canvas = makeCanvas(bitmap.width, bitmap.height);
        context(canvas).drawImage(bitmap, 0, 0);
        return canvas;
      } finally {
        bitmap.close();
      }
    } catch {
      // Some formats (older ICO/SVG variants) only decode through an <img>.
    }
  }
  return decodeWithElement(blob);
}

async function decodeHeic(file: File): Promise<HTMLCanvasElement> {
  try {
    const module = await import('heic2any');
    const convertHeic = (module.default ?? module) as unknown as (options: {
      blob: Blob;
      toType?: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
    const output = await convertHeic({ blob: file, toType: 'image/jpeg', quality: 0.94 });
    const blob = Array.isArray(output) ? output[0] : output;
    if (!blob) throw new Error('No image data');
    return await decodeWithBitmap(blob);
  } catch {
    throw new Error('This HEIC photo could not be decoded. Try exporting it as JPG first.');
  }
}

async function decodeTiff(file: File): Promise<HTMLCanvasElement> {
  const buffer = await file.arrayBuffer();
  let images: UTIFImage[] = [];
  try {
    images = UTIF.decode(buffer);
  } catch {
    throw new Error('This TIFF could not be decoded.');
  }
  if (!images.length) throw new Error('No image data was found in this TIFF.');

  const page = images[0];
  UTIF.decodeImage(buffer, page, images);
  const width = Number(page.width);
  const height = Number(page.height);
  if (!width || !height) throw new Error('This TIFF has no readable pixel data.');

  const rgba = UTIF.toRGBA8(page);
  const canvas = makeCanvas(width, height);
  const ctx = context(canvas);
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  imageData.data.set(rgba.subarray(0, imageData.data.length));
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function decodeSvg(file: File): Promise<HTMLCanvasElement> {
  const text = await file.text();
  const svgTag = /<svg[^>]*>/i.exec(text)?.[0] ?? '';

  const widthAttr = Number.parseFloat(/\swidth=["']([\d.]+)/i.exec(svgTag)?.[1] ?? '');
  const heightAttr = Number.parseFloat(/\sheight=["']([\d.]+)/i.exec(svgTag)?.[1] ?? '');
  let width = widthAttr;
  let height = heightAttr;

  if (!width || !height) {
    const viewBox = /\sviewBox=["']([^"']+)["']/i.exec(svgTag)?.[1];
    const parts = viewBox?.trim().split(/[\s,]+/).map(Number) ?? [];
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      width = parts[2];
      height = parts[3];
    }
  }
  if (!width || !height) {
    width = 1024;
    height = 1024;
  }

  const scale = Math.min(1, 2048 / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));

  try {
    const image = await loadImage(url);
    const canvas = makeCanvas(targetWidth, targetHeight);
    context(canvas).drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas;
  } catch {
    throw new Error('Could not render this SVG. Check that it has no broken external references.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeToCanvas(file: File): Promise<HTMLCanvasElement> {
  const ext = extensionOf(file.name);
  const type = file.type.toLowerCase();

  if (ext === 'heic' || ext === 'heif' || type.includes('heic') || type.includes('heif')) {
    return decodeHeic(file);
  }
  if (ext === 'tif' || ext === 'tiff' || type === 'image/tiff') {
    return decodeTiff(file);
  }
  if (ext === 'svg' || type === 'image/svg+xml') {
    return decodeSvg(file);
  }
  return decodeWithBitmap(file);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`This browser could not encode ${type.replace('image/', '').toUpperCase()}.`));
          return;
        }
        if (blob.type && blob.type !== type) {
          reject(new Error(`${type.replace('image/', '').toUpperCase()} encoding is not available in this browser.`));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function flattenOnWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = makeCanvas(source.width, source.height);
  const ctx = context(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function resizeToFit(source: HTMLCanvasElement, max: number): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  if (scale === 1) return source;
  const canvas = makeCanvas(source.width * scale, source.height * scale);
  const ctx = context(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function encodeBmp(source: HTMLCanvasElement): Blob {
  const canvas = flattenOnWhite(source);
  const width = canvas.width;
  const height = canvas.height;
  const pixels = context(canvas).getImageData(0, 0, width, height).data;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buffer = new ArrayBuffer(54 + pixelBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, 54 + pixelBytes, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);

  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - 1 - y;
    let offset = 54 + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceRow * width + x) * 4;
      bytes[offset] = pixels[source + 2];
      bytes[offset + 1] = pixels[source + 1];
      bytes[offset + 2] = pixels[source];
      offset += 3;
    }
  }

  return new Blob([buffer], { type: MIME.bmp });
}

async function encodeIco(source: HTMLCanvasElement): Promise<Blob> {
  const canvas = resizeToFit(source, 256);
  const png = await canvasToBlob(canvas, 'image/png');
  const pngBytes = new Uint8Array(await png.arrayBuffer());
  const header = new Uint8Array(22 + pngBytes.length);
  const view = new DataView(header.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  header[6] = canvas.width >= 256 ? 0 : canvas.width;
  header[7] = canvas.height >= 256 ? 0 : canvas.height;
  header[8] = 0;
  header[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, 22, true);
  header.set(pngBytes, 22);

  return new Blob([header], { type: MIME.ico });
}

function encodeTiff(canvas: HTMLCanvasElement): Blob {
  const pixels = context(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
  const buffer = UTIF.encodeImage(new Uint8Array(pixels), canvas.width, canvas.height);
  return new Blob([buffer], { type: MIME.tiff });
}

export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  options: ConvertOptions,
): Promise<Blob> {
  const quality = Math.min(1, Math.max(0.05, options.quality));

  switch (options.format) {
    case 'png':
      return canvasToBlob(canvas, MIME.png);
    case 'webp':
      return canvasToBlob(canvas, MIME.webp, quality);
    case 'avif':
      return canvasToBlob(canvas, MIME.avif, quality);
    case 'jpeg': {
      const flattened = flattenOnWhite(canvas);
      return canvasToBlob(flattened, MIME.jpeg, quality);
    }
    case 'bmp':
      return encodeBmp(canvas);
    case 'ico':
      return encodeIco(canvas);
    case 'tiff':
      return encodeTiff(canvas);
  }
}

export async function convertFile(
  file: File,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const canvas = await decodeToCanvas(file);
  try {
    const blob = await encodeCanvas(canvas, options);
    return {
      blob,
      filename: `${baseName(file.name)}.${outputExt(options.format)}`,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function detectEncoders(): Promise<{
  jpeg: boolean;
  webp: boolean;
  avif: boolean;
}> {
  const canvas = makeCanvas(2, 2);
  context(canvas).fillRect(0, 0, 2, 2);

  const probe = async (type: string): Promise<boolean> => {
    try {
      const blob = await canvasToBlob(canvas, type, 0.8);
      return blob.type === type;
    } catch {
      return false;
    }
  };

  const [jpeg, webp, avif] = await Promise.all([
    probe('image/jpeg'),
    probe('image/webp'),
    probe('image/avif'),
  ]);

  canvas.width = 0;
  canvas.height = 0;
  return { jpeg, webp, avif };
}

export function mimeFor(format: OutputFormat): string {
  return MIME[format];
}
