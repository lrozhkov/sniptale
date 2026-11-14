import { createCanvas } from 'canvas';
import { expect, it, vi } from 'vitest';

const { prepare, render } = await vi.importActual<{
  prepare(image: unknown): unknown;
  render(context: unknown, source: unknown, catalog: unknown, settings: object): void;
}>('./render.mjs');

it.each([1, 2])('cleans a coherent row beside separate accent support at scale%s', (scale) => {
  const source = createCanvas(300 * scale, 110 * scale);
  const context = source.getContext('2d');
  context.scale(scale, scale);
  context.fillStyle = '#f0f0f0';
  context.fillRect(0, 0, 300, 110);
  context.fillStyle = '#c8c8c8';
  for (let index = 0; index < 8; index++) {
    const x = 30 + index * 15;
    context.fillRect(x, 35, 2, 14);
    context.fillRect(x + 8, 35, 2, 14);
    context.fillRect(x, 35, 10, 2);
    context.fillRect(x, 42, 10, 2);
  }
  context.fillRect(32, 29, 6, 3);
  context.fillStyle = '#888888';
  context.fillRect(20, 82, 240, 1);
  const input = context.getImageData(0, 0, source.width, source.height);
  const result = createCanvas(source.width, source.height);
  render(result.getContext('2d'), source, prepare(input), {
    sensitivity: 55,
    thickness: 0.5,
    content: 'all',
    erase: true,
    color: 'auto',
  });
  const output = result.getContext('2d').getImageData(0, 0, source.width, source.height).data;
  let remainingRow = 0;
  let changedBackgroundOrLine = 0;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * 4;
      if (y >= 35 * scale && y < 49 * scale && x >= 30 * scale && x < 145 * scale) {
        if ([0, 1, 2].some((channel) => output[offset + channel] !== 240)) remainingRow++;
      }
      if (
        input.data[offset] !== 200 &&
        [0, 1, 2, 3].some((channel) => input.data[offset + channel] !== output[offset + channel])
      )
        changedBackgroundOrLine++;
    }
  }
  expect(remainingRow).toBe(0);
  expect(changedBackgroundOrLine).toBe(0);
});

it.each([
  { variant: 'fringe', lineY: null },
  { variant: 'fringe-2', lineY: null },
  { variant: 'line', lineY: 34 },
  { variant: 'line-37', lineY: 37 },
  { variant: 'line-40', lineY: 40 },
  { variant: 'line-44', lineY: 44 },
  { variant: 'line-47', lineY: 47 },
  { variant: 'gradient', lineY: null },
])(
  'cleans owned weak fringe while preserving $variant background evidence',
  ({ variant, lineY }) => {
    const source = createCanvas(240, 100);
    const context = source.getContext('2d');
    context.fillStyle = '#f0f0f0';
    if (variant === 'gradient') {
      const gradient = context.createLinearGradient(0, 0, 240, 0);
      gradient.addColorStop(0, '#eeeeee');
      gradient.addColorStop(1, '#f2f2f2');
      context.fillStyle = gradient;
    }
    context.fillRect(0, 0, 240, 100);
    if (lineY !== null) {
      context.fillStyle = '#efefef';
      context.fillRect(20, lineY, 140, 1);
    }
    const reference = context.getImageData(0, 0, 240, 100).data;
    context.fillStyle = '#303030';
    for (let index = 0; index < 8; index++) {
      const x = 30 + index * 15;
      context.fillRect(x, 35, 2, 14);
      context.fillRect(x + 8, 35, 2, 14);
      context.fillRect(x, 35, 10, 2);
      context.fillRect(x, 42, 10, 2);
    }
    if (variant === 'fringe' || variant === 'fringe-2') {
      context.fillStyle = variant === 'fringe-2' ? '#eeeeee' : '#efefef';
      for (let index = 0; index < 8; index++) context.fillRect(29 + index * 15, 36, 1, 12);
    }
    const input = context.getImageData(0, 0, 240, 100);
    const result = createCanvas(240, 100);
    render(result.getContext('2d'), source, prepare(input), {
      sensitivity: 55,
      thickness: 0.5,
      content: 'all',
      erase: true,
      color: 'auto',
    });
    const output = result.getContext('2d').getImageData(0, 0, 240, 100).data;
    let changedBackground = 0;
    let remainingFringe = 0;
    for (let offset = 0; offset < input.data.length; offset += 4) {
      const same = [0, 1, 2, 3].every(
        (channel) => input.data[offset + channel] === reference[offset + channel]
      );
      if (
        same &&
        [0, 1, 2, 3].some((channel) => output[offset + channel] !== reference[offset + channel])
      )
        changedBackground++;
      if (
        (variant === 'fringe' || variant === 'fringe-2') &&
        input.data[offset] === (variant === 'fringe-2' ? 238 : 239) &&
        output[offset] !== 240
      )
        remainingFringe++;
    }
    expect(remainingFringe).toBe(0);
    expect(changedBackground).toBe(0);
  }
);
