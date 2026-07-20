// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { createControllerMock } from '../../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createToolsPanelProps } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { renderToolInspector } from './';

describe('editor inspector tools routing', () => {
  it('keeps selected image layers on the default inspector seam', () => {
    const controller = createControllerMock();
    const props = createToolsPanelProps({ highlightedTool: 'select' }) as any;

    const rendered = renderToolInspector(controller as never, 'select', props);

    expect(React.isValidElement(rendered)).toBe(true);
    const renderedElement = rendered as React.ReactElement<{ label: string }>;
    expect(renderedElement.props.label).toBe(translate('editor.compact.state'));
  });
});
