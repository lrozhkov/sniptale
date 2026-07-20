import { expect, it, vi } from 'vitest';

import type { SavePreset } from '../../../../../contracts/settings';
import { createPresetRowProps, pickPresetsListBodyProps } from './props';
import type { SavePresetsListProps } from '../../state/types';

function createPreset(overrides: Partial<SavePreset> = {}): SavePreset {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Downloads',
    path: overrides.path ?? '/tmp/downloads',
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 1,
  };
}

function createListProps(overrides: Partial<SavePresetsListProps> = {}): SavePresetsListProps {
  return {
    confirmDelete: null,
    confirmDeletePreset: vi.fn(async () => undefined),
    draggedId: null,
    dragOverId: null,
    hoveredPresetId: null,
    isEditorOpen: false,
    onCloseDeleteDialog: vi.fn(),
    onCloseEditor: vi.fn(),
    onDelete: vi.fn(),
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDragStart: vi.fn(),
    onDrop: vi.fn(),
    onEdit: vi.fn(),
    onHoverChange: vi.fn(),
    onSavePreset: vi.fn(async () => undefined),
    onToggleEnabled: vi.fn(async () => undefined),
    presetCountLabel: '1 preset',
    presets: [createPreset()],
    ...overrides,
  };
}

it('picks list body props without dialog-only fields', () => {
  const props = createListProps();

  expect(pickPresetsListBodyProps(props)).toEqual({
    draggedId: null,
    dragOverId: null,
    hoveredPresetId: null,
    onDelete: props.onDelete,
    onDragEnd: props.onDragEnd,
    onDragLeave: props.onDragLeave,
    onDragOver: props.onDragOver,
    onDragStart: props.onDragStart,
    onDrop: props.onDrop,
    onEdit: props.onEdit,
    onHoverChange: props.onHoverChange,
    onToggleEnabled: props.onToggleEnabled,
    presets: props.presets,
  });
});

it('creates row props from the shared list interaction seam', () => {
  const preset = createPreset({ id: 'preset-2' });
  const props = createListProps({
    draggedId: preset.id,
    dragOverId: preset.id,
    hoveredPresetId: preset.id,
  });

  expect(createPresetRowProps(pickPresetsListBodyProps(props), preset)).toEqual({
    preset,
    draggedId: preset.id,
    dragOverId: preset.id,
    hoveredPresetId: preset.id,
    onDelete: props.onDelete,
    onDragEnd: props.onDragEnd,
    onDragLeave: props.onDragLeave,
    onDragOver: props.onDragOver,
    onDragStart: props.onDragStart,
    onDrop: props.onDrop,
    onEdit: props.onEdit,
    onHoverChange: props.onHoverChange,
    onToggleEnabled: props.onToggleEnabled,
  });
});
