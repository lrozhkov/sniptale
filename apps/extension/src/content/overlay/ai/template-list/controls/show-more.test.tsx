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

import { TemplateListShowMoreButton } from './show-more';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../test-support/react-root';

let rendered: RenderedReactTestNode | null = null;

function createProps() {
  return {
    hasMore: true,
    isLoading: false,
    orderedTemplatesCount: 9,
    setShowAll: vi.fn(),
    showAll: false,
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

describe('TemplateListShowMoreButton', () => {
  it('renders the remaining-count CTA and delegates show-all activation', async () => {
    const props = createProps();

    await renderNode(<TemplateListShowMoreButton {...props} />);

    const button = rendered?.container.querySelector('button');

    if (!button) {
      throw new Error('Expected rendered show-more button');
    }

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(button.textContent).toBe('+3aiModal.templatesShowMoreSuffix');
    expect(props.setShowAll).toHaveBeenCalledWith(true);
  });

  it('returns null when all templates are already visible', async () => {
    const props = createProps();
    props.showAll = true;

    await renderNode(<TemplateListShowMoreButton {...props} />);

    expect(rendered?.container.innerHTML).toBe('');
  });
});
