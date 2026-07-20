// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  countFormControls,
  countReadableAnchors,
  countReadableParagraphs,
  hasStrongNarrativeSignals,
  queryGenericContentRoot,
} from './generic-detector.helpers';

function appendGenericRoot(tagName: 'article' | 'main' = 'article') {
  const root = document.createElement(tagName);
  document.body.append(root);
  return root;
}

function appendReadableParagraph(root: HTMLElement, text: string) {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  root.append(paragraph);
  return paragraph;
}

function appendReadableLink(root: HTMLElement, text: string) {
  const link = document.createElement('a');
  link.href = 'https://example.test/readable';
  link.textContent = text;
  root.append(link);
  return link;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('generic detector root helpers', () => {
  it('prefers the first matching generic content root selector', () => {
    const main = document.createElement('main');
    const article = document.createElement('article');
    main.append(article);
    document.body.append(main);

    expect(queryGenericContentRoot(document)).toBe(main);
  });

  it('counts only readable paragraphs and anchors above the safe thresholds', () => {
    const root = appendGenericRoot();
    appendReadableParagraph(root, 'A'.repeat(39));
    appendReadableParagraph(root, 'B'.repeat(40));
    appendReadableLink(root, 'short link');
    appendReadableLink(root, 'Readable content link');

    expect(countReadableParagraphs(root)).toBe(1);
    expect(countReadableAnchors(root)).toBe(1);
  });
});

describe('generic detector narrative signal helpers', () => {
  it('counts form controls and narrative signal branches correctly', () => {
    const root = appendGenericRoot('main');
    root.append(
      Object.assign(document.createElement('input'), { value: 'one' }),
      document.createElement('button')
    );

    appendReadableParagraph(root, 'Narrative paragraph one '.repeat(4));
    appendReadableParagraph(root, 'Narrative paragraph two '.repeat(4));

    expect(countFormControls(root)).toBe(2);
    expect(hasStrongNarrativeSignals(root)).toBe(true);
  });

  it('treats heading-plus-medium-text roots as narrative even without two readable paragraphs', () => {
    const root = appendGenericRoot();
    const heading = document.createElement('h1');
    heading.textContent = 'Narrative heading';
    root.append(heading);
    root.append('Structured narrative text '.repeat(10));

    expect(hasStrongNarrativeSignals(root)).toBe(true);
  });

  it('treats long plain-text roots as narrative without headings or paragraphs', () => {
    const root = appendGenericRoot('main');
    root.append('Dense plain text '.repeat(40));

    expect(hasStrongNarrativeSignals(root)).toBe(true);
  });

  it('returns false for short low-signal roots', () => {
    const root = appendGenericRoot();
    root.append('Short shell text');

    expect(hasStrongNarrativeSignals(root)).toBe(false);
  });
});
