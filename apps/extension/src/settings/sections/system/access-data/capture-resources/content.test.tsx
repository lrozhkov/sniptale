// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CaptureResourcesContent } from './content';

it('renders both resource toggles and the authenticated warning', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <CaptureResourcesContent
        state={{
          anonymousCrossOriginSnapshotAssetsEnabled: false,
          authenticatedSnapshotAssetsEnabled: true,
          locale: 'ru',
          updateAnonymousCrossOriginSnapshotAssetsEnabled: vi.fn(),
          updateAuthenticatedSnapshotAssetsEnabled: vi.fn(),
        }}
      />
    )
  );
  expect(container.querySelectorAll('button')).toHaveLength(2);
  expect(container.textContent).toContain('Используйте только');
  act(() => root.unmount());
});

it('forwards both toggle values and hides the warning when authentication is disabled', () => {
  const updateAnonymous = vi.fn();
  const updateAuthenticated = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <CaptureResourcesContent
        state={{
          anonymousCrossOriginSnapshotAssetsEnabled: false,
          authenticatedSnapshotAssetsEnabled: false,
          locale: 'en',
          updateAnonymousCrossOriginSnapshotAssetsEnabled: updateAnonymous,
          updateAuthenticatedSnapshotAssetsEnabled: updateAuthenticated,
        }}
      />
    )
  );
  const buttons = container.querySelectorAll('button');
  act(() => buttons[0]?.click());
  act(() => buttons[1]?.click());
  expect(updateAnonymous).toHaveBeenCalledWith(true);
  expect(updateAuthenticated).toHaveBeenCalledWith(true);
  expect(container.textContent).not.toContain('Use only');
  act(() => root.unmount());
});
