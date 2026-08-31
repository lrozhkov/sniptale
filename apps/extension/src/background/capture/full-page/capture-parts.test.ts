import { beforeEach, expect, it, vi } from 'vitest';

const { createStitcherMock, disposeMock, drawFrameMock, finishMock } = vi.hoisted(() => ({
  createStitcherMock: vi.fn(),
  disposeMock: vi.fn(),
  drawFrameMock: vi.fn(),
  finishMock: vi.fn(),
}));

vi.mock('./stitch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stitch')>()),
  createStreamingFullPageStitcher: createStitcherMock,
}));

import { captureAndStitchFullPageTiles } from './capture-parts';
import type { FullPageCaptureGeometry } from '../../../contracts/full-page-capture';
import type { FullPagePageAgentTransport } from './page-agent-transport';
import type { FullPageTilePlan } from './planner';

const geometry: FullPageCaptureGeometry = {
  devicePixelRatio: 1,
  extentHeight: 936,
  extentWidth: 800,
  outputHeight: 936,
  outputWidth: 800,
  rootKind: 'document',
  rootViewport: { height: 500, width: 800, x: 0, y: 0 },
  viewportHeight: 500,
  viewportWidth: 800,
};

beforeEach(() => {
  vi.clearAllMocks();
  drawFrameMock.mockResolvedValue(undefined);
  finishMock.mockResolvedValue({ dataUrl: 'data:image/png;base64,result', metadata: {} });
  createStitcherMock.mockResolvedValue({
    dispose: disposeMock,
    drawFrame: drawFrameMock,
    finish: finishMock,
  });
});

it('scrolls, verifies, and streams row-major tiles without retaining raster frames', async () => {
  const prepareTile = vi
    .fn()
    .mockResolvedValueOnce({
      actualX: 0,
      actualY: 0,
      frozenExtentWarning: false,
      geometry,
      layoutGeneration: 'layout-1',
    })
    .mockResolvedValueOnce({
      actualX: 0,
      actualY: 436,
      frozenExtentWarning: false,
      geometry,
      layoutGeneration: 'layout-1',
    });
  const verifyTile = vi.fn(async (tile) => ({
    actualX: tile.targetX,
    actualY: tile.targetY,
    frozenExtentWarning: false,
    geometry,
    layoutGeneration: 'layout-1',
  }));
  const captureFrame = vi
    .fn()
    .mockResolvedValueOnce('data:image/png;base64,one')
    .mockResolvedValueOnce('data:image/png;base64,two');
  const renewLease = vi.fn().mockResolvedValue(undefined);
  const onProgress = vi.fn();

  await expect(
    captureAndStitchFullPageTiles({
      agent: {
        heartbeat: vi.fn(),
        prepare: vi.fn(),
        prepareTile,
        restore: vi.fn(),
        verifyTile,
      } satisfies FullPagePageAgentTransport,
      identity: { jobId: 'job-1', ownerToken: 'owner-1', runtimeGeneration: 'generation-1' },
      layoutGeneration: 'layout-1',
      onProgress,
      options: { format: 'png' },
      plans: [
        {
          column: 0,
          firstColumn: true,
          firstRow: true,
          lastColumn: true,
          lastRow: false,
          row: 0,
          sourceInsetX: 0,
          sourceInsetY: 0,
          targetX: 0,
          targetY: 0,
        },
        {
          column: 0,
          firstColumn: true,
          firstRow: false,
          lastColumn: true,
          lastRow: true,
          row: 1,
          sourceInsetX: 0,
          sourceInsetY: 64,
          targetX: 0,
          targetY: 436,
        },
      ],
      raster: { captureFrame, release: vi.fn() },
      renewLease,
      warnings: [],
    })
  ).resolves.toEqual({ dataUrl: 'data:image/png;base64,result', metadata: {} });

  expect(renewLease).toHaveBeenCalledTimes(2);
  expect(captureFrame).toHaveBeenCalledTimes(2);
  expect(drawFrameMock).toHaveBeenNthCalledWith(
    1,
    'data:image/png;base64,one',
    expect.objectContaining({ row: 0 }),
    expect.objectContaining({ actualY: 0 })
  );
  expect(drawFrameMock).toHaveBeenNthCalledWith(
    2,
    'data:image/png;base64,two',
    expect.objectContaining({ row: 1 }),
    expect.objectContaining({ actualY: 436 })
  );
  expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
  expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
});

it('fails closed when scrolling cannot advance to the next row', async () => {
  const state = {
    actualX: 0,
    actualY: 0,
    frozenExtentWarning: false,
    geometry,
    layoutGeneration: 'layout-1',
  };
  await expect(
    captureAndStitchFullPageTiles({
      agent: {
        heartbeat: vi.fn(),
        prepare: vi.fn(),
        prepareTile: vi.fn().mockResolvedValue(state),
        restore: vi.fn(),
        verifyTile: vi.fn().mockResolvedValue(state),
      } satisfies FullPagePageAgentTransport,
      identity: { jobId: 'job-1', ownerToken: 'owner-1', runtimeGeneration: 'generation-1' },
      layoutGeneration: 'layout-1',
      options: {},
      plans: [
        {
          column: 0,
          firstColumn: true,
          firstRow: true,
          lastColumn: true,
          lastRow: false,
          row: 0,
          sourceInsetX: 0,
          sourceInsetY: 0,
          targetX: 0,
          targetY: 0,
        },
        {
          column: 0,
          firstColumn: true,
          firstRow: false,
          lastColumn: true,
          lastRow: true,
          row: 1,
          sourceInsetX: 0,
          sourceInsetY: 64,
          targetX: 0,
          targetY: 436,
        },
      ],
      raster: {
        captureFrame: vi.fn().mockResolvedValue('data:image/png;base64,tile'),
        release: vi.fn(),
      },
      renewLease: vi.fn(),
      warnings: [],
    })
  ).rejects.toThrow('could not advance vertically');
});

it('fails closed when horizontal scrolling does not advance', async () => {
  const state = {
    actualX: 0,
    actualY: 0,
    frozenExtentWarning: false,
    geometry,
    layoutGeneration: 'layout-1',
  };
  const agent = {
    heartbeat: vi.fn(),
    prepare: vi.fn(),
    prepareTile: vi.fn().mockResolvedValue(state),
    restore: vi.fn(),
    verifyTile: vi.fn().mockResolvedValue(state),
  } satisfies FullPagePageAgentTransport;

  await expect(
    captureAndStitchFullPageTiles({
      agent,
      identity: { jobId: 'job-1', ownerToken: 'owner-1', runtimeGeneration: 'generation-1' },
      layoutGeneration: 'layout-1',
      options: {},
      plans: [
        {
          column: 0,
          firstColumn: true,
          firstRow: true,
          lastColumn: false,
          lastRow: true,
          row: 0,
          sourceInsetX: 0,
          sourceInsetY: 0,
          targetX: 0,
          targetY: 0,
        },
        {
          column: 1,
          firstColumn: false,
          firstRow: true,
          lastColumn: true,
          lastRow: true,
          row: 0,
          sourceInsetX: 64,
          sourceInsetY: 0,
          targetX: 436,
          targetY: 0,
        },
      ],
      raster: {
        captureFrame: vi.fn().mockResolvedValue('data:image/png;base64,tile'),
        release: vi.fn(),
      },
      renewLease: vi.fn(),
      warnings: [],
    })
  ).rejects.toThrow('could not advance horizontally');
});

it.each([
  { actualX: 0, actualY: 12, targetX: 0, targetY: 0 },
  { actualX: 0, actualY: 250, targetX: 0, targetY: 436 },
  { actualX: 250, actualY: 0, targetX: 436, targetY: 0 },
])(
  'fails closed when actual position $actualX,$actualY does not cover planned $targetX,$targetY',
  async ({ actualX, actualY, targetX, targetY }) => {
    const state = {
      actualX,
      actualY,
      frozenExtentWarning: false,
      geometry,
      layoutGeneration: 'layout-1',
    };
    await expect(
      captureAndStitchFullPageTiles({
        agent: {
          heartbeat: vi.fn(),
          prepare: vi.fn(),
          prepareTile: vi.fn().mockResolvedValue(state),
          restore: vi.fn(),
          verifyTile: vi.fn().mockResolvedValue(state),
        },
        identity: {
          jobId: 'job-partial',
          ownerToken: 'owner-partial',
          runtimeGeneration: 'generation-1',
        },
        layoutGeneration: 'layout-1',
        options: {},
        plans: [
          {
            column: targetX === 0 ? 0 : 1,
            firstColumn: targetX === 0,
            firstRow: targetY === 0,
            lastColumn: true,
            lastRow: true,
            row: targetY === 0 ? 0 : 1,
            sourceInsetX: targetX === 0 ? 0 : 64,
            sourceInsetY: targetY === 0 ? 0 : 64,
            targetX,
            targetY,
          },
        ],
        raster: {
          captureFrame: vi.fn().mockResolvedValue('data:image/png;base64,tile'),
          release: vi.fn(),
        },
        renewLease: vi.fn(),
        warnings: [],
      })
    ).rejects.toThrow('did not reach the planned tile position');
    expect(createStitcherMock).not.toHaveBeenCalled();
  }
);

it('rejects a tile whose verified geometry changed during raster capture', async () => {
  const prepared = {
    actualX: 0,
    actualY: 0,
    frozenExtentWarning: false,
    geometry,
    layoutGeneration: 'layout-1',
  };
  const agent = {
    heartbeat: vi.fn(),
    prepare: vi.fn(),
    prepareTile: vi.fn().mockResolvedValue(prepared),
    restore: vi.fn(),
    verifyTile: vi.fn().mockResolvedValue({ ...prepared, actualX: 2 }),
  } satisfies FullPagePageAgentTransport;

  await expect(
    captureAndStitchFullPageTiles({
      agent,
      identity: { jobId: 'job-1', ownerToken: 'owner-1', runtimeGeneration: 'generation-1' },
      layoutGeneration: 'layout-1',
      options: {},
      plans: [
        {
          column: 0,
          firstColumn: true,
          firstRow: true,
          lastColumn: true,
          lastRow: true,
          row: 0,
          sourceInsetX: 0,
          sourceInsetY: 0,
          targetX: 0,
          targetY: 0,
        },
      ],
      raster: {
        captureFrame: vi.fn().mockResolvedValue('data:image/png;base64,tile'),
        release: vi.fn(),
      },
      renewLease: vi.fn(),
      warnings: [],
    })
  ).rejects.toThrow('tile changed');
});

it('restarts the capture plan instead of stitching against an extent that grew', async () => {
  const state = {
    actualX: 0,
    actualY: 0,
    frozenExtentWarning: true,
    geometry,
    layoutGeneration: 'layout-1',
  };
  const captureFrame = vi.fn();

  await expect(
    captureAndStitchFullPageTiles({
      agent: {
        heartbeat: vi.fn(),
        prepare: vi.fn(),
        prepareTile: vi.fn().mockResolvedValue(state),
        restore: vi.fn(),
        verifyTile: vi.fn(),
      },
      identity: {
        jobId: 'job-growth',
        ownerToken: 'owner-growth',
        runtimeGeneration: 'generation-1',
      },
      layoutGeneration: 'layout-1',
      options: {},
      plans: [
        {
          column: 0,
          firstColumn: true,
          firstRow: true,
          lastColumn: true,
          lastRow: true,
          row: 0,
          sourceInsetX: 0,
          sourceInsetY: 0,
          targetX: 0,
          targetY: 0,
        },
      ],
      raster: { captureFrame, release: vi.fn() },
      renewLease: vi.fn(),
      warnings: [],
    })
  ).rejects.toThrow('Full-page capture extent grew during capture');

  expect(captureFrame).not.toHaveBeenCalled();
  expect(createStitcherMock).not.toHaveBeenCalled();
});

it('finishes the frozen prepared extent when growth persists after a plan restart', async () => {
  const state = {
    actualX: 0,
    actualY: 0,
    frozenExtentWarning: true,
    geometry,
    layoutGeneration: 'layout-1',
  };
  const captureFrame = vi.fn().mockResolvedValue('data:image/png;base64,tile');
  const finish = vi.fn().mockResolvedValue({
    dataUrl: 'data:image/png;base64,full-page',
    metadata: { frozenExtentWarning: true },
  });
  createStitcherMock.mockResolvedValueOnce({
    dispose: vi.fn(),
    drawFrame: vi.fn(),
    finish,
  });

  await expect(
    captureAndStitchFullPageTiles({
      agent: {
        heartbeat: vi.fn(),
        prepare: vi.fn(),
        prepareTile: vi.fn().mockResolvedValue(state),
        restore: vi.fn(),
        verifyTile: vi.fn().mockResolvedValue(state),
      },
      identity: {
        jobId: 'job-persistent-growth',
        ownerToken: 'owner-persistent-growth',
        runtimeGeneration: 'generation-1',
      },
      layoutGeneration: 'layout-1',
      options: {},
      plans: [
        {
          column: 0,
          firstColumn: true,
          firstRow: true,
          lastColumn: true,
          lastRow: true,
          row: 0,
          sourceInsetX: 0,
          sourceInsetY: 0,
          targetX: 0,
          targetY: 0,
        },
      ],
      raster: { captureFrame, release: vi.fn() },
      renewLease: vi.fn(),
      restartOnExtentGrowth: false,
      warnings: [],
    })
  ).resolves.toEqual(expect.objectContaining({ dataUrl: 'data:image/png;base64,full-page' }));

  expect(captureFrame).toHaveBeenCalledOnce();
  expect(createStitcherMock).toHaveBeenCalledWith(
    expect.objectContaining({ frozenExtentWarning: true })
  );
  expect(finish).toHaveBeenCalledOnce();
});

it('rejects an empty sparse tile plan without constructing a stitcher', async () => {
  const plans = new Array(1) as FullPageTilePlan[];
  const agent = {
    heartbeat: vi.fn(),
    prepare: vi.fn(),
    prepareTile: vi.fn(),
    restore: vi.fn(),
    verifyTile: vi.fn(),
  } satisfies FullPagePageAgentTransport;

  await expect(
    captureAndStitchFullPageTiles({
      agent,
      identity: { jobId: 'job-1', ownerToken: 'owner-1', runtimeGeneration: 'generation-1' },
      layoutGeneration: 'layout-1',
      options: {},
      plans,
      raster: { captureFrame: vi.fn(), release: vi.fn() },
      renewLease: vi.fn(),
      warnings: [],
    })
  ).rejects.toThrow('produced no raster tiles');
  expect(createStitcherMock).not.toHaveBeenCalled();
});

it('passes the original export cancellation signal through final encoding', async () => {
  const controller = new AbortController();
  const state = {
    actualX: 0,
    actualY: 0,
    frozenExtentWarning: false,
    geometry,
    layoutGeneration: 'layout-1',
  };
  const beforeFinish = vi.fn(async () => {
    controller.abort(new Error('cancelled after restore'));
  });

  await expect(
    captureAndStitchFullPageTiles({
      agent: {
        heartbeat: vi.fn(),
        prepare: vi.fn(),
        prepareTile: vi.fn().mockResolvedValue(state),
        restore: vi.fn(),
        verifyTile: vi.fn().mockResolvedValue(state),
      },
      beforeFinish,
      finalizationAbortSignal: controller.signal,
      identity: { jobId: 'job-1', ownerToken: 'owner-1', runtimeGeneration: 'generation-1' },
      layoutGeneration: 'layout-1',
      options: {},
      plans: [
        {
          column: 0,
          firstColumn: true,
          firstRow: true,
          lastColumn: true,
          lastRow: true,
          row: 0,
          sourceInsetX: 0,
          sourceInsetY: 0,
          targetX: 0,
          targetY: 0,
        },
      ],
      raster: {
        captureFrame: vi.fn().mockResolvedValue('data:image/png;base64,tile'),
        release: vi.fn(),
      },
      renewLease: vi.fn(),
      warnings: [],
    })
  ).rejects.toThrow('cancelled after restore');
  expect(finishMock).not.toHaveBeenCalled();
});
