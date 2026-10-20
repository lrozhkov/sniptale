// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMediaDeviceSelector } from './media-device-selector';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function renderSelector(overrides: Partial<ComponentProps<typeof VideoMediaDeviceSelector>> = {}) {
  act(() => {
    root.render(
      <VideoMediaDeviceSelector
        ariaLabel="Media device row"
        currentDeviceId={null}
        description="Choose the input used for recording"
        devices={[]}
        emptyText="No devices available"
        isLoading={false}
        label="Microphone"
        loadingText="Loading devices"
        onDeviceChange={vi.fn()}
        placeholder="Choose a device"
        selectAriaLabel="Microphone device"
        {...overrides}
      />
    );
  });
}

function trigger() {
  return container.querySelector<HTMLButtonElement>('[aria-label="Microphone device"]')!;
}

it.each(['Microphone 1', 'Camera 1'])(
  'shows the empty state instead of the masked %s option',
  async (maskedLabel) => {
    const onDeviceChange = vi.fn();
    for (const currentDeviceId of [null, '']) {
      renderSelector({
        currentDeviceId,
        devices: [{ deviceId: '', label: maskedLabel }],
        onDeviceChange,
      });
      expect(trigger().textContent).toContain('No devices available');
      expect(container.textContent).not.toContain(maskedLabel);
      await act(async () => trigger().click());
      expect(container.querySelector('[role="option"]')).toBeNull();
      expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
        'No devices available'
      );
      await act(async () => trigger().click());
    }
    expect(onDeviceChange).not.toHaveBeenCalled();
  }
);

it('preserves loading and empty states for inventories without selectable devices', () => {
  renderSelector({ devices: [{ deviceId: '', label: 'Microphone 1' }], isLoading: true });
  expect(trigger().textContent).toContain('Loading devices');
  renderSelector();
  expect(trigger().textContent).toContain('No devices available');
});

it('preserves every nonempty device ID and selection callbacks', async () => {
  const onDeviceChange = vi.fn();
  renderSelector({
    devices: [
      { deviceId: '', label: 'Microphone 1' },
      { deviceId: 'default', label: 'Default microphone' },
      { deviceId: 'mic-2', label: 'Microphone 2' },
    ],
    onDeviceChange,
  });
  expect(trigger().textContent).toContain('Choose a device');
  await act(async () => trigger().click());
  const options = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'));
  expect(options.map((option) => option.textContent)).toEqual([
    'Default microphone',
    'Microphone 2',
  ]);
  await act(async () => options[1]!.click());
  expect(onDeviceChange).toHaveBeenCalledExactlyOnceWith('mic-2');
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it('preserves the selected device label and secondary settings action', async () => {
  renderSelector({
    currentDeviceId: 'mic-2',
    devices: [{ deviceId: 'mic-2', label: 'USB microphone' }],
    secondaryAction: {
      ariaLabel: 'Microphone settings',
      label: 'Settings',
      panel: <div>Input settings</div>,
      panelDescription: 'Adjust the selected input',
      panelTitle: 'Microphone settings',
    },
  });
  expect(trigger().textContent).toContain('USB microphone');
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[aria-label="Microphone settings"]')!.click();
  });
  expect(container.textContent).toContain('Input settings');
});
