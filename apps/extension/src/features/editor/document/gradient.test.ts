import { describe, expect, it } from 'vitest';
import {
  addEditorGradientStop,
  createEditorGradientCssStops,
  createEditorGradientFallbackStops,
  normalizeEditorGradientColorList,
  normalizeEditorGradientStops,
  removeEditorGradientStop,
  reverseEditorGradientStops,
} from './gradient';
import {
  createEditorFrameGradientCss,
  createEditorFrameGradientPatch,
  normalizeEditorFrameGradientStops,
  normalizeEditorFrameGradientColorStops,
} from './frame-gradient';

describe('editor-document/gradient', () => {
  registerGradientStopNormalizationTests();
  registerGradientStopMutationTests();
  registerFrameGradientProjectionTests();
});

function registerGradientStopNormalizationTests() {
  it('normalizes, clamps, and stably sorts positional stops', () => {
    expect(
      normalizeEditorGradientStops(
        [
          { color: '#333333', offset: 0.8 },
          { color: '#111111', offset: -1, opacity: 2 },
          { color: '#222222', offset: 0.8 },
          { color: '', offset: 0.4 },
        ],
        createEditorGradientFallbackStops('#ffffff', '#000000')
      )
    ).toEqual([
      { color: '#111111', offset: 0, opacity: 1 },
      { color: '#333333', offset: 0.8 },
      { color: '#222222', offset: 0.8 },
    ]);
  });

  it('creates positional fallback stops from legacy colors', () => {
    expect(
      normalizeEditorGradientColorList(['#111111', '#222222', '#333333'], '#fff', '#000')
    ).toEqual([
      { color: '#111111', offset: 0 },
      { color: '#222222', offset: 0.5 },
      { color: '#333333', offset: 1 },
    ]);
  });
}

function registerGradientStopMutationTests() {
  it('adds, removes, reverses, and serializes compact stop lists', () => {
    const stops = [
      { color: '#111111', offset: 0 },
      { color: '#222222', offset: 1 },
    ];

    expect(addEditorGradientStop(stops, 0)).toEqual([
      { color: '#111111', offset: 0 },
      { color: '#111111', offset: 0.5 },
      { color: '#222222', offset: 1 },
    ]);
    expect(removeEditorGradientStop(stops, 0)).toEqual(stops);
    expect(reverseEditorGradientStops(addEditorGradientStop(stops, 0))).toEqual([
      { color: '#222222', offset: 0 },
      { color: '#111111', offset: 0.5 },
      { color: '#111111', offset: 1 },
    ]);
    expect(
      createEditorGradientCssStops([
        { color: '#111111', offset: 0, opacity: 0.4 },
        { color: '#222222', offset: 1 },
      ])
    ).toBe('rgba(17, 17, 17, 0.4) 0%, #222222 100%');
  });
}

function registerFrameGradientProjectionTests() {
  registerFrameGradientPatchTests();
  registerFrameGradientNormalizationTests();
}

function registerFrameGradientPatchTests() {
  it('projects frame gradients through positional stops while preserving legacy colors', () => {
    const frame = {
      backgroundGradientAngle: 45,
      backgroundGradientFrom: '#111111',
      backgroundGradientTo: '#222222',
      backgroundGradientStops: ['#111111', '#222222'],
    };
    const patch = createEditorFrameGradientPatch(frame, [
      { color: '#111111', offset: 0 },
      { color: '#333333', offset: 0.25 },
      { color: '#222222', offset: 1 },
    ]);

    expect(patch).toMatchObject({
      backgroundGradientFrom: '#111111',
      backgroundGradientStops: ['#111111', '#333333', '#222222'],
      backgroundGradientTo: '#222222',
    });
    expect(normalizeEditorFrameGradientColorStops({ ...frame, ...patch })).toEqual([
      { color: '#111111', offset: 0 },
      { color: '#333333', offset: 0.25 },
      { color: '#222222', offset: 1 },
    ]);
    expect(createEditorFrameGradientCss({ ...frame, ...patch })).toContain('#333333 25%');
    expect(createEditorFrameGradientPatch(frame, ['#aaaaaa', '#bbbbbb'])).toMatchObject({
      backgroundGradientColorStops: [
        { color: '#aaaaaa', offset: 0 },
        { color: '#bbbbbb', offset: 1 },
      ],
    });
  });
}

function registerFrameGradientNormalizationTests() {
  it('normalizes frame gradient legacy lists and positional fallbacks', () => {
    const frame = {
      backgroundGradientFrom: '#111111',
      backgroundGradientTo: '#222222',
      backgroundGradientStops: ['', '#333333'],
    };

    expect(normalizeEditorFrameGradientStops(frame)).toEqual(['#111111', '#222222']);
    expect(
      normalizeEditorFrameGradientStops({
        ...frame,
        backgroundGradientStops: ['#111111', '#333333', '#222222'],
      })
    ).toEqual(['#111111', '#333333', '#222222']);
    expect(
      normalizeEditorFrameGradientColorStops({
        ...frame,
        backgroundGradientColorStops: [
          { color: '#111111', offset: 0 },
          { color: '#333333', offset: 0.4 },
          { color: '#222222', offset: 1 },
        ],
      })
    ).toEqual([
      { color: '#111111', offset: 0 },
      { color: '#333333', offset: 0.4 },
      { color: '#222222', offset: 1 },
    ]);
  });
}
