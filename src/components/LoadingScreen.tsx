import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ShieldCheck } from 'lucide-react';

interface LoadingScreenProps {
  onDone: () => void;
}

const WORD = 'ImagZal'.split('');

export function LoadingScreen({ onDone }: LoadingScreenProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const leaveTimer = window.setTimeout(() => setLeaving(true), 1850);
    const doneTimer = window.setTimeout(onDone, 2450);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(doneTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [onDone]);

  return (
    <div className={`intro${leaving ? ' is-leaving' : ''}`} aria-hidden="true">
      <span className="intro-aurora intro-aurora-one" />
      <span className="intro-aurora intro-aurora-two" />

      <div className="intro-lockup">
        <div className="intro-mark-wrap">
          <span className="intro-halo" />
          <div className="intro-mark">
            <svg viewBox="0 0 40 40" role="img" aria-label="ImagZal">
              <rect className="intro-mark-bg" width="40" height="40" rx="11" />
              <path
                className="intro-mark-line"
                d="M13 13.25h14L13 26.75h14"
                fill="none"
                strokeWidth="3"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
          </div>
        </div>

        <div className="intro-word">
          {WORD.map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              style={{ '--letter-index': index } as CSSProperties}
            >
              {letter}
            </span>
          ))}
        </div>

        <p className="intro-sub">Image &amp; PDF tools</p>
        <span className="intro-rule">
          <span />
        </span>
      </div>

      <p className="intro-foot">
        <ShieldCheck /> Everything happens on your device
      </p>
    </div>
  );
}
