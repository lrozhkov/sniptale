// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES } from '../../../contracts/full-page-capture';

const mocks = vi.hoisted(() => ({
  applyFloatingPolicyForTile: vi.fn(),
  collectFloatingCandidates: vi.fn(() => []),
  commitFloatingTile: vi.fn(),
  geometry: {
    devicePixelRatio: 1,
    extentHeight: 1_200,
    extentWidth: 800,
    outputHeight: 1_200,
    outputWidth: 800,
    rootKind: 'document' as const,
    rootViewport: { height: 600, width: 800, x: 0, y: 0 },
    viewportHeight: 600,
    viewportWidth: 800,
  },
  preparePageMutations: vi.fn(),
  restorePageMutations: vi.fn(),
  scroll: { x: 31, y: 47 },
  waitForCaptureStability: vi.fn().mockResolvedValue(undefined),
  warmUpLazyContent: vi.fn().mockResolvedValue(undefined),
  writeRootScroll: vi.fn((_: unknown, x: number, y: number) => {
    mocks.scroll.x = x;
    mocks.scroll.y = y;
  }),
}));

vi.mock('./geometry', () => ({
  createLayoutGeneration: () => 'layout-generation-1',
  measureCaptureGeometry: () => ({ ...mocks.geometry }),
}));

vi.mock('../../platform/page-scroll', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/page-scroll')>()),
  readPageScroll: () => ({ ...mocks.scroll }),
  resolvePageScrollRoot: () => ({ element: document.documentElement, kind: 'document' }),
  writePageScroll: mocks.writeRootScroll,
}));

vi.mock('./mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mutations')>()),
  applyFloatingPolicyForTile: mocks.applyFloatingPolicyForTile,
  collectFloatingCandidates: mocks.collectFloatingCandidates,
  commitFloatingTile: mocks.commitFloatingTile,
  preparePageMutations: mocks.preparePageMutations,
  restorePageMutations: mocks.restorePageMutations,
}));

vi.mock('./stability', () => ({
  waitForCaptureStability: mocks.waitForCaptureStability,
  warmUpLazyContent: mocks.warmUpLazyContent,
}));

import { createFullPageCaptureAgent } from './agent';

const identity = {
  jobId: 'job-1',
  ownerToken: 'owner-1',
  runtimeGeneration: 'generation-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scroll.x = 31;
  mocks.scroll.y = 47;
  mocks.geometry.extentHeight = 1_200;
  mocks.geometry.extentWidth = 800;
  mocks.geometry.outputHeight = 1_200;
  mocks.geometry.outputWidth = 800;
  mocks.geometry.rootViewport = { height: 600, width: 800, x: 0, y: 0 };
});

it('prepares, scrolls to the requested tile, verifies, and restores the original offsets', async () => {
  const agent = createFullPageCaptureAgent();
  const prepared = await agent.handle({
    ...identity,
    preferences: { ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES, preloadLazyContent: false },
    type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
  });

  expect(prepared).toEqual(
    expect.objectContaining({
      result: expect.objectContaining({ actualX: 31, actualY: 47 }),
      success: true,
    })
  );

  const tile = {
    ...identity,
    column: 0,
    firstColumn: true,
    firstRow: false,
    lastColumn: true,
    lastRow: true,
    row: 1,
    targetX: 0,
    targetY: 600,
  };
  await agent.handle({ ...tile, type: MessageType.PREPARE_FULL_PAGE_TILE });
  await agent.handle({
    ...tile,
    layoutGeneration: 'layout-generation-1',
    type: MessageType.VERIFY_FULL_PAGE_TILE,
  });
  await agent.handle({ ...identity, type: MessageType.RESTORE_FULL_PAGE_CAPTURE });

  expect(mocks.writeRootScroll).toHaveBeenLastCalledWith(
    expect.objectContaining({ kind: 'document' }),
    31,
    47
  );
  expect(mocks.restorePageMutations).toHaveBeenCalledOnce();
  expect(mocks.commitFloatingTile).toHaveBeenCalledOnce();
});

it('rejects stale session and layout identities without applying a tile', async () => {
  const agent = createFullPageCaptureAgent();
  await agent.handle({
    ...identity,
    preferences: { ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES, preloadLazyContent: false },
    type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
  });

  await expect(
    agent.handle({
      ...identity,
      column: 0,
      firstColumn: true,
      firstRow: true,
      jobId: 'stale-job',
      lastColumn: true,
      lastRow: true,
      row: 0,
      targetX: 0,
      targetY: 0,
      type: MessageType.PREPARE_FULL_PAGE_TILE,
    })
  ).rejects.toThrow('session identity mismatch');
  expect(mocks.applyFloatingPolicyForTile).not.toHaveBeenCalled();

  await expect(
    agent.handle({
      ...identity,
      column: 0,
      firstColumn: true,
      firstRow: true,
      lastColumn: true,
      lastRow: true,
      layoutGeneration: 'stale-layout',
      row: 0,
      targetX: 0,
      targetY: 0,
      type: MessageType.VERIFY_FULL_PAGE_TILE,
    })
  ).rejects.toThrow('layout generation mismatch');
  agent.dispose();
});

it('self-restores when the background heartbeat disappears', async () => {
  vi.useFakeTimers();
  const agent = createFullPageCaptureAgent();
  await agent.handle({
    ...identity,
    preferences: { ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES, preloadLazyContent: false },
    type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
  });

  await vi.advanceTimersByTimeAsync(15_000);

  expect(mocks.restorePageMutations).toHaveBeenCalledOnce();
  expect(mocks.writeRootScroll).toHaveBeenLastCalledWith(
    expect.objectContaining({ kind: 'document' }),
    31,
    47
  );
  await expect(
    agent.handle({ ...identity, type: MessageType.RESTORE_FULL_PAGE_CAPTURE })
  ).resolves.toEqual({ success: true });
  vi.useRealTimers();
});

it('keeps a healthy capture session armed while explicit heartbeats continue', async () => {
  vi.useFakeTimers();
  const agent = createFullPageCaptureAgent();
  await agent.handle({
    ...identity,
    preferences: { ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES, preloadLazyContent: false },
    type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
  });

  for (let elapsed = 0; elapsed < 30_000; elapsed += 4_000) {
    await vi.advanceTimersByTimeAsync(4_000);
    await agent.handle({ ...identity, type: MessageType.HEARTBEAT_FULL_PAGE_CAPTURE });
  }

  expect(mocks.restorePageMutations).not.toHaveBeenCalled();
  await agent.handle({ ...identity, type: MessageType.RESTORE_FULL_PAGE_CAPTURE });
  expect(mocks.restorePageMutations).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('fails when the frozen capture extent shrinks', async () => {
  const agent = createFullPageCaptureAgent();
  await agent.handle({
    ...identity,
    preferences: { ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES, preloadLazyContent: false },
    type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
  });
  mocks.geometry.extentHeight = 1_100;

  await expect(
    agent.handle({
      ...identity,
      column: 0,
      firstColumn: true,
      firstRow: true,
      lastColumn: true,
      lastRow: true,
      row: 0,
      targetX: 0,
      targetY: 0,
      type: MessageType.PREPARE_FULL_PAGE_TILE,
    })
  ).rejects.toThrow('extent shrank');
  agent.dispose();
});

it('fails closed when an internal scroller shell moves without changing its extent', async () => {
  const agent = createFullPageCaptureAgent();
  await agent.handle({
    ...identity,
    preferences: { ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES, preloadLazyContent: false },
    type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
  });
  mocks.geometry.rootViewport = { ...mocks.geometry.rootViewport, x: 2 };
  mocks.geometry.outputWidth += 2;

  await expect(
    agent.handle({
      ...identity,
      column: 0,
      firstColumn: true,
      firstRow: true,
      lastColumn: true,
      lastRow: true,
      row: 0,
      targetX: 0,
      targetY: 0,
      type: MessageType.PREPARE_FULL_PAGE_TILE,
    })
  ).rejects.toThrow('viewport changed');
  agent.dispose();
});

it('does not apply floating mutations after restore wins a pending tile wait', async () => {
  let resolveStability: () => void = () => undefined;
  mocks.waitForCaptureStability.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveStability = resolve;
      })
  );
  const agent = createFullPageCaptureAgent();
  await agent.handle({
    ...identity,
    preferences: { ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES, preloadLazyContent: false },
    type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
  });
  const pendingTile = agent.handle({
    ...identity,
    column: 0,
    firstColumn: true,
    firstRow: true,
    lastColumn: true,
    lastRow: true,
    row: 0,
    targetX: 0,
    targetY: 0,
    type: MessageType.PREPARE_FULL_PAGE_TILE,
  });

  await agent.handle({ ...identity, type: MessageType.RESTORE_FULL_PAGE_CAPTURE });
  resolveStability();

  await expect(pendingTile).rejects.toThrow('restored during pending page work');
  expect(mocks.applyFloatingPolicyForTile).not.toHaveBeenCalled();
  expect(mocks.restorePageMutations).toHaveBeenCalledOnce();
});

it('does not resume lazy warm-up mutations after restore invalidates preparation', async () => {
  let resolveWarmUp: () => void = () => undefined;
  mocks.warmUpLazyContent.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveWarmUp = resolve;
      })
  );
  const agent = createFullPageCaptureAgent();
  const pendingPrepare = agent.handle({
    ...identity,
    preferences: { ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES, preloadLazyContent: true },
    type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
  });
  await Promise.resolve();

  await agent.handle({ ...identity, type: MessageType.RESTORE_FULL_PAGE_CAPTURE });
  resolveWarmUp();

  await expect(pendingPrepare).rejects.toThrow('restored during pending page work');
  expect(mocks.restorePageMutations).toHaveBeenCalledOnce();
});
