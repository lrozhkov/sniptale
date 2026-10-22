// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToolbarVideoRecordingControls } from './controls';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { createRecordingDrawingOwner } from './drawing-session';
import {
  INITIAL_VIDEO_RECORDING_TOOLBAR_STATE,
  type VideoRecordingToolbarState,
} from '../../video-recording/session/state';
import type { ToolbarVideoRecordingProps } from '../types';
import {
  RecordingToolbarControlsContext,
  type useRecordingToolbarControls,
} from '../state/recording-controls';

const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  showToast: showToastMock,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let drawingOwner: ReturnType<typeof createRecordingDrawingOwner>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', {
    mediaDevices: { enumerateDevices: vi.fn().mockResolvedValue([]) },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  drawingOwner = createRecordingDrawingOwner();
});

afterEach(() => {
  act(() => root.unmount());
  drawingOwner.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPhase(
  phase: VideoRecordingToolbarState['phase'],
  displayMode: 'horizontal' | 'vertical' = 'horizontal',
  error: string | null = null,
  visibility: ReturnType<typeof useRecordingToolbarControls> | null = null
) {
  const toolbarMenuState = {
    activeMenuType: null,
    closeMenu: vi.fn(),
    closeMenus: vi.fn(),
    setActiveMenuType: vi.fn(),
    setShowCaptureMenu: vi.fn(),
    setShowTimerMenu: vi.fn(),
    setViewportMenuOpen: vi.fn(),
    showCaptureMenu: false,
    showTimerMenu: false,
    toggleMenu: vi.fn(),
    viewportMenuOpen: false,
  };
  const actions = {
    onActivate: vi.fn(() => true),
    onCancelStart: vi.fn(),
    onCameraEnabledChange: vi.fn(),
    onCameraGeometryChange: vi.fn(),
    onCameraOffer: vi.fn(async () => 'answer'),
    onCameraPeerClose: vi.fn(),
    onDeactivate: vi.fn(() => true),
    onInteractionChange: vi.fn(),
    onMicrophoneEnabledChange: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onSpotlightEnabledChange: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
  };
  const state: VideoRecordingToolbarState = {
    ...INITIAL_VIDEO_RECORDING_TOOLBAR_STATE,
    error,
    phase,
    recordingId:
      phase === 'recording' || phase === 'paused' || phase === 'stopping' ? 'recording-1' : null,
  };
  const recording = { drawingOwner, state, ...actions } satisfies ToolbarVideoRecordingProps;
  act(() =>
    root.render(
      <RecordingToolbarControlsContext.Provider value={visibility}>
        <CommandPressScope value={true}>
          <ToolbarVideoRecordingControls
            displayMode={displayMode}
            onCollapse={vi.fn()}
            onCompactMenusChange={vi.fn()}
            onDisplayModeChange={vi.fn()}
            recording={recording}
            toolbarMenuState={toolbarMenuState}
          />
        </CommandPressScope>
      </RecordingToolbarControlsContext.Provider>
    )
  );
  return actions;
}

function queryButton(dataUi: string): HTMLButtonElement | null {
  return host.querySelector(`[data-ui="${dataUi}"]`);
}

function visibilityState(
  overrides: Partial<ReturnType<typeof useRecordingToolbarControls>> = {}
): ReturnType<typeof useRecordingToolbarControls> {
  return {
    active: false,
    controls: {},
    editing: false,
    error: null,
    pending: false,
    ready: true,
    reload: vi.fn(async () => undefined),
    setVisible: vi.fn(async () => undefined),
    toggleEditing: vi.fn(),
    ...overrides,
  };
}

it('customizes icons without activating their tools or media controls', () => {
  const visibility = visibilityState({ editing: true, controls: { pencil: false } });
  const actions = renderPhase('idle', 'horizontal', null, visibility);
  const previousTool = drawingOwner.controller.session.getSnapshot().activeTool;
  const pencil = queryButton('content.toolbar.video-recording.visibility.pencil')!;
  expect(pencil.getAttribute('aria-pressed')).toBe('false');
  expect(pencil.querySelector('.lucide-eye-off')).not.toBeNull();
  act(() => pencil.click());
  act(() => queryButton('content.toolbar.video-recording.visibility.microphone')?.click());
  act(() => queryButton('content.toolbar.video-recording.visibility.camera')?.click());
  expect(visibility.setVisible).toHaveBeenNthCalledWith(1, 'pencil', true);
  expect(visibility.setVisible).toHaveBeenNthCalledWith(2, 'microphone', false);
  expect(visibility.setVisible).toHaveBeenNthCalledWith(3, 'camera', false);
  expect(actions.onMicrophoneEnabledChange).not.toHaveBeenCalled();
  expect(actions.onCameraEnabledChange).not.toHaveBeenCalled();
  expect(drawingOwner.controller.session.getSnapshot().activeTool).toBe(previousTool);
  expect(queryButton('content.toolbar.video-recording.start')?.disabled).toBe(true);
  expect(
    queryButton('content.toolbar.video-recording.auto-hide')?.closest('fieldset')?.disabled
  ).toBe(true);
});

it.each(['starting', 'recording', 'paused', 'stopping'] as const)(
  'keeps required controls and hides configured tools during %s',
  (phase) => {
    const visibility = visibilityState({
      active: true,
      controls: {
        pencil: false,
        eraser: false,
        clear: false,
        cursor: false,
        camera: false,
        microphone: false,
      },
    });
    renderPhase(phase, 'horizontal', null, visibility);
    expect(queryButton('content.toolbar.settings-button')).toBeNull();
    expect(queryButton('content.toolbar.video-recording.customize')).toBeNull();
    expect(queryButton('content.toolbar.video-recording.auto-hide')).toBeNull();
    expect(queryButton('content.toolbar.drawing.pencil')).toBeNull();
    expect(queryButton('content.toolbar.drawing.text')).not.toBeNull();
    expect(queryButton('content.toolbar.video-recording.camera.toggle')).toBeNull();
    expect(queryButton('content.toolbar.video-recording.microphone.toggle')).toBeNull();
    expect(queryButton('content.toolbar.video-recording.navigation')).not.toBeNull();
    expect(host.querySelector('[data-ui="content.toolbar.drawing-actions-group"]')).toBeNull();
    expect(
      host.querySelector('[data-ui="content.toolbar.video-recording.lifecycle"] button')
    ).not.toBeNull();
  }
);

it('restores hidden tools outside recording without changing their saved visibility', () => {
  const visibility = visibilityState({ controls: { pencil: false, camera: false } });
  renderPhase('idle', 'horizontal', null, visibility);
  expect(queryButton('content.toolbar.drawing.pencil')).not.toBeNull();
  expect(queryButton('content.toolbar.video-recording.camera.toggle')).not.toBeNull();
  act(() => queryButton('content.toolbar.video-recording.customize')?.click());
  expect(visibility.toggleEditing).toHaveBeenCalledOnce();
  expect(visibility.setVisible).not.toHaveBeenCalled();
});

it.each([
  ['idle', 'start', false],
  ['starting', 'cancel-start', true],
  ['recording', 'pause', false],
  ['paused', 'resume', false],
  ['stopping', 'stopping', true],
  ['error', 'start', false],
] as const)('projects %s lifecycle controls and busy availability', (phase, action, busy) => {
  renderPhase(phase);

  expect(queryButton(`content.toolbar.video-recording.${action}`)).not.toBeNull();
  expect(
    queryButton('content.toolbar.video-recording.navigation')
      ?.closest('fieldset')
      ?.hasAttribute('disabled')
  ).toBe(busy);
  expect(queryButton('content.toolbar.video-recording.microphone.toggle')?.disabled).toBe(busy);
  expect(queryButton('content.toolbar.video-recording.camera.toggle')?.disabled).toBe(busy);
  expect(queryButton('content.toolbar.video-recording.stop') !== null).toBe(
    phase === 'recording' || phase === 'paused'
  );
  const lifecycle = host.querySelector('[data-ui="content.toolbar.video-recording.lifecycle"]');
  const usesTwoActions = phase === 'recording' || phase === 'paused';
  expect(lifecycle?.querySelectorAll('button')).toHaveLength(usesTwoActions ? 2 : 1);
  expect(lifecycle?.querySelector('.sniptale-video-recording-status') !== null).toBe(
    phase === 'recording' || phase === 'paused' || phase === 'stopping'
  );
});

it('reports recording failures through canonical feedback without adding an unanchored toolbar block', () => {
  renderPhase('error', 'horizontal', 'The recording action failed.');
  renderPhase('idle');
  renderPhase('error', 'horizontal', 'The recording action failed.');

  expect(showToastMock).toHaveBeenCalledTimes(2);
  expect(showToastMock).toHaveBeenLastCalledWith('The recording action failed.', 'error');
  expect(host.querySelector('[data-ui="content.toolbar.video-recording.error"]')).toBeNull();
});

it('keeps cancel-start clickable while all non-lifecycle controls are disabled', () => {
  const actions = renderPhase('starting');
  const cancel = queryButton('content.toolbar.video-recording.cancel-start');

  expect(cancel?.disabled).toBe(false);
  act(() => cancel?.click());
  expect(actions.onCancelStart).toHaveBeenCalledOnce();
});

it('explains that Start uses the saved popup Video settings without adding new UI', () => {
  renderPhase('idle');

  const start = queryButton('content.toolbar.video-recording.start');
  expect(start?.title).toBe('content.toolbar.videoRecordingStartHint');
  expect(start?.textContent).toBe('');
});

it('preserves the original Start event through the adopted command owner', () => {
  const actions = renderPhase('idle');
  const start = queryButton('content.toolbar.video-recording.start')!;
  const nativeEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => start.dispatchEvent(nativeEvent));
  expect(actions.onStart).toHaveBeenCalledExactlyOnceWith(nativeEvent);
});

it('offers Cancel before any confirmed start and restores focus', async () => {
  const actions = renderPhase('idle');
  actions.onStart.mockResolvedValueOnce('confirmation-required');
  const start = queryButton('content.toolbar.video-recording.start')!;
  await act(async () => start.click());
  const dialog = host.querySelector('[role="alertdialog"]')!;
  expect(dialog).not.toBeNull();
  const cancel = Array.from(dialog.querySelectorAll('button')).find(
    (button) => button.textContent === 'common.actions.cancel'
  )!;
  act(() => cancel.click());
  expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  expect(actions.onStart).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(start);
});

it('uses the actual Continue event and remembered choice without repeating activation', async () => {
  const actions = renderPhase('idle');
  actions.onStart.mockResolvedValueOnce('confirmation-required').mockResolvedValueOnce('started');
  await act(async () => queryButton('content.toolbar.video-recording.start')!.click());
  const dialog = host.querySelector('[role="alertdialog"]')!;
  act(() => dialog.querySelector<HTMLInputElement>('input')!.click());
  const continueButton = Array.from(dialog.querySelectorAll('button')).find(
    (button) => button.textContent === 'content.toolbar.videoRecordingWithoutMicrophoneContinue'
  )!;
  const continueEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
  await act(async () => continueButton.dispatchEvent(continueEvent));
  expect(actions.onStart).toHaveBeenNthCalledWith(2, continueEvent, {
    confirmedWithoutMicrophone: true,
    rememberWithoutMicrophone: true,
  });
  expect(actions.onStart).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alertdialog"]')).toBeNull();
});

it('keeps a paused lifecycle command distinct from persistent tools and properties', () => {
  renderPhase('paused');
  const resume = queryButton('content.toolbar.video-recording.resume')!;
  expect(resume.hasAttribute('data-active')).toBe(false);
  expect(resume.hasAttribute('aria-pressed')).toBe(false);
  expect(resume.hasAttribute('data-command-press')).toBe(true);
  const microphone = queryButton('content.toolbar.video-recording.microphone.toggle')!;
  expect(microphone.getAttribute('data-command-property')).toBe('true');
  expect(microphone.getAttribute('aria-pressed')).toBe('false');
  expect(microphone.parentElement?.hasAttribute('data-active')).toBe(false);
  expect(
    queryButton('content.toolbar.video-recording.navigation')?.getAttribute('data-content-tool')
  ).toBe('true');
});

it('uses recording navigation grouping without a visible pin control', () => {
  renderPhase('idle');

  expect(
    queryButton('content.toolbar.video-recording.navigation')
      ?.querySelector('svg')
      ?.classList.contains('lucide-touchpad')
  ).toBe(true);
  expect(host.querySelector('.lucide-pin')).toBeNull();
  expect(queryButton('content.toolbar.settings-button')).not.toBeNull();
  expect(queryButton('content.toolbar.video-recording.collapse')).toBeNull();
  expect(
    queryButton('content.toolbar.video-recording.spotlight')
      ?.querySelector('svg')
      ?.classList.contains('lucide-mouse-pointer-2')
  ).toBe(true);
});

it('groups auto-hide, eraser, clear, and cursor spotlight in that order', () => {
  renderPhase('idle');

  const actionGroup = host.querySelector('[data-ui="content.toolbar.drawing-actions-group"]');
  expect(
    [...(actionGroup?.querySelectorAll('button') ?? [])].map((button) =>
      button.getAttribute('data-ui')
    )
  ).toEqual([
    'content.toolbar.video-recording.auto-hide',
    'content.toolbar.video-recording.eraser',
    'content.toolbar.video-recording.clear',
    'content.toolbar.video-recording.spotlight',
  ]);
});
