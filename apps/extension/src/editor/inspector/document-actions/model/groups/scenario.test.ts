import { expect, it, vi } from 'vitest';
import { buildDocumentActionCommands } from '../commands';
import { buildScenarioDocumentActionGroupList } from './scenario';

function createCommands() {
  return buildDocumentActionCommands(
    {
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
    },
    'json'
  );
}

it('builds scenario embed action groups without generic save destinations', () => {
  const groups = buildScenarioDocumentActionGroupList(createCommands());

  expect(groups.map((group) => group.id)).toEqual([
    'primary-save',
    'save-utilities',
    'image-format',
    'close',
  ]);
  expect(groups.flatMap((group) => group.items).some((item) => item.id === 'save-to-folder')).toBe(
    false
  );
});
