import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateBufferedRanges, clamp, formatTime } from '../src/lib/time.js';

describe('formatTime', () => {
  it('formats short times as mm:ss', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(5), '0:05');
    assert.equal(formatTime(65), '1:05');
    assert.equal(formatTime(599), '9:59');
    assert.equal(formatTime(3599), '59:59');
  });

  it('formats long times as h:mm:ss', () => {
    assert.equal(formatTime(3600), '1:00:00');
    assert.equal(formatTime(3665), '1:01:05');
    assert.equal(formatTime(7325), '2:02:05');
  });

  it('supports forceHours flag', () => {
    assert.equal(formatTime(45, true), '0:00:45');
    assert.equal(formatTime(600, true), '0:10:00');
  });

  it('handles negative, NaN, and infinite inputs safely', () => {
    assert.equal(formatTime(-10), '0:00');
    assert.equal(formatTime(Number.NaN), '0:00');
    assert.equal(formatTime(Number.POSITIVE_INFINITY), '0:00');
  });
});

describe('calculateBufferedRanges', () => {
  it('handles empty or zero-duration inputs', () => {
    assert.deepEqual(calculateBufferedRanges(null, 100), []);
    assert.deepEqual(calculateBufferedRanges({ length: 0, start: () => 0, end: () => 0 }, 100), []);
    assert.deepEqual(calculateBufferedRanges({ length: 1, start: () => 0, end: () => 50 }, 0), []);
    assert.deepEqual(calculateBufferedRanges({ length: 1, start: () => 0, end: () => 50 }, -10), []);
  });

  it('correctly maps multiple disjoint TimeRanges into percentages', () => {
    // Range 1: 0s to 35s in a 100s video -> 0% to 35% (width 35%)
    // Range 2: 60s to 75s in a 100s video -> 60% to 75% (width 15%)
    const fakeTimeRanges = {
      length: 2,
      start: (i: number) => (i === 0 ? 0 : 60),
      end: (i: number) => (i === 0 ? 35 : 75),
    };

    const result = calculateBufferedRanges(fakeTimeRanges, 100);
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { start: 0, end: 35, startPct: 0, widthPct: 35 });
    assert.deepEqual(result[1], { start: 60, end: 75, startPct: 60, widthPct: 15 });
  });

  it('clamps ranges that exceed the media duration', () => {
    const fakeTimeRanges = {
      length: 1,
      start: (i: number) => 0,
      end: (i: number) => 120,
    };
    const result = calculateBufferedRanges(fakeTimeRanges, 100);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], { start: 0, end: 100, startPct: 0, widthPct: 100 });
  });
});

describe('clamp', () => {
  it('clamps values within bounds', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(15, 0, 10), 10);
    assert.equal(clamp(Number.NaN, 0, 10), 0);
  });
});
