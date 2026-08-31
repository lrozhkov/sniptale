// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('./permissions', () => ({ PermissionsSection: () => <div>permissions-owner</div> }));
vi.mock('./privacy', () => ({ PrivacySection: () => <div>privacy-owner</div> }));
import { AccessDataSection } from '.';

it('renders privacy without Web Snapshot resource controls', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<AccessDataSection view="privacy" />));
  expect(container.textContent).toContain('privacy-owner');
  expect(container.textContent).not.toContain('permissions-owner');
  act(() => root.unmount());
});

it('defaults to permissions without mounting privacy', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<AccessDataSection />));
  expect(container.textContent).toContain('permissions-owner');
  act(() => root.unmount());
});
