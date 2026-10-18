// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewActionHistory } from './action-history';
import type { ReviewOriginalSpeechPanel } from './speech-panel';
import type { ReviewSelectedProperties } from './selected-properties';
import { ReviewInspectorBinding } from './inspector-binding';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
import { translate } from '../../platform/i18n';

const sceneProbe = vi.hoisted(() => ({ enabled: false, captionsLocked: false }));
const backupExport = vi.hoisted(() => vi.fn());
vi.mock('../../workflows/media-hub-backup', async (original) => ({
  ...(await original<typeof import('../../workflows/media-hub-backup')>()),
  exportMediaHubBackup: backupExport,
}));
vi.mock('./advanced-panels', () => ({
  ReviewSceneProperties: (props: { cursorPath: ReactNode; captionsLocked?: boolean }) => {
    sceneProbe.captionsLocked = props.captionsLocked ?? false;
    return <div>{props.cursorPath}</div>;
  },
  ReviewAdvancedPanels: () => null,
}));
vi.mock('./inspector', () => ({
  ReviewInspector: (props: {
    onBackup(): void;
    message: string | null;
    scene: ReactNode;
    speech: ReactNode;
    actionHistory: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <button onClick={props.onBackup}>Backup current work</button>
      <p role="status">{props.message}</p>
      {sceneProbe.enabled ? props.scene : null}
      {props.speech}
      {props.actionHistory}
      {props.children}
    </div>
  ),
}));
vi.mock('./action-history', () => ({
  ReviewActionHistory: (props: ComponentProps<typeof ReviewActionHistory>) => (
    <button disabled={!props.markers.length} onClick={() => props.onSelect(props.markers[0]!)}>
      Choose recorded event
    </button>
  ),
}));
vi.mock('./speech-panel', () => ({
  ReviewOriginalSpeechPanel: (props: ComponentProps<typeof ReviewOriginalSpeechPanel>) => (
    <>
      <button onClick={() => void props.flushAdvanced()}>Flush source buffers</button>
      <button onClick={() => props.onJump?.(3)}>Seek source phrase</button>
    </>
  ),
}));
vi.mock('./selected-properties', () => ({
  reviewSelectionLabel: () => 'Voiceover',
  ReviewSelectedProperties: (props: ComponentProps<typeof ReviewSelectedProperties>) => (
    <>
      <button onClick={() => void props.flushAdvanced?.()}>Flush clip buffers</button>
      <button onClick={() => props.onSelectText?.('related')}>Open related text</button>
      <button onClick={() => props.onSelectText?.('missing')}>Open missing text</button>
      <button onClick={() => props.onPreviewFrame?.(2)}>Preview source frame</button>
      <button
        onClick={() =>
          props.onFocus(createQuickEditZoomRegion({ id: 'history-focus', at: 1, duration: 2 }))
        }
      >
        Focus recorded interval
      </button>
    </>
  ),
  ReviewSelectedTextProperties: () => null,
}));

async function checkCaptionLockAdmission(
  root: ReturnType<typeof createRoot>,
  sceneProps: ComponentProps<typeof ReviewInspectorBinding>
) {
  expect(sceneProbe.captionsLocked).toBe(false);
  await act(async () =>
    root.render(
      <ReviewInspectorBinding
        {...sceneProps}
        state={{
          ...sceneProps.state,
          advanced: {
            ...sceneProps.state.advanced,
            ui: { ...sceneProps.state.advanced.ui, lockedTracks: { text: true } },
          },
        }}
      />
    )
  );
  expect(sceneProbe.captionsLocked).toBe(false);
  await act(async () => root.render(<ReviewInspectorBinding {...sceneProps} />));
  expect(sceneProbe.captionsLocked).toBe(false);
}

it('joins every editor buffer for either recognition source and guards related-text navigation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const order: string[] = [];
  const pause = vi.fn();
  const seek = vi.fn();
  const select = vi.fn();
  let allowed = false;
  const advanced = createQuickEditAdvancedState();
  const props = {
    resource: { filename: 'video', file: new Blob(), source: {}, session: {} },
    state: {
      message: 'Backup refused',
      actionSoundPreview: { audition: vi.fn(), stopAudition: vi.fn() },
      advanced,
      activeSelection: { kind: 'audio', id: 'clip', lane: 'voiceover' },
      selection: { kind: 'none' },
      projected: {
        markers: [{ ref: { kind: 'action', id: 'recorded' }, type: 'CLICK', start: 1, end: 1.2 }],
      },
      snapshot: {
        snapshot: { workspace: { advanced, sourceAssetId: 'source' } },
        document: { annotations: [], edits: [] },
      },
      text: {
        document: { fragments: [{ id: 'related' }] },
        sourceInterval: () => ({ start: 9, end: 10 }),
      },
      timeline: {
        sceneOutputTime: 0,
        timeMap: { getSegments: () => [], timelineToSource: (time: number) => time * 2 },
      },
      composer: {
        flush: async () => {
          order.push('notes');
        },
      },
      flushAdvanced: async () => {
        order.push('advanced');
      },
      video: { current: { pause } },
      seek,
      setActiveSelection: select,
      beforeAction: (action: () => void) => {
        if (allowed) action();
      },
      editing: { exporter: { phase: 'idle', index: null } },
      zoom: { addRegion: vi.fn(() => 'focus'), setSelection: vi.fn() },
      canStart: () => true,
      setMode: vi.fn(),
      setTrackVisibility: vi.fn(),
      features: {},
    },
    canvasComments: {
      flushTexts: async () => {
        order.push('canvas');
      },
    },
    audio: { assets: new Map() },
    navigation: { setSection: vi.fn() },
  } as unknown as ComponentProps<typeof ReviewInspectorBinding>;
  const click = (label: string) =>
    act(async () => {
      const button = Array.from(host.querySelectorAll('button')).find(
        (node) => node.textContent === label
      );
      if (!button) throw new Error('Missing fixture action');
      button.click();
    });
  try {
    await act(async () => root.render(<ReviewInspectorBinding {...props} />));
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Backup refused');
    await click('Flush source buffers');
    await click('Flush clip buffers');
    expect(order).toEqual(['notes', 'advanced', 'canvas', 'notes', 'advanced', 'canvas']);
    const { workspace } =
      await import('../../composition/persistence/review-workspaces/backup-restore.test-support');
    const expectedReview = { workspace, draft: null };
    const save = vi.fn(async () => {
      order.push('save');
      return expectedReview;
    });
    const failure = vi.fn();
    const backupProps = {
      ...props,
      state: {
        ...props.state,
        session: { ...props.state.session, saveBuffered: save },
        run: async (action: () => Promise<unknown>) => {
          try {
            await action();
          } catch {
            failure();
          }
        },
      },
    };
    await act(async () => root.render(<ReviewInspectorBinding {...backupProps} />));
    backupExport.mockImplementationOnce(async () => {
      order.push('export');
    });
    await click('Backup current work');
    expect(order.slice(-5)).toEqual(['notes', 'advanced', 'canvas', 'save', 'export']);
    expect(backupExport).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'selected',
        selected: {
          mediaAssetIds: [workspace.aggregateId],
          scenarioProjectIds: [],
          videoProjectIds: [],
        },
      }),
      { expectedReview, requireSelected: true }
    );
    save.mockRejectedValueOnce(new Error('Save refused'));
    await click('Backup current work');
    expect(failure).toHaveBeenCalledOnce();
    expect(backupExport).toHaveBeenCalledOnce();
    await click('Backup current work');
    expect(backupExport).toHaveBeenCalledTimes(2);
    await act(async () => root.render(<ReviewInspectorBinding {...props} />));

    await click('Open related text');
    expect(select).not.toHaveBeenCalled();
    allowed = true;
    await click('Open missing text');
    expect(select).not.toHaveBeenCalled();
    await click('Open related text');
    expect(pause).toHaveBeenCalledOnce();
    expect(seek).toHaveBeenCalledWith(9, false);
    expect(select).toHaveBeenCalledWith({ kind: 'text', id: 'related' });
    await click('Seek source phrase');
    expect(seek).toHaveBeenLastCalledWith(3, false);
    await click('Preview source frame');
    expect(seek).toHaveBeenLastCalledWith(2, false);
    await click('Focus recorded interval');
    expect(props.state.zoom.setSelection).toHaveBeenCalledWith('focus');
    expect(props.state.setTrackVisibility).toHaveBeenCalledWith('zoom', true);
    expect(props.state.setMode).toHaveBeenCalledWith('advanced');
    expect(seek).toHaveBeenLastCalledWith(4, false);
    allowed = false;
    const selections = select.mock.calls.length;
    await click('Choose recorded event');
    expect(select).toHaveBeenCalledTimes(selections);
    allowed = true;
    await click('Choose recorded event');
    expect(select).toHaveBeenLastCalledWith({
      kind: 'telemetry',
      ref: { kind: 'action', id: 'recorded' },
    });
    expect(props.navigation.setSection).toHaveBeenCalledWith('selected');
    expect(seek).toHaveBeenLastCalledWith(1, false);

    const path: CursorFocusPath = {
      version: 1,
      smoothing: 0.5,
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
            { id: 'key', time: 1, x: 0.25, y: 0.25, anchor: 'manual', interpolation: 'smooth' },
          ],
        },
      ],
    };
    const changePath = vi.fn(),
      selectKey = vi.fn();
    const cursorProps: ComponentProps<typeof ReviewInspectorBinding> = {
      ...props,
      resource: { ...props.resource, source: { ...props.resource.source, duration: 4 } },
      state: {
        ...props.state,
        activeSelection: { kind: 'cursor-focus', id: 'key', time: 1 },
        time: 1,
        busy: false,
        playing: false,
        cursorFocusPath: path,
        cursorFocusKeys: [],
        setCursorFocusPath: changePath,
        selectCursorFocusKey: selectKey,
      },
    };
    await act(async () => root.render(<ReviewInspectorBinding {...cursorProps} />));
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          `[aria-label="${translate('videoEditor.sidebar.cursorFocusAdd')}"]`
        )!
        .click()
    );
    expect(changePath).toHaveBeenCalledOnce();
    expect(selectKey).toHaveBeenCalledWith(expect.any(String), 1);
    expect(changePath.mock.lastCall![0].segments[0].keys).toHaveLength(2);
    await act(async () =>
      root.render(
        <ReviewInspectorBinding {...cursorProps} state={{ ...cursorProps.state, playing: true }} />
      )
    );
    expect(
      host.querySelector<HTMLFieldSetElement>('[data-ui="cursorFocusPath.inspector"]')!.disabled
    ).toBe(true);

    sceneProbe.enabled = true;
    const setPolicy = vi.fn();
    const sceneProps = {
      ...cursorProps,
      resource: { ...cursorProps.resource, source: { width: 320, height: 180, duration: 4 } },
      state: {
        ...cursorProps.state,
        watermark: {},
        backgroundImport: {},
        setCameraFollowDefaults: setPolicy,
        features: { background: advanced.background },
      },
    } as unknown as ComponentProps<typeof ReviewInspectorBinding>;
    await act(async () => root.render(<ReviewInspectorBinding {...sceneProps} />));
    await checkCaptionLockAdmission(root, sceneProps);
    const scene = host.querySelector('[data-ui="cursorFocusPath.settings"]')!;
    const fast = Array.from(scene.querySelectorAll('button')).find(
      (node) => node.textContent === translate('videoEditor.sidebar.cameraFast')
    )!;
    await act(async () => fast.click());
    expect(setPolicy).toHaveBeenLastCalledWith(
      expect.objectContaining({ transitionDuration: 0.2 })
    );
    await act(async () =>
      root.render(
        <ReviewInspectorBinding {...sceneProps} state={{ ...sceneProps.state, playing: true }} />
      )
    );
    expect(
      host.querySelector<HTMLFieldSetElement>('[data-ui="cursorFocusPath.settings"]')!.disabled
    ).toBe(true);
  } finally {
    sceneProbe.enabled = false;
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
