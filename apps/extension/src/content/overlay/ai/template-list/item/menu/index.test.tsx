// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptTemplate } from '../../../../../../contracts/settings';

const { actionItemsMock } = vi.hoisted(() => ({
  actionItemsMock: vi.fn(
    (props: { onEdit: (template: PromptTemplate) => void; template: PromptTemplate }) => (
      <button type="button" onClick={() => props.onEdit(props.template)}>
        edit
      </button>
    )
  ),
}));

vi.mock('./actions', () => ({
  TemplateMenuActionItems: (props: {
    onEdit: (template: PromptTemplate) => void;
    template: PromptTemplate;
  }) => {
    actionItemsMock(props);
    return (
      <button type="button" onClick={() => props.onEdit(props.template)}>
        edit
      </button>
    );
  },
}));

import { renderTemplateMenu } from '.';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../../test-support/react-root';
import { createPromptTemplate } from '../../test-support';

let rendered: RenderedReactTestNode | null = null;

const template = createPromptTemplate() as PromptTemplate;

async function renderNode(node: React.ReactNode) {
  rendered = await renderIntoTestContainer(node);
}

enableReactActEnvironment();

beforeEach(() => {
  actionItemsMock.mockClear();
});

afterEach(() => {
  cleanupRenderedNode(rendered);
  rendered = null;
});

describe('renderTemplateMenu', () => {
  it('closes the menu before delegating edit callbacks', async () => {
    const setOpenMenuId = vi.fn();
    const onEditTemplate = vi.fn();

    await renderNode(
      renderTemplateMenu({
        isLoading: false,
        onDeleteTemplate: vi.fn(),
        onEditTemplate,
        state: {
          setOpenMenuId,
        } as unknown as Parameters<typeof renderTemplateMenu>[0]['state'],
        template,
      })
    );

    const editButton = rendered?.container.querySelector('button');
    act(() => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(actionItemsMock).toHaveBeenCalled();
    expect(setOpenMenuId).toHaveBeenCalledWith(null);
    expect(onEditTemplate).toHaveBeenCalledWith(template);
  });
});
