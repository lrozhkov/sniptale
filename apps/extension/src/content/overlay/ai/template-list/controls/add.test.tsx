// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', () => ({
  translate: translateMock,
}));

import { TemplateListAddButton } from './add';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../test-support/react-root';

let rendered: RenderedReactTestNode | null = null;

function createProps() {
  return {
    isLoading: false,
    onAddTemplate: vi.fn(),
  };
}

async function renderNode(node: React.ReactNode) {
  rendered = await renderIntoTestContainer(node);
}

enableReactActEnvironment();

beforeEach(() => {
  translateMock.mockClear();
});

afterEach(() => {
  cleanupRenderedNode(rendered);
  rendered = null;
});

describe('TemplateListAddButton', () => {
  it('renders the add CTA and delegates the click handler', async () => {
    const props = createProps();

    await renderNode(<TemplateListAddButton {...props} />);

    const button = rendered?.container.querySelector('button');

    if (!button) {
      throw new Error('Expected rendered add button');
    }

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(button.textContent).toContain('common.actions.add');
    expect(props.onAddTemplate).toHaveBeenCalledTimes(1);
  });

  it('keeps the add CTA disabled while templates are loading', async () => {
    const props = createProps();
    props.isLoading = true;

    await renderNode(<TemplateListAddButton {...props} />);

    expect(rendered?.container.querySelector('.sniptale-add-btn')).toHaveProperty('disabled', true);
  });
});
