import { expect, it } from 'vitest';

import {
  parseBody,
  parseImageTransform,
  parseNullableString,
  parseNumber,
  parsePageDescriptor,
  parsePoint,
  parseRect,
  parseString,
  parseTargetDescriptor,
  parseViewportTransform,
} from './helpers';

function createValidPageRecord() {
  return {
    title: 'Example',
    url: 'https://example.com',
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    scrollX: 0,
    scrollY: 120,
    devicePixelRatio: 1,
  };
}

function createValidTargetRecord() {
  return {
    selector: '#submit',
    iframeSelector: null,
    tagName: 'button',
    role: 'button',
    text: 'Submit',
    ariaLabel: null,
    title: null,
    rect: { x: 10, y: 20, width: 120, height: 40 },
  };
}

it('parses scalar helper fallbacks and legacy body aliases', () => {
  expect(parseString('value')).toBe('value');
  expect(parseString(10, 'fallback')).toBe('fallback');
  expect(parseNumber(12, 5)).toBe(12);
  expect(parseNumber('12', 5)).toBe(5);
  expect(parseNullableString(null)).toBeNull();
  expect(parseNullableString('caption')).toBe('caption');
  expect(parseNullableString(10)).toBeNull();
  expect(parseBody({ body: 'Body' })).toBe('Body');
  expect(parseBody({ caption: ' Legacy caption ' })).toBe(' Legacy caption ');
  expect(parseBody({ subtitle: 'Legacy subtitle' })).toBe('Legacy subtitle');
  expect(parseBody({})).toBe('');
});

it('parses geometry helpers and transform fallbacks', () => {
  expect(parseRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
    x: 1,
    y: 2,
    width: 3,
    height: 4,
  });
  expect(parseRect({ x: 1, y: 2 })).toBeNull();
  expect(parsePoint({ x: 7, y: 8 })).toEqual({ x: 7, y: 8 });
  expect(parsePoint({ x: 7 })).toBeNull();
  expect(parseImageTransform({ scale: 1.5, x: 10, y: -20 })).toEqual({
    scale: 1.5,
    x: 10,
    y: -20,
  });
  expect(parseImageTransform({ scale: 1.5, x: 10 })).toEqual({
    scale: 1,
    x: 0,
    y: 0,
  });
});

it('parses target and page descriptors with fallbacks', () => {
  expect(parseViewportTransform({ x: 10, y: 20, width: 400, height: 300 })).toEqual({
    x: 10,
    y: 20,
    width: 400,
    height: 300,
  });
  expect(parseViewportTransform({ x: 10, y: 20 })).toEqual({
    x: 0,
    y: 0,
    width: 720,
    height: 420,
  });
  expect(
    parseTargetDescriptor({
      ...createValidTargetRecord(),
      ariaLabel: 'Submit form',
    })
  ).toEqual(
    expect.objectContaining({
      selector: '#submit',
      role: 'button',
    })
  );
  expect(parseTargetDescriptor({ rect: { x: 10 } })).toBeNull();
  expect(
    parsePageDescriptor({
      ...createValidPageRecord(),
      scrollY: 100,
      devicePixelRatio: 2,
    })
  ).toEqual(
    expect.objectContaining({
      title: 'Example',
      scrollY: 100,
      devicePixelRatio: 2,
    })
  );
  expect(parsePageDescriptor({ viewport: null })).toEqual({
    title: null,
    url: null,
    viewport: { x: 0, y: 0, width: 720, height: 420 },
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
  });
});
