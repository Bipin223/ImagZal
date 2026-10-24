import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, Loader2, Paintbrush, RotateCcw, Undo2 } from 'lucide-react';
import { decodeToCanvas, encodeCanvas } from '../lib/convert';
import { baseName, OUTPUT_BY_ID } from '../lib/formats';
import type { OutputFormat } from '../lib/formats';
import type { ToastItem } from '../lib/types';
import { downloadBlob } from '../lib/utils';

interface WatermarkRemoverProps {
  file: File;
  onNotice: (message: string, kind?: ToastItem['kind']) => void;
}

const FORMATS: OutputFormat[] = ['png', 'jpeg', 'webp'];
const MAX_SIDE = 3000;

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

export function WatermarkRemover({ file, onNotice }: WatermarkRemoverProps) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMarks, setHasMarks] = useState(false);
  const [brushPct, setBrushPct] = useState(5);
  const [format, setFormat] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(92);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const drawFull = () => {
    const display = displayRef.current;
    const source = sourceRef.current;
    const mask = maskRef.current;
    if (!display || !source || !mask) return;
    display.width = source.width;
    display.height = source.height;
    const context = display.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, display.width, display.height);
    context.drawImage(source, 0, 0);
    context.save();
    context.globalAlpha = 0.45;
    context.drawImage(mask, 0, 0);
    context.restore();
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setBusy(true);
    setError(null);
    setHasMarks(false);
    historyRef.current = [];
    sourceRef.current = null;
    maskRef.current = null;

    (async () => {
      try {
        let source = await decodeToCanvas(file);
        const longest = Math.max(source.width, source.height);
        if (longest > MAX_SIDE) {
          const scale = MAX_SIDE / longest;
          const scaled = canvasOf(
            Math.round(source.width * scale),
            Math.round(source.height * scale),
          );
          const context = scaled.getContext('2d');
          if (!context) throw new Error('Canvas is unavailable.');
          context.imageSmoothingQuality = 'high';
          context.drawImage(source, 0, 0, scaled.width, scaled.height);
          source.width = 0;
          source.height = 0;
          source = scaled;
        }

        const mask = canvasOf(source.width, source.height);
        if (cancelled) {
          source.width = 0;
          source.height = 0;
          return;
        }

        sourceRef.current = source;
        maskRef.current = mask;
        setDimensions({ width: source.width, height: source.height });
        setReady(true);
      } catch (caught) {
        if (cancelled) return;
        const message =
          caught instanceof Error ? caught.message : 'This image could not be opened.';
        setError(message);
        onNotice(message, 'error');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, onNotice]);

  useEffect(() => {
    if (ready) drawFull();
    // drawFull is intentionally read at render time; only the readiness matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const brushWidth = () => {
    const source = sourceRef.current;
    if (!source) return 12;
    return Math.max(6, Math.round((Math.min(source.width, source.height) * brushPct) / 100));
  };

  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const paint = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const mask = maskRef.current;
    const display = displayRef.current;
    if (!mask || !display) return;
    const width = brushWidth();
    const maskContext = mask.getContext('2d');
    const displayContext = display.getContext('2d');
    if (!maskContext || !displayContext) return;

    maskContext.strokeStyle = '#ff3b30';
    maskContext.fillStyle = '#ff3b30';
    maskContext.lineWidth = width;
    maskContext.lineCap = 'round';
    maskContext.lineJoin = 'round';
    maskContext.beginPath();
    maskContext.moveTo(from.x, from.y);
    maskContext.lineTo(to.x, to.y);
    maskContext.stroke();
    maskContext.beginPath();
    maskContext.arc(to.x, to.y, width / 2, 0, Math.PI * 2);
    maskContext.fill();

    displayContext.save();
    displayContext.globalAlpha = 0.45;
    displayContext.strokeStyle = '#ff3b30';
    displayContext.fillStyle = '#ff3b30';
    displayContext.lineWidth = width;
    displayContext.lineCap = 'round';
    displayContext.lineJoin = 'round';
    displayContext.beginPath();
    displayContext.moveTo(from.x, from.y);
    displayContext.lineTo(to.x, to.y);
    displayContext.stroke();
    displayContext.beginPath();
    displayContext.arc(to.x, to.y, width / 2, 0, Math.PI * 2);
    displayContext.fill();
    displayContext.restore();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!ready || busy) return;
    event.preventDefault();
    const mask = maskRef.current;
    if (!mask) return;
    const context = mask.getContext('2d');
    if (context) {
      historyRef.current.push(context.getImageData(0, 0, mask.width, mask.height));
      if (historyRef.current.length > 12) historyRef.current.shift();
    }
    const point = pointOf(event);
    drawingRef.current = true;
    lastPointRef.current = point;
    paint(point, point);
    setHasMarks(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const point = pointOf(event);
    paint(lastPointRef.current ?? point, point);
    lastPointRef.current = point;
  };

  const endStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const undo = () => {
    const mask = maskRef.current;
    const previous = historyRef.current.pop();
    if (!mask || !previous) return;
    mask.getContext('2d')?.putImageData(previous, 0, 0);
    setHasMarks(historyRef.current.length > 0);
    drawFull();
  };

  const clear = () => {
    const mask = maskRef.current;
    if (!mask) return;
    mask.getContext('2d')?.clearRect(0, 0, mask.width, mask.height);
    historyRef.current = [];
    setHasMarks(false);
    drawFull();
  };

  const removeWatermark = async () => {
    const source = sourceRef.current;
    const mask = maskRef.current;
    if (!source || !mask || !hasMarks) return;

    setBusy(true);
    setError(null);
    try {
      const width = source.width;
      const height = source.height;
      const sourceContext = source.getContext('2d');
      const maskContext = mask.getContext('2d');
      if (!sourceContext || !maskContext) throw new Error('Canvas is unavailable.');

      const sourceData = sourceContext.getImageData(0, 0, width, height);
      const maskData = maskContext.getImageData(0, 0, width, height);
      const pixels = new Uint8ClampedArray(sourceData.data);

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (maskData.data[(y * width + x) * 4 + 3] > 16) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX) throw new Error('Mark the watermark first.');

      const x0 = Math.max(0, minX - 3);
      const y0 = Math.max(0, minY - 3);
      const x1 = Math.min(width - 1, maxX + 3);
      const y1 = Math.min(height - 1, maxY + 3);
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;

      const known = new Uint8Array(bw * bh);
      const filled = new Uint8Array(bw * bh);
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let knownCount = 0;

      for (let y = 0; y < bh; y += 1) {
        for (let x = 0; x < bw; x += 1) {
          const index = y * bw + x;
          const sourceIndex = ((y0 + y) * width + (x0 + x)) * 4;
          const masked = maskData.data[sourceIndex + 3] > 16;
          known[index] = masked ? 0 : 1;
          if (!masked) {
            sumR += sourceData.data[sourceIndex];
            sumG += sourceData.data[sourceIndex + 1];
            sumB += sourceData.data[sourceIndex + 2];
            knownCount += 1;
          }
        }
      }

      // Fill each run of masked pixels from the clean pixels on either side.
      // Horizontal interpolation preserves gradients across wide watermarks.
      for (let y = 0; y < bh; y += 1) {
        let x = 0;
        while (x < bw) {
          if (known[y * bw + x]) {
            x += 1;
            continue;
          }
          let end = x;
          while (end + 1 < bw && !known[y * bw + end + 1]) end += 1;

          const left = x > 0 && known[y * bw + x - 1] ? x - 1 : -1;
          const right = end + 1 < bw && known[y * bw + end + 1] ? end + 1 : -1;

          if (left >= 0 || right >= 0) {
            const leftIndex = left >= 0 ? ((y0 + y) * width + (x0 + left)) * 4 : -1;
            const rightIndex = right >= 0 ? ((y0 + y) * width + (x0 + right)) * 4 : -1;

            for (let xi = x; xi <= end; xi += 1) {
              const t = left >= 0 && right >= 0 ? (xi - left) / (right - left) : left >= 0 ? 0 : 1;
              const outIndex = ((y0 + y) * width + (x0 + xi)) * 4;
              for (let channel = 0; channel < 3; channel += 1) {
                const leftValue = leftIndex >= 0 ? sourceData.data[leftIndex + channel] : 0;
                const rightValue = rightIndex >= 0 ? sourceData.data[rightIndex + channel] : 0;
                pixels[outIndex + channel] = Math.round(leftValue + (rightValue - leftValue) * t);
              }
              pixels[outIndex + 3] = 255;
              filled[y * bw + xi] = 1;
            }
          }

          x = end + 1;
        }
      }

      // Anything still open (edge watermarks) is filled vertically.
      for (let x = 0; x < bw; x += 1) {
        let y = 0;
        while (y < bh) {
          if (known[y * bw + x] || filled[y * bw + x]) {
            y += 1;
            continue;
          }
          let end = y;
          while (
            end + 1 < bh &&
            !known[(end + 1) * bw + x] &&
            !filled[(end + 1) * bw + x]
          ) {
            end += 1;
          }

          const top = y > 0 && known[(y - 1) * bw + x] ? y - 1 : -1;
          const bottom = end + 1 < bh && known[(end + 1) * bw + x] ? end + 1 : -1;

          if (top >= 0 || bottom >= 0) {
            const topIndex = top >= 0 ? ((y0 + top) * width + (x0 + x)) * 4 : -1;
            const bottomIndex = bottom >= 0 ? ((y0 + bottom) * width + (x0 + x)) * 4 : -1;

            for (let yi = y; yi <= end; yi += 1) {
              const t = top >= 0 && bottom >= 0 ? (yi - top) / (bottom - top) : top >= 0 ? 0 : 1;
              const outIndex = ((y0 + yi) * width + (x0 + x)) * 4;
              for (let channel = 0; channel < 3; channel += 1) {
                const topValue = topIndex >= 0 ? sourceData.data[topIndex + channel] : 0;
                const bottomValue = bottomIndex >= 0 ? sourceData.data[bottomIndex + channel] : 0;
                pixels[outIndex + channel] = Math.round(topValue + (bottomValue - topValue) * t);
              }
              pixels[outIndex + 3] = 255;
              filled[yi * bw + x] = 1;
            }
          }

          y = end + 1;
        }
      }

      // Fallback for a mask that reaches every edge of its own bounding box.
      const fallbackR = knownCount ? sumR / knownCount : 128;
      const fallbackG = knownCount ? sumG / knownCount : 128;
      const fallbackB = knownCount ? sumB / knownCount : 128;
      for (let y = 0; y < bh; y += 1) {
        for (let x = 0; x < bw; x += 1) {
          const index = y * bw + x;
          if (known[index] || filled[index]) continue;
          const outIndex = ((y0 + y) * width + (x0 + x)) * 4;
          pixels[outIndex] = Math.round(fallbackR);
          pixels[outIndex + 1] = Math.round(fallbackG);
          pixels[outIndex + 2] = Math.round(fallbackB);
          pixels[outIndex + 3] = 255;
        }
      }

      const result = canvasOf(width, height);
      const resultContext = result.getContext('2d');
      if (!resultContext) throw new Error('Canvas is unavailable.');
      resultContext.putImageData(new ImageData(pixels, width, height), 0, 0);

      const blob = await encodeCanvas(result, { format, quality: quality / 100 });
      downloadBlob(blob, `${baseName(file.name)}-watermark-removed.${OUTPUT_BY_ID[format].ext}`);
      onNotice('Watermark area filled in and saved.', 'success');

      result.width = 0;
      result.height = 0;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The image could not be saved.';
      setError(message);
      onNotice(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (busy && !ready) {
    return (
      <p className="studio-status">
        <Loader2 className="spin" /> Loading image…
      </p>
    );
  }

  if (error && !ready) {
    return <p className="notice">{error}</p>;
  }

  return (
    <div className="wm-editor">
      <div className="wm-canvas-wrap">
        <canvas
          ref={displayRef}
          className="wm-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
        {!hasMarks && (
          <span className="wm-hint-overlay">
            <Paintbrush /> Paint over the watermark
          </span>
        )}
      </div>

      <div className="studio-grid">
        <label className="quality field">
          <span className="control-label">Brush size</span>
          <input
            type="range"
            min={2}
            max={14}
            value={brushPct}
            onChange={(event) => setBrushPct(Number(event.target.value))}
            disabled={busy}
            aria-label="Brush size"
          />
          <span className="quality-value">{brushPct}%</span>
        </label>

        <div className="field">
          <span className="control-label">Save as</span>
          <div className="chips">
            {FORMATS.map((id) => (
              <button
                key={id}
                type="button"
                className={`chip${format === id ? ' is-active' : ''}`}
                onClick={() => setFormat(id)}
                disabled={busy}
              >
                {OUTPUT_BY_ID[id].label}
              </button>
            ))}
          </div>
        </div>

        {format !== 'png' && (
          <label className="quality field">
            <span className="control-label">Quality</span>
            <input
              type="range"
              min={40}
              max={100}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              disabled={busy}
              aria-label="Output quality"
            />
            <span className="quality-value">{quality}%</span>
          </label>
        )}
      </div>

      <div className="studio-actions">
        <span className="studio-status">
          {dimensions.width} × {dimensions.height} px
          {hasMarks ? ' · area marked' : ' · nothing marked'}
        </span>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={clear}
          disabled={busy || !hasMarks}
        >
          <RotateCcw /> Clear
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={undo}
          disabled={busy || historyRef.current.length === 0}
        >
          <Undo2 /> Undo
        </button>
        <button
          type="button"
          className="btn btn-solid"
          onClick={removeWatermark}
          disabled={busy || !hasMarks}
        >
          {busy ? <Loader2 className="spin" /> : <Eraser />}
          {busy ? 'Cleaning…' : 'Remove watermark'}
        </button>
      </div>

      <p className="field-note">
        The marked area is filled using the surrounding colours. It works best on plain or
        softly textured backgrounds. Your original file is never changed.
      </p>
    </div>
  );
}
