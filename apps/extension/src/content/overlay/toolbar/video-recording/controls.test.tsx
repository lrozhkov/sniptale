// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToolbarVideoRecordingControls } from './controls';
import { createRecordingDrawingOwner } from './drawing-session';
import {
  INITIAL_VIDEO_RECORDING_TOOLBAR_STATE,
  type VideoRecordingToolbarState,
} from '../../video-recording/session/state';
import type { ToolbarVideoRecordingProps } from '../types';

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
  error: string | null = null
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
      <ToolbarVideoRecordingControls
        displayMode={displayMode}
        onCollapse={vi.fn()}
        onCompactMenusChange={vi.fn()}
        onDisplayModeChange={vi.fn()}
        recording={recording}
        toolbarMenuState={toolbarMenuState}
      />
    )
  );
  return actions;
}

function queryButton(dataUi: string): HTMLButtonElement | null {
  return host.querySelector(`[data-ui="${dataUi}"]`);
}

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
  expect(host.querySelector('fieldset')?.hasAttribute('disabled')).toBe(busy);
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
