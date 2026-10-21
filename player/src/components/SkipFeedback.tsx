'use client';

interface Props {
  direction: 'backward' | 'forward' | null;
  seconds: number;
  nonce: number;
}

export function SkipFeedback({ direction, seconds, nonce }: Props) {
  if (!direction || seconds <= 0) return null;

  const isBackward = direction === 'backward';

  return (
    <div
      key={`skip-${nonce}`}
      className={`skip-feedback-container ${isBackward ? 'backward' : 'forward'}`}
      aria-hidden="true"
    >
      <div className="skip-feedback-ripple">
        <div className="skip-feedback-content">
          {isBackward ? (
            <>
              <svg viewBox="0 0 24 24" className="skip-feedback-icon">
                <path d="M11 18V6l-8.5 6 8.5 6Zm.5-6 8.5 6V6l-8.5 6Z" fill="currentColor" />
              </svg>
              <span className="skip-feedback-text">{seconds} sec</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="skip-feedback-icon">
                <path d="M13 6v12l8.5-6L13 6Zm-.5 6L4 6v12l8.5-6Z" fill="currentColor" />
              </svg>
              <span className="skip-feedback-text">{seconds} sec</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
