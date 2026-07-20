import { expect, it, vi } from 'vitest';
import { buildDocumentActionCommands } from '../commands';
import { buildDocumentActionGroupList } from './default';

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

it('builds the default document action group order', () => {
  const groups = buildDocumentActionGroupList(createCommands());

  expect(groups.map((group) => group.id)).toEqual([
    'primary-save',
    'save-utilities',
    'quick-destinations',
    'image-format',
    'session',
    'open-image',
    'close',
  ]);
});
