import { BackgroundThumbnails } from '../../../../ui/background-thumbnails';
import { useGradientPresetCatalog } from '../../../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { useState, type ReactElement } from 'react';
import { createSolidPaint, serializePaintToCss, type Paint } from '@sniptale/foundation/paint';

import {
  createEditorFrameGradientPatch,
  normalizeEditorFrameGradientColorStops,
} from '../../../../features/editor/document/frame-gradient';
import {
  createEditorGradientColorStopColor,
  createEditorGradientCssStops,
} from '../../../../features/editor/document/gradient';
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

function FrameBackgroundPresetChoices(props: EditorInspectorFrameBackgroundEditorProps) {
  const { presets } = useGradientPresetCatalog('highlighter-frame-fill');
  const gradients = presets
    .filter((preset) => preset.enabled && preset.gradient.type === 'linear')
    .sort((a, b) => a.order - b.order);
  const colors = props.frameBackgroundPalette.map((color, index) => ({
    id: `color:${index}`,
    name: color,
    groupLabel: index === 0 ? translate('editor.compact.frameBackgroundModeColor') : undefined,
    active:
      props.frameDraft.backgroundMode === 'color' &&
      serializePaintToCss(createSolidPaint(color)) ===
        serializePaintToCss(createSolidPaint(props.frameDraft.backgroundColor)),
    style: { backgroundColor: color },
  }));
  const gradientChoices = gradients.map((preset, index) => {
    const angle = preset.gradient.type === 'linear' ? preset.gradient.angle : 0;
    const stops = preset.gradient.stops.map((stop) => ({
      color: stop.color,
      offset: stop.position,
    }));
    return {
      id: `gradient:${preset.id}`,
      name: preset.name,
      groupLabel: index === 0 ? translate('editor.compact.frameBackgroundModeGradient') : undefined,
      active:
        props.frameDraft.backgroundMode === 'gradient' &&
        preset.gradient.type === 'linear' &&
        preset.gradient.angle === props.frameDraft.backgroundGradientAngle &&
        JSON.stringify(
          preset.gradient.stops.map((stop) => ({ color: stop.color, offset: stop.position }))
        ) === JSON.stringify(normalizeEditorFrameGradientColorStops(props.frameDraft)),
      style: {
        backgroundImage: `linear-gradient(${angle}deg, ${createEditorGradientCssStops(stops)})`,
      },
    };
  });
  return (
    <BackgroundThumbnails
      label={translate('editor.scene.sceneBackgroundLabel')}
      dataUi="editor.frame.paint-presets"
      items={[...colors, ...gradientChoices]}
      onSelect={(id) => {
        const color = colors.find((item) => item.id === id);
        if (color) {
          props.applyFramePatch(paintToFramePatch(createSolidPaint(color.name)));
          return;
        }
        const preset = gradients.find((item) => `gradient:${item.id}` === id);
        if (!preset || preset.gradient.type !== 'linear') return;
        const stops = preset.gradient.stops.map((stop) => ({
          color: stop.color,
          offset: stop.position,
        }));
        props.applyGradientPreset({
          id: preset.id,
          label: preset.name,
          angle: preset.gradient.angle,
          from: stops[0]!.color,
          to: stops.at(-1)!.color,
          stops,
        });
      }}
    />
  );
}

export function EditorInspectorFrameBackgroundFillEditor(
  props: EditorInspectorFrameBackgroundEditorProps
): ReactElement {
  const [transactionValue, setTransactionValue] = useState<Paint | null>(null);
  if (props.frameDraft.backgroundMode === 'image') {
    return <EditorInspectorFrameBackgroundImageEditor {...props} />;
  }

  return (
    <div className="sniptale-parameter-stack">
      <CompactPaintSelector
        triggerVariant="swatch"
        allowedModes={['solid', 'linear']}
        showGradientAdvancedControls={false}
        title={translate('editor.scene.sceneBackgroundTitle')}
        label={translate('editor.scene.sceneBackgroundLabel')}
        value={transactionValue ?? frameToPaint(props.frameDraft)}
        recentColors={props.recentColors}
        palette={props.frameBackgroundPalette}
        onChange={(paint) => props.applyFramePatch(paintToFramePatch(paint))}
        onOpenChange={(open) =>
          setTransactionValue((current) =>
            open ? (current ?? frameToPaint(props.frameDraft)) : null
          )
        }
      />
      <div className="space-y-3 px-2">
        <FrameBackgroundPresetChoices {...props} />
      </div>
    </div>
  );
}
