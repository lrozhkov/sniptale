// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { SavePreset } from '../../../../contracts/settings';

const { confirmDialogPropsSpy, savePresetEditorModalPropsSpy } = vi.hoisted(() => ({
  confirmDialogPropsSpy: vi.fn(),
  savePresetEditorModalPropsSpy: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: {
    cancelText: string;
    confirmText: string;
    message: string;
    onCancel: () => void;
    onConfirm: () => void;
    title: string;
  }) => {
    confirmDialogPropsSpy(props);
    return (
      <div data-testid="confirm-dialog">
        <span>{props.title}</span>
        <span>{props.message}</span>
        <button data-action="confirm" onClick={props.onConfirm}>
          {props.confirmText}
        </button>
        <button data-action="cancel" onClick={props.onCancel}>
          {props.cancelText}
        </button>
      </div>
    );
  },
}));

vi.mock('../editor-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor-modal')>()),
  SavePresetEditorModal: (props: unknown) => {
    savePresetEditorModalPropsSpy(props);
    return <div data-testid="save-preset-editor-modal" />;
  },
}));

import { PresetsListOverlays } from './overlays';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPreset(): SavePreset {
  return {
    enabled: true,
    id: 'preset-1',
    name: 'Downloads',
    order: 1,
    path: '/tmp/downloads',
  };
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  confirmDialogPropsSpy.mockReset();
  savePresetEditorModalPropsSpy.mockReset();
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

it('renders the editor and delete confirmation overlays when both flows are active', async () => {
  const preset = createPreset();
  const confirmDeletePreset = vi.fn(async () => undefined);
  const onCloseDeleteDialog = vi.fn();
  const onCloseEditor = vi.fn();
  const onSavePreset = vi.fn(async () => undefined);

  await renderNode(
    <PresetsListOverlays
      confirmDelete={preset}
      confirmDeletePreset={confirmDeletePreset}
      editingPreset={preset}
      isEditorOpen
      onCloseDeleteDialog={onCloseDeleteDialog}
      onCloseEditor={onCloseEditor}
      onSavePreset={onSavePreset}
    />
  );

  expect(container?.querySelector('[data-testid="save-preset-editor-modal"]')).not.toBeNull();
  expect(savePresetEditorModalPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({ onClose: onCloseEditor, onSave: onSavePreset, preset })
  );
  expect(confirmDialogPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      message:
        'savePresets.section.deleteMessagePrefixDownloadssavePresets.section.deleteMessageSuffix',
      onCancel: onCloseDeleteDialog,
      title: 'savePresets.section.deleteTitle',
    })
  );

  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click();
    container?.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
  });

  expect(confirmDeletePreset).toHaveBeenCalled();
  expect(onCloseDeleteDialog).toHaveBeenCalled();
});

it('renders nothing when neither overlay flow is active', async () => {
  await renderNode(
    <PresetsListOverlays
      confirmDelete={null}
      confirmDeletePreset={vi.fn(async () => undefined)}
      isEditorOpen={false}
      onCloseDeleteDialog={vi.fn()}
      onCloseEditor={vi.fn()}
      onSavePreset={vi.fn(async () => undefined)}
    />
  );

  expect(container?.innerHTML).toBe('');
  expect(confirmDialogPropsSpy).not.toHaveBeenCalled();
  expect(savePresetEditorModalPropsSpy).not.toHaveBeenCalled();
});

it('opens the editor without forwarding an editing preset during create flows', async () => {
  const onCloseEditor = vi.fn();
  const onSavePreset = vi.fn(async () => undefined);

  await renderNode(
    <PresetsListOverlays
      confirmDelete={null}
      confirmDeletePreset={vi.fn(async () => undefined)}
      isEditorOpen
      onCloseDeleteDialog={vi.fn()}
      onCloseEditor={onCloseEditor}
      onSavePreset={onSavePreset}
    />
  );

  expect(savePresetEditorModalPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      onClose: onCloseEditor,
      onSave: onSavePreset,
    })
  );
});
