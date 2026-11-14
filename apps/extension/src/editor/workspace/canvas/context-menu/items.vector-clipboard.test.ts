import { beforeEach, expect, it, vi } from 'vitest';
import { buildCanvasContextMenuItems } from './items';
import type { CanvasContextMenuController, CanvasContextMenuRequest } from './types';

const feedback = vi.hoisted(() => ({
  failures: [] as unknown[],
  actions: [] as string[],
  pending: Promise.resolve(),
}));
vi.mock('../../../runtime/async-actions', () => ({
  fireAndReportEditorAction: (action: string, run: () => Promise<void>) => {
    feedback.actions.push(action);
    feedback.pending = Promise.resolve()
      .then(run)
      .catch((error: unknown) => {
        feedback.failures.push(error);
      });
  },
}));
vi.mock('../../../../platform/i18n', () => ({ translate: (key: string) => key }));
beforeEach(() => {
  feedback.actions = [];
  feedback.failures = [];
});
function createController(): CanvasContextMenuController {
  const withHistoryMuted = vi.fn(<T>(callback: () => T) => callback());

  return {
    applyLayerTransformation: vi.fn(async () => undefined),
    bringForwardSelection: vi.fn(),
    bringSelectionToFront: vi.fn(),
    canvas: null,
    clearSelection: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(async () => undefined),
    copyVectorSelection: vi.fn(async () => true),
    pasteVectorSelection: vi.fn(async () => true),
    getVectorClipboardAvailability: vi.fn(() => ({ canCopy: false, canPaste: false })),
    mergeSelectedLayers: vi.fn(async () => undefined),
    resetZoom: vi.fn(),
    selectLayer: vi.fn(),
    sendBackwardSelection: vi.fn(),
    sendSelectionToBack: vi.fn(),
    toggleLayerLock: vi.fn(),
    toggleLayerVisibility: vi.fn(),
    withHistoryMuted:
      withHistoryMuted as unknown as CanvasContextMenuController['withHistoryMuted'],
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomToFit: vi.fn(),
  };
}

function menu(
  controller: CanvasContextMenuController,
  kind: CanvasContextMenuRequest['kind'] = 'single'
) {
  const onClose = vi.fn();
  const items = buildCanvasContextMenuItems({
    controller,
    enabledSnapshot: { canDelete: true, canDuplicate: true, canMerge: true, canReorder: true },
    onClose,
    onOpenImage: vi.fn(),
    request: { kind, layer: { id: 'vector', immutable: false, locked: false, visible: true } },
  });
  return { items, onClose };
}
it('omits clipboard commands when neither operation is available', () => {
  const { items } = menu(createController());
  expect(items.map((item) => item.id)).not.toContain('copy-vector-layers');
  expect(items.map((item) => item.id)).not.toContain('paste-vector-layers');
});
it.each(['single', 'multi'] as const)(
  'copies a %s vector selection and closes the menu',
  async (kind) => {
    const controller = createController();
    vi.mocked(controller.getVectorClipboardAvailability).mockReturnValue({
      canCopy: true,
      canPaste: false,
    });
    const { items, onClose } = menu(controller, kind);
    const copy = items.find((item) => item.id === 'copy-vector-layers');
    const paste = items.find((item) => item.id === 'paste-vector-layers');
    expect(paste).toMatchObject({ disabled: true });
    if (!copy || !('onSelect' in copy)) throw new Error('Missing copy command');
    expect(copy.disabled).toBe(false);
    copy.onSelect();
    expect(onClose).toHaveBeenCalledOnce();
    await feedback.pending;
    expect(controller.copyVectorSelection).toHaveBeenCalledOnce();
    expect(controller.pasteVectorSelection).not.toHaveBeenCalled();
    expect(feedback.actions).toEqual(['canvas-context-menu:copy-vector-layers']);
    expect(feedback.failures).toEqual([]);
  }
);
it('offers paste without copy on blank canvas', async () => {
  const controller = createController();
  vi.mocked(controller.getVectorClipboardAvailability).mockReturnValue({
    canCopy: false,
    canPaste: true,
  });
  const { items, onClose } = menu(controller, 'blank');
  expect(items.map((item) => item.id)).not.toContain('copy-vector-layers');
  const paste = items.find((item) => item.id === 'paste-vector-layers');
  if (!paste || !('onSelect' in paste)) throw new Error('Missing paste command');
  expect(paste.disabled).toBe(false);
  paste.onSelect();
  await feedback.pending;
  expect(controller.pasteVectorSelection).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
  expect(feedback.failures).toEqual([]);
});
it.each(['copy', 'paste'] as const)(
  'reports refused %s commands through action feedback',
  async (kind) => {
    const controller = createController();
    vi.mocked(controller.getVectorClipboardAvailability).mockReturnValue({
      canCopy: true,
      canPaste: true,
    });
    vi.mocked(controller.copyVectorSelection).mockResolvedValue(false);
    vi.mocked(controller.pasteVectorSelection).mockResolvedValue(false);
    const { items, onClose } = menu(controller);
    const item = items.find((item) => item.id === `${kind}-vector-layers`);
    if (!item || !('onSelect' in item)) throw new Error('Missing clipboard command');
    item.onSelect();
    await feedback.pending;
    expect(feedback.failures).toEqual([new Error('editor.elements.operationFailed')]);
    expect(feedback.actions).toEqual([`canvas-context-menu:${kind}-vector-layers`]);
    expect(onClose).toHaveBeenCalledOnce();
  }
);

it('keeps multi-selection duplicate, merge, and delete commands beside vector clipboard actions', async () => {
  const controller = createController();
  vi.mocked(controller.getVectorClipboardAvailability).mockReturnValue({
    canCopy: true,
    canPaste: true,
  });
  const { items, onClose } = menu(controller, 'multi');
  for (const id of ['duplicate-selection', 'merge-layers', 'delete-selection']) {
    const item = items.find((value) => value.id === id);
    if (!item || !('onSelect' in item)) throw new Error(`Missing command ${id}`);
    expect(item.disabled).toBe(false);
    item.onSelect();
    await feedback.pending;
  }
  expect(controller.duplicateSelection).toHaveBeenCalledOnce();
  expect(controller.mergeSelectedLayers).toHaveBeenCalledOnce();
  expect(controller.deleteSelection).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledTimes(3);
  expect(feedback.failures).toEqual([]);
});
it('keeps targeted vector visibility and lock commands bound to the requested layer', () => {
  const controller = createController();
  const { items, onClose } = menu(controller);
  for (const id of ['toggle-visibility', 'toggle-lock', 'delete-layer']) {
    const item = items.find((value) => value.id === id);
    if (!item || !('onSelect' in item)) throw new Error(`Missing command ${id}`);
    item.onSelect();
  }
  expect(controller.toggleLayerVisibility).toHaveBeenCalledWith('vector');
  expect(controller.toggleLayerLock).toHaveBeenCalledWith('vector');
  expect(controller.deleteSelection).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledTimes(3);
});
