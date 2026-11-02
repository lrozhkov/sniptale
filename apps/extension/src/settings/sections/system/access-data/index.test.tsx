// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const protection = vi.hoisted(() => ({
  state: { source: 'common-protection-controller' },
  read: vi.fn(),
  render: vi.fn(),
}));
vi.mock('../../../secret-protection/context', () => ({
  useSettingsSecretProtection: () => {
    protection.read();
    return protection.state;
  },
}));
vi.mock('../../../secret-protection/view', () => ({
  SecretProtectionView: ({ state }: { state: unknown }) => {
    protection.render(state);
    return <div>common-protection-owner</div>;
  },
}));

beforeEach(() => vi.clearAllMocks());

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
  expect(protection.read).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('defaults to permissions without mounting privacy', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<AccessDataSection />));
  expect(container.textContent).toContain('permissions-owner');
  expect(container.textContent).toContain('permissions-owner:optional');
  expect(protection.read).not.toHaveBeenCalled();
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
  expect(tabs?.querySelectorAll('button')).toHaveLength(4);
  act(() => tabs?.querySelectorAll('button')[0]?.click());
  expect(onViewChange).toHaveBeenCalledWith('permissions');
  act(() => root.unmount());
});

it('composes the canonical protection view from the common controller without mounting privacy or permissions', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onViewChange = vi.fn();
  act(() =>
    root.render(<AccessDataSection view="secret-protection" onViewChange={onViewChange} />)
  );

  expect(container.textContent).toContain('common-protection-owner');
  expect(container.textContent).not.toContain('privacy-owner');
  expect(container.textContent).not.toContain('permissions-owner');
  expect(protection.read).toHaveBeenCalledTimes(1);
  expect(protection.render).toHaveBeenCalledExactlyOnceWith(protection.state);
  const tabs = container.querySelector('[data-ui="settings.subpage-tabs"]');
  expect(tabs?.querySelectorAll('button')).toHaveLength(4);
  act(() => tabs?.querySelectorAll('button')[3]?.click());
  expect(onViewChange).toHaveBeenCalledWith('secret-protection');
  act(() => root.unmount());
});
