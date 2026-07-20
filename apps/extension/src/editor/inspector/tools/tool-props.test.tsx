import { describe, expect, it } from 'vitest';
import { createToolsPanelProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import {
  createArrowControlsProps,
  createBlurControlsProps,
  createLineControlsProps,
  createShapeControlsProps,
  createStepControlsProps,
  createTextControlsProps,
} from './tool-props';

function expectShapeAndArrowProps(props: any) {
  const shapeProps = createShapeControlsProps(props, 'ellipse');
  const arrowProps = createArrowControlsProps(props);

  expect(shapeProps.applyPreset).toBe(props.applyPreset);
  expect(shapeProps.shapeTool).toBe('ellipse');
  expect(shapeProps.borderPresetOptions).toBe(props.borderPresetOptions);
  expect(shapeProps.previewShapePatch).toBe(props.previewShapePatch);
  expect(shapeProps.commitPendingSelectionSettings).toBe(props.commitPendingSelectionSettings);
  expect(shapeProps.saveShapeAsHighlighterPreset).toBe(props.saveShapeAsHighlighterPreset);
  expect(arrowProps.applyArrowPatch).toBe(props.applyArrowPatch);
  expect(arrowProps.previewArrowPatch).toBe(props.previewArrowPatch);
  expect(arrowProps.commitPendingSelectionSettings).toBe(props.commitPendingSelectionSettings);
  expect(arrowProps.arrowVariantOptions).toBe(props.arrowVariantOptions);
  expect(arrowProps.arrowHeadOptions).toBe(props.arrowHeadOptions);
  expect(arrowProps.arrowModeOptions).toBe(props.arrowModeOptions);
  expect(arrowProps.arrowTypeOptions).toBe(props.arrowTypeOptions);
}

function expectBlurTextAndStepProps(props: any) {
  const blurProps = createBlurControlsProps(props);
  const lineProps = createLineControlsProps(props);
  const textProps = createTextControlsProps(props);
  const stepProps = createStepControlsProps(props);

  expect(blurProps.applyBlurPatch).toBe(props.applyBlurPatch);
  expect(blurProps.previewBlurPatch).toBe(props.previewBlurPatch);
  expect(blurProps.blurTypeOptions).toBe(props.blurTypeOptions);
  expect(blurProps.lineStyleOptions).toBe(props.lineStyleOptions);
  expect(blurProps.shapeStrokePalette).toBe(props.shapeStrokePalette);
  expect(lineProps.applyLinePatch).toBe(props.applyLinePatch);
  expect(lineProps.previewLinePatch).toBe(props.previewLinePatch);
  expect(lineProps.lineStyleOptions).toBe(props.lineStyleOptions);
  expect(lineProps.lineCornerOptions).toBe(props.lineCornerOptions);
  expect(lineProps.lineFillModeOptions).toBe(props.lineFillModeOptions);
  expect(lineProps.lineRoughFillStyleOptions).toBe(props.lineRoughFillStyleOptions);
  expect(textProps.applyTextPatch).toBe(props.applyTextPatch);
  expect(textProps.applyTextStyle).toBe(props.applyTextStyle);
  expect(textProps.previewTextPatch).toBe(props.previewTextPatch);
  expect(textProps.commitPendingSelectionSettings).toBe(props.commitPendingSelectionSettings);
  expect(textProps.textAlignOptions).toBe(props.textAlignOptions);
  expect(textProps.textCalloutFormatOptions).toBe(props.textCalloutFormatOptions);
  expect(textProps.textLayoutModeOptions).toBe(props.textLayoutModeOptions);
  expect(textProps.textVerticalAlignOptions).toBe(props.textVerticalAlignOptions);
  expect(textProps.fontOptions).toBe(props.fontOptions);
  expect(stepProps.applyStepPatch).toBe(props.applyStepPatch);
  expect(stepProps.previewStepPatch).toBe(props.previewStepPatch);
  expect(stepProps.commitPendingSelectionSettings).toBe(props.commitPendingSelectionSettings);
  expect(stepProps.stepAlphabetOptions).toBe(props.stepAlphabetOptions);
  expect(stepProps.textColorPalette).toBe(props.textColorPalette);
}

describe('editor inspector tool control creators', () => {
  it('creates per-tool props from the shared tool surface', () => {
    const props = createToolsPanelProps({
      highlightedTool: 'ellipse',
      textAlignOptions: [{ label: 'Left', value: 'left' }],
      textLayoutModeOptions: [{ label: 'Auto', value: 'auto' }],
      textVerticalAlignOptions: [{ label: 'Top', value: 'top' }],
    }) as any;

    expectShapeAndArrowProps(props);
    expectBlurTextAndStepProps(props);
  });

  it('falls back to empty layout and alignment catalogs for text controls', () => {
    const props = createToolsPanelProps({
      highlightedTool: 'text',
      textAlignOptions: undefined,
      textLayoutModeOptions: undefined,
    }) as any;

    const textProps = createTextControlsProps(props);

    expect(textProps.textAlignOptions).toEqual([]);
    expect(textProps.textLayoutModeOptions).toEqual([]);
    expect(textProps.textVerticalAlignOptions).toEqual([]);
  });

  it('falls back to no-op line patch handlers for legacy callers', () => {
    const props = createToolsPanelProps({
      applyLinePatch: undefined,
      previewLinePatch: undefined,
    }) as any;

    const lineProps = createLineControlsProps(props);

    expect(() => lineProps.applyLinePatch({ width: 8 })).not.toThrow();
    expect(() => lineProps.previewLinePatch({ opacity: 0.4 })).not.toThrow();
  });
});
