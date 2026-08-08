// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { NativeCommandsView } from '.';
it('renders native command controls without requiring capabilities', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() =>
    root.render(
      <NativeCommandsView
        capabilities={null}
        disabled={false}
        settings={DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings}
        onChange={vi.fn()}
      />
    )
  );
  expect(node.textContent?.length).toBeGreaterThan(0);
  act(() => root.unmount());
});
