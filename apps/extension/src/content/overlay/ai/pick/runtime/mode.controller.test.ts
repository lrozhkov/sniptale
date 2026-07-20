// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createAiPickModeController } from './mode.controller';

function createParsedTree(): ParsedDOMTree {
  return {
    structure: [{ id: 'node-1', children: [] }],
    metadata: {},
  } as unknown as ParsedDOMTree;
}

function createOverlayController() {
  return {
    createHoverOverlay: vi.fn(),
    createOverlayContainer: vi.fn(),
    hideHoverOverlay: vi.fn(),
    removeOverlayContainer: vi.fn(),
    showHoverOverlay: vi.fn(),
  };
}

function createDeferredParsedTree() {
  let resolveValue!: (value: ParsedDOMTree) => void;
  const promise = new Promise<ParsedDOMTree>((resolve) => {
    resolveValue = resolve;
  });

  return { promise, resolve: resolveValue };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it('deduplicates concurrent enable calls and marks the mode enabled once', async () => {
  const overlayController = createOverlayController();
  const parseDomTree = vi.fn().mockResolvedValue(createParsedTree());
  const controller = createAiPickModeController({
    overlayController,
    parseDomTree,
    setContentModeEnabled: vi.fn(),
  });
  const onContentSelect = vi.fn();

  await Promise.all([controller.enable(onContentSelect), controller.enable(onContentSelect)]);

  expect(parseDomTree).toHaveBeenCalledTimes(1);
  expect(controller.isEnabled()).toBe(true);
  expect(overlayController.createOverlayContainer).toHaveBeenCalledTimes(1);
  expect(overlayController.createHoverOverlay).toHaveBeenCalledTimes(1);
});

it('ignores stale enable completions after disable bumps the sequence', async () => {
  const overlayController = createOverlayController();
  const deferredParse = createDeferredParsedTree();
  const parseDomTree = vi.fn().mockImplementation(() => deferredParse.promise);
  const controller = createAiPickModeController({
    overlayController,
    parseDomTree,
    setContentModeEnabled: vi.fn(),
  });

  const pendingEnable = controller.enable(vi.fn());
  controller.disable();
  deferredParse.resolve(createParsedTree());
  await pendingEnable;

  expect(controller.isEnabled()).toBe(false);
  expect(overlayController.createOverlayContainer).not.toHaveBeenCalled();
});
