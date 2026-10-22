import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocument as PdfLibDocument } from 'pdf-lib';
import { baseName } from './formats';

export interface PdfResult {
  filename: string;
  blob: Blob;
}

export interface PdfPageOrder {
  /** Zero-based page index in the source document. */
  index: number;
  /** Extra rotation in degrees (0, 90, 180, 270). */
  rotate: number;
}

const MAX_LONG_IMAGE_HEIGHT = 16000;

async function loadPdfLib(file: File): Promise<PdfLibDocument> {
  const { PDFDocument } = await import('pdf-lib');
  try {
    return await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  } catch {
    throw new Error('This PDF could not be opened. Password-protected or damaged PDFs are not supported.');
  }
}

async function pdfjsDocument(file: File) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  return { pdf, pdfjs, destroy: () => loadingTask.destroy() };
}

function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode this image.'))),
      type,
      quality,
    );
  });
}

/** Parse "1-3, 5, 8" into groups of zero-based page numbers. */
export function parsePageRanges(input: string, pageCount: number): number[][] {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) throw new Error('Enter at least one page or range.');

  return parts.map((part) => {
    const match = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(part);
    if (!match) throw new Error(`"${part}" is not a page number or range.`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!start || !end || start < 1 || end < 1 || start > pageCount || end > pageCount) {
      throw new Error(`Pages must be between 1 and ${pageCount}.`);
    }
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    return Array.from({ length: high - low + 1 }, (_, index) => low + index - 1);
  });
}

export async function pdfPageCount(file: File): Promise<number> {
  const document = await loadPdfLib(file);
  return document.getPageCount();
}

export async function mergePdfs(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  if (files.length < 2) throw new Error('Add at least two PDFs to merge.');
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();

  for (let index = 0; index < files.length; index += 1) {
    const source = await loadPdfLib(files[index]);
    const pages = await output.copyPages(source, source.getPageIndices());
    for (const page of pages) output.addPage(page);
    onProgress?.(index + 1, files.length);
  }

  return pdfBlob(await output.save());
}

export async function splitPdf(
  file: File,
  ranges: string,
  mode: 'one' | 'each',
): Promise<PdfResult[]> {
  const source = await loadPdfLib(file);
  const pageCount = source.getPageCount();
  const groups = parsePageRanges(ranges, pageCount);
  const stem = baseName(file.name);
  const results: PdfResult[] = [];
  const { PDFDocument } = await import('pdf-lib');

  if (mode === 'one') {
    const output = await PDFDocument.create();
    const flat = groups.flat();
    const pages = await output.copyPages(source, flat);
    for (const page of pages) output.addPage(page);
    results.push({ filename: `${stem}-pages.pdf`, blob: pdfBlob(await output.save()) });
    return results;
  }

  for (let index = 0; index < groups.length; index += 1) {
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, groups[index]);
    for (const page of pages) output.addPage(page);
    const label =
      groups[index].length === 1
        ? `page-${String(groups[index][0] + 1).padStart(2, '0')}`
        : `pages-${groups[index][0] + 1}-${groups[index][groups[index].length - 1] + 1}`;
    results.push({ filename: `${stem}-${label}.pdf`, blob: pdfBlob(await output.save()) });
  }

  return results;
}

export async function organizePdf(file: File, order: PdfPageOrder[]): Promise<Blob> {
  if (!order.length) throw new Error('Keep at least one page.');
  const source = await loadPdfLib(file);
  const { PDFDocument, degrees } = await import('pdf-lib');
  const output = await PDFDocument.create();
  const copied = await output.copyPages(
    source,
    order.map((entry) => entry.index),
  );

  copied.forEach((page, position) => {
    const base = page.getRotation().angle ?? 0;
    const angle = (((base + order[position].rotate) % 360) + 360) % 360;
    page.setRotation(degrees(angle));
    output.addPage(page);
  });

  return pdfBlob(await output.save());
}

export interface CompressPdfOptions {
  /** Render scale: 1 = 72 dpi, 1.5 = 108 dpi, 2 = 144 dpi. */
  scale: number;
  quality: number;
  onProgress?: (done: number, total: number) => void;
}

export async function compressPdf(file: File, options: CompressPdfOptions): Promise<Blob> {
  const { pdf, destroy } = await pdfjsDocument(file);
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const points = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: options.scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is not available in this browser.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport }).promise;
      const jpeg = await canvasToBlob(canvas, 'image/jpeg', options.quality);
      const image = await output.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      const outputPage = output.addPage([points.width, points.height]);
      outputPage.drawImage(image, { x: 0, y: 0, width: points.width, height: points.height });

      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      options.onProgress?.(pageNumber, pdf.numPages);
    }
  } finally {
    await destroy();
  }

  return pdfBlob(await output.save());
}

export interface WatermarkOptions {
  text: string;
  opacity: number;
  sizePercent: number;
  pageNumbers: boolean;
}

export async function watermarkPdf(file: File, options: WatermarkOptions): Promise<Blob> {
  const document = await loadPdfLib(file);
  const { StandardFonts, degrees, rgb } = await import('pdf-lib');
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  const text = options.text.trim();

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();

    if (text) {
      const size = Math.max(10, (width * options.sizePercent) / 100);
      const textWidth = font.widthOfTextAtSize(text, size);
      const angle = Math.PI / 6;
      const x = (width - textWidth * Math.cos(angle)) / 2;
      const y = (height - textWidth * Math.sin(angle)) / 2;
      page.drawText(text, {
        x,
        y,
        size,
        font,
        color: rgb(0.45, 0.5, 0.55),
        opacity: options.opacity,
        rotate: degrees(30),
      });
    }

    if (options.pageNumbers) {
      const size = Math.min(14, Math.max(8, height * 0.03));
      const label = `${index + 1} / ${pages.length}`;
      const labelWidth = font.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: (width - labelWidth) / 2,
        y: Math.max(14, height * 0.035),
        size,
        font,
        color: rgb(0.4, 0.45, 0.5),
        opacity: 0.9,
      });
    }
  });

  return pdfBlob(await document.save());
}

export async function extractPdfText(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const { pdf, destroy } = await pdfjsDocument(file);
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = '';
      const lines: string[] = [];

      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line.trim());
          line = '';
        } else {
          line += ' ';
        }
      }
      if (line.trim()) lines.push(line.trim());
      pages.push(lines.join('\n'));
      page.cleanup();
      onProgress?.(pageNumber, pdf.numPages);
    }
  } finally {
    await destroy();
  }

  return pages.map((text, index) => `--- Page ${index + 1} ---\n${text}`).join('\n\n');
}

export async function pdfToLongImage(
  file: File,
  requestedScale: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; width: number; height: number }> {
  const { pdf, destroy } = await pdfjsDocument(file);

  try {
    const dimensions: Array<{ width: number; height: number }> = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: requestedScale });
      dimensions.push({ width: viewport.width, height: viewport.height });
      page.cleanup();
    }

    const width = Math.ceil(Math.max(...dimensions.map((size) => size.width)));
    const rawHeight = dimensions.reduce((sum, size) => sum + size.height, 0);
    const fit = rawHeight > MAX_LONG_IMAGE_HEIGHT ? MAX_LONG_IMAGE_HEIGHT / rawHeight : 1;
    const scale = requestedScale * fit;
    const height = Math.ceil(
      dimensions.reduce((sum, size) => sum + (size.height / requestedScale) * scale, 0),
    );

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * fit));
    canvas.height = Math.max(1, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    let offset = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = Math.max(1, Math.ceil(viewport.width));
      pageCanvas.height = Math.max(1, Math.ceil(viewport.height));
      const pageContext = pageCanvas.getContext('2d');
      if (!pageContext) throw new Error('Canvas is not available in this browser.');
      await page.render({ canvasContext: pageContext, viewport }).promise;
      context.drawImage(pageCanvas, Math.floor((canvas.width - pageCanvas.width) / 2), offset);
      offset += pageCanvas.height;
      pageCanvas.width = 0;
      pageCanvas.height = 0;
      page.cleanup();
      onProgress?.(pageNumber, pdf.numPages);
    }

    const blob = await canvasToBlob(canvas, 'image/png');
    const result = { blob, width: canvas.width, height: canvas.height };
    canvas.width = 0;
    canvas.height = 0;
    return result;
  } finally {
    await destroy();
  }
}

export interface PageThumb {
  page: number;
  url: string;
  width: number;
  height: number;
}

export async function renderPageThumbs(
  file: File,
  maxWidth = 150,
  onProgress?: (done: number, total: number) => void,
): Promise<PageThumb[]> {
  const { pdf, destroy } = await pdfjsDocument(file);
  const thumbs: PageThumb[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxWidth / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is not available in this browser.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      thumbs.push({
        page: pageNumber,
        url: canvas.toDataURL('image/jpeg', 0.72),
        width: canvas.width,
        height: canvas.height,
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      onProgress?.(pageNumber, pdf.numPages);
    }
  } finally {
    await destroy();
  }

  return thumbs;
}
