import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Download,
  FileImage,
  FolderDown,
  Image as ImageIcon,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { zipSync } from 'fflate';
import { FileDrop } from '../components/FileDrop';
import { FormatChips } from '../components/FormatChips';
import { convertFile, detectEncoders } from '../lib/convert';
import {
  OUTPUT_BY_ID,
  OUTPUT_FORMATS,
  baseName,
  inputLabel,
  isSupportedImage,
  outputExt,
} from '../lib/formats';
import type { OutputFormat } from '../lib/formats';
import type { QueueItem, ToastItem } from '../lib/types';
import { downloadBlob, formatBytes, uid, uniqueName } from '../lib/utils';

interface ImageConverterProps {
  onNotice: (message: string, kind?: ToastItem['kind']) => void;
}

function FileThumb({ item }: { item: QueueItem }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (item.result?.url) setBroken(false);
  }, [item.result?.url]);

  if (broken) {
    return (
      <span className="thumb" aria-hidden="true">
        <FileImage />
      </span>
    );
  }

  return (
    <span className="thumb">
      <img
        src={item.result?.url ?? item.previewUrl}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </span>
  );
}

export function ImageConverter({ onNotice }: ImageConverterProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [target, setTarget] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(90);
  const [available, setAvailable] = useState<OutputFormat[]>(() =>
    OUTPUT_FORMATS.map((format) => format.id),
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [zipping, setZipping] = useState(false);

  const itemsRef = useRef<QueueItem[]>(items);
  itemsRef.current = items;
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    detectEncoders()
      .then((support) => {
        if (!active) return;
        const supported = OUTPUT_FORMATS.filter((format) => {
          if (format.id === 'jpeg') return support.jpeg;
          if (format.id === 'webp') return support.webp;
          if (format.id === 'avif') return support.avif;
          return true;
        }).map((format) => format.id);
        setAvailable(supported);
        setTarget((current) => (supported.includes(current) ? current : 'png'));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.result) URL.revokeObjectURL(item.result.url);
      }
    };
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      if (!incoming.length) return;

      const supported = incoming.filter(isSupportedImage);
      const skipped = incoming.length - supported.length;
      if (skipped > 0) {
        onNotice(
          `${skipped} file${skipped === 1 ? ' was' : 's were'} skipped. Only images can be converted here.`,
          'error',
        );
      }
      if (!supported.length) return;

      setItems((previous) => [
        ...previous,
        ...supported.map((file) => ({
          id: uid(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'queued' as const,
        })),
      ]);
    },
    [onNotice],
  );

  const removeItem = (id: string) => {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return;
    URL.revokeObjectURL(item.previewUrl);
    if (item.result) URL.revokeObjectURL(item.result.url);
    setItems((previous) => previous.filter((entry) => entry.id !== id));
  };

  const clearAll = () => {
    if (busyRef.current) return;
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.result) URL.revokeObjectURL(item.result.url);
    }
    setItems([]);
  };

  const convertAll = async () => {
    if (busyRef.current) return;
    const queue = itemsRef.current;
    if (!queue.length) return;

    const format = target;
    const qualityValue = quality / 100;
    const usedNames = new Set<string>();
    const plannedNames = new Map<string, string>();
    for (const entry of queue) {
      plannedNames.set(
        entry.id,
        uniqueName(`${baseName(entry.file.name)}.${outputExt(format)}`, usedNames),
      );
    }

    busyRef.current = true;
    setBusy(true);
    setProgress({ done: 0, total: queue.length });

    let converted = 0;
    let failed = 0;

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      const stillQueued = itemsRef.current.some((entry) => entry.id === item.id);

      if (stillQueued) {
        setItems((previous) =>
          previous.map((entry) =>
            entry.id === item.id ? { ...entry, status: 'working', error: undefined } : entry,
          ),
        );
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        try {
          const result = await convertFile(item.file, {
            format,
            quality: qualityValue,
          });
          if (item.result) URL.revokeObjectURL(item.result.url);
          const url = URL.createObjectURL(result.blob);
          setItems((previous) =>
            previous.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: 'done',
                    error: undefined,
                    result: {
                      blob: result.blob,
                      url,
                      filename: plannedNames.get(item.id) ?? result.filename,
                      width: result.width,
                      height: result.height,
                      format,
                    },
                  }
                : entry,
            ),
          );
          converted += 1;
        } catch (error) {
          setItems((previous) =>
            previous.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: 'error',
                    error:
                      error instanceof Error ? error.message : 'This file could not be converted.',
                  }
                : entry,
            ),
          );
          failed += 1;
        }
      }

      setProgress({ done: index + 1, total: queue.length });
    }

    busyRef.current = false;
    setBusy(false);
    setProgress(null);

    if (converted === 0 && failed > 0) {
      onNotice('Nothing could be converted. The files may be damaged.', 'error');
    } else if (failed > 0) {
      onNotice(`${converted} converted, ${failed} failed.`, 'info');
    }
  };

  const downloadItem = (item: QueueItem) => {
    if (!item.result) return;
    downloadBlob(item.result.blob, item.result.filename);
  };

  const doneItems = useMemo(
    () => items.filter((item) => item.status === 'done' && item.result),
    [items],
  );
  const doneCount = doneItems.length;
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const convertedBytes = doneItems.reduce((sum, item) => sum + item.file.size, 0);
  const outputBytes = doneItems.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0);
  const savedBytes = convertedBytes - outputBytes;

  const downloadAll = async () => {
    const done = itemsRef.current.filter((item) => item.status === 'done' && item.result);
    if (!done.length) return;
    if (done.length === 1) {
      downloadItem(done[0]);
      return;
    }

    setZipping(true);
    try {
      const files: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      for (const item of done) {
        const name = uniqueName(item.result!.filename, used);
        files[name] = new Uint8Array(await item.result!.blob.arrayBuffer());
      }
      const zip = zipSync(files, { level: 0 });
      downloadBlob(
        new Blob([new Uint8Array(zip)], { type: 'application/zip' }),
        'converted-images.zip',
      );
    } catch {
      onNotice('The ZIP could not be created. Try downloading the files one by one.', 'error');
    } finally {
      setZipping(false);
    }
  };

  const outputInfo = OUTPUT_BY_ID[target];
  const convertedPercent =
    convertedBytes > 0 && savedBytes > 0 ? Math.round((savedBytes / convertedBytes) * 100) : 0;

  return (
    <div>
      <FileDrop
        accept="image/*,.heic,.heif,.tif,.tiff,.jfif,.svg,.ico,.avif,.bmp"
        title={items.length ? 'Add more images' : 'Drop your images here'}
        hint="PNG, JPG, WEBP, HEIC, TIFF, SVG, GIF, BMP, ICO"
        icon={ImageIcon}
        compact={items.length > 0}
        count={items.length}
        onFiles={addFiles}
        disabled={busy}
      />

      {items.length > 0 && (
        <>
          <div className="controls">
            <div>
              <span className="control-label">Convert to</span>
              <FormatChips
                value={target}
                onChange={setTarget}
                available={available}
                disabled={busy}
              />
            </div>

            {outputInfo.lossy ? (
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
                onClick={convertAll}
                disabled={busy}
              >
                {busy ? <Loader2 className="spin" /> : null}
                {busy && progress
                  ? `Converting ${progress.done}/${progress.total}`
                  : `Convert ${items.length === 1 ? 'image' : 'images'}`}
              </button>
            </div>
          </div>

          <div className="queue">
            <div className="queue-head">
              <span className="queue-title">
                Files <span className="queue-count">{items.length}</span>
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
              {items.map((item) => {
                const output = item.result?.format ?? target;
                const meta = OUTPUT_BY_ID[output];
                const done = item.status === 'done' && item.result;

                return (
                  <li key={item.id} className="file-row">
                    <FileThumb item={item} />
                    <div className="file-main">
                      <p className="file-name">{item.file.name}</p>
                      <div className="file-meta">
                        <span>
                          {inputLabel(item.file.name, item.file.type)} ·{' '}
                          {formatBytes(item.file.size)}
                        </span>
                        <ArrowRight />
                        <span>{meta.label}</span>
                        {done && (
                          <>
                            <span>·</span>
                            <span>{formatBytes(item.result!.blob.size)}</span>
                            <span className="meta-status is-done">
                              <Check /> Done
                            </span>
                          </>
                        )}
                        {item.status === 'working' && (
                          <span className="meta-status">
                            <Loader2 className="spin" /> Converting
                          </span>
                        )}
                      </div>
                      {item.status === 'error' && (
                        <p className="file-error">
                          <AlertCircle /> {item.error}
                        </p>
                      )}
                    </div>
                    <div className="file-actions">
                      {done && (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => downloadItem(item)}
                          aria-label={`Download ${item.result?.filename}`}
                          title="Download"
                        >
                          <Download />
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => removeItem(item.id)}
                        disabled={item.status === 'working'}
                        aria-label={`Remove ${item.file.name}`}
                        title="Remove"
                      >
                        <X />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="queue-foot">
              <span className="queue-stats">
                <span>
                  {items.length} {items.length === 1 ? 'file' : 'files'} ·{' '}
                  {formatBytes(totalBytes)}
                </span>
                {doneCount > 0 && savedBytes > 0 && (
                  <span className="save-note">
                    Saved {formatBytes(savedBytes)} ({convertedPercent}%)
                  </span>
                )}
              </span>

              <div className="queue-actions">
                {doneCount > 1 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={clearAll}
                    disabled={busy}
                  >
                    <Trash2 /> Clear
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-tonal btn-sm"
                  onClick={downloadAll}
                  disabled={doneCount === 0 || zipping}
                >
                  {zipping ? <Loader2 className="spin" /> : <FolderDown />}
                  {doneCount > 1 ? 'Download all (.zip)' : 'Download'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {items.length === 0 && (
        <p className="hero-side-note">
          Your files stay in this browser tab. Nothing is uploaded.
        </p>
      )}
    </div>
  );
}
