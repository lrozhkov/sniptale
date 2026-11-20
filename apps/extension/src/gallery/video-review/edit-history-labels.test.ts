import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedContent } from '../../features/video/review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import type { ReviewEdit, ReviewOperation } from '../../features/video/review/types';
import { createCameraFollowSettings } from '../../features/video/project/camera/cursor-policy';
import { deriveRecordedCursorFocusPath } from '../../features/video/project/cursor-focus-path/recorded';
import { createVideoProjectCursorTrack } from '../../features/video/project/defaults';
import { reviewEditHistoryTitle } from './edit-history-labels';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (await import('../../platform/i18n/catalog-fixture.test-support'))
    .translateCatalogFixture,
}));

it('describes actual advanced changes and ignores identical snapshots of other fields', () => {
  const before = createQuickEditAdvancedContent();
  const after = structuredClone(before);
  after.zoom.enabled = true;
  after.background = {
    enabled: true,
    type: 'solid',
    color: '#000000',
    layout: { padding: 0, cornerRadius: 0 },
  };
  after.audio.original.volume = 0.7;
  const operation: ReviewOperation = { id: 'op', at: 0, target: 'advancedContent', before, after };
  expect(reviewEditHistoryTitle(operation, 'en')).toBe(
    'Focus enabled · Background enabled · Source audio updated'
  );
  expect(reviewEditHistoryTitle(operation, 'ru')).not.toBe(reviewEditHistoryTitle(operation, 'en'));
});

it('names the focus region and reports the actual scale and timing change', () => {
  const before = createQuickEditAdvancedContent();
  before.zoom.regions.push(createQuickEditZoomRegion({ id: 'focus', at: 2, duration: 2 }));
  before.zoom.regions[0]!.transform.scale = 1.5;
  const after = structuredClone(before);
  after.zoom.regions[0]!.transform.scale = 2;
  after.zoom.regions[0]!.end = 5;
  const operation: ReviewOperation = { id: 'op', at: 1, target: 'advancedContent', before, after };
  expect(reviewEditHistoryTitle(operation, 'en')).toBe(
    'Focus region (0:02.000) · Timing 0:02.000–0:04.000 → 0:02.000–0:05.000 · Scale 1.5× → 2×'
  );
});

it('reports cursor visibility and specific appearance values from a retained clip', () => {
  const before = createQuickEditAdvancedContent();
  before.cursorMotions = [
    {
      id: 'cursor',
      start: 1,
      end: 3,
      enabled: true,
      shape: 'arrow',
      size: 20,
      color: '#000000',
      outline: '#FFFFFF',
      shadow: false,
      easing: 'linear',
      points: [{ id: 'point', at: 0.4, x: 0.25, y: 0.25 }],
    },
  ];
  const after = structuredClone(before);
  after.cursorMotionEnabled = false;
  after.cursorMotions![0]!.size = 30;
  after.cursorMotions![0]!.shape = 'pointer';
  after.cursorMotions![0]!.points[0] = { id: 'point', at: 0.8, x: 0.5, y: 0.25 };
  after.cursorMotions![0]!.points.push({ id: 'new', at: 1.1, x: 0.6, y: 0.25 });
  const operation: ReviewOperation = { id: 'op', at: 1, target: 'advancedContent', before, after };
  expect(reviewEditHistoryTitle(operation, 'en')).toBe(
    [
      'Cursor visibility disabled',
      'Cursor clip (0:01.000)',
      'Cursor size 20 → 30',
      'Cursor shape Arrow → Pointer',
      'Cursor point (0:00.800)',
      'Time 0:00.400 → 0:00.800',
      'Position 25% / 25% → 50% / 25%',
      'Cursor point (0:01.100) added',
    ].join(' · ')
  );
});

it('identifies the action and fragment type on both sides of a deletion', () => {
  const cut: ReviewEdit = {
    id: 'cut',
    kind: 'cut',
    start: 1,
    end: 2,
    requestedStart: 1,
    requestedEnd: 2,
  };
  const operation = { id: 'op', at: 1, target: 'edit' } as const;
  expect(reviewEditHistoryTitle({ ...operation, before: null, after: cut }, 'en')).toBe(
    'Cut added'
  );
  expect(reviewEditHistoryTitle({ ...operation, before: cut, after: null }, 'en')).toBe(
    'Cut removed'
  );
});

it('names both the camera follow mode and path smoothing values', () => {
  const before = createQuickEditAdvancedContent();
  before.cursorFocusPath = {
    version: 1,
    smoothing: 0.2,
    sensitivity: 0.5,
    mode: 'fixed',
    gapPolicy: 'hold',
    segments: [],
  };
  const after = structuredClone(before);
  after.cursorFocusPath!.mode = 'follow';
  after.cursorFocusPath!.smoothing = 0.4;
  expect(
    reviewEditHistoryTitle({ id: 'op', at: 1, target: 'advancedContent', before, after }, 'en')
  ).toBe('Default camera Manual → Follow cursor · Path smoothing 20% → 40%');
});

it('reports exact focus key timing, coordinates, and curve and identifies added and removed keys', () => {
  const before = createQuickEditAdvancedContent();
  before.cursorFocusPath = {
    version: 1,
    smoothing: 0.2,
    sensitivity: 0.5,
    mode: 'fixed',
    gapPolicy: 'hold',
    segments: [
      {
        id: 'segment',
        binding: { kind: 'project' },
        start: 0,
        end: 4,
        keys: [
          { id: 'key', x: 0.25, y: 0.5, time: 1, anchor: 'manual', interpolation: 'linear' },
          { id: 'removed', x: 0.5, y: 0.5, time: 2, anchor: 'manual', interpolation: 'linear' },
        ],
      },
    ],
  };
  const after = structuredClone(before);
  after.cursorFocusPath!.segments[0]!.keys = [
    { id: 'key', x: 0.5, y: 0.75, time: 1.5, anchor: 'manual', interpolation: 'hold' },
    { id: 'added', x: 0.5, y: 0.5, time: 3, anchor: 'manual', interpolation: 'linear' },
  ];
  const title = reviewEditHistoryTitle(
    { id: 'op', at: 1, target: 'advancedContent', before, after },
    'en'
  );
  expect(title).toBe(
    [
      'Focus key (0:01.500)',
      'Time 0:01.000 → 0:01.500',
      'Position 25% / 50% → 50% / 75%',
      'Curve Linear → Hold',
      'Focus key (0:03.000, 50% / 50%, Linear) added',
      'Focus key (0:02.000, 50% / 50%, Linear) removed',
    ].join(' · ')
  );
});

it('compares the first sparse path edit to the same defaults shown in the inspector', () => {
  const before = createQuickEditAdvancedContent();
  const after = structuredClone(before);
  after.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0.75,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [],
  };
  expect(
    reviewEditHistoryTitle({ id: 'op', at: 1, target: 'advancedContent', before, after }, 'en')
  ).toBe('Default camera Manual → Follow cursor · Path smoothing 50% → 75%');
});

it('shows the retained new values of a first override for a recorded key', () => {
  const before = createQuickEditAdvancedContent();
  const after = structuredClone(before);
  const cursorTrack = createVideoProjectCursorTrack();
  cursorTrack.samples = [
    { id: 'raw', time: 0, x: 70, y: 40, visible: true, recordingPoint: { x: 0.7, y: 0.4 } },
    { id: 'end', time: 4, x: 70, y: 40, visible: true, recordingPoint: { x: 0.7, y: 0.4 } },
  ];
  const derived = deriveRecordedCursorFocusPath(
    {
      cursorTrack,
      actionEvents: [
        {
          id: 'click',
          kind: 'CLICK',
          time: 0.5,
          recordingPoint: { x: 0.7, y: 0.4 },
          data: { completion: 'released', upTime: 1, recordingUpX: 0.7, recordingUpY: 0.4 },
        },
      ],
      signals: [],
    },
    { width: 100, height: 100, duration: 4 }
  );
  expect(derived.segments[0]!.keys.find((key) => key.id === 'release:click')).toMatchObject({
    time: 1,
    x: 0.7,
    y: 0.4,
  });
  after.cursorFocusPath = {
    ...derived,
    segments: [
      {
        id: 'segment',
        binding: { kind: 'project' },
        start: 0,
        end: 4,
        keys: [
          {
            id: 'focus-override:raw',
            x: 0.8,
            y: 0.6,
            time: 1,
            anchor: 'manual',
            interpolation: 'smooth',
            incoming: { x: 0.75, y: 0.55 },
          },
        ],
      },
    ],
  };
  expect(
    reviewEditHistoryTitle({ id: 'op', at: 1, target: 'advancedContent', before, after }, 'en')
  ).toBe('Focus key (0:01.000, 80% / 60%, Smooth, Incoming 75% / 55%) added');
});

it('shows follow timing for a regional override against its inherited policy', () => {
  const before = createQuickEditAdvancedContent();
  before.cameraFollowDefaults = { ...createCameraFollowSettings(), transitionDuration: 0.7 };
  before.zoom.regions = [createQuickEditZoomRegion({ id: 'focus', at: 2, duration: 2 })];
  const after = structuredClone(before);
  after.zoom.regions[0]!.cameraFollow = {
    ...before.cameraFollowDefaults,
    transitionDuration: 0.35,
  };
  const caption = reviewEditHistoryTitle(
    { id: 'op', at: 1, target: 'advancedContent', before, after },
    'en'
  );
  expect(caption).toBe('Focus region (0:02.000) · Transition duration 0:00.700 → 0:00.350');
});

it('shows previous and new local follow mode and the edited focus transition timing', () => {
  const before = createQuickEditAdvancedContent();
  const focus = createQuickEditZoomRegion({ id: 'focus', at: 2, duration: 2 });
  focus.exit = { type: 'none', duration: 0 };
  focus.enter = { type: 'ease-in-out', duration: 0.8 };
  before.zoom.regions = [focus];
  const after = structuredClone(before);
  after.zoom.regions[0]!.followCursor = true;
  after.zoom.regions[0]!.enter = { type: 'linear', duration: 0.4 };
  after.zoom.regions[0]!.exit = { type: 'ease-in-out', duration: 0.25 };
  const title = reviewEditHistoryTitle(
    { id: 'op', at: 1, target: 'advancedContent', before, after },
    'en'
  );
  expect(title).toBe(
    [
      'Focus region (0:02.000)',
      'Camera follow Inherited camera settings → Follow cursor',
      'Effect entrance Smooth (0:00.800) → Constant speed (0:00.400)',
      'Effect exit None → Smooth (0:00.250)',
    ].join(' · ')
  );
});

it('states which focus region was added or removed and whether focus was switched off', () => {
  const before = createQuickEditAdvancedContent();
  const after = structuredClone(before);
  after.zoom.enabled = true;
  after.zoom.regions = [createQuickEditZoomRegion({ id: 'focus', at: 4, duration: 2 })];
  const operation = { id: 'op', at: 1, target: 'advancedContent' } as const;
  expect(reviewEditHistoryTitle({ ...operation, before, after }, 'en')).toBe(
    'Focus enabled · Focus region (0:04.000) added'
  );
  expect(reviewEditHistoryTitle({ ...operation, before: after, after: before }, 'en')).toBe(
    'Focus disabled · Focus region (0:04.000) removed'
  );
});

it('shows changed background color and padding separately from disabling the background', () => {
  const before = createQuickEditAdvancedContent();
  before.background = {
    enabled: true,
    type: 'solid',
    color: '#112233',
    layout: { padding: 12, cornerRadius: 0 },
  };
  const after = structuredClone(before);
  after.background = {
    ...before.background,
    color: '#556677',
    layout: { padding: 24, cornerRadius: 0 },
  };
  const operation = { id: 'op', at: 1, target: 'advancedContent' } as const;
  expect(reviewEditHistoryTitle({ ...operation, before, after }, 'en')).toBe(
    'Background · Color #112233 → #556677 · Padding 12 → 24'
  );
  expect(
    reviewEditHistoryTitle(
      { ...operation, before: after, after: createQuickEditAdvancedContent() },
      'en'
    )
  ).toBe('Background disabled');
});

it('labels a compact source gain operation and distinguishes an edit to an existing annotation', () => {
  expect(
    reviewEditHistoryTitle(
      {
        id: 'audio',
        at: 1,
        target: 'sourceAudio',
        before: { muted: false, volume: 1 },
        after: { muted: false, volume: 0.4 },
      },
      'en'
    )
  ).toBe('Source audio');
  const before = { id: 'note', text: 'Original', anchor: { kind: 'point' as const, time: 1 } };
  expect(
    reviewEditHistoryTitle(
      { id: 'edit', at: 1, target: 'annotation', before, after: { ...before, text: 'Edited' } },
      'en'
    )
  ).toBe('Annotation updated');
});
