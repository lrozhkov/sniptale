import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWindows } from '@sniptale/platform/browser/windows';
import { createLogger } from '@sniptale/platform/observability/logger';
import { withTimeout } from '../infra';
import { DEBUGGER_TIMEOUT_MS, DEBUGGER_BANNER_HEIGHT } from '../constants';
import {
  DEFAULT_WORKSPACE_SIZE,
  resolveAvailableWorkspaceFromLayoutMetrics,
  type LayoutMetrics,
} from './helpers';

const logger = createLogger({ namespace: 'BackgroundDebuggerWorkspaceMetrics' });

type WorkspaceSize = {
  width: number;
  height: number;
};

export async function getAvailableWorkspace(tabId: number): Promise<WorkspaceSize> {
  try {
    logger.debug('Getting layout metrics via CDP', { tabId });

    const layoutMetrics = await fetchLayoutMetrics(tabId);
    const workspace = resolveAvailableWorkspaceFromLayoutMetrics(
      layoutMetrics,
      DEBUGGER_BANNER_HEIGHT
    );
    if (workspace) {
      logAvailableWorkspace(layoutMetrics, workspace);
      return workspace;
    }

    logger.warn('CDP layout metrics unavailable, falling back to window API');
    return getAvailableWorkspaceFallback(tabId);
  } catch (error) {
    logger.warn('Failed to get CDP layout metrics, falling back to window API', error);
    return getAvailableWorkspaceFallback(tabId);
  }
}

export async function fetchLayoutMetrics(tabId: number): Promise<LayoutMetrics> {
  logger.debug('Calling Page.getLayoutMetrics', { tabId });
  return withTimeout(
    browserDebugger.sendCommand({ tabId }, 'Page.getLayoutMetrics'),
    DEBUGGER_TIMEOUT_MS,
    'Page.getLayoutMetrics'
  ) as Promise<LayoutMetrics>;
}

async function getAvailableWorkspaceFallback(tabId: number): Promise<WorkspaceSize> {
  try {
    const tab = await browserTabs.get(tabId);
    if (!tab.windowId) {
      logger.warn('No windowId for tab, using default workspace', { tabId });
      return DEFAULT_WORKSPACE_SIZE;
    }

    const window = await browserWindows.get(tab.windowId);
    const availableWidth = window.width || DEFAULT_WORKSPACE_SIZE.width;
    const availableHeight =
      (window.height || DEFAULT_WORKSPACE_SIZE.height) - DEBUGGER_BANNER_HEIGHT;

    logger.debug('Resolved fallback workspace', {
      availableWidth,
      availableHeight,
      windowWidth: window.width,
      windowHeight: window.height,
    });

    return { width: availableWidth, height: availableHeight };
  } catch (error) {
    logger.warn('Failed to get workspace, using default workspace', error);
    return DEFAULT_WORKSPACE_SIZE;
  }
}

function logAvailableWorkspace(layoutMetrics: LayoutMetrics, workspace: WorkspaceSize): void {
  const visualViewport = layoutMetrics.visualViewport;
  if (visualViewport?.clientWidth && visualViewport.clientHeight) {
    logger.debug('Resolved CDP workspace', {
      workspace,
      visualViewport: {
        width: visualViewport.clientWidth,
        height: visualViewport.clientHeight,
      },
    });
    return;
  }

  logger.debug('Resolved CDP workspace without visual viewport details', workspace);
}
