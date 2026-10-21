'use client';

import Hls from 'hls.js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { fetchBranding, fetchStream } from '../lib/api';
import { getFingerprint } from '../lib/fingerprint';
import {
  autoQualityCap,
  capLevelIndex,
  connectionHint,
  initialBandwidthEstimate,
  levelLabel,
  preferredSourceIndex,
  sortLevelsDescending,
  type HlsLevelLike,
} from '../lib/quality';
import { calculateBufferedRanges, clamp, type BufferedRange } from '../lib/time';
import { DEFAULT_BRANDING, type Branding, type Media, type StreamResponse } from '../lib/types';
import { AmbientBackground } from './AmbientBackground';
import { CenterFeedback } from './CenterFeedback';
import { ControlBar, type QualityOption } from './ControlBar';
import { ErrorState } from './ErrorState';
import { LoadingSkeleton } from './LoadingSkeleton';
import { MobileGestureLayer } from './MobileGestureLayer';
import { MobilePlayerControls } from './MobilePlayerControls';
import { PlayerHeader } from './PlayerHeader';
import { SkipFeedback } from './SkipFeedback';

interface Props {
  apiBase: string;
  media: Media;
}

type Status = 'loading' | 'ready' | 'error';

interface LevelOption extends HlsLevelLike {
  index: number;
}

export function Player({ apiBase, media }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [payload, setPayload] = useState<StreamResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState({ token: 0, invalidate: false });

  const [sourceIndex, setSourceIndex] = useState(0);
  const [sourceNonce, setSourceNonce] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState<BufferedRange[]>([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [subtitleIndex, setSubtitleIndex] = useState(-1);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [hlsLevels, setHlsLevels] = useState<LevelOption[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [currentAutoLevel, setCurrentAutoLevel] = useState<number | null>(null);

  // Inactivity / Auto-hide controls state
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Center & Skip Feedback state
  const [centerFeedback, setCenterFeedback] = useState<{ action: 'play' | 'pause' | null; nonce: number }>({
    action: null,
    nonce: 0,
  });
  const [skipFeedback, setSkipFeedback] = useState<{ direction: 'backward' | 'forward' | null; seconds: number; nonce: number }>({
    direction: null,
    seconds: 0,
    nonce: 0,
  });
  const skipFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const skipFeedbackStateRef = useRef<{ direction: 'backward' | 'forward' | null; seconds: number; time: number }>({
    direction: null,
    seconds: 0,
    time: 0,
  });

  const speedRef = useRef(speed);
  speedRef.current = speed;

  const source = payload?.sources[sourceIndex];

  // Auto-hide controls helper
  const resetInactivityTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (!isScrubbing) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2500);
    }
  }, [isScrubbing]);

  const showControlsBriefly = useCallback(() => {
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  useEffect(() => {
    if (!playing || isScrubbing) {
      setControlsVisible(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    } else {
      resetInactivityTimer();
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [playing, isScrubbing, resetInactivityTimer]);

  useEffect(() => {
    const controller = new AbortController();
    fetchBranding(apiBase, controller.signal).then(setBranding).catch(() => undefined);
    return () => controller.abort();
  }, [apiBase]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    setPayload(null);
    setSourceIndex(0);
    setFailedCount(0);
    setSubtitleIndex(-1);
    setNextCountdown(null);
    setSelectedLevel(null);
    setCurrentAutoLevel(null);
    setHlsLevels([]);
    setBufferedRanges([]);

    (async () => {
      try {
        const fingerprint = await getFingerprint();
        const data = await fetchStream(apiBase, media, fingerprint, {
          invalidate: request.invalidate,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setPayload(data);
        const initialIndex = preferredSourceIndex(data.sources, connectionHint());
        setSourceIndex(initialIndex);
        if (data.sources.length === 0) {
          setStatus('error');
          setError('No playable sources were returned for this title.');
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Could not load the stream.');
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, media.type, media.id, media.season, media.episode, request]);

  useEffect(() => {
    if (!payload) return;
    document.title = `${payload.title}${payload.year ? ` (${payload.year})` : ''} — ${branding.name}`;
  }, [payload, branding.name]);

  const updateBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const ranges = calculateBufferedRanges(video.buffered, video.duration);
    setBufferedRanges(ranges);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    setStatus('loading');
    setError(null);
    setHlsLevels([]);
    setSelectedLevel(null);
    setCurrentAutoLevel(null);
    setBufferedRanges([]);
    let hls: Hls | null = null;
    let ready = false;

    const applyPendingSeek = () => {
      if (pendingSeekRef.current === null || video.readyState < 1) return;
      video.currentTime = pendingSeekRef.current;
      pendingSeekRef.current = null;
    };

    const markReady = () => {
      if (ready) return;
      ready = true;
      applyPendingSeek();
      video.playbackRate = speedRef.current;
      setStatus('ready');
      updateBuffered();
      video.play().catch(() => setNeedsInteraction(true));
    };

    const fail = (message: string) => {
      setStatus('error');
      setError(message);
      setPlaying(false);
    };

    const onConnectionChange = () => {
      const activeHls = hlsRef.current;
      if (!activeHls) return;
      const cap = autoQualityCap(connectionHint());
      if (cap !== null && activeHls.levels?.length) {
        const capIndex = capLevelIndex(activeHls.levels, cap);
        if (capIndex >= 0) {
          activeHls.autoLevelCapping = capIndex;
          return;
        }
      }
      activeHls.autoLevelCapping = -1;
    };

    const navConnection =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { connection?: EventTarget }).connection
        : null;

    if (Hls.isSupported()) {
      const connection = connectionHint();
      const estimate = initialBandwidthEstimate(connection);
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        startLevel: -1,
        ...(estimate ? { abrEwmaDefaultEstimate: estimate } : {}),
      });
      hlsRef.current = hls;
      hls.loadSource(source.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const activeHls = hls;
        if (!activeHls) return;
        const levels = activeHls.levels.map((level, index) => ({
          index,
          width: level.width,
          height: level.height,
          bitrate: level.bitrate,
        }));
        setHlsLevels(levels);
        const cap = autoQualityCap(connection);
        if (cap !== null) {
          const capIndex = capLevelIndex(levels, cap);
          if (capIndex >= 0) activeHls.autoLevelCapping = capIndex;
        }
        markReady();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentAutoLevel(data.level);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        fail(`Playback failed: ${data.details}`);
      });
      navConnection?.addEventListener?.('change', onConnectionChange);
    } else {
      video.src = source.url;
    }

    const onLoadedMetadata = () => {
      applyPendingSeek();
      updateBuffered();
      markReady();
    };
    const onVideoError = () => fail(video.error?.message ?? 'The video element could not play this source.');
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onVideoError);

    return () => {
      navConnection?.removeEventListener?.('change', onConnectionChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onVideoError);
      hls?.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
      setPlaying(false);
    };
  }, [source, sourceNonce, updateBuffered]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      setCurrentTime(video.currentTime);
      updateBuffered();
    };
    const onDuration = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      updateBuffered();
    };
    const onPlay = () => {
      setPlaying(true);
      setNeedsInteraction(false);
      setStatus('ready');
    };
    const onPause = () => setPlaying(false);
    const onVolume = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onEnded = () => {
      setPlaying(false);
      if (media.type === 'tv') setNextCountdown(5);
    };

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('progress', updateBuffered);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('progress', updateBuffered);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('ended', onEnded);
    };
  }, [media.type, updateBuffered]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let index = 0; index < tracks.length; index += 1) {
      tracks[index].mode = index === subtitleIndex ? 'showing' : 'disabled';
    }
  }, [subtitleIndex, payload?.subtitles.length, status]);

  useEffect(() => {
    if (nextCountdown === null) return;
    if (nextCountdown <= 0) {
      router.push(`/tv/${media.id}/${media.season ?? 1}/${(media.episode ?? 1) + 1}`);
      return;
    }
    const timer = setTimeout(() => setNextCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [nextCountdown, router, media.id, media.season, media.episode]);

  const capturePosition = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 1) return;
    if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
      pendingSeekRef.current = video.currentTime;
    }
  }, []);

  const reload = useCallback(
    (invalidate: boolean) => {
      capturePosition();
      setSourceIndex(0);
      setFailedCount(0);
      setSelectedLevel(null);
      setRequest((previous) => ({ token: previous.token + 1, invalidate }));
    },
    [capturePosition],
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      video.play().catch(() => setNeedsInteraction(true));
      setCenterFeedback({ action: 'play', nonce: Date.now() });
    } else {
      video.pause();
      setCenterFeedback({ action: 'pause', nonce: Date.now() });
    }
    showControlsBriefly();
  }, [showControlsBriefly]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
    showControlsBriefly();
  }, [showControlsBriefly]);

  const skip = useCallback((deltaSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    const target = clamp(current + deltaSeconds, 0, dur);
    video.currentTime = target;
    setCurrentTime(target);

    // Trigger directional skip feedback with stacking
    const direction = deltaSeconds < 0 ? 'backward' : 'forward';
    const now = Date.now();
    const isConsecutive =
      skipFeedbackTimerRef.current !== null &&
      skipFeedbackStateRef.current.direction === direction &&
      now - skipFeedbackStateRef.current.time < 800;

    const seconds = isConsecutive ? skipFeedbackStateRef.current.seconds + 10 : 10;
    skipFeedbackStateRef.current = { direction, seconds, time: now };
    setSkipFeedback({ direction, seconds, nonce: now });

    if (skipFeedbackTimerRef.current) clearTimeout(skipFeedbackTimerRef.current);
    skipFeedbackTimerRef.current = setTimeout(() => {
      setSkipFeedback({ direction: null, seconds: 0, nonce: 0 });
      skipFeedbackTimerRef.current = null;
    }, 850);

    showControlsBriefly();
  }, [showControlsBriefly]);

  const changeVolume = useCallback((next: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
    showControlsBriefly();
  }, [showControlsBriefly]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    showControlsBriefly();
  }, [showControlsBriefly]);

  const changeSource = useCallback(
    (index: number) => {
      capturePosition();
      setSourceIndex(index);
      setFailedCount(0);
      setSelectedLevel(null);
      setSourceNonce((value) => value + 1);
    },
    [capturePosition],
  );

  const tryAnotherSource = useCallback(() => {
    if (!payload || payload.sources.length <= 1) {
      reload(true);
      return;
    }
    if (failedCount + 1 >= payload.sources.length) {
      reload(true);
      return;
    }
    capturePosition();
    setFailedCount((value) => value + 1);
    setSourceIndex((value) => (value + 1) % payload.sources.length);
    setSelectedLevel(null);
    setSourceNonce((value) => value + 1);
  }, [capturePosition, failedCount, payload, reload]);

  const changeQuality = useCallback(
    (value: string) => {
      if (value === 'auto') {
        setSelectedLevel(null);
        const hls = hlsRef.current;
        if (hls) {
          hls.currentLevel = -1;
          hls.nextLevel = -1;
        }
        if (payload) {
          const adaptiveIndex = payload.sources.findIndex((item) => item.adaptive);
          if (adaptiveIndex >= 0 && !payload.sources[sourceIndex]?.adaptive) {
            changeSource(adaptiveIndex);
          }
        }
        showControlsBriefly();
        return;
      }

      if (value.startsWith('level:')) {
        const level = Number.parseInt(value.slice(6), 10);
        if (!Number.isInteger(level)) return;
        setSelectedLevel(level);
        if (hlsRef.current) hlsRef.current.currentLevel = level;
        showControlsBriefly();
        return;
      }

      if (value.startsWith('source:')) {
        const index = Number.parseInt(value.slice(7), 10);
        if (!Number.isInteger(index)) return;
        changeSource(index);
        showControlsBriefly();
      }
    },
    [changeSource, payload, sourceIndex, showControlsBriefly],
  );

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Browser refused PiP
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.requestFullscreen();
    } catch {
      // Fullscreen can be blocked by iframe permissions
    }
  }, []);

  useEffect(() => {
    setPipSupported(typeof document !== 'undefined' && document.pictureInPictureEnabled);
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isEditable =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        (document.activeElement as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if (event.key === ' ' || event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft' || event.key === 'j' || event.key === 'J') {
        event.preventDefault();
        skip(-10);
      } else if (event.key === 'ArrowRight' || event.key === 'l' || event.key === 'L') {
        event.preventDefault();
        skip(10);
      } else if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        toggleMute();
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skip, toggleMute, toggleFullscreen]);

  const style = { '--accent': branding.accentColor } as CSSProperties;
  const episodeLabel = media.type === 'tv' ? `S${media.season ?? 1} • E${media.episode ?? 1}` : undefined;

  const adaptiveAvailable = payload?.sources.some((item) => item.adaptive) ?? false;
  const showLevels = source?.adaptive === true && hlsLevels.length > 0;
  const qualityOptions: QualityOption[] = [];
  const seenQualities = new Set<string>();

  if (adaptiveAvailable) {
    const activeLevel =
      selectedLevel === null && currentAutoLevel !== null && hlsLevels[currentAutoLevel]
        ? hlsLevels[currentAutoLevel]
        : null;
    const activeLabel = activeLevel ? levelLabel(activeLevel) : null;
    qualityOptions.push({
      value: 'auto',
      label: activeLabel ? `Auto (${activeLabel})` : 'Auto',
    });
  }

  if (showLevels) {
    const sortedLevels = sortLevelsDescending(hlsLevels);
    for (const level of sortedLevels) {
      const label = levelLabel(level);
      if (seenQualities.has(label)) continue;
      seenQualities.add(label);
      qualityOptions.push({ value: `level:${level.index}`, label });
    }
  } else if (payload) {
    payload.sources.forEach((item, index) => {
      if (item.adaptive || seenQualities.has(item.quality)) return;
      seenQualities.add(item.quality);
      qualityOptions.push({ value: `source:${index}`, label: item.quality });
    });
  }

  const qualityValue =
    showLevels && selectedLevel !== null
      ? `level:${selectedLevel}`
      : source?.adaptive
        ? 'auto'
        : `source:${sourceIndex}`;

  return (
    <div
      ref={containerRef}
      className={`player-root ${controlsVisible ? 'controls-active' : 'controls-inactive'} ${isFullscreen ? 'fullscreen-mode' : ''}`}
      style={style}
      onPointerMove={showControlsBriefly}
      onClick={showControlsBriefly}
    >
      {/* Ambient background glow */}
      <AmbientBackground accentColor={branding.accentColor} />

      <video
        ref={videoRef}
        className="player-video"
        playsInline
        autoPlay
        crossOrigin="anonymous"
      >
        {payload?.subtitles.map((subtitle, index) => (
          <track
            key={`${subtitle.url}-${index}`}
            kind="subtitles"
            src={subtitle.url}
            srcLang={subtitle.lang}
            label={subtitle.label || subtitle.lang}
          />
        ))}
      </video>

      {/* Touch and Double-Tap Gesture Surface */}
      <MobileGestureLayer
        onSingleTap={() => {
          if (!controlsVisible) setControlsVisible(true);
          else togglePlay();
        }}
        onDoubleTapLeft={() => skip(-10)}
        onDoubleTapRight={() => skip(10)}
      />

      {/* Top & Bottom Cinematic Vignette Scrims */}
      <div className={`player-vignette-scrim ${controlsVisible ? 'visible' : 'hidden'}`} aria-hidden="true" />

      {/* Top Header Bar */}
      <PlayerHeader
        branding={branding}
        title={payload?.title}
        subtitle={episodeLabel}
        visible={controlsVisible}
      />

      {/* Center Feedback Animation */}
      <CenterFeedback action={centerFeedback.action} feedbackNonce={centerFeedback.nonce} />

      {/* Directional Skip Ripple Feedback */}
      <SkipFeedback
        direction={skipFeedback.direction}
        seconds={skipFeedback.seconds}
        nonce={skipFeedback.nonce}
      />

      {/* Loading Skeleton */}
      {status === 'loading' && (
        <LoadingSkeleton
          branding={branding}
          label={payload ? 'Preparing stream…' : 'Fetching sources…'}
        />
      )}

      {/* Error Overlay */}
      {status === 'error' && (
        <ErrorState
          title="Stream unavailable"
          message={error ?? 'Something went wrong while loading this title.'}
          diagnostics={payload?.diagnostics}
          onTryAnother={tryAnotherSource}
          onReload={() => reload(true)}
        />
      )}

      {/* Up Next Layer for Series */}
      {nextCountdown !== null && (
        <div className="next-layer">
          <div className="next-card">
            <p className="next-kicker">Up next</p>
            <h3>Episode {(media.episode ?? 1) + 1}</h3>
            <p>Playing in {nextCountdown}s</p>
            <div className="next-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => router.push(`/tv/${media.id}/${media.season ?? 1}/${(media.episode ?? 1) + 1}`)}
              >
                Play now
              </button>
              <button type="button" className="button ghost" onClick={() => setNextCountdown(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controls: Desktop and Mobile Layouts */}
      {payload && status !== 'error' && (
        <>
          <ControlBar
            playing={playing}
            currentTime={currentTime}
            duration={duration}
            bufferedRanges={bufferedRanges}
            volume={volume}
            muted={muted}
            qualityOptions={qualityOptions}
            qualityValue={qualityValue}
            subtitles={payload.subtitles}
            subtitleIndex={subtitleIndex}
            speed={speed}
            pipSupported={pipSupported}
            isFullscreen={isFullscreen}
            visible={controlsVisible}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onSkip={skip}
            onVolume={changeVolume}
            onToggleMute={toggleMute}
            onQualityChange={changeQuality}
            onSubtitleChange={setSubtitleIndex}
            onSpeedChange={setSpeed}
            onPiP={togglePiP}
            onFullscreen={toggleFullscreen}
            onScrubbingChange={setIsScrubbing}
          />

          <MobilePlayerControls
            playing={playing}
            currentTime={currentTime}
            duration={duration}
            bufferedRanges={bufferedRanges}
            muted={muted}
            qualityOptions={qualityOptions}
            qualityValue={qualityValue}
            subtitles={payload.subtitles}
            subtitleIndex={subtitleIndex}
            speed={speed}
            isFullscreen={isFullscreen}
            visible={controlsVisible}
            title={payload.title}
            subtitle={episodeLabel}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onSkip={skip}
            onToggleMute={toggleMute}
            onQualityChange={changeQuality}
            onSubtitleChange={setSubtitleIndex}
            onSpeedChange={setSpeed}
            onFullscreen={toggleFullscreen}
            onScrubbingChange={setIsScrubbing}
          />
        </>
      )}
    </div>
  );
}
