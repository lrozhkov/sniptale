export interface ViewportEmulationResult {
  cssWidth: number;
  cssHeight: number;
  scale: number;
}

export type LayoutMetrics = {
  visualViewport?: {
    clientWidth?: number;
    clientHeight?: number;
  };
  layoutViewport?: {
    clientWidth?: number;
    clientHeight?: number;
  };
  contentSize?: {
    width?: number;
    height?: number;
  };
};

type WorkspaceSize = {
  width: number;
  height: number;
};

export const DEFAULT_WORKSPACE_SIZE: WorkspaceSize = {
  width: 1920,
  height: 1080,
};

export function resolveAvailableWorkspaceFromLayoutMetrics(
  layoutMetrics: LayoutMetrics,
  debuggerBannerHeight: number
): WorkspaceSize | null {
  const visualViewport = layoutMetrics.visualViewport;
  if (visualViewport?.clientWidth && visualViewport.clientHeight) {
    return {
      width: visualViewport.clientWidth,
      height: visualViewport.clientHeight - debuggerBannerHeight,
    };
  }

  const layoutViewport = layoutMetrics.layoutViewport;
  if (layoutViewport?.clientWidth && layoutViewport.clientHeight) {
    return {
      width: layoutViewport.clientWidth,
      height: layoutViewport.clientHeight - debuggerBannerHeight,
    };
  }

  return null;
}

export function calculateViewportScale(workspace: WorkspaceSize, width: number, height: number) {
  const scaleX = workspace.width / width;
  const scaleY = workspace.height / height;
  const scale = Math.min(scaleX, scaleY, 1);
  return { scale, scaleX, scaleY };
}

export function buildViewportEmulationResult(
  layoutMetrics: LayoutMetrics,
  width: number,
  height: number,
  scale: number
): ViewportEmulationResult {
  const visualViewport = layoutMetrics.visualViewport;
  return {
    cssWidth: visualViewport?.clientWidth ?? Math.round(width * scale),
    cssHeight: visualViewport?.clientHeight ?? Math.round(height * scale),
    scale,
  };
}
