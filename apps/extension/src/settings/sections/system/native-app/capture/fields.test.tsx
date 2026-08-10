// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';

const { inputProps, selectProps } = vi.hoisted(() => ({
  inputProps: vi.fn(),
  selectProps: vi.fn(),
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductInput: (props: { onValueCommit(value: string): void }) => {
    inputProps(props);
    return <input />;
  },
  ProductSelect: (props: { onChange(value: string): void }) => {
    selectProps(props);
    return <button type="button">select</button>;
  },
}));

import { NativeAdvancedFields } from './fields';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  inputProps.mockReset();
  selectProps.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('routes every compact capture field through the native settings updater', () => {
  const updateAdvanced = vi.fn();
  act(() => {
    root.render(
      <NativeAdvancedFields
        disabled={false}
        settings={DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings}
        updateAdvanced={updateAdvanced}
      />
    );
  });

  act(() => {
    selectProps.mock.calls[0]?.[0].onChange('60');
    selectProps.mock.calls[1]?.[0].onChange('mixed');
    selectProps.mock.calls[2]?.[0].onChange('192');
    inputProps.mock.calls[0]?.[0].onValueCommit('24');
    inputProps.mock.calls[1]?.[0].onValueCommit('45');
    container
      .querySelectorAll<HTMLButtonElement>('button[role="switch"]')
      .forEach((button) => button.click());
  });

  expect(updateAdvanced).toHaveBeenCalledWith({ frameRate: 60 });
  expect(updateAdvanced).toHaveBeenCalledWith({ audioSourceMode: 'mixed' });
  expect(updateAdvanced).toHaveBeenCalledWith({ audioBitrateKbps: 192 });
  expect(updateAdvanced).toHaveBeenCalledWith({ videoBitrateMbpsOverride: 24 });
  expect(updateAdvanced).toHaveBeenCalledWith({ maxDurationMinutes: 45 });
  expect(updateAdvanced).toHaveBeenCalledWith({ includeCursorInVideo: false });
  expect(updateAdvanced).toHaveBeenCalledWith({ preferHardwareEncoder: false });
});
