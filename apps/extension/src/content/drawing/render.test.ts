// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { renderDrawingObject } from './render';

it.each(['#ff8800', '#ff880080'])('fills multiline backgrounds once with %s', (color) => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 10 }),
    globalAlpha: 1,
  };
  renderDrawingObject(
    context as unknown as CanvasRenderingContext2D,
    {
      id: 'rotated-text',
      kind: 'text',
      bounds: { x: 20, y: 30, width: 180, height: 100 },
      rotation: 10,
      text: 'Long line\nShort\n',
      color: '#111111',
      backgroundColor: color,
      fontFamily: 'sans',
      fontSize: 24,
    },
    { x: 0, y: 0 }
  );
  expect(context.moveTo).toHaveBeenCalledTimes(1);
  expect(context.closePath).toHaveBeenCalledTimes(1);
  expect(context.arcTo).toHaveBeenCalled();
  expect(context.beginPath).toHaveBeenCalledTimes(1);
  expect(context.fill).toHaveBeenCalledTimes(1);
  expect(context.fillText).toHaveBeenCalledTimes(3);
});

it.each([0, 5, 10, 45])('has continuous captured background pixels at %s degrees', (angle) => {
  for (const color of ['#ff8800', '#ff880080']) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 400;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#808080';
    context.fillRect(0, 0, 400, 400);
    const radians = (angle * Math.PI) / 180;
    renderDrawingObject(
      context,
      {
        id: 'pixel-proof',
        kind: 'text',
        bounds: { x: 110, y: 150, width: 180, height: 100 },
        rotation: angle,
        text: 'Longer first line\nShort\nLast',
        color: '#00000000',
        backgroundColor: color,
        fontFamily: 'sans',
        fontSize: 24,
      },
      { x: 0, y: 0 }
    );
    context.fillStyle = color;
    context.fillRect(0, 0, 5, 5);
    const expected = context.getImageData(1, 1, 1, 1).data;
    for (const edge of [182, 212]) {
      for (let offset = 20; offset <= 30; offset += 1) {
        for (const delta of [-0.75, -0.25, 0.25, 0.75]) {
          const localX = 110 + offset - 200;
          const localY = edge + delta - 200;
          const pixel = context.getImageData(
            Math.floor(200 + localX * Math.cos(radians) - localY * Math.sin(radians)),
            Math.floor(200 + localX * Math.sin(radians) + localY * Math.cos(radians)),
            1,
            1
          ).data;
          expect(
            Array.from(pixel).every((channel, index) => Math.abs(channel - expected[index]!) <= 2),
            `${color} edge=${edge} offset=${offset}`
          ).toBe(true);
        }
      }
    }
  }
});
