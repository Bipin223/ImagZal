import { Github, House, UserRound, Wrench } from 'lucide-react';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="#top" aria-label="ImagZal — home">
          <img
            className="brand-logo"
            src="/logo.svg"
            width={38}
            height={38}
            alt=""
          />
          <span className="brand-copy">
            <span className="brand-name">ImagZal</span>
            <span className="brand-by">by Bipin Rizal</span>
          </span>
        </a>

        <nav className="nav-tabs" aria-label="Main">
          <a className="tab is-active" href="#top">
            <House /> Home
          </a>
          <a className="tab" href="#workspace">
            <Wrench /> Tools
          </a>
          <a className="tab" href="#about">
            <UserRound /> About
          </a>
          <a className="tab" href="https://github.com/Bipin223" target="_blank" rel="noreferrer">
            <Github /> GitHub
          </a>
        </nav>

        <div className="header-actions">
          <a
            className="header-link"
            href="https://github.com/Bipin223"
            target="_blank"
            rel="noreferrer"
            aria-label="ImagZal on GitHub — Bipin Rizal"
            title="GitHub"
          >
            <Github size={17} />
          </a>
        </div>
      </div>
    </header>
  );
}
