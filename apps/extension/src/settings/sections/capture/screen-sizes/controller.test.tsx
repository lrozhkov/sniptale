// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  Settings,
  SystemViewportPreset,
  UserViewportPreset,
} from '../../../../contracts/settings';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useSettingsStore: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));
vi.mock('../../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/store/useSettingsStore')>()),
  useSettingsStore: mocks.useSettingsStore,
}));

import { useViewportPresetsSection } from './controller';

const viewportPreset: UserViewportPreset = {
  enabled: true,
  height: 720,
  id: 'viewport-1',
  kind: 'user',
  name: 'HD viewport',
  order: 0,
  target: 'viewport',
  width: 1280,
};
const windowPreset: UserViewportPreset = {
  ...viewportPreset,
  height: 900,
  id: 'window-1',
  name: 'Desktop window',
  target: 'window',
  width: 1440,
};
const customizedSystemPreset: SystemViewportPreset = {
  catalogRevision: 2,
  customized: true,
  enabled: false,
  height: 700,
  id: 'system:viewport-mobile-landscape',
  kind: 'system',
  nameOverride: 'Custom system HD',
  order: 1,
  systemKey: 'viewportMobileLandscape',
  target: 'viewport',
  width: 1200,
};

function createSettings(): Settings {
  return {
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    captureAction: 'download_default',
    contextMenu: {
      enabled: true,
      showExport: true,
      showGallery: true,
      showImageEditor: true,
      showPageLinkCopy: true,
      showScreenshots: true,
      showSettings: true,
      showVideo: true,
      showVideoEditor: true,
    },
    defaultViewportPresetId: 'viewport-1',
    imageFormat: 'png',
    imageQuality: 90,
    rawDiagnosticsEnabled: false,
    saveCapturesToGallery: false,
    skipWebSnapshotSaveDisclosure: false,
    viewportPresets: [viewportPreset, customizedSystemPreset, windowPreset],
  };
}

let container: HTMLDivElement | null = null;
let latest: ReturnType<typeof useViewportPresetsSection> | null = null;
let root: Root | null = null;

function Harness() {
  latest = useViewportPresetsSection();
  return null;
}

function requireState(): ReturnType<typeof useViewportPresetsSection> {
  if (!latest) throw new Error('Viewport settings state is unavailable');
  return latest;
}

async function renderHarness(updateSettings = vi.fn().mockResolvedValue(undefined)) {
  const store = { isLoading: false, settings: createSettings(), updateSettings };
  mocks.useSettingsStore.mockReturnValue(store);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
  return { store, updateSettings };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'user-created') });
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  latest = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('creates, edits across target groups, moves, and selects presets through atomic settings writes', async () => {
  const { updateSettings } = await renderHarness();
  expect(requireState().model.presets).toHaveLength(3);
  expect(requireState().list.countLabel).toBe('viewportPresets.section.countFew');

  act(() => requireState().editor.onAdd());
  expect(requireState().editor.isOpen).toBe(true);
  await act(async () =>
    requireState().editor.onSave({
      height: 844,
      name: '  Phone  ',
      target: 'viewport',
      width: 390,
    })
  );
  expect(requireState().model.presets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'user-created', name: 'Phone', target: 'viewport' }),
    ])
  );

  act(() => requireState().list.onEdit(viewportPreset));
  await act(async () =>
    requireState().editor.onSave({
      height: 800,
      name: 'Moved window',
      target: 'window',
      width: 1300,
    })
  );
  expect(requireState().model.presets.find((preset) => preset.id === 'viewport-1')).toMatchObject({
    name: 'Moved window',
    target: 'window',
  });

  await act(async () => requireState().list.onMove('window-1', -1));
  await act(async () => requireState().defaultField.onChange('window-1'));
  expect(requireState().defaultField.selectedPresetId).toBe('window-1');
  expect(updateSettings).toHaveBeenCalledWith({ defaultViewportPresetId: 'window-1' });
  expect(mocks.toastSuccess).toHaveBeenCalledWith('viewportPresets.messages.defaultUpdated');
});

it('clears disabled/deleted defaults, protects system deletion, and resets customized system data', async () => {
  await renderHarness();

  await act(async () => requireState().list.onToggle(viewportPreset));
  expect(requireState().defaultField.selectedPresetId).toBeNull();
  expect(requireState().model.presets.find((preset) => preset.id === 'viewport-1')).toMatchObject({
    enabled: false,
  });

  act(() => requireState().list.onDelete(customizedSystemPreset));
  expect(requireState().deletion.isOpen).toBe(false);

  act(() => requireState().list.onDelete(windowPreset));
  expect(requireState().deletion.isOpen).toBe(true);
  expect(requireState().deletion.message).toContain('Desktop window');
  await act(async () => requireState().deletion.confirm());
  expect(requireState().model.presets.some((preset) => preset.id === 'window-1')).toBe(false);

  const currentSystem = requireState().model.presets.find(
    (preset) => preset.id === customizedSystemPreset.id
  );
  if (!currentSystem) throw new Error('Expected system viewport preset');
  await act(async () => requireState().list.onReset(currentSystem));
  expect(
    requireState().model.presets.find((preset) => preset.id === currentSystem.id)
  ).toMatchObject({
    customized: false,
    enabled: true,
    height: 390,
    target: 'viewport',
    width: 844,
  });
});

it('rolls optimistic state back when persistence rejects and closes both dialogs explicitly', async () => {
  const updateSettings = vi.fn().mockRejectedValue(new Error('storage failed'));
  await renderHarness(updateSettings);

  await act(async () => requireState().list.onToggle(viewportPreset));
  expect(requireState().model.presets.find((preset) => preset.id === 'viewport-1')).toMatchObject({
    enabled: true,
  });
  expect(requireState().defaultField.selectedPresetId).toBe('viewport-1');
  expect(mocks.toastError).toHaveBeenCalledWith('viewportPresets.messages.updateFailed');

  act(() => {
    requireState().editor.onAdd();
    requireState().list.onDelete(windowPreset);
  });
  act(() => {
    requireState().editor.close();
    requireState().deletion.close();
  });
  expect(requireState().editor.isOpen).toBe(false);
  expect(requireState().deletion.isOpen).toBe(false);
  await act(async () => requireState().deletion.confirm());
});

it('blocks overlapping mutations so a failed optimistic write cannot be resurrected', async () => {
  let rejectWrite!: (reason: unknown) => void;
  const updateSettings = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectWrite = reject;
      })
  );
  await renderHarness(updateSettings);

  let first!: Promise<void>;
  act(() => {
    first = requireState().list.onToggle(viewportPreset);
  });
  expect(requireState().model.isLoading).toBe(true);
  await act(async () => requireState().list.onMove(windowPreset.id, -1));
  expect(updateSettings).toHaveBeenCalledTimes(1);

  rejectWrite(new Error('storage failed'));
  await act(async () => first);
  expect(
    requireState().model.presets.find((preset) => preset.id === viewportPreset.id)
  ).toMatchObject({ enabled: true });
  expect(requireState().model.isLoading).toBe(false);
});

it('rejects an overlong preset name without writing settings', async () => {
  const { updateSettings } = await renderHarness();
  act(() => requireState().editor.onAdd());

  await expect(
    act(async () =>
      requireState().editor.onSave({
        height: 720,
        name: 'a'.repeat(81),
        target: 'viewport',
        width: 1280,
      })
    )
  ).rejects.toThrow('name is invalid');
  expect(updateSettings).not.toHaveBeenCalled();
  expect(requireState().model.presets).toHaveLength(3);
});
