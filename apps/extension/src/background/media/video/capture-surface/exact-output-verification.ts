import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  ViewportCalibrationColor,
  ViewportCalibrationPattern,
} from '@sniptale/runtime-contracts/video/types/viewport-calibration';
import { isViewportCalibrationPattern } from '@sniptale/runtime-contracts/video/types/viewport-calibration';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { getVideoSurfaceSession } from './session-registry';

type ExactViewportOutputBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
  tabId: number;
};

type VerificationResult = { height: number; width: number };

const CALIBRATION_RANDOM_BYTES = 12;
const MAX_PATTERN_ATTEMPTS = 32;

function readColor(bytes: Uint8Array, offset: number): ViewportCalibrationColor {
  return { red: bytes[offset]!, green: bytes[offset + 1]!, blue: bytes[offset + 2]! };
}

function createPattern(): ViewportCalibrationPattern {
  const bytes = new Uint8Array(CALIBRATION_RANDOM_BYTES);
  for (let attempt = 0; attempt < MAX_PATTERN_ATTEMPTS; attempt += 1) {
    globalThis.crypto.getRandomValues(bytes);
    const pattern: ViewportCalibrationPattern = {
      colors: {
        top: readColor(bytes, 0),
        right: readColor(bytes, 3),
        bottom: readColor(bytes, 6),
        left: readColor(bytes, 9),
      },
      edgeThicknessCss: 8,
    };
    if (isViewportCalibrationPattern(pattern)) return pattern;
  }
  throw new Error('Unable to create a secure viewport calibration pattern');
}

function assertCurrentBinding(binding: ExactViewportOutputBinding): void {
  const session = getVideoSurfaceSession(binding.recordingId);
  if (
    session?.generation !== binding.generation ||
    session.streamInstanceId !== binding.streamInstanceId ||
    session.tabId !== binding.tabId ||
    session.applied?.target !== 'viewport'
  ) {
    throw new Error('Exact viewport verification binding was superseded');
  }
}

function requireContentApplied(
  response:
    | {
        error?: string | undefined;
        result?: 'applied' | 'stale' | undefined;
        success?: boolean | undefined;
      }
    | null
    | undefined,
  action: string
): void {
  if (response?.success === true && response.result === 'applied') return;
  throw new Error(response?.error ?? `Viewport calibration ${action} was superseded`);
}

function requireVerifiedResponse(
  response:
    | {
        error?: string | undefined;
        result?: string | undefined;
        success?: boolean | undefined;
        videoHeight?: number | undefined;
        videoWidth?: number | undefined;
      }
    | null
    | undefined,
  phase: 'clean' | 'marked'
): VerificationResult {
  if (
    response?.success !== true ||
    response.result !== 'ALLOW' ||
    !Number.isInteger(response.videoWidth) ||
    !Number.isInteger(response.videoHeight) ||
    (response.videoWidth ?? 0) <= 0 ||
    (response.videoHeight ?? 0) <= 0
  ) {
    throw new Error(response?.error ?? `Viewport ${phase} frame verification failed`);
  }
  return { height: response.videoHeight!, width: response.videoWidth! };
}

function requireCalibrationPattern(
  pattern: ViewportCalibrationPattern | undefined
): ViewportCalibrationPattern {
  if (!pattern) throw new Error('Viewport calibration show requires a marker pattern');
  return pattern;
}

async function sendCalibrationCommand(args: {
  binding: ExactViewportOutputBinding;
  documentId?: string | null;
  pattern?: ViewportCalibrationPattern;
  transitionId: string;
  visible: boolean;
}): Promise<void> {
  const pattern = args.pattern;
  const response = await getBackgroundRuntimeMessaging().sendTabMessage(
    args.binding.tabId,
    args.visible
      ? {
          generation: args.binding.generation,
          pattern: requireCalibrationPattern(pattern),
          recordingId: args.binding.recordingId,
          transitionId: args.transitionId,
          type: VideoMessageType.SHOW_VIEWPORT_CALIBRATION,
        }
      : {
          generation: args.binding.generation,
          recordingId: args.binding.recordingId,
          transitionId: args.transitionId,
          type: VideoMessageType.HIDE_VIEWPORT_CALIBRATION,
        },
    {
      frameId: 0,
      ...(args.documentId ? { documentId: args.documentId } : {}),
    }
  );
  requireContentApplied(response, args.visible ? 'show' : 'hide');
}

async function requestViewportFrameVerification(args: {
  binding: ExactViewportOutputBinding;
  pattern: ViewportCalibrationPattern;
  phase: 'clean' | 'marked';
  transitionId: string;
  viewport: ViewportInfo;
}): Promise<VerificationResult> {
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      generation: args.binding.generation,
      recordingId: args.binding.recordingId,
      streamInstanceId: args.binding.streamInstanceId,
      transitionId: args.transitionId,
      verification: { pattern: args.pattern, phase: args.phase },
      viewport: args.viewport,
    })
  );
  return requireVerifiedResponse(response, args.phase);
}

export async function verifyExactViewportOutput(args: {
  binding: ExactViewportOutputBinding;
  documentId?: string | null;
  transitionId: string;
  viewport: ViewportInfo;
}): Promise<VerificationResult> {
  const { binding, transitionId } = args;
  const pattern = createPattern();
  assertCurrentBinding(binding);
  let marked: VerificationResult | null = null;
  let verificationError: unknown = null;
  try {
    await sendCalibrationCommand({
      binding,
      ...(args.documentId === undefined ? {} : { documentId: args.documentId }),
      pattern,
      transitionId,
      visible: true,
    });
    assertCurrentBinding(binding);
    marked = await requestViewportFrameVerification({
      binding,
      pattern,
      phase: 'marked',
      transitionId,
      viewport: args.viewport,
    });
  } catch (error) {
    verificationError = error;
  }

  let hideError: unknown = null;
  try {
    await sendCalibrationCommand({
      binding,
      ...(args.documentId === undefined ? {} : { documentId: args.documentId }),
      transitionId,
      visible: false,
    });
  } catch (error) {
    hideError = error;
  }
  if (verificationError || hideError) {
    const errors = [verificationError, hideError].filter((error) => error !== null);
    throw errors.length === 1
      ? errors[0]
      : new AggregateError(errors, 'Viewport marked-frame verification and cleanup failed');
  }

  assertCurrentBinding(binding);
  const clean = await requestViewportFrameVerification({
    binding,
    pattern,
    phase: 'clean',
    transitionId,
    viewport: args.viewport,
  });
  if (!marked || marked.width !== clean.width || marked.height !== clean.height) {
    throw new Error('Viewport clean frame dimensions differ from the marked frame');
  }
  assertCurrentBinding(binding);
  return clean;
}
