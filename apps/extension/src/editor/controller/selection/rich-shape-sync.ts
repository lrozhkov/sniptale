import type { FabricObject } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import { exportRichShapeDocumentObject, isRichShapeObject } from '../../objects/rich-shape';
import { TRANSPARENT_COLOR } from '../../document/model';

function transparencyToOpacity(value: number): number {
  return Math.max(0, Math.min(1, value > 1 ? 1 - value / 100 : 1 - value));
}

export function syncRichShapeSelectionSettings(object: FabricObject): void {
  if (!isRichShapeObject(object)) {
    return;
  }

  const store = useEditorStore.getState();
  const shape = exportRichShapeDocumentObject(object);
  const fillColor = shape.style.fill.type === 'solid' ? shape.style.fill.color : TRANSPARENT_COLOR;
  store.updateSelectionShapeSettings('rectangle', {
    fillColor,
    fillOpacity: transparencyToOpacity(shape.style.fillTransparency),
    strokeColor: shape.style.line.color,
    strokeOpacity: transparencyToOpacity(shape.style.line.transparency),
    strokeWidth: shape.style.line.width,
    opacity: shape.style.opacity,
    radius: shape.style.cornerRadius,
    shadow: shape.effects.shadow.enabled ? Math.round(shape.effects.shadow.opacity * 100) : 0,
    strokeStyle:
      shape.style.line.dashStyle === 'dot'
        ? 'dotted'
        : shape.style.line.dashStyle === 'solid'
          ? 'solid'
          : 'dashed',
  });
  store.updateSelectionTextSettings({
    fontFamily:
      shape.text.fontFamily === 'serif' || shape.text.fontFamily === 'mono'
        ? shape.text.fontFamily
        : 'sans',
    fontSize: shape.text.fontSize,
    fontStyle: shape.text.fontStyle,
    fontWeight: shape.text.fontWeight,
    linethrough: shape.text.strike,
    textColor: shape.text.color,
    underline: shape.text.underline,
  });
}
