import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Image as ImageIcon,
  Lock,
  RotateCw,
  ShieldCheck,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Slide {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  icon: LucideIcon;
  visual: 'compress' | 'pages' | 'privacy';
}

const SLIDES: Slide[] = [
  {
    id: 'image',
    kicker: 'Image studio',
    title: 'Hit the size limit, not the quality.',
    copy: 'Compress to an exact KB target, resize or crop, and watermark — in one pass.',
    icon: Wand2,
    visual: 'compress',
  },
  {
    id: 'pdf',
    kicker: 'PDF studio',
    title: 'A proper desk for PDFs.',
    copy: 'Merge, split, reorder and rotate pages, then watermark or compress the result.',
    icon: FileText,
    visual: 'pages',
  },
  {
    id: 'privacy',
    kicker: 'Privacy',
    title: 'Nothing leaves this device.',
    copy: 'Strip EXIF and GPS on request, skip the account, and keep working offline.',
    icon: ShieldCheck,
    visual: 'privacy',
  },
];

function Visual({ kind }: { kind: Slide['visual'] }) {
  if (kind === 'compress') {
    return (
      <div className="mock mock-compress" aria-hidden="true">
        <div className="mock-file">
          <span className="mock-thumb">
            <ImageIcon />
          </span>
          <span className="mock-file-copy">
            <strong>sunset.jpg</strong>
            <span>1200 × 800 · 47 KB</span>
          </span>
          <span className="mock-pill">JPG</span>
        </div>
        <div className="mock-meter">
          <span style={{ width: '62%' }} />
        </div>
        <div className="mock-row">
          <span>Target 30 KB</span>
          <strong>29 KB</strong>
        </div>
        <span className="mock-badge">
          <Check /> Fits
        </span>
      </div>
    );
  }

  if (kind === 'pages') {
    return (
      <div className="mock mock-pages" aria-hidden="true">
        <span className="mock-page">
          <span>1</span>
        </span>
        <span className="mock-page is-turned">
          <span>2</span>
          <RotateCw />
        </span>
        <span className="mock-page is-removed">
          <span>3</span>
          <Trash2 />
        </span>
        <span className="mock-page is-add">+</span>
      </div>
    );
  }

  return (
    <div className="mock mock-safe" aria-hidden="true">
      <span className="mock-shield">
        <ShieldCheck />
      </span>
      <span className="mock-tags">
        <span>EXIF</span>
        <span>GPS</span>
        <span>Device</span>
      </span>
      <span className="mock-badge mock-badge-quiet">
        <Lock /> 0 uploads
      </span>
    </div>
  );
}

export function ScalingShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    if (paused || interacted) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused, interacted]);

  const go = (direction: number) => {
    setInteracted(true);
    setActive((current) => (current + direction + SLIDES.length) % SLIDES.length);
  };

  return (
    <div
      className="showcase-slider"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="showcase-stage">
        {SLIDES.map((slide, index) => {
          const slot = (index - active + SLIDES.length) % SLIDES.length;
          const Icon = slide.icon;
          return (
            <article
              key={slide.id}
              className={`showcase-slide slot-${slot}`}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${SLIDES.length}: ${slide.kicker}`}
            >
              <div className="showcase-card">
                <div className="showcase-copy">
                  <span className="showcase-kicker">
                    <Icon /> {slide.kicker}
                  </span>
                  <h3>{slide.title}</h3>
                  <p>{slide.copy}</p>
                </div>
                <span className="showcase-mark" aria-hidden="true">
                  <Icon />
                </span>
                <Visual kind={slide.visual} />
              </div>
              {slot !== 0 && (
                <button
                  type="button"
                  className="showcase-hit"
                  aria-label={`Show ${slide.kicker} preview`}
                  onClick={() => {
                    setInteracted(true);
                    setActive(index);
                  }}
                />
              )}
            </article>
          );
        })}
      </div>

      <div className="showcase-controls">
        <button
          type="button"
          className="icon-btn"
          onClick={() => go(-1)}
          aria-label="Previous preview"
        >
          <ArrowLeft />
        </button>

        <div className="showcase-dots" role="tablist" aria-label="Studio previews">
          {SLIDES.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={slide.kicker}
              className={`showcase-dot${index === active ? ' is-active' : ''}`}
              onClick={() => {
                setInteracted(true);
                setActive(index);
              }}
            >
              <span />
            </button>
          ))}
        </div>

        <span className="showcase-count" aria-live="polite">
          {String(active + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
        </span>

        <button
          type="button"
          className="icon-btn"
          onClick={() => go(1)}
          aria-label="Next preview"
        >
          <ArrowRight />
        </button>
      </div>
    </div>
  );
}
