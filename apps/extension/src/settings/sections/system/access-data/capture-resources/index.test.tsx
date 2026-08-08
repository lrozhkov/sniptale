// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const controller = {
  anonymousCrossOriginSnapshotAssetsEnabled: false,
  authenticatedSnapshotAssetsEnabled: false,
  locale: 'ru' as const,
  updateAnonymousCrossOriginSnapshotAssetsEnabled: vi.fn(),
  updateAuthenticatedSnapshotAssetsEnabled: vi.fn(),
};
vi.mock('./controller', () => ({ useCaptureResourcesController: () => controller }));
import { CaptureResourcesSettings } from '.';

it('renders the capture-resource owner through its narrow controller', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<CaptureResourcesSettings />));
  expect(container.querySelectorAll('button')).toHaveLength(2);
  act(() => root.unmount());
});
