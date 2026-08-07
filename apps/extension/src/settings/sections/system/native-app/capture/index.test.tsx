// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { NativeCaptureView } from '.';
it('renders capture controls', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() =>
    root.render(
      <NativeCaptureView
        disabled={false}
        settings={DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings}
        onChange={vi.fn()}
      />
    )
  );
  expect(node.querySelector('button[role="switch"]')).not.toBeNull();
  act(() => root.unmount());
});
