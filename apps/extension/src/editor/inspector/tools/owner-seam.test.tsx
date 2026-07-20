// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  cleanupDom,
  createControllerMock,
  renderWithController,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createToolsPanelProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { EditorInspectorToolsPanel } from '.';
import { createArrowControlsProps, createShapeControlsProps } from './tool-props';
import { renderToolInspector } from './tool-inspector';

describe('editor inspector tools owner seam', () => {
  it('keeps the shell thin and routes tool branches through owner-local seams', async () => {
    const controller = createControllerMock();
    const panelProps = createToolsPanelProps({ highlightedTool: 'select' }) as any;

    renderWithController(<EditorInspectorToolsPanel {...panelProps} />, controller);
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .filter((button) => button.textContent?.includes(translate('editor.compact.apply')))
        .forEach((button) => button.click());
    });
    expect(controller.resizeLayer).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(translate('editor.compact.chooseToolOrObject'));

    cleanupDom();
    const rendered = renderToolInspector(controller as never, 'select', panelProps);
    expect(React.isValidElement(rendered)).toBe(true);
    const renderedElement = rendered as React.ReactElement<{ label: string }>;
    expect(renderedElement.props.label).toBe(translate('editor.compact.state'));

    const shapeProps = createShapeControlsProps(panelProps, 'rectangle');
    const arrowProps = createArrowControlsProps(panelProps);
    expect(shapeProps.applyShapePatch).toBe(panelProps.applyShapePatch);
    expect(shapeProps.borderPresetOptions).toBe(panelProps.borderPresetOptions);
    expect(shapeProps.saveShapeAsHighlighterPreset).toBe(panelProps.saveShapeAsHighlighterPreset);
    expect(arrowProps.applyArrowPatch).toBe(panelProps.applyArrowPatch);
    expect(arrowProps.arrowVariantOptions).toBe(panelProps.arrowVariantOptions);
    expect(arrowProps.arrowHeadOptions).toBe(panelProps.arrowHeadOptions);
  });
});
