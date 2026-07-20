import { describe, expect, it, expectTypeOf } from 'vitest';
import type {
  EditorInspectorConfigurableToolPanelProps,
  EditorInspectorInteractiveToolPanelProps,
  EditorInspectorLayerSizePanelActions,
  EditorInspectorLayerSizePanelState,
  EditorInspectorSelectionAndLayerPanelProps,
  EditorInspectorSelectionPanelState,
} from './panel-types';

describe('editor inspector panel types', () => {
  it('keeps shared selection and layer panel seams importable for owner-local consumers', () => {
    const selectionState = {
      canDeleteSelection: true,
      cropReady: false,
      highlightedTool: 'select',
      inspectorToolSettings: {} as never,
      isResizableLayerSelection: false,
      selection: { hasSelection: true } as never,
    } satisfies EditorInspectorSelectionPanelState;

    const layerState = {
      layerAspectRatio: null,
      layerSizeDraft: { height: 20, width: 10 },
      layerSizeLocked: true,
      layerSizeText: '10 x 20',
    } satisfies EditorInspectorLayerSizePanelState;

    expect(selectionState.canDeleteSelection).toBe(true);
    expect(layerState.layerSizeText).toBe('10 x 20');
    expectTypeOf<EditorInspectorLayerSizePanelActions['setLayerSizeDraft']>().toBeFunction();
    expectTypeOf<EditorInspectorLayerSizePanelActions['setLayerSizeLocked']>().toBeFunction();
    expectTypeOf<EditorInspectorSelectionAndLayerPanelProps['selection']>().toMatchTypeOf<
      EditorInspectorSelectionPanelState['selection']
    >();
    expectTypeOf<EditorInspectorInteractiveToolPanelProps['applyTextPatch']>().toBeFunction();
    expectTypeOf<
      EditorInspectorConfigurableToolPanelProps['borderPresetOptions'][number]['value']
    >().toEqualTypeOf<string>();
  });
});
