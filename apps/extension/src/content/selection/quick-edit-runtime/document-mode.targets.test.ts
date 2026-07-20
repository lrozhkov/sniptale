// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { isIgnoredDocumentModeTarget, resolveDocumentModeEditRoot } from './document-mode.targets';

afterEach(() => {
  document.body.removeAttribute('id');
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
});

function appendParagraph(text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  document.body.append(paragraph);
  return paragraph;
}

function selectInside(element: HTMLElement): void {
  const selection = document.getSelection();
  if (!selection) {
    throw new Error('Expected document selection');
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

it('resolves the nearest stable text root for a document-mode edit target', () => {
  const paragraph = appendParagraph('Editable text');
  const text = paragraph.firstChild;

  expect(resolveDocumentModeEditRoot(text)).toBe(paragraph);
});

it('uses the selection root before falling back to body-level tracking', () => {
  const paragraph = appendParagraph('Selected text');

  selectInside(paragraph);

  expect(resolveDocumentModeEditRoot(document.body)).toBe(paragraph);
});

it('ignores Sniptale-owned roots', () => {
  const extensionRoot = document.createElement('div');
  const child = document.createElement('p');

  extensionRoot.id = 'sniptale-extension-root';
  extensionRoot.append(child);
  document.body.append(extensionRoot);

  expect(isIgnoredDocumentModeTarget(child)).toBe(true);
  expect(resolveDocumentModeEditRoot(child)).toBeNull();
});

it('does not use a disconnected outside target as the edit root', () => {
  const detached = document.createElement('p');

  detached.textContent = 'Detached';

  expect(resolveDocumentModeEditRoot(detached)).toBe(document.body);
});

it('does not fall back to an ignored body root', () => {
  const target = document.createElement('span');

  document.body.id = 'sniptale-extension-root';

  expect(resolveDocumentModeEditRoot(target)).toBeNull();
});
