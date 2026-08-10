// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { rowsPropsSpy, listPropsSpy } = vi.hoisted(() => ({
  rowsPropsSpy: vi.fn(),
  listPropsSpy: vi.fn(),
}));

vi.mock('./cards', () => ({
  SaveSettingsRows: (props: unknown) => {
    rowsPropsSpy(props);
    return <div data-testid="settings-rows" />;
  },
}));

vi.mock('./list/root', () => ({
  PresetsList: (props: unknown) => {
    listPropsSpy(props);
    return <div data-testid="presets-list" />;
  },
}));

import { SavePresetsSectionContent } from './content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(
  overrides: Partial<Parameters<typeof SavePresetsSectionContent>[0]> = {}
): Parameters<typeof SavePresetsSectionContent>[0] {
  return {
    captureAction: 'download_default',
    captureActionOptions: [{ value: 'download_default', label: 'Download' }],
    closeDeleteDialog: vi.fn(),
    closeEditor: vi.fn(),
    confirmDelete: null,
    confirmDeletePreset: vi.fn(async () => undefined),
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    handleCaptureActionChange: vi.fn(async () => undefined),
    handleDefaultExportChange: vi.fn(async () => undefined),
    handleDefaultImageChange: vi.fn(async () => undefined),
    handleDefaultVideoChange: vi.fn(async () => undefined),
    handleDeletePreset: vi.fn(),
    handleSavePreset: vi.fn(async () => undefined),
    handleTogglePresetEnabled: vi.fn(async () => undefined),
    isEditorOpen: false,
    isLoading: false,
    onMoveBefore: vi.fn(async () => undefined),
    openEditor: vi.fn(),
    presetOptions: [],
    presets: [],
    view: 'settings',
    ...overrides,
  };
}

function renderSection(props: Parameters<typeof SavePresetsSectionContent>[0]) {
  act(() => root?.render(<SavePresetsSectionContent {...props} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  rowsPropsSpy.mockReset();
  listPropsSpy.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows only compact settings on the settings subpage', () => {
  renderSection(createProps());

  expect(container?.querySelector('[data-testid="settings-rows"]')).toBeTruthy();
  expect(container?.querySelector('[data-testid="presets-list"]')).toBeNull();
  expect(container?.firstElementChild?.className).toContain('max-w-[720px]');
});

it('shows only folder templates and forwards their controller actions', () => {
  const props = createProps({ view: 'templates' });
  renderSection(props);

  expect(container?.querySelector('[data-testid="settings-rows"]')).toBeNull();
  expect(container?.querySelector('[data-testid="presets-list"]')).toBeTruthy();
  expect(listPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      onEdit: props.openEditor,
      onMoveBefore: props.onMoveBefore,
      onSavePreset: props.handleSavePreset,
    })
  );
});
