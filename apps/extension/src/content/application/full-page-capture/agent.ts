import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { TabRequestByType, TabResponseByType } from '../../../contracts/messaging/tab';
import type {
  FullPageCapturePrepareResult,
  FullPageCaptureSessionIdentity,
  FullPageCaptureTileState,
} from '../../../contracts/full-page-capture';
import {
  createLayoutGeneration,
  measureCaptureGeometry,
  readRootScroll,
  resolveScrollCaptureRoot,
  writeRootScroll,
} from './geometry';
import {
  applyFloatingPolicyForTile,
  collectFloatingCandidates,
  commitFloatingTile,
  preparePageMutations,
  restorePageMutations,
} from './mutations';
import { waitForCaptureStability, warmUpLazyContent } from './stability';
import type { FullPageAgentSession } from './types';

const WATCHDOG_TIMEOUT_MS = 15_000;
const GEOMETRY_EPSILON_CSS_PX = 1;

type FullPageAgentMessage =
  | TabRequestByType[typeof MessageType.PREPARE_FULL_PAGE_CAPTURE]
  | TabRequestByType[typeof MessageType.HEARTBEAT_FULL_PAGE_CAPTURE]
  | TabRequestByType[typeof MessageType.PREPARE_FULL_PAGE_TILE]
  | TabRequestByType[typeof MessageType.VERIFY_FULL_PAGE_TILE]
  | TabRequestByType[typeof MessageType.RESTORE_FULL_PAGE_CAPTURE];

type FullPageAgentResponse =
  | TabResponseByType[typeof MessageType.PREPARE_FULL_PAGE_CAPTURE]
  | TabResponseByType[typeof MessageType.HEARTBEAT_FULL_PAGE_CAPTURE]
  | TabResponseByType[typeof MessageType.PREPARE_FULL_PAGE_TILE]
  | TabResponseByType[typeof MessageType.VERIFY_FULL_PAGE_TILE]
  | TabResponseByType[typeof MessageType.RESTORE_FULL_PAGE_CAPTURE];

function sameIdentity(
  session: FullPageAgentSession,
  identity: FullPageCaptureSessionIdentity
): boolean {
  return (
    session.identity.jobId === identity.jobId &&
    session.identity.ownerToken === identity.ownerToken &&
    session.identity.runtimeGeneration === identity.runtimeGeneration
  );
}

function requireIdentity(
  session: FullPageAgentSession | null,
  identity: FullPageCaptureSessionIdentity
): FullPageAgentSession {
  if (!session || !sameIdentity(session, identity)) {
    throw new Error('Full-page capture session identity mismatch');
  }
  return session;
}

function createTileState(session: FullPageAgentSession): FullPageCaptureTileState {
  const currentGeometry = measureCaptureGeometry(session.root);
  if (
    currentGeometry.extentWidth < session.geometry.extentWidth - GEOMETRY_EPSILON_CSS_PX ||
    currentGeometry.extentHeight < session.geometry.extentHeight - GEOMETRY_EPSILON_CSS_PX
  ) {
    throw new Error('Full-page capture extent shrank during capture');
  }
  if (
    currentGeometry.extentWidth > session.geometry.extentWidth + GEOMETRY_EPSILON_CSS_PX ||
    currentGeometry.extentHeight > session.geometry.extentHeight + GEOMETRY_EPSILON_CSS_PX
  ) {
    session.frozenExtentWarning = true;
  }
  if (
    Math.abs(currentGeometry.viewportWidth - session.geometry.viewportWidth) >
      GEOMETRY_EPSILON_CSS_PX ||
    Math.abs(currentGeometry.viewportHeight - session.geometry.viewportHeight) >
      GEOMETRY_EPSILON_CSS_PX ||
    Math.abs(currentGeometry.rootViewport.x - session.geometry.rootViewport.x) >
      GEOMETRY_EPSILON_CSS_PX ||
    Math.abs(currentGeometry.rootViewport.y - session.geometry.rootViewport.y) >
      GEOMETRY_EPSILON_CSS_PX ||
    Math.abs(currentGeometry.rootViewport.width - session.geometry.rootViewport.width) >
      GEOMETRY_EPSILON_CSS_PX ||
    Math.abs(currentGeometry.rootViewport.height - session.geometry.rootViewport.height) >
      GEOMETRY_EPSILON_CSS_PX ||
    Math.abs(currentGeometry.outputWidth - session.geometry.outputWidth) >
      GEOMETRY_EPSILON_CSS_PX ||
    Math.abs(currentGeometry.outputHeight - session.geometry.outputHeight) >
      GEOMETRY_EPSILON_CSS_PX ||
    Math.abs(currentGeometry.devicePixelRatio - session.geometry.devicePixelRatio) /
      session.geometry.devicePixelRatio >
      0.005
  ) {
    throw new Error('Full-page capture viewport changed during capture');
  }
  const scroll = readRootScroll(session.root);
  return {
    actualX: scroll.x,
    actualY: scroll.y,
    frozenExtentWarning: session.frozenExtentWarning,
    geometry: session.geometry,
    layoutGeneration: session.layoutGeneration,
  };
}

export interface FullPageCaptureAgent {
  dispose(): void;
  handle(message: FullPageAgentMessage): Promise<FullPageAgentResponse>;
}

export function createFullPageCaptureAgent(): FullPageCaptureAgent {
  let session: FullPageAgentSession | null = null;
  let lastRestoredIdentity: FullPageCaptureSessionIdentity | null = null;

  function restore(active: FullPageAgentSession): void {
    if (active.restored) return;
    active.restored = true;
    active.abortController.abort(new Error('Full-page capture page session was restored'));
    if (active.watchdog) clearTimeout(active.watchdog);
    writeRootScroll(active.root, active.originalScroll.x, active.originalScroll.y);
    restorePageMutations(active);
    if (session === active) {
      lastRestoredIdentity = { ...active.identity };
      session = null;
    }
  }

  function assertActive(active: FullPageAgentSession): void {
    if (active.restored || session !== active) {
      throw new Error('Full-page capture session was restored during pending page work');
    }
  }

  function armWatchdog(active: FullPageAgentSession): void {
    if (active.watchdog) clearTimeout(active.watchdog);
    active.watchdog = setTimeout(() => restore(active), WATCHDOG_TIMEOUT_MS);
  }

  async function prepare(
    message: TabRequestByType[typeof MessageType.PREPARE_FULL_PAGE_CAPTURE]
  ): Promise<TabResponseByType[typeof MessageType.PREPARE_FULL_PAGE_CAPTURE]> {
    if (session) {
      if (sameIdentity(session, message)) {
        armWatchdog(session);
        return {
          success: true,
          result: { ...createTileState(session), warnings: session.warnings },
        };
      }
      throw new Error('Another full-page capture session is active');
    }

    const root = resolveScrollCaptureRoot();
    const originalScroll = readRootScroll(root);
    const active: FullPageAgentSession = {
      abortController: new AbortController(),
      classMutations: [],
      floating: [],
      frozenExtentWarning: false,
      geometry: measureCaptureGeometry(root),
      hadScrollbarClass: false,
      identity: {
        jobId: message.jobId,
        ownerToken: message.ownerToken,
        runtimeGeneration: message.runtimeGeneration,
      },
      layoutGeneration: '',
      mutations: [],
      originalScroll,
      preferences: message.preferences,
      root,
      restored: false,
      styleElement: null,
      videos: [],
      warnings: [],
      watchdog: null,
    };
    session = active;
    lastRestoredIdentity = null;
    try {
      preparePageMutations(active);
      active.floating = collectFloatingCandidates(active.root);
      armWatchdog(active);
      if (active.preferences.preloadLazyContent) {
        await warmUpLazyContent(
          active.root,
          active.geometry,
          () => armWatchdog(active),
          active.abortController.signal
        );
        assertActive(active);
        writeRootScroll(active.root, originalScroll.x, originalScroll.y);
        await waitForCaptureStability(active.abortController.signal);
        assertActive(active);
        active.geometry = measureCaptureGeometry(active.root);
      }
      active.layoutGeneration = createLayoutGeneration(active.geometry);
      armWatchdog(active);
      const result: FullPageCapturePrepareResult = {
        ...createTileState(active),
        warnings: active.warnings,
      };
      return { success: true, result };
    } catch (error) {
      restore(active);
      throw error;
    }
  }

  async function stageTileCapture(
    message: TabRequestByType[typeof MessageType.PREPARE_FULL_PAGE_TILE]
  ): Promise<TabResponseByType[typeof MessageType.PREPARE_FULL_PAGE_TILE]> {
    const active = requireIdentity(session, message);
    armWatchdog(active);
    writeRootScroll(active.root, message.targetX, message.targetY);
    await waitForCaptureStability(active.abortController.signal);
    assertActive(active);
    applyFloatingPolicyForTile(active, message);
    await waitForCaptureStability(active.abortController.signal);
    assertActive(active);
    return { success: true, result: createTileState(active) };
  }

  async function verifyTile(
    message: TabRequestByType[typeof MessageType.VERIFY_FULL_PAGE_TILE]
  ): Promise<TabResponseByType[typeof MessageType.VERIFY_FULL_PAGE_TILE]> {
    const active = requireIdentity(session, message);
    armWatchdog(active);
    if (message.layoutGeneration !== active.layoutGeneration) {
      throw new Error('Full-page capture layout generation mismatch');
    }
    const result = createTileState(active);
    commitFloatingTile(active);
    return { success: true, result };
  }

  return {
    dispose() {
      if (session) restore(session);
    },
    async handle(message) {
      switch (message.type) {
        case MessageType.PREPARE_FULL_PAGE_CAPTURE:
          return prepare(message);
        case MessageType.HEARTBEAT_FULL_PAGE_CAPTURE: {
          const active = requireIdentity(session, message);
          armWatchdog(active);
          return { success: true };
        }
        case MessageType.PREPARE_FULL_PAGE_TILE:
          return stageTileCapture(message);
        case MessageType.VERIFY_FULL_PAGE_TILE:
          return verifyTile(message);
        case MessageType.RESTORE_FULL_PAGE_CAPTURE: {
          if (
            !session &&
            lastRestoredIdentity &&
            lastRestoredIdentity.jobId === message.jobId &&
            lastRestoredIdentity.ownerToken === message.ownerToken &&
            lastRestoredIdentity.runtimeGeneration === message.runtimeGeneration
          ) {
            return { success: true };
          }
          const active = requireIdentity(session, message);
          restore(active);
          return { success: true };
        }
      }
    },
  };
}
