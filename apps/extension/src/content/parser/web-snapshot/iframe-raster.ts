import {
  IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE,
  IFRAME_RASTERIZED_ATTRIBUTE,
  IFRAME_RASTER_RECT_ATTRIBUTES,
  IFRAME_RASTER_STATUS_ATTRIBUTE,
} from '../page-preparation/snapshot';
import type { WebSnapshotAssetEntry } from './types';
import { collectWebSnapshotQueryRoots } from '../../../features/web-snapshot/public';
import {
  projectFullPageCaptureRasterRegion,
  type FullPageCaptureGeometry,
  type FullPageCaptureRect,
  type FullPageCaptureRasterCoordinateSpace,
  type FullPageCaptureRasterRegion,
} from '../../../contracts/full-page-capture';

type IframeRasterRegion = FullPageCaptureRasterRegion;

type CropIframeRaster = (region: FullPageCaptureRect) => Promise<Blob | null>;

interface IframeRasterMaterializationResult {
  assets: WebSnapshotAssetEntry[];
  rasterizedTargets: string[];
}

function readFiniteAttribute(element: Element, name: string): number | null {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : null;
}

function readIframeRasterRegion(element: Element): IframeRasterRegion | null {
  const coordinateSpace = element.getAttribute(
    IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace
  ) as FullPageCaptureRasterCoordinateSpace | null;
  const x = readFiniteAttribute(element, IFRAME_RASTER_RECT_ATTRIBUTES.x);
  const y = readFiniteAttribute(element, IFRAME_RASTER_RECT_ATTRIBUTES.y);
  const width = readFiniteAttribute(element, IFRAME_RASTER_RECT_ATTRIBUTES.width);
  const height = readFiniteAttribute(element, IFRAME_RASTER_RECT_ATTRIBUTES.height);
  if (
    !coordinateSpace ||
    !['document', 'root-content', 'viewport', 'viewport-shell'].includes(coordinateSpace) ||
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { coordinateSpace, height, width, x, y };
}

function removeIframeRasterGeometry(element: Element): void {
  element.removeAttribute(IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE);
  for (const attribute of Object.values(IFRAME_RASTER_RECT_ATTRIBUTES)) {
    element.removeAttribute(attribute);
  }
}

function isRegionWithinCaptureOutput(
  region: FullPageCaptureRect,
  captureGeometry: FullPageCaptureGeometry
): boolean {
  return (
    region.x >= 0 &&
    region.y >= 0 &&
    region.x + region.width <= captureGeometry.outputWidth &&
    region.y + region.height <= captureGeometry.outputHeight
  );
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function createScreenshotCropper(
  screenshot: Blob,
  captureGeometry: FullPageCaptureGeometry
): Promise<{ crop: CropIframeRaster; dispose(): void } | null> {
  let source: CanvasImageSource;
  let sourceWidth: number;
  let sourceHeight: number;
  let dispose: () => void;
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(screenshot);
    source = bitmap;
    sourceWidth = bitmap.width;
    sourceHeight = bitmap.height;
    dispose = () => bitmap.close();
  } else if (typeof Image === 'function') {
    const objectUrl = URL.createObjectURL(screenshot);
    const image = new Image();
    image.src = objectUrl;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(objectUrl);
      return null;
    }
    source = image;
    sourceWidth = image.naturalWidth;
    sourceHeight = image.naturalHeight;
    dispose = () => URL.revokeObjectURL(objectUrl);
  } else return null;
  const scaleX = sourceWidth / captureGeometry.outputWidth;
  const scaleY = sourceHeight / captureGeometry.outputHeight;
  return {
    async crop(region) {
      const sourceX = Math.max(0, Math.round(region.x * scaleX));
      const sourceY = Math.max(0, Math.round(region.y * scaleY));
      const width = Math.min(sourceWidth - sourceX, Math.max(1, Math.round(region.width * scaleX)));
      const height = Math.min(
        sourceHeight - sourceY,
        Math.max(1, Math.round(region.height * scaleY))
      );
      if (width <= 0 || height <= 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(source, sourceX, sourceY, width, height, 0, 0, width, height);
      return canvasToPngBlob(canvas);
    },
    dispose,
  };
}

function materializeIframeRasterImage(
  placeholder: Element,
  localPath: string,
  region: IframeRasterRegion
): void {
  const image = placeholder.ownerDocument.createElement('img');
  image.alt = 'Static raster of embedded frame content';
  image.draggable = false;
  image.src = `../${localPath}`;
  image.width = Math.max(1, Math.round(region.width));
  image.height = Math.max(1, Math.round(region.height));
  image.style.cssText = 'display:block;width:100%;height:100%;object-fit:fill';
  placeholder.replaceChildren(image);
  placeholder.setAttribute(IFRAME_RASTERIZED_ATTRIBUTE, 'true');
}

export async function materializeUnreadableIframeRasters(
  snapshot: Document,
  screenshot: Blob,
  captureGeometry: FullPageCaptureGeometry,
  options: { cropIframeRaster?: CropIframeRaster } = {}
): Promise<IframeRasterMaterializationResult> {
  const placeholders = collectWebSnapshotQueryRoots(snapshot).flatMap((root) =>
    Array.from(
      root.querySelectorAll(
        `[${IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE}="true"]` +
          '[data-iframe-unreadable="true"][data-virtual-iframe="true"]'
      )
    )
  );
  if (placeholders.length === 0) return { assets: [], rasterizedTargets: [] };

  const screenshotCropper = options.cropIframeRaster
    ? null
    : await createScreenshotCropper(screenshot, captureGeometry);
  const crop = options.cropIframeRaster ?? screenshotCropper?.crop;
  if (!crop) {
    for (const placeholder of placeholders) {
      removeIframeRasterGeometry(placeholder);
      placeholder.setAttribute(IFRAME_RASTER_STATUS_ATTRIBUTE, 'decoder-unavailable');
    }
    return { assets: [], rasterizedTargets: [] };
  }
  const assets: WebSnapshotAssetEntry[] = [];
  const rasterizedTargets: string[] = [];
  try {
    for (const [index, placeholder] of placeholders.entries()) {
      const sourceRegion = readIframeRasterRegion(placeholder);
      const region = sourceRegion
        ? projectFullPageCaptureRasterRegion(sourceRegion, captureGeometry)
        : null;
      if (!sourceRegion || !region) {
        removeIframeRasterGeometry(placeholder);
        placeholder.setAttribute(IFRAME_RASTER_STATUS_ATTRIBUTE, 'invalid-geometry');
        continue;
      }
      if (!isRegionWithinCaptureOutput(region, captureGeometry)) {
        removeIframeRasterGeometry(placeholder);
        placeholder.setAttribute(IFRAME_RASTER_STATUS_ATTRIBUTE, 'out-of-bounds');
        continue;
      }
      const blob = await crop(region);
      removeIframeRasterGeometry(placeholder);
      if (!blob || blob.size === 0) {
        placeholder.setAttribute(IFRAME_RASTER_STATUS_ATTRIBUTE, 'crop-empty');
        continue;
      }
      const localPath = `assets/sniptale-iframe-raster-${index + 1}.png`;
      materializeIframeRasterImage(placeholder, localPath, sourceRegion);
      placeholder.setAttribute(IFRAME_RASTER_STATUS_ATTRIBUTE, 'captured');
      const target = placeholder.getAttribute('data-iframe-source');
      if (target) rasterizedTargets.push(target);
      assets.push({
        blob: blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' }),
        localPath,
        originalUrl: `sniptale-iframe-raster:${index + 1}`,
      });
    }
  } finally {
    screenshotCropper?.dispose();
  }
  return { assets, rasterizedTargets };
}
