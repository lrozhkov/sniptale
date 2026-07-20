// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { blurPromptIfFocusedMock, createTemplateSelectHandlerMock } = vi.hoisted(() => ({
  blurPromptIfFocusedMock: vi.fn(),
  createTemplateSelectHandlerMock: vi.fn(),
}));

vi.mock('../helpers', () => ({
  blurPromptIfFocused: blurPromptIfFocusedMock,
  createTemplateSelectHandler: createTemplateSelectHandlerMock,
}));

import { TemplatePillButton } from './button';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../../test-support/react-root';
import { createPromptTemplate } from '../../test-support';

let rendered: RenderedReactTestNode | null = null;

const template = createPromptTemplate();

async function renderNode(node: React.ReactNode) {
  rendered = await renderIntoTestContainer(node);
}

enableReactActEnvironment();

beforeEach(() => {
  blurPromptIfFocusedMock.mockReset();
  createTemplateSelectHandlerMock.mockReset();
  createTemplateSelectHandlerMock.mockImplementation(
    ({ onSelectTemplate, template: selectedTemplate }) =>
      () =>
        onSelectTemplate(selectedTemplate)
  );
});

afterEach(() => {
  cleanupRenderedNode(rendered);
  rendered = null;
});

describe('TemplatePillButton', () => {
  it('wires blur-on-mousedown and delegated select behavior', async () => {
    const onSelectTemplate = vi.fn();

    await renderNode(
      <TemplatePillButton
        dragStateMoved={false}
        isLoading={false}
        onSelectTemplate={onSelectTemplate}
        template={template}
      />
    );

    const button = rendered?.container.querySelector('button');

    if (!button) {
      throw new Error('Expected rendered button');
    }

    act(() => {
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createTemplateSelectHandlerMock).toHaveBeenCalledWith({
      dragStateMoved: false,
      isLoading: false,
      onSelectTemplate,
      template,
    });
    expect(blurPromptIfFocusedMock).toHaveBeenCalled();
    expect(onSelectTemplate).toHaveBeenCalledWith(template);
  });
});
