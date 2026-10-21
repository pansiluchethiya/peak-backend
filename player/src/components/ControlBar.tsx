'use client';

import { useState } from 'react';
import { formatTime, type BufferedRange } from '../lib/time';
import type { Subtitle } from '../lib/types';
import { ProgressBar } from './ProgressBar';
import { SettingsMenu, type SettingsTab } from './SettingsMenu';

export interface QualityOption {
  value: string;
  label: string;
}

interface Props {
  playing: boolean;
  currentTime: number;
  duration: number;
  bufferedRanges: BufferedRange[];
  volume: number;
  muted: boolean;
  qualityOptions: QualityOption[];
  qualityValue: string;
  subtitles: Subtitle[];
  subtitleIndex: number;
  speed: number;
  pipSupported: boolean;
  isFullscreen: boolean;
  visible: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  onQualityChange: (value: string) => void;
  onSubtitleChange: (index: number) => void;
  onSpeedChange: (speed: number) => void;
  onPiP: () => void;
  onFullscreen: () => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  getThumbnailUrl?: (time: number) => string | undefined;
}

export function ControlBar({
  playing,
  currentTime,
  duration,
  bufferedRanges,
  volume,
  muted,
  qualityOptions,
  qualityValue,
  subtitles,
  subtitleIndex,
  speed,
  pipSupported,
  isFullscreen,
  visible,
  onTogglePlay,
  onSeek,
  onSkip,
  onVolume,
  onToggleMute,
  onQualityChange,
  onSubtitleChange,
  onSpeedChange,
  onPiP,
  onFullscreen,
  onScrubbingChange,
  getThumbnailUrl,
}: Props) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('main');

  const openSettings = (tab: SettingsTab = 'main') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const forceHours = duration >= 3600;
  const currentFormatted = formatTime(currentTime, forceHours);
  const durationFormatted = formatTime(duration, forceHours);

  // Quality badge label e.g. "1080p" or "Auto"
  const currentQualityOption = qualityOptions.find((opt) => opt.value === qualityValue);
  let qualityBadge = currentQualityOption?.label || 'Auto';
  if (qualityBadge.startsWith('Auto (')) {
    qualityBadge = qualityBadge.slice(6, -1);
  }

  return (
    <div
      className={`controls-bar-desktop ${visible ? 'visible' : 'hidden'}`}
      role="region"
      aria-label="Player controls"
    >
      {/* Settings Menu Popup */}
      <SettingsMenu
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsTab}
        speed={speed}
        onSpeedChange={onSpeedChange}
        qualityOptions={qualityOptions}
        qualityValue={qualityValue}
        onQualityChange={onQualityChange}
        subtitles={subtitles}
        subtitleIndex={subtitleIndex}
        onSubtitleChange={onSubtitleChange}
      />

      {/* Multi-layer Progress Bar */}
      <div className="controls-progress-wrapper">
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          bufferedRanges={bufferedRanges}
          onSeek={onSeek}
          onScrubbingChange={onScrubbingChange}
          getThumbnailUrl={getThumbnailUrl}
        />
      </div>

      <div className="controls-actions-row">
        {/* Left Control Group */}
        <div className="controls-group-left">
          {/* Play / Pause */}
          <button
            type="button"
            className="ctrl-btn main-play"
            onClick={onTogglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="ctrl-icon">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="ctrl-icon">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5Z" />
              </svg>
            )}
          </button>

          {/* Skip Back 10s */}
          <button
            type="button"
            className="ctrl-btn skip-btn"
            onClick={() => onSkip(-10)}
            aria-label="Rewind 10 seconds"
          >
            <svg viewBox="0 0 24 24" className="ctrl-icon">
              <path d="M12.5 3C17.15 3 21 6.85 21 11.5c0 4.65-3.85 8.5-8.5 8.5-4.65 0-8.5-3.85-8.5-8.5 0-2.3 0.93-4.38 2.45-5.9L4 3.18V8h4.82L6.87 6.05C8.31 4.77 10.28 4 12.5 4c4.14 0 7.5 3.36 7.5 7.5S16.64 19 12.5 19 5 15.64 5 11.5H3C3 16.75 7.25 21 12.5 21S22 16.75 22 11.5 17.75 2 12.5 2V3Z" />
              <text x="12.5" y="15" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">
                10
              </text>
            </svg>
          </button>

          {/* Skip Forward 10s */}
          <button
            type="button"
            className="ctrl-btn skip-btn"
            onClick={() => onSkip(10)}
            aria-label="Forward 10 seconds"
          >
            <svg viewBox="0 0 24 24" className="ctrl-icon">
              <path d="M11.5 3C6.85 3 3 6.85 3 11.5 3 16.15 6.85 20 11.5 20c4.65 0 8.5-3.85 8.5-8.5 0-2.3-0.93-4.38-2.45-5.9L20 3.18V8h-4.82l1.95-1.95C15.69 4.77 13.72 4 11.5 4 7.36 4 4 7.36 4 11.5S7.36 19 11.5 19 19 15.64 19 11.5h2C21 16.75 16.75 21 11.5 21S2 16.75 2 11.5 6.25 2 11.5 2V3Z" />
              <text x="11.5" y="15" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">
                10
              </text>
            </svg>
          </button>

          {/* Volume Control with Hover-Expanding Slider */}
          <div className="volume-slider-container">
            <button
              type="button"
              className="ctrl-btn volume-btn"
              onClick={onToggleMute}
              aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? (
                <svg viewBox="0 0 24 24" className="ctrl-icon">
                  <path d="M3.63 3.63a1 1 0 0 0 0 1.41L7.29 8.7 7 9H4v6h3l5 4V13.41l4.18 4.18c-.65.49-1.38.88-2.18 1.11v2.06a8.99 8.99 0 0 0 3.6-1.76l1.77 1.77a1 1 0 0 0 1.41-1.41L3.63 3.63ZM12 4 9.91 5.67l2.09 2.09V4Zm4.5 7.5c0-.82-.26-1.58-.7-2.22l1.49-1.49A6.97 6.97 0 0 1 18.5 11.5c0 2.21-.99 4.19-2.55 5.51l-1.45-1.45c1.02-.9 1.5-2.23 1.5-4.06Z" />
                </svg>
              ) : volume < 0.5 ? (
                <svg viewBox="0 0 24 24" className="ctrl-icon">
                  <path d="M5 9v6h4l5 5V4L9 9H5Zm9.5 2.5a4.5 4.5 0 0 0-2-3.72v7.44c1.2-.74 2-2.07 2-3.72Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ctrl-icon">
                  <path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02ZM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77Z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              className="volume-slider-range"
              aria-label="Volume slider"
            />
          </div>

          {/* Time Display */}
          <div className="time-display-wrapper">
            <span className="current-time-text">{currentFormatted}</span>
            <span className="time-separator">/</span>
            <span className="duration-time-text">{durationFormatted}</span>
          </div>
        </div>

        {/* Right Control Group */}
        <div className="controls-group-right">
          {/* Subtitles (CC) Button */}
          {subtitles.length > 0 && (
            <button
              type="button"
              className={`ctrl-btn cc-btn ${subtitleIndex !== -1 ? 'active' : ''}`}
              onClick={() => {
                if (subtitles.length === 1) {
                  onSubtitleChange(subtitleIndex === -1 ? 0 : -1);
                } else {
                  openSettings('subtitles');
                }
              }}
              aria-label="Subtitles"
              title="Subtitles"
            >
              <svg viewBox="0 0 24 24" className="ctrl-icon">
                <path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1Zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1Z" />
              </svg>
            </button>
          )}

          {/* Quick Quality Badge Button */}
          {qualityOptions.length > 0 && (
            <button
              type="button"
              className="ctrl-btn quality-badge-btn"
              onClick={() => openSettings('quality')}
              aria-label={`Quality: ${qualityBadge}`}
              title="Quality selection"
            >
              <span className="quality-pill">{qualityBadge}</span>
            </button>
          )}

          {/* Settings Menu Button */}
          <button
            type="button"
            className="ctrl-btn settings-btn"
            onClick={() => openSettings('main')}
            aria-label="Settings"
            title="Settings"
          >
            <svg viewBox="0 0 24 24" className="ctrl-icon">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>

          {/* Picture-in-Picture Button */}
          {pipSupported && (
            <button
              type="button"
              className="ctrl-btn pip-btn"
              onClick={onPiP}
              aria-label="Picture in Picture"
              title="Picture in Picture"
            >
              <svg viewBox="0 0 24 24" className="ctrl-icon">
                <path d="M19 11h-8v6h8v-6zm4 8V5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 0H3V5h18v14z" />
              </svg>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            type="button"
            className="ctrl-btn fullscreen-btn"
            onClick={onFullscreen}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" className="ctrl-icon">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="ctrl-icon">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
