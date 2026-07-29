import type { FullPageCaptureSessionIdentity } from '../../../contracts/full-page-capture';
import type { FullPagePageAgentTransport } from './page-agent-transport';
import type { FullPageTilePlan } from './planner';
import type { FullPageRasterBackend } from './raster';
import { createStreamingFullPageStitcher, type StreamingStitchResult } from './stitch';
import type { FullPageCaptureOptions } from './types';
import { throwIfFullPageCaptureAborted } from './cancellation';

const GEOMETRY_EPSILON_CSS_PX = 1;

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
    throw new Error('Full-page capture did not reach the planned tile position');
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
  warnings: string[];
}): Promise<StreamingStitchResult> {
  let stitcher: Awaited<ReturnType<typeof createStreamingFullPageStitcher>> | null = null;
  let previousColumnX: number | null = null;
  let previousRowY: number | null = null;

  for (let index = 0; index < args.plans.length; index += 1) {
    throwIfFullPageCaptureAborted(args.abortSignal);
    const plan = args.plans[index];
    if (!plan) continue;
    await args.renewLease();
    throwIfFullPageCaptureAborted(args.abortSignal);
    const identity = createTileIdentity(args.identity, plan);
    const prepared = await args.agent.prepareTile(identity);
    throwIfFullPageCaptureAborted(args.abortSignal);
    assertTileProgress({
      actualX: prepared.actualX,
      actualY: prepared.actualY,
      plan,
      previousColumnX,
      previousRowY,
    });
    const frame = await args.raster.captureFrame(args.abortSignal);
    throwIfFullPageCaptureAborted(args.abortSignal);
    const verified = await args.agent.verifyTile(identity, args.layoutGeneration);
    throwIfFullPageCaptureAborted(args.abortSignal);
    if (
      Math.abs(verified.actualX - prepared.actualX) > GEOMETRY_EPSILON_CSS_PX ||
      Math.abs(verified.actualY - prepared.actualY) > GEOMETRY_EPSILON_CSS_PX ||
      verified.layoutGeneration !== args.layoutGeneration
    ) {
      throw new Error('Full-page capture tile changed while the frame was being captured');
    }
    stitcher ??= await createStreamingFullPageStitcher({
      firstFrameDataUrl: frame,
      frozenExtentWarning: verified.frozenExtentWarning,
      geometry: verified.geometry,
      warnings: args.warnings,
    });
    await stitcher.drawFrame(frame, plan, verified);
    throwIfFullPageCaptureAborted(args.abortSignal);
    previousColumnX = verified.actualX;
    if (plan.firstColumn) previousRowY = verified.actualY;
    args.onProgress?.(index + 1, args.plans.length);
  }

  if (!stitcher) throw new Error('Full-page capture produced no raster tiles');
  throwIfFullPageCaptureAborted(args.abortSignal);
  await args.beforeFinish?.();
  throwIfFullPageCaptureAborted(args.abortSignal);
  throwIfFullPageCaptureAborted(args.finalizationAbortSignal);
  return stitcher.finish(args.options, args.finalizationAbortSignal);
}
