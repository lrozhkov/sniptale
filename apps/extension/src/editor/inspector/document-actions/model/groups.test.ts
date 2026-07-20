import { describe, expect, it, vi } from 'vitest';
import { buildDocumentActionCommands } from './commands';
import { buildDocumentActionGroupList, buildScenarioDocumentActionGroupList } from './groups';
import { buildDocumentActionGroupList as buildDocumentActionGroupListImpl } from './groups/default';
import { buildScenarioDocumentActionGroupList as buildScenarioDocumentActionGroupListImpl } from './groups/scenario';

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

describe('editor-inspector-document-actions.model/groups', () => {
  it('keeps the root facade wired to the role files', () => {
    expect(buildDocumentActionGroupList).toBe(buildDocumentActionGroupListImpl);
    expect(buildScenarioDocumentActionGroupList).toBe(buildScenarioDocumentActionGroupListImpl);
  });

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

  it('builds scenario embed action groups without generic save destinations', () => {
    const groups = buildScenarioDocumentActionGroupList(createCommands());

    expect(groups.map((group) => group.id)).toEqual([
      'primary-save',
      'save-utilities',
      'image-format',
      'close',
    ]);
    expect(
      groups.flatMap((group) => group.items).some((item) => item.id === 'save-to-folder')
    ).toBe(false);
  });
});
