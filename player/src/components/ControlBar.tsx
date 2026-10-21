import type { Source, Subtitle } from '../lib/types';

interface Props {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  sources: Source[];
  sourceIndex: number;
  subtitles: Subtitle[];
  subtitleIndex: number;
  speed: number;
  pipSupported: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  onSourceChange: (index: number) => void;
  onSubtitleChange: (index: number) => void;
  onSpeedChange: (speed: number) => void;
  onPiP: () => void;
  onFullscreen: () => void;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function ControlBar({
  playing,
  currentTime,
  duration,
  volume,
  muted,
  sources,
  sourceIndex,
  subtitles,
  subtitleIndex,
  speed,
  pipSupported,
  onTogglePlay,
  onSeek,
  onVolume,
  onToggleMute,
  onSourceChange,
  onSubtitleChange,
  onSpeedChange,
  onPiP,
  onFullscreen,
}: Props) {
  return (
    <div className="controls">
      <input
        className="progress"
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        aria-label="Seek"
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <div className="controls-row">
        <div className="control-group">
          <button type="button" className="icon-button" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5Z" />
              </svg>
            )}
          </button>

          <div className="volume-group">
            <button type="button" className="icon-button" onClick={onToggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted || volume === 0 ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9h4l5-4v14l-5-4H4V9Zm12.5 1.5 4 4m0-4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9h4l5-4v14l-5-4H4V9Z" />
                  <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <input
              className="volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(event) => onVolume(Number(event.target.value))}
            />
          </div>

          <span className="time">
            {formatTime(currentTime)} <span className="time-divider">/</span> {formatTime(duration)}
          </span>
        </div>

        <div className="control-group right">
          {sources.length > 0 && (
            <select
              className="select"
              aria-label="Quality"
              value={sourceIndex}
              onChange={(event) => onSourceChange(Number(event.target.value))}
            >
              {sources.map((source, index) => (
                <option key={`${source.url}-${index}`} value={index}>
                  {source.quality} · {source.provider}
                </option>
              ))}
            </select>
          )}

          <select
            className="select"
            aria-label="Subtitles"
            value={subtitleIndex}
            onChange={(event) => onSubtitleChange(Number(event.target.value))}
            disabled={subtitles.length === 0}
          >
            <option value={-1}>CC off</option>
            {subtitles.map((subtitle, index) => (
              <option key={`${subtitle.url}-${index}`} value={index}>
                {subtitle.label || subtitle.lang}
              </option>
            ))}
          </select>

          <select
            className="select speed"
            aria-label="Playback speed"
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>

          {pipSupported && (
            <button type="button" className="icon-button" onClick={onPiP} aria-label="Picture in picture">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                <rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" />
              </svg>
            </button>
          )}

          <button type="button" className="icon-button" onClick={onFullscreen} aria-label="Fullscreen">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
