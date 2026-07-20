import { beforeEach, expect, it, vi } from 'vitest';
import type { FreehandRecognitionCandidate } from './recognition-types';

const mocks = vi.hoisted(() => ({
  resolveAngularCandidate: vi.fn(),
  resolveRoundedCandidate: vi.fn(),
}));

vi.mock('./recognition-angular', () => ({
  resolveAngularCandidate: mocks.resolveAngularCandidate,
}));
vi.mock('./recognition-rounded', () => ({
  resolveRoundedCandidate: mocks.resolveRoundedCandidate,
}));

import { resolveClosedShapeCandidate } from './recognition-fit';

function createCandidate(
  kind: FreehandRecognitionCandidate['kind'],
  confidence: number
): FreehandRecognitionCandidate {
  return { confidence, kind };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('picks the strongest closed-shape candidate and rejects weak fits', () => {
  const rounded = createCandidate('circle', 0.86);
  mocks.resolveRoundedCandidate.mockReturnValue(rounded);
  mocks.resolveAngularCandidate.mockReturnValue(null);

  expect(resolveClosedShapeCandidate({} as never)).toBe(rounded);

  mocks.resolveRoundedCandidate.mockReturnValue(createCandidate('circle', 0.7));
  expect(resolveClosedShapeCandidate({} as never)).toBeNull();
});

it('rejects ambiguous closed-shape candidates across different kinds', () => {
  mocks.resolveRoundedCandidate.mockReturnValue(createCandidate('circle', 0.86));
  mocks.resolveAngularCandidate.mockReturnValue(createCandidate('rectangle', 0.83));

  expect(resolveClosedShapeCandidate({} as never)).toBeNull();
});
