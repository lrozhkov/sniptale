// @vitest-environment jsdom

import { CommandPressScope } from '@sniptale/ui/control-language/press';

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
    type:
      id === 'origins'
        ? 'origin'
        : id === 'localFiles'
          ? 'file'
          : id === 'nativeApp'
            ? 'chrome'
            : 'web',
    ...(id === 'nativeApp' ? { chromePermission: 'nativeMessaging' as const } : {}),
  };
}

async function renderContent(
  view: 'optional' | 'required' = 'optional',
  permissions?: PermissionInfo[],
  mediaNavigationFailed = false,
  mediaEnableFailed = false,
  mediaRecordingReady = false,
  mediaSessionFailed = false
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const onRefresh = vi.fn();
  const onRequestPermission = vi.fn();
  const onRevokePermission = vi.fn();
  const onOpenMediaSettings = vi.fn();

  await act(async () => {
    root?.render(
      <CommandPressScope value={true}>
        <PermissionsSectionContent
          permissions={
            permissions ?? [
              createPermission('origins', 'prompt'),
              createPermission('localFiles', 'granted'),
              createPermission('nativeApp', 'prompt'),
              createPermission('microphone', 'granted'),
              createPermission('downloads', 'denied'),
              createPermission('clipboard', 'error'),
            ]
          }
          onRefresh={onRefresh}
          onOpenMediaSettings={onOpenMediaSettings}
          mediaNavigationFailed={mediaNavigationFailed}
          mediaEnableFailed={mediaEnableFailed}
          mediaRecordingReady={mediaRecordingReady}
          mediaSessionFailed={mediaSessionFailed}
          onRequestPermission={onRequestPermission}
          onRevokePermission={onRevokePermission}
          view={view}
        />
      </CommandPressScope>
    );
  });

  return { onRefresh, onRequestPermission, onRevokePermission, onOpenMediaSettings };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

it('explains the successful popup handoff and temporary permission lifetime only after enable', async () => {
  await renderContent();
  expect(container?.querySelector('[data-ui="settings.permissions.recording-ready"]')).toBeNull();
  await renderContent('optional', [createPermission('camera', 'granted')], false, false, true);
  expect(
    container?.querySelector('[data-ui="settings.permissions.recording-ready"]')?.textContent
  ).toBe('settings.permissions.recordingDeviceReady');
  expect(container?.querySelector('[role="alert"]')).toBeNull();
});

it('shows localized recording enable failure with granted permission intact', async () => {
  await renderContent('optional', [createPermission('microphone', 'granted')], false, true);
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.permissions.enableRecordingDeviceFailed'
  );
  expect(container?.textContent).toContain('settings.permissions.statusGranted');
});

it('reports recording access session failure without changing the native grant status', async () => {
  await renderContent(
    'optional',
    [createPermission('microphone', 'granted')],
    false,
    false,
    true,
    true
  );
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.permissions.recordingAccessSessionFailed'
  );
  expect(container?.textContent).toContain('settings.permissions.statusGranted');
});

it.each(['microphone', 'camera'])('offers browser recovery for denied %s', async (permission) => {
  const { onOpenMediaSettings, onRequestPermission } = await renderContent('optional', [
    createPermission(permission, 'denied'),
  ]);
  const button = Array.from(container!.querySelectorAll('button')).find(
    (item) => item.textContent === 'settings.permissions.openBrowserSettingsButton'
  );
  expect(button).toBeDefined();
  act(() => button?.click());
  expect(onOpenMediaSettings).toHaveBeenCalledExactlyOnceWith(permission);
  expect(onRequestPermission).not.toHaveBeenCalled();
});

it('shows localized recovery instructions when browser settings cannot open', async () => {
  await renderContent('optional', [createPermission('camera', 'denied')], true);
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.permissions.openBrowserSettingsFailed'
  );
  expect(
    container?.querySelector('[data-ui="settings.permissions.camera.open-browser-settings"]')
  ).not.toBeNull();
});

it.each(['prompt', 'unknown', 'error'] as const)(
  'keeps explicit media permission requests available in state %s without requesting on render',
  async (state) => {
    const { onRequestPermission } = await renderContent('optional', [
      createPermission('microphone', state),
      createPermission('camera', state),
    ]);
    expect(onRequestPermission).not.toHaveBeenCalled();
    const buttons = Array.from(container!.querySelectorAll('button')).filter(
      (item) => item.textContent === 'settings.permissions.allowButton'
    );
    expect(buttons).toHaveLength(2);
    act(() => buttons.forEach((button) => button.click()));
    expect(onRequestPermission).toHaveBeenNthCalledWith(1, 'microphone');
    expect(onRequestPermission).toHaveBeenNthCalledWith(2, 'camera');
  }
);

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
  expect(container?.textContent).not.toContain('settings.permissions.requiredTabCaptureName');
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
  const askButton = buttons.find(
    (button) => button.textContent === 'settings.permissions.siteAccessAskMode'
  );
  const refreshButton = buttons.find(
    (button) => button.textContent === 'settings.permissions.refreshButton'
  );
  const revokeButton = buttons.find(
    (button) => button.textContent === 'settings.permissions.revokeButton'
  );
  const nativeRequestButton = buttons.find(
    (button) =>
      button.textContent === 'settings.permissions.allowButton' &&
      button
        .closest('.flex-shrink-0')
        ?.parentElement?.textContent?.includes('settings.permissions.nativeAppName')
  );

  expect(askButton?.getAttribute('aria-pressed')).toBe('true');
  expect(allSitesButton?.getAttribute('aria-pressed')).toBe('false');
  expect(askButton?.dataset['commandProperty']).toBe('true');
  expect(askButton?.dataset['active']).toBe('true');
  expect(allSitesButton?.dataset['active']).toBeUndefined();

  act(() => {
    allSitesButton?.click();
    askButton?.click();
    nativeRequestButton?.click();
    revokeButton?.click();
    refreshButton?.click();
  });

  expect(onRequestPermission).toHaveBeenCalledWith('origins');
  expect(onRequestPermission).toHaveBeenCalledWith('nativeApp');
  expect(onRevokePermission).toHaveBeenCalledWith('localFiles');
  expect(onRevokePermission).toHaveBeenCalledWith('origins');
  expect(onRefresh).toHaveBeenCalledTimes(1);

  await renderContent('required');
  expect(container?.textContent).toContain('settings.permissions.requiredTabCaptureName');
  expect(container?.textContent).toContain('settings.permissions.requiredCategoryCapture');
  expect(container?.textContent).not.toContain('settings.permissions.nativeAppName');
});
