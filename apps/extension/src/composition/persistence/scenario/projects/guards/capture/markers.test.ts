import { expect, it } from 'vitest';

import { parseArrowOverlay, parsePointKindOverlay, parseTextOverlay } from './markers';

it('parses point and arrow overlays with preserved auto sources', () => {
  expect(
    parsePointKindOverlay(
      { autoSource: 'capture-click', id: 'click', kind: 'click-ring', point: { x: 5, y: 6 } },
      'capture-click'
    )
  ).toEqual(expect.objectContaining({ autoSource: 'capture-click', kind: 'click-ring' }));
  expect(
    parseArrowOverlay(
      {
        autoSource: 'capture-target',
        color: '#ff7a00',
        end: { x: 30, y: 40 },
        id: 'arrow',
        start: { x: 10, y: 20 },
        strokeWidth: 2,
      },
      'capture-target'
    )
  ).toEqual(expect.objectContaining({ autoSource: 'capture-target', kind: 'arrow' }));
});

it('parses complete text overlays', () => {
  expect(
    parseTextOverlay(
      {
        color: '#111',
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 600,
        id: 'text',
        point: { x: 12, y: 14 },
        text: 'Label',
      },
      undefined
    )
  ).toEqual(expect.objectContaining({ kind: 'text', text: 'Label' }));
});

it('drops malformed text overlays', () => {
  expect(
    parseTextOverlay(
      {
        color: '#111',
        fontFamily: 'Arial',
        fontSize: 16,
        id: 'text',
        point: { x: 12, y: 14 },
        text: 'Label',
      },
      undefined
    )
  ).toBeNull();
  expect(
    parsePointKindOverlay({ id: 'cursor', kind: 'cursor', point: { x: 7 } }, undefined)
  ).toBeNull();
  expect(
    parseArrowOverlay(
      {
        color: '#ff7a00',
        end: { x: 30, y: 40 },
        id: 'arrow',
        start: { x: 10, y: 20 },
      },
      undefined
    )
  ).toBeNull();
});
