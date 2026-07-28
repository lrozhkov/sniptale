import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { ContentPrivilegedActionType } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import {
  createWebSnapshotViewerPorts,
  sendViewerPreparationCommand,
} from '../../page-preparation/viewer-ports';
import * as contentCaps from '../../../routing-contracts/capabilities/content-action/route';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import {
  getScreenshotSurfaceBinding,
  type ScreenshotSurfaceBinding,
} from '../../../capture-surface/screenshot-session';
import {
  buildQuickActionOverlay,
  type QuickActionFlowArgs,
  type QuickActionRuntimeContext,
} from './shared';
import { applyQuickActionSurface, releaseQuickActionSurfaceAfterFailure } from './surface';

type QuickActionStartMessage =
  | { autoStartSelection: true }
  | { autoStartCaptureType: Exclude<QuickActionRuntimeContext['captureMode'], 'selection'> };

type QuickActionFlowResult = { result: 'accepted' | 'blocked' };

async function sendQuickActionMessage(
  args: QuickActionFlowArgs,
  message: QuickActionStartMessage,
  surfaceBinding: ScreenshotSurfaceBinding
) {
  const viewport = args.viewportState.get(args.tabId) ?? null;

  await getBackgroundRuntimeMessaging().sendTabMessage(args.tabId, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    contentIntentGrant: contentCaps.issueContentPrivilegedActionAutoStartGrant({
      actionTypes: resolveContentIntentGrantActionTypes(args, message),
      tabId: args.tabId,
    }),
    quickActionOverlay: buildQuickActionOverlay(args),
    ...surfaceBinding,
    ...message,
    viewport,
  });
}

function requireQuickActionSurfaceBinding(
  tabId: number,
  surfaceCapabilityToken: string | null
): ScreenshotSurfaceBinding {
  const binding = getScreenshotSurfaceBinding(tabId);
  if (!surfaceCapabilityToken || binding?.surfaceCapabilityToken !== surfaceCapabilityToken) {
    throw new Error('Screenshot surface capability unavailable');
  }
  return binding;
}

async function ensureNativeVisibleCaptureAuthorityForFlow(
  args: QuickActionFlowArgs,
  message: QuickActionStartMessage
): Promise<void> {
  if (!requiresNativeVisibleCaptureAuthority(args, message)) {
    return;
  }

  if (!args.pageAccessPort) {
    throw new Error('Page access port unavailable.');
  }

  await args.pageAccessPort.ensureNativeVisibleCaptureAuthority(args.tabId);
}

function requiresNativeVisibleCaptureAuthority(
  args: QuickActionFlowArgs,
  message: QuickActionStartMessage
): boolean {
  if ('autoStartCaptureType' in message && message.autoStartCaptureType !== 'visible') {
    return false;
  }

  const viewport = args.viewportState.get(args.tabId);
  return viewport === null || viewport === undefined || viewport.target === 'window';
}

function resolveAutoStartCaptureActionType(
  message: QuickActionStartMessage
): ContentPrivilegedActionType {
  if ('autoStartSelection' in message) {
    return CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP;
  }
  return message.autoStartCaptureType === 'full'
    ? CaptureMessageType.CAPTURE_FULL
    : CaptureMessageType.CAPTURE_VISIBLE;
}

function resolveSelectionFollowupActionTypes(
  args: QuickActionFlowArgs
): ContentPrivilegedActionType[] {
  const actionTypes: ContentPrivilegedActionType[] = [];
  if (args.settings.saveCapturesToGallery) {
    actionTypes.push(MessageType.SAVE_SCREENSHOT_TO_GALLERY);
  }
  if (args.afterCapture === 'edit') {
    actionTypes.push(MessageType.OPEN_EDITOR_WITH_IMAGE);
  }
  if (
    args.afterCapture === 'ask_preset' ||
    args.afterCapture === 'ask_system' ||
    args.afterCapture === 'download_default'
  ) {
    actionTypes.push(MessageType.EXECUTE_SAVE);
  }
  return actionTypes;
}

function resolveBackgroundCaptureFollowupActionTypes(
  args: QuickActionFlowArgs
): ContentPrivilegedActionType[] {
  return args.afterCapture === 'ask_preset' ? [MessageType.EXECUTE_SAVE] : [];
}

function resolveContentIntentGrantActionTypes(
  args: QuickActionFlowArgs,
  message: QuickActionStartMessage
): ContentPrivilegedActionType[] {
  const captureActionType = resolveAutoStartCaptureActionType(message);
  return 'autoStartSelection' in message
    ? [captureActionType, ...resolveSelectionFollowupActionTypes(args)]
    : [captureActionType, ...resolveBackgroundCaptureFollowupActionTypes(args)];
}

async function sendViewerQuickActionMessage(
  args: QuickActionFlowArgs,
  message: QuickActionStartMessage
): Promise<void> {
  await sendViewerPreparationCommand(
    args.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts(),
    args.tabId,
    {
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      viewport: args.viewportState.get(args.tabId) ?? null,
      quickActionOverlay: buildQuickActionOverlay(args),
      ...message,
    }
  );
}

function isOwnedViewerQuickAction(args: QuickActionFlowArgs): boolean {
  return args.pageCapability === TabRuntimeCapability.OwnedSnapshotViewer;
}

export async function runSelectionFlow(args: QuickActionFlowArgs): Promise<QuickActionFlowResult> {
  try {
    const surface = await applyQuickActionSurface(args);
    const message = { autoStartSelection: true } as const;
    if (isOwnedViewerQuickAction(args)) {
      await sendViewerQuickActionMessage(args, message);
      args.screenshotModeState.set(args.tabId, true);
      return { result: 'accepted' };
    }
    await ensureNativeVisibleCaptureAuthorityForFlow(args, message);
    await sendQuickActionMessage(
      args,
      message,
      requireQuickActionSurfaceBinding(args.tabId, surface.surfaceCapabilityToken)
    );
    args.screenshotModeState.set(args.tabId, true);
    return { result: 'accepted' };
  } catch (error) {
    return releaseQuickActionSurfaceAfterFailure(args.tabId, args.viewportState, error);
  }
}

export async function runCaptureFlow(
  args: QuickActionFlowArgs & {
    captureMode: Exclude<QuickActionRuntimeContext['captureMode'], 'selection'>;
  }
): Promise<QuickActionFlowResult> {
  try {
    const surface = await applyQuickActionSurface(args);
    const message = { autoStartCaptureType: args.captureMode };
    if (isOwnedViewerQuickAction(args)) {
      await sendViewerQuickActionMessage(args, message);
      args.screenshotModeState.set(args.tabId, true);
      return { result: 'accepted' };
    }
    await ensureNativeVisibleCaptureAuthorityForFlow(args, message);
    await sendQuickActionMessage(
      args,
      message,
      requireQuickActionSurfaceBinding(args.tabId, surface.surfaceCapabilityToken)
    );
    args.screenshotModeState.set(args.tabId, true);
    return { result: 'accepted' };
  } catch (error) {
    return releaseQuickActionSurfaceAfterFailure(args.tabId, args.viewportState, error);
  }
}
