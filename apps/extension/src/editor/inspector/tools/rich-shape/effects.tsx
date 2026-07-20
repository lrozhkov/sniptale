import { translate } from '../../../../platform/i18n';
import { ColorField } from '../../../chrome/ui';
import { buildShapeColorControlProps } from '../brush-shape-sections/shared';
import { CollapsibleSection, RangeField, PercentRangeField } from './fields';
import { RichShapeMetricField } from './metric-field';
import type { RichShapeControlsProps } from './types';

export function RichShapeEffectsSection(props: RichShapeControlsProps) {
  return (
    <div className="space-y-3">
      <RichShapeShadowControls {...props} />
      <RichShapeReflectionControls {...props} />
    </div>
  );
}

function RichShapeShadowControls(props: RichShapeControlsProps) {
  const shadow = props.shape.effects.shadow;
  const patchShadow = (patch: Partial<typeof shadow>) =>
    props.applyRichShapePatch({ effects: { shadow: patch } });
  const size = shadow.enabled ? shadow.opacity : 0;
  const colorLabel = translate('editor.compact.color');

  return (
    <CollapsibleSection
      label={translate('highlighter.editor.shadowLabel')}
      defaultOpen={false}
      value={`${Math.round(size * 100)}%`}
    >
      <div className="space-y-3">
        <RangeField
          label={translate('editor.compact.richShapeSize')}
          value={Math.round(size * 100)}
          min={0}
          max={100}
          step={1}
          valueLabel={`${Math.round(size * 100)}%`}
          onChange={(nextSize) =>
            patchShadow({ enabled: nextSize > 0, opacity: Math.max(0, nextSize) / 100 })
          }
        />
        <RichShapeShadowColorControl
          color={shadow.color}
          colorLabel={colorLabel}
          props={props}
          patchShadow={patchShadow}
        />
        <RichShapeShadowGeometryControls patchShadow={patchShadow} shadow={shadow} />
      </div>
    </CollapsibleSection>
  );
}

function RichShapeShadowColorControl(args: {
  color: string;
  colorLabel: string;
  props: RichShapeControlsProps;
  patchShadow: (patch: Partial<RichShapeControlsProps['shape']['effects']['shadow']>) => void;
}) {
  return (
    <ColorField
      title={args.colorLabel}
      label={args.colorLabel}
      {...buildShapeColorControlProps(
        args.color,
        args.props.recentColors,
        (color) =>
          args.props.updateColor((next: string) => args.patchShadow({ color: next }), color),
        (color) =>
          args.props.updateColor((next: string) => args.patchShadow({ color: next }), color),
        args.props.shapeStrokePalette
      )}
    />
  );
}

function RichShapeShadowGeometryControls(args: {
  patchShadow: (patch: Partial<RichShapeControlsProps['shape']['effects']['shadow']>) => void;
  shadow: RichShapeControlsProps['shape']['effects']['shadow'];
}) {
  return (
    <>
      <RichShapeMetricField
        metric="shadowAngle"
        value={args.shadow.angle}
        onChange={(angle) => args.patchShadow({ angle })}
      />
      <RichShapeMetricField
        metric="distance"
        value={args.shadow.distance}
        onChange={(distance) => args.patchShadow({ distance })}
      />
      <RichShapeMetricField
        metric="blur"
        value={args.shadow.blur}
        onChange={(blur) => args.patchShadow({ blur })}
      />
    </>
  );
}

function RichShapeReflectionControls(props: RichShapeControlsProps) {
  const reflection = props.shape.effects.reflection;
  const patchReflection = (patch: Partial<typeof reflection>) =>
    props.applyRichShapePatch({ effects: { reflection: patch } });
  const opacity = reflection.enabled ? reflection.opacity : 0;

  return (
    <CollapsibleSection
      label={translate('editor.compact.richShapeReflection')}
      defaultOpen={false}
      value={`${Math.round(opacity * 100)}%`}
    >
      <div className="space-y-3">
        <PercentRangeField
          label={translate('editor.compact.richShapeTransparency')}
          value={opacity}
          onChange={(nextOpacity) =>
            patchReflection({ enabled: nextOpacity > 0, opacity: nextOpacity })
          }
        />
        <RangeField
          label={translate('editor.compact.richShapeDistance')}
          value={reflection.distance}
          min={0}
          max={64}
          step={1}
          valueLabel={`${Math.round(reflection.distance)}px`}
          onChange={(distance) => patchReflection({ distance })}
        />
        <RangeField
          label={translate('editor.compact.richShapeBlur')}
          value={Math.round(reflection.size * 100)}
          min={0}
          max={100}
          step={1}
          valueLabel={`${Math.round(reflection.size * 100)}%`}
          onChange={(size) => patchReflection({ size: size / 100 })}
        />
      </div>
    </CollapsibleSection>
  );
}
