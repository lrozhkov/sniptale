import { useEffect, useState } from 'react';
import {
  normalizeEditorGradientStops,
  type EditorGradientColorStop,
} from '../../../../features/editor/document/gradient';
import { type EditorRichShapeGradientFill } from '../../../../features/editor/document/rich-shape';
import { translate } from '../../../../platform/i18n';
import { ColorField } from '../../../chrome/ui';
import { EditorGradientControls } from '../../gradient';
import { buildShapeColorControlProps } from '../brush-shape-sections/shared';
import { CollapsibleSection, PercentRangeField } from './fields';
import { RichShapeFillModeSelector } from './fill-mode-selector';
import { createFillModeOptions, getFillMode, syncFillMode, type FillMode } from './fill-mode';
import { RichShapeRoughFillControls } from './rough';
import type { RichShapeControlsProps } from './types';

function getGradientStops(props: RichShapeControlsProps) {
  if (props.shape.style.fill.type === 'gradient') {
    return props.shape.style.fill.stops;
  }
  return [
    { color: '#ffffff', offset: 0, transparency: 0 },
    { color: '#dbeafe', offset: 1, transparency: 0 },
  ];
}

function createGradientFill(
  fill: EditorRichShapeGradientFill | null,
  patch: Partial<EditorRichShapeGradientFill>
): EditorRichShapeGradientFill {
  return {
    type: 'gradient',
    gradientType: fill?.gradientType ?? 'linear',
    angle: fill?.angle ?? 90,
    stops: fill?.stops ?? [
      { color: '#ffffff', offset: 0, transparency: 0 },
      { color: '#dbeafe', offset: 1, transparency: 0 },
    ],
    ...patch,
  };
}

export function RichShapeFillSection(props: RichShapeControlsProps & { compact?: boolean }) {
  const body = <RichShapeFillBody {...props} />;

  if (props.compact) {
    return body;
  }

  return (
    <CollapsibleSection label={translate('editor.compact.richShapeFill')}>
      {body}
    </CollapsibleSection>
  );
}

function RichShapeFillBody(props: RichShapeControlsProps) {
  const [mode, setMode] = useState<FillMode>(() => getFillMode(props));
  const fillTransparency = props.shape.style.fillTransparency;
  const fillType = props.shape.style.fill.type;
  const roughEnabled = props.shape.rough.enabled;
  const shapeId = props.shape.id;
  useEffect(() => {
    setMode(syncFillMode(fillTransparency, fillType, roughEnabled));
  }, [fillTransparency, fillType, roughEnabled, shapeId]);
  const stops = getGradientStops(props);
  const solidColor =
    props.shape.style.fill.type === 'solid' ? props.shape.style.fill.color : '#ffffff';
  const fillModeOptions = createFillModeOptions(props.roughCapable || props.shape.rough.enabled);

  return (
    <div className="space-y-3">
      <RichShapeFillModeSelector
        mode={mode}
        options={fillModeOptions}
        setMode={setMode}
        solidColor={solidColor}
        stops={stops}
        props={props}
      />
      <RichShapeFillModeControls color={solidColor} mode={mode} props={props} />
      <RichShapeFillTransparencyControl mode={mode} setMode={setMode} props={props} />
    </div>
  );
}

function RichShapeFillModeControls(args: {
  color: string;
  mode: FillMode;
  props: RichShapeControlsProps;
}) {
  if (args.mode === 'solid') {
    return <RichShapeSolidFillControls {...args.props} color={args.color} />;
  }
  if (args.mode === 'gradient') {
    return <RichShapeGradientFillControls {...args.props} />;
  }
  if (args.mode === 'sketch') {
    return <RichShapeRoughFillControls {...args.props} />;
  }

  return null;
}

function RichShapeFillTransparencyControl(args: {
  mode: FillMode;
  props: RichShapeControlsProps;
  setMode: (mode: FillMode) => void;
}) {
  if (args.mode === 'sketch') {
    return null;
  }

  return (
    <PercentRangeField
      label={translate('editor.compact.richShapeTransparency')}
      value={args.props.shape.style.fillTransparency}
      onChange={(fillTransparency) => {
        if (args.mode === 'none' && fillTransparency < 1) {
          args.setMode(args.props.shape.style.fill.type === 'gradient' ? 'gradient' : 'solid');
        }
        args.props.applyRichShapePatch({ style: { fillTransparency } });
      }}
    />
  );
}

function RichShapeSolidFillControls(props: RichShapeControlsProps & { color: string }) {
  const label = translate('editor.compact.fillColor');

  return (
    <ColorField
      title={label}
      label={label}
      {...buildShapeColorControlProps(
        props.color,
        props.recentColors,
        (color) =>
          props.updateColor(
            (next: string) =>
              props.applyRichShapePatch({ style: { fill: { type: 'solid', color: next } } }),
            color
          ),
        (color) => props.updateColor(() => undefined, color),
        props.shapeFillPalette
      )}
    />
  );
}

function RichShapeGradientFillControls(props: RichShapeControlsProps) {
  const fill = props.shape.style.fill.type === 'gradient' ? props.shape.style.fill : null;
  const stops = normalizeRichShapeGradientStops(fill?.stops ?? getGradientStops(props));
  const patchStops = (nextStops: EditorGradientColorStop[]) => {
    props.applyRichShapePatch({
      style: {
        fill: createGradientFill(fill, { stops: mergeRichShapeStopTransparency(nextStops, stops) }),
      },
    });
  };
  const patchStopTransparency = (index: number, transparency: number) => {
    const nextStops = [...stops];
    nextStops[index] = {
      ...(nextStops[index] ?? { color: '#ffffff', offset: 0, transparency: 0 }),
      transparency,
    };
    patchStops(nextStops);
  };

  return (
    <div className="space-y-3">
      <EditorGradientControls
        angle={fill?.angle ?? 90}
        stops={stops}
        palette={props.shapeFillPalette}
        recentColors={props.recentColors}
        onStopsChange={patchStops}
        onPreviewStopsChange={patchStops}
        onAngleChange={(angle) =>
          props.applyRichShapePatch({
            style: { fill: createGradientFill(fill, { angle, stops }) },
          })
        }
        resolveStopOpacity={({ selectedIndex, stop }) =>
          1 - resolveRichShapeStopTransparency(stops, selectedIndex, stop)
        }
        onStopOpacityChange={({ selectedIndex, opacity }) =>
          patchStopTransparency(selectedIndex, 1 - opacity)
        }
      />
    </div>
  );
}

function normalizeRichShapeGradientStops(stops: EditorRichShapeGradientFill['stops']) {
  const normalizedStops = normalizeEditorGradientStops(stops, [
    { color: '#ffffff', offset: 0 },
    { color: '#dbeafe', offset: 1 },
  ]);
  return normalizedStops.map((stop) => ({
    ...stop,
    transparency:
      stops.find((source) => source.color === stop.color && source.offset === stop.offset)
        ?.transparency ?? 0,
  }));
}

function mergeRichShapeStopTransparency(
  nextStops: readonly EditorGradientColorStop[],
  previousStops: EditorRichShapeGradientFill['stops']
): EditorRichShapeGradientFill['stops'] {
  return nextStops.map((stop, index) => ({
    ...stop,
    transparency: resolveRichShapeStopTransparency(previousStops, index, stop),
  }));
}

function resolveRichShapeStopTransparency(
  stops: EditorRichShapeGradientFill['stops'],
  selectedIndex: number,
  stop: EditorGradientColorStop
): number {
  return (
    stops[selectedIndex]?.transparency ??
    stops.find((source) => source.color === stop.color && source.offset === stop.offset)
      ?.transparency ??
    0
  );
}
