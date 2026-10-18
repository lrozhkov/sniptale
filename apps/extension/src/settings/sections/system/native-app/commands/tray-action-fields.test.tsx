// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { translate } from '../../../../../platform/i18n';
import { NativeTrayActionFields } from './tray-action-fields';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let props: ComponentProps<typeof NativeTrayActionFields>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const settings = structuredClone(DEFAULT_VIDEO_SETTINGS.native);
  if (!settings) throw new Error('Native settings fixture is required');
  props = { capabilities: null, disabled: false, settings, updateTrayAction: vi.fn() };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render() {
  act(() => root.render(<NativeTrayActionFields {...props} />));
}

function recorder(label: string) {
  const name = `${label}: ${translate('settings.nativeApp.shortcutLabel')}`;
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (node) => node.getAttribute('aria-label') === name
  );
  expect(button).toBeDefined();
  return button!;
}

function record(button: HTMLButtonElement, key: string, ctrlKey = false) {
  act(() => button.click());
  act(() => button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key, ctrlKey })));
}

it('routes an enabled toggle and shortcut recording to the same action and blocks disabled controls', () => {
  props.settings.trayActions.openSettings.enabled = false;
  render();
  const input = recorder(translate('settings.nativeApp.trayOpenSettings'));
  expect(input.disabled).toBe(true);
  const row = input.parentElement!.parentElement!;
  const toggle = row.querySelector<HTMLButtonElement>('[role="switch"]')!;
  act(() => toggle.click());
  expect(props.updateTrayAction).toHaveBeenLastCalledWith('openSettings', { enabled: true });
  props.settings.trayActions.openSettings.enabled = true;
  render();
  record(input, 'k', true);
  expect(props.updateTrayAction).toHaveBeenLastCalledWith('openSettings', {
    shortcutLabel: 'Ctrl+K',
  });
  props.disabled = true;
  render();
  expect(input.disabled).toBe(true);
  expect(toggle.disabled).toBe(true);
  const count = vi.mocked(props.updateTrayAction).mock.calls.length;
  act(() => toggle.click());
  act(() => input.click());
  expect(props.updateTrayAction).toHaveBeenCalledTimes(count);
});

it('rejects duplicate shortcuts and recovers with a unique selection or an explicit clear', () => {
  render();
  const input = recorder(translate('settings.nativeApp.trayOpenSettings'));
  record(input, 'PrintScreen');
  expect(props.updateTrayAction).not.toHaveBeenCalled();
  expect(container.textContent).toContain(translate('settings.nativeApp.shortcutDuplicate'));
  record(input, 'k', true);
  expect(props.updateTrayAction).toHaveBeenLastCalledWith('openSettings', {
    shortcutLabel: 'Ctrl+K',
  });
  expect(container.textContent).not.toContain(translate('settings.nativeApp.shortcutDuplicate'));
  props.settings.trayActions.openSettings.shortcutLabel = 'Ctrl+K';
  render();
  const clear = input.parentElement!.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('settings.nativeApp.shortcutClear')}"]`
  )!;
  act(() => clear.click());
  expect(props.updateTrayAction).toHaveBeenLastCalledWith('openSettings', { shortcutLabel: '' });
});

it('enables recording-control shortcuts only when recording has an enabled start action', () => {
  render();
  const pause = recorder(translate('settings.nativeApp.trayPauseRecording'));
  expect(pause.disabled).toBe(true);
  expect(pause.parentElement!.parentElement!.querySelector('[role="switch"]')).toBeNull();
  props.settings.video.enabled = true;
  render();
  expect(pause.disabled).toBe(false);
  record(pause, 'p', true);
  expect(props.updateTrayAction).toHaveBeenLastCalledWith('pauseRecording', {
    shortcutLabel: 'Ctrl+P',
  });
  props.settings.trayActions.startScreenRecording.enabled = false;
  props.settings.trayActions.startWindowRecording.enabled = false;
  props.settings.trayActions.startRegionRecording.enabled = false;
  render();
  expect(pause.disabled).toBe(true);
});
