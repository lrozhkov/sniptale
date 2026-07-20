import {
  normalizeEditorRichShapeObject,
  type EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import type { EditorRichShapeFormattingPatch } from './types';

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function applyRichShapeFormattingPatch(
  shape: EditorRichShapeDocumentObject,
  patch: EditorRichShapeFormattingPatch
): EditorRichShapeDocumentObject {
  return normalizeEditorRichShapeObject({
    ...shape,
    ...(patch.rotation === undefined ? {} : { rotation: patch.rotation }),
    ...(patch.callout === undefined ? {} : { callout: patch.callout }),
    frame: patch.frame
      ? {
          ...shape.frame,
          ...patch.frame,
          height: positive(patch.frame.height ?? shape.frame.height, shape.frame.height),
          width: positive(patch.frame.width ?? shape.frame.width, shape.frame.width),
        }
      : shape.frame,
    layer: patch.layer ? { ...shape.layer, ...patch.layer } : shape.layer,
    rough: patch.rough ? { ...shape.rough, ...patch.rough } : shape.rough,
    style: patch.style ? applyRichShapeStylePatch(shape, patch) : shape.style,
    effects: patch.effects ? applyRichShapeEffectsPatch(shape, patch) : shape.effects,
    text: patch.text ? applyRichShapeTextPatch(shape, patch) : shape.text,
  });
}

function applyRichShapeStylePatch(
  shape: EditorRichShapeDocumentObject,
  patch: EditorRichShapeFormattingPatch
) {
  return {
    ...shape.style,
    ...patch.style,
    fill: patch.style?.fill ?? shape.style.fill,
    fillTransparency:
      patch.style?.fillTransparency === undefined
        ? shape.style.fillTransparency
        : clampUnit(patch.style.fillTransparency),
    line: patch.style?.line ? { ...shape.style.line, ...patch.style.line } : shape.style.line,
  };
}

function applyRichShapeEffectsPatch(
  shape: EditorRichShapeDocumentObject,
  patch: EditorRichShapeFormattingPatch
) {
  return {
    ...shape.effects,
    reflection: patch.effects?.reflection
      ? { ...shape.effects.reflection, ...patch.effects.reflection }
      : shape.effects.reflection,
    shadow: patch.effects?.shadow
      ? { ...shape.effects.shadow, ...patch.effects.shadow }
      : shape.effects.shadow,
  };
}

function applyRichShapeTextPatch(
  shape: EditorRichShapeDocumentObject,
  patch: EditorRichShapeFormattingPatch
) {
  return {
    ...shape.text,
    ...patch.text,
    insets: patch.text?.insets ? { ...shape.text.insets, ...patch.text.insets } : shape.text.insets,
  };
}
