import type { FullPageCaptureSessionIdentity } from '../../../contracts/full-page-capture';
import type { FullPagePageAgentTransport } from './page-agent-transport';
import type { FullPageTilePlan } from './planner';
import type { FullPageRasterBackend } from './raster';
import { createStreamingFullPageStitcher, type StreamingStitchResult } from './stitch';
import type { FullPageCaptureOptions } from './types';
import { throwIfFullPageCaptureAborted } from './cancellation';
import { createLogger } from '@sniptale/platform/observability/logger';

const GEOMETRY_EPSILON_CSS_PX = 1;
export const FULL_PAGE_EXTENT_GREW_ERROR = 'Full-page capture extent grew during capture';
const logger = createLogger({ namespace: 'BackgroundFullPageCaptureTiles' });

function createTileIdentity(identity: FullPageCaptureSessionIdentity, plan: FullPageTilePlan) {
  return {
    ...identity,
    column: plan.column,
    firstColumn: plan.firstColumn,
    firstRow: plan.firstRow,
    lastColumn: plan.lastColumn,
    lastRow: plan.lastRow,
    row: plan.row,
    targetX: plan.targetX,
    targetY: plan.targetY,
  };
}

function assertTileProgress(args: {
  actualX: number;
  actualY: number;
  plan: FullPageTilePlan;
  previousColumnX: number | null;
  previousRowY: number | null;
}): void {
  if (
    !args.plan.firstColumn &&
    args.previousColumnX !== null &&
    args.actualX <= args.previousColumnX + GEOMETRY_EPSILON_CSS_PX
  ) {
    throw new Error('Full-page capture could not advance horizontally');
  }
  if (
    args.plan.firstColumn &&
    !args.plan.firstRow &&
    args.previousRowY !== null &&
    args.actualY <= args.previousRowY + GEOMETRY_EPSILON_CSS_PX
  ) {
    throw new Error('Full-page capture could not advance vertically');
  }
  if (
    Math.abs(args.actualX - args.plan.targetX) > GEOMETRY_EPSILON_CSS_PX ||
    Math.abs(args.actualY - args.plan.targetY) > GEOMETRY_EPSILON_CSS_PX
  ) {
    throw new Error(
      [
        'Full-page capture did not reach the planned tile position',
        `actual=${args.actualX},${args.actualY}`,
        `target=${args.plan.targetX},${args.plan.targetY}`,
      ].join('; ')
    );
  }
}

export async function captureAndStitchFullPageTiles(args: {
  abortSignal?: AbortSignal | undefined;
  finalizationAbortSignal?: AbortSignal | undefined;
  agent: FullPagePageAgentTransport;
  identity: FullPageCaptureSessionIdentity;
  layoutGeneration: string;
  onProgress?: ((current: number, total: number) => void) | undefined;
  beforeFinish?(): Promise<void>;
  options: FullPageCaptureOptions;
  plans: FullPageTilePlan[];
  raster: FullPageRasterBackend;
  renewLease(): Promise<void>;
  restartOnExtentGrowth?: boolean | undefined;
  warnings: string[];
}): Promise<StreamingStitchResult> {
  let stitcher: Awaited<ReturnType<typeof createStreamingFullPageStitcher>> | null = null;
  let previousColumnX: number | null = null;
  let previousRowY: number | null = null;
  let activeIndex = -1;
  let activePlan: FullPageTilePlan | null = null;
  let activeStage = 'idle';

  try {
    for (let index = 0; index < args.plans.length; index += 1) {
      throwIfFullPageCaptureAborted(args.abortSignal);
      const plan = args.plans[index];
      if (!plan) continue;
      activeIndex = index;
      activePlan = plan;
      activeStage = 'renew-lease';
      await args.renewLease();
      throwIfFullPageCaptureAborted(args.abortSignal);
      const identity = createTileIdentity(args.identity, plan);
      activeStage = 'prepare-tile';
      const prepared = await args.agent.prepareTile(identity, args.abortSignal);
      throwIfFullPageCaptureAborted(args.abortSignal);
      activeStage = 'assert-progress';
      assertTileProgress({
        actualX: prepared.actualX,
        actualY: prepared.actualY,
        plan,
        previousColumnX,
        previousRowY,
      });
      if (prepared.frozenExtentWarning && args.restartOnExtentGrowth !== false) {
        throw new Error(FULL_PAGE_EXTENT_GREW_ERROR);
      }
      activeStage = 'capture-frame';
      const frame = await args.raster.captureFrame(args.abortSignal);
      throwIfFullPageCaptureAborted(args.abortSignal);
      activeStage = 'verify-tile';
      const verified = await args.agent.verifyTile(
        identity,
        args.layoutGeneration,
        args.abortSignal
      );
      throwIfFullPageCaptureAborted(args.abortSignal);
      if (
        Math.abs(verified.actualX - prepared.actualX) > GEOMETRY_EPSILON_CSS_PX ||
        Math.abs(verified.actualY - prepared.actualY) > GEOMETRY_EPSILON_CSS_PX ||
        verified.layoutGeneration !== args.layoutGeneration
      ) {
        throw new Error('Full-page capture tile changed while the frame was being captured');
      }
      if (verified.frozenExtentWarning && args.restartOnExtentGrowth !== false) {
        throw new Error(FULL_PAGE_EXTENT_GREW_ERROR);
      }
      activeStage = 'stitch-tile';
      stitcher ??= await createStreamingFullPageStitcher({
        firstFrameDataUrl: frame,
        frozenExtentWarning: verified.frozenExtentWarning,
        geometry: verified.geometry,
        ...(args.options.qualityPolicy === undefined
          ? {}
          : { qualityPolicy: args.options.qualityPolicy }),
        warnings: args.warnings,
      });
      await stitcher.drawFrame(frame, plan, verified);
      throwIfFullPageCaptureAborted(args.abortSignal);
      previousColumnX = verified.actualX;
      if (plan.firstColumn) previousRowY = verified.actualY;
      args.onProgress?.(index + 1, args.plans.length);
    }

    if (!stitcher) throw new Error('Full-page capture produced no raster tiles');
    activeStage = 'finish';
    throwIfFullPageCaptureAborted(args.abortSignal);
    await args.beforeFinish?.();
    throwIfFullPageCaptureAborted(args.abortSignal);
    throwIfFullPageCaptureAborted(args.finalizationAbortSignal);
    return await stitcher.finish(args.options, args.finalizationAbortSignal);
  } catch (error) {
    const planSummary =
      activePlan === null
        ? 'none'
        : [
            `row=${activePlan.row}`,
            `column=${activePlan.column}`,
            `target=${activePlan.targetX},${activePlan.targetY}`,
          ].join(' ');
    const failureSummary = [
      'Full-page tile capture failed',
      `stage=${activeStage}`,
      `tile=${activeIndex + 1}/${args.plans.length}`,
      planSummary,
    ].join('; ');
    logger.error(failureSummary, error, {
      plan: activePlan,
      stage: activeStage,
      tileCount: args.plans.length,
      tileIndex: activeIndex,
    });
    stitcher?.dispose();
    throw error;
  }
}
