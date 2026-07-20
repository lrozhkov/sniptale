import type { ScenarioOverlay } from '../contracts/types/overlays';
import { createCanvasBaseObject, type ScenarioEditorCanvasObject } from './editor-canvas-shared';
import { DEFAULT_BLUR_SETTINGS } from '../../highlighter/style/public';
import type { BlurSettings } from '../../highlighter/contracts';

type ResolvedCanvasBlurSettings = BlurSettings & {
  borderPresetId: string | null;
  radius: number;
  shadow: number;
  showBorder: boolean;
  strokeColor: string;
  strokeOpacity: number;
  strokeStyle: NonNullable<BlurSettings['strokeStyle']>;
  strokeWidth: number;
};

function resolveBlurSettings(
  overlay: Extract<ScenarioOverlay, { kind: 'blur-rect' }>
): ResolvedCanvasBlurSettings {
  return {
    ...DEFAULT_BLUR_SETTINGS,
    ...overlay.blurSettings,
    borderPresetId:
      overlay.blurSettings.borderPresetId ?? DEFAULT_BLUR_SETTINGS.borderPresetId ?? null,
    radius: overlay.blurSettings.radius ?? DEFAULT_BLUR_SETTINGS.radius ?? 0,
    shadow: overlay.blurSettings.shadow ?? DEFAULT_BLUR_SETTINGS.shadow ?? 0,
    showBorder: overlay.blurSettings.showBorder ?? DEFAULT_BLUR_SETTINGS.showBorder ?? false,
    strokeColor: overlay.blurSettings.strokeColor ?? DEFAULT_BLUR_SETTINGS.strokeColor ?? '#475569',
    strokeOpacity: overlay.blurSettings.strokeOpacity ?? DEFAULT_BLUR_SETTINGS.strokeOpacity ?? 1,
    strokeStyle: overlay.blurSettings.strokeStyle ?? DEFAULT_BLUR_SETTINGS.strokeStyle ?? 'solid',
    strokeWidth: overlay.blurSettings.strokeWidth ?? DEFAULT_BLUR_SETTINGS.strokeWidth ?? 2,
  };
}

export function createBlurRectCanvasObject(args: {
  assetDataUrl: string;
  overlay: Extract<ScenarioOverlay, { kind: 'blur-rect' }>;
  sourceHeight: number;
  sourceWidth: number;
}): ScenarioEditorCanvasObject {
  const blurSettings = resolveBlurSettings(args.overlay);
  return {
    ...createCanvasBaseObject({
      type: 'Rect',
      originX: 'left',
      originY: 'top',
      left: args.overlay.rect.x,
      top: args.overlay.rect.y,
      width: args.overlay.rect.width,
      height: args.overlay.rect.height,
      fill: 'transparent',
      stroke: blurSettings.showBorder ? blurSettings.strokeColor : null,
      strokeWidth: blurSettings.showBorder ? blurSettings.strokeWidth : 0,
    }),
    sniptaleId: args.overlay.id,
    sniptaleType: 'blur',
    sniptaleRole: 'annotation',
    sniptaleLabel: 'Scenario blur',
    sniptaleBlurAmount: blurSettings.amount,
    sniptaleBlurType: blurSettings.blurType,
    sniptaleBlurShowBorder: blurSettings.showBorder,
    sniptaleBlurStrokeColor: blurSettings.strokeColor,
    sniptaleBlurStrokeWidth: blurSettings.strokeWidth,
    sniptaleBorderPresetId: blurSettings.borderPresetId,
    sniptaleShapeStrokeStyle: blurSettings.strokeStyle,
    sniptaleShapeRadius: blurSettings.radius,
    sniptaleShapeShadow: blurSettings.shadow,
    sniptaleShapeStrokeOpacity: blurSettings.strokeOpacity,
    sniptaleBlurSourceData: args.assetDataUrl,
    sniptaleBlurSourceLeft: 0,
    sniptaleBlurSourceTop: 0,
    sniptaleBlurSourceWidth: args.sourceWidth,
    sniptaleBlurSourceHeight: args.sourceHeight,
    sniptaleMetaKind: 'scenario-blur-rect',
    sniptaleAutoSource: args.overlay.autoSource ?? null,
  };
}
