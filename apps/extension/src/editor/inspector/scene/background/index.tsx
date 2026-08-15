import { useState, type ReactElement } from 'react';
import { createSolidPaint, type Paint } from '@sniptale/foundation/paint';

import {
  createEditorFrameGradientPatch,
  normalizeEditorFrameGradientColorStops,
} from '../../../../features/editor/document/frame-gradient';
import { createEditorGradientColorStopColor } from '../../../../features/editor/document/gradient';
import { translate } from '../../../../platform/i18n';
import { CompactPaintSelector } from '../../../../ui/paint-selector';
import { EditorInspectorFrameBackgroundImageEditor } from './image';
import type { EditorInspectorFrameBackgroundEditorProps } from './shared';

function frameToPaint(frame: EditorInspectorFrameBackgroundEditorProps['frameDraft']): Paint {
  if (frame.backgroundMode !== 'gradient') {
    return createSolidPaint(frame.backgroundColor);
  }
  return {
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: frame.backgroundGradientAngle,
      interpolation: 'srgb',
      repeat: { enabled: false, span: 1 },
      stops: normalizeEditorFrameGradientColorStops(frame).map((stop, index) => ({
        id: `editor-background-stop-${index}`,
        color: createEditorGradientColorStopColor(stop),
        midpoint: 0.5,
        position: stop.offset,
      })),
    },
  };
}

function paintToFramePatch(paint: Paint) {
  if (paint.kind === 'solid') {
    return { backgroundColor: paint.color, backgroundMode: 'color' as const };
  }
  if (paint.gradient.type !== 'linear') {
    return {};
  }
  return {
    backgroundGradientAngle: paint.gradient.angle,
    backgroundMode: 'gradient' as const,
    ...createEditorFrameGradientPatch(
      {
        backgroundGradientColorStops: undefined,
        backgroundGradientFrom: paint.gradient.stops[0]?.color ?? '#00000000',
        backgroundGradientStops: undefined,
        backgroundGradientTo: paint.gradient.stops.at(-1)?.color ?? '#00000000',
      },
      paint.gradient.stops.map((stop) => ({ color: stop.color, offset: stop.position }))
    ),
  };
}

export function EditorInspectorFrameBackgroundFillEditor(
  props: EditorInspectorFrameBackgroundEditorProps
): ReactElement {
  const [transactionValue, setTransactionValue] = useState<Paint | null>(null);
  if (props.frameDraft.backgroundMode === 'image') {
    return <EditorInspectorFrameBackgroundImageEditor {...props} />;
  }

  return (
    <CompactPaintSelector
      allowedModes={['solid', 'linear']}
      showGradientAdvancedControls={false}
      title={translate('editor.scene.sceneBackgroundTitle')}
      label={translate('editor.scene.sceneBackgroundLabel')}
      value={transactionValue ?? frameToPaint(props.frameDraft)}
      recentColors={props.recentColors}
      palette={props.frameBackgroundPalette}
      onChange={(paint) => props.applyFramePatch(paintToFramePatch(paint))}
      onPreviewChange={(paint) => props.previewFramePatch(paintToFramePatch(paint))}
      onPreviewReset={(paint) => props.previewFramePatch(paintToFramePatch(paint))}
      onOpenChange={(open) =>
        setTransactionValue((current) =>
          open ? (current ?? frameToPaint(props.frameDraft)) : null
        )
      }
    />
  );
}
