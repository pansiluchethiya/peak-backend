'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Subtitle } from '../lib/types';
import type { QualityOption } from './ControlBar';

export type SettingsTab = 'main' | 'speed' | 'quality' | 'subtitles';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  qualityOptions: QualityOption[];
  qualityValue: string;
  onQualityChange: (value: string) => void;
  subtitles: Subtitle[];
  subtitleIndex: number;
  onSubtitleChange: (index: number) => void;
  initialTab?: SettingsTab;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function SettingsMenu({
  isOpen,
  onClose,
  speed,
  onSpeedChange,
  qualityOptions,
  qualityValue,
  onQualityChange,
  subtitles,
  subtitleIndex,
  onSubtitleChange,
  initialTab = 'main',
}: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Click outside to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isOpen, onClose]);

  // Keyboard navigation: Escape closes menu
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (tab !== 'main' && initialTab === 'main') {
        setTab('main');
      } else {
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  const currentQualityLabel =
    qualityOptions.find((opt) => opt.value === qualityValue)?.label || 'Auto';
  const currentSpeedLabel = speed === 1 ? 'Normal' : `${speed}x`;
  const currentSubtitleLabel =
    subtitleIndex === -1 ? 'Off' : subtitles[subtitleIndex]?.label || 'On';

  return (
    <div
      ref={menuRef}
      className="settings-menu-popup"
      role="dialog"
      aria-label="Settings"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {tab === 'main' && (
        <div className="settings-panel">
          <div className="settings-header">
            <span>Settings</span>
            <button
              type="button"
              className="settings-close-btn"
              onClick={onClose}
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>
          <div className="settings-list">
            <button
              type="button"
              className="settings-item"
              onClick={() => setTab('speed')}
              aria-label="Playback speed"
            >
              <span className="settings-item-label">Playback Speed</span>
              <span className="settings-item-value">
                {currentSpeedLabel}
                <svg viewBox="0 0 24 24" className="settings-arrow">
                  <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41Z" />
                </svg>
              </span>
            </button>

            {qualityOptions.length > 0 && (
              <button
                type="button"
                className="settings-item"
                onClick={() => setTab('quality')}
                aria-label="Quality"
              >
                <span className="settings-item-label">Quality</span>
                <span className="settings-item-value">
                  {currentQualityLabel}
                  <svg viewBox="0 0 24 24" className="settings-arrow">
                    <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41Z" />
                  </svg>
                </span>
              </button>
            )}

            {subtitles.length > 0 && (
              <button
                type="button"
                className="settings-item"
                onClick={() => setTab('subtitles')}
                aria-label="Subtitles"
              >
                <span className="settings-item-label">Subtitles</span>
                <span className="settings-item-value">
                  {currentSubtitleLabel}
                  <svg viewBox="0 0 24 24" className="settings-arrow">
                    <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41Z" />
                  </svg>
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'speed' && (
        <div className="settings-panel">
          <div className="settings-header">
            {initialTab === 'main' ? (
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setTab('main')}
                aria-label="Back to settings"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
                <span>Playback Speed</span>
              </button>
            ) : (
              <span>Playback Speed</span>
            )}
            <button
              type="button"
              className="settings-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="settings-list">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className={`settings-option-item ${speed === s ? 'selected' : ''}`}
                onClick={() => {
                  onSpeedChange(s);
                  onClose();
                }}
              >
                <span className="settings-check">{speed === s ? '✓' : ''}</span>
                <span>{s === 1 ? 'Normal (1x)' : `${s}x`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'quality' && (
        <div className="settings-panel">
          <div className="settings-header">
            {initialTab === 'main' ? (
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setTab('main')}
                aria-label="Back to settings"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
                <span>Quality</span>
              </button>
            ) : (
              <span>Quality</span>
            )}
            <button
              type="button"
              className="settings-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="settings-list">
            {qualityOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`settings-option-item ${qualityValue === opt.value ? 'selected' : ''}`}
                onClick={() => {
                  onQualityChange(opt.value);
                  onClose();
                }}
              >
                <span className="settings-check">{qualityValue === opt.value ? '✓' : ''}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'subtitles' && (
        <div className="settings-panel">
          <div className="settings-header">
            {initialTab === 'main' ? (
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setTab('main')}
                aria-label="Back to settings"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
                <span>Subtitles</span>
              </button>
            ) : (
              <span>Subtitles</span>
            )}
            <button
              type="button"
              className="settings-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="settings-list">
            <button
              type="button"
              className={`settings-option-item ${subtitleIndex === -1 ? 'selected' : ''}`}
              onClick={() => {
                onSubtitleChange(-1);
                onClose();
              }}
            >
              <span className="settings-check">{subtitleIndex === -1 ? '✓' : ''}</span>
              <span>Off</span>
            </button>
            {subtitles.map((sub, idx) => (
              <button
                key={`${sub.url}-${idx}`}
                type="button"
                className={`settings-option-item ${subtitleIndex === idx ? 'selected' : ''}`}
                onClick={() => {
                  onSubtitleChange(idx);
                  onClose();
                }}
              >
                <span className="settings-check">{subtitleIndex === idx ? '✓' : ''}</span>
                <span>{sub.label || sub.lang.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
