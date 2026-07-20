import { vi } from 'vitest';

import type { QuickAction } from '../../../contracts/settings';
import type { QuickActionsSectionState } from './section';

type QuickActionsSectionCoreState = {
  actions: QuickAction[];
  confirmDelete: QuickAction | null;
  confirmationMessage: string | null;
  displayMode: 'list' | 'hidden';
  draggedId: string | null;
  dragOverId: string | null;
  editingId: string | null;
  editForm: QuickAction | null;
  hoveredId: string | null;
  isLoading: boolean;
};

type QuickActionsSectionActionState = {
  handleAdd: () => void;
  handleCancelEdit: () => void;
  handleDelete: (id: string) => Promise<void>;
  handleEdit: (action: QuickAction) => void;
  handleHotkeyError: (message: string) => void;
  handleSaveEdit: () => Promise<void>;
  handleToggleStatus: (id: string) => Promise<void>;
  setConfirmDelete: (action: QuickAction | null) => void;
  setDisplayMode: (value: 'list' | 'hidden') => Promise<void>;
  setHoveredId: (value: string | null) => void;
  updateFormField: (field: string, value: unknown) => void;
};

type QuickActionsSectionDragState = {
  handleDragEnd: (event?: unknown) => void;
  handleDragLeave: (event?: unknown) => void;
  handleDragOver: (event: unknown, actionId: string) => void;
  handleDragStart: (event: unknown, actionId: string) => void;
  handleDrop: (event: unknown, actionId: string) => Promise<void>;
};

export type QuickActionsSectionHarnessState = QuickActionsSectionCoreState &
  QuickActionsSectionActionState &
  QuickActionsSectionDragState;

function createQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id: overrides.id ?? 'action-1',
    status: overrides.status ?? true,
    name: overrides.name ?? 'Visible capture',
    icon: overrides.icon ?? 'Camera',
    origin: overrides.origin ?? 'user',
    bundledId: overrides.bundledId ?? null,
    hotkey: overrides.hotkey ?? null,
    screenshotMode: overrides.screenshotMode ?? 'visible',
    emulation: overrides.emulation ?? null,
    delay: overrides.delay ?? null,
    afterCapture: overrides.afterCapture ?? 'download_default',
    imageFormat: overrides.imageFormat ?? null,
    imageQuality: overrides.imageQuality ?? null,
    exitAfterCapture: overrides.exitAfterCapture ?? false,
  };
}

function createDefaultUserAction() {
  return createQuickAction({
    id: 'user-action',
    name: 'Visible capture',
    icon: 'Monitor',
    hotkey: {
      altKey: false,
      ctrlKey: true,
      key: 'K',
      metaKey: false,
      shiftKey: true,
    },
    screenshotMode: 'full',
    emulation: 'desktop-1440',
    delay: 5,
    afterCapture: 'copy',
    imageFormat: 'jpeg',
    imageQuality: 90,
    exitAfterCapture: true,
  });
}

function createDefaultBundledAction() {
  return createQuickAction({
    id: 'bundled-action',
    bundledId: 'default-selection',
    origin: 'bundled',
    name: 'Selection',
    afterCapture: 'download_default',
  });
}

function createDefaultEditForm(userAction: QuickAction): QuickAction {
  return {
    id: userAction.id,
    origin: userAction.origin ?? 'user',
    bundledId: userAction.bundledId ?? null,
    name: 'Visible capture',
    icon: 'Monitor',
    hotkey: userAction.hotkey ?? null,
    screenshotMode: 'visible',
    emulation: null,
    delay: null,
    afterCapture: 'download_default',
    imageFormat: null,
    imageQuality: null,
    status: true,
    exitAfterCapture: false,
  };
}

export function createSectionState(
  overrides: Partial<QuickActionsSectionState> = {}
): QuickActionsSectionState {
  const userAction = createDefaultUserAction();
  const bundledAction = createDefaultBundledAction();

  return {
    actions: overrides.actions ?? [userAction, bundledAction],
    confirmDelete: overrides.confirmDelete === undefined ? userAction : overrides.confirmDelete,
    confirmationMessage:
      overrides.confirmationMessage === undefined
        ? 'Quick action saved'
        : overrides.confirmationMessage,
    displayMode: overrides.displayMode ?? 'list',
    draggedId: overrides.draggedId === undefined ? null : overrides.draggedId,
    dragOverId: overrides.dragOverId === undefined ? null : overrides.dragOverId,
    editingId: overrides.editingId === undefined ? userAction.id : overrides.editingId,
    editForm:
      overrides.editForm === undefined ? createDefaultEditForm(userAction) : overrides.editForm,
    handleAdd: overrides.handleAdd ?? vi.fn(),
    handleCancelEdit: overrides.handleCancelEdit ?? vi.fn(),
    handleDelete: overrides.handleDelete ?? vi.fn().mockResolvedValue(undefined),
    handleDragEnd: overrides.handleDragEnd ?? vi.fn(),
    handleDragLeave: overrides.handleDragLeave ?? vi.fn(),
    handleDragOver: overrides.handleDragOver ?? vi.fn(),
    handleDragStart: overrides.handleDragStart ?? vi.fn(),
    handleDrop: overrides.handleDrop ?? vi.fn().mockResolvedValue(undefined),
    handleEdit: overrides.handleEdit ?? vi.fn(),
    handleHotkeyError: overrides.handleHotkeyError ?? vi.fn(),
    handleSaveEdit: overrides.handleSaveEdit ?? vi.fn().mockResolvedValue(undefined),
    handleToggleStatus: overrides.handleToggleStatus ?? vi.fn().mockResolvedValue(undefined),
    hoveredId: overrides.hoveredId === undefined ? userAction.id : overrides.hoveredId,
    isLoading: overrides.isLoading ?? false,
    setConfirmDelete: overrides.setConfirmDelete ?? vi.fn(),
    setDisplayMode: overrides.setDisplayMode ?? vi.fn().mockResolvedValue(undefined),
    setHoveredId: overrides.setHoveredId ?? vi.fn(),
    updateFormField: overrides.updateFormField ?? vi.fn(),
  };
}
