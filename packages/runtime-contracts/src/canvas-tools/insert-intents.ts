export type CanvasInsertIntentKind =
  | 'add-slide'
  | 'annotation'
  | 'arrow'
  | 'audio'
  | 'callout'
  | 'code'
  | 'image'
  | 'layout'
  | 'line'
  | 'shape'
  | 'text'
  | 'video';

export type CanvasInsertIntentPlacement = 'canvas-point' | 'catalog' | 'file' | 'immediate';

export interface CanvasInsertIntent<TTarget extends string = string> {
  kind: CanvasInsertIntentKind;
  placement: CanvasInsertIntentPlacement;
  target: TTarget;
}

export function createCanvasInsertIntent<TTarget extends string>(
  intent: CanvasInsertIntent<TTarget>
): CanvasInsertIntent<TTarget> {
  return intent;
}

export function isCanvasPointInsertIntent<TTarget extends string>(
  intent: CanvasInsertIntent<TTarget>
): boolean {
  return intent.placement === 'canvas-point';
}
