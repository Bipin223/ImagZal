export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'tiff' | 'bmp' | 'ico';

export interface OutputFormatInfo {
  id: OutputFormat;
  label: string;
  ext: string;
  blurb: string;
  lossy: boolean;
}

export const OUTPUT_FORMATS: OutputFormatInfo[] = [
  { id: 'png', label: 'PNG', ext: 'png', blurb: 'Lossless, keeps transparency', lossy: false },
  { id: 'jpeg', label: 'JPG', ext: 'jpg', blurb: 'Small photos, white background', lossy: true },
  { id: 'webp', label: 'WEBP', ext: 'webp', blurb: 'Small files, keeps transparency', lossy: true },
  { id: 'avif', label: 'AVIF', ext: 'avif', blurb: 'Modern compression', lossy: true },
  { id: 'tiff', label: 'TIFF', ext: 'tiff', blurb: 'Uncompressed, print friendly', lossy: false },
  { id: 'bmp', label: 'BMP', ext: 'bmp', blurb: 'Plain bitmap', lossy: false },
  { id: 'ico', label: 'ICO', ext: 'ico', blurb: 'Favicon, resized to 256px', lossy: false },
];

export const OUTPUT_BY_ID = Object.fromEntries(
  OUTPUT_FORMATS.map((format) => [format.id, format]),
) as Record<OutputFormat, OutputFormatInfo>;

export function outputLabel(format: OutputFormat): string {
  return OUTPUT_BY_ID[format].label;
}

export function outputExt(format: OutputFormat): string {
  return OUTPUT_BY_ID[format].ext;
}

const INPUT_LABELS: Record<string, string> = {
  jpg: 'JPG',
  jpeg: 'JPG',
  jfif: 'JPG',
  png: 'PNG',
  apng: 'PNG',
  webp: 'WEBP',
  avif: 'AVIF',
  gif: 'GIF',
  bmp: 'BMP',
  dib: 'BMP',
  tif: 'TIFF',
  tiff: 'TIFF',
  svg: 'SVG',
  ico: 'ICO',
  heic: 'HEIC',
  heif: 'HEIF',
};

export function extensionOf(filename: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

export function inputLabel(filename: string, mime: string): string {
  const known = INPUT_LABELS[extensionOf(filename)];
  if (known) return known;
  if (mime.startsWith('image/')) {
    const label = mime.slice(6).split(/[+.;]/)[0].toUpperCase();
    if (label) return label.slice(0, 5);
  }
  return 'IMAGE';
}

export function isSupportedImage(file: File): boolean {
  if (INPUT_LABELS[extensionOf(file.name)]) return true;
  return file.type.startsWith('image/');
}

export function baseName(filename: string): string {
  const stripped = filename.replace(/\.[^./\\]+$/, '');
  return stripped.trim() || 'image';
}
