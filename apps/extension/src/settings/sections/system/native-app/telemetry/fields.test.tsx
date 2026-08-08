// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { NativeTelemetryFields } from './fields';
it('renders native telemetry toggles', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() =>
    root.render(
      <NativeTelemetryFields
        disabled={false}
        settings={DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings}
        updateTelemetry={vi.fn()}
      />
    )
  );
  expect(node.querySelectorAll('button[role="switch"]').length).toBe(5);
  act(() => root.unmount());
});
