// @vitest-environment jsdom
import { createGlTransitionSelection } from '../../../features/video/project/transition/gl-catalog';
import { act, Profiler, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createTextClip } from '../../../features/video/project/factories/overlay-clip';
import { buildProjectTransitionSegments } from '../../../features/video/project/transition/project';
import { VideoTransitionEasing } from '../../../features/video/project/types';
import { glTransitionLabel } from '../../../ui/gl-transition-labels';
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
    documents: ['standalone'].map((kind) => ({
      assets: [],
      id: kind,
      kind: 'standalone' as const,
      schemaVersion: 'sniptale.animation.v1',
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
    kind: 'gl' as const,
    selection: createGlTransitionSelection('Fade')!,
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
      const select = [
        ...container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]'),
      ].find((button) => button.textContent?.includes('Fade'));
      expect(select).toBeDefined();
      const previousCalls = apply.mock.calls.length;
      await act(async () => select!.click());
      const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
        (button) =>
          button.textContent?.trim() ===
          glTransitionLabel(createGlTransitionSelection('CrossZoom')!)
      );
      expect(option).toBeDefined();
      await act(async () => option!.click());
      expect(
        useVideoEditorStore
          .getState()
          .project!.transitions!.find((entry) => entry.id === segment.id)
      ).toMatchObject({ kind: 'gl', selection: { name: 'CrossZoom' } });
      expect(apply).toHaveBeenCalledTimes(previousCalls);
    }
  } finally {
    act(() => root.unmount());
    container.remove();
    useVideoEditorStore.setState({ applyEffectDocument: originalApply, project: null });
    vi.unstubAllGlobals();
  }
});

vi.mock('../../../composition/gl-transition-presets/catalog', async (original) => {
  const { createGlCatalogFixture } =
    await import('../../../composition/gl-transition-presets/catalog.test-support');
  return {
    ...(await original<typeof import('../../../composition/gl-transition-presets/catalog')>()),
    useGlTransitionCatalog: vi.fn(() => createGlCatalogFixture()),
  };
});

async function mountNativeLibrary(kind: 'targetEffect' | 'transition') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { createVideoProjectFromRecording } =
    await import('../../../features/video/project/factories/creation');
  const project = createVideoProjectFromRecording({
    recordingId: 'library-source',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 5,
    size: 10,
    mimeType: 'video/webm',
  });
  const first = project.clips.find((clip) => clip.type === 'VIDEO')!;
  project.clips = [
    first,
    { ...first, id: 'second', sourceInstanceId: 'second-placement', startTime: 4 },
  ];
  project.duration = 9;
  project.transitions = [
    {
      id: 'join',
      leadingClipId: first.id,
      trailingClipId: 'second',
      kind: 'gl',
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      selection: createGlTransitionSelection('Fade')!,
    },
  ];
  useVideoEditorStore.getState().setProject(project);
  useVideoEditorStore.setState({ autosaveEnabled: false });
  useVideoEditorStore.getState().selectClip(first.id);
  useVideoEditorStore.getState().setCurrentTime(4.5);
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  await act(async () =>
    mounted.render(
      <WorkspacePreferencesProvider>
        <VideoEditorCompositionProvider>
          <VideoEditorWorkspaceEffectsLibrary
            isOpen
            kind={kind}
            effectBundles={{
              catalogs: [],
              isLoading: false,
              errorCode: null,
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
        </VideoEditorCompositionProvider>
      </WorkspacePreferencesProvider>
    )
  );
  const hydrated = useVideoEditorStore.getState().project!;
  return {
    host,
    project: hydrated,
    first: hydrated.clips.find((clip) => clip.id === first.id)!,
    dispose() {
      act(() => mounted.unmount());
      host.remove();
      useVideoEditorStore.setState({ project: null });
      vi.unstubAllGlobals();
    },
  };
}

it('edits source filters from the Effects library through the actual project command and Undo', async () => {
  const fixture = await mountNativeLibrary('targetEffect');
  try {
    const add = [...fixture.host.querySelectorAll('button')].find(
      (button) => button.textContent === translate('videoEditor.sidebar.sourceFiltersAddBlur')
    );
    expect(add).toBeDefined();
    await act(async () => add!.click());
    const changed = useVideoEditorStore
      .getState()
      .project!.clips.find((clip) => clip.id === fixture.first.id)!;
    if (changed.type !== 'VIDEO') throw Error('Expected video clip');
    expect(changed.sourceFilters?.filters).toEqual([
      expect.objectContaining({ kind: 'blur', enabled: true, parameters: { radius: 8 } }),
    ]);
    act(() => useVideoEditorStore.getState().undoProject());
    expect(
      useVideoEditorStore.getState().project!.clips.find((clip) => clip.id === fixture.first.id)
    ).toEqual(fixture.first);
    act(() => useVideoEditorStore.getState().redoProject());
    expect(
      useVideoEditorStore.getState().project!.clips.find((clip) => clip.id === fixture.first.id)
    ).toEqual(changed);
  } finally {
    fixture.dispose();
  }
});

it('edits GL selection from the Transitions library without changing join timing and supports Undo', async () => {
  const fixture = await mountNativeLibrary('transition');
  try {
    const select = [
      ...fixture.host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]'),
    ].find((button) => button.textContent?.includes('Fade'));
    expect(select).toBeDefined();
    await act(async () => select!.click());
    const choice = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (button) =>
        button.textContent?.trim() === glTransitionLabel(createGlTransitionSelection('CrossZoom')!)
    );
    expect(choice).toBeDefined();
    await act(async () => choice!.click());
    expect(useVideoEditorStore.getState().project!.transitions![0]).toMatchObject({
      id: 'join',
      kind: 'gl',
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      selection: { name: 'CrossZoom' },
    });
    act(() => useVideoEditorStore.getState().undoProject());
    expect(useVideoEditorStore.getState().project!.transitions![0]).toEqual(
      fixture.project.transitions![0]
    );
  } finally {
    fixture.dispose();
  }
});

it.each(['targetEffect', 'transition'] as const)(
  'keeps the %s library read-only when its owner track is locked',
  async (kind) => {
    const fixture = await mountNativeLibrary(kind);
    try {
      await act(async () => {
        useVideoEditorStore.getState().setProject({
          ...fixture.project,
          tracks: fixture.project.tracks.map((track) => ({ ...track, locked: true })),
        });
        useVideoEditorStore.getState().selectClip(fixture.first.id);
      });
      const action = [...fixture.host.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) =>
          kind === 'targetEffect'
            ? button.textContent === translate('videoEditor.sidebar.sourceFiltersAddBlur')
            : button.getAttribute('aria-haspopup') === 'listbox' &&
              button.textContent?.includes('Fade')
      );
      expect(action?.disabled).toBe(true);
      const before = useVideoEditorStore.getState().project;
      await act(async () => action!.click());
      expect(useVideoEditorStore.getState().project).toBe(before);
    } finally {
      fixture.dispose();
    }
  }
);

it('shows target guidance instead of Lottie choices for an unselected source or missing visual join', async () => {
  const source = await mountNativeLibrary('targetEffect');
  try {
    act(() => useVideoEditorStore.getState().selectScene());
    expect(source.host.textContent).toContain(
      translate('videoEditor.effectsLibrary.selectClipTarget')
    );
    expect(
      source.host.querySelector('[data-ui="video-editor.effects-library.source-filters"]')
    ).toBeNull();
  } finally {
    source.dispose();
  }
  const join = await mountNativeLibrary('transition');
  try {
    await act(async () =>
      useVideoEditorStore
        .getState()
        .setProject({ ...join.project, clips: [join.first], transitions: [] })
    );
    expect(join.host.textContent).toContain(
      translate('videoEditor.effectsLibrary.selectTransitionTarget')
    );
    expect(join.host.querySelector('[data-effect-document]')).toBeNull();
  } finally {
    join.dispose();
  }
});

it.each(['loading', 'error'] as const)(
  'keeps the applied GL value without substituting choices while the catalogue is %s',
  async (status) => {
    const { useGlTransitionCatalog } =
      await import('../../../composition/gl-transition-presets/catalog');
    const { createGlCatalogFixture } =
      await import('../../../composition/gl-transition-presets/catalog.test-support');
    const reload = vi.fn(async () => undefined);
    vi.mocked(useGlTransitionCatalog).mockReturnValue({
      ...createGlCatalogFixture(),
      loading: status === 'loading',
      error: status === 'error',
      reload,
    });
    const fixture = await mountNativeLibrary('transition');
    try {
      const select = [
        ...fixture.host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]'),
      ].find((button) => button.textContent?.includes('Fade'));
      expect(select?.disabled).toBe(true);
      expect(useVideoEditorStore.getState().project!.transitions![0]).toEqual(
        fixture.project.transitions![0]
      );
      if (status === 'error') {
        expect(fixture.host.querySelector('[role="alert"]')?.textContent).toContain(
          translate('videoEditor.effectsLibrary.catalogLoadFailed')
        );
        const retry = [...fixture.host.querySelectorAll('button')].find(
          (button) => button.textContent === translate('common.actions.retry')
        )!;
        await act(async () => retry.click());
        expect(reload).toHaveBeenCalledOnce();
      }
    } finally {
      fixture.dispose();
      vi.mocked(useGlTransitionCatalog).mockImplementation(createGlCatalogFixture);
    }
  }
);

it('uses imported checked GL presets in the library and keeps unsupported sources unavailable', async () => {
  const { useGlTransitionCatalog } =
    await import('../../../composition/gl-transition-presets/catalog');
  const { createGlCatalogFixture, createImportedGlCatalogFixture } =
    await import('../../../composition/gl-transition-presets/catalog.test-support');
  const imported = createImportedGlCatalogFixture();
  imported.catalog.items.push({
    id: 'future',
    name: 'Future source',
    transitionName: 'CrossZoom',
    enabled: true,
    builtin: false,
    status: 'unsupported',
  });
  vi.mocked(useGlTransitionCatalog).mockReturnValue(imported.catalog);
  const fixture = await mountNativeLibrary('transition');
  try {
    const select = [
      ...fixture.host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]'),
    ].find((button) => button.textContent?.includes('Fade'))!;
    await act(async () => select.click());
    expect(
      [...document.querySelectorAll('[role="option"]')].some(
        (option) => option.textContent?.trim() === 'Future source'
      )
    ).toBe(false);
    const choice = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.trim() === 'Saved zoom'
    )!;
    await act(async () => choice.click());
    expect(useVideoEditorStore.getState().project!.transitions![0]).toMatchObject({
      kind: 'gl',
      selection: imported.selection,
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
    });
  } finally {
    fixture.dispose();
    vi.mocked(useGlTransitionCatalog).mockImplementation(createGlCatalogFixture);
  }
});
