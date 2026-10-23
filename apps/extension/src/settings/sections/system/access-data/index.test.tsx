// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('./permissions', () => ({
  PermissionsSection: (props: { view: string }) => <div>permissions-owner:{props.view}</div>,
}));
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
  expect(container.textContent).toContain('permissions-owner:optional');
  expect(container.querySelectorAll('[data-ui="settings.subpage-tabs"]')).toHaveLength(1);
  act(() => root.unmount());
});

it('selects required permissions at the same navigation level as privacy', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onViewChange = vi.fn();
  act(() =>
    root.render(<AccessDataSection view="required-permissions" onViewChange={onViewChange} />)
  );
  expect(container.textContent).toContain('permissions-owner:required');
  const tabs = container.querySelector('[data-ui="settings.subpage-tabs"]');
  expect(tabs?.querySelectorAll('button')).toHaveLength(3);
  act(() => tabs?.querySelectorAll('button')[0]?.click());
  expect(onViewChange).toHaveBeenCalledWith('permissions');
  act(() => root.unmount());
});
