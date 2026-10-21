import type { Diagnostic } from '../lib/types';

interface Props {
  title: string;
  message: string;
  diagnostics?: Diagnostic[];
  onTryAnother: () => void;
  onReload: () => void;
}

export function ErrorState({ title, message, diagnostics, onTryAnother, onReload }: Props) {
  const failures = (diagnostics ?? []).filter((item) => !item.ok);

  return (
    <div className="error-layer" role="alert">
      <div className="error-card">
        <span className="error-mark">!</span>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="error-actions">
          <button type="button" className="button primary" onClick={onTryAnother}>
            Try another source
          </button>
          <button type="button" className="button ghost" onClick={onReload}>
            Reload stream
          </button>
        </div>
        {failures.length > 0 && (
          <details className="diagnostics">
            <summary>Provider diagnostics</summary>
            <ul>
              {failures.map((failure) => (
                <li key={`${failure.provider}-${failure.latencyMs}`}>
                  <strong>{failure.provider}</strong> — {failure.error ?? 'failed'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
