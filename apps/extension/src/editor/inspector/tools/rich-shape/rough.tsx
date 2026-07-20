import { translate } from '../../../../platform/i18n';
import { ColorField } from '../../../chrome/ui';
import { buildShapeColorControlProps } from '../brush-shape-sections/shared';
import { HeaderValueToggleSection, PercentRangeField, RangeField, SelectField } from './fields';
import { RichShapeMetricField } from './metric-field';
import { RICH_SHAPE_ROUGH_FILL_OPTIONS } from './options';
import type { RichShapeControlsProps } from './types';

function patchEnabledRough(
  props: RichShapeControlsProps,
  patch: Partial<RichShapeControlsProps['shape']['rough']>
) {
  props.applyRichShapePatch({ rough: { enabled: true, ...patch } });
}

export function RichShapeLineRoughControls(props: RichShapeControlsProps) {
  const rough = props.shape.rough;
  const disabled = !props.roughCapable;
  if (disabled && !rough.enabled) {
    return null;
  }

  return (
    <>
      <RangeField
        label={translate('editor.compact.richShapeRoughness')}
        value={rough.roughness}
        min={0}
        max={4}
        step={0.1}
        onChange={(roughness) => patchEnabledRough(props, { roughness })}
      />
      <RangeField
        label={translate('editor.compact.richShapeBowing')}
        value={rough.bowing}
        min={0}
        max={4}
        step={0.1}
        onChange={(bowing) => patchEnabledRough(props, { bowing })}
      />
      <HeaderValueToggleSection
        active={rough.preserveVertices}
        disabled={disabled}
        label={translate('editor.compact.richShapePreserveVertices')}
        value={translate(
          rough.preserveVertices ? 'editor.compact.enabledShort' : 'editor.compact.disabledShort'
        )}
        onToggle={() => patchEnabledRough(props, { preserveVertices: !rough.preserveVertices })}
      />
    </>
  );
}

export function RichShapeRoughFillControls(props: RichShapeControlsProps) {
  return (
    <div className="space-y-3">
      <RichShapeRoughFillColorControl {...props} />
      <RichShapeRoughFillStyleControl {...props} />
      <RichShapeRoughFillTextureControls {...props} />
      <RichShapeRoughFillPatternControls {...props} />
    </div>
  );
}

function RichShapeRoughFillColorControl(props: RichShapeControlsProps) {
  const fillColor = props.shape.rough.fillColor ?? resolveRoughFillColorFallback(props);
  const label = translate('editor.compact.fillColor');

  return (
    <ColorField
      title={label}
      label={label}
      {...buildShapeColorControlProps(
        fillColor,
        props.recentColors,
        (color) =>
          props.updateColor((next: string) => patchEnabledRough(props, { fillColor: next }), color),
        (color) => props.updateColor(() => undefined, color),
        props.shapeFillPalette
      )}
    />
  );
}

function RichShapeRoughFillStyleControl(props: RichShapeControlsProps) {
  const rough = props.shape.rough;
  return (
    <SelectField
      label={translate('editor.compact.richShapeRoughFillStyle')}
      value={rough.fillStyle}
      options={RICH_SHAPE_ROUGH_FILL_OPTIONS}
      onChange={(fillStyle) => patchEnabledRough(props, { fillStyle })}
    />
  );
}

function RichShapeRoughFillTextureControls(props: RichShapeControlsProps) {
  const rough = props.shape.rough;
  return (
    <>
      <RangeField
        label={translate('editor.compact.richShapeRoughness')}
        value={rough.fillRoughness}
        min={0}
        max={4}
        step={0.1}
        valueLabel={rough.fillRoughness.toFixed(1)}
        onChange={(fillRoughness) => patchEnabledRough(props, { fillRoughness })}
      />
      <RangeField
        label={translate('editor.compact.richShapeBowing')}
        value={rough.fillBowing}
        min={0}
        max={4}
        step={0.1}
        valueLabel={rough.fillBowing.toFixed(1)}
        onChange={(fillBowing) => patchEnabledRough(props, { fillBowing })}
      />
      <PercentRangeField
        label={translate('editor.compact.richShapeTransparency')}
        value={rough.fillTransparency}
        onChange={(fillTransparency) => patchEnabledRough(props, { fillTransparency })}
      />
    </>
  );
}

function RichShapeRoughFillPatternControls(props: RichShapeControlsProps) {
  const rough = props.shape.rough;
  return (
    <>
      <RichShapeMetricField
        metric="hachureGap"
        value={rough.hachureGap}
        onChange={(hachureGap) => patchEnabledRough(props, { hachureGap })}
      />
      <RichShapeMetricField
        metric="hachureAngle"
        value={rough.hachureAngle}
        onChange={(hachureAngle) => patchEnabledRough(props, { hachureAngle })}
      />
      <RichShapeMetricField
        metric="fillWeight"
        value={rough.fillWeight}
        onChange={(fillWeight) => patchEnabledRough(props, { fillWeight })}
      />
    </>
  );
}

function resolveRoughFillColorFallback(props: RichShapeControlsProps): string {
  return props.shape.style.fill.type === 'solid' ? props.shape.style.fill.color : '#ffffff';
}
