// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  createQuickEditAdvancedContent,
  createQuickEditAdvancedState,
} from '../../features/video/review/advanced/defaults';
import { createCanvasComment } from '../../features/video/review/comments';
import type { ReviewDocument, ReviewSelection } from '../../features/video/review/types';
import { useReviewEditorWiring } from './use-review-wiring';

const mocks = vi.hoisted(() => ({
  comments: vi.fn(),
  canvas: vi.fn(),
  audio: vi.fn(),
  lifecycle: vi.fn(),
  shortcuts: vi.fn(),
  prepare: vi.fn(),
  project: vi.fn(() => ({ markers: [], warnings: 2 })),
}));

vi.mock('../../features/video/review/telemetry', () => ({ projectReviewTelemetry: mocks.project }));
vi.mock('./use-review-comments', () => ({ useReviewCommentActions: mocks.comments }));
vi.mock('./use-canvas-comments', () => ({ useCanvasComments: mocks.canvas }));
vi.mock('./use-review-audio', () => ({ useReviewAudio: mocks.audio }));
vi.mock('./use-review-selection', () => ({ useReviewSelectionLifecycle: mocks.lifecycle }));
vi.mock('./use-review-shortcuts', () => ({ useReviewEditorShortcuts: mocks.shortcuts }));
vi.mock('./use-export', () => ({ prepareReviewExporter: mocks.prepare }));

type WiringArgs = Parameters<typeof useReviewEditorWiring>[0];
type SelectionSetter = (value: string | null) => void;
type ShortcutBinding = {
  undo(): Promise<void>;
  redo(): Promise<void>;
  cancelDrawing(): void;
  pointTool(): void;
  addComment(): void;
  toggleCut(): void;
};
type LifecycleBinding = { deleteCanvas(id: string): void };

it('wires selection, flush, history, and shortcut boundaries through one owner', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const comments = { add: vi.fn(), select: vi.fn() };
  const canvas = { flushTexts: vi.fn(), onDelete: vi.fn() };
  const audio = {
    removeClip: vi.fn(),
    removeOriginal: vi.fn(),
    setOriginalTool: vi.fn(),
    setOriginalRangeSelected: vi.fn(),
  };
  const removeSelection = vi.fn();
  mocks.comments.mockReturnValue(comments);
  mocks.canvas.mockReturnValue(canvas);
  mocks.audio.mockReturnValue(audio);
  mocks.lifecycle.mockReturnValue(removeSelection);
  mocks.prepare.mockReturnValue({ prepared: true });
  const advanced = createQuickEditAdvancedState();
  const reviewDocument: ReviewDocument = {
    edits: [],
    annotations: [],
    canvasComments: [],
    advancedContent: createQuickEditAdvancedContent(),
  };
  reviewDocument.canvasComments.push(createCanvasComment({ id: 'canvas-a', at: 1 }));
  const session = { flush: vi.fn(), history: vi.fn(), commit: vi.fn() };
  const advancedState = { flush: vi.fn(), setAudio: vi.fn() };
  const setActiveSelection = vi.fn();
  const setTimelineSelection = vi.fn();
  const setCutting = vi.fn();
  const cuts = { cutting: true, setCutting, remove: vi.fn(), toggle: vi.fn() };
  const root = createRoot(document.createElement('div'));
  let result!: ReturnType<typeof useReviewEditorWiring>;
  const args = {
    session,
    document: reviewDocument,
    advanced,
    advancedState,
    exporter: { phase: 'idle', index: { boundaries: [0, 1] } },
    zoom: { remove: vi.fn(), setDrawing: vi.fn() },
    activeSelection: { kind: 'canvas-comment', id: 'canvas-a' } satisfies ReviewSelection,
    setActiveSelection,
    clearAnnotation: vi.fn(),
    time: 1,
    timelineDuration: 4,
    busy: false,
    canStart: () => true,
    run: async (action: () => Promise<unknown>) => action(),
    composer: { annotation: null },
    video: { current: null },
    seek: vi.fn(),
    setTimelineSelection,
    setCutting,
    telemetry: { markers: [] },
    sourceDuration: 4,
    actionsVisible: true,
    play: vi.fn(),
    timelineSelection: { kind: 'point', time: 1 },
    cuts,
  } as unknown as WiringArgs;
  function Harness() {
    result = useReviewEditorWiring(args);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(result.telemetry).toBe(true);
    expect(result.projected.warnings).toBe(2);
    expect(result.exporter).toEqual({ prepared: true });

    const canvasSelection = mocks.canvas.mock.lastCall?.[0].onSelectionChange as SelectionSetter;
    const audioSelection = mocks.audio.mock.lastCall?.[0].onSelectionChange as (
      value: { lane: 'music'; id: string } | null
    ) => void;
    canvasSelection('canvas-a');
    canvasSelection(null);
    audioSelection({ lane: 'music', id: 'audio-a' });
    audioSelection(null);
    expect(setActiveSelection).toHaveBeenCalledTimes(4);

    const lifecycle = mocks.lifecycle.mock.lastCall?.[0] as LifecycleBinding;
    lifecycle.deleteCanvas('missing');
    lifecycle.deleteCanvas('canvas-a');
    expect(canvas.onDelete).toHaveBeenCalledWith(reviewDocument.canvasComments[0]);

    const shortcuts = mocks.shortcuts.mock.lastCall?.[0] as ShortcutBinding;
    await shortcuts.undo();
    await shortcuts.redo();
    shortcuts.cancelDrawing();
    shortcuts.pointTool();
    shortcuts.addComment();
    shortcuts.toggleCut();
    expect(advancedState.flush).toHaveBeenCalledTimes(2);
    expect(canvas.flushTexts).toHaveBeenCalledTimes(2);
    expect(session.flush).toHaveBeenCalledTimes(2);
    expect(session.history.mock.calls.map(([direction]) => direction)).toEqual(['undo', 'redo']);
    expect(setTimelineSelection).toHaveBeenCalledWith({ kind: 'point', time: 1 });
    expect(comments.add).toHaveBeenCalledWith(args.timelineSelection);
    expect(cuts.toggle).toHaveBeenCalledWith('cut');
    expect(args.zoom.setDrawing).toHaveBeenCalledTimes(3);
    expect(args.zoom.setDrawing).toHaveBeenLastCalledWith(false);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
