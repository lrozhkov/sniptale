// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { createControllerMock } from '../../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createToolsPanelProps } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { renderToolInspector } from './';

function createToolInspectorProps(highlightedTool: 'select' | 'shape') {
  const props = createToolsPanelProps({ highlightedTool });
  return {
    ...props,
    highlightedTool,
    selection: { ...props.selection, selectedObjectType: 'shape' as const },
  };
}

describe('editor inspector tools routing', () => {
  it('keeps selected image layers on the default inspector seam', () => {
    const controller = createControllerMock();
    const props = createToolInspectorProps('select');

    const rendered = renderToolInspector(controller, 'select', props);

    expect(React.isValidElement(rendered)).toBe(true);
    const renderedElement = rendered as React.ReactElement<{ label: string }>;
    expect(renderedElement.props.label).toBe(translate('editor.compact.state'));
  });

  it('keeps the retained rich-shape catalog suspended for the shared shape tool', () => {
    const controller = createControllerMock();
    const props = createToolInspectorProps('shape');

    const rendered = renderToolInspector(controller, 'shape', props);

    expect(React.isValidElement(rendered)).toBe(true);
    const renderedElement = rendered as React.ReactElement<{ label: string }>;
    expect(renderedElement.props.label).toBe(translate('editor.compact.state'));
  });
});
