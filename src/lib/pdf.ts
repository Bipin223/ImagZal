import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { jsPDF as JsPdfDocument } from 'jspdf';
import { decodeToCanvas, encodeCanvas } from './convert';
import { baseName, outputExt } from './formats';
import type { OutputFormat } from './formats';

export interface PdfPageImage {
  page: number;
  blob: Blob;
  url: string;
  filename: string;
  width: number;
  height: number;
}

interface RenderPagesOptions {
  format: OutputFormat;
  quality: number;
  onProgress?: (done: number, total: number) => void;
}

export async function renderPdfPages(
  file: File,
  options: RenderPagesOptions,
): Promise<PdfPageImage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const results: PdfPageImage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is not available in this browser.');

      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await encodeCanvas(canvas, {
        format: options.format,
        quality: options.quality,
      });

      results.push({
        page: pageNumber,
        blob,
        url: URL.createObjectURL(blob),
        filename: `${baseName(file.name)}-page-${String(pageNumber).padStart(2, '0')}.${outputExt(options.format)}`,
        width: canvas.width,
        height: canvas.height,
      });

      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      options.onProgress?.(pageNumber, pdf.numPages);
    }
  } finally {
    await loadingTask.destroy();
  }

  return results;
}

export type PdfPageSize = 'a4' | 'letter' | 'fit';

interface ImagesToPdfOptions {
  pageSize: PdfPageSize;
  margin: number;
  onProgress?: (done: number, total: number) => void;
}

const PAGE_SIZES: Record<'a4' | 'letter', [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

function flattenForPdf(source: HTMLCanvasElement): HTMLCanvasElement {
  const max = 2600;
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function imagesToPdf(
  files: File[],
  options: ImagesToPdfOptions,
): Promise<Blob> {
  const prepared: Array<{ dataUrl: string; width: number; height: number }> = [];

  for (let index = 0; index < files.length; index += 1) {
    const source = await decodeToCanvas(files[index]);
    const flattened = flattenForPdf(source);
    prepared.push({
      dataUrl: flattened.toDataURL('image/jpeg', 0.92),
      width: flattened.width,
      height: flattened.height,
    });
    source.width = 0;
    source.height = 0;
    flattened.width = 0;
    flattened.height = 0;
    options.onProgress?.(index + 1, files.length);
  }

  if (!prepared.length) throw new Error('Add at least one image.');

  const { jsPDF } = await import('jspdf');
  let document: JsPdfDocument | null = null;

  for (const image of prepared) {
    let pageWidth: number;
    let pageHeight: number;

    if (options.pageSize === 'fit') {
      const scale = Math.min(1, 842 / Math.max(image.width, image.height));
      pageWidth = image.width * scale + options.margin * 2;
      pageHeight = image.height * scale + options.margin * 2;
    } else {
      [pageWidth, pageHeight] = PAGE_SIZES[options.pageSize];
    }

    if (!document) {
      document = new jsPDF({
        unit: 'pt',
        format: [pageWidth, pageHeight],
        orientation: 'portrait',
        compress: true,
      });
    } else {
      document.addPage([pageWidth, pageHeight], 'portrait');
    }

    const availableWidth = pageWidth - options.margin * 2;
    const availableHeight = pageHeight - options.margin * 2;
    const ratio = Math.min(availableWidth / image.width, availableHeight / image.height);
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;

    document.addImage(
      image.dataUrl,
      'JPEG',
      (pageWidth - drawWidth) / 2,
      (pageHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
      undefined,
      'FAST',
    );
  }

  if (!document) throw new Error('The PDF could not be created.');
  return document.output('blob');
}
