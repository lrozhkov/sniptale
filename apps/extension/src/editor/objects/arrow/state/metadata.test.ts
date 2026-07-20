import { expect, it } from 'vitest';
import { syncArrowMetadata } from './metadata';

const settings = {
  color: '#123456',
  endHead: 'triangle',
  mode: 'straight',
  opacity: 0.6,
  shadow: 0,
  startHead: 'none',
  variant: 'tapered',
  width: 4,
} as const;

it('syncs arrow metadata and derives legacy dynamic width defaults', () => {
  const arrow = {};

  syncArrowMetadata(arrow as never, settings, [
    { x: 1, y: 2 },
    { x: 10, y: 11 },
  ]);

  expect(arrow).toMatchObject({
    sniptaleArrowDynamicWidth: true,
    sniptaleArrowEndX: 10,
    sniptaleArrowEndY: 11,
    sniptaleArrowMode: 'straight',
    sniptaleArrowStartX: 1,
    sniptaleArrowStartY: 2,
    sniptaleArrowType: 'sharp',
    sniptaleArrowVariant: 'tapered',
  });
});

it('records and clears curve control metadata', () => {
  const arrow = { sniptaleArrowControlX: 99, sniptaleArrowControlY: 100 };

  syncArrowMetadata(arrow as never, settings, [
    { x: 1, y: 2 },
    { x: 5, y: 6 },
    { x: 10, y: 11 },
  ]);
  expect(arrow.sniptaleArrowControlX).toBe(5);
  expect(arrow.sniptaleArrowControlY).toBe(6);

  syncArrowMetadata(arrow as never, settings, [
    { x: 1, y: 2 },
    { x: 10, y: 11 },
  ]);
  expect(arrow.sniptaleArrowControlX).toBeUndefined();
  expect(arrow.sniptaleArrowControlY).toBeUndefined();
});
