import { beforeEach, expect, it, vi } from 'vitest';

import {
  createScenarioBlurOverlay,
  createScenarioClickOverlay,
  createScenarioCursorOverlay,
  createScenarioFocusOverlay,
} from './overlays';

beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    (() => {
      let index = 0;
      return () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`;
    })()
  );
});

it('creates stage render overlay factories with deterministic ids', () => {
  expect(createScenarioFocusOverlay({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'focus-rect',
    rect: { x: 1, y: 2, width: 3, height: 4 },
  });
  expect(createScenarioClickOverlay({ x: 5, y: 6 })).toEqual({
    id: '00000000-0000-4000-8000-000000000002',
    kind: 'click-ring',
    point: { x: 5, y: 6 },
  });
  expect(createScenarioCursorOverlay({ x: 7, y: 8 })).toEqual({
    id: '00000000-0000-4000-8000-000000000003',
    kind: 'cursor',
    point: { x: 7, y: 8 },
  });
  expect(createScenarioBlurOverlay({ x: 3, y: 4, width: 12, height: 14 })).toEqual({
    id: '00000000-0000-4000-8000-000000000004',
    kind: 'blur-rect',
    rect: { x: 3, y: 4, width: 12, height: 14 },
    blurSettings: {
      amount: 10,
      blurType: 'gaussian',
      borderPresetId: null,
      radius: 0,
      shadow: 0,
      showBorder: false,
      strokeColor: '#475569',
      strokeOpacity: 1,
      strokeStyle: 'solid',
      strokeWidth: 0,
    },
  });
});
