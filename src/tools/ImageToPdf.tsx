import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Download,
  FileImage,
  FileText,
  ImageIcon,
  Images,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { FileDrop } from '../components/FileDrop';
import { baseName, inputLabel, isSupportedImage } from '../lib/formats';
import { imagesToPdf } from '../lib/pdf';
import type { PdfPageSize } from '../lib/pdf';
import type { ToastItem } from '../lib/types';
import { downloadBlob, formatBytes, uid } from '../lib/utils';

interface ImageToPdfProps {
  onNotice: (message: string, kind?: ToastItem['kind']) => void;
}

interface Photo {
  id: string;
  file: File;
  previewUrl: string;
}

interface PdfResult {
  blob: Blob;
  url: string;
  filename: string;
}

function PhotoThumb({ photo }: { photo: Photo }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span className="thumb" aria-hidden="true">
        <FileImage />
      </span>
    );
  }

  return (
    <span className="thumb">
      <img src={photo.previewUrl} alt="" loading="lazy" onError={() => setBroken(true)} />
    </span>
  );
}

export function ImageToPdf({ onNotice }: ImageToPdfProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pageSize, setPageSize] = useState<PdfPageSize>('a4');
  const [margin, setMargin] = useState(24);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photosRef = useRef<Photo[]>(photos);
  photosRef.current = photos;
  const resultRef = useRef<PdfResult | null>(result);
  resultRef.current = result;
  const busyRef = useRef(false);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) {
        URL.revokeObjectURL(photo.previewUrl);
      }
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    };
  }, []);

  const clearResult = () => {
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.url);
      setResult(null);
    }
  };

  const addPhotos = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (!incoming.length) return;
    const supported = incoming.filter(isSupportedImage);
    const skipped = incoming.length - supported.length;
    if (skipped > 0) {
      onNotice(
        `${skipped} file${skipped === 1 ? ' was' : 's were'} skipped. Only images can go into a PDF.`,
        'error',
      );
    }
    if (!supported.length) return;

    clearResult();
    setError(null);
    setPhotos((previous) => [
      ...previous,
      ...supported.map((file) => ({
        id: uid(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  };

  const removePhoto = (id: string) => {
    const photo = photosRef.current.find((entry) => entry.id === id);
    if (!photo) return;
    URL.revokeObjectURL(photo.previewUrl);
    clearResult();
    setError(null);
    setPhotos((previous) => previous.filter((entry) => entry.id !== id));
  };

  const clearAll = () => {
    if (busyRef.current) return;
    for (const photo of photosRef.current) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    clearResult();
    setError(null);
    setPhotos([]);
  };

  const makePdf = async () => {
    if (busyRef.current || !photos.length) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: photos.length });
    clearResult();

    try {
      const blob = await imagesToPdf(
        photos.map((photo) => photo.file),
        {
          pageSize,
          margin,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      );
      const filename =
        photos.length === 1 ? `${baseName(photos[0].file.name)}.pdf` : 'photos.pdf';
      const url = URL.createObjectURL(blob);
      setResult({ blob, url, filename });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'The PDF could not be created.';
      setError(message);
      onNotice(message, 'error');
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  };

  const totalBytes = photos.reduce((sum, photo) => sum + photo.file.size, 0);

  return (
    <div>
      <FileDrop
        accept="image/*,.heic,.heif,.tif,.tiff,.jfif,.svg,.ico,.avif,.bmp"
        title={photos.length ? 'Add more photos' : 'Drop your photos here'}
        hint="PNG, JPG, WEBP, HEIC, TIFF, SVG, GIF, BMP, ICO"
        icon={photos.length ? Images : ImageIcon}
        compact={photos.length > 0}
        count={photos.length}
        onFiles={addPhotos}
        disabled={busy}
      />

      {photos.length > 0 && (
        <>
          <div className="controls">
            <div>
              <label className="control-label" htmlFor="pdf-page-size">
                Page size
              </label>
              <select
                id="pdf-page-size"
                className="select"
                value={pageSize}
                disabled={busy}
                onChange={(event) => setPageSize(event.target.value as PdfPageSize)}
              >
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
                <option value="fit">Fit to image</option>
              </select>
            </div>

            <div>
              <label className="control-label" htmlFor="pdf-margin">
                Margin
              </label>
              <select
                id="pdf-margin"
                className="select"
                value={margin}
                disabled={busy}
                onChange={(event) => setMargin(Number(event.target.value))}
              >
                <option value={0}>None</option>
                <option value={18}>Small</option>
                <option value={36}>Medium</option>
              </select>
            </div>

            <div className="controls-action">
              <button
                type="button"
                className="btn btn-solid"
                onClick={makePdf}
                disabled={busy}
              >
                {busy ? <Loader2 className="spin" /> : <FileText />}
                {busy && progress
                  ? `Preparing ${progress.done}/${progress.total}`
                  : 'Make PDF'}
              </button>
            </div>
          </div>

          {error && (
            <p className="notice">
              <AlertCircle /> {error}
            </p>
          )}

          {result && (
            <div className="pdf-result">
              <span className="pdf-result-icon" aria-hidden="true">
                <FileText />
              </span>
              <span className="pdf-result-copy">
                <span className="pdf-result-name">{result.filename}</span>
                <span className="pdf-result-meta">
                  {photos.length} {photos.length === 1 ? 'page' : 'pages'} ·{' '}
                  {formatBytes(result.blob.size)}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-tonal btn-sm"
                onClick={() => downloadBlob(result.blob, result.filename)}
              >
                <Download /> Download
              </button>
            </div>
          )}

          <div className="queue">
            <div className="queue-head">
              <span className="queue-title">
                Photos <span className="queue-count">{photos.length}</span>
              </span>
              <button
                type="button"
                className="text-btn"
                onClick={clearAll}
                disabled={busy}
              >
                Clear all
              </button>
            </div>

            <ul className="file-list">
              {photos.map((photo, index) => (
                <li key={photo.id} className="file-row">
                  <PhotoThumb photo={photo} />
                  <div className="file-main">
                    <p className="file-name">{photo.file.name}</p>
                    <div className="file-meta">
                      <span>Image {index + 1}</span>
                      <ArrowRight />
                      <span>Page {index + 1}</span>
                      <span>·</span>
                      <span>{inputLabel(photo.file.name, photo.file.type)}</span>
                      <span>·</span>
                      <span>{formatBytes(photo.file.size)}</span>
                    </div>
                  </div>
                  <div className="file-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removePhoto(photo.id)}
                      disabled={busy}
                      aria-label={`Remove ${photo.file.name}`}
                      title="Remove"
                    >
                      <X />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="queue-foot">
              <span className="queue-stats">
                {photos.length} {photos.length === 1 ? 'photo' : 'photos'} ·{' '}
                {formatBytes(totalBytes)}
              </span>
              <div className="queue-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={clearAll}
                  disabled={busy}
                >
                  <Trash2 /> Clear
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {photos.length === 0 && (
        <p className="hero-side-note">
          Pages are created in the order you add the photos.
        </p>
      )}
    </div>
  );
}
