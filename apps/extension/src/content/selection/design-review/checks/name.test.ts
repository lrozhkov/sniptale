// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { readCheckName } from './name';
afterEach(() => document.body.replaceChildren());
function node(tag = 'button') {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
}
it('uses explicit and hidden referenced labels, including shadow-local IDs', () => {
  const button = node(),
    label = node('span');
  label.id = 'label';
  label.hidden = true;
  label.textContent = 'Save';
  button.setAttribute('aria-labelledby', 'label');
  expect(readCheckName(button)).toMatchObject({
    kind: 'named',
    text: 'Save',
    source: 'aria-labelledby',
  });
  const host = node('div'),
    root = host.attachShadow({ mode: 'open' }),
    inner = document.createElement('button'),
    shadowLabel = document.createElement('span');
  shadowLabel.id = 'label';
  shadowLabel.textContent = 'Local';
  root.append(inner, shadowLabel);
  inner.setAttribute('aria-labelledby', 'label');
  expect(readCheckName(inner)).toMatchObject({ kind: 'named', text: 'Local' });
});
it('recognizes text, labelled images and SVG title without reading form values', () => {
  const button = node();
  const icon = document.createElement('img');
  icon.alt = 'Save image';
  button.append(icon);
  expect(readCheckName(button)).toMatchObject({ kind: 'named', text: 'Save image' });
  const svgButton = node(),
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    title = document.createElementNS(svg.namespaceURI, 'title');
  title.textContent = 'Close';
  svg.append(title);
  svgButton.append(svg);
  expect(readCheckName(svgButton)).toMatchObject({ kind: 'named', text: 'Close' });
  const input = node('input');
  Object.defineProperty(input, 'value', {
    get: () => {
      throw new Error('Sensitive value read');
    },
  });
  expect(readCheckName(input)).toMatchObject({ kind: 'empty' });
});
it('uses native labels and treats native button value cases as unknown', () => {
  const label = node('label'),
    input = document.createElement('input');
  label.append(input, document.createTextNode('Email'));
  expect(readCheckName(input)).toMatchObject({ kind: 'named', text: 'Email', source: 'label' });
  input.type = 'submit';
  label.removeChild(input);
  document.body.append(input);
  Object.defineProperty(input, 'value', {
    get: () => {
      throw new Error('Native value read');
    },
  });
  expect(readCheckName(input).kind).toBe('unknown');
});
it('does not invent a missing name when references or bounded text cannot resolve it', () => {
  const button = node();
  button.setAttribute('aria-labelledby', 'missing');
  expect(readCheckName(button).kind).toBe('unknown');
  button.removeAttribute('aria-labelledby');
  for (let index = 0; index < 40; index++) button.append(document.createElement('span'));
  button.lastElementChild!.textContent = 'Late label';
  expect(readCheckName(button).kind).toBe('unknown');
});
it('ignores hidden content while preserving a definite empty-label result', () => {
  const button = node(),
    hidden = document.createElement('span');
  hidden.hidden = true;
  hidden.textContent = 'Hidden';
  button.append(hidden);
  expect(readCheckName(button).kind).toBe('empty');
  button.setAttribute('title', 'More');
  expect(readCheckName(button)).toMatchObject({ kind: 'named', text: 'More' });
});
it('does not use form content or option values as a field label', () => {
  const textarea = node('textarea'),
    select = node('select');
  textarea.textContent = 'Private initial draft';
  const option = document.createElement('option');
  option.textContent = 'Saved account';
  select.append(option);
  expect(readCheckName(textarea).kind).toBe('empty');
  expect(readCheckName(select).kind).toBe('empty');
  const text = textarea.firstChild!;
  Object.defineProperty(text, 'nodeValue', {
    get: () => {
      throw new Error('Form content read');
    },
  });
  expect(readCheckName(textarea).kind).toBe('empty');
});
