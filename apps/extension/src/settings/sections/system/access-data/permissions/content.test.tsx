// @vitest-environment jsdom

import { act } from 'react';
import { Circle } from 'lucide-react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { PermissionsSectionContent } from './content';
import type { PermissionInfo } from './permissions-lib';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPermission(id: string, state: PermissionInfo['state']): PermissionInfo {
  return {
    id,
    icon: Circle,
    state,
    type: id === 'origins' ? 'origin' : id === 'localFiles' ? 'file' : 'web',
  };
}

async function renderContent() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const onRefresh = vi.fn();
  const onRequestPermission = vi.fn();
  const onRevokePermission = vi.fn();

  await act(async () => {
    root?.render(
      <PermissionsSectionContent
        permissions={[
          createPermission('origins', 'prompt'),
          createPermission('localFiles', 'granted'),
          createPermission('microphone', 'granted'),
          createPermission('downloads', 'denied'),
          createPermission('clipboard', 'error'),
        ]}
        onRefresh={onRefresh}
        onRequestPermission={onRequestPermission}
        onRevokePermission={onRevokePermission}
      />
    );
  });

  return { onRefresh, onRequestPermission, onRevokePermission };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders all permission states and wires refresh/request handlers', async () => {
  const { onRefresh, onRequestPermission, onRevokePermission } = await renderContent();
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  expect(container?.textContent).toContain('settings.permissions.requiredGrantsTitle');
  expect(container?.textContent).toContain('settings.permissions.requiredTabCaptureName');
  expect(container?.textContent).toContain('settings.permissions.statusChecksTitle');
  expect(container?.textContent).toContain('settings.permissions.statusGranted');
  expect(container?.textContent).toContain('settings.permissions.statusDenied');
  expect(container?.textContent).toContain('settings.permissions.statusError');
  expect(container?.textContent).not.toContain('settings.permissions.requiredGrantPermission');

  expect(container!.textContent!.indexOf('settings.permissions.statusChecksTitle')).toBeLessThan(
    container!.textContent!.indexOf('settings.permissions.requiredGrantsTitle')
  );

  const allSitesButton = buttons.find(
    (button) => button.textContent === 'settings.permissions.siteAccessAllSitesMode'
  );
  const refreshButton = buttons.find(
    (button) => button.textContent === 'settings.permissions.refreshButton'
  );
  const revokeButton = buttons.find(
    (button) => button.textContent === 'settings.permissions.revokeButton'
  );

  act(() => {
    allSitesButton?.click();
    revokeButton?.click();
    refreshButton?.click();
  });

  expect(onRequestPermission).toHaveBeenCalledWith('origins');
  expect(onRevokePermission).toHaveBeenCalledWith('localFiles');
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
