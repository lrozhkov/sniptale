// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { detectGenericArticle } from './generic-article.detector';

function resetGenericArticleDom(): void {
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.title = '';
  window.history.replaceState({}, '', '/');
}

function appendGenericRoot(tagName: 'article' | 'main' = 'article'): HTMLElement {
  const root = document.createElement(tagName);
  document.body.append(root);
  return root;
}

function createReadableParagraph(text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  return paragraph;
}

function createReadableLink(index: number): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `https://example.com/${index}`;
  link.textContent = `Readable article link ${index}`;
  return link;
}

function registerNullDetectionTests(): void {
  it('returns null when no generic content root is present', () => {
    const shell = document.createElement('div');
    shell.textContent = 'Standalone shell content';
    document.body.append(shell);

    expect(detectGenericArticle(document)).toBeNull();
  });

  it('returns null for short low-signal article shells', () => {
    const article = appendGenericRoot();
    article.append(createReadableParagraph('Short body'));

    expect(detectGenericArticle(document)).toBeNull();
  });
}

function registerReadableContentDetectionTests(): void {
  it('detects article roots with long readable text', () => {
    const article = appendGenericRoot();
    const heading = document.createElement('h1');
    heading.textContent = 'Canonical parser article';
    article.append(
      heading,
      createReadableParagraph(
        'This article contains enough structured text to clear the generic article ' +
          'heuristics even when the paragraph count stays minimal.'
      )
    );

    const result = detectGenericArticle(document);

    expect(result?.profile.vendor).toBe('generic');
    expect(result?.profile.pageKind).toBe('content');
    expect(result?.matchedSignals.map((signal) => signal.id)).toEqual(['dom.generic-content-root']);
  });

  it('detects article roots with multiple readable paragraphs under the safe threshold', () => {
    const article = appendGenericRoot();
    article.append(
      createReadableParagraph('A'.repeat(90)),
      createReadableParagraph('B'.repeat(90))
    );

    const result = detectGenericArticle(document);

    expect(result?.profile.pipelineId).toBe('generic-structured');
    expect(result?.profile.preferredRoots).toContain('article');
  });
}

function registerArticleSignalDetectionTests(): void {
  it('detects article roots with a dense set of readable anchors', () => {
    const article = appendGenericRoot('main');
    for (let index = 0; index < 5; index += 1) {
      article.append(createReadableLink(index));
    }

    const result = detectGenericArticle(document);

    expect(result?.confidence).toBe(0.8);
    expect(result?.profile.preferredRoots[0]).toBe('main article');
  });

  it('detects article roots when a heading is present even without long text blocks', () => {
    const article = appendGenericRoot();
    const heading = document.createElement('h2');
    heading.textContent = 'Compact heading';
    article.append(heading);

    const result = detectGenericArticle(document);

    expect(result?.profile.vendor).toBe('generic');
    expect(result?.profile.pageKind).toBe('content');
  });
}

function registerStructuredSignalTests(): void {
  it('detects article roots that contain structured tables', () => {
    const article = appendGenericRoot();
    const table = document.createElement('table');
    const row = document.createElement('tr');
    const keyCell = document.createElement('td');
    const valueCell = document.createElement('td');
    keyCell.textContent = 'Status';
    valueCell.textContent = 'Open';
    row.append(keyCell, valueCell);
    table.append(row);
    article.append(table);

    const result = detectGenericArticle(document);

    expect(result?.profile.vendor).toBe('generic');
    expect(result?.profile.pipelineId).toBe('generic-structured');
  });
}

describe('detectGenericArticle', () => {
  afterEach(() => {
    resetGenericArticleDom();
  });

  registerNullDetectionTests();
  registerReadableContentDetectionTests();
  registerArticleSignalDetectionTests();
  registerStructuredSignalTests();
});
