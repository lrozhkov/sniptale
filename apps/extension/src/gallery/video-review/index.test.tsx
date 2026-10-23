// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { LoadedReview } from './use-session';
import type { useReviewEditorState } from './use-editor-state';
import type { ReviewHistoryControls } from './timeline-chrome';
import type { ReviewTimelineBinding } from './timeline-binding';
import { VideoReview } from './index';
import { inspectReviewMedia } from '../../workflows/video-review/media-index';
import type { usePresentationPreview } from './use-presentation-preview';

const observed: {
  preview: Parameters<typeof usePresentationPreview>[0];
  loaded: LoadedReview | null;
  state: ReturnType<typeof useReviewEditorState> | null;
  history: ComponentProps<typeof ReviewHistoryControls> | null;
} = vi.hoisted(() => ({ preview: null, loaded: null, state: null, history: null }));
vi.mock('./use-session', async (original) => ({
  ...(await original<typeof import('./use-session')>()),
  useLoadedReview: () => ({ resource: observed.loaded, failed: null, retry: vi.fn() }),
}));
vi.mock('./use-editor-state', async (original) => {
  const actual = await original<typeof import('./use-editor-state')>();
  return {
    ...actual,
    useReviewEditorState(resource: LoadedReview) {
      const state = actual.useReviewEditorState(resource);
      observed.state = state;
      return state;
    },
  };
});
vi.mock('../../workflows/video-review/media-index', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/media-index')>()),
  inspectReviewMedia: vi.fn(async () => {
    throw new Error('Synthetic media fixture');
  }),
}));
vi.mock('./use-presentation-preview', async (original) => {
  const actual = await original<typeof import('./use-presentation-preview')>();
  return {
    ...actual,
    usePresentationPreview(...args: Parameters<typeof usePresentationPreview>) {
      observed.preview = args[0];
      return actual.usePresentationPreview(...args);
    },
  };
});
vi.mock('./review-dialog', () => ({
  ReviewDialog: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./preview-binding', () => ({ ReviewPreviewBinding: () => null }));
vi.mock('./inspector-binding', async (original) => ({
  ...(await original<typeof import('./inspector-binding')>()),
  ReviewInspectorBinding: () => null,
}));
vi.mock('./timeline-binding', () => ({
  ReviewTimelineBinding: (props: ComponentProps<typeof ReviewTimelineBinding>) =>
    props.historyControls,
}));
vi.mock('./timeline-chrome', async (original) => ({
  ...(await original<typeof import('./timeline-chrome')>()),
  ReviewHistoryControls: (props: ComponentProps<typeof ReviewHistoryControls>) => {
    observed.history = props;
    return null;
  },
}));
vi.mock('./panel-layout', () => ({
  useReviewPanelLayout: () => ({
    container: { current: null },
    timeline: { current: null },
    inspectorWidth: 380,
    timelineHeight: 200,
    inspector: {},
    timelineResize: {},
  }),
  ReviewPanelResizeHandle: () => null,
}));
vi.mock('./audio-waveform', () => ({ useReviewWaveforms: () => new Map() }));

let root: Root;
let loaded: LoadedReview;
let failRead = false;
const save = vi.fn();
function setup() {
  const text = readFileSync(
    'apps/extension/public/video-effects/effects/annotations/sniptale-title/effect.sniptale-effect.json',
    'utf8'
  );
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.annotationEffects = {
    enabled: true,
    instances: [
      {
        id: 'first',
        snapshotId: `effect:${'a'.repeat(64)}`,
        start: 1,
        end: 3,
        attachment: 'content',
        enabled: true,
        transform: { x: 0.1, y: 0.1, width: 0.4, height: 0.2, rotation: 0 },
        controls: { title: 'Persisted title' },
        order: 0,
      },
    ],
  };
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      cursor: 0,
      history: [],
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced,
      effectSnapshots: [
        {
          id: `effect:${'a'.repeat(64)}`,
          sha256: 'a'.repeat(64),
          source: text,
          schemaVersion: 'sniptale.effect.v1',
          kind: 'standalone',
          documentId: 'sniptale-title',
          retainedByteLength: new TextEncoder().encode(text).byteLength,
          assets: [],
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const read = vi.fn(async () => {
    if (failRead) throw new Error('Synthetic reload failure');
    return structuredClone(snapshot);
  });
  save.mockImplementation(async () => {
    throw new Error('Synthetic Save failure');
  });
  const session = createVideoReviewSession(snapshot, {
    readVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceAdvanced: read,
    saveVideoWorkspaceDraft: read,
    commitVideoWorkspace: read,
    saveVideoWorkspaceSnapshot: save,
  });
  session.setAutosaveEnabled(false);
  loaded = {
    source: snapshot.workspace.source,
    snapshot,
    session,
    file: new File(['video'], 'video.webm'),
    filename: 'video.webm',
    url: 'blob:r',
    telemetry: null,
  };
  observed.loaded = loaded;
  return read;
}
function state() {
  if (!observed.state) throw new Error('Missing actual editor state');
  return observed.state;
}
async function failedSaveAndNewField() {
  await act(async () => {
    state().annotationEffects.change('first', { start: 0.5 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  expect(loaded.session.getSnapshot().dirty).toBe(true);
  await act(async () => {
    await expect(loaded.session.saveBuffered()).rejects.toThrow();
  });
  expect(observed.history?.autosave?.error).toBe('storage');
  act(() => {
    expect(state().annotationEffects.beginGesture('first')).toBe(true);
    state().annotationEffects.previewGesture({ controls: { title: 'Recoverable typed title' } });
  });
  expect(state().annotationEffects.previewLane?.instances[0]?.controls['title']).toBe(
    'Recoverable typed title'
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  failRead = false;
  save.mockReset();
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await loaded.session.dispose();
  observed.preview = null;
  observed.loaded = null;
  observed.state = null;
  observed.history = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('cancels the field draft only after the actual confirmed root Reload has restored persisted history', async () => {
  setup();
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  await failedSaveAndNewField();
  await act(async () => {
    await observed.history?.autosave?.onReload();
  });
  expect(loaded.session.getSnapshot().error).toBeNull();
  expect(loaded.session.getSnapshot().dirty).toBe(false);
  expect(state().annotationEffects.gestureId).toBeNull();
  expect(state().annotationEffects.previewLane?.instances[0]?.controls['title']).toBe(
    'Persisted title'
  );
  expect(parseVideoWorkspace(loaded.session.getSnapshot().snapshot.workspace)).not.toBeNull();
  expect(save).toHaveBeenCalledOnce();
});

it('preserves the disposable text and storage recovery state when the actual root Reload read fails', async () => {
  setup();
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  await failedSaveAndNewField();
  failRead = true;
  await act(async () => {
    await observed.history?.autosave?.onReload();
  });
  expect(state().annotationEffects.gestureId).toBe('first');
  expect(state().annotationEffects.previewLane?.instances[0]?.controls['title']).toBe(
    'Recoverable typed title'
  );
  expect(loaded.session.getSnapshot().error).toBe('storage');
  expect(save).toHaveBeenCalledOnce();
  failRead = false;
  await act(async () => {
    await observed.history?.autosave?.onReload();
  });
  expect(state().annotationEffects.gestureId).toBeNull();
  expect(state().annotationEffects.previewLane?.instances[0]?.controls['title']).toBe(
    'Persisted title'
  );
});

it('passes the coherent EffectV1 snapshots into the Gallery presentation preview', async () => {
  setup();
  vi.mocked(inspectReviewMedia).mockResolvedValue({
    duration: 4,
    boundaries: [0, 4],
    videoCodec: 'vp9',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
    frameRate: 30,
    width: 640,
    height: 360,
  });
  await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={vi.fn()} />));
  await act(async () => {
    await vi.waitFor(() => expect(state().editing.exporter.index).not.toBeNull());
  });
  expect(observed.preview).not.toBeNull();
  expect(observed.preview?.effectSnapshots).toBe(
    state().snapshot.snapshot.workspace.effectSnapshots
  );
  expect(observed.preview?.effectSnapshots?.[0]?.documentId).toBe('sniptale-title');
});
