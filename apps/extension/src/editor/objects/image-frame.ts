import type { FabricObject } from 'fabric';
import type { EditorImageSettings } from '../../features/editor/document/image-types';
import { hexToRgba } from '../document/model';
import { traceCanvasRoundedRect } from './canvas-rounded-rect';
import { createObjectFactoryStrokeDashArray } from './stroke-dash';

type ImageStyleRuntimeObject = FabricObject & {
  sniptaleBrowserHeader?: { image: CanvasImageSource; displayHeight: number } | undefined;
  sniptaleImageBaseRender?: (ctx: CanvasRenderingContext2D) => void;
  sniptaleImageRenderAttached?: boolean;
  _render?: (ctx: CanvasRenderingContext2D) => void;
};

function getBrowserHeaderLocalHeight(object: ImageStyleRuntimeObject): number {
  const header = object.sniptaleBrowserHeader;
  return header ? header.displayHeight / Math.max(0.001, Math.abs(object.scaleY ?? 1)) : 0;
}

export function attachBrowserHeaderToImage(
  object: FabricObject,
  image: CanvasImageSource | null,
  displayHeight: number
): void {
  const runtimeObject = object as ImageStyleRuntimeObject;
  runtimeObject.sniptaleBrowserHeader = image ? { image, displayHeight } : undefined;
  object.dirty = true;
}

function renderImageFrame(
  object: ImageStyleRuntimeObject,
  ctx: CanvasRenderingContext2D,
  settings: EditorImageSettings
): void {
  if (settings.strokeWidth <= 0) {
    return;
  }

  const width = Math.max(1, Math.round(object.width ?? 1));
  const height = Math.max(1, Math.round(object.height ?? 1));
  const headerHeight = getBrowserHeaderLocalHeight(object);
  const strokeInset = settings.strokeWidth / 2;

  ctx.save();
  clearCanvasShadow(ctx);
  ctx.strokeStyle = hexToRgba(settings.strokeColor, settings.strokeOpacity);
  ctx.lineWidth = settings.strokeWidth;
  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash(
      createObjectFactoryStrokeDashArray(settings.strokeStyle, settings.strokeWidth, {
        dashDotGapMultiplier: 1.4,
        longDashGapMultiplier: 1.6,
        longDashLengthMultiplier: 4,
      }) ?? []
    );
  }
  traceCanvasRoundedRect(ctx, {
    height: height + headerHeight + settings.strokeWidth,
    left: -width / 2 - strokeInset,
    radius: Math.max(0, settings.radius) + strokeInset,
    top: -height / 2 - headerHeight - strokeInset,
    width: width + settings.strokeWidth,
  });
  ctx.stroke();
  ctx.restore();
}

function clearCanvasShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function renderOuterSourceImageShadow(
  object: ImageStyleRuntimeObject,
  ctx: CanvasRenderingContext2D,
  settings: EditorImageSettings
): void {
  if (!object.shadow) return;
  const width = Math.max(1, Math.round(object.width ?? 1));
  const height = Math.max(1, Math.round(object.height ?? 1));
  const headerHeight = getBrowserHeaderLocalHeight(object);
  const radius = Math.min(Math.max(0, settings.radius), width / 2, height / 2);
  const margin = Math.max(
    256,
    (settings.shadowBlur ?? 12) * 4 + (settings.shadowDistance ?? 4) + settings.strokeWidth
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(
    -width / 2 - margin,
    -height / 2 - headerHeight - margin,
    width + margin * 2,
    height + headerHeight + margin * 2
  );
  ctx.roundRect(-width / 2, -height / 2 - headerHeight, width, height + headerHeight, radius);
  ctx.clip('evenodd');
  ctx.beginPath();
  ctx.roundRect(-width / 2, -height / 2 - headerHeight, width, height + headerHeight, radius);
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.restore();
}

function renderClippedImageContent(
  object: ImageStyleRuntimeObject,
  ctx: CanvasRenderingContext2D,
  settings: EditorImageSettings
): void {
  const width = Math.max(1, Math.round(object.width ?? 1));
  const height = Math.max(1, Math.round(object.height ?? 1));
  const headerHeight = getBrowserHeaderLocalHeight(object);
  const radius = Math.min(Math.max(0, settings.radius), width / 2, height / 2);

  const renderContent = () => {
    if (object.sniptaleBrowserHeader && headerHeight > 0) {
      ctx.drawImage(
        object.sniptaleBrowserHeader.image,
        -width / 2,
        -height / 2 - headerHeight,
        width,
        headerHeight
      );
    }
    object.sniptaleImageBaseRender?.(ctx);
  };

  if (radius <= 0 || typeof ctx.clip !== 'function') {
    renderContent();
    return;
  }

  ctx.save();
  traceCanvasRoundedRect(ctx, {
    height: height + headerHeight,
    left: -width / 2,
    radius,
    top: -height / 2 - headerHeight,
    width,
  });
  ctx.clip();
  renderContent();
  ctx.restore();
}

export function attachImageStyleRenderer(
  object: FabricObject,
  readSettings: (object: FabricObject) => EditorImageSettings
): void {
  const runtimeObject = object as ImageStyleRuntimeObject;
  if (runtimeObject.sniptaleImageRenderAttached || typeof runtimeObject._render !== 'function') {
    return;
  }

  runtimeObject.sniptaleImageBaseRender = runtimeObject._render.bind(runtimeObject);
  runtimeObject._render = function renderImageStyleObject(ctx: CanvasRenderingContext2D) {
    const target = this as ImageStyleRuntimeObject;
    const settings = readSettings(target);
    if (target.sniptaleType === 'source-image' && target.shadow) {
      renderOuterSourceImageShadow(target, ctx, settings);
      ctx.save();
      clearCanvasShadow(ctx);
      renderClippedImageContent(target, ctx, settings);
      renderImageFrame(target, ctx, settings);
      ctx.restore();
      return;
    }
    renderClippedImageContent(target, ctx, settings);
    renderImageFrame(target, ctx, settings);
  };
  runtimeObject.sniptaleImageRenderAttached = true;
}
