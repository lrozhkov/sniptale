import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import type { PreparationHostPorts } from '../../../content/public/preparation-surface';
import { getElementSelector } from '@sniptale/platform/browser/iframe-selectors/element';
import type {
  ScenarioCaptureMetadata,
  ScenarioFramePadding,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import { buildScenarioTargetSemanticFields } from '../../../features/scenario/capture-step/target-semantics';
import { isElementInsideSnapshotIframe } from '../runtime/targets';

function readViewport(iframe: HTMLIFrameElement): { height: number; width: number } {
  const view = iframe.contentWindow;
  return {
    width: view?.innerWidth || iframe.clientWidth || 0,
    height: view?.innerHeight || iframe.clientHeight || 0,
  };
}

function readDevicePixelRatio(view: Window | null | undefined): number {
  return view?.devicePixelRatio || 1;
}

export function buildViewerScenarioPageDescriptor(
  iframe: HTMLIFrameElement,
  manifest: WebSnapshotManifest
): ScenarioPageDescriptor {
  const viewport = readViewport(iframe);
  const view = iframe.contentWindow;

  return {
    title: manifest.source.title || iframe.contentDocument?.title || null,
    url: manifest.source.url || null,
    viewport: {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    },
    scrollX: view?.scrollX ?? 0,
    scrollY: view?.scrollY ?? 0,
    devicePixelRatio: readDevicePixelRatio(view),
  };
}

export function buildViewerScenarioTargetDescriptor(
  target: HTMLElement,
  iframe: HTMLIFrameElement,
  framePadding: ScenarioFramePadding
): ScenarioTargetDescriptor | null {
  if (!isElementInsideSnapshotIframe(target, iframe)) {
    return null;
  }

  const rect = target.getBoundingClientRect();
  return {
    ...buildScenarioTargetSemanticFields(target, { ellipsis: '...' }),
    selector: getElementSelector(target),
    iframeSelector: null,
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    },
    framePadding,
  };
}

function getViewerFrameOffset(iframe: HTMLIFrameElement): ScenarioPoint {
  const rect = iframe.getBoundingClientRect();
  return {
    x: rect.left + iframe.clientLeft,
    y: rect.top + iframe.clientTop,
  };
}

function toViewerPoint(
  point: ScenarioPoint | null,
  iframe: HTMLIFrameElement
): ScenarioPoint | null {
  if (!point) {
    return null;
  }

  const offset = getViewerFrameOffset(iframe);
  return {
    x: point.x - offset.x,
    y: point.y - offset.y,
  };
}

export function createViewerScenarioCaptureSourceAdapter(args: {
  iframe: HTMLIFrameElement | null;
  manifest: WebSnapshotManifest;
}): ReturnType<PreparationHostPorts['createScenarioCaptureSourceAdapter']> {
  return {
    buildPageDescriptor: () => {
      if (!args.iframe) {
        return {
          title: args.manifest.source.title,
          url: args.manifest.source.url,
          viewport: { x: 0, y: 0, width: 0, height: 0 },
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: readDevicePixelRatio(null),
        };
      }

      return buildViewerScenarioPageDescriptor(args.iframe, args.manifest);
    },
    buildTargetDescriptor: (target, framePadding) =>
      args.iframe ? buildViewerScenarioTargetDescriptor(target, args.iframe, framePadding) : null,
    normalizePoint: (point) => (args.iframe ? toViewerPoint(point, args.iframe) : point),
    normalizeCaptureMetadata: (metadata) => normalizeViewerCaptureMetadata(metadata, args.iframe),
  };
}

function normalizeViewerCaptureMetadata(
  metadata: ScenarioCaptureMetadata,
  iframe: HTMLIFrameElement | null
): ScenarioCaptureMetadata {
  if (!iframe || !metadata.pointerRange) {
    return metadata;
  }

  return {
    ...metadata,
    pointerRange: {
      ...metadata.pointerRange,
      start: toViewerPoint(metadata.pointerRange.start, iframe)!,
      end: toViewerPoint(metadata.pointerRange.end, iframe)!,
      minX: toViewerPoint({ x: metadata.pointerRange.minX, y: 0 }, iframe)!.x,
      minY: toViewerPoint({ x: 0, y: metadata.pointerRange.minY }, iframe)!.y,
      maxX: toViewerPoint({ x: metadata.pointerRange.maxX, y: 0 }, iframe)!.x,
      maxY: toViewerPoint({ x: 0, y: metadata.pointerRange.maxY }, iframe)!.y,
    },
  };
}
