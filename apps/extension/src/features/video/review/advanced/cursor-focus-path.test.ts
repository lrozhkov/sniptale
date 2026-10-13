import { createQuickEditAdvancedContent } from './defaults';
import { loadQuickEditAdvancedContentState } from './validation';
import { expect, it } from 'vitest';
import { normalizeVideoProjectCursorSkin } from '../../project/cursor';
import type { CursorFocusPath } from '../../project/cursor-focus-path/types';
import {
  deriveReviewCursorFocusPath,
  evaluateReviewCursorFocus,
  evaluateReviewFollowCursor,
  type ReviewCursorFacts,
} from './cursor-focus-path';
import { evaluateQuickEditCameraAtTime } from './scene';
import type { QuickEditZoomRegion } from './types';

const facts: ReviewCursorFacts = {
  cursorTrack: {
    captureMode: 'embedded-fallback',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [
      {
        id: 'start',
        time: 0,
        x: 10,
        y: 10,
        visible: true,
        observation: 'observed',
        captureSegment: 0,
        recordingPoint: { x: 0.1, y: 0.1 },
      },
      {
        id: 'middle',
        time: 1,
        x: 80,
        y: 80,
        visible: true,
        observation: 'observed',
        captureSegment: 0,
        recordingPoint: { x: 0.8, y: 0.8 },
      },
      {
        id: 'end',
        time: 4,
        x: 90,
        y: 90,
        visible: true,
        observation: 'observed',
        captureSegment: 0,
        recordingPoint: { x: 0.9, y: 0.9 },
      },
    ],
  },
  actionEvents: [],
  signals: [],
};
const source = { width: 100, height: 100, duration: 4 };
const authored: CursorFocusPath = {
  version: 1,
  smoothing: 0.5,
  sensitivity: 0.5,
  mode: 'follow',
  gapPolicy: 'hold',
  segments: [
    {
      id: 'authored',
      binding: { kind: 'project' },
      start: 0,
      end: 4,
      keys: [{ id: 'manual', time: 0, x: 0.1, y: 0.1, anchor: 'manual', interpolation: 'hold' }],
    },
  ],
};

it.each([0.5, 1, 2, 4])(
  'evaluates Follow in output seconds at speed %s and contains the physical pointer over an opposing authored path',
  (rate) => {
    const region: QuickEditZoomRegion = {
      id: 'follow',
      start: 0,
      end: 4 / rate,
      transform: { scale: 4, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'linear', duration: 0 },
      exit: { type: 'linear', duration: 0 },
      cursorFocus: {
        path: authored,
        observed: deriveReviewCursorFocusPath(facts, source, true),
        timeMap: [
          {
            kind: rate === 1 ? 'keep' : 'speed',
            rate,
            sourceStart: 0,
            sourceEnd: 4,
            resultStart: 0,
            resultEnd: 4 / rate,
          },
        ],
      },
    };
    for (const outputTime of [0.75 / rate, 1.25 / rate, 2 / rate]) {
      const shared = evaluateQuickEditCameraAtTime([region], outputTime);
      const adapter = evaluateReviewFollowCursor(region, outputTime, region.transform);
      expect(shared).toEqual(adapter);
      const actual = evaluateReviewCursorFocus(region.cursorFocus!.observed!, outputTime * rate)!;
      expect(Math.abs(actual.x - shared.centerX)).toBeLessThanOrEqual(1 / shared.scale / 2 + 1e-9);
      expect(Math.abs(actual.y - shared.centerY)).toBeLessThanOrEqual(1 / shared.scale / 2 + 1e-9);
      expect(shared.scale).toBe(4);
      expect(evaluateQuickEditCameraAtTime([region], outputTime)).toEqual(shared);
    }
  }
);

it('does not bridge captured gaps or create source geometry for legacy unverified samples', () => {
  const track = facts.cursorTrack!;
  const split = deriveReviewCursorFocusPath(
    {
      ...facts,
      cursorTrack: {
        ...track,
        samples: [
          ...track.samples.slice(0, 2),
          {
            id: 'loss',
            time: 2,
            x: 80,
            y: 80,
            visible: false,
            observation: 'outside',
            captureSegment: 0,
            recordingPoint: null,
          },
          { ...track.samples[2]!, time: 3, captureSegment: 1 },
        ],
      },
    },
    source
  );
  expect(evaluateReviewCursorFocus(split, 2.5)).toBeNull();
  const unverified = deriveReviewCursorFocusPath(
    {
      ...facts,
      cursorTrack: {
        ...track,
        samples: track.samples.map(({ recordingPoint: _point, ...sample }) => sample),
      },
    },
    source
  );
  expect(unverified.segments).toEqual([]);
});

it('admits authored path only under advanced schema 18 and detaches receiving content', () => {
  const content = {
    ...createQuickEditAdvancedContent(),
    cursorFocusPath: structuredClone(authored),
  };
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 17 })).toBeNull();
  const admitted = loadQuickEditAdvancedContentState(content)!;
  expect(admitted.cursorFocusPath).toEqual(authored);
  content.cursorFocusPath.segments[0]!.keys[0]!.x = 0.9;
  expect(admitted.cursorFocusPath!.segments[0]!.keys[0]!.x).toBe(0.1);
});

it('closes the prior observation run on capture segment change even without a separate loss marker', () => {
  const path = deriveReviewCursorFocusPath(
    {
      ...facts,
      cursorTrack: {
        ...facts.cursorTrack!,
        samples: [
          facts.cursorTrack!.samples[0]!,
          { ...facts.cursorTrack!.samples[2]!, time: 3, captureSegment: 1 },
        ],
      },
    },
    source
  );
  expect(evaluateReviewCursorFocus(path, 2)).toBeNull();
  expect(evaluateReviewCursorFocus(path, 3)).toMatchObject({ x: 0.9, y: 0.9 });
});

it('keeps dense observations intact while offering sparse geometric keys in Gallery', () => {
  const samples = Array.from({ length: 161 }, (_, index) => ({
    ...facts.cursorTrack!.samples[0]!,
    id: `dense:${index}`,
    time: index * 0.025,
    recordingPoint: { x: 0.1 + 0.8 * (index / 160) ** 2, y: 0.4 },
  }));
  const recorded = { ...facts, cursorTrack: { ...facts.cursorTrack!, samples } };
  const before = structuredClone(recorded);
  const focus = deriveReviewCursorFocusPath(recorded, source);
  expect(focus.segments[0]!.keys.map((key) => key.id)).toEqual(['dense:0', 'dense:160']);
  expect(deriveReviewCursorFocusPath(recorded, source, true).segments[0]!.keys).toHaveLength(161);
  expect(recorded).toEqual(before);
});
