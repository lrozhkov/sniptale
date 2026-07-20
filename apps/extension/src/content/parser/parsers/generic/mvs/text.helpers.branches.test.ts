// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { resolveBlockTitle } from './text.helpers';

function createBlock(): HTMLDivElement {
  const block = document.createElement('div');
  document.body.append(block);
  return block;
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerDataTitleNullFallbackTests() {
  it('falls back from empty data-title attributes to title-text sources', () => {
    const block = createBlock();
    const empty = document.createElement('div');
    empty.setAttribute('data-title', '  ');
    const titled = document.createElement('div');
    titled.title = 'Card title';
    titled.textContent = '  Text fallback title ';
    block.append(empty, titled);

    expect(resolveBlockTitle(block)).toEqual(
      expect.objectContaining({
        sourceElement: titled,
        text: 'Text fallback title',
      })
    );
  });
}

function registerNoTitleTextFallbackTests() {
  it('returns null when title-bearing elements normalize to empty text', () => {
    const block = createBlock();
    const empty = document.createElement('div');
    empty.title = 'Visible title';
    const image = document.createElement('img');
    image.alt = 'ignored';
    empty.append(image);
    block.append(empty);

    expect(resolveBlockTitle(block)).toBeNull();
  });
}

describe('mvs embedded app text helper branch coverage', () => {
  registerDataTitleNullFallbackTests();
  registerNoTitleTextFallbackTests();
});
