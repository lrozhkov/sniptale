import React from 'react';
import { expect, it } from 'vitest';

import { createToolsPanelProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { renderEditorInspectorContentToolsSections } from './tools';

it('passes arrow and text tool options through to the tools panel', () => {
  const props = createToolsPanelProps();
  props.toolPresetHeader = { value: 'tool-preset' } as never;

  const element = renderEditorInspectorContentToolsSections(props as never);
  expect(React.isValidElement(element)).toBe(true);

  expect(element.props).toEqual(
    expect.objectContaining({
      applyArrowPatch: props.applyArrowPatch,
      commitPendingSelectionSettings: props.commitPendingSelectionSettings,
      previewArrowPatch: props.previewArrowPatch,
      previewBrushPatch: props.previewBrushPatch,
      previewShapePatch: props.previewShapePatch,
      previewStepPatch: props.previewStepPatch,
      previewTextPatch: props.previewTextPatch,
      applyTextPatch: props.applyTextPatch,
      applyTextStyle: props.applyTextStyle,
      arrowHeadOptions: props.arrowHeadOptions,
      arrowModeOptions: props.arrowModeOptions,
      previewColor: props.previewColor,
      textCalloutFormatOptions: props.textCalloutFormatOptions,
      toolPresetHeader: { value: 'tool-preset' },
      toNumber: props.toNumber,
    })
  );
});

it('injects selection action icons for the tools panel shell', () => {
  const props = createToolsPanelProps();

  const element = renderEditorInspectorContentToolsSections(props as never);

  expect(React.isValidElement(element.props.selectionDuplicateIcon)).toBe(true);
  expect(React.isValidElement(element.props.selectionDeleteIcon)).toBe(true);
  expect(element.props).toEqual(
    expect.objectContaining({
      applyPreset: props.applyPreset,
      saveShapeAsHighlighterPreset: props.saveShapeAsHighlighterPreset,
      previewArrowPatch: props.previewArrowPatch,
      previewTextPatch: props.previewTextPatch,
      textCalloutFormatOptions: props.textCalloutFormatOptions,
    })
  );
});
