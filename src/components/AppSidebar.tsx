import { useEffect, useRef } from 'react';
import {
  ArrowUpRight,
  Github,
  House,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Wrench,
  X,
} from 'lucide-react';
import bipinPhoto from '../assets/bipin.jpg';
import type { Theme } from '../hooks/useTheme';

interface AppSidebarProps {
  open: boolean;
  theme: Theme;
  onClose: () => void;
  onToggleTheme: () => void;
  onReplayIntro: () => void;
}

export function AppSidebar({
  open,
  theme,
  onClose,
  onToggleTheme,
  onReplayIntro,
}: AppSidebarProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const jump = (id: string) => {
    onClose();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  return (
    <div className="app-sidebar-overlay" onPointerDown={onClose} role="presentation">
      <aside
        ref={panelRef}
        className="app-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="ImagZal menu"
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="app-sidebar-head">
          <span className="app-sidebar-brand">
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              width={34}
              height={34}
              alt=""
            />
            <span>
              <strong>ImagZal</strong>
              <small>Android edition</small>
            </span>
          </span>
          <button
            type="button"
            className="icon-btn app-sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X />
          </button>
        </header>

        <div className="app-profile">
          <img src={bipinPhoto} width={64} height={64} alt="Portrait of Bipin Rizal" />
          <div>
            <h2>Bipin Rizal</h2>
            <p>BCA student · Nepal</p>
          </div>
        </div>

        <p className="app-sidebar-bio">
          ImagZal is a small, local-first toolkit. Everything runs on your phone — no uploads,
          no accounts, no limits.
        </p>

        <div className="app-sidebar-section">
          <span className="app-sidebar-label">Go to</span>
          <div className="app-sidebar-shortcuts">
            <button type="button" onClick={() => jump('home')}>
              <House /> Home
            </button>
            <button type="button" onClick={() => jump('workspace')}>
              <Wrench /> Tools
            </button>
          </div>
        </div>

        <div className="app-sidebar-section">
          <span className="app-sidebar-label">Actions</span>

          <button type="button" className="app-sidebar-action" onClick={onReplayIntro}>
            <span className="app-action-icon" aria-hidden="true">
              <RotateCcw />
            </span>
            <span>
              <strong>Replay intro</strong>
              <small>Watch the opening animation again</small>
            </span>
          </button>

          <button type="button" className="app-sidebar-action" onClick={onToggleTheme}>
            <span className="app-action-icon" aria-hidden="true">
              {theme === 'dark' ? <Sun /> : <Moon />}
            </span>
            <span>
              <strong>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</strong>
              <small>Switch the app appearance</small>
            </span>
          </button>
        </div>

        <div className="app-sidebar-section">
          <span className="app-sidebar-label">Elsewhere</span>
          <a
            className="app-sidebar-link"
            href="https://bipin-rijal.vercel.app"
            target="_blank"
            rel="noreferrer"
          >
            Portfolio <ArrowUpRight />
          </a>
          <a
            className="app-sidebar-link"
            href="https://github.com/Bipin223"
            target="_blank"
            rel="noreferrer"
          >
            <Github /> GitHub <ArrowUpRight />
          </a>
        </div>

        <footer className="app-sidebar-foot">
          <ShieldCheck /> Offline. Nothing leaves your device.
        </footer>
      </aside>
    </div>
  );
}
