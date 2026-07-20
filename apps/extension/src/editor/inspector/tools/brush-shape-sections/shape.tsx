import { translate } from '../../../../platform/i18n';
import { getEditorShapeSettings } from '../../../../features/editor/document/shape-settings';
import { ColorField, NumericRow, SelectField } from '../../../chrome/ui';
import { EditorInspectorPresetHeader } from '../../presets';
import { CollapsibleSection } from '../sections';
import {
  ShadowAngleSection,
  ShadowBlurSection,
  ShadowDistanceSection,
  ShadowRangeSection,
} from '../shadow';
import type { ShapeControlsProps, ShapeSettings } from './types';
import { buildShapeColorControlProps } from './shared';

const SHAPE_STROKE_STYLE_OPTIONS = [
  { label: translate('highlighter.editor.styleSolid'), value: 'solid' as const },
  { label: translate('highlighter.editor.styleDashed'), value: 'dashed' as const },
  { label: translate('highlighter.editor.styleDotted'), value: 'dotted' as const },
];

function renderShapeColorField(args: {
  label: string;
  onChange: (color: string) => void;
  onPreviewChange: (color: string) => void;
  palette: readonly string[];
  recentColors: string[];
  value: string;
}) {
  return (
    <ColorField
      title={args.label}
      label={args.label}
      {...buildShapeColorControlProps(
        args.value,
        args.recentColors,
        args.onChange,
        args.onPreviewChange,
        args.palette
      )}
    />
  );
}

function renderShapeStrokeColorPanel(props: ShapeControlsProps, settings: ShapeSettings) {
  const label = translate('editor.compact.strokeColor');

  return renderShapeColorField({
    label,
    onChange: (color) =>
      props.updateColor((next: string) => props.applyShapePatch({ strokeColor: next }), color),
    onPreviewChange: (color) =>
      props.previewColor((next: string) => props.applyShapePatch({ strokeColor: next }), color),
    palette: props.shapeStrokePalette,
    recentColors: props.recentColors,
    value: settings.strokeColor,
  });
}

function renderShapeFillColorPanel(props: ShapeControlsProps, settings: ShapeSettings) {
  const label = translate('editor.compact.fillColor');

  return renderShapeColorField({
    label,
    onChange: (color) =>
      props.updateColor((next: string) => props.applyShapePatch({ fillColor: next }), color),
    onPreviewChange: (color) =>
      props.previewColor((next: string) => props.applyShapePatch({ fillColor: next }), color),
    palette: props.shapeFillPalette,
    recentColors: props.recentColors,
    value: settings.fillColor,
  });
}

function renderShapeStrokeWidthPanel(props: ShapeControlsProps, settings: ShapeSettings) {
  return (
    <NumericRow
      label={translate('editor.compact.strokeWidth')}
      min={1}
      max={24}
      step={1}
      unit="px"
      value={settings.strokeWidth}
      scrub={{ min: 1, max: 24, step: 1 }}
      onPreviewValue={(strokeWidth) => props.previewShapePatch({ strokeWidth })}
      onCommitValue={(strokeWidth) => {
        props.previewShapePatch({ strokeWidth });
        props.commitPendingSelectionSettings();
      }}
    />
  );
}

function renderShapeStrokeStylePanel(props: ShapeControlsProps, settings: ShapeSettings) {
  const label = translate('highlighter.editor.styleLabel');
  return (
    <SelectField
      label={label}
      value={settings.strokeStyle}
      onChange={(strokeStyle) => props.applyShapePatch({ strokeStyle })}
      options={SHAPE_STROKE_STYLE_OPTIONS}
    />
  );
}

function renderShapeShadowPanel(props: ShapeControlsProps, settings: ShapeSettings) {
  const colorLabel = translate('editor.compact.color');

  return (
    <CollapsibleSection
      key="shape-shadow"
      label={translate('highlighter.editor.shadowLabel')}
      defaultOpen={false}
      value={`${Math.round(settings.shadow)}%`}
    >
      <div className="space-y-3">
        <ShadowRangeSection
          label={translate('editor.compact.shadowSize')}
          value={settings.shadow}
          onChange={(shadow) => props.previewShapePatch({ shadow })}
          onValueCommit={props.commitPendingSelectionSettings}
        />
        {renderShapeShadowColorPanel(props, settings, colorLabel)}
        {renderShapeShadowGeometryPanel(props, settings)}
      </div>
    </CollapsibleSection>
  );
}

function renderShapeShadowColorPanel(
  props: ShapeControlsProps,
  settings: ShapeSettings,
  colorLabel: string
) {
  return renderShapeColorField({
    label: colorLabel,
    onChange: (color) =>
      props.updateColor((next: string) => props.applyShapePatch({ shadowColor: next }), color),
    onPreviewChange: (color) =>
      props.previewColor((next: string) => props.applyShapePatch({ shadowColor: next }), color),
    palette: props.shapeStrokePalette,
    recentColors: props.recentColors,
    value: settings.shadowColor ?? settings.strokeColor,
  });
}

function renderShapeShadowGeometryPanel(props: ShapeControlsProps, settings: ShapeSettings) {
  return (
    <>
      <ShadowAngleSection
        value={settings.shadowAngle ?? 90}
        onChange={(shadowAngle) => props.previewShapePatch({ shadowAngle })}
        onValueCommit={props.commitPendingSelectionSettings}
      />
      <ShadowDistanceSection
        value={settings.shadowDistance ?? 4}
        onChange={(shadowDistance) => props.previewShapePatch({ shadowDistance })}
        onValueCommit={props.commitPendingSelectionSettings}
      />
      <ShadowBlurSection
        value={settings.shadowBlur ?? 12}
        onChange={(shadowBlur) => props.previewShapePatch({ shadowBlur })}
        onValueCommit={props.commitPendingSelectionSettings}
      />
    </>
  );
}

function renderShapeRadiusPanel(props: ShapeControlsProps, settings: ShapeSettings) {
  return (
    <NumericRow
      label={translate('highlighter.editor.radiusLabel')}
      min={0}
      max={50}
      step={1}
      unit="px"
      value={settings.radius}
      scrub={{ min: 0, max: 50, step: 1 }}
      onPreviewValue={(radius) => props.previewShapePatch({ radius })}
      onCommitValue={(radius) => {
        props.previewShapePatch({ radius });
        props.commitPendingSelectionSettings();
      }}
    />
  );
}

function renderShapeUnitOpacityPanel(
  props: ShapeControlsProps,
  settings: ShapeSettings,
  field: 'strokeOpacity' | 'fillOpacity',
  labelKey: 'strokeOpacityLabel' | 'fillOpacityLabel'
) {
  const label = translate(`highlighter.editor.${labelKey}`);
  const percent = Math.round(settings[field] * 100);

  return (
    <NumericRow
      label={label}
      min={0}
      max={100}
      step={5}
      unit="%"
      value={percent}
      scrub={{ min: 0, max: 100, step: 5 }}
      onPreviewValue={(value) => props.previewShapePatch({ [field]: value / 100 })}
      onCommitValue={(value) => {
        props.previewShapePatch({ [field]: value / 100 });
        props.commitPendingSelectionSettings();
      }}
    />
  );
}

export function renderShapeControlsSection(props: ShapeControlsProps) {
  const settings = getEditorShapeSettings(props.inspectorToolSettings, props.shapeTool);
  const controls = [
    <div key="colors" className="space-y-3">
      {renderShapeStrokeColorPanel(props, settings)}
      {renderShapeFillColorPanel(props, settings)}
    </div>,
    renderShapeStrokeWidthPanel(props, settings),
    renderShapeStrokeStylePanel(props, settings),
    props.shapeTool === 'rectangle' ? renderShapeRadiusPanel(props, settings) : null,
    renderShapeShadowPanel(props, settings),
    <div key="opacity" className="space-y-3">
      {renderShapeUnitOpacityPanel(props, settings, 'strokeOpacity', 'strokeOpacityLabel')}
      {renderShapeUnitOpacityPanel(props, settings, 'fillOpacity', 'fillOpacityLabel')}
    </div>,
  ];

  return (
    <div className="space-y-3">
      {props.presetHeader ? (
        <EditorInspectorPresetHeader state={props.presetHeader}>
          {controls}
        </EditorInspectorPresetHeader>
      ) : (
        controls
      )}
    </div>
  );
}
