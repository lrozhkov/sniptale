// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { bodyPropsSpy, listPropsSpy } = vi.hoisted(() => ({
  bodyPropsSpy: vi.fn(),
  listPropsSpy: vi.fn(),
}));

vi.mock('./views', () => ({
  addButtonClassName: 'add-button',
  CaptureActionCard: (props: unknown) => {
    bodyPropsSpy({ type: 'capture', props });
    return <div data-testid="capture-card" />;
  },
  DefaultPresetsCard: (props: unknown) => {
    bodyPropsSpy({ type: 'defaults', props });
    return <div data-testid="default-card" />;
  },
  GalleryToggleCard: (props: unknown) => {
    bodyPropsSpy({ type: 'gallery', props });
    return <div data-testid="gallery-card" />;
  },
  SavePresetsHeader: () => <div data-testid="header">header</div>,
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
    captureActionOptions: [{ value: 'download_default', label: 'Download default' }],
    closeDeleteDialog: vi.fn(),
    closeEditor: vi.fn(),
    confirmDelete: null,
    confirmDeletePreset: vi.fn(async () => undefined),
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    draggedId: null,
    dragOverId: null,
    handleCaptureActionChange: vi.fn(async () => undefined),
    handleDefaultExportChange: vi.fn(async () => undefined),
    handleDefaultImageChange: vi.fn(async () => undefined),
    handleDefaultVideoChange: vi.fn(async () => undefined),
    handleDeletePreset: vi.fn(),
    handleTogglePresetEnabled: vi.fn(async () => undefined),
    handleToggleSaveToGallery: vi.fn(async () => undefined),
    handleSavePreset: vi.fn(async () => undefined),
    hoveredPresetId: null,
    isEditorOpen: false,
    isLoading: false,
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDragStart: vi.fn(),
    onDrop: vi.fn(),
    openEditor: vi.fn(),
    presetCountLabel: 'presets',
    presetOptions: [],
    presets: [],
    saveCapturesToGallery: false,
    setHoveredPresetId: vi.fn(),
    ...overrides,
  };
}

function renderSection(overrides: Partial<Parameters<typeof SavePresetsSectionContent>[0]> = {}) {
  const props = createProps(overrides);

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<SavePresetsSectionContent {...props} />);
  });

  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  bodyPropsSpy.mockReset();
  listPropsSpy.mockReset();
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

function verifySavePresetsSectionComposition() {
  const props = renderSection({ saveCapturesToGallery: true });

  act(() => {
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent) {
        button.click();
      }
    });
  });

  expect(container?.querySelector('[data-testid="header"]')).toBeTruthy();
  expect(container?.querySelector('[data-testid="presets-list"]')).toBeTruthy();
  expect(bodyPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'capture',
      props: expect.objectContaining({ captureAction: props.captureAction }),
    })
  );
  expect(bodyPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'gallery',
      props: expect.objectContaining({ enabled: true }),
    })
  );
  expect(listPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      onCloseDeleteDialog: props.closeDeleteDialog,
      onCloseEditor: props.closeEditor,
      onDelete: props.handleDeletePreset,
      onEdit: props.openEditor,
      onHoverChange: props.setHoveredPresetId,
      onSavePreset: props.handleSavePreset,
      onToggleEnabled: props.handleTogglePresetEnabled,
      presetCountLabel: 'presets',
    })
  );
  expect(props.openEditor).toHaveBeenCalledWith();
}

describe('SavePresetsSectionContent', () => {
  it(
    'renders the save presets cards/list composition and opens the add flow',
    verifySavePresetsSectionComposition
  );

  it('forwards an editing preset only when the editor flow targets an existing preset', () => {
    const editingPreset = {
      id: 'preset-1',
      name: 'Downloads',
      path: '/tmp',
      enabled: true,
      isDefault: false,
      format: 'png',
    };

    renderSection({
      editingPreset: editingPreset as never,
    });

    expect(listPropsSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        editingPreset,
      })
    );
  });
});
