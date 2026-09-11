// @vitest-environment jsdom

import { AutoProcessingReviewDockContext } from './auto-transform-modal';
import { usePlaybackShortcuts } from '../../../../runtime/session/playback/shortcuts';
import { useVideoEditorProjectHistoryShortcuts } from '../../../../runtime/session/history-shortcuts';
import type { PlaybackLatestState, PlaybackHandlers } from '../../../../interaction/playback/types';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../../features/video/project/timeline/project-meta.test.helpers';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import type {
  AutoProcessingPreview,
  AutoProcessingRequest,
} from '../../../../project/operations/auto-transform';
import {
  AutoTransformWizard,
  ProjectTimelineAutoProcessingControl,
  type AutoProcessingHeaderProps,
} from './auto-transform-wizard';
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function fixture() {
  const project = createProject([
    createVideoClip({ id: 'one', sourceInstanceId: 'instance' }),
    createVideoClip({ id: 'repeat', sourceInstanceId: 'repeat-instance', startTime: 10 }),
  ]);
  project.duration = 18;
  project.baseRecordingId = 'implicit-base';
  const apply = vi.fn().mockResolvedValue('applied');
  const close = vi.fn();
  const seek = vi.fn();
  const prepare = vi.fn(
    async (
      request: AutoProcessingRequest,
      selected?: readonly string[]
    ): Promise<AutoProcessingPreview> => ({
      status: selected?.length === 0 ? 'unchanged' : 'ready',
      sourceProject: project,
      project: { ...project, duration: 16 },
      request,
      telemetry: [],
      suggestions: [
        {
          id: 'change',
          target: request.targets[0]!,
          kind: 'timing',
          label: 'Clip',
          startTime: 2,
          endTime: 6,
          beforeDuration: 4,
          afterDuration: 2,
          status: 'available',
          reason: null,
        },
        {
          id: 'locked',
          target: request.targets[0]!,
          kind: 'timing',
          label: 'Locked',
          startTime: 7,
          endTime: 8,
          beforeDuration: 1,
          afterDuration: 1,
          status: 'blocked',
          reason: 'locked',
        },
      ],
      selectedIds: selected ? [...selected] : ['change'],
      summary: {
        beforeDuration: 18,
        afterDuration: 16,
        affectedCount: 3,
        shiftedCount: 1,
        removedDuration: 2,
      },
    })
  );
  const props: AutoProcessingHeaderProps = {
    project,
    selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'one' },
    actions: { prepare, apply, isCurrent: () => true },
    onSeek: seek,
    onModalVisibilityChange: vi.fn(),
  };
  return { props, prepare, apply, close, seek };
}
function button(ui: string) {
  const element = document.querySelector<HTMLButtonElement>(`[data-ui="video-editor.auto.${ui}"]`);
  if (!element) throw new Error(ui);
  return element;
}
async function review() {
  await act(async () => button('review').click());
}
it('C4 acceptance: settings alone are not a preview and cannot enable Apply', () => {
  const f = fixture();
  act(() => root.render(<AutoTransformWizard {...f.props} onClose={f.close} />));
  expect(document.querySelector('.sniptale-modal')).not.toBeNull();
  expect(document.querySelector('.sniptale-modal-accent')).toBeNull();
  expect(document.querySelector('[data-ui="video-editor.auto.apply"]')).toBeNull();
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
});
it('keeps review open during analysis and closes only after explicit application', async () => {
  const f = fixture();
  const ready = await f.prepare({
    targets: [{ clipId: 'one', recordingId: 'rec-asset-video', sourceInstanceId: 'instance' }],
    camera: false,
    settings: {
      enabled: true,
      stableSegments: {
        action: 'speed-up',
        minDurationSeconds: 1,
        mergeGapSeconds: 0,
        shoulderSeconds: 0,
        speedUpPlaybackRate: 2,
      },
    },
  });
  let resolve!: (value: AutoProcessingPreview) => void;
  f.prepare.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  act(() => root.render(<ProjectTimelineAutoProcessingControl {...f.props} />));
  act(() => button('open').click());
  await review();
  expect(document.querySelector('.sniptale-modal')).not.toBeNull();
  expect(document.querySelector('[data-ui="video-editor.auto.apply"]')).toBeNull();
  expect(f.apply).not.toHaveBeenCalled();
  await act(async () => resolve(ready));
  expect(document.querySelector('.sniptale-modal')).not.toBeNull();
  expect(button('apply').disabled).toBe(false);
  await act(async () => button('apply').click());
  expect(f.apply).toHaveBeenCalledWith(ready);
  expect(document.querySelector('.sniptale-modal')).toBeNull();
});
it('defaults only the selected exact placement and makes original playback read-only', async () => {
  const f = fixture();
  const dock = document.createElement('div');
  document.body.append(dock);
  act(() =>
    root.render(
      <AutoProcessingReviewDockContext.Provider value={dock}>
        <AutoTransformWizard {...f.props} onClose={f.close} />
      </AutoProcessingReviewDockContext.Provider>
    )
  );
  await review();
  expect(f.prepare.mock.calls[0]?.[0]).toMatchObject({
    targets: [{ clipId: 'one', recordingId: 'rec-asset-video', sourceInstanceId: 'instance' }],
    camera: false,
    settings: { stableSegments: { speedUpPlaybackRate: 4 } },
  });
  expect(document.querySelector('[data-ui="video-editor.auto.preview"]')?.textContent).toContain(
    '18'
  );
  const unavailable = document.querySelector<HTMLInputElement>('[data-status="blocked"] input')!;
  expect(unavailable.disabled).toBe(true);
  const original = document.querySelector<HTMLButtonElement>('[data-status="available"] button')!;
  act(() => original.click());
  expect(f.seek).toHaveBeenCalledWith(2);
  expect(f.apply).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(dock.contains(button('return'))).toBe(true);
  expect(dock.querySelector('[data-ui="video-editor.auto.original"]')?.className).not.toContain(
    'fixed'
  );
  act(() => button('return').click());
  expect(dock.children).toHaveLength(0);
  dock.remove();
  expect(button('apply').disabled).toBe(false);
  expect(document.querySelector<HTMLInputElement>('[data-status="available"] input')?.checked).toBe(
    true
  );
});
it('scope and settings changes invalidate the candidate and removing all suggestions disables Apply', async () => {
  const f = fixture();
  act(() => root.render(<AutoTransformWizard {...f.props} onClose={f.close} />));
  await review();
  const row = document.querySelector<HTMLInputElement>('[data-status="available"] input')!;
  act(() => row.click());
  expect(button('apply').disabled).toBe(true);
  await review();
  expect(f.prepare.mock.calls.at(-1)?.[1]).toEqual([]);
  expect(button('apply').disabled).toBe(true);
  act(() => button('back').click());
  const repeat = document.querySelector<HTMLInputElement>(
    '[data-ui="video-editor.auto.scope"][data-clip-id="repeat"] input'
  )!;
  act(() => repeat.click());
  expect(document.querySelector('[data-ui="video-editor.auto.preview"]')).toBeNull();
  await review();
  expect(f.prepare.mock.calls.at(-1)?.[0].targets).toHaveLength(2);
});
it('selects eligible recordings for history-lane processing and disables stale previews', async () => {
  const f = fixture();
  act(() =>
    root.render(
      <AutoTransformWizard
        {...f.props}
        selection={{ kind: VideoEditorSelectionKind.HISTORY_LANE }}
        onClose={f.close}
      />
    )
  );
  expect(button('review').disabled).toBe(false);
  const first = document.querySelector<HTMLInputElement>(
    '[data-ui="video-editor.auto.scope"] input'
  )!;
  expect(first.checked).toBe(true);
  await review();
  act(() =>
    root.render(
      <AutoTransformWizard
        {...f.props}
        actions={{ ...f.props.actions, isCurrent: () => false }}
        onClose={f.close}
      />
    )
  );
  expect(button('apply').disabled).toBe(true);
  expect(document.body.textContent).toContain('autoStale');
});
it('cancel during pending work causes no application and ignores late analysis', async () => {
  const f = fixture();
  f.prepare.mockImplementation(() => new Promise(() => {}));
  act(() => root.render(<ProjectTimelineAutoProcessingControl {...f.props} />));
  act(() => button('open').click());
  await review();
  const cancel = Array.from(document.querySelectorAll('button')).find(
    (node) => node.textContent === 'common.actions.cancel'
  )!;
  act(() => cancel.click());
  expect(document.querySelector('.sniptale-modal')).toBeNull();
  expect(f.apply).not.toHaveBeenCalled();
});
it('shows sourceless clips disabled with an explanation before analysis', () => {
  const f = fixture();
  f.props.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'source-only' };
  act(() => root.render(<AutoTransformWizard {...f.props} onClose={f.close} />));
  const unavailable = document.querySelector<HTMLInputElement>(
    '[data-ui="video-editor.auto.scope"] input'
  )!;
  expect(unavailable.disabled).toBe(true);
  expect(unavailable.closest('label')?.textContent).toContain('autoTransformUnavailable');
  expect(button('review').disabled).toBe(true);
});

it('escapes the timeline containing block and exposes only one step at a time', async () => {
  const f = fixture();
  container.style.transform = 'translateZ(0)';
  container.style.overflow = 'hidden';
  act(() => root.render(<AutoTransformWizard {...f.props} onClose={f.close} />));
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  expect(container.contains(dialog)).toBe(false);
  expect(document.querySelector('[data-ui="video-editor.auto.apply"]')).toBeNull();
  const reviewButton = document.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.auto.review"]'
  )!;
  await act(async () => reviewButton.click());
  expect(document.querySelector('[data-ui="video-editor.auto.scope"]')).toBeNull();
  expect(document.querySelector('[data-ui="video-editor.auto.suggestion"]')).not.toBeNull();
});

it('owns title, modal focus, Tab wrapping, Escape and opener restoration', () => {
  const f = fixture();
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  act(() => root.render(<ProjectTimelineAutoProcessingControl {...f.props} />));
  act(() => button('open').click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toContain(
    'autoTransformWizardTitle'
  );
  expect(document.activeElement).toBe(dialog);
  const reviewButton = button('review');
  reviewButton.focus();
  act(() =>
    reviewButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(dialog.querySelector('button'));
  act(() =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});
it('does not dismiss or submit a second time while authoritative Apply is pending', async () => {
  const f = fixture();
  let resolve!: (value: string) => void;
  f.apply.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  act(() => root.render(<AutoTransformWizard {...f.props} onClose={f.close} />));
  await review();
  await act(async () => button('apply').click());
  expect(button('apply').disabled).toBe(true);
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(f.close).not.toHaveBeenCalled();
  act(() => button('apply').click());
  expect(f.apply).toHaveBeenCalledTimes(1);
  await act(async () => resolve('applied'));
  expect(f.close).toHaveBeenCalledOnce();
});

it('Escape from a pointer-opened parameter closes only the select and keeps the draft', async () => {
  const f = fixture();
  act(() => root.render(<AutoTransformWizard {...f.props} onClose={f.close} />));
  const parameter = document.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.timeline.autoIdle"]'
  )!;
  act(() => {
    parameter.focus();
    parameter.click();
  });
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  act(() =>
    parameter.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(f.close).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>('[data-clip-id="one"] input')?.checked).toBe(
    true
  );
});

it('restores the history command after original viewing, returning and applying', async () => {
  const f = fixture();
  act(() => root.render(<ProjectTimelineAutoProcessingControl {...f.props} />));
  const opener = button('open');
  opener.focus();
  act(() => opener.click());
  await review();
  act(() => document.querySelector<HTMLButtonElement>('[data-status="available"] button')!.click());
  button('return').focus();
  act(() => button('return').click());
  await act(async () => button('apply').click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it('shows one empty result message when no changes are found', async () => {
  const f = fixture();
  f.prepare.mockImplementation(async (request) => ({
    status: 'unchanged',
    sourceProject: f.props.project,
    project: f.props.project,
    request,
    telemetry: [],
    suggestions: [],
    selectedIds: [],
    summary: {
      beforeDuration: 18,
      afterDuration: 18,
      affectedCount: 0,
      shiftedCount: 0,
      removedDuration: 0,
    },
  }));
  act(() => root.render(<AutoTransformWizard {...f.props} onClose={f.close} />));
  await review();
  expect(document.body.textContent?.match(/videoEditor.timeline.autoNoChanges/g)).toHaveLength(1);
  expect(button('apply').disabled).toBe(true);
});

it('isolates Delete, Space and Undo during setup/review and restores shortcuts around original viewing', async () => {
  const f = fixture();
  const remove = vi.fn();
  const play = vi.fn();
  const undo = vi.fn();
  const noop = vi.fn();
  const state: { current: PlaybackLatestState } = {
    current: {
      project: f.props.project,
      currentTime: 0,
      isPlaying: false,
      placementMode: null,
      playbackRange: null,
      projectHistoryTransactionActive: false,
      selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'one' },
      selectedClipId: 'one',
      selectedMotionRegion: null,
      selectedActionOccurrence: null,
    },
  };
  const handlers: { current: PlaybackHandlers } = {
    current: {
      clearPlacementMode: noop,
      deleteActionEvent: noop,
      deleteClip: remove,
      deleteCursorSample: noop,
      deleteEffectInstance: noop,
      deleteMotionRegion: noop,
      deleteObjectTrack: noop,
      duplicateClip: noop,
      setCurrentTime: noop,
      setPlaying: noop,
      splitClipAt: noop,
      updateActionEventDetails: noop,
      updateClipTransform: noop,
      updateMotionRegion: noop,
    },
  };
  function Harness() {
    const [blocking, onModalVisibilityChange] = useState(false);
    usePlaybackShortcuts(state, handlers, noop, noop, play, !blocking);
    useVideoEditorProjectHistoryShortcuts({
      enabled: !blocking,
      status: { canUndo: true, canRedo: true, error: null },
      undo,
      redo: noop,
    });
    return <ProjectTimelineAutoProcessingControl {...{ ...f.props, onModalVisibilityChange }} />;
  }
  const key = (target: Element, code: string, ctrlKey = false) => {
    const event = new KeyboardEvent('keydown', {
      code,
      key: code === 'Space' ? ' ' : code,
      ctrlKey,
      bubbles: true,
      cancelable: true,
    });
    act(() => target.dispatchEvent(event));
    return event;
  };
  act(() => root.render(<Harness />));
  act(() => button('open').click());
  const checkbox = document.querySelector<HTMLInputElement>(
    '[data-ui="video-editor.auto.scope"] input'
  )!;
  expect(key(checkbox, 'Space').defaultPrevented).toBe(false);
  key(button('review'), 'Delete');
  key(button('review'), 'KeyZ', true);
  expect(remove).not.toHaveBeenCalled();
  expect(play).not.toHaveBeenCalled();
  expect(undo).not.toHaveBeenCalled();
  await review();
  key(button('apply'), 'Delete');
  expect(remove).not.toHaveBeenCalled();
  act(() => document.querySelector<HTMLButtonElement>('[data-status="available"] button')!.click());
  key(button('return'), 'Space');
  expect(play).toHaveBeenCalledTimes(1);
  act(() => button('return').click());
  key(button('apply'), 'Space');
  expect(play).toHaveBeenCalledTimes(1);
  key(button('apply'), 'Escape');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  key(button('open'), 'Space');
  key(button('open'), 'KeyZ', true);
  expect(play).toHaveBeenCalledTimes(2);
  expect(undo).toHaveBeenCalledTimes(1);
});
