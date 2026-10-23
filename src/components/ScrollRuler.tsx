import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

const TICKS = [0, 20, 40, 60, 80, 100];

function maxScroll(): number {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

export function ScrollRuler() {
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const rulerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  useEffect(() => {
    const update = () => {
      frame.current = 0;
      const max = maxScroll();
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    const schedule = () => {
      if (!frame.current) frame.current = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame.current) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  const scrollToProgress = (value: number) => {
    const top = Math.round(Math.min(1, Math.max(0, value)) * maxScroll());
    // The page uses smooth scrolling globally; dragging the ruler must be instant.
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, top);
    root.style.scrollBehavior = previous;
  };

  const progressFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.height <= 0) return null;
    return Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const value = progressFromEvent(event);
    if (value === null) return;
    rulerRef.current?.setPointerCapture(event.pointerId);
    setDragging(true);
    scrollToProgress(value);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const value = progressFromEvent(event);
    if (value !== null) scrollToProgress(value);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (rulerRef.current?.hasPointerCapture(event.pointerId)) {
      rulerRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const page = window.innerHeight * 0.85;
    let delta = 0;
    if (event.key === 'ArrowDown') delta = 80;
    else if (event.key === 'ArrowUp') delta = -80;
    else if (event.key === 'PageDown') delta = page;
    else if (event.key === 'PageUp') delta = -page;
    else if (event.key === 'Home') {
      event.preventDefault();
      scrollToProgress(0);
      return;
    } else if (event.key === 'End') {
      event.preventDefault();
      scrollToProgress(1);
      return;
    } else {
      return;
    }
    event.preventDefault();
    window.scrollBy(0, delta);
  };

  const percent = Math.round(progress * 100);

  return (
    <div
      ref={rulerRef}
      className={`scroll-ruler${dragging ? ' is-dragging' : ''}`}
      role="slider"
      aria-label="Page scroll"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    >
      <div ref={trackRef} className="ruler-track">
        {TICKS.map((tick) => (
          <span
            key={tick}
            className="ruler-tick ruler-major"
            style={{ top: `${tick}%` }}
            aria-hidden="true"
          >
            <span>{tick}</span>
          </span>
        ))}

        <span
          className={`ruler-marker${progress > 0.93 ? ' is-near-end' : ''}`}
          style={{ top: `${progress * 100}%` }}
          aria-hidden="true"
        >
          <span>{percent}%</span>
        </span>
      </div>
    </div>
  );
}
