'use client';

interface Props {
  action: 'play' | 'pause' | null;
  feedbackNonce: number;
}

export function CenterFeedback({ action, feedbackNonce }: Props) {
  if (!action) return null;

  return (
    <div key={feedbackNonce} className="center-feedback-overlay" aria-hidden="true">
      <div className="center-feedback-bubble">
        {action === 'play' ? (
          <svg viewBox="0 0 24 24" className="center-feedback-icon">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="center-feedback-icon">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        )}
      </div>
    </div>
  );
}
