// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  applyCameraFollowPreset,
  createCameraFollowSettings,
} from '../features/video/project/camera/cursor-policy';
import {
  CameraFollowMovementChoice,
  CameraFollowZoneChoice,
} from './camera-follow-segment-controls';

vi.mock('../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
  getCurrentLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function click(label: string) {
  const button = Array.from(host.querySelectorAll('button')).find(
    (node) => node.textContent === `videoEditor.sidebar.${label}`
  );
  if (!button) throw new Error(`Camera choice ${label} is missing`);
  act(() => button.click());
}

it('returns full camera settings with the chosen zone and preserves unrelated values', () => {
  const settings = createCameraFollowSettings('balanced');
  const onChange = vi.fn();
  act(() =>
    root.render(<CameraFollowZoneChoice settings={settings} onChange={onChange} showLabel />)
  );
  for (const [label, zoneSize] of [
    ['cameraZoneSmall', 0.3],
    ['cameraZoneMedium', 0.55],
    ['cameraZoneLarge', 0.8],
  ] as const) {
    click(label);
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, zoneSize });
  }
});

it('uses the existing movement policy and refuses all disabled zone and movement choices', () => {
  const settings = createCameraFollowSettings('balanced');
  const onChange = vi.fn();
  act(() => root.render(<CameraFollowMovementChoice settings={settings} onChange={onChange} />));
  for (const [label, preset] of [
    ['cameraCalm', 'calm'],
    ['cameraBalanced', 'balanced'],
    ['cameraFast', 'fast'],
  ] as const) {
    click(label);
    expect(onChange).toHaveBeenLastCalledWith(applyCameraFollowPreset(settings, preset));
  }
  onChange.mockClear();
  act(() =>
    root.render(
      <>
        <CameraFollowZoneChoice settings={settings} onChange={onChange} disabled />
        <CameraFollowMovementChoice settings={settings} onChange={onChange} disabled showLabel />
      </>
    )
  );
  for (const button of host.querySelectorAll('button')) {
    expect(button.disabled).toBe(true);
    act(() => button.click());
  }
  expect(onChange).not.toHaveBeenCalled();
});
