import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  autoQualityCap,
  capLevelIndex,
  initialBandwidthEstimate,
  levelLabel,
  parseQualityHeight,
  preferredSourceIndex,
  sortLevelsDescending,
  type HlsLevelLike,
  type NetworkInformationLike,
} from '../src/lib/quality.js';

describe('initialBandwidthEstimate', () => {
  it('returns undefined without a connection hint', () => {
    assert.equal(initialBandwidthEstimate(null), undefined);
  });

  it('honours data saver', () => {
    assert.equal(initialBandwidthEstimate({ saveData: true, downlink: 20 }), 500_000);
  });

  it('maps slow effective types to conservative estimates', () => {
    assert.equal(initialBandwidthEstimate({ effectiveType: '2g' }), 400_000);
    assert.equal(initialBandwidthEstimate({ effectiveType: '3g' }), 1_200_000);
  });

  it('uses downlink with headroom', () => {
    assert.equal(initialBandwidthEstimate({ downlink: 10 }), 8_000_000);
  });
});

describe('autoQualityCap', () => {
  it('caps data saver and slow connections', () => {
    assert.equal(autoQualityCap({ saveData: true }), 720);
    assert.equal(autoQualityCap({ effectiveType: '2g' }), 360);
    assert.equal(autoQualityCap({ effectiveType: '3g' }), 720);
    assert.equal(autoQualityCap({ downlink: 50 }), null);
  });
});

describe('capLevelIndex', () => {
  const levels: HlsLevelLike[] = [
    { width: 640, height: 360, bitrate: 500_000 },
    { width: 1280, height: 720, bitrate: 1_500_000 },
    { width: 1920, height: 1080, bitrate: 3_000_000 },
  ];

  it('returns the highest level at or below the cap', () => {
    assert.equal(capLevelIndex(levels, 720), 1);
    assert.equal(capLevelIndex(levels, 480), 0);
    assert.equal(capLevelIndex(levels, 2000), 2);
    assert.equal(capLevelIndex([], 720), -1);
  });
});

describe('levelLabel', () => {
  it('maps cinematic frame widths to standard quality names', () => {
    assert.equal(levelLabel({ width: 640, height: 266, bitrate: 700_000 }), '360p');
    assert.equal(levelLabel({ width: 1280, height: 534, bitrate: 2_700_000 }), '720p');
    assert.equal(levelLabel({ width: 1920, height: 800, bitrate: 4_500_000 }), '1080p');
  });

  it('falls back to height or bitrate when width is unavailable', () => {
    assert.equal(levelLabel({ width: 0, height: 1080, bitrate: 3_000_000 }), '1080p');
    assert.equal(levelLabel({ width: 0, height: 0, bitrate: 2_500_000 }), '2500 kbps');
  });
});

describe('parseQualityHeight', () => {
  it('parses typical resolution strings', () => {
    assert.equal(parseQualityHeight('1080p'), 1080);
    assert.equal(parseQualityHeight('720P'), 720);
    assert.equal(parseQualityHeight('480'), 480);
    assert.equal(parseQualityHeight('4k'), 2160);
    assert.equal(parseQualityHeight('auto'), 0);
    assert.equal(parseQualityHeight(''), 0);
  });
});

describe('preferredSourceIndex', () => {
  it('prefers adaptive source when present', () => {
    const sources = [
      { quality: '1080p', adaptive: false },
      { quality: 'auto', adaptive: true },
      { quality: '720p', adaptive: false },
    ];
    assert.equal(preferredSourceIndex(sources), 1);
  });

  it('selects best quality within connection cap when no adaptive source exists', () => {
    const sources = [
      { quality: '1080p', adaptive: false },
      { quality: '720p', adaptive: false },
      { quality: '360p', adaptive: false },
    ];
    // 2g connection caps at 360p
    assert.equal(preferredSourceIndex(sources, { effectiveType: '2g' }), 2);
    // 3g connection caps at 720p
    assert.equal(preferredSourceIndex(sources, { effectiveType: '3g' }), 1);
  });

  it('defaults to index 0 on high speed or empty inputs', () => {
    const sources = [
      { quality: '1080p', adaptive: false },
      { quality: '720p', adaptive: false },
    ];
    assert.equal(preferredSourceIndex(sources, { downlink: 100 }), 0);
    assert.equal(preferredSourceIndex([]), 0);
  });
});

describe('sortLevelsDescending', () => {
  it('sorts levels from highest resolution to lowest', () => {
    const levels: (HlsLevelLike & { index: number })[] = [
      { index: 0, width: 640, height: 360, bitrate: 500_000 },
      { index: 1, width: 1920, height: 1080, bitrate: 4_000_000 },
      { index: 2, width: 1280, height: 720, bitrate: 2_000_000 },
    ];
    const sorted = sortLevelsDescending(levels);
    assert.deepEqual(
      sorted.map((level) => level.index),
      [1, 2, 0],
    );
  });
});
