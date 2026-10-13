import { createQuickEditWatermark } from './advanced/watermark';
import { reviewAdvancedContentBaseline } from './document';
import { projectReviewVoiceover } from './voiceover-edits';
import { buildReviewTimeMap } from './timeline';
import { describe, expect, it, vi } from 'vitest';
import {
  applyReviewOperation,
  createReviewAdvancedContentOperation,
  replayReviewHistory,
  ReviewHistoryError,
} from './document';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import type { QuickEditAdvancedContent } from './advanced/types';
import { createCanvasComment } from './comments';
import type { ReviewAnnotation, ReviewOperation, ReviewSource } from './types';

const source: ReviewSource = {
  duration: 12,
  width: 640,
  height: 360,
  mimeType: 'video/mp4',
  size: 1000,
};
const annotation: ReviewAnnotation = {
  id: 'a',
  text: 'Check this',
  anchor: { kind: 'point', time: 3 },
  region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
};
const added: ReviewOperation = {
  id: 'op1',
  at: 1,
  target: 'annotation',
  before: null,
  after: annotation,
};

it('preserves authored cursor keys and handles in the accepted baseline and every replay cursor', () => {
  const content = createQuickEditAdvancedContent();
  content.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    gapPolicy: 'hold',
    smoothing: 0.5,
    sensitivity: 0.5,
    segments: [
      {
        id: 'segment',
        binding: { kind: 'project' },
        start: 1,
        end: 8,
        keys: [
          {
            id: 'manual-key',
            time: 3,
            x: 0.2,
            y: 0.3,
            anchor: 'manual',
            interpolation: 'smooth',
            outgoing: { x: 0.4, y: 0.5 },
          },
        ],
      },
    ],
  };
  const frozen = structuredClone(content);
  const baseline = reviewAdvancedContentBaseline(content);
  expect(baseline.cursorFocusPath).toEqual(content.cursorFocusPath);
  const after = structuredClone(content);
  after.cursorFocusPath!.segments[0]!.keys[0]!.x = 0.8;
  const operation = createReviewAdvancedContentOperation({
    id: 'path-edit',
    at: 1,
    before: baseline,
    after,
  });
  expect(operation).not.toBeNull();
  expect(
    replayReviewHistory([operation!], 0, source, baseline).advancedContent.cursorFocusPath
  ).toEqual(content.cursorFocusPath);
  expect(
    replayReviewHistory([operation!], 1, source, baseline).advancedContent.cursorFocusPath
  ).toEqual(after.cursorFocusPath);
  expect(content).toEqual(frozen);
});

it.each(['advancedContent', 'annotation', 'canvasComment', 'edit'] as const)(
  'traverses the before-value once while applying a %s operation',
  (target) => {
    const document = replayReviewHistory([], 0, source);
    let operation: ReviewOperation;
    if (target === 'advancedContent') {
      const before = createQuickEditAdvancedContent();
      const after = {
        ...before,
        audio: { ...before.audio, original: { ...before.audio.original, muted: true } },
      };
      document.advancedContent = structuredClone(before);
      operation = { id: 'change', at: 1, target, before, after };
    } else if (target === 'annotation') {
      document.annotations = [structuredClone(annotation)];
      operation = { ...added, before: annotation, after: { ...annotation, text: 'Changed' } };
    } else if (target === 'canvasComment') {
      const before = createCanvasComment({ id: 'comment', at: 2 });
      document.canvasComments = [structuredClone(before)];
      operation = { id: 'change', at: 1, target, before, after: { ...before, text: 'Changed' } };
    } else {
      const before = {
        id: 'cut',
        kind: 'cut' as const,
        start: 2,
        end: 3,
        requestedStart: 2,
        requestedEnd: 3,
      };
      document.edits = [structuredClone(before)];
      operation = {
        id: 'change',
        at: 1,
        target,
        before,
        after: { ...before, end: 4, requestedEnd: 4 },
      };
    }
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      applyReviewOperation(document, operation, source);
      expect(stringify.mock.calls.filter(([value]) => value === operation.before)).toHaveLength(1);
      expect(stringify).toHaveBeenCalledTimes(3);
    } finally {
      stringify.mockRestore();
    }
  }
);

describe('video review history', () => {
  it('replays canvas comment operations like other targets at every cursor', () => {
    const comment = createCanvasComment({ id: 'c1', at: 2 });
    const edited = { ...comment, text: 'Now with text' };
    const history: ReviewOperation[] = [
      { id: 'op1', at: 1, target: 'canvasComment', before: null, after: comment },
      { id: 'op2', at: 2, target: 'canvasComment', before: comment, after: edited },
      { id: 'op3', at: 3, target: 'canvasComment', before: edited, after: null },
    ];
    expect(replayReviewHistory(history, 0, source).canvasComments).toEqual([]);
    expect(replayReviewHistory(history, 1, source).canvasComments).toEqual([comment]);
    expect(replayReviewHistory(history, 2, source).canvasComments).toEqual([edited]);
    expect(replayReviewHistory(history, 3, source).canvasComments).toEqual([]);
    expect(comment.text).toBe('');
  });

  it('replays add, edit and delete at every undo cursor without mutating earlier values', () => {
    const edited = { ...annotation, text: 'Corrected text' };
    const history: ReviewOperation[] = [
      added,
      { id: 'op2', at: 2, target: 'annotation', before: annotation, after: edited },
      { id: 'op3', at: 3, target: 'annotation', before: edited, after: null },
    ];
    expect(replayReviewHistory(history, 0, source).annotations).toEqual([]);
    expect(replayReviewHistory(history, 1, source).annotations).toEqual([annotation]);
    expect(replayReviewHistory(history, 2, source).annotations).toEqual([edited]);
    expect(replayReviewHistory(history, 3, source).annotations).toEqual([]);
    expect(annotation.text).toBe('Check this');
  });

  it('retains independent regions at the same timestamp, including on removed video', () => {
    const history: ReviewOperation[] = [
      added,
      { ...added, id: 'op2', after: { ...annotation, id: 'b', text: 'Second region' } },
      {
        id: 'cut',
        at: 3,
        target: 'edit',
        before: null,
        after: { id: 'c', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
      },
    ];
    const result = replayReviewHistory(history, 3, source);
    expect(result.annotations).toHaveLength(2);
    expect(result.edits).toHaveLength(1);
  });

  it('rejects stale before-values, identity changes, no-op commits and invalid cursors', () => {
    const document = replayReviewHistory([added], 1, source);
    expect(() => applyReviewOperation(document, added, source)).toThrow('does not match');
    expect(() =>
      applyReviewOperation(document, { ...added, before: annotation, after: annotation }, source)
    ).toThrow('no change');
    expect(() =>
      applyReviewOperation(
        document,
        { ...added, before: annotation, after: { ...annotation, id: 'b' } },
        source
      )
    ).toThrow('identity');
    for (const cursor of [-1, 2, NaN, 0.5])
      expect(() => replayReviewHistory([added], cursor, source)).toThrow('cursor');
  });

  it('rejects overlapping edits and a fully removed output, but permits adjacent edits', () => {
    const cut: ReviewOperation = {
      id: 'cut',
      at: 1,
      target: 'edit',
      before: null,
      after: { id: 'c', kind: 'cut', start: 0, end: 4, requestedStart: 0, requestedEnd: 4 },
    };
    const document = replayReviewHistory([cut], 1, source);
    const speed: ReviewOperation = {
      id: 'speed',
      at: 2,
      target: 'edit',
      before: null,
      after: {
        id: 's',
        kind: 'speed',
        start: 3,
        end: 6,
        requestedStart: 3,
        requestedEnd: 6,
        rate: 2,
        audio: 'mute',
      },
    };
    expect(() => applyReviewOperation(document, speed, source)).not.toThrow();
    expect(() =>
      applyReviewOperation(document, { ...speed, after: { ...speed.after!, start: 4 } }, source)
    ).not.toThrow();
    expect(() =>
      applyReviewOperation(
        document,
        {
          ...cut,
          after: { id: 'd', kind: 'cut', start: 4, end: 12, requestedStart: 4, requestedEnd: 12 },
        },
        source
      )
    ).toThrow('entire');
  });
});

describe('advancedContent operations', () => {
  it('replays content ops on the baseline and undo returns to it', () => {
    const baseline = createQuickEditAdvancedContent();
    const zoomed: QuickEditAdvancedContent = {
      ...baseline,
      zoom: {
        enabled: true,
        regions: [
          {
            id: 'z',
            start: 1,
            end: 3,
            transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
            enter: { type: 'none', duration: 0 },
            exit: { type: 'none', duration: 0 },
          },
        ],
      },
    };
    const operation: ReviewOperation = {
      id: 'op-a',
      at: 5,
      target: 'advancedContent',
      before: baseline,
      after: zoomed,
    };
    const history = [operation];
    expect(replayReviewHistory(history, 1, source, baseline).advancedContent).toEqual(zoomed);
    expect(replayReviewHistory(history, 0, source, baseline).advancedContent).toEqual(baseline);
  });

  it('rejects stale content before-values and no-change commits', () => {
    const baseline = createQuickEditAdvancedContent();
    const changed: QuickEditAdvancedContent = {
      ...baseline,
      audio: { ...baseline.audio, original: { muted: true, volume: 1 } },
    };
    expect(() =>
      applyReviewOperation(
        replayReviewHistory([], 0, source, baseline),
        { id: 'op-b', at: 1, target: 'advancedContent', before: baseline, after: changed },
        source
      )
    ).not.toThrow();
    expect(() =>
      applyReviewOperation(
        replayReviewHistory([], 0, source, baseline),
        { id: 'op-c', at: 1, target: 'advancedContent', before: changed, after: baseline },
        source
      )
    ).toThrow('does not match');
    expect(() =>
      applyReviewOperation(
        replayReviewHistory([], 0, source, baseline),
        { id: 'op-d', at: 1, target: 'advancedContent', before: baseline, after: baseline },
        source
      )
    ).toThrow('no change');
  });
});

it('keeps historical focus snapshots replayable while new edits atomically anchor focus', () => {
  const baseline = createQuickEditAdvancedContent();
  baseline.zoom.regions = [
    {
      id: 'focus',
      start: 6,
      end: 8,
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'linear', duration: 0.3 },
      exit: { type: 'linear', duration: 0.3 },
    },
  ];
  const cut: ReviewOperation = {
    id: 'old-cut',
    at: 1,
    target: 'edit',
    before: null,
    after: { id: 'cut', kind: 'cut', start: 0, end: 2, requestedStart: 0, requestedEnd: 2 },
  };
  const changed = structuredClone(baseline);
  changed.zoom.regions[0]!.transform.scale = 3;
  const history: ReviewOperation[] = [
    cut,
    { id: 'snapshot', at: 2, target: 'advancedContent', before: baseline, after: changed },
  ];
  expect(replayReviewHistory(history, 2, source, baseline).advancedContent).toEqual(changed);
  history.push({
    id: 'remove-cut',
    at: 3,
    target: 'edit',
    before: cut.after,
    after: null,
    preserveFocusAnchors: true,
  });
  const result = replayReviewHistory(history, 3, source, baseline);
  expect(result.advancedContent.zoom.regions[0]).toMatchObject({ start: 8, end: 10 });
  const next = structuredClone(result.advancedContent);
  next.zoom.regions[0]!.transform.scale = 2;
  history.push({
    id: 'new-snapshot',
    at: 4,
    target: 'advancedContent',
    before: result.advancedContent,
    after: next,
  });
  expect(replayReviewHistory(history, 4, source, baseline).advancedContent).toEqual(next);
  expect(replayReviewHistory(history, 2, source, baseline).advancedContent).toEqual(changed);
});

it('replays own audio tempo, reset and video Speed independently at every history cursor', () => {
  const baseline = createQuickEditAdvancedContent();
  baseline.audio.voiceover = [
    {
      id: 'voice',
      assetId: 'asset',
      timelineStart: 1,
      sourceOffset: 0,
      duration: 4,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  const speed: ReviewOperation = {
    id: 'speed',
    at: 1,
    target: 'edit',
    before: null,
    after: {
      id: 'speed',
      kind: 'speed',
      start: 0,
      end: 8,
      requestedStart: 0,
      requestedEnd: 8,
      rate: 4,
      audio: 'speed',
    },
    preserveVoiceoverAnchors: true,
  };
  const current = applyReviewOperation(
    { annotations: [], edits: [], canvasComments: [], advancedContent: baseline },
    speed,
    source
  ).advancedContent;
  const faster = {
    ...current,
    audio: {
      ...current.audio,
      voiceover: current.audio.voiceover.map((clip) => ({ ...clip, tempo: 2 })),
    },
  };
  const history: ReviewOperation[] = [
    speed,
    { id: 'tempo', at: 2, target: 'advancedContent', before: current, after: faster },
    { id: 'reset', at: 3, target: 'advancedContent', before: faster, after: current },
  ];
  for (const [cursor, tempo] of [
    [1, 1],
    [2, 2],
    [3, 1],
  ]) {
    const restored = replayReviewHistory(
      JSON.parse(JSON.stringify(history)),
      cursor!,
      source,
      baseline
    );
    const output = projectReviewVoiceover(
      restored.advancedContent.audio.voiceover,
      buildReviewTimeMap(source.duration, restored.edits)
    );
    expect(output.reduce((sum, clip) => sum + clip.duration, 0)).toBeCloseTo(4 / tempo!);
    expect(output.every((clip) => clip.playbackRate === tempo)).toBe(true);
  }
  expect(baseline.audio.voiceover[0]).not.toHaveProperty('tempo');
});

it('preserves watermark settings and remembered logo across baseline, undo and redo', () => {
  const before = createQuickEditAdvancedContent();
  const watermark = {
    ...createQuickEditWatermark('Автор'),
    mode: 'image' as const,
    image: { assetId: 'project-asset:logo', width: 200, height: 100, size: 0.2, opacity: 0.5 },
  };
  const after = { ...before, watermark };
  const off = { ...after, watermark: { ...watermark, mode: 'none' as const } };
  const reset = { ...before, watermark: createQuickEditWatermark('Made with Sniptale') };
  const operations: ReviewOperation[] = [
    { id: 'logo', at: 1, target: 'advancedContent', before, after },
    { id: 'off', at: 2, target: 'advancedContent', before: after, after: off },
    { id: 'reset', at: 3, target: 'advancedContent', before: off, after: reset },
  ];
  expect(reviewAdvancedContentBaseline(after)).toEqual(after);
  expect(replayReviewHistory(operations, 0, source).advancedContent.watermark).toBeUndefined();
  expect(replayReviewHistory(operations, 1, source).advancedContent).toEqual(after);
  expect(replayReviewHistory(operations, 2, source).advancedContent).toEqual(off);
  expect(replayReviewHistory(operations, 3, source).advancedContent).toEqual(reset);
  expect(replayReviewHistory(operations, 1, source).advancedContent.watermark?.image).toEqual(
    watermark.image
  );
});

it('replays presentation removal without resurrecting the baseline and retains independent slot variants', async () => {
  const { createNewWorkspacePresentationSettings } = await import('./advanced/presentation');
  const baseline = {
    ...createQuickEditAdvancedContent(),
    presentation: createNewWorkspacePresentationSettings(),
  };
  const { presentation: _removed, ...after } = baseline;
  const history: ReviewOperation[] = [
    { id: 'remove-presentation', at: 1, target: 'advancedContent', before: baseline, after },
  ];
  expect(reviewAdvancedContentBaseline(baseline)).toEqual(baseline);
  expect(replayReviewHistory(history, 0, source, baseline).advancedContent.presentation).toEqual(
    baseline.presentation
  );
  expect(
    replayReviewHistory(history, 1, source, baseline).advancedContent.presentation
  ).toBeUndefined();
  expect(replayReviewHistory(history, 0, source, baseline).advancedContent.presentation).toEqual(
    baseline.presentation
  );
});

it('encodes only admitted source master gain while retaining compound content edits', () => {
  const before = createQuickEditAdvancedContent();
  before.audio.original.ranges = [{ id: 'manual', start: 1, end: 3, volume: 0.25 }];
  const after = {
    ...before,
    audio: { ...before.audio, original: { ...before.audio.original, muted: true, volume: 0.5 } },
  };
  const args = { id: 'gain', at: 1, before, after };
  const operation = createReviewAdvancedContentOperation(args);
  expect(operation).toEqual({
    id: 'gain',
    at: 1,
    target: 'sourceAudio',
    before: { muted: false, volume: 1 },
    after: { muted: true, volume: 0.5 },
  });
  expect(
    createReviewAdvancedContentOperation({ ...args, after: structuredClone(before) })
  ).toBeNull();
  for (const compound of [
    { ...after, actionsEnabled: !before.actionsEnabled },
    { ...after, audio: { ...after.audio, original: { ...after.audio.original, ranges: [] } } },
    { ...after, audio: { ...after.audio, original: { ...after.audio.original, mutes: [] } } },
  ]) {
    expect(createReviewAdvancedContentOperation({ ...args, after: compound })).toEqual({
      ...args,
      after: compound,
      target: 'advancedContent',
    });
  }
  const original = structuredClone(before);
  const document = replayReviewHistory([], 0, source, before);
  if (!operation || operation.target !== 'sourceAudio')
    throw new Error('Missing gain fixture operation');
  const changed = applyReviewOperation(document, operation, source);
  expect(changed.advancedContent).toEqual(after);
  expect(changed.annotations).toBe(document.annotations);
  expect(changed.edits).toBe(document.edits);
  expect(changed.advancedContent.audio.original.ranges).toBe(before.audio.original.ranges);
  expect(before).toEqual(original);
  expect(replayReviewHistory([operation], 0, source, before).advancedContent).toEqual(before);
  expect(replayReviewHistory([operation], 1, source, before).advancedContent).toEqual(after);
  expect(() => applyReviewOperation(changed, operation, source)).toThrow(
    new ReviewHistoryError('before-mismatch')
  );
  expect(() =>
    applyReviewOperation(document, { ...operation, after: operation.before }, source)
  ).toThrow(new ReviewHistoryError('no-change'));
});
