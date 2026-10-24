// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  getVideoRecordingProfile,
} from '@sniptale/runtime-contracts/video/types/types';
import { RecordingSetupControls } from './setup-menu';
import { createBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';
import { useToolbarMenuState } from '../state/menu';
import { INITIAL_VIDEO_RECORDING_TOOLBAR_STATE } from '../../video-recording/session/state';
import { createRecordingDrawingOwner } from './drawing-session';
import type { ToolbarVideoRecordingProps } from '../types';

const mocks = vi.hoisted(() => ({ fail: false, toast: vi.fn() }));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.toast }));
vi.mock('../../../../platform/i18n', () => ({ translate: (key: string) => key }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let drawingOwner: ReturnType<typeof createRecordingDrawingOwner>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  drawingOwner = createRecordingDrawingOwner();
  mocks.fail = false;
  mocks.toast.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  drawingOwner.dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function Harness() {
  const toolbarMenuState = useToolbarMenuState();
  const [settings, setSettings] = useState(DEFAULT_VIDEO_SETTINGS);
  const [captureMode, onCaptureModeChange] = useState<'TAB' | 'TAB_CROP'>(CaptureMode.TAB);
  const recording: ToolbarVideoRecordingProps = {
    drawingOwner,
    state: { ...INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, outputSettings: settings },
    captureMode,
    onCaptureModeChange,
    onQualityProfileChange: async (id) => {
      if (mocks.fail) throw new Error('refused');
      const profile = getVideoRecordingProfile(settings, id);
      if (profile)
        setSettings({ ...settings, qualityProfileId: id, outputProfile: profile.configuration });
    },
    onOutputProfileChange: async (outputProfile) => {
      setSettings({ ...settings, qualityProfileId: null, outputProfile });
    },
    onActivate: () => true,
    onCancelStart: () => {},
    onCameraEnabledChange: () => {},
    onCameraGeometryChange: () => {},
    onCameraOffer: async () => 'answer',
    onCameraPeerClose: () => {},
    onDeactivate: () => true,
    onInteractionChange: () => {},
    onMicrophoneEnabledChange: () => {},
    onPause: () => {},
    onResume: () => {},
    onSpotlightEnabledChange: () => {},
    onStart: () => {},
    onStop: () => {},
  };
  return (
    <RecordingSetupControls
      displayMode="horizontal"
      recording={recording}
      toolbarMenuState={toolbarMenuState}
    />
  );
}
function query(name: string) {
  return host.querySelector<HTMLButtonElement>(
    `[data-ui="content.toolbar.video-recording.${name}"]`
  );
}
async function click(name: string) {
  await act(async () => query(name)?.click());
}
function mount() {
  act(() => root.render(<Harness />));
}

it('selects an accepted profile, closes its menu and exposes the new current state', async () => {
  mount();
  await click('quality.menu');
  expect(query('quality.dropdown')).not.toBeNull();
  await click('quality.profile.builtin:compact');
  expect(query('quality.dropdown')).toBeNull();
  await click('quality.menu');
  expect(query('quality.profile.builtin:compact')?.getAttribute('aria-pressed')).toBe('true');
});

it('keeps failed selection recoverable and permits explicit retry', async () => {
  mount();
  await click('quality.menu');
  mocks.fail = true;
  await click('quality.profile.builtin:compact');
  expect(query('quality.dropdown')).not.toBeNull();
  expect(mocks.toast).toHaveBeenCalledOnce();
  expect(query('quality.profile.builtin:optimal')?.getAttribute('aria-pressed')).toBe('true');
  mocks.fail = false;
  await click('quality.profile.builtin:compact');
  expect(query('quality.dropdown')).toBeNull();
});

it('replaces unrelated menus, keeps the capture choice and restores its trigger on Escape', async () => {
  mount();
  await click('quality.menu');
  await click('capture-target.menu');
  expect(query('quality.dropdown')).toBeNull();
  const area = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'content.toolbar.videoRecordingTargetArea'
  );
  await act(async () =>
    area?.dispatchEvent(createBridgedMouseEvent('click', new MouseEvent('click')))
  );
  expect(area?.getAttribute('aria-pressed')).toBe('true');
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(query('capture-target.dropdown')).toBeNull();
  expect(query('capture-target.menu')?.getAttribute('title')).toContain(
    'content.toolbar.videoRecordingTargetArea'
  );
});

async function openOutputChoice(field: string) {
  const trigger = query(`output.${field}`)?.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="listbox"]'
  );
  expect(trigger).not.toBeNull();
  await act(async () => trigger?.click());
}
function outputOption(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (option) => option.textContent?.trim() === label
  );
}
async function selectOutput(field: string, label: string) {
  await openOutputChoice(field);
  const option = outputOption(label);
  expect(option, `available output choice ${label}`).toBeDefined();
  await act(async () => option?.click());
}
async function openDetails() {
  mount();
  await click('quality.menu');
  await click('quality.details');
}

it('edits detailed output through actual choices and returns to explicit custom settings', async () => {
  await openDetails();
  await selectOutput('quality', 'popup.labels.qualityLow');
  expect(query('output.quality')?.textContent).toContain('popup.labels.qualityLow');
  await selectOutput('container', 'MP4');
  expect(query('output.codec')?.textContent).toContain('H.264 (AVC)');
  await selectOutput('container', 'WebM');
  expect(query('output.codec')?.textContent).toContain('VP9');
  await selectOutput('codec', 'VP8');
  expect(query('output.codec')?.textContent).toContain('VP8');
  await selectOutput('resolution', '720p');
  await selectOutput('frameRate', '24 fps');
  expect(query('output.resolution')?.textContent).toContain('720p');
  expect(query('output.frameRate')?.textContent).toContain('24 fps');
  await click('quality.back');
  expect(query('quality.custom')?.getAttribute('aria-pressed')).toBe('true');
  expect(query('quality.profile.builtin:optimal')?.getAttribute('aria-pressed')).toBe('false');
});

it('keeps unsupported 4K60 unavailable when resolution or frame rate changes', async () => {
  await openDetails();
  await selectOutput('frameRate', '60 fps');
  await openOutputChoice('resolution');
  expect(outputOption('2160p')?.disabled).toBe(true);
  await act(async () => outputOption('1080p')?.click());
  await selectOutput('frameRate', '30 fps');
  await selectOutput('resolution', '2160p');
  await openOutputChoice('frameRate');
  expect(outputOption('60 fps')?.disabled).toBe(true);
  await act(async () => outputOption('24 fps')?.click());
  expect(query('output.frameRate')?.textContent).toContain('24 fps');
  expect(query('quality.dropdown')).not.toBeNull();
});

it('rejects host synthetic capture changes after an accepted area choice', async () => {
  mount();
  await click('capture-target.menu');
  const buttons = query('capture-target')!.querySelectorAll('button');
  const tab = buttons[0]!;
  const area = buttons[1]!;
  await act(async () =>
    area.dispatchEvent(createBridgedMouseEvent('click', new MouseEvent('click')))
  );
  expect(area.getAttribute('aria-pressed')).toBe('true');
  await act(async () => tab.click());
  expect(area.getAttribute('aria-pressed')).toBe('true');
  expect(tab.getAttribute('aria-pressed')).toBe('false');
  await act(async () =>
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  );
  expect(area.getAttribute('aria-pressed')).toBe('true');
  await act(async () =>
    tab.dispatchEvent(createBridgedMouseEvent('click', new MouseEvent('click')))
  );
  expect(tab.getAttribute('aria-pressed')).toBe('true');
});
