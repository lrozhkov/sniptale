import type { EditorFloatingDocumentController } from './document-bar';

const DEFAULT_LAYER_SIZE = { height: 100, width: 100 };

export function createFloatingDocumentControllerFixture(
  overrides: Partial<EditorFloatingDocumentController> = {}
): EditorFloatingDocumentController {
  return {
    canDeleteSelection: true,
    compactCommandGroups: [],
    DimensionInput: () => null,
    inspector: 'document',
    isResizableLayerSelection: false,
    layerAspectRatio: null,
    layerSizeDraft: DEFAULT_LAYER_SIZE,
    layerSizeLocked: false,
    onResizeLayer: async () => undefined,
    setLayerSizeDraft: () => undefined,
    updateLockedDraft: (state: { height: number; width: number }) => state,
    ...overrides,
  } as unknown as EditorFloatingDocumentController;
}
