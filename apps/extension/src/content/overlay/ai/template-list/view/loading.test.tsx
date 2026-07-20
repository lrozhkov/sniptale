// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', () => ({
  translate: translateMock,
}));

import { TemplateListLoadingState } from './loading';
import {
  cleanupRenderedNode,
  enableReactActEnvironment,
  renderIntoTestContainer,
  type RenderedReactTestNode,
} from '../../test-support/react-root';

let rendered: RenderedReactTestNode | null = null;

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

describe('TemplateListLoadingState', () => {
  it('renders the translated label and loading copy', async () => {
    await renderNode(<TemplateListLoadingState />);

    expect(rendered?.container.querySelector('.sniptale-label')?.textContent).toBe(
      'aiModal.templatesLabel'
    );
    expect(rendered?.container.querySelector('.sniptale-template-loading')?.textContent).toBe(
      'common.states.loadingaiModal.templatesLoadingSuffix'
    );
  });
});
