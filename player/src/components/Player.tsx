'use client';

import Hls from 'hls.js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { fetchBranding, fetchStream } from '../lib/api';
import { getFingerprint } from '../lib/fingerprint';
import { DEFAULT_BRANDING, type Branding, type Media, type StreamResponse } from '../lib/types';
import { BrandOverlay } from './BrandOverlay';
import { ControlBar } from './ControlBar';
import { ErrorState } from './ErrorState';
import { LoadingSkeleton } from './LoadingSkeleton';

interface Props {
  apiBase: string;
  media: Media;
}

type Status = 'loading' | 'ready' | 'error';

export function Player({ apiBase, media }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [subtitleIndex, setSubtitleIndex] = useState(-1);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [pipSupported, setPipSupported] = useState(false);

  const speedRef = useRef(speed);
  speedRef.current = speed;

  const source = payload?.sources[sourceIndex];

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

    (async () => {
      try {
        const fingerprint = await getFingerprint();
        const data = await fetchStream(apiBase, media, fingerprint, {
          invalidate: request.invalidate,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setPayload(data);
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    setStatus('loading');
    setError(null);
    let hls: Hls | null = null;
    let ready = false;

    const markReady = () => {
      if (ready) return;
      ready = true;
      video.playbackRate = speedRef.current;
      setStatus('ready');
      video.play().catch(() => setNeedsInteraction(true));
    };

    const fail = (message: string) => {
      setStatus('error');
      setError(message);
      setPlaying(false);
    };

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.loadSource(source.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, markReady);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        fail(`Playback failed: ${data.details}`);
      });
    } else {
      video.src = source.url;
    }

    const onLoadedMetadata = () => markReady();
    const onVideoError = () => fail(video.error?.message ?? 'The video element could not play this source.');
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onVideoError);

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onVideoError);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
      setPlaying(false);
    };
  }, [source, sourceNonce]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => setCurrentTime(video.currentTime);
    const onDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
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
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('ended', onEnded);
    };
  }, [media.type]);

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

  const reload = useCallback((invalidate: boolean) => {
    setSourceIndex(0);
    setFailedCount(0);
    setRequest((previous) => ({ token: previous.token + 1, invalidate }));
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      video.play().catch(() => setNeedsInteraction(true));
    } else {
      video.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  }, []);

  const changeVolume = useCallback((next: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const changeSource = useCallback(
    (index: number) => {
      setSourceIndex(index);
      setFailedCount(0);
      setSourceNonce((value) => value + 1);
    },
    [],
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
    setFailedCount((value) => value + 1);
    setSourceIndex((value) => (value + 1) % payload.sources.length);
    setSourceNonce((value) => value + 1);
  }, [failedCount, payload, reload]);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Browser refused PiP; nothing else to do.
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.requestFullscreen();
    } catch {
      // Fullscreen can be blocked by iframe permissions.
    }
  }, []);

  useEffect(() => {
    setPipSupported(typeof document !== 'undefined' && document.pictureInPictureEnabled);
  }, []);

  const style = { '--accent': branding.accentColor } as CSSProperties;
  const episodeLabel = media.type === 'tv' ? `S${media.season ?? 1} E${media.episode ?? 1}` : undefined;

  return (
    <div ref={containerRef} className="player-root" style={style}>
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        autoPlay
        crossOrigin="anonymous"
        onClick={togglePlay}
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

      <div className="player-shade" />

      <BrandOverlay
        branding={branding}
        title={payload?.title}
        subtitle={episodeLabel}
      />

      {status === 'loading' && (
        <LoadingSkeleton
          branding={branding}
          label={payload ? 'Preparing stream…' : 'Fetching sources…'}
        />
      )}

      {status === 'error' && (
        <ErrorState
          title="Stream unavailable"
          message={error ?? 'Something went wrong while loading this title.'}
          diagnostics={payload?.diagnostics ?? []}
          onTryAnother={tryAnotherSource}
          onReload={() => reload(true)}
        />
      )}

      {status === 'ready' && !playing && !nextCountdown && (
        <button type="button" className="center-play" onClick={togglePlay} aria-label="Play">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5Z" />
          </svg>
        </button>
      )}

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

      {payload && status !== 'error' && (
        <ControlBar
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          muted={muted}
          sources={payload.sources}
          sourceIndex={sourceIndex}
          subtitles={payload.subtitles}
          subtitleIndex={subtitleIndex}
          speed={speed}
          pipSupported={pipSupported}
          onTogglePlay={togglePlay}
          onSeek={seek}
          onVolume={changeVolume}
          onToggleMute={toggleMute}
          onSourceChange={changeSource}
          onSubtitleChange={setSubtitleIndex}
          onSpeedChange={setSpeed}
          onPiP={togglePiP}
          onFullscreen={toggleFullscreen}
        />
      )}
    </div>
  );
}
