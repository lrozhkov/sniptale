// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('./permissions', () => ({ PermissionsSection: () => <div>permissions-owner</div> }));
vi.mock('./privacy', () => ({ PrivacySection: () => <div>privacy-owner</div> }));
vi.mock('./capture-resources', () => ({
  CaptureResourcesSettings: () => <div>capture-resources-owner</div>,
}));
import { AccessDataSection } from '.';

it('composes capture resources with privacy without adding a third route', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<AccessDataSection view="privacy" />));
  expect(container.textContent).toContain('privacy-owner');
  expect(container.textContent).toContain('capture-resources-owner');
  expect(container.textContent).not.toContain('permissions-owner');
  act(() => root.unmount());
});

it('defaults to permissions without mounting privacy resources', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<AccessDataSection />));
  expect(container.textContent).toContain('permissions-owner');
  expect(container.textContent).not.toContain('capture-resources-owner');
  act(() => root.unmount());
});
