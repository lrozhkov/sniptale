import { Download, Save } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { buildEditorDocumentActionGroups } from './build';

function createDocumentActionGroups() {
  return buildEditorDocumentActionGroups({
    defaultImagePresetId: null,
    renderImageFormat: () => null,
    renderSavePresetOptions: () => null,
    savePresets: [],
    onCloseDocument: vi.fn(),
    onCopyRenderedImage: vi.fn(),
    onExportSession: vi.fn(),
    onImportSession: vi.fn(),
    onOpenImage: vi.fn(),
    onSaveImage: vi.fn(),
    onSaveImageAs: vi.fn(),
  });
}

describe('buildEditorDocumentActionGroups', () => {
  it('uses Download for save and keeps Save for save-as', () => {
    const groups = createDocumentActionGroups();
    const commands = groups.flatMap((group) => group.items);
    const saveImage = commands.find((item) => item.id === 'save-image');
    const saveImageAs = commands.find((item) => item.id === 'save-image-as');

    expect(saveImage?.kind).toBe('command');
    expect(saveImage && 'icon' in saveImage ? saveImage.icon : null).toBe(Download);
    expect(saveImageAs?.kind).toBe('command');
    expect(saveImageAs && 'icon' in saveImageAs ? saveImageAs.icon : null).toBe(Save);
  });

  it('replaces generic save groups with scenario embed actions', () => {
    const groups = buildEditorDocumentActionGroups({
      defaultImagePresetId: null,
      embedMode: 'scenario',
      onCloseDocument: vi.fn(),
      onCopyRenderedImage: vi.fn(),
      onExportSession: vi.fn(),
      onImportSession: vi.fn(),
      onOpenImage: vi.fn(),
      onReturnToHost: vi.fn(),
      onSaveImage: vi.fn(),
      onSaveImageAs: vi.fn(),
      renderImageFormat: () => null,
      renderSavePresetOptions: () => null,
      savePresets: [],
    });

    expect(groups.map((group) => group.id)).toEqual([
      'primary-save',
      'save-utilities',
      'image-format',
      'close',
    ]);
    expect(groups.flatMap((group) => group.items).some((item) => item.id === 'save-image-as')).toBe(
      false
    );
  });
});
