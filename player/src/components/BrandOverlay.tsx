import type { Branding } from '../lib/types';

interface Props {
  branding: Branding;
  title?: string;
  subtitle?: string;
}

export function BrandOverlay({ branding, title, subtitle }: Props) {
  return (
    <div className="brand-overlay">
      <img
        className="brand-logo"
        src={branding.logoUrl}
        alt=""
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
      <div className="brand-copy">
        <span className="brand-name">{branding.name}</span>
        <span className="brand-subtitle">{title ?? branding.tagline}{subtitle ? ` · ${subtitle}` : ''}</span>
      </div>
    </div>
  );
}
