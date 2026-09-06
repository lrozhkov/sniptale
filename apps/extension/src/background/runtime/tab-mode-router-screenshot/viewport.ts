import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import type { ViewportPresetAvailability } from '../../../features/viewport-presets/contracts';
import { classifyTabRuntimeCapability } from '../../../features/tab-capabilities/runtime';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { getCaptureSurfaceService } from '../../capture-surface';
import { CaptureSurfaceError } from '../../capture-surface';
import {
  authorizeScreenshotSurfaceMutation,
  claimScreenshotSurfaceApply,
  claimScreenshotSurfaceRelease,
  getScreenshotSurfaceSession,
  markScreenshotSurfaceApplied,
  markScreenshotSurfaceReleased,
} from '../../capture-surface/screenshot-session';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';
import type { WebSnapshotViewerPorts } from '../../capture/lifecycle';
import { runScreenshotModeOperation } from './operation-queue';
import type {
  ScreenshotViewport,
  ViewportOwnerState,
  ViewportState,
} from '../../routing-contracts/tab-mode-state';

const logger = createLogger({ namespace: 'BackgroundScreenshotSurface' });

function requireScreenshotSurfaceAuthorization(
  tabId: number,
  capabilityToken: string,
  documentId: string | null | undefined
): void {
  if (!authorizeScreenshotSurfaceMutation({ capabilityToken, documentId, tabId })) {
    throw new Error('authorization-expired');
  }
}

async function notifyViewportChanged(tabId: number, viewport: ScreenshotViewport): Promise<void> {
  await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: MessageType.VIEWPORT_CHANGED,
    viewport,
  });
}

async function requireEnabledPreset(presetId: string) {
  const settings = await loadSettings();
  const preset = settings.viewportPresets.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error('missing');
  if (!preset.enabled) throw new Error('disabled');
  return preset;
}

async function releaseRegularSurface(tabId: number, leaseGeneration: number): Promise<void> {
  const session = getScreenshotSurfaceSession(tabId);
  if (!session) return;
  const service = getCaptureSurfaceService();
  while (true) {
    const applied = service.getApplied(tabId);
    if (!applied) return;
    if (applied.sessionId !== session.sessionId) {
      throw new CaptureSurfaceError(
        'surface-busy',
        'The screenshot surface is suspended beneath another owner'
      );
    }
    if (applied.generation !== leaseGeneration) {
      throw new CaptureSurfaceError('stale-generation');
    }
    await service.release(applied);
  }
}

async function applyRegularPreset(
  tabId: number,
  presetId: string,
  session: { generation: number; sessionId: string }
): Promise<ScreenshotViewport> {
  const service = getCaptureSurfaceService();
  const current = service.getApplied(tabId);
  const request = {
    sessionId: session.sessionId,
    generation: session.generation,
    owner: 'screenshot',
    tabId,
    presetId,
    context: 'screenshot',
  } as const;
  let applied;
  if (current?.sessionId !== session.sessionId) {
    applied = await service.apply(request);
  } else {
    await requireEnabledPreset(presetId);
    applied = await service.replace(request);
  }
  return {
    presetId: applied.presetId,
    target: applied.target,
    width: applied.width,
    height: applied.height,
  };
}

export async function handleApplyViewportPreset(
  tabId: number,
  presetId: string,
  operationGeneration: number,
  surfaceCapabilityToken: string,
  senderDocumentId: string | null | undefined,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  _webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, async () => {
    requireScreenshotSurfaceAuthorization(tabId, surfaceCapabilityToken, senderDocumentId);
    const surfaceSession = claimScreenshotSurfaceApply({
      capabilityToken: surfaceCapabilityToken,
      documentId: senderDocumentId,
      operationGeneration,
      tabId,
    });
    if (!surfaceSession) throw new Error('stale-generation');
    const tab = await browserTabs.get(tabId);
    const capability = classifyTabRuntimeCapability(tab);
    if (capability === TabRuntimeCapability.Restricted) throw new Error('unsupported-context');
    let viewport: ScreenshotViewport;
    try {
      viewport = await applyRegularPreset(tabId, presetId, surfaceSession);
    } catch (error) {
      if (!getCaptureSurfaceService().getApplied(tabId)) {
        viewportOwnerState.delete(tabId);
        viewportState.set(tabId, null);
        await notifyViewportChanged(tabId, null).catch(() => undefined);
      }
      throw error;
    }
    viewportOwnerState.set(tabId, 'capture-surface');
    markScreenshotSurfaceApplied(tabId, operationGeneration);
    viewportState.set(tabId, viewport);
    await notifyViewportChanged(tabId, viewport).catch((error) => {
      logger.warn('Failed to notify content about applied size preset', error);
    });
  });
}

export async function handleReleaseViewportPreset(
  tabId: number,
  operationGeneration: number,
  leaseGeneration: number,
  surfaceCapabilityToken: string,
  senderDocumentId: string | null | undefined,
  viewportState: ViewportState,
  viewportOwnerState: ViewportOwnerState,
  _webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map()
): Promise<void> {
  return runScreenshotModeOperation(tabId, async () => {
    requireScreenshotSurfaceAuthorization(tabId, surfaceCapabilityToken, senderDocumentId);
    if (
      !claimScreenshotSurfaceRelease({
        capabilityToken: surfaceCapabilityToken,
        documentId: senderDocumentId,
        leaseGeneration,
        operationGeneration,
        tabId,
      })
    ) {
      throw new Error('stale-generation');
    }
    const tab = await browserTabs.get(tabId);
    const capability = classifyTabRuntimeCapability(tab);
    if (capability !== TabRuntimeCapability.Restricted) {
      await releaseRegularSurface(tabId, leaseGeneration);
      await notifyViewportChanged(tabId, null).catch((error) => {
        logger.warn('Failed to notify content about restored current size', error);
      });
    }
    markScreenshotSurfaceReleased(tabId, leaseGeneration);
    viewportOwnerState.delete(tabId);
    viewportState.set(tabId, null);
  });
}

export async function getScreenshotPresetAvailabilities(
  tabId: number,
  presetIds: readonly string[],
  context: 'screenshot' | 'video' = 'screenshot'
): Promise<ViewportPresetAvailability[]> {
  const tab = await browserTabs.get(tabId);
  const capability = classifyTabRuntimeCapability(tab);
  if (capability === TabRuntimeCapability.Restricted) {
    const settings = await loadSettings();
    const presetsById = new Map(settings.viewportPresets.map((preset) => [preset.id, preset]));
    return presetIds.map((presetId) => {
      const preset = presetsById.get(presetId);
      return {
        status: 'unavailable',
        presetId,
        target: preset?.target ?? null,
        reason: 'unsupported-context',
        ...(preset ? { required: { width: preset.width, height: preset.height } } : {}),
      };
    });
  }
  return getCaptureSurfaceService().getAvailabilities({
    tabId,
    presetIds,
    context: context === 'video' ? 'video-tab' : 'screenshot',
  });
}
