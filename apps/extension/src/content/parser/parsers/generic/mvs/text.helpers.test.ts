// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { extractMeaningfulText, resolveBlockTitle, resolveLinkValue } from './text.helpers';

function resetMvsTextHelperDom(): void {
  document.body.replaceChildren();
}

function createBlock(): HTMLDivElement {
  const block = document.createElement('div');
  document.body.append(block);
  return block;
}

function registerMeaningfulTextTests(): void {
  it('normalizes whitespace and drops non-text visual nodes', () => {
    const block = createBlock();
    const title = document.createElement('span');
    title.textContent = '  Main\u00a0Title  ';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.textContent = 'ignored';
    icon.append(iconText);
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = 'alert(1)';
    const details = document.createElement('span');
    details.textContent = '\nSecondary\tlabel\n';

    block.append(title, icon, script, details);

    expect(extractMeaningfulText(block)).toBe('Main Title Secondary label');
  });
}

function verifyResolvedLinkedValue() {
  it('returns normalized link data for linked values', () => {
    const link = document.createElement('a');
    link.href = 'https://example.com/item';
    link.textContent = '  Linked\u00a0value  ';

    expect(resolveLinkValue(link)).toEqual({
      linkRef: 'https://example.com/item',
      value: 'Linked value',
      valueType: 'link',
    });
  });
}

function verifyPlainTextFallbackWhenAnchorTextMissing() {
  it('falls back to plain text when anchor text is missing', () => {
    const container = document.createElement('div');
    const link = document.createElement('a');
    link.href = 'https://example.com/item';
    const text = document.createElement('span');
    text.textContent = 'Fallback content';
    container.append(link, text);

    expect(resolveLinkValue(container)).toEqual({
      value: 'Fallback content',
      valueType: 'string',
    });
  });
}

function verifyNestedAnchorTextNormalization() {
  it('normalizes nested anchor text before returning a linked value', () => {
    const link = document.createElement('a');
    link.href = 'https://example.com/item';
    const prefix = document.createElement('span');
    prefix.textContent = '  Catalog ';
    const suffix = document.createElement('span');
    suffix.textContent = '\nEntry  ';
    link.append(prefix, suffix);

    expect(resolveLinkValue(link)).toEqual({
      linkRef: 'https://example.com/item',
      value: 'Catalog Entry',
      valueType: 'link',
    });
  });
}

function verifyPlainTextFallbackWhenHrefMissing() {
  it('falls back to normalized plain text when an anchor lacks a usable href', () => {
    const link = document.createElement('a');
    const title = document.createElement('span');
    title.textContent = '  Title from text  ';
    link.append(title);

    expect(resolveLinkValue(link)).toEqual({
      value: 'Title from text',
      valueType: 'string',
    });
  });
}

function verifyHashFragmentLinksStayLinked() {
  it('treats hash-fragment anchors as link-backed values once the browser normalizes the href', () => {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = '  Inline title  ';

    expect(resolveLinkValue(link)).toEqual({
      linkRef: 'http://localhost:3000/#',
      value: 'Inline title',
      valueType: 'link',
    });
  });
}

function registerLinkValueTests(): void {
  verifyResolvedLinkedValue();
  verifyPlainTextFallbackWhenAnchorTextMissing();
  verifyNestedAnchorTextNormalization();
  verifyPlainTextFallbackWhenHrefMissing();
  verifyHashFragmentLinksStayLinked();
}

function registerBlockTitlePrimarySourceTests(): void {
  it('prefers top-level links when they provide a title', () => {
    const block = createBlock();
    const link = document.createElement('a');
    link.href = 'https://example.com/card';
    link.target = '_top';
    link.textContent = '  Card title ';
    block.append(link);

    expect(resolveBlockTitle(block)).toEqual(
      expect.objectContaining({
        linkRef: 'https://example.com/card',
        sourceElement: link,
        text: 'Card title',
      })
    );
  });

  it('accepts uuid anchors as title links when target=_top is absent', () => {
    const block = createBlock();
    const link = document.createElement('a');
    link.href = 'https://example.test/object#uuid:item-1';
    link.textContent = '  UUID title ';
    block.append(link);

    expect(resolveBlockTitle(block)).toEqual(
      expect.objectContaining({
        linkRef: 'https://example.test/object#uuid:item-1',
        sourceElement: link,
        text: 'UUID title',
      })
    );
  });

  it('falls back to the first non-empty data-title attribute', () => {
    const block = createBlock();
    const empty = document.createElement('div');
    empty.setAttribute('data-title', '   ');
    const titled = document.createElement('div');
    titled.setAttribute('data-title', '  Summary block  ');
    block.append(empty, titled);

    expect(resolveBlockTitle(block)).toEqual(
      expect.objectContaining({
        sourceElement: titled,
        text: 'Summary block',
      })
    );
  });
}

function registerBlockTitleFallbackTests(): void {
  it('falls back to data-title when the first matching link has no meaningful text', () => {
    const block = createBlock();
    const emptyLink = document.createElement('a');
    emptyLink.href = 'https://example.com/empty';
    emptyLink.target = '_top';
    const titled = document.createElement('div');
    titled.setAttribute('data-title', '  Data-title fallback  ');
    block.append(emptyLink, titled);

    expect(resolveBlockTitle(block)).toEqual(
      expect.objectContaining({
        sourceElement: titled,
        text: 'Data-title fallback',
      })
    );
  });
}

function registerTitleTextFallbackTest(): void {
  it('falls back to title-bearing text elements when link and data-title are unavailable', () => {
    const block = createBlock();
    const long = document.createElement('div');
    long.title = 'Long title attribute';
    long.textContent = 'X'.repeat(220);
    const titled = document.createElement('div');
    titled.title = 'Card title';
    titled.textContent = '  Rendered title text ';
    block.append(long, titled);

    expect(resolveBlockTitle(block)).toEqual(
      expect.objectContaining({
        sourceElement: titled,
        text: 'Rendered title text',
      })
    );
  });
}

function registerEmptyTitleSourceTests(): void {
  it('returns null when no title source yields meaningful text', () => {
    const block = createBlock();
    const emptyLink = document.createElement('a');
    emptyLink.href = 'https://example.com/empty';
    emptyLink.target = '_top';
    const emptyDataTitle = document.createElement('div');
    emptyDataTitle.setAttribute('data-title', ' ');
    const emptyTitle = document.createElement('div');
    emptyTitle.title = 'ignored';
    block.append(emptyLink, emptyDataTitle, emptyTitle);

    expect(resolveBlockTitle(block)).toBeNull();
  });

  it('falls back to title-bearing text when the first matching link has no text and data-title is empty', () => {
    const block = createBlock();
    const emptyLink = document.createElement('a');
    emptyLink.href = 'https://example.com/empty';
    emptyLink.target = '_top';
    const emptyDataTitle = document.createElement('div');
    emptyDataTitle.setAttribute('data-title', '  ');
    const titled = document.createElement('div');
    titled.title = 'Card title';
    titled.textContent = '  Fallback title text ';
    block.append(emptyLink, emptyDataTitle, titled);

    expect(resolveBlockTitle(block)).toEqual(
      expect.objectContaining({
        sourceElement: titled,
        text: 'Fallback title text',
      })
    );
  });
}

describe('mvs embedded app text helpers', () => {
  afterEach(() => {
    resetMvsTextHelperDom();
  });

  registerMeaningfulTextTests();
  registerLinkValueTests();
  registerBlockTitlePrimarySourceTests();
  registerBlockTitleFallbackTests();
  registerTitleTextFallbackTest();
  registerEmptyTitleSourceTests();
});
