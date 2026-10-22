import { useEffect, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import {
  AlertCircle,
  Contact,
  Download,
  Droplets,
  Eraser,
  FolderDown,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Minimize2,
  Scaling,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FileDrop } from '../components/FileDrop';
import {
  compressToTarget,
  inspectImage,
  makeCollage,
  makeFaviconPack,
  makePassportSheet,
  resizeImage,
  stripMetadata,
  watermarkImage,
} from '../lib/imageTools';
import type {
  ImageFormat,
  ImageInfo,
  PassportPreset,
  SheetSize,
  WatermarkPosition,
} from '../lib/imageTools';
import { formatExt } from '../lib/imageTools';
import { baseName } from '../lib/formats';
import type { ToastItem } from '../lib/types';
import { downloadBlob, formatBytes } from '../lib/utils';

interface ImageStudioProps {
  onNotice: (message: string, kind?: ToastItem['kind']) => void;
}

type Mode = 'compress' | 'resize' | 'watermark' | 'metadata' | 'favicon' | 'passport' | 'collage';

interface ModeInfo {
  id: Mode;
  label: string;
  icon: LucideIcon;
  title: string;
}

const MODES: ModeInfo[] = [
  { id: 'compress', label: 'Compress', icon: Minimize2, title: 'Compress to a target size' },
  { id: 'resize', label: 'Resize', icon: Scaling, title: 'Resize or crop images' },
  { id: 'watermark', label: 'Watermark', icon: Droplets, title: 'Watermark images' },
  { id: 'metadata', label: 'Privacy', icon: ShieldCheck, title: 'Inspect & strip metadata' },
  { id: 'favicon', label: 'Favicons', icon: Globe, title: 'Generate a favicon pack' },
  { id: 'passport', label: 'Passport', icon: Contact, title: 'Passport photo sheet' },
  { id: 'collage', label: 'Collage', icon: LayoutGrid, title: 'Make a photo collage' },
];

const MULTI_MODES: Mode[] = ['compress', 'resize', 'watermark', 'collage'];

interface ResultFile {
  filename: string;
  blob: Blob;
  url: string;
  kind: 'image' | 'zip';
  meta?: string;
}

const isImage = (file: File) => file.type.startsWith('image/');

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function ImageStudio({ onNotice }: ImageStudioProps) {
  const [mode, setMode] = useState<Mode>('compress');
  const [files, setFiles] = useState<File[]>([]);
  const [info, setInfo] = useState<ImageInfo | null>(null);
  const [results, setResults] = useState<ResultFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // compress
  const [targetKb, setTargetKb] = useState(200);
  const [compressFormat, setCompressFormat] = useState<'jpeg' | 'webp'>('jpeg');

  // resize
  const [resizeWidth, setResizeWidth] = useState('');
  const [resizeHeight, setResizeHeight] = useState('');
  const [resizeMode, setResizeMode] = useState<'fit' | 'crop'>('fit');
  const [resizeFormat, setResizeFormat] = useState<ImageFormat>('jpeg');
  const [quality, setQuality] = useState(90);

  // watermark
  const [markText, setMarkText] = useState('© Bipin Rizal');
  const [markPosition, setMarkPosition] = useState<WatermarkPosition>('bottom-right');
  const [markOpacity, setMarkOpacity] = useState(65);
  const [markSize, setMarkSize] = useState(5);
  const [markColor, setMarkColor] = useState<'light' | 'dark'>('light');
  const [markFormat, setMarkFormat] = useState<ImageFormat>('jpeg');

  // metadata
  const [cleanFormat, setCleanFormat] = useState<ImageFormat>('jpeg');

  // passport
  const [passportPreset, setPassportPreset] = useState<PassportPreset>('np');
  const [sheetSize, setSheetSize] = useState<SheetSize>('4x6');

  // collage
  const [collageColumns, setCollageColumns] = useState(3);
  const [collageGap, setCollageGap] = useState(14);
  const [collageWidth, setCollageWidth] = useState(1600);
  const [collageFormat, setCollageFormat] = useState<ImageFormat>('jpeg');

  const resultsRef = useRef<ResultFile[]>([]);
  resultsRef.current = results;
  const previewsRef = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const result of resultsRef.current) URL.revokeObjectURL(result.url);
      for (const url of previewsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  // keep lightweight previews for the selected files
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file));
    setPreviews(next);
    previewsRef.current = next;
    return () => {
      for (const url of next) URL.revokeObjectURL(url);
    };
  }, [files]);

  const clearResults = () => {
    for (const result of resultsRef.current) URL.revokeObjectURL(result.url);
    setResults([]);
    setInfo(null);
  };

  const resetAll = () => {
    clearResults();
    setFiles([]);
    setError(null);
    setProgress(null);
    setBusy(false);
  };

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    resetAll();
    setMode(next);
  };

  const addFiles = async (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const valid = list.filter(isImage);
    if (valid.length !== list.length) {
      onNotice('Choose image files only for this tool.', 'error');
    }
    if (!valid.length) return;
    clearResults();
    setError(null);

    if (MULTI_MODES.includes(mode)) {
      setFiles((current) => [...current, ...valid]);
      return;
    }

    setFiles([valid[0]]);
    if (mode === 'metadata') {
      setBusy(true);
      try {
        const details = await inspectImage(valid[0]);
        setInfo(details);
        setCleanFormat(
          details.type.includes('png') ? 'png' : details.type.includes('webp') ? 'webp' : 'jpeg',
        );
      } catch (caught) {
        const message = messageOf(caught);
        setError(message);
        onNotice(message, 'error');
      } finally {
        setBusy(false);
      }
    }
  };

  const run = async (work: (report: (done: number, total: number) => void) => Promise<void>) => {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      await work((done, total) => setProgress({ done, total }));
    } catch (caught) {
      const message = messageOf(caught);
      setError(message);
      onNotice(message, 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pushResults = (created: Array<{ filename: string; blob: Blob; meta?: string; kind?: 'image' | 'zip' }>) => {
    for (const result of resultsRef.current) URL.revokeObjectURL(result.url);
    setResults(
      created.map((entry) => ({
        filename: entry.filename,
        blob: entry.blob,
        url: URL.createObjectURL(entry.blob),
        kind: entry.kind ?? 'image',
        meta: entry.meta,
      })),
    );
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
    downloadBlob(new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' }), 'imagzal-images.zip');
  };

  const removeFile = (index: number) => {
    clearResults();
    setFiles((current) => current.filter((_, position) => position !== index));
  };

  const currentMode = MODES.find((entry) => entry.id === mode) ?? MODES[0];
  const multi = MULTI_MODES.includes(mode);

  return (
    <div className="studio">
      <div className="studio-modes" role="tablist" aria-label="Image tool">
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
        <ImageIcon /> {currentMode.title}
      </p>

      <FileDrop
        accept="image/*,.heic,.heif,.tif,.tiff,.jfif,.svg,.ico,.avif,.bmp"
        title={files.length ? (multi ? 'Add more images' : 'Choose another image') : 'Drop images here'}
        hint={
          mode === 'passport'
            ? 'Use a clear, front-facing photo with some space around the head.'
            : mode === 'favicon'
              ? 'Square images work best. Transparent PNG is ideal.'
              : 'Nothing leaves your device.'
        }
        icon={ImageIcon}
        multiple={multi}
        compact={files.length > 0}
        count={files.length}
        onFiles={addFiles}
        disabled={busy}
      />

      {files.length > 0 && (
        <div className="queue">
          <div className="queue-head">
            <span className="queue-title">
              Images <span className="queue-count">{files.length}</span>
            </span>
            <button type="button" className="text-btn" onClick={() => setFiles([])} disabled={busy}>
              Clear all
            </button>
          </div>
          <ul className="file-list">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="file-row">
                <span className="thumb">
                  {previews[index] ? <img src={previews[index]} alt="" loading="lazy" /> : <ImageIcon />}
                </span>
                <div className="file-main">
                  <p className="file-name">{file.name}</p>
                  <div className="file-meta">
                    <span>{file.type || 'image'}</span>
                    <span>·</span>
                    <span>{formatBytes(file.size)}</span>
                  </div>
                </div>
                <div className="file-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeFile(index)}
                    disabled={busy}
                    aria-label={`Remove ${file.name}`}
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

      {mode === 'compress' && files.length > 0 && (
        <>
          <div className="studio-grid">
            <label className="field">
              <span className="control-label">Target size</span>
              <span className="input-row">
                <input
                  className="text-input"
                  type="number"
                  min={20}
                  max={20000}
                  value={targetKb}
                  onChange={(event) => setTargetKb(Math.max(20, Number(event.target.value) || 20))}
                  disabled={busy}
                />
                <span className="input-suffix">KB</span>
              </span>
            </label>
            <div className="field">
              <span className="control-label">Format</span>
              <div className="chips">
                <button
                  type="button"
                  className={`chip${compressFormat === 'jpeg' ? ' is-active' : ''}`}
                  onClick={() => setCompressFormat('jpeg')}
                  disabled={busy}
                >
                  JPG
                </button>
                <button
                  type="button"
                  className={`chip${compressFormat === 'webp' ? ' is-active' : ''}`}
                  onClick={() => setCompressFormat('webp')}
                  disabled={busy}
                >
                  WEBP
                </button>
              </div>
            </div>
            <p className="field-note field-note-wide">
              The encoder lowers quality and, if needed, resolution until the file fits.
            </p>
          </div>
          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy}
              onClick={() =>
                run(async (report) => {
                  const created: Array<{ filename: string; blob: Blob; meta: string }> = [];
                  for (let index = 0; index < files.length; index += 1) {
                    const output = await compressToTarget(files[index], targetKb * 1024, compressFormat);
                    created.push({
                      filename: `${baseName(files[index].name)}-${targetKb}kb.${formatExt(compressFormat)}`,
                      blob: output.blob,
                      meta: `${output.width} × ${output.height} px · quality ${Math.round(output.quality * 100)}%${
                        output.hit ? '' : ' · closest possible'
                      }`,
                    });
                    report(index + 1, files.length);
                  }
                  pushResults(created);
                  if (created.some((entry) => entry.meta.includes('closest'))) {
                    onNotice('One or more images could not reach the target size. The smallest version was kept.', 'info');
                  }
                })
              }
            >
              {busy ? <Loader2 className="spin" /> : <Minimize2 />}
              {busy ? 'Compressing…' : 'Compress images'}
            </button>
          </div>
        </>
      )}

      {mode === 'resize' && files.length > 0 && (
        <>
          <div className="studio-grid">
            <label className="field">
              <span className="control-label">Width (px)</span>
              <input
                className="text-input"
                type="number"
                min={1}
                placeholder="Auto"
                value={resizeWidth}
                onChange={(event) => setResizeWidth(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span className="control-label">Height (px)</span>
              <input
                className="text-input"
                type="number"
                min={1}
                placeholder="Auto"
                value={resizeHeight}
                onChange={(event) => setResizeHeight(event.target.value)}
                disabled={busy}
              />
            </label>
            <div className="field">
              <span className="control-label">Fit</span>
              <div className="chips">
                <button
                  type="button"
                  className={`chip${resizeMode === 'fit' ? ' is-active' : ''}`}
                  onClick={() => setResizeMode('fit')}
                  disabled={busy}
                >
                  Fit inside
                </button>
                <button
                  type="button"
                  className={`chip${resizeMode === 'crop' ? ' is-active' : ''}`}
                  onClick={() => setResizeMode('crop')}
                  disabled={busy}
                >
                  Crop to fill
                </button>
              </div>
            </div>
            <label className="field">
              <span className="control-label">Format</span>
              <select
                className="select"
                value={resizeFormat}
                onChange={(event) => setResizeFormat(event.target.value as ImageFormat)}
                disabled={busy}
              >
                <option value="jpeg">JPG</option>
                <option value="webp">WEBP</option>
                <option value="png">PNG</option>
              </select>
            </label>
            {resizeFormat !== 'png' && (
              <label className="quality field">
                <span className="control-label">Quality</span>
                <input
                  type="range"
                  min={40}
                  max={100}
                  value={quality}
                  onChange={(event) => setQuality(Number(event.target.value))}
                  disabled={busy}
                  aria-label="Resize quality"
                />
                <span className="quality-value">{quality}%</span>
              </label>
            )}
            <p className="field-note field-note-wide">
              Leave one dimension empty to keep the aspect ratio.
            </p>
          </div>
          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy || (!resizeWidth && !resizeHeight)}
              onClick={() =>
                run(async (report) => {
                  const created: Array<{ filename: string; blob: Blob; meta: string }> = [];
                  for (let index = 0; index < files.length; index += 1) {
                    const output = await resizeImage(files[index], {
                      width: Number(resizeWidth) || undefined,
                      height: Number(resizeHeight) || undefined,
                      mode: resizeMode,
                      format: resizeFormat,
                      quality: quality / 100,
                    });
                    created.push({
                      filename: `${baseName(files[index].name)}-${output.width}x${output.height}.${formatExt(resizeFormat)}`,
                      blob: output.blob,
                      meta: `${output.width} × ${output.height} px`,
                    });
                    report(index + 1, files.length);
                  }
                  pushResults(created);
                })
              }
            >
              {busy ? <Loader2 className="spin" /> : <Scaling />}
              {busy ? 'Resizing…' : 'Resize images'}
            </button>
          </div>
        </>
      )}

      {mode === 'watermark' && files.length > 0 && (
        <>
          <div className="studio-grid">
            <label className="field">
              <span className="control-label">Text</span>
              <input
                className="text-input"
                value={markText}
                onChange={(event) => setMarkText(event.target.value)}
                placeholder="© your name"
                maxLength={80}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span className="control-label">Position</span>
              <select
                className="select"
                value={markPosition}
                onChange={(event) => setMarkPosition(event.target.value as WatermarkPosition)}
                disabled={busy}
              >
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
                <option value="center">Center</option>
                <option value="tile">Tiled</option>
              </select>
            </label>
            <label className="quality field">
              <span className="control-label">Opacity</span>
              <input
                type="range"
                min={10}
                max={90}
                value={markOpacity}
                onChange={(event) => setMarkOpacity(Number(event.target.value))}
                disabled={busy}
                aria-label="Watermark opacity"
              />
              <span className="quality-value">{markOpacity}%</span>
            </label>
            <label className="quality field">
              <span className="control-label">Size</span>
              <input
                type="range"
                min={2}
                max={20}
                value={markSize}
                onChange={(event) => setMarkSize(Number(event.target.value))}
                disabled={busy}
                aria-label="Watermark size"
              />
              <span className="quality-value">{markSize}%</span>
            </label>
            <div className="field">
              <span className="control-label">Color</span>
              <div className="chips">
                <button
                  type="button"
                  className={`chip${markColor === 'light' ? ' is-active' : ''}`}
                  onClick={() => setMarkColor('light')}
                  disabled={busy}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={`chip${markColor === 'dark' ? ' is-active' : ''}`}
                  onClick={() => setMarkColor('dark')}
                  disabled={busy}
                >
                  Dark
                </button>
              </div>
            </div>
            <label className="field">
              <span className="control-label">Format</span>
              <select
                className="select"
                value={markFormat}
                onChange={(event) => setMarkFormat(event.target.value as ImageFormat)}
                disabled={busy}
              >
                <option value="jpeg">JPG</option>
                <option value="webp">WEBP</option>
                <option value="png">PNG</option>
              </select>
            </label>
          </div>
          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy || !markText.trim()}
              onClick={() =>
                run(async (report) => {
                  const created: Array<{ filename: string; blob: Blob; meta: string }> = [];
                  for (let index = 0; index < files.length; index += 1) {
                    const output = await watermarkImage(files[index], {
                      text: markText,
                      position: markPosition,
                      opacity: markOpacity / 100,
                      sizePercent: markSize,
                      color: markColor,
                      format: markFormat,
                      quality: quality / 100,
                    });
                    created.push({
                      filename: `${baseName(files[index].name)}-watermarked.${formatExt(markFormat)}`,
                      blob: output.blob,
                      meta: `${output.width} × ${output.height} px`,
                    });
                    report(index + 1, files.length);
                  }
                  pushResults(created);
                })
              }
            >
              {busy ? <Loader2 className="spin" /> : <Droplets />}
              {busy ? 'Adding watermark…' : 'Watermark images'}
            </button>
          </div>
        </>
      )}

      {mode === 'metadata' && files.length > 0 && (
        <>
          {info && (
            <div className="info-card">
              <div className="info-grid">
                <span>
                  <span className="control-label">Dimensions</span>
                  {info.width} × {info.height} px
                </span>
                <span>
                  <span className="control-label">Size</span>
                  {formatBytes(info.bytes)}
                </span>
                <span>
                  <span className="control-label">Type</span>
                  {info.type}
                </span>
                <span>
                  <span className="control-label">Metadata</span>
                  {info.hasExif ? (
                    <span className="pill pill-warn">EXIF found</span>
                  ) : (
                    <span className="pill">No EXIF detected</span>
                  )}
                </span>
              </div>
              <p className="field-note">
                Re-encoding the image removes EXIF, GPS coordinates, camera details and other
                embedded metadata. The pixels stay the same.
              </p>
            </div>
          )}
          <div className="studio-grid">
            <label className="field">
              <span className="control-label">Clean copy as</span>
              <select
                className="select"
                value={cleanFormat}
                onChange={(event) => setCleanFormat(event.target.value as ImageFormat)}
                disabled={busy}
              >
                <option value="jpeg">JPG</option>
                <option value="webp">WEBP</option>
                <option value="png">PNG</option>
              </select>
            </label>
          </div>
          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const output = await stripMetadata(files[0], cleanFormat, quality / 100);
                  pushResults([
                    {
                      filename: `${baseName(files[0].name)}-clean.${formatExt(cleanFormat)}`,
                      blob: output.blob,
                      meta: `${output.width} × ${output.height} px · metadata removed`,
                    },
                  ]);
                  onNotice('Metadata stripped from the copy.', 'success');
                })
              }
            >
              {busy ? <Loader2 className="spin" /> : <Eraser />}
              {busy ? 'Cleaning…' : 'Strip metadata'}
            </button>
          </div>
        </>
      )}

      {mode === 'favicon' && files.length > 0 && (
        <>
          <div className="studio-grid">
            <p className="field-note field-note-wide">
              Creates 16, 32, 48, 64, 180, 192 and 512 px PNG icons, a multi-size
              <code>favicon.ico</code> and a <code>site.webmanifest</code> — all in one ZIP.
            </p>
          </div>
          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const pack = await makeFaviconPack(files[0]);
                  pushResults([
                    {
                      filename: `${baseName(files[0].name)}-favicons.zip`,
                      blob: pack.zip,
                      kind: 'zip',
                      meta: `${pack.files.length} files · ${formatBytes(pack.zip.size)}`,
                    },
                  ]);
                })
              }
            >
              {busy ? <Loader2 className="spin" /> : <Globe />}
              {busy ? 'Generating…' : 'Generate favicon pack'}
            </button>
          </div>
        </>
      )}

      {mode === 'passport' && files.length > 0 && (
        <>
          <div className="studio-grid">
            <label className="field">
              <span className="control-label">Photo size</span>
              <select
                className="select"
                value={passportPreset}
                onChange={(event) => setPassportPreset(event.target.value as PassportPreset)}
                disabled={busy}
              >
                <option value="np">Nepal — 35 × 45 mm</option>
                <option value="us">US — 2 × 2 in</option>
              </select>
            </label>
            <label className="field">
              <span className="control-label">Sheet</span>
              <select
                className="select"
                value={sheetSize}
                onChange={(event) => setSheetSize(event.target.value as SheetSize)}
                disabled={busy}
              >
                <option value="4x6">4 × 6 in photo print</option>
                <option value="a4">A4</option>
              </select>
            </label>
            <p className="field-note field-note-wide">
              Photo is cropped to the official ratio and tiled on a 300 dpi sheet with cut guides.
            </p>
          </div>
          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const output = await makePassportSheet(files[0], passportPreset, sheetSize);
                  pushResults([
                    {
                      filename: `${baseName(files[0].name)}-passport-sheet.jpg`,
                      blob: output.blob,
                      meta: `${output.count} photos · ${output.width} × ${output.height} px`,
                    },
                  ]);
                })
              }
            >
              {busy ? <Loader2 className="spin" /> : <Contact />}
              {busy ? 'Building sheet…' : 'Make passport sheet'}
            </button>
          </div>
        </>
      )}

      {mode === 'collage' && files.length > 0 && (
        <>
          <div className="studio-grid">
            <label className="field">
              <span className="control-label">Columns</span>
              <select
                className="select"
                value={collageColumns}
                onChange={(event) => setCollageColumns(Number(event.target.value))}
                disabled={busy}
              >
                <option value={2}>2 columns</option>
                <option value={3}>3 columns</option>
                <option value={4}>4 columns</option>
              </select>
            </label>
            <label className="field">
              <span className="control-label">Width</span>
              <select
                className="select"
                value={collageWidth}
                onChange={(event) => setCollageWidth(Number(event.target.value))}
                disabled={busy}
              >
                <option value={1200}>1200 px</option>
                <option value={1600}>1600 px</option>
                <option value={2000}>2000 px</option>
              </select>
            </label>
            <label className="quality field">
              <span className="control-label">Gap</span>
              <input
                type="range"
                min={0}
                max={40}
                value={collageGap}
                onChange={(event) => setCollageGap(Number(event.target.value))}
                disabled={busy}
                aria-label="Collage gap"
              />
              <span className="quality-value">{collageGap}px</span>
            </label>
            <label className="field">
              <span className="control-label">Format</span>
              <select
                className="select"
                value={collageFormat}
                onChange={(event) => setCollageFormat(event.target.value as ImageFormat)}
                disabled={busy}
              >
                <option value="jpeg">JPG</option>
                <option value="webp">WEBP</option>
                <option value="png">PNG</option>
              </select>
            </label>
          </div>
          <div className="studio-actions">
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy || files.length < 2}
              onClick={() =>
                run(async () => {
                  const output = await makeCollage(files, {
                    columns: collageColumns,
                    gap: collageGap,
                    width: collageWidth,
                    format: collageFormat,
                    quality: quality / 100,
                    background: '#ffffff',
                  });
                  pushResults([
                    {
                      filename: `imagzal-collage-${files.length}.${formatExt(collageFormat)}`,
                      blob: output.blob,
                      meta: `${output.width} × ${output.height} px · ${files.length} photos`,
                    },
                  ]);
                })
              }
            >
              {busy ? <Loader2 className="spin" /> : <LayoutGrid />}
              {busy ? 'Building collage…' : 'Make collage'}
            </button>
            {files.length < 2 && <span className="studio-status">Add at least 2 images.</span>}
          </div>
        </>
      )}

      {busy && progress && (
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
                    <FolderDown />
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
