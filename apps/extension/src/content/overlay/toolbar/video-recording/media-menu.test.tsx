// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, CameraOff } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RecordingMediaSplitControl } from './media-menu';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('awaits device switching and keeps the menu open when the owner rejects it', async () => {
  const onDeviceChange = vi.fn().mockRejectedValue(new Error('Camera switch failed'));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: vi.fn().mockResolvedValue([
        { deviceId: 'camera-1', groupId: 'group-1', kind: 'videoinput', label: 'Camera 1' },
        { deviceId: 'camera-2', groupId: 'group-2', kind: 'videoinput', label: 'Camera 2' },
      ]),
    },
  });

  act(() => {
    root.render(
      <RecordingMediaSplitControl
        active
        activeIcon={Camera}
        disabled={false}
        inactiveIcon={CameraOff}
        kind="videoinput"
        dataUi="test.camera"
        displayMode="horizontal"
        label="Camera"
        selectedDeviceId="camera-1"
        onLoadDevices={async () => [
          { deviceId: 'camera-1', kind: 'videoinput', label: 'Camera 1' },
          { deviceId: 'camera-2', kind: 'videoinput', label: 'Camera 2' },
        ]}
        onDeviceChange={onDeviceChange}
        onToggle={vi.fn()}
      />
    );
  });
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-ui="test.camera.menu"]')?.click();
    await Promise.resolve();
  });

  const deviceButtons = host.querySelectorAll<HTMLButtonElement>('.sniptale-popover-item');
  await act(async () => {
    deviceButtons[1]?.click();
    await Promise.resolve();
  });

  expect(onDeviceChange).toHaveBeenCalledWith('camera-2');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'content.toolbar.unknownError'
  );
  expect(host.querySelector('[data-ui="test.camera.menu"]')?.getAttribute('aria-expanded')).toBe(
    'true'
  );
  expect(host.querySelector('.sniptale-full-page-wrapper')).not.toBeNull();
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-ui="test.camera.menu"]')?.click();
    await Promise.resolve();
  });
  expect(host.querySelector('[data-ui="test.camera.dropdown"]')).toBeNull();
  expect(document.activeElement).not.toBe(
    host.querySelector<HTMLButtonElement>('[data-ui="test.camera.menu"]')
  );
});

it('does not flash the loading row for a fast device catalog', async () => {
  vi.useFakeTimers();
  const onLoadDevices = vi
    .fn()
    .mockResolvedValue([{ deviceId: 'camera-1', kind: 'videoinput', label: 'Camera 1' }]);
  act(() => {
    root.render(
      <RecordingMediaSplitControl
        active={false}
        activeIcon={Camera}
        disabled={false}
        inactiveIcon={CameraOff}
        kind="videoinput"
        dataUi="test.camera"
        displayMode="horizontal"
        label="Camera"
        selectedDeviceId={null}
        onLoadDevices={onLoadDevices}
        onToggle={vi.fn()}
      />
    );
  });
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-ui="test.camera.menu"]')?.click();
    await Promise.resolve();
  });

  expect(host.textContent).not.toContain('content.toolbar.videoRecordingDevicesLoading');
  expect(host.textContent).toContain('Camera 1');
  vi.useRealTimers();
});
