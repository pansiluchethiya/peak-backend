import type { Branding } from '../lib/types';

interface Props {
  branding: Branding;
  label: string;
}

export function LoadingSkeleton({ branding, label }: Props) {
  return (
    <div className="loading-layer" role="status" aria-live="polite">
      <div className="loading-glow" />
      <div className="loading-inner">
        <img className="loading-logo" src={branding.logoUrl} alt="" />
        <div className="loading-bar">
          <span className="loading-bar-fill" />
        </div>
        <p className="loading-label">{label}</p>
        <p className="loading-brand">{branding.tagline}</p>
      </div>
    </div>
  );
}
