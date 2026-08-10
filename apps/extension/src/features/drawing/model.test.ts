import { expect, it } from 'vitest';
import { createDefaultDrawingToolDefaults, DEFAULT_DRAWING_COLORS } from './model';

it('resolves drawing defaults from full, short, and empty palettes', () => {
  expect(DEFAULT_DRAWING_COLORS).toHaveLength(10);
  expect(DEFAULT_DRAWING_COLORS).toContain('#14b8a6');
  expect(DEFAULT_DRAWING_COLORS).toContain('#ec4899');
  expect(createDefaultDrawingToolDefaults()).toMatchObject({
    pencil: { color: DEFAULT_DRAWING_COLORS[4], width: 4 },
    marker: { color: DEFAULT_DRAWING_COLORS[3], opacity: 0.3, width: 28 },
    shape: {
      color: DEFAULT_DRAWING_COLORS[4],
      fillColor: null,
      kind: 'rectangle',
      width: 4,
    },
    arrow: {
      color: DEFAULT_DRAWING_COLORS[4],
      design: 'standard',
      dynamicWidth: true,
      width: 18,
    },
    text: {
      color: DEFAULT_DRAWING_COLORS[5],
      backgroundColor: null,
      fontFamily: 'handwritten',
      fontSize: 24,
    },
  });
  expect(createDefaultDrawingToolDefaults(['#123456'])).toMatchObject({
    pencil: { color: '#123456' },
    marker: { color: '#123456' },
    shape: { color: '#123456' },
    arrow: { color: '#123456' },
    text: { color: '#123456' },
  });
  expect(createDefaultDrawingToolDefaults([])).toMatchObject({
    pencil: { color: DEFAULT_DRAWING_COLORS[4] },
    marker: { color: DEFAULT_DRAWING_COLORS[4] },
    shape: { color: DEFAULT_DRAWING_COLORS[4] },
    arrow: { color: DEFAULT_DRAWING_COLORS[4] },
    text: { color: DEFAULT_DRAWING_COLORS[5] },
  });
});
