// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { NativeAdvancedFields } from './fields';
it('renders advanced native capture fields', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() =>
    root.render(
      <NativeAdvancedFields
        disabled={false}
        settings={DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings}
        updateAdvanced={vi.fn()}
      />
    )
  );
  expect(node.querySelectorAll('button, input').length).toBeGreaterThan(0);
  act(() => root.unmount());
});
