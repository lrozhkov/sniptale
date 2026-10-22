// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, CameraOff } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RecordingMediaSplitControl } from './media-menu';

const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: showToastMock }));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  showToastMock.mockClear();
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
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(showToastMock).toHaveBeenCalledExactlyOnceWith(
    'content.toolbar.videoRecordingActionFailed',
    'error'
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

it.each(['toggle', 'catalog', 'placement'])(
  'uses one shared toast for %s failure without adding an inline alert',
  async (action) => {
    const failure = new Error('Device action failed');
    const onToggle = vi.fn().mockRejectedValue(failure);
    const onPlacement = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const onLoadDevices = vi.fn(async () => {
      if (action === 'catalog') throw failure;
      return [];
    });
    act(() =>
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
          selectedDeviceId={null}
          onLoadDevices={onLoadDevices}
          onToggle={onToggle}
          cameraPlacement={{ mode: 'embedded', locked: false, onChange: onPlacement }}
        />
      )
    );
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          action === 'toggle' ? '[data-ui="test.camera.toggle"]' : '[data-ui="test.camera.menu"]'
        )
        ?.click();
    });
    if (action === 'placement')
      await act(async () => {
        host
          .querySelector<HTMLButtonElement>(
            '[data-ui="content.toolbar.video-recording.camera.placement"] button[aria-pressed="false"]'
          )
          ?.click();
      });
    expect(showToastMock).toHaveBeenCalledExactlyOnceWith(
      'content.toolbar.videoRecordingActionFailed',
      'error'
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
    if (action !== 'toggle')
      expect(
        host.querySelector('[data-ui="test.camera.menu"]')?.getAttribute('aria-expanded')
      ).toBe('true');
    if (action === 'placement') {
      expect(
        host
          .querySelector('[data-ui="content.toolbar.video-recording.camera.placement"] button')
          ?.getAttribute('aria-pressed')
      ).toBe('true');
      await act(async () => {
        host
          .querySelector<HTMLButtonElement>(
            '[data-ui="content.toolbar.video-recording.camera.placement"] button[aria-pressed="false"]'
          )
          ?.click();
      });
      expect(onPlacement).toHaveBeenCalledTimes(2);
      expect(showToastMock).toHaveBeenCalledTimes(1);
    }
  }
);

it('keeps the explicit permission result authoritative across native prompt focus changes', async () => {
  let grant!: (devices: { deviceId: string; kind: 'videoinput'; label: string }[]) => void;
  const onLoadDevices = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      })
  );
  act(() =>
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
    )
  );
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-ui="test.camera.menu"]')?.click();
  });
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(onLoadDevices).toHaveBeenCalledExactlyOnceWith(true);
  await act(async () =>
    grant([
      { deviceId: '', kind: 'videoinput', label: '' },
      { deviceId: 'camera-real', kind: 'videoinput', label: 'Actual camera' },
    ])
  );
  expect(host.textContent).toContain('Actual camera');
  expect(host.querySelectorAll('.sniptale-popover-item')).toHaveLength(1);
});
