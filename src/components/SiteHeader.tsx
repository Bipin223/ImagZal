import { useEffect, useState } from 'react';
import { Github, House, Moon, Sun, UserRound, Wrench } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';

const NAV = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'workspace', label: 'Tools', icon: Wrench },
  { id: 'about', label: 'About', icon: UserRound },
] as const;

type SectionId = (typeof NAV)[number]['id'];

interface HeaderState {
  active: SectionId;
  scrolled: boolean;
  progress: number;
}

function useHeaderState(): HeaderState {
  const [state, setState] = useState<HeaderState>({
    active: 'home',
    scrolled: false,
    progress: 0,
  });

  useEffect(() => {
    const sections = NAV.map(({ id }) => ({ id, element: document.getElementById(id) })).filter(
      (section): section is { id: SectionId; element: HTMLElement } => Boolean(section.element),
    );

    let frame = 0;

    const update = () => {
      frame = 0;
      const scrollY = window.scrollY;
      const doc = document.documentElement;
      const maxScroll = doc.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollY / maxScroll)) : 0;
      const probe = scrollY + Math.min(window.innerHeight * 0.32, 260);

      let active: SectionId = 'home';
      for (const section of sections) {
        if (section.element.offsetTop <= probe) active = section.id;
      }
      if (maxScroll > 0 && scrollY >= maxScroll - 4) active = 'about';

      setState((previous) => {
        if (
          previous.active === active &&
          previous.scrolled === (scrollY > 12) &&
          Math.abs(previous.progress - progress) < 0.001
        ) {
          return previous;
        }
        return { active, scrolled: scrollY > 12, progress };
      });
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return state;
}

interface SiteHeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function SiteHeader({ theme, onToggleTheme }: SiteHeaderProps) {
  const { active, scrolled, progress } = useHeaderState();

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="header-dock">
        <a className="brand" href="#home" aria-label="ImagZal — home">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}logo.svg`}
            width={38}
            height={38}
            alt=""
          />
          <span className="brand-copy">
            <span className="brand-name">ImagZal</span>
            <span className="brand-by">by Bipin Rizal</span>
          </span>
        </a>

        <nav className="nav-tabs" aria-label="Main navigation">
          {NAV.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              className={`tab${active === id ? ' is-active' : ''}`}
              href={`#${id}`}
              aria-current={active === id ? 'page' : undefined}
              title={label}
            >
              <Icon aria-hidden="true" />
              <span className="tab-label">{label}</span>
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className={`theme-toggle${theme === 'dark' ? ' is-dark' : ''}`}
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="theme-icon" aria-hidden="true">
              <span className="theme-icon-moon">
                <Moon />
              </span>
              <span className="theme-icon-sun">
                <Sun />
              </span>
            </span>
          </button>

          <a
            className="header-github-link"
            href="https://github.com/Bipin223/ImagZal"
            target="_blank"
            rel="noreferrer"
            aria-label="View ImagZal on GitHub"
            title="View ImagZal on GitHub"
          >
            <Github />
          </a>
        </div>

        <span
          className="dock-progress"
          style={{ transform: `scaleX(${progress})` }}
          aria-hidden="true"
        />
      </div>
    </header>
  );
}
