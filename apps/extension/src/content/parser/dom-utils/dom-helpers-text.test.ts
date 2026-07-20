// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { extractLinkText, extractNarrativeText } from './dom-helpers-text';

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
  hidden.hidden = true;
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
