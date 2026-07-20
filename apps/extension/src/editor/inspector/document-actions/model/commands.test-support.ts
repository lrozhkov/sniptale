import { vi } from 'vitest';
import type { BuildEditorDocumentActionGroupsParams } from './types';

export function createDocumentActionParams(
  overrides: Partial<BuildEditorDocumentActionGroupsParams> = {}
): BuildEditorDocumentActionGroupsParams {
  return {
    defaultImagePresetId: 'preset-1',
    renderImageFormat: () => 'image format',
    renderSavePresetOptions: () => 'save preset options',
    savePresets: [
      { id: 'preset-1', name: 'Preset 1', path: '/presets/preset-1', enabled: true, order: 1 },
    ],
    copyRenderedImageDisabledReason: null,
    onCloseDocument: vi.fn(),
    onCopyRenderedImage: vi.fn(),
    onExportSession: vi.fn(),
    onImportSession: vi.fn(),
    onOpenImage: vi.fn(),
    onSaveImage: vi.fn(),
    onSaveImageAs: vi.fn(),
    ...overrides,
  };
}
