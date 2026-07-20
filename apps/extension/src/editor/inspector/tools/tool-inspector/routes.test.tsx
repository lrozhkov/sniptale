// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { renderToolInspector } from './routes/render';
import { createControllerMock } from '../../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createToolsPanelProps } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';

const CONFIGURABLE_TOOLS = [
  'pencil',
  'highlighter',
  'shapes-and-lines',
  'rough-shape',
  'shape-library',
  'rectangle',
  'ellipse',
  'diamond',
  'blur',
  'arrow',
  'callout',
  'text',
  'step',
  'crop',
] as const;

describe('editor inspector tool routing', () => {
  it('keeps single selected image layers on the default tool inspector route', () => {
    const controller = createControllerMock();
    const props = createToolsPanelProps({ highlightedTool: 'select' }) as any;

    const rendered = renderToolInspector(controller as never, 'select', props);

    expect(React.isValidElement(rendered)).toBe(true);
    const renderedElement = rendered as React.ReactElement<{ label: string }>;
    expect(renderedElement.props.label).toBe(translate('editor.compact.state'));
  });

  it('uses the default tool inspector for non-configurable tools', () => {
    const controller = createControllerMock();
    const props = createToolsPanelProps({ highlightedTool: 'image' }) as any;

    expect(renderToolInspector(controller as never, 'select', props)).toBeTruthy();
    expect(renderToolInspector(controller as never, 'image', props)).toBeTruthy();
  });
});

describe('editor inspector concrete tool routing', () => {
  it('renders an explicit multi-rich-shape state instead of a silent no-op inspector', () => {
    const controller = createControllerMock();
    const props = createToolsPanelProps({
      highlightedTool: 'select',
      richShapeSelection: null,
      selection: {
        hasSelection: true,
        selectedObjectCount: 2,
        selectedObjectHeight: null,
        selectedObjectId: null,
        selectedObjectIds: ['shape-1', 'shape-2'],
        selectedObjectType: 'rich-shape',
        selectedObjectWidth: null,
      },
    }) as any;

    const rendered = renderToolInspector(controller as never, 'select', props);

    expect(React.isValidElement(rendered)).toBe(true);
    const renderedElement = rendered as React.ReactElement<{ label: string; value: string }>;
    expect(renderedElement.props.label).toBe(
      translate('editor.compact.richShapeMultipleSelection')
    );
    expect(renderedElement.props.value).toBe(translate('editor.compact.richShapeUnsupported'));
  });

  it.each(CONFIGURABLE_TOOLS)('renders the concrete %s tool route', (tool) => {
    const controller = createControllerMock();
    const props = createToolsPanelProps({ highlightedTool: tool }) as any;

    expect(renderToolInspector(controller as never, tool, props)).toBeTruthy();
  });
});
