// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { addButtonMock, showMoreButtonMock } = vi.hoisted(() => ({
  addButtonMock: vi.fn((_props: unknown) => <div data-testid="add-button" />),
  showMoreButtonMock: vi.fn((_props: unknown) => <div data-testid="show-more-button" />),
}));

vi.mock('../controls/show-more', () => ({
  TemplateListShowMoreButton: (props: unknown) => {
    showMoreButtonMock(props);
    return <div data-testid="show-more-button" />;
  },
}));

vi.mock('../controls/add', () => ({
  TemplateListAddButton: (props: unknown) => {
    addButtonMock(props);
    return <div data-testid="add-button" />;
  },
}));

import { TemplateListActions } from './actions';
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
    onAddTemplate: vi.fn(),
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
  addButtonMock.mockClear();
  showMoreButtonMock.mockClear();
});

afterEach(() => {
  cleanupRenderedNode(rendered);
  rendered = null;
});

describe('TemplateListActions', () => {
  it('passes action contracts to the canonical show-more and add-button owners', async () => {
    const props = createProps();

    await renderNode(<TemplateListActions {...props} />);

    expect(showMoreButtonMock).toHaveBeenCalledWith({
      hasMore: true,
      isLoading: false,
      orderedTemplatesCount: 9,
      setShowAll: props.setShowAll,
      showAll: false,
    });
    expect(addButtonMock).toHaveBeenCalledWith({
      isLoading: false,
      onAddTemplate: props.onAddTemplate,
    });
  });

  it('still mounts both owner seams when loading and visibility flags change', async () => {
    const props = createProps();
    props.hasMore = false;
    props.isLoading = true;

    await renderNode(<TemplateListActions {...props} />);

    expect(showMoreButtonMock).toHaveBeenCalledWith({
      hasMore: false,
      isLoading: true,
      orderedTemplatesCount: 9,
      setShowAll: props.setShowAll,
      showAll: false,
    });
    expect(addButtonMock).toHaveBeenCalledWith({
      isLoading: true,
      onAddTemplate: props.onAddTemplate,
    });
  });
});
