import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageStyleCurrentPageRuleSummary } from '@sniptale/runtime-contracts/page-style';

const mocks = vi.hoisted(() => {
  const controller = {
    applyMatchingRestoreRules: vi.fn(),
    dispose: vi.fn(),
    getCurrentPageAppliedRuleSummary: vi.fn(),
    openInspector: vi.fn(),
  };
  const owner = {
    getOwner: vi.fn(() => controller),
    getOwnerIfCreated: vi.fn<() => typeof controller | null>(() => controller),
  };

  return {
    controller,
    createController: vi.fn(() => controller),
    createLazyOwner: vi.fn(() => owner),
    addOpenListener: vi.fn(),
    dispatchOpen: vi.fn(),
    logger: { warn: vi.fn() },
    owner,
  };
});

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => mocks.logger,
}));
vi.mock('../../application/default-owner', () => ({
  createLazyContentDefaultOwner: mocks.createLazyOwner,
}));
vi.mock('../quick-edit-runtime/page-style/controller', () => ({
  createPageStyleRuntimeController: mocks.createController,
}));
vi.mock('./page-style-events', () => ({
  addPageStyleInspectorOpenListener: mocks.addOpenListener,
  dispatchPageStyleInspectorOpen: mocks.dispatchOpen,
}));

import {
  disposePageStyleRuntime,
  getPageStyleCurrentRuleSummary,
  initializePageStyleRuntime,
  openPageStyleInspector,
} from './page-style';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.controller.applyMatchingRestoreRules.mockResolvedValue(undefined);
  mocks.owner.getOwnerIfCreated.mockReturnValue(mocks.controller);
});

describe('quick-edit page-style application owner', () => {
  it('surfaces startup restore failures through the owner logger', async () => {
    const error = new Error('restore failed');
    mocks.controller.applyMatchingRestoreRules.mockRejectedValueOnce(error);

    initializePageStyleRuntime();

    await vi.waitFor(() => {
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'Failed to apply page style restore rules during content startup',
        error
      );
    });
  });

  it('routes summary, inspector, and disposal through the same lazy owner', async () => {
    const summary: PageStyleCurrentPageRuleSummary = {
      activeAppliedCount: 0,
      matchedRules: [],
      pageDomain: 'example.test',
      pageUrl: 'https://example.test/page',
    };
    mocks.controller.getCurrentPageAppliedRuleSummary.mockResolvedValue(summary);

    await expect(getPageStyleCurrentRuleSummary()).resolves.toBe(summary);
    openPageStyleInspector('rules');
    disposePageStyleRuntime();

    expect(mocks.controller.openInspector).toHaveBeenCalledWith('rules');
    expect(mocks.dispatchOpen).toHaveBeenCalledWith('rules');
    expect(mocks.controller.openInspector.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.dispatchOpen.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(mocks.controller.dispose).toHaveBeenCalledOnce();
  });

  it('does not create the lazy runtime only to dispose it', () => {
    mocks.owner.getOwnerIfCreated.mockReturnValueOnce(null);

    disposePageStyleRuntime();

    expect(mocks.controller.dispose).not.toHaveBeenCalled();
  });
});
