import { expect, it } from 'vitest';
import { createDefaultDrawingToolDefaults, DEFAULT_DRAWING_COLORS } from './model';

it('resolves drawing defaults from full, short, and empty palettes', () => {
  expect(createDefaultDrawingToolDefaults()).toMatchObject({
    pencil: { color: DEFAULT_DRAWING_COLORS[4], width: 4 },
    marker: { color: DEFAULT_DRAWING_COLORS[3], opacity: 0.3, width: 28 },
    text: { color: DEFAULT_DRAWING_COLORS[5], backgroundColor: null, fontSize: 24 },
  });
  expect(createDefaultDrawingToolDefaults(['#123456'])).toMatchObject({
    pencil: { color: '#123456' },
    marker: { color: '#123456' },
    text: { color: '#123456' },
  });
  expect(createDefaultDrawingToolDefaults([])).toMatchObject({
    pencil: { color: DEFAULT_DRAWING_COLORS[4] },
    marker: { color: DEFAULT_DRAWING_COLORS[4] },
    text: { color: DEFAULT_DRAWING_COLORS[5] },
  });
});
