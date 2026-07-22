// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../application/runtime-services/services.test-support';
import { areaSelectionResultOwner } from './result';

const sendRuntimeMessage = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.restoreAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessage);
  sendRuntimeMessage.mockClear();
  vi.stubGlobal('devicePixelRatio', 2);
});

it('projects device-pixel geometry, publishes it, and returns the outcome', () => {
  const result = areaSelectionResultOwner.createSelectionResult({
    endX: 10,
    endY: 20,
    startX: 30,
    startY: 50,
  });

  const selectedArea = { height: 60, width: 40, x: 20, y: 40 };
  expect(result).toEqual({ area: selectedArea });
  expect(sendRuntimeMessage).toHaveBeenCalledWith({
    area: selectedArea,
    type: 'AREA_SELECTED',
  });
});

it('returns an error for a selection below the minimum size without publishing it', () => {
  const result = areaSelectionResultOwner.createSelectionResult({
    endX: 5,
    endY: 5,
    startX: 0,
    startY: 0,
  });

  expect(sendRuntimeMessage).not.toHaveBeenCalled();
  expect(result.error).toBeInstanceOf(Error);
});
