import { expect, it } from 'vitest';

import { createContentProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { createEditorInspectorContentBodyProps } from './params';

function expectTextBodyProps(
  bodyProps: ReturnType<typeof createEditorInspectorContentBodyProps>,
  props: ReturnType<typeof createContentProps>
) {
  expectTextOptionCatalog(bodyProps);
  expectTextActionPlumbing(bodyProps, props);
}

function expectTextOptionCatalog(
  bodyProps: ReturnType<typeof createEditorInspectorContentBodyProps>
) {
  expect(bodyProps).not.toHaveProperty('browserAppearanceOptions');
  expect(bodyProps).not.toHaveProperty('browserVariantOptions');
  expect(bodyProps).not.toHaveProperty('browserThemeOptions');
  expect(bodyProps).not.toHaveProperty('browserModeOptions');
  expect(bodyProps.textCalloutFormatOptions.map((option) => option.value)).toEqual([
    'plain',
    'panel',
    'bubble',
    'pointer',
    'flag',
    'arrow-bubble',
  ]);
  expect(bodyProps.textLayoutModeOptions.map((option) => option.value)).toEqual([
    'auto',
    'fixed-width',
  ]);
  expect(bodyProps.textAlignOptions.map((option) => option.value)).toEqual([
    'left',
    'center',
    'right',
  ]);
  expect(bodyProps.textVerticalAlignOptions.map((option) => option.value)).toEqual([
    'top',
    'center',
    'bottom',
  ]);
}

function expectTextActionPlumbing(
  bodyProps: ReturnType<typeof createEditorInspectorContentBodyProps>,
  props: ReturnType<typeof createContentProps>
) {
  expect(bodyProps.applyTextStyle).toBe(props.applyTextStyle);
  expect(bodyProps.applyTextPatch).toBe(props.applyTextPatch);
  expect(bodyProps.applyRichShapePatch).toBe(props.applyRichShapePatch);
  expect(bodyProps.arrangeSelection).toBe(props.arrangeSelection);
  expect(bodyProps.applyBlurPatch).toBe(props.applyBlurPatch);
  expect(bodyProps.previewArrowPatch).toBe(props.previewArrowPatch);
  expect(bodyProps.applyLinePatch).toBe(props.applyLinePatch);
  expect(bodyProps.applyImagePatch).toBe(props.applyImagePatch);
  expect(bodyProps.previewLinePatch).toBe(props.previewLinePatch);
  expect(bodyProps.previewImagePatch).toBe(props.previewImagePatch);
  expect(bodyProps.previewBlurPatch).toBe(props.previewBlurPatch);
  expect(bodyProps.previewShapePatch).toBe(props.previewShapePatch);
  expect(bodyProps.previewBrushPatch).toBe(props.previewBrushPatch);
  expect(bodyProps.previewTextPatch).toBe(props.previewTextPatch);
  expect(bodyProps.previewStepPatch).toBe(props.previewStepPatch);
  expect(bodyProps.setPencilShapeCorrection).toBe(props.setPencilShapeCorrection);
  expect(bodyProps.commitPendingSelectionSettings).toBe(props.commitPendingSelectionSettings);
  expect(bodyProps.insertOrUpdateBrowserFrame).toBe(props.insertOrUpdateBrowserFrame);
  expect(bodyProps.applyWorkspaceColor).toBe(props.applyWorkspaceColor);
  expect(bodyProps.saveWorkspaceColorAsDefault).toBe(props.saveWorkspaceColorAsDefault);
  expect(bodyProps.previewColor).toBe(props.previewColor);
  expect(bodyProps.updateLockedDraft).toEqual(expect.any(Function));
  expect(bodyProps.workspaceColorMatchesDefault).toBe(props.workspaceColorMatchesDefault);
  expect(bodyProps.workspaceDefaultSavePending).toBe(props.workspaceDefaultSavePending);
  expect(bodyProps.richShapeSelection).toBe(props.richShapeSelection);
}

function expectArrowOptions(bodyProps: ReturnType<typeof createEditorInspectorContentBodyProps>) {
  expect(bodyProps.arrowVariantOptions.map((option) => option.value)).toEqual([
    'standard',
    'tapered',
  ]);
  expect(bodyProps.arrowModeOptions.map((option) => option.value)).toEqual(['straight', 'curve']);
  expect(bodyProps.arrowTypeOptions.map((option) => option.value)).toEqual([
    'sharp',
    'curved',
    'elbow',
  ]);
  expect(bodyProps.arrowHeadOptions.map((option) => option.value)).toEqual([
    'none',
    'arrow',
    'triangle',
    'triangle-outline',
    'bar',
    'circle',
    'circle-outline',
    'diamond',
    'diamond-outline',
    'block',
  ]);
}

function expectLineAndBlurOptions(
  bodyProps: ReturnType<typeof createEditorInspectorContentBodyProps>
) {
  expect(bodyProps.lineStyleOptions.map((option) => option.value)).toEqual([
    'solid',
    'dash',
    'dot',
    'dash-dot',
    'long-dash',
  ]);
  expect(bodyProps.lineCornerOptions.map((option) => option.value)).toEqual(['round', 'sharp']);
  expect(bodyProps.lineFillModeOptions.map((option) => option.value)).toEqual([
    'none',
    'color',
    'gradient',
    'rough',
  ]);
  expect(bodyProps.lineRoughFillStyleOptions.map((option) => option.value)).toContain('hachure');
  expect(bodyProps.blurTypeOptions.map((option) => option.value)).toEqual([
    'gaussian',
    'distortion',
    'pixelate',
    'solid',
  ]);
}

function expectGridAndBrowserHelpers(
  bodyProps: ReturnType<typeof createEditorInspectorContentBodyProps>,
  props: ReturnType<typeof createContentProps>
) {
  expect(bodyProps.gridSizeMin).toBeGreaterThan(0);
  expect(bodyProps.gridSizeMax).toBeGreaterThan(bodyProps.gridSizeMin);
  expect(bodyProps.toNumber('7', 1)).toBe(7);
  expect(bodyProps.clampGridSize(bodyProps.gridSizeMax + 10)).toBe(bodyProps.gridSizeMax);
  expect(bodyProps.framePaddingSummary).toBe(props.framePaddingSummary);
  expect(bodyProps.browserCanvasModeOptions.map((option) => option.value)).toEqual([
    'resize',
    'keep-size',
  ]);
  expect(bodyProps.browserContentModeOptions.map((option) => option.value)).toEqual([
    'push-down',
    'fit-content',
  ]);
}

it('builds arrow options and numeric helpers through content body props', () => {
  const props = createContentProps();
  const bodyProps = createEditorInspectorContentBodyProps(props as never);

  expectArrowOptions(bodyProps);
  expectLineAndBlurOptions(bodyProps);
  expectGridAndBrowserHelpers(bodyProps, props);
});

it('threads text callout and rich-formatting actions through content body props', () => {
  const props = createContentProps();
  const bodyProps = createEditorInspectorContentBodyProps(props as never);

  expectTextBodyProps(bodyProps, props);
});

it('omits optional line and browser actions for legacy-shaped content props', () => {
  const props = createContentProps() as ReturnType<typeof createContentProps> & {
    applyLinePatch?: () => void;
    applyImagePatch?: () => void;
    insertOrUpdateBrowserFrame?: () => Promise<void>;
    previewLinePatch?: () => void;
    previewImagePatch?: () => void;
  };
  Reflect.deleteProperty(props, 'applyLinePatch');
  Reflect.deleteProperty(props, 'applyImagePatch');
  Reflect.deleteProperty(props, 'insertOrUpdateBrowserFrame');
  Reflect.deleteProperty(props, 'previewLinePatch');
  Reflect.deleteProperty(props, 'previewImagePatch');

  const bodyProps = createEditorInspectorContentBodyProps(props as never);

  expect(bodyProps).not.toHaveProperty('applyLinePatch');
  expect(bodyProps).not.toHaveProperty('applyImagePatch');
  expect(bodyProps).not.toHaveProperty('previewLinePatch');
  expect(bodyProps).not.toHaveProperty('previewImagePatch');
  expect(bodyProps).not.toHaveProperty('insertOrUpdateBrowserFrame');
});

it('omits insert or update browser-header action when the controller does not expose it', () => {
  const bodyProps = createEditorInspectorContentBodyProps(
    createContentProps({ insertOrUpdateBrowserFrame: undefined }) as never
  );

  expect(bodyProps).not.toHaveProperty('insertOrUpdateBrowserFrame');
});

it('omits optional line and image patch actions for legacy content controllers', () => {
  const bodyProps = createEditorInspectorContentBodyProps(
    createContentProps({
      applyImagePatch: undefined,
      applyLinePatch: undefined,
      previewImagePatch: undefined,
      previewLinePatch: undefined,
    }) as never
  );

  expect(bodyProps).not.toHaveProperty('applyLinePatch');
  expect(bodyProps).not.toHaveProperty('applyImagePatch');
  expect(bodyProps).not.toHaveProperty('previewImagePatch');
  expect(bodyProps).not.toHaveProperty('previewLinePatch');
});
