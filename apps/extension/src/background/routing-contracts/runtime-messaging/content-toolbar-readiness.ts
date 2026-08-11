import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getBackgroundRuntimeMessaging } from './services';

const CONTENT_TOOLBAR_READY_MAX_ATTEMPTS = 40;
const CONTENT_TOOLBAR_READY_RETRY_DELAY_MS = 50;

type ContentToolbarReadinessDeps = {
  sendTabMessage: ReturnType<typeof getBackgroundRuntimeMessaging>['sendTabMessage'];
  wait: (delayMs: number) => Promise<void>;
};

type ContentToolbarStatus = {
  screenshotMode: boolean;
  visible: boolean;
};

const defaultReadinessDeps: ContentToolbarReadinessDeps = {
  sendTabMessage: (tabId, message) =>
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, message, { frameId: 0 }),
  wait: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readContentToolbarStatus(response: unknown): ContentToolbarStatus | null {
  if (
    !isObject(response) ||
    response['success'] !== true ||
    typeof response['screenshotMode'] !== 'boolean' ||
    typeof response['visible'] !== 'boolean'
  ) {
    return null;
  }
  return {
    screenshotMode: response['screenshotMode'],
    visible: response['visible'],
  };
}

async function readContentToolbarStatusAttempt(
  tabId: number,
  deps: ContentToolbarReadinessDeps
): Promise<ContentToolbarStatus | null> {
  try {
    return readContentToolbarStatus(
      await deps.sendTabMessage(tabId, { type: MessageType.TOOLBAR_STATUS })
    );
  } catch {
    return null;
  }
}

export async function waitForContentToolbarReady(
  tabId: number,
  deps: Partial<ContentToolbarReadinessDeps> = {}
): Promise<ContentToolbarStatus> {
  const resolvedDeps = { ...defaultReadinessDeps, ...deps };
  for (let attempt = 1; attempt <= CONTENT_TOOLBAR_READY_MAX_ATTEMPTS; attempt += 1) {
    const status = await readContentToolbarStatusAttempt(tabId, resolvedDeps);
    if (status) return status;
    if (attempt < CONTENT_TOOLBAR_READY_MAX_ATTEMPTS) {
      await resolvedDeps.wait(CONTENT_TOOLBAR_READY_RETRY_DELAY_MS);
    }
  }
  throw new Error('Content toolbar did not become ready after runtime injection.');
}

export async function waitForContentScreenshotMode(
  tabId: number,
  expected: boolean,
  deps: Partial<ContentToolbarReadinessDeps> = {}
): Promise<ContentToolbarStatus> {
  const resolvedDeps = { ...defaultReadinessDeps, ...deps };
  for (let attempt = 1; attempt <= CONTENT_TOOLBAR_READY_MAX_ATTEMPTS; attempt += 1) {
    const status = await readContentToolbarStatusAttempt(tabId, resolvedDeps);
    if (status?.screenshotMode === expected) return status;
    if (attempt < CONTENT_TOOLBAR_READY_MAX_ATTEMPTS) {
      await resolvedDeps.wait(CONTENT_TOOLBAR_READY_RETRY_DELAY_MS);
    }
  }
  throw new Error(
    `Content toolbar did not confirm screenshot mode ${expected ? 'enabled' : 'disabled'}.`
  );
}
