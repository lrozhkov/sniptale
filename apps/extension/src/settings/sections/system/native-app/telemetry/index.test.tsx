// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { NativeTelemetryView } from '.';
it('renders telemetry controls', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const onChange = vi.fn();
  act(() =>
    root.render(
      <NativeTelemetryView
        disabled={false}
        settings={DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings}
        onChange={onChange}
      />
    )
  );
  expect(node.firstElementChild?.className).toContain('max-w-[720px]');
  expect(node.querySelectorAll('button[role="switch"]').length).toBe(5);
  act(() => node.querySelector<HTMLButtonElement>('button[role="switch"]')?.click());
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      video: expect.objectContaining({
        telemetry: expect.objectContaining({ collectCursor: false }),
      }),
    })
  );
  act(() => root.unmount());
});
