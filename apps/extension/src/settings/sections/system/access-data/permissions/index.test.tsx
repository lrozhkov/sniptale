// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { permissionsSectionContentSpy, useSettingsPermissionsSpy } = vi.hoisted(() => ({
  permissionsSectionContentSpy: vi.fn(),
  useSettingsPermissionsSpy: vi.fn(),
}));

vi.mock('./content', () => ({
  PermissionsSectionContent: (props: unknown) => {
    permissionsSectionContentSpy(props);
    return <div data-testid="permissions-section-content" />;
  },
}));

vi.mock('./useSettingsPermissions', () => ({
  useSettingsPermissions: () => useSettingsPermissionsSpy(),
}));

import { PermissionsSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PermissionsSection />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  permissionsSectionContentSpy.mockReset();
  useSettingsPermissionsSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('forwards permissions state and actions into the permissions content shell', async () => {
  const sectionState = {
    permissions: [],
    refreshPermissions: vi.fn(async () => undefined),
    requestPermission: vi.fn(async () => true),
  };

  useSettingsPermissionsSpy.mockReturnValue(sectionState);

  await renderSection();

  expect(permissionsSectionContentSpy).toHaveBeenCalledWith({
    permissions: sectionState.permissions,
    onRefresh: sectionState.refreshPermissions,
    onRequestPermission: sectionState.requestPermission,
  });
  expect(container?.querySelector('[data-testid="permissions-section-content"]')).not.toBeNull();
});
