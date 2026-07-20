// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createScenarioCollectionsApplier } from './collections';

function createCollectionsArgs() {
  return {
    hasLoadedStepsRef: { current: false },
    prevIdsRef: { current: [] as string[] },
    setHighlightToken: vi.fn(),
    setProjects: vi.fn(),
    setRecentSteps: vi.fn(),
    setTrashedSteps: vi.fn(),
  };
}

describe('scenario-response-collections', () => {
  it(
    'applies project/recent/trashed collections and increments highlight for a new leading step',
    expectCollectionApplyAndHighlight
  );
});

function expectCollectionApplyAndHighlight() {
  const args = createCollectionsArgs();
  const applyCollections = createScenarioCollectionsApplier(args);
  const response = {
    projects: [{ createdAt: 1, id: 'project-1', name: 'Project 1', updatedAt: 1 }],
    recentSteps: [{ id: 'step-2', position: 0, previewDataUrl: 'data:2', title: 'Step 2' }],
    success: true,
    trashedSteps: [
      { deletedAt: 10, id: 'trash-1', kind: 'capture' as const, originalIndex: 0, title: 'T' },
    ],
  };

  applyCollections(response);
  args.hasLoadedStepsRef.current = true;
  args.prevIdsRef.current = ['step-1'];
  applyCollections(response);

  expect(args.setProjects).toHaveBeenCalledWith(response.projects);
  expect(args.setRecentSteps).toHaveBeenCalledWith(response.recentSteps);
  expect(args.setTrashedSteps).toHaveBeenCalledWith(response.trashedSteps);
  expect(args.setHighlightToken).toHaveBeenCalledTimes(1);
}
