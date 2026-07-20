import type { FabricObject } from 'fabric';
import type { EditorImageSettings } from '../../features/editor/document/image-types';
import { hexToRgba } from '../document/model';
import { traceCanvasRoundedRect } from './canvas-rounded-rect';
import { createObjectFactoryStrokeDashArray } from './stroke-dash';

type ImageStyleRuntimeObject = FabricObject & {
  sniptaleImageBaseRender?: (ctx: CanvasRenderingContext2D) => void;
  sniptaleImageRenderAttached?: boolean;
  _render?: (ctx: CanvasRenderingContext2D) => void;
};

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
    height: height + settings.strokeWidth,
    left: -width / 2 - strokeInset,
    radius: Math.max(0, settings.radius) + strokeInset,
    top: -height / 2 - strokeInset,
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

function renderClippedImageContent(
  object: ImageStyleRuntimeObject,
  ctx: CanvasRenderingContext2D,
  settings: EditorImageSettings
): void {
  const width = Math.max(1, Math.round(object.width ?? 1));
  const height = Math.max(1, Math.round(object.height ?? 1));
  const radius = Math.min(Math.max(0, settings.radius), width / 2, height / 2);

  if (radius <= 0 || typeof ctx.clip !== 'function') {
    object.sniptaleImageBaseRender?.(ctx);
    return;
  }

  ctx.save();
  traceCanvasRoundedRect(ctx, {
    height,
    left: -width / 2,
    radius,
    top: -height / 2,
    width,
  });
  ctx.clip();
  object.sniptaleImageBaseRender?.(ctx);
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
    renderClippedImageContent(target, ctx, settings);
    renderImageFrame(target, ctx, settings);
  };
  runtimeObject.sniptaleImageRenderAttached = true;
}
