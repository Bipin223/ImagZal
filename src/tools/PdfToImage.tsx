import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileText,
  FolderDown,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { zipSync } from 'fflate';
import { FileDrop } from '../components/FileDrop';
import { FormatChips } from '../components/FormatChips';
import { detectEncoders } from '../lib/convert';
import { OUTPUT_BY_ID } from '../lib/formats';
import type { OutputFormat } from '../lib/formats';
import { renderPdfPages } from '../lib/pdf';
import type { PdfPageImage } from '../lib/pdf';
import type { ToastItem } from '../lib/types';
import { downloadBlob, formatBytes } from '../lib/utils';

interface PdfToImageProps {
  onNotice: (message: string, kind?: ToastItem['kind']) => void;
}

const PDF_FORMATS: OutputFormat[] = ['png', 'jpeg', 'webp'];

export function PdfToImage({ onNotice }: PdfToImageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(90);
  const [available, setAvailable] = useState<OutputFormat[]>(PDF_FORMATS);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<PdfPageImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const resultsRef = useRef<PdfPageImage[]>([]);
  resultsRef.current = results;
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    detectEncoders()
      .then((support) => {
        if (!active) return;
        const supported = PDF_FORMATS.filter((id) => {
          if (id === 'jpeg') return support.jpeg;
          if (id === 'webp') return support.webp;
          return true;
        });
        setAvailable(supported);
        setFormat((current) => (supported.includes(current) ? current : 'png'));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const result of resultsRef.current) {
        URL.revokeObjectURL(result.url);
      }
    };
  }, []);

  const clearResults = () => {
    for (const result of resultsRef.current) {
      URL.revokeObjectURL(result.url);
    }
    setResults([]);
  };

  const selectFile = (files: FileList | File[]) => {
    const candidate = Array.from(files)[0];
    if (!candidate) return;
    const isPdf =
      candidate.type === 'application/pdf' || candidate.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      onNotice('Choose a PDF file. Other documents are not supported here.', 'error');
      return;
    }
    clearResults();
    setFile(candidate);
    setError(null);
    setProgress(null);
  };

  const reset = () => {
    clearResults();
    setFile(null);
    setError(null);
    setProgress(null);
  };

  const convert = async () => {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    clearResults();
    setProgress({ done: 0, total: 1 });

    try {
      const pages = await renderPdfPages(file, {
        format,
        quality: quality / 100,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResults(pages);
      if (!pages.length) {
        setError('No pages were found in this PDF.');
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message.toLowerCase() : '';
      const friendly = message.includes('password')
        ? 'This PDF is password protected. Remove the password and try again.'
        : 'This PDF could not be read. It may be damaged or encrypted.';
      setError(friendly);
      onNotice(friendly, 'error');
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  };

  const downloadAll = async () => {
    if (!results.length) return;
    if (results.length === 1) {
      downloadBlob(results[0].blob, results[0].filename);
      return;
    }

    setZipping(true);
    try {
      const files: Record<string, Uint8Array> = {};
      for (const result of results) {
        files[result.filename] = new Uint8Array(await result.blob.arrayBuffer());
      }
      const zip = zipSync(files, { level: 0 });
      downloadBlob(
        new Blob([new Uint8Array(zip)], { type: 'application/zip' }),
        'pdf-pages.zip',
      );
    } catch {
      onNotice('The ZIP could not be created.', 'error');
    } finally {
      setZipping(false);
    }
  };

  const output = OUTPUT_BY_ID[format];

  return (
    <div>
      <FileDrop
        accept="application/pdf,.pdf"
        multiple={false}
        title={file ? 'Choose another PDF' : 'Drop a PDF here'}
        hint="Each page becomes a separate image."
        icon={file ? Upload : FileText}
        compact={Boolean(file)}
        count={file ? 1 : 0}
        onFiles={selectFile}
        disabled={busy}
      />

      {file && (
        <>
          <div className="selected-file">
            <span className="thumb" aria-hidden="true">
              <FileText />
            </span>
            <span className="selected-file-name">{file.name}</span>
            <span className="selected-file-meta">{formatBytes(file.size)}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={reset}
              disabled={busy}
              aria-label="Remove PDF"
              title="Remove"
            >
              <X />
            </button>
          </div>

          <div className="controls">
            <div>
              <span className="control-label">Save pages as</span>
              <FormatChips
                value={format}
                onChange={setFormat}
                available={available}
                formats={PDF_FORMATS}
                disabled={busy}
              />
            </div>

            {output.lossy ? (
              <label className="quality">
                Quality
                <input
                  type="range"
                  min={40}
                  max={100}
                  step={1}
                  value={quality}
                  disabled={busy}
                  aria-label="Image quality"
                  onChange={(event) => setQuality(Number(event.target.value))}
                />
                <span className="quality-value">{quality}%</span>
              </label>
            ) : (
              <span className="controls-note">
                <Check size={13} /> Lossless output
              </span>
            )}

            <div className="controls-action">
              <button
                type="button"
                className="btn btn-solid"
                onClick={convert}
                disabled={busy}
              >
                {busy ? <Loader2 className="spin" /> : null}
                {busy && progress
                  ? progress.total > 1
                    ? `Rendering ${progress.done}/${progress.total}`
                    : 'Rendering'
                  : 'Convert pages'}
              </button>
            </div>
          </div>

          {error && (
            <p className="notice">
              <AlertCircle /> {error}
            </p>
          )}

          {results.length > 0 && (
            <div className="results">
              <div className="results-head">
                <div>
                  <div className="results-title">
                    {results.length} page{results.length === 1 ? '' : 's'} ready
                  </div>
                  <div className="results-sub">Saved as {output.label}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-tonal btn-sm"
                  onClick={downloadAll}
                  disabled={zipping}
                >
                  {zipping ? <Loader2 className="spin" /> : <FolderDown />}
                  {results.length > 1 ? 'Download all (.zip)' : 'Download'}
                </button>
              </div>

              <div className="page-grid">
                {results.map((result) => (
                  <div key={result.page} className="page-card">
                    <div className="page-thumb">
                      <img src={result.url} alt={`Page ${result.page}`} loading="lazy" />
                    </div>
                    <div className="page-info">
                      <span className="page-name">Page {result.page}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => downloadBlob(result.blob, result.filename)}
                        aria-label={`Download page ${result.page}`}
                        title="Download page"
                      >
                        <Download />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
