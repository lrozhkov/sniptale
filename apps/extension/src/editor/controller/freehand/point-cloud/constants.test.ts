import { expect, it } from 'vitest';
import { POINT_CLOUD_GREEDY_EPSILON, POINT_CLOUD_SIZE } from './constants';

it('keeps point cloud matching constants stable', () => {
  expect(POINT_CLOUD_SIZE).toBe(64);
  expect(POINT_CLOUD_GREEDY_EPSILON).toBe(0.5);
});
