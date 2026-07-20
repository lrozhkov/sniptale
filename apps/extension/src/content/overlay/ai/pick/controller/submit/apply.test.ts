// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createAiSubmitRequestGate } from './gate';

const {
  applyAiChangesWithHistoryMock,
  clearAllSniptaleIdsMock,
  findAIChangeTargetsMock,
  flashAppliedAiTargetsMock,
  parsePageSnapshotAfterIframePreflightMock,
  showAiApplyToastMock,
  showAiNoChangesInfoMock,
  showAiParseErrorsMock,
} = vi.hoisted(() => ({
  applyAiChangesWithHistoryMock: vi.fn(),
  clearAllSniptaleIdsMock: vi.fn(),
  findAIChangeTargetsMock: vi.fn(),
  flashAppliedAiTargetsMock: vi.fn(),
  parsePageSnapshotAfterIframePreflightMock: vi.fn(),
  showAiApplyToastMock: vi.fn(),
  showAiNoChangesInfoMock: vi.fn(),
  showAiParseErrorsMock: vi.fn(),
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/frame')>()),
  clearAllSniptaleIds: clearAllSniptaleIdsMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../runtime/dom-apply/highlight', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/dom-apply/highlight')>()),
  flashAppliedAiTargets: flashAppliedAiTargetsMock,
}));

vi.mock('../../runtime/dom-apply', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/dom-apply')>()),
  findAIChangeTargets: findAIChangeTargetsMock,
}));

vi.mock('../../../../../parser/dom-tree-parser/snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../parser/dom-tree-parser/snapshot')>()),
  parsePageSnapshotAfterIframePreflight: parsePageSnapshotAfterIframePreflightMock,
}));

vi.mock('./feedback', () => ({
  showAiApplyToast: showAiApplyToastMock,
  showAiNoChangesInfo: showAiNoChangesInfoMock,
  showAiParseErrors: showAiParseErrorsMock,
}));

vi.mock('./history', () => ({
  applyAiChangesWithHistory: applyAiChangesWithHistoryMock,
}));

import { applyAiResponseChanges } from './apply';

function createTree(): ParsedDOMTree {
  return {
    context: 'test',
    structure: [{ children: [], id: 'section-1', title: 'Section', type: 'section' }],
    title: 'AI Pick',
  };
}

function createContext() {
  return {
    isAILoading: false,
    requestGate: createAiSubmitRequestGate(),
    resumeAiPickMode: vi.fn(),
    setIsAILoading: vi.fn(),
    setIsAIModalOpen: vi.fn(),
    setTreeData: vi.fn(),
    treeData: createTree(),
  };
}

const defaultParsedChanges: AIEditChange[] = [
  { fieldId: 'field-1', fieldName: 'Field 1', newValue: 'updated', type: 'field' },
];

function createParsedResponse(
  overrides: {
    changes?: AIEditChange[];
    errors?: string[];
  } = {}
) {
  return {
    changes: overrides.changes ?? defaultParsedChanges,
    errors: overrides.errors ?? [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  applyAiChangesWithHistoryMock.mockReturnValue({
    appliedCount: 1,
    notFoundCount: 0,
    targets: [document.createElement('div')],
  });
  findAIChangeTargetsMock.mockReturnValue([document.createElement('div')]);
  parsePageSnapshotAfterIframePreflightMock.mockResolvedValue(createTree());
});

async function expectNoChangeInfoBranch() {
  const context = createContext();
  const requestId = context.requestGate.begin();

  await applyAiResponseChanges(
    createParsedResponse({ changes: [] }),
    context.treeData,
    context,
    requestId
  );

  expect(showAiNoChangesInfoMock).toHaveBeenCalledTimes(1);
  expect(applyAiChangesWithHistoryMock).not.toHaveBeenCalled();
  expect(context.setIsAIModalOpen).not.toHaveBeenCalled();
}

async function expectWarningAndCommitBranch() {
  const connectedTarget = document.createElement('div');
  document.body.append(connectedTarget);
  const targets = [connectedTarget];
  applyAiChangesWithHistoryMock.mockReturnValue({
    appliedCount: 1,
    notFoundCount: 2,
    targets,
  });
  findAIChangeTargetsMock.mockReturnValue([document.createElement('div')]);
  const context = createContext();
  const requestId = context.requestGate.begin();

  await applyAiResponseChanges(
    createParsedResponse({ errors: ['bad json fragment'] }),
    context.treeData,
    context,
    requestId
  );

  expect(showAiParseErrorsMock).toHaveBeenCalledWith(['bad json fragment']);
  expect(applyAiChangesWithHistoryMock).toHaveBeenCalledWith(
    context.treeData,
    defaultParsedChanges
  );
  expect(clearAllSniptaleIdsMock).toHaveBeenCalledTimes(1);
  expect(context.setIsAIModalOpen).toHaveBeenCalledWith(false);
  expect(context.setTreeData).toHaveBeenCalledWith(null);
  expect(context.resumeAiPickMode).toHaveBeenCalledTimes(1);
  expect(findAIChangeTargetsMock).toHaveBeenCalledWith(context.treeData, defaultParsedChanges);
  expect(parsePageSnapshotAfterIframePreflightMock).not.toHaveBeenCalled();
  expect(flashAppliedAiTargetsMock).toHaveBeenCalledWith(targets);
  expect(showAiApplyToastMock).toHaveBeenCalledWith(1, 2);
}

async function expectFreshTargetFallbackBranch() {
  const detachedHistoryTarget = document.createElement('div');
  const refreshedTree = createTree();
  const refreshedTarget = document.createElement('div');
  document.body.append(refreshedTarget);
  const refreshedTargets = [refreshedTarget];
  applyAiChangesWithHistoryMock.mockReturnValue({
    appliedCount: 1,
    notFoundCount: 0,
    targets: [detachedHistoryTarget],
  });
  findAIChangeTargetsMock.mockReturnValueOnce([]).mockReturnValueOnce(refreshedTargets);
  parsePageSnapshotAfterIframePreflightMock.mockResolvedValue(refreshedTree);
  const context = createContext();
  const requestId = context.requestGate.begin();

  await applyAiResponseChanges(createParsedResponse(), context.treeData, context, requestId);

  expect(findAIChangeTargetsMock).toHaveBeenNthCalledWith(
    1,
    context.treeData,
    defaultParsedChanges
  );
  expect(parsePageSnapshotAfterIframePreflightMock).toHaveBeenCalledWith('ai-pick-apply-highlight');
  expect(findAIChangeTargetsMock).toHaveBeenNthCalledWith(2, refreshedTree, defaultParsedChanges);
  expect(flashAppliedAiTargetsMock).toHaveBeenCalledWith(refreshedTargets);
}

async function expectMixedConnectedAndReplacedTargetBranch() {
  const connectedTarget = document.createElement('div');
  const replacementTarget = document.createElement('div');
  document.body.append(connectedTarget);
  document.body.append(replacementTarget);
  applyAiChangesWithHistoryMock.mockReturnValue({
    appliedCount: 2,
    notFoundCount: 0,
    targets: [connectedTarget, document.createElement('div')],
  });
  findAIChangeTargetsMock.mockReturnValueOnce([connectedTarget, replacementTarget]);
  const context = createContext();
  const requestId = context.requestGate.begin();

  await applyAiResponseChanges(createParsedResponse(), context.treeData, context, requestId);

  expect(parsePageSnapshotAfterIframePreflightMock).not.toHaveBeenCalled();
  expect(flashAppliedAiTargetsMock).toHaveBeenCalledWith([connectedTarget, replacementTarget]);
}

async function expectStaleRequestAfterHighlightResolutionToAbortUiCommit() {
  const context = createContext();
  const staleRequestId = context.requestGate.begin();
  let resolveRefresh!: (tree: ParsedDOMTree) => void;
  applyAiChangesWithHistoryMock.mockReturnValue({
    appliedCount: 1,
    notFoundCount: 0,
    targets: [document.createElement('div')],
  });
  findAIChangeTargetsMock
    .mockReturnValueOnce([])
    .mockReturnValueOnce([document.createElement('div')]);
  parsePageSnapshotAfterIframePreflightMock.mockImplementation(
    () =>
      new Promise<ParsedDOMTree>((resolve) => {
        resolveRefresh = resolve;
      })
  );

  const applyPromise = applyAiResponseChanges(
    createParsedResponse(),
    context.treeData,
    context,
    staleRequestId
  );

  const nextRequestId = context.requestGate.begin();
  resolveRefresh(createTree());
  await applyPromise;

  expect(context.requestGate.isCurrent(nextRequestId)).toBe(true);
  expect(clearAllSniptaleIdsMock).not.toHaveBeenCalled();
  expect(context.setIsAIModalOpen).not.toHaveBeenCalled();
  expect(context.setTreeData).not.toHaveBeenCalled();
  expect(context.resumeAiPickMode).not.toHaveBeenCalled();
  expect(flashAppliedAiTargetsMock).not.toHaveBeenCalled();
  expect(showAiApplyToastMock).not.toHaveBeenCalled();
}

describe('ai-pick-controller-submit-apply', () => {
  it(
    'shows info feedback and skips history commit when parsed response has no changes',
    expectNoChangeInfoBranch
  );
  it(
    'delegates parse warnings, history-backed apply flow, and final modal cleanup to owner-local seams',
    expectWarningAndCommitBranch
  );
  it(
    'falls back to current and refreshed DOM targets when pre-apply elements are detached',
    expectFreshTargetFallbackBranch
  );
  it(
    'merges still-connected history targets with re-resolved replacements from the current DOM',
    expectMixedConnectedAndReplacedTargetBranch
  );
  it(
    'skips modal teardown and highlight side effects when the request becomes stale after async target refresh',
    expectStaleRequestAfterHighlightResolutionToAbortUiCommit
  );
});
