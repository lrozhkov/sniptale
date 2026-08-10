// @vitest-environment jsdom

import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';

import { clampTechnicalDataTextPosition } from './positioning';

const source = {
  dataUrl: 'data:image/png;base64,abc',
  displayHeight: 100,
  displayWidth: 120,
  id: 'source',
  intrinsicHeight: 100,
  intrinsicWidth: 120,
  left: 10,
  locked: true,
  name: 'source.png',
  top: 20,
  visible: true,
};

it('keeps technical data text inside the source bounds using scaled dimensions', () => {
  const text = new Rect({ height: 40, width: 80 });
  vi.spyOn(text, 'set');

  clampTechnicalDataTextPosition(text, source);

  expect(text.set).toHaveBeenCalledWith({ left: 30, top: 59 });
});

it('falls back to raw and default dimensions for invalid Fabric measurements', () => {
  const raw = new Rect({ height: 30, width: 70 });
  vi.spyOn(raw, 'getScaledHeight').mockReturnValue(Number.NaN);
  vi.spyOn(raw, 'getScaledWidth').mockReturnValue(0);
  vi.spyOn(raw, 'set');
  clampTechnicalDataTextPosition(raw, source);
  expect(raw.set).toHaveBeenCalledWith({ left: 30, top: 70 });

  const defaults = new Rect({ height: 0, width: 0 });
  vi.spyOn(defaults, 'getScaledHeight').mockReturnValue(Number.NaN);
  vi.spyOn(defaults, 'getScaledWidth').mockReturnValue(Number.NaN);
  vi.spyOn(defaults, 'set');
  clampTechnicalDataTextPosition(defaults, source);
  expect(defaults.set).toHaveBeenCalledWith({ left: 30, top: 40 });
});
