import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUuid = '00000000-0000-0000-0000-000000000001';

vi.stubGlobal('crypto', { randomUUID: vi.fn(() => mockUuid) });

import { createScenarioOverlayDraft, updateScenarioOverlay } from './helpers';

function createStep() {
  return {
    page: { viewport: { width: 640, height: 480 } },
  } as never;
}

function resetScenarioQuickEditHelpersMocks() {
  vi.mocked(crypto.randomUUID).mockReturnValue(mockUuid);
}

function verifiesOverlayDraftCreation() {
  const step = createStep();

  expect(createScenarioOverlayDraft(step, 'focus-rect').kind).toBe('focus-rect');
  expect(createScenarioOverlayDraft(step, 'click-ring').kind).toBe('click-ring');
  expect(createScenarioOverlayDraft(step, 'cursor').kind).toBe('cursor');
  expect(createScenarioOverlayDraft(step, 'blur-rect').kind).toBe('blur-rect');
  expect(createScenarioOverlayDraft(step, 'arrow')).toEqual(
    expect.objectContaining({ kind: 'arrow', id: mockUuid })
  );
  expect(createScenarioOverlayDraft(step, 'rectangle')).toEqual(
    expect.objectContaining({ kind: 'rectangle', id: mockUuid })
  );
  expect(createScenarioOverlayDraft(step, 'ellipse')).toEqual(
    expect.objectContaining({ kind: 'ellipse', id: mockUuid })
  );
  expect(createScenarioOverlayDraft(step, 'text')).toEqual(
    expect.objectContaining({ kind: 'text', id: mockUuid })
  );
}

function verifiesOverlayUpdate() {
  expect(
    updateScenarioOverlay(
      [
        {
          id: 'one',
          kind: 'text',
          point: { x: 1, y: 1 },
          text: 'A',
          color: '#000',
          fontSize: 12,
          fontFamily: 'system-ui',
          fontWeight: 400,
        },
        {
          id: 'two',
          kind: 'text',
          point: { x: 2, y: 2 },
          text: 'B',
          color: '#000',
          fontSize: 12,
          fontFamily: 'system-ui',
          fontWeight: 400,
        },
      ] as never,
      'two',
      (overlay) => ({ ...overlay, text: 'Updated' }) as never
    )
  ).toEqual([
    expect.objectContaining({ id: 'one', text: 'A' }),
    expect.objectContaining({ id: 'two', text: 'Updated' }),
  ]);
}

function runScenarioQuickEditHelpersSuite() {
  beforeEach(resetScenarioQuickEditHelpersMocks);

  it('creates overlay drafts for every supported kind', verifiesOverlayDraftCreation);
  it('updates only the requested overlay entry', verifiesOverlayUpdate);
}

describe('scenario quick-edit helpers', runScenarioQuickEditHelpersSuite);
