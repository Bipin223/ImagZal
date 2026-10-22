import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  FileText,
  Files,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import bipinPhoto from './assets/bipin.jpg';
import { LoadingScreen } from './components/LoadingScreen';
import { SiteHeader } from './components/SiteHeader';
import { Toasts } from './components/Toasts';
import { useScrollReveal } from './hooks/useScrollReveal';
import { useTheme } from './hooks/useTheme';
import { ImageConverter } from './tools/ImageConverter';
import { PdfToImage } from './tools/PdfToImage';
import { ImageToPdf } from './tools/ImageToPdf';
import type { ToastItem } from './lib/types';

type ToolId = 'images' | 'pdf-to-image' | 'image-to-pdf';

interface Tool {
  id: ToolId;
  name: string;
  formats: string;
  description: string;
  icon: LucideIcon;
}

const TOOLS: Tool[] = [
  {
    id: 'images',
    name: 'Image converter',
    formats: 'PNG, JPG, JPEG, WEBP',
    description: 'Change formats, one image or a whole batch.',
    icon: ImageIcon,
  },
  {
    id: 'pdf-to-image',
    name: 'PDF to image',
    formats: 'PDF → PNG, JPG, WEBP',
    description: 'Turn each PDF page into a downloadable image.',
    icon: FileText,
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    formats: 'JPG, PNG, WEBP → PDF',
    description: 'Combine photos into a single document.',
    icon: Files,
  },
];

function shouldShowIntro() {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('intro')) return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return sessionStorage.getItem('imagzal-intro-seen') !== '1';
  } catch {
    return true;
  }
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [introDone, setIntroDone] = useState(() => !shouldShowIntro());
  const [active, setActive] = useState<ToolId>('images');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  const timers = useRef<number[]>([]);

  const finishIntro = useCallback(() => setIntroDone(true), []);

  const replayIntro = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setIntroDone(false);
  }, []);

  useScrollReveal(introDone);

  useEffect(() => {
    if (introDone) return;
    try {
      sessionStorage.setItem('imagzal-intro-seen', '1');
    } catch {
      // Ignore unavailable session storage.
    }
  }, [introDone]);

  const notify = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((previous) => [...previous.slice(-2), { id, message, kind }]);
    const timer = window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 4200);
    timers.current.push(timer);
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    const preventFileDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', preventFileDrop);
    window.addEventListener('drop', preventFileDrop);
    return () => {
      window.removeEventListener('dragover', preventFileDrop);
      window.removeEventListener('drop', preventFileDrop);
    };
  }, []);

  const openTool = (id: ToolId) => {
    setActive(id);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.requestAnimationFrame(() => {
      document.getElementById('workspace')?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  const activeTool = TOOLS.find((tool) => tool.id === active) ?? TOOLS[0];
  const ActiveIcon = activeTool.icon;

  return (
    <div id="top">
      {!introDone ? <LoadingScreen onDone={finishIntro} /> : null}
      <SiteHeader theme={theme} onToggleTheme={toggleTheme} />

      <main>
        <section className="hero container" id="home">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="hero-badge" data-reveal>
                <Sparkles /> Personal toolkit of Bipin Rizal
              </span>

              <h1 className="hero-title" data-reveal>
                Simple tools for everyday files.
              </h1>

              <p className="hero-sub" data-reveal>
                Convert an image, pull pages out of a PDF, or turn a set of photos into one PDF.
                Everything runs in this browser, so your files never leave your device.
              </p>

              <div className="hero-actions" data-reveal>
                <a className="btn btn-solid btn-lg" href="#workspace">
                  Start with a tool <ArrowRight />
                </a>
                <a
                  className="btn btn-tonal btn-lg"
                  href="https://bipin-rijal.vercel.app"
                  target="_blank"
                  rel="noreferrer"
                >
                  View projects
                </a>
              </div>

              <div className="hero-meta" data-reveal>
                <span>
                  <ShieldCheck /> No uploads
                </span>
                <span>
                  <UserRound /> No account
                </span>
                <span>
                  <InfinityIcon /> No file limits
                </span>
              </div>
            </div>

            <aside className="hero-side" id="tools" aria-label="Tools" data-reveal>
              <span className="section-kicker">
                <Sparkles /> Tools
              </span>
              <div className="tool-list">
                {TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      className={`tool-card${active === tool.id ? ' is-active' : ''}`}
                      aria-pressed={active === tool.id}
                      onClick={() => openTool(tool.id)}
                    >
                      <span className="tool-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="tool-copy">
                        <span className="tool-name">{tool.name}</span>
                        <span className="tool-sub">{tool.formats}</span>
                      </span>
                      <ChevronRight className="tool-chevron" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              <p className="hero-side-note">
                <ShieldCheck /> Files stay in this tab
              </p>
            </aside>
          </div>
        </section>

        <section className="section container" id="workspace" aria-labelledby="workspace-title">
          <div className="workspace" data-reveal>
            <div className="workspace-head">
              <div className="workspace-title">
                <span className="workspace-icon" aria-hidden="true">
                  <ActiveIcon />
                </span>
                <div>
                  <h2 id="workspace-title">{activeTool.name}</h2>
                  <p className="workspace-sub">{activeTool.description}</p>
                </div>
              </div>
              <span className="workspace-note">
                <ShieldCheck /> On your device
              </span>
            </div>

            <div className="workspace-body">
              <section className="tool-pane" hidden={active !== 'images'}>
                <ImageConverter onNotice={notify} />
              </section>
              <section className="tool-pane" hidden={active !== 'pdf-to-image'}>
                <PdfToImage onNotice={notify} />
              </section>
              <section className="tool-pane" hidden={active !== 'image-to-pdf'}>
                <ImageToPdf onNotice={notify} />
              </section>
            </div>
          </div>
        </section>

        <section className="about container" id="about">
          <div data-reveal>
            <span className="section-kicker">
              <UserRound /> About
            </span>
            <div className="about-profile">
              <img
                className="about-avatar"
                src={bipinPhoto}
                width={88}
                height={88}
                alt="Portrait of Bipin Rizal"
              />
              <div>
                <h2>Made by Bipin Rizal.</h2>
                <p className="about-role">BCA student · Nepal</p>
              </div>
            </div>
          </div>
          <div className="about-copy" data-reveal>
            <p>
              I’m a BCA student and developer from Nepal. ImagZal is a small set of browser
              tools that skip the sign-up screen and keep your files where they belong — on
              your device.
            </p>
            <div className="about-links">
              <a
                className="about-link"
                href="https://bipin-rijal.vercel.app"
                target="_blank"
                rel="noreferrer"
              >
                Portfolio <ArrowUpRight />
              </a>
              <a
                className="about-link"
                href="https://github.com/Bipin223"
                target="_blank"
                rel="noreferrer"
              >
                GitHub <ArrowUpRight />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner" data-reveal>
          <span className="footer-left">
            <img
              className="footer-logo"
              src="/logo.svg"
              width={24}
              height={24}
              alt=""
            />
            <span>ImagZal · © 2026 Bipin Rizal</span>
          </span>
          <span className="footer-links">
            <a href="https://bipin-rijal.vercel.app" target="_blank" rel="noreferrer">
              Portfolio
            </a>
            <a href="https://github.com/Bipin223" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <button type="button" className="footer-replay" onClick={replayIntro}>
              Replay intro
            </button>
            <span>All processing happens on your device.</span>
          </span>
        </div>
      </footer>

      <Toasts toasts={toasts} />
    </div>
  );
}
