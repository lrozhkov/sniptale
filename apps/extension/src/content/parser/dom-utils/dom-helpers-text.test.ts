// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  determineValueType,
  extractCleanText,
  extractCompositeText,
  extractImageText,
  extractLinkText,
  extractNarrativeText,
} from './dom-helpers-text';

function appendLink(container: HTMLElement, href: string, text: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.className = 'link';
  link.textContent = text;
  container.append(link);
  return link;
}

it('keeps composite linked values instead of truncating to the first anchor', () => {
  const container = document.createElement('div');
  appendLink(container, '#uuid:employee$38429303', 'Иванов');
  container.append(document.createTextNode(', '));
  appendLink(container, '#uuid:employee$45591404', 'Петров');

  expect(extractLinkText(container)).toEqual({
    text: 'Иванов, Петров',
  });
});

it('preserves href for single-link values', () => {
  const container = document.createElement('div');
  appendLink(container, 'https://example.com/profile', 'Иванов');

  expect(extractLinkText(container)).toEqual({
    href: 'https://example.com/profile',
    text: 'Иванов',
  });
});

it('preserves full prose around inline links', () => {
  const paragraph = document.createElement('p');
  const link = document.createElement('a');
  link.href = 'https://example.com/tim';
  link.textContent = 'Tim Berners-Lee';

  paragraph.append(
    document.createTextNode('The Web was invented by '),
    link,
    document.createTextNode(' at CERN.')
  );

  expect(extractNarrativeText(paragraph)).toBe('The Web was invented by Tim Berners-Lee at CERN.');
});

it('keeps multiple inline links and line breaks while dropping hidden noise', () => {
  const paragraph = document.createElement('p');
  const htmlLink = document.createElement('a');
  htmlLink.href = 'https://example.com/html';
  htmlLink.textContent = 'HTML';
  const w3cLink = document.createElement('a');
  w3cLink.href = 'https://example.com/w3c';
  w3cLink.textContent = 'W3C';
  const hidden = document.createElement('span');
  hidden.setAttribute('hidden', 'until-found');
  hidden.textContent = 'hidden';
  const button = document.createElement('button');
  button.textContent = 'Ignore';
  const lineBreak = document.createElement('br');

  paragraph.append(
    document.createTextNode('Hypertext Markup Language ('),
    htmlLink,
    document.createTextNode(') is defined by '),
    w3cLink,
    document.createTextNode('.'),
    lineBreak,
    hidden,
    button
  );

  expect(extractNarrativeText(paragraph)).toBe(
    'Hypertext Markup Language (HTML) is defined by W3C.'
  );
});

describe('text normalization', () => {
  it('prefers the first non-empty direct text node and falls back to descendant text', () => {
    const direct = document.createElement('div');
    direct.append(
      document.createTextNode('  '),
      document.createElement('span'),
      document.createTextNode(' Direct value '),
      document.createTextNode('ignored')
    );
    direct.querySelector('span')!.textContent = 'Nested value';

    const nested = document.createElement('div');
    nested.innerHTML = '<span> Nested value </span>';

    expect(extractCleanText(direct)).toBe('Direct value');
    expect(extractCleanText(nested)).toBe('Nested value');
    expect(extractCleanText(document.createElement('div'))).toBe('');
  });

  it('normalizes non-breaking spaces, horizontal whitespace, and repeated line breaks', () => {
    const element = document.createElement('div');
    element.append(
      document.createTextNode('  Alpha\u00a0  beta  '),
      document.createElement('br'),
      document.createElement('br'),
      document.createElement('br'),
      document.createTextNode(' gamma ')
    );

    expect(extractCompositeText(element)).toBe('Alpha beta\n\ngamma');
  });
});

describe('narrative visibility', () => {
  it.each([
    ['native hidden', 'hidden', ''],
    ['until-found compatibility', 'hidden', 'until-found'],
    ['ARIA hidden', 'aria-hidden', 'true'],
    ['hidden class', 'class', 'card hidden selected'],
    ['invisible class', 'class', 'invisible'],
    ['display style', 'style', 'color:red; display: none'],
    ['visibility style', 'style', 'visibility: hidden'],
    ['opacity style', 'style', 'opacity: 0'],
  ])('rejects a hidden root identified by %s', (_name, attribute, value) => {
    const element = document.createElement('p');
    element.setAttribute(attribute, value);
    element.textContent = 'private narrative';

    expect(extractNarrativeText(element)).toBe('');
  });

  it('removes ignored and hidden descendants without hiding similarly named content', () => {
    const element = document.createElement('article');
    element.innerHTML = [
      '<span>Visible</span>',
      '<span class="hidden-value">kept</span>',
      '<span aria-hidden="true">aria noise</span>',
      '<span style="display: none">style noise</span>',
      '<script>script noise</script>',
      '<textarea>control noise</textarea>',
      '<span>ending</span>',
    ].join(' ');

    expect(extractNarrativeText(element)).toBe('Visible kept ending');
  });
});

describe('link and image values', () => {
  it('extracts a direct anchor and retains prose around a single nested anchor', () => {
    const direct = appendLink(document.createElement('div'), 'https://example.com/a', 'Anchor');
    const prose = document.createElement('div');
    prose.append('Open ', appendLink(prose, 'https://example.com/b', 'profile'));

    expect(extractLinkText(direct)).toEqual({
      href: 'https://example.com/a',
      text: 'Anchor',
    });
    expect(extractLinkText(prose)).toEqual({ text: 'Open profile' });
  });

  it('uses clean text when there are no anchors', () => {
    const element = document.createElement('div');
    element.textContent = 'Plain value';

    expect(extractLinkText(element)).toEqual({ text: 'Plain value' });
  });

  it('uses image metadata in canonical fallback order', () => {
    const element = document.createElement('div');
    const image = document.createElement('img');
    image.alt = 'Alternative';
    image.title = 'Image title';
    element.title = 'Element title';
    element.append(image, document.createTextNode('Clean text'));

    expect(extractImageText(element)).toBe('Alternative');
    image.alt = '';
    expect(extractImageText(element)).toBe('Image title');
    image.title = '';
    expect(extractImageText(element)).toBe('Element title');
    image.remove();
    expect(extractImageText(element)).toBe('Element title');
    element.title = '';
    expect(extractImageText(element)).toBe('Clean text');
  });
});

describe('value classification', () => {
  it.each([
    ['42', 'number'],
    ['да', 'boolean'],
    ['FALSE', 'boolean'],
    ['ordinary text', 'string'],
  ] as const)('classifies %s as %s', (text, expectedType) => {
    const element = document.createElement('div');
    element.textContent = text;

    expect(determineValueType(element)).toBe(expectedType);
  });

  it('prioritizes status, image, and link structure over textual values', () => {
    const status = document.createElement('div');
    status.innerHTML =
      '<span class="colorCircle"></span><span class="catItemCircleAndTitle">1</span>';

    const image = document.createElement('div');
    image.innerHTML = '<img class="icon" alt="1">';

    const link = document.createElement('div');
    link.innerHTML = '<a href="https://example.com">1</a>';

    expect(determineValueType(status)).toBe('status');
    expect(determineValueType(image)).toBe('image');
    expect(determineValueType(link)).toBe('link');
  });

  it('recognizes linked image layouts and rejects links with textual renderers', () => {
    const linkedImage = document.createElement('div');
    linkedImage.innerHTML = '<a><img><span class="catItemImgView"></span></a>';

    const genericLinkedImage = document.createElement('div');
    genericLinkedImage.innerHTML = '<a><img></a>';

    const textualImage = document.createElement('div');
    textualImage.innerHTML = '<a><img><span class="stringView">text</span></a>';

    expect(determineValueType(linkedImage)).toBe('image');
    expect(determineValueType(genericLinkedImage)).toBe('image');
    expect(determineValueType(textualImage)).toBe('link');
  });
});
