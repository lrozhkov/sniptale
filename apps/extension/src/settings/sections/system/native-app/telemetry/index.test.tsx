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
  act(() =>
    root.render(
      <NativeTelemetryView
        disabled={false}
        settings={DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings}
        onChange={vi.fn()}
      />
    )
  );
  expect(node.querySelectorAll('button[role="switch"]').length).toBe(5);
  act(() => root.unmount());
});
