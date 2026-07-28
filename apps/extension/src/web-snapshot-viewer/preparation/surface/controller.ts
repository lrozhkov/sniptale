import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import {
  PREPARATION_SURFACE_RESIZE,
  type ViewerPreparationCommand,
} from '../../../workflows/page-preparation';

type ViewerViewport = { width: number; height: number } | null;

const VIEWER_SURFACE_COMMIT_TIMEOUT_MS = 2_000;

function resolveRequestedViewport(
  command: ViewerPreparationCommand,
  manifest: WebSnapshotManifest
): ViewerViewport | undefined {
  if (command.type !== PREPARATION_SURFACE_RESIZE && !('viewport' in command)) {
    return undefined;
  }
  const requested = command.viewport ?? null;
  if (requested?.target === 'window') {
    throw new Error('Browser-window presets are unavailable in the snapshot viewer.');
  }
  return requested ?? manifest.viewport ?? null;
}

function hasExactDimensions(
  element: HTMLElement,
  viewport: Exclude<ViewerViewport, null>
): boolean {
  const rect = element.getBoundingClientRect();
  return Math.round(rect.width) === viewport.width && Math.round(rect.height) === viewport.height;
}

function isViewerSurfaceCommitted(iframe: HTMLIFrameElement, viewport: ViewerViewport): boolean {
  const container = iframe.parentElement;
  if (!container) return false;
  if (viewport === null) {
    return container.style.width === '' && container.style.height === '';
  }
  return (
    container.style.width === `${viewport.width}px` &&
    container.style.height === `${viewport.height}px` &&
    hasExactDimensions(container, viewport) &&
    hasExactDimensions(iframe, viewport)
  );
}

export async function waitForViewerSurfaceCommit(args: {
  command: ViewerPreparationCommand;
  iframe: HTMLIFrameElement | null;
  manifest: WebSnapshotManifest;
}): Promise<void> {
  const viewport = resolveRequestedViewport(args.command, args.manifest);
  if (viewport === undefined) return;
  if (!args.iframe) throw new Error('Snapshot viewer iframe is unavailable.');

  const iframe = args.iframe;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let observer: ResizeObserver | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };
    const verify = () => {
      if (isViewerSurfaceCommitted(iframe, viewport)) finish();
    };
    const timeoutId = setTimeout(() => {
      finish(new Error('Snapshot viewer could not confirm the requested page viewport.'));
    }, VIEWER_SURFACE_COMMIT_TIMEOUT_MS);

    observer = new ResizeObserver(verify);
    observer.observe(iframe);
    if (iframe.parentElement) observer.observe(iframe.parentElement);
    requestAnimationFrame(verify);
  });
}
