import { describe, expect, it } from 'vitest';
import {
  addGradientStop,
  createGradientColorStopColor,
  createGradientFallbackStops,
  normalizeGradientStops,
  removeGradientStop,
  reverseGradientStops,
} from './index';

const fallback = createGradientFallbackStops('#ffffff', '#000000');

describe('gradient stop normalization', () => {
  it('clamps and stably orders duplicate offsets without mutating input', () => {
    const input = [
      { color: '#333333', offset: 0.8 },
      { color: '#111111', offset: -1, opacity: 2 },
      { color: '#222222', offset: 0.8 },
    ];
    const snapshot = structuredClone(input);

    expect(normalizeGradientStops(input, fallback)).toEqual([
      { color: '#111111', offset: 0, opacity: 1 },
      { color: '#333333', offset: 0.8 },
      { color: '#222222', offset: 0.8 },
    ]);
    expect(input).toEqual(snapshot);
  });

  it('uses detached fallback stops for empty and single-stop input', () => {
    const emptyResult = normalizeGradientStops([], fallback);
    const singleResult = normalizeGradientStops([{ color: '#123456', offset: 0.5 }], fallback);

    expect(emptyResult).toEqual(fallback);
    expect(singleResult).toEqual(fallback);
    expect(emptyResult).not.toBe(fallback);
    expect(emptyResult[0]).not.toBe(fallback[0]);
  });
});

describe('gradient stop operations', () => {
  it('adds, removes, and reverses an ordered stop model', () => {
    const stops = [
      { color: '#111111', offset: 0 },
      { color: '#333333', offset: 1 },
    ];
    const added = addGradientStop(stops, 0, fallback);

    expect(added).toEqual([
      { color: '#111111', offset: 0 },
      { color: '#111111', offset: 0.5 },
      { color: '#333333', offset: 1 },
    ]);
    expect(removeGradientStop(added, 1, fallback)).toEqual(stops);
    expect(reverseGradientStops(added, fallback).map((stop) => stop.offset)).toEqual([0, 0.5, 1]);
  });

  it('keeps CSS color precision and non-hex behavior stable', () => {
    expect(createGradientColorStopColor({ color: '#123456', offset: 0, opacity: 0.333_333 })).toBe(
      'rgba(18, 52, 86, 0.333)'
    );
    expect(createGradientColorStopColor({ color: 'var(--accent)', offset: 0, opacity: 0.5 })).toBe(
      'var(--accent)'
    );
  });
});
