import { expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';
import { buildEditorCommandPaletteActions } from './actions';

function createArgs(): Parameters<typeof buildEditorCommandPaletteActions>[0] {
  return {
    hasImage: true,
    activeTool: 'select',
    history: {
      canUndo: true,
      canRedo: false,
      index: 0,
      size: 1,
    },
    selection: {
      hasSelection: false,
      selectedObjectCount: 0,
      selectedObjectType: null,
      selectedObjectId: null,
      selectedObjectIds: [],
      selectedObjectWidth: null,
      selectedObjectHeight: null,
    },
    setActiveTool: vi.fn(),
    setInspector: vi.fn(),
    setImageData: vi.fn(),
    controller: {
      copyRenderedImage: vi.fn(),
      copyVectorSelection: vi.fn(async () => true),
      pasteVectorSelection: vi.fn(async () => true),
      getVectorClipboardAvailability: vi.fn(() => ({ canCopy: false, canPaste: false })),
      deleteSelection: vi.fn(),
      duplicateSelection: vi.fn(),
      exportDocument: vi.fn(),
      redo: vi.fn(),
      renderToDataUrl: vi.fn(),
      resetZoom: vi.fn(),
      setActiveTool: vi.fn(),
      undo: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      zoomToFit: vi.fn(),
    },
  };
}

it('builds tool actions with current tool subtitle and disabled state', () => {
  const actions = buildEditorCommandPaletteActions(createArgs());
  const selectAction = actions.find((action) => action.id === 'editor-tool-select');
  const pencilAction = actions.find((action) => action.id === 'editor-tool-pencil');

  expect(selectAction).toEqual(
    expect.objectContaining({
      subtitle: translate('shared.ui.commandPaletteCurrentContextHint'),
      disabled: false,
      section: translate('shared.ui.commandPaletteToolsSection'),
    })
  );
  expect(pencilAction).toEqual(
    expect.objectContaining({
      subtitle: translate('shared.ui.commandPaletteToolHint'),
    })
  );
});

it('builds history and selection actions with the expected enabled state', () => {
  const actions = buildEditorCommandPaletteActions(createArgs());
  const undoAction = actions.find((action) => action.id === 'editor-undo');
  const redoAction = actions.find((action) => action.id === 'editor-redo');
  const duplicateAction = actions.find((action) => action.id === 'editor-duplicate-selection');

  expect(undoAction).toEqual(expect.objectContaining({ disabled: false }));
  expect(redoAction).toEqual(expect.objectContaining({ disabled: true }));
  expect(duplicateAction).toEqual(expect.objectContaining({ disabled: true }));
});

it('routes vector copy and paste independently from existing PNG copy', async () => {
  const args = createArgs();
  vi.mocked(args.controller.getVectorClipboardAvailability).mockReturnValue({
    canCopy: true,
    canPaste: true,
  });
  const actions = buildEditorCommandPaletteActions(args);
  await actions.find((action) => action.id === 'editor-copy-vector-layers')?.onSelect();
  await actions.find((action) => action.id === 'editor-paste-vector-layers')?.onSelect();
  expect(args.controller.copyVectorSelection).toHaveBeenCalledOnce();
  expect(args.controller.pasteVectorSelection).toHaveBeenCalledOnce();
  expect(args.controller.copyRenderedImage).not.toHaveBeenCalled();
  await actions.find((action) => action.id === 'editor-copy-png')?.onSelect();
  expect(args.controller.copyRenderedImage).toHaveBeenCalledOnce();
});

it('uses clipboard availability so empty selection can paste while unsupported copy stays disabled', () => {
  const args = createArgs();
  vi.mocked(args.controller.getVectorClipboardAvailability).mockReturnValue({
    canCopy: false,
    canPaste: true,
  });
  const actions = buildEditorCommandPaletteActions(args);
  expect(actions.find((action) => action.id === 'editor-copy-vector-layers')).toMatchObject({
    disabled: true,
  });
  expect(actions.find((action) => action.id === 'editor-paste-vector-layers')).toMatchObject({
    disabled: false,
  });
});
