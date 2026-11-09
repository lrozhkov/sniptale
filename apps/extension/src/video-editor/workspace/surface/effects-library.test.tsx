// @vitest-environment jsdom
import { act, Profiler, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createTextClip } from '../../../features/video/project/factories/overlay-clip';
import { buildProjectTransitionSegments } from '../../../features/video/project/transition/project';
import { VideoTransitionEasing, VideoTransitionKind } from '../../../features/video/project/types';
import { translate } from '../../../platform/i18n';
import { VideoEditorCompositionProvider } from '../../runtime/controller/composition/provider';
import { WorkspacePreferencesProvider } from '../../runtime/controller/workspace-preferences';
import { useVideoEditorStore } from '../../state/store';
import { VideoEditorWorkspaceEffectsLibrary } from './effects-library';

const runtime = vi.hoisted(() => ({
  assetUrls: {},
  timelinePreviews: {},
  isPreparingPlayback: false,
  pausePlayback: vi.fn(() => 0),
  registerPreviewRuntime: vi.fn(),
  seekTo: vi.fn(),
  stepByFrames: vi.fn(),
  setPlaybackPlaying: vi.fn(),
  togglePlayback: vi.fn(),
  setTimelinePreviewSuspended: vi.fn(),
  setTimelinePreviewViewport: vi.fn(),
  applyLoadedProject: vi.fn(),
}));
vi.mock('../../runtime/session', async (original) => ({
  ...(await original<typeof import('../../runtime/session')>()),
  useVideoEditorRuntime: () => runtime,
}));
vi.mock('../../../composition/persistence/infrastructure/browser-storage', async (original) => {
  const actual =
    await original<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >();
  return {
    ...actual,
    browserStorage: {
      ...actual.browserStorage,
      local: { ...actual.browserStorage.local, get: async () => ({}), set: async () => undefined },
    },
  };
});
vi.mock('../../../ui/effect-catalog-preview', () => ({
  EffectCatalogPreviewProvider: ({ children }: { children: ReactNode }) => children,
  EffectCatalogPreview: () => null,
}));

function catalog(): EffectBundleCatalogEntry {
  return {
    assets: [],
    createdAt: 1,
    description: { en: 'Clock proof', ru: 'Проверка времени' },
    documents: ['standalone', 'transition'].map((kind) => ({
      assets: [],
      id: kind,
      kind: kind === 'standalone' ? 'standalone' : 'transition',
      schemaVersion: 'sniptale.effect.v1',
      sha256: `${kind}-sha`,
      source: '{}',
    })),
    enabled: true,
    label: { en: 'Clock proof', ru: 'Проверка времени' },
    packId: 'clock-pack',
    retainedByteLength: 2,
    source: 'raw-json',
    sourceSha256: 'source-sha',
    updatedAt: 2,
    version: '1.0.0',
  };
}

it('keeps actual effect controls current across open, closed, reopened and transition-clock states', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const project = createEmptyVideoProject('Effect clock');
  const track = project.tracks[0]!;
  project.clips = [0, 5, 10].map((start) => ({
    ...createTextClip(track.id, project.width, project.height, start),
    id: `clip-${start}`,
    duration: 6,
  }));
  project.duration = 16;
  project.transitions = [
    { id: 'first', leadingClipId: 'clip-0', trailingClipId: 'clip-5' },
    { id: 'second', leadingClipId: 'clip-5', trailingClipId: 'clip-10' },
  ].map((transition) => ({
    ...transition,
    duration: 1,
    easing: VideoTransitionEasing.LINEAR,
    kind: VideoTransitionKind.CROSSFADE,
  }));
  const originalApply = useVideoEditorStore.getState().applyEffectDocument;
  const apply = vi.fn(async () => null);
  useVideoEditorStore.getState().setProject(project);
  useVideoEditorStore.getState().selectScene();
  useVideoEditorStore.setState({ applyEffectDocument: apply, autosaveEnabled: false });
  useVideoEditorStore.getState().setCurrentTime(3);
  const entry = catalog();
  const rendered = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (isOpen: boolean, kind: 'standalone' | 'transition' = 'standalone') =>
    root.render(
      <WorkspacePreferencesProvider>
        <VideoEditorCompositionProvider>
          <Profiler id="effect-library" onRender={rendered}>
            <VideoEditorWorkspaceEffectsLibrary
              isOpen={isOpen}
              kind={kind}
              effectBundles={{
                catalogs: [{ catalog: entry, status: 'ready' }],
                errorCode: null,
                isLoading: false,
                onDeleteEffectBundle: async () => undefined,
                onImportEffectFiles: async () => [],
                onSetEffectBundleEnabled: async () => undefined,
              }}
              effectOperations={{
                disabled: false,
                operationError: null,
                run: async (_kind, action) => {
                  await action();
                },
              }}
            />
          </Profiler>
        </VideoEditorCompositionProvider>
      </WorkspacePreferencesProvider>
    );
  const clickApply = async (id: 'standalone' | 'transition') => {
    const row = container.querySelector(`[data-effect-document="${id}"]`);
    const button =
      id === 'standalone'
        ? [...(row?.querySelectorAll('button') ?? [])].find(
            (item) => item.title === translate('videoEditor.effectsLibrary.applyToScene')
          )
        : row?.querySelector('button');
    if (!(button instanceof HTMLButtonElement)) throw new Error('Missing effect apply control');
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
  };
  try {
    await act(async () => render(true));
    await clickApply('standalone');
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ startTime: 3, target: { kind: 'scene' } })
    );
    act(() => useVideoEditorStore.getState().setCurrentTime(8));
    await clickApply('standalone');
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ startTime: 8, target: { kind: 'scene' } })
    );
    await act(async () => render(false));
    expect(container.querySelector('[data-ui="video-editor.effects-library.dock"]')).toBeNull();
    const closedRenders = rendered.mock.calls.length;
    act(() => useVideoEditorStore.getState().setCurrentTime(12));
    expect(rendered).toHaveBeenCalledTimes(closedRenders);
    await act(async () => render(true));
    await clickApply('standalone');
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ startTime: 12, target: { kind: 'scene' } })
    );
    const segments = buildProjectTransitionSegments(useVideoEditorStore.getState().project!);
    expect(segments.map(({ id }) => id)).toEqual(['first', 'second']);
    await act(async () => render(true, 'transition'));
    for (const segment of segments) {
      act(() => useVideoEditorStore.getState().setCurrentTime((segment.start + segment.end) / 2));
      await clickApply('transition');
      expect(apply).toHaveBeenLastCalledWith(
        expect.objectContaining({ target: { kind: 'transition', transitionId: segment.id } })
      );
    }
  } finally {
    act(() => root.unmount());
    container.remove();
    useVideoEditorStore.setState({ applyEffectDocument: originalApply, project: null });
    vi.unstubAllGlobals();
  }
});
