import { loadSettings } from '../../../composition/persistence/settings';
import {
  acquireMediaMutationPermit,
  getMediaAuthorityGeneration,
} from '../../mutation-exclusion/media-activity';
import { getQuickActionAppearanceSnapshot } from '../quick-actions/flow/surface';
import { beginPageAppearance } from '../quick-actions/appearance';
import type { CaptureActionType } from '../../../contracts/settings';
import { respondWithCaptureAction } from './delivery-response';
import type { CaptureRouteContext } from './types';
import { runStartCaptureUseCase } from '../application/start-capture-use-case';
import type { CaptureDeliveryPayload } from '../application/payload';

export { respondWithCaptureAction } from './delivery-response';
export {
  createCaptureDeliveryPromise,
  createVisibleCapturePromise,
  maybePersistScreenshotInMediaHub,
  resolveScenarioCaptureForAction,
} from '../application/start-capture-use-case';

function deliverPreparedCaptureAction(
  capturePromise: Promise<CaptureDeliveryPayload>,
  args: {
    context: CaptureRouteContext;
    captureAction: CaptureActionType;
    filename: string;
    defaultImagePresetId?: string | null | undefined;
  }
): Promise<void> {
  return respondWithCaptureAction(capturePromise, {
    resolvedTabId: args.context.resolvedTabId,
    sendResponse: args.context.sendResponse,
    captureAction: args.captureAction,
    filename: args.filename,
    defaultImagePresetId: args.defaultImagePresetId,
  });
}

export async function runPreparedCaptureAction(args: {
  context: CaptureRouteContext;
  captureTarget: 'full' | 'visible';
  capture: (
    losslessSource: boolean,
    outputProfile?: { format: 'png' | 'jpeg' | 'webp'; quality: number }
  ) => Promise<CaptureDeliveryPayload>;
}) {
  const transactionId = args.context.message?.quickActionTransactionId;
  const snapshot =
    transactionId === undefined
      ? undefined
      : getQuickActionAppearanceSnapshot(args.context.resolvedTabId, transactionId);
  const releasePermit = acquireMediaMutationPermit();
  if (!releasePermit) throw new Error('Local data erasure is in progress');
  const generation = getMediaAuthorityGeneration();
  let appearance: ReturnType<typeof beginPageAppearance>;
  try {
    appearance = beginPageAppearance(
      args.context.resolvedTabId,
      args.context.message?.quickActionTransactionId,
      args.context.message?.actionType === 'copy' ? 'png' : undefined,
      args.captureTarget === 'full'
    );
  } catch (error) {
    releasePermit();
    throw error;
  }
  const assertCurrent = () => {
    if (generation !== getMediaAuthorityGeneration())
      throw new Error('Screenshot preparation was cancelled');
    appearance.assertCurrent();
  };
  try {
    const settings = await loadSettings();
    assertCurrent();
    const defaults =
      args.captureTarget === 'full' ? (settings.fullPageImage ?? settings) : settings;
    const output = snapshot ?? args.context.message?.capturePreferences ?? defaults;
    const outputProfile = {
      format: args.context.message?.actionType === 'copy' ? ('png' as const) : output.imageFormat,
      quality: output.imageQuality ?? 100,
    };
    const result = await runStartCaptureUseCase({
      prepareImage: appearance.prepare,
      assertCurrent,
      actionType: args.context.message?.actionType,
      imageFormat: outputProfile?.format,
      capture: () => args.capture(appearance.prepare !== undefined, outputProfile),
      captureTarget: args.captureTarget,
      resolvedTabId: args.context.resolvedTabId,
      scenarioCapture: args.context.message?.scenarioCapture,
      scenarioSessionService: args.context.scenarioSessionService,
    });

    assertCurrent();
    await deliverPreparedCaptureAction(Promise.resolve(result.payload), {
      context: args.context,
      captureAction: result.captureAction,
      filename: result.filename,
      defaultImagePresetId: result.defaultImagePresetId,
    });
  } finally {
    try {
      appearance.release();
    } finally {
      releasePermit();
    }
  }
}
