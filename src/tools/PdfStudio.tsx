import { useEffect, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Archive,
  Check,
  Copy,
  Download,
  Droplets,
  FileText,
  Files,
  FolderDown,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  RotateCw,
  Scissors,
  Trash2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FileDrop } from '../components/FileDrop';
import {
  compressPdf,
  extractPdfText,
  mergePdfs,
  organizePdf,
  pdfPageCount,
  pdfToLongImage,
  renderPageThumbs,
  splitPdf,
  watermarkPdf,
} from '../lib/pdfTools';
import type { PageThumb } from '../lib/pdfTools';
import { baseName } from '../lib/formats';
import type { ToastItem } from '../lib/types';
import { downloadBlob, formatBytes } from '../lib/utils';

interface PdfStudioProps {
  onNotice: (message: string, kind?: ToastItem['kind']) => void;
}

type Mode = 'merge' | 'split' | 'organize' | 'compress' | 'watermark' | 'text' | 'long';

interface ModeInfo {
  id: Mode;
  label: string;
  icon: LucideIcon;
  title: string;
}

const MODES: ModeInfo[] = [
  { id: 'merge', label: 'Merge', icon: Files, title: 'Merge PDFs' },
  { id: 'split', label: 'Split', icon: Scissors, title: 'Split or extract pages' },
  { id: 'organize', label: 'Organize', icon: LayoutGrid, title: 'Reorder, rotate, remove pages' },
  { id: 'compress', label: 'Compress', icon: Archive, title: 'Compress PDF' },
  { id: 'watermark', label: 'Watermark', icon: Droplets, title: 'Watermark & page numbers' },
  { id: 'text', label: 'Text', icon: FileText, title: 'Extract text' },
  { id: 'long', label: 'Long image', icon: ImageIcon, title: 'PDF to one long image' },
];

interface ResultFile {
  filename: string;
  blob: Blob;
  url: string;
  kind: 'pdf' | 'image';
  meta?: string;
}

interface OrderedPage {
  page: number;
  rotate: number;
}

const isPdf = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function PdfStudio({ onNotice }: PdfStudioProps) {
  const [mode, setMode] = useState<Mode>('merge');
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [pageTotal, setPageTotal] = useState(0);
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  const [ordered, setOrdered] = useState<OrderedPage[]>([]);
  const [range, setRange] = useState('1-');
  const [splitMode, setSplitMode] = useState<'one' | 'each'>('one');
  const [compressLevel, setCompressLevel] = useState<'small' | 'balanced' | 'print'>('balanced');
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(16);
  const [watermarkSize, setWatermarkSize] = useState(9);
  const [pageNumbers, setPageNumbers] = useState(true);
  const [longScale, setLongScale] = useState(2);
  const [results, setResults] = useState<ResultFile[]>([]);
  const [textResult, setTextResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resultsRef = useRef<ResultFile[]>([]);
  resultsRef.current = results;

  useEffect(
    () => () => {
      for (const result of resultsRef.current) URL.revokeObjectURL(result.url);
    },
    [],
  );

  const clearResults = () => {
    for (const result of resultsRef.current) URL.revokeObjectURL(result.url);
    setResults([]);
    setTextResult('');
  };

  const resetAll = () => {
    clearResults();
    setMergeFiles([]);
    setFile(null);
    setPageTotal(0);
    setThumbs([]);
    setOrdered([]);
    setError(null);
    setProgress(null);
    setBusy(false);
  };

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    resetAll();
    setMode(next);
    setRange('1-');
  };

  const pickSingle = async (files: FileList | File[]) => {
    const candidate = Array.from(files)[0];
    if (!candidate) return;
    if (!isPdf(candidate)) {
      onNotice('Choose a PDF file. Other documents are not supported here.', 'error');
      return;
    }
    clearResults();
    setError(null);
    setThumbs([]);
    setOrdered([]);
    setPageTotal(0);
    setFile(candidate);
    setBusy(true);
    try {
      const total = await pdfPageCount(candidate);
      setPageTotal(total);
      setRange(`1-${total}`);
      if (mode === 'organize') {
        const rendered = await renderPageThumbs(candidate, 150, (done, count) =>
          setProgress({ done, total: count }),
        );
        setThumbs(rendered);
        setOrdered(rendered.map((thumb) => ({ page: thumb.page, rotate: 0 })));
      }
    } catch (caught) {
      const message = messageOf(caught);
      setError(message);
      onNotice(message, 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const addMergeFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const valid = incoming.filter(isPdf);
    if (valid.length !== incoming.length) {
      onNotice('Only PDF files can be merged.', 'error');
    }
    if (!valid.length) return;
    clearResults();
    setError(null);
    setMergeFiles((current) => [...current, ...valid]);
  };

  const moveMergeFile = (index: number, direction: -1 | 1) => {
    setMergeFiles((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      await work();
    } catch (caught) {
      const message = messageOf(caught);
      setError(message);
      onNotice(message, 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pushResults = (created: Array<{ filename: string; blob: Blob; meta?: string; kind?: 'pdf' | 'image' }>) => {
    for (const result of resultsRef.current) URL.revokeObjectURL(result.url);
    const next = created.map((entry) => ({
      filename: entry.filename,
      blob: entry.blob,
      url: URL.createObjectURL(entry.blob),
      kind: entry.kind ?? 'pdf',
      meta: entry.meta,
    }));
    setResults(next);
  };

  const downloadAll = async () => {
    if (!results.length) return;
    if (results.length === 1) {
      downloadBlob(results[0].blob, results[0].filename);
      return;
    }
    const entries: Record<string, Uint8Array> = {};
    for (const result of results) {
      entries[result.filename] = new Uint8Array(await result.blob.arrayBuffer());
    }
    downloadBlob(new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' }), 'imagzal-pdf.zip');
  };

  const currentMode = MODES.find((entry) => entry.id === mode) ?? MODES[0];
  const singleTitle =
    mode === 'merge'
      ? 'Add PDFs to merge'
      : mode === 'organize'
        ? 'Choose a PDF to organize'
        : 'Choose a PDF';

  return (
    <div className="studio">
      <div className="studio-modes" role="tablist" aria-label="PDF tool">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={`mode-tab${mode === id ? ' is-active' : ''}`}
            onClick={() => changeMode(id)}
            disabled={busy}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <p className="studio-hint">
        <FileText /> {currentMode.title}
      </p>

      {mode === 'merge' ? (
        <>
          <FileDrop
            accept="application/pdf,.pdf"
            title={mergeFiles.length ? 'Add more PDFs' : 'Drop PDFs here'}
            hint="Files merge in the order shown below."
            icon={Files}
            compact={mergeFiles.length > 0}
            count={mergeFiles.length}
            onFiles={addMergeFiles}
            disabled={busy}
          />

          {mergeFiles.length > 0 && (
            <div className="queue">
              <div className="queue-head">
                <span className="queue-title">
                  Files <span className="queue-count">{mergeFiles.length}</span>
                </span>
                <button type="button" className="text-btn" onClick={() => setMergeFiles([])} disabled={busy}>
                  Clear all
                </button>
              </div>
              <ul className="file-list">
                {mergeFiles.map((item, index) => (
                  <li key={`${item.name}-${index}`} className="file-row">
                    <span className="thumb" aria-hidden="true">
                      <FileText />
                    </span>
                    <div className="file-main">
                      <p className="file-name">{item.name}</p>
                      <div className="file-meta">
                        <span>{formatBytes(item.size)}</span>
                        <span>·</span>
                        <span>#{index + 1}</span>
                      </div>
                    </div>
                    <div className="file-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => moveMergeFile(index, -1)}
                        disabled={busy || index === 0}
                        aria-label={`Move ${item.name} up`}
                        title="Move up"
                      >
                        <ArrowUp />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => moveMergeFile(index, 1)}
                        disabled={busy || index === mergeFiles.length - 1}
                        aria-label={`Move ${item.name} down`}
                        title="Move down"
                      >
                        <ArrowDown />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() =>
                          setMergeFiles((current) => current.filter((_, position) => position !== index))
                        }
                        disabled={busy}
                        aria-label={`Remove ${item.name}`}
                        title="Remove"
                      >
                        <X />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy || mergeFiles.length < 2}
              onClick={() =>
                run(async () => {
                  const blob = await mergePdfs(mergeFiles, (done, total) =>
                    setProgress({ done, total }),
                  );
                  pushResults([{ filename: 'merged.pdf', blob }]);
                })
              }
            >
              {busy ? <Loader2 className="spin" /> : <Files />}
              {busy ? 'Merging…' : mergeFiles.length ? `Merge ${mergeFiles.length} PDFs` : 'Merge PDFs'}
            </button>          </div>
        </>
      ) : (
        <>
          <FileDrop
            accept="application/pdf,.pdf"
            title={file ? 'Choose another PDF' : singleTitle}
            hint={mode === 'organize' ? 'Pages load as thumbnails you can rearrange.' : 'Nothing leaves your device.'}
            icon={FileText}
            multiple={false}
            compact={Boolean(file)}
            count={file ? 1 : 0}
            onFiles={pickSingle}
            disabled={busy}
          />

          {file && (
            <div className="selected-file">
              <span className="thumb" aria-hidden="true">
                <FileText />
              </span>
              <span className="selected-file-name">{file.name}</span>
              <span className="selected-file-meta">
                {pageTotal ? `${pageTotal} page${pageTotal === 1 ? '' : 's'} · ` : ''}
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  clearResults();
                  setFile(null);
                  setPageTotal(0);
                  setThumbs([]);
                  setOrdered([]);
                }}
                disabled={busy}
                aria-label="Remove PDF"
              >
                <X />
              </button>
            </div>
          )}

          {mode === 'split' && file && (
            <>
              <div className="studio-grid">
                <label className="field">
                  <span className="control-label">Pages</span>
                  <input
                    className="text-input"
                    value={range}
                    onChange={(event) => setRange(event.target.value)}
                    placeholder="1-3, 5, 8-10"
                    disabled={busy}
                    inputMode="numeric"
                  />
                  <span className="field-note">Comma separated. Use 1-{pageTotal || 'N'} for everything.</span>
                </label>
                <div className="field">
                  <span className="control-label">Output</span>
                  <div className="chips">
                    <button
                      type="button"
                      className={`chip${splitMode === 'one' ? ' is-active' : ''}`}
                      onClick={() => setSplitMode('one')}
                      disabled={busy}
                    >
                      One PDF
                    </button>
                    <button
                      type="button"
                      className={`chip${splitMode === 'each' ? ' is-active' : ''}`}
                      onClick={() => setSplitMode('each')}
                      disabled={busy}
                    >
                      Separate PDFs
                    </button>
                  </div>
                </div>
              </div>
              <div className="studio-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  disabled={busy || !range.trim()}
                  onClick={() =>
                    run(async () => {
                      const created = await splitPdf(file, range, splitMode);
                      pushResults(created);
                    })
                  }
                >
                  {busy ? <Loader2 className="spin" /> : <Scissors />}
                  {busy ? 'Splitting…' : 'Split PDF'}
                </button>
              </div>
            </>
          )}

          {mode === 'organize' && file && (
            <>
              {busy && !thumbs.length ? (
                <p className="studio-status">
                  <Loader2 className="spin" /> Loading page previews
                  {progress ? ` ${progress.done}/${progress.total}` : '…'}
                </p>
              ) : (
                <>
                  <div className="organize-grid">
                    {ordered.map((entry, index) => {
                      const thumb = thumbs.find((item) => item.page === entry.page);
                      return (
                        <div key={entry.page} className="organize-card">
                          <div className="organize-thumb">
                            {thumb ? (
                              <img
                                src={thumb.url}
                                alt={`Page ${entry.page}`}
                                style={{ transform: `rotate(${entry.rotate}deg)` }}
                              />
                            ) : null}
                            <span className="organize-page">{entry.page}</span>
                          </div>
                          <div className="organize-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() =>
                                setOrdered((current) => {
                                  const next = [...current];
                                  if (index === 0) return current;
                                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                  return next;
                                })
                              }
                              disabled={busy || index === 0}
                              aria-label="Move page earlier"
                              title="Move earlier"
                            >
                              <ArrowUp />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() =>
                                setOrdered((current) => {
                                  const next = [...current];
                                  if (index === next.length - 1) return current;
                                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                  return next;
                                })
                              }
                              disabled={busy || index === ordered.length - 1}
                              aria-label="Move page later"
                              title="Move later"
                            >
                              <ArrowDown />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() =>
                                setOrdered((current) =>
                                  current.map((item, position) =>
                                    position === index ? { ...item, rotate: (item.rotate + 90) % 360 } : item,
                                  ),
                                )
                              }
                              disabled={busy}
                              aria-label="Rotate page"
                              title="Rotate 90°"
                            >
                              <RotateCw />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() =>
                                setOrdered((current) => current.filter((_, position) => position !== index))
                              }
                              disabled={busy}
                              aria-label="Remove page"
                              title="Remove page"
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="studio-actions">
                    <span className="studio-status">
                      {ordered.length} of {thumbs.length} pages kept
                    </span>
                    <button
                      type="button"
                      className="btn btn-solid"
                      disabled={busy || ordered.length === 0}
                      onClick={() =>
                        run(async () => {
                          const blob = await organizePdf(
                            file,
                            ordered.map((entry) => ({ index: entry.page - 1, rotate: entry.rotate })),
                          );
                          pushResults([{ filename: `${baseName(file.name)}-organized.pdf`, blob }]);
                        })
                      }
                    >
                      {busy ? <Loader2 className="spin" /> : <Check />}
                      {busy ? 'Saving…' : 'Save PDF'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {mode === 'compress' && file && (
            <>
              <div className="studio-grid">
                <label className="field">
                  <span className="control-label">Quality</span>
                  <select
                    className="select"
                    value={compressLevel}
                    onChange={(event) =>
                      setCompressLevel(event.target.value as 'small' | 'balanced' | 'print')
                    }
                    disabled={busy}
                  >
                    <option value="small">Smallest — 72 dpi</option>
                    <option value="balanced">Balanced — 108 dpi</option>
                    <option value="print">High — 144 dpi</option>
                  </select>
                </label>
                <p className="field-note field-note-wide">
                  Pages are rebuilt as compressed images, so text stops being selectable. Scanned
                  documents shrink the most.
                </p>
              </div>
              <div className="studio-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const settings =
                        compressLevel === 'small'
                          ? { scale: 1, quality: 0.55 }
                          : compressLevel === 'print'
                            ? { scale: 2, quality: 0.82 }
                            : { scale: 1.5, quality: 0.72 };
                      const blob = await compressPdf(file, {
                        ...settings,
                        onProgress: (done, total) => setProgress({ done, total }),
                      });
                      const saved = Math.max(0, Math.round((1 - blob.size / file.size) * 100));
                      pushResults([
                        {
                          filename: `${baseName(file.name)}-compressed.pdf`,
                          blob,
                          meta: `${formatBytes(file.size)} → ${formatBytes(blob.size)} · ${saved}% smaller`,
                        },
                      ]);
                    })
                  }
                >
                  {busy ? <Loader2 className="spin" /> : <Archive />}
                  {busy ? `Compressing${progress ? ` ${progress.done}/${progress.total}` : '…'}` : 'Compress PDF'}
                </button>
              </div>
            </>
          )}

          {mode === 'watermark' && file && (
            <>
              <div className="studio-grid">
                <label className="field">
                  <span className="control-label">Watermark text</span>
                  <input
                    className="text-input"
                    value={watermarkText}
                    onChange={(event) => setWatermarkText(event.target.value)}
                    placeholder="CONFIDENTIAL"
                    disabled={busy}
                    maxLength={80}
                  />
                </label>
                <label className="quality field">
                  <span className="control-label">Opacity</span>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    value={watermarkOpacity}
                    onChange={(event) => setWatermarkOpacity(Number(event.target.value))}
                    disabled={busy}
                    aria-label="Watermark opacity"
                  />
                  <span className="quality-value">{watermarkOpacity}%</span>
                </label>
                <label className="quality field">
                  <span className="control-label">Size</span>
                  <input
                    type="range"
                    min={4}
                    max={18}
                    value={watermarkSize}
                    onChange={(event) => setWatermarkSize(Number(event.target.value))}
                    disabled={busy}
                    aria-label="Watermark size"
                  />
                  <span className="quality-value">{watermarkSize}%</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={pageNumbers}
                    onChange={(event) => setPageNumbers(event.target.checked)}
                    disabled={busy}
                  />
                  Add page numbers
                </label>
              </div>
              <div className="studio-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  disabled={busy || (!watermarkText.trim() && !pageNumbers)}
                  onClick={() =>
                    run(async () => {
                      const blob = await watermarkPdf(file, {
                        text: watermarkText,
                        opacity: watermarkOpacity / 100,
                        sizePercent: watermarkSize,
                        pageNumbers,
                      });
                      pushResults([{ filename: `${baseName(file.name)}-watermarked.pdf`, blob }]);
                    })
                  }
                >
                  {busy ? <Loader2 className="spin" /> : <Droplets />}
                  {busy ? 'Applying…' : 'Apply watermark'}
                </button>
              </div>
            </>
          )}

          {mode === 'text' && file && (
            <>
              <div className="studio-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const text = await extractPdfText(file, (done, total) =>
                        setProgress({ done, total }),
                      );
                      const body = text.replace(/--- Page \d+ ---/g, '').trim();
                      if (!body) {
                        onNotice(
                          'No selectable text found. This PDF is probably scanned images, so it needs OCR.',
                          'info',
                        );
                        return;
                      }
                      setTextResult(text);
                      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                      pushResults([
                        {
                          filename: `${baseName(file.name)}.txt`,
                          blob,
                          kind: 'pdf',
                          meta: `${text.length.toLocaleString()} characters`,
                        },
                      ]);
                    })
                  }
                >
                  {busy ? <Loader2 className="spin" /> : <FileText />}
                  {busy ? `Reading${progress ? ` ${progress.done}/${progress.total}` : '…'}` : 'Extract text'}
                </button>
              </div>
              {textResult && (
                <div className="text-result">
                  <div className="text-result-head">
                    <span className="control-label">Extracted text</span>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => {
                        navigator.clipboard?.writeText(textResult);
                        onNotice('Text copied to the clipboard.', 'success');
                      }}
                    >
                      <Copy /> Copy
                    </button>
                  </div>
                  <textarea className="text-output" readOnly value={textResult} />
                </div>
              )}
            </>
          )}

          {mode === 'long' && file && (
            <>
              <div className="studio-grid">
                <label className="field">
                  <span className="control-label">Resolution</span>
                  <select
                    className="select"
                    value={longScale}
                    onChange={(event) => setLongScale(Number(event.target.value))}
                    disabled={busy}
                  >
                    <option value={1}>Small — 72 dpi</option>
                    <option value={1.5}>Medium — 108 dpi</option>
                    <option value={2}>Large — 144 dpi</option>
                  </select>
                </label>
                <p className="field-note field-note-wide">
                  All pages are stacked into one tall PNG, capped at 16,000 px high.
                </p>
              </div>
              <div className="studio-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const output = await pdfToLongImage(file, longScale, (done, total) =>
                        setProgress({ done, total }),
                      );
                      pushResults([
                        {
                          filename: `${baseName(file.name)}-long.png`,
                          blob: output.blob,
                          kind: 'image',
                          meta: `${output.width} × ${output.height} px`,
                        },
                      ]);
                    })
                  }
                >
                  {busy ? <Loader2 className="spin" /> : <ImageIcon />}
                  {busy ? `Rendering${progress ? ` ${progress.done}/${progress.total}` : '…'}` : 'Make long image'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {busy && progress && mode !== 'text' && (
        <p className="studio-status">
          <Loader2 className="spin" /> Working {progress.done}/{progress.total}
        </p>
      )}

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
                {results.length} file{results.length === 1 ? '' : 's'} ready
              </div>
              <div className="results-sub">
                {results.length === 1 ? results[0].meta ?? 'Ready to download' : 'Download one by one, or all as a ZIP.'}
              </div>
            </div>
            <button type="button" className="btn btn-tonal btn-sm" onClick={downloadAll}>
              {results.length > 1 ? <FolderDown /> : <Download />}
              {results.length > 1 ? 'Download all (.zip)' : 'Download'}
            </button>
          </div>

          <ul className="result-list">
            {results.map((result) => (
              <li key={result.filename} className="result-row">
                {result.kind === 'image' ? (
                  <span className="result-thumb">
                    <img src={result.url} alt="" loading="lazy" />
                  </span>
                ) : (
                  <span className="thumb" aria-hidden="true">
                    <FileText />
                  </span>
                )}
                <div className="file-main">
                  <p className="file-name">{result.filename}</p>
                  <div className="file-meta">
                    <span>{formatBytes(result.blob.size)}</span>
                    {result.meta && (
                      <>
                        <span>·</span>
                        <span>{result.meta}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="file-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => downloadBlob(result.blob, result.filename)}
                    aria-label={`Download ${result.filename}`}
                    title="Download"
                  >
                    <Download />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
