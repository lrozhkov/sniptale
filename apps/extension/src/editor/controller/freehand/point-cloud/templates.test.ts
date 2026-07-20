import { expect, it } from 'vitest';
import { POINT_CLOUD_SIZE } from './constants';
import { POINT_CLOUD_TEMPLATES } from './templates';

it('builds normalized open and closed point cloud templates', () => {
  expect(POINT_CLOUD_TEMPLATES).toEqual([
    expect.objectContaining({ closed: false, kind: 'line' }),
    expect.objectContaining({ closed: false, kind: 'arrow' }),
    expect.objectContaining({ closed: true, kind: 'rectangle' }),
    expect.objectContaining({ closed: true, kind: 'ellipse' }),
    expect.objectContaining({ closed: true, kind: 'diamond' }),
    expect.objectContaining({ closed: true, kind: 'triangle' }),
  ]);
  expect(
    POINT_CLOUD_TEMPLATES.every((template) => template.points.length === POINT_CLOUD_SIZE)
  ).toBe(true);
});
