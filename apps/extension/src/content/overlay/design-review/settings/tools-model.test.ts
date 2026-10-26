// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import {
  inspectReviewElement,
  parseReviewCss,
  readPixelTranslation,
  ReviewCssValidationError,
} from './tools-model';

afterEach(() => document.body.replaceChildren());

it('validates the whole CSS draft without mutating the target', () => {
  const element = document.createElement('p');
  document.body.append(element);
  const declarations = parseReviewCss(element, 'color: red; width: 120px; translate: 10px -2px;');
  expect(declarations.map((item) => item.property)).toEqual(['color', 'width', 'translate']);
  expect(element.getAttribute('style')).toBeNull();
  for (const draft of [
    'color: red; width: nope;',
    'color: red; background-color: url(https://bad.test);',
    'color: var(--private);',
    'color: red !important;',
    'color:red; color:blue',
    '@import "x";',
    'body {color:red}',
    'font-family: "unclosed',
  ])
    expect(() => parseReviewCss(element, draft)).toThrow();
  expect(element.getAttribute('style')).toBeNull();
});

it('keeps quoted semicolons in a font value and refuses malformed syntax', () => {
  const element = document.createElement('p');
  expect(parseReviewCss(element, 'font-family: "Some; Font", serif; color: red;')).toHaveLength(2);
  expect(() => parseReviewCss(element, 'color: rgb(1,2,3;')).toThrow();
});

it('captures comparison values independently from future source changes', () => {
  const element = document.createElement('p');
  element.style.color = 'red';
  document.body.append(element);
  const reference = inspectReviewElement(element, 'p');
  element.style.color = 'blue';
  expect(reference.values['color']).toBe('rgb(255, 0, 0)');
  expect(inspectReviewElement(element, 'p').values['color']).toBe('rgb(0, 0, 255)');
});

it('recognizes only translations that can be moved without a unit conversion guess', () => {
  expect(readPixelTranslation('none')).toEqual({ x: 0, y: 0 });
  expect(readPixelTranslation('12.5px -3px')).toEqual({ x: 12.5, y: -3 });
  expect(readPixelTranslation('10% 3px')).toBeNull();
  expect(readPixelTranslation('1px 2px 3px')).toBeNull();
});

it('identifies the unsupported, invalid or duplicate property without accepting part of a draft', () => {
  const element = document.createElement('p');
  for (const [draft, property, reason] of [
    ['padding: 2px;', 'padding', 'unsupported'],
    ['color:red; width:nope;', 'width', 'value'],
    ['color:red; color:blue;', 'color', 'duplicate'],
  ]) {
    try {
      parseReviewCss(element, draft!);
      throw new Error('Invalid draft was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(ReviewCssValidationError);
      expect(error).toMatchObject({ property, reason });
    }
  }
  expect(element.getAttribute('style')).toBeNull();
});
