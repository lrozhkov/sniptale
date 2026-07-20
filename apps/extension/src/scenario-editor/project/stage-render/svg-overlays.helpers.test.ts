import { expect, it } from 'vitest';

import { projectPoint, projectRect, formatNumber, escapeSvgText } from './svg-overlays.helpers';
import type { ScenarioStageLayout } from '../../../features/scenario/stage/layout';

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 0, y: 0, width: 720, height: 420 },
  imageRect: { x: 10, y: 20, width: 720, height: 420 },
  sourceViewport: { width: 1440, height: 840 },
};

it('projects stage coordinates and reexports shared svg escaping helpers', () => {
  expect(formatNumber(12.345)).toBe('12.35');
  expect(escapeSvgText('Missing & <asset>')).toBe('Missing &amp; &lt;asset&gt;');
  expect(projectPoint(layout, { x: 40, y: 50 })).toEqual({ x: 30, y: 45 });
  expect(projectRect(layout, { x: 20, y: 30, width: 100, height: 60 })).toEqual({
    x: 20,
    y: 35,
    width: 50,
    height: 30,
  });
});
