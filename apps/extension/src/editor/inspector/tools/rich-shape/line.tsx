import { translate } from '../../../../platform/i18n';
import { ColorField } from '../../../chrome/ui';
import { buildShapeColorControlProps } from '../brush-shape-sections/shared';
import { CollapsibleSection, PercentRangeField, RangeField, SelectField } from './fields';
import {
  RICH_SHAPE_ARROWHEAD_OPTIONS,
  RICH_SHAPE_CAP_OPTIONS,
  RICH_SHAPE_DASH_OPTIONS,
  RICH_SHAPE_JOIN_OPTIONS,
} from './options';
import { RichShapeLineRoughControls } from './rough';
import type { RichShapeControlsProps } from './types';

export function RichShapeLineSection(props: RichShapeControlsProps & { compact?: boolean }) {
  const body = <RichShapeLineBody {...props} />;

  if (props.compact) {
    return body;
  }

  return (
    <CollapsibleSection label={translate('editor.compact.richShapeLine')}>
      {body}
    </CollapsibleSection>
  );
}

function RichShapeLineBody(props: RichShapeControlsProps) {
  return (
    <div className="space-y-3">
      <RichShapeLineColorField {...props} />
      <RichShapeLineWidthField {...props} />
      <RichShapeLineTransparencyField {...props} />
      <RichShapeLineStyleField {...props} />
      <RichShapeLineRoughControls {...props} />
      <RichShapeLineEndingFields {...props} />
      <RichShapeLineArrowheadFields {...props} />
    </div>
  );
}

function patchRichShapeLine(
  props: RichShapeControlsProps,
  patch: Partial<RichShapeControlsProps['shape']['style']['line']>
) {
  props.applyRichShapePatch({ style: { line: patch } });
}

function RichShapeLineColorField(props: RichShapeControlsProps) {
  const line = props.shape.style.line;
  const updateLineColor = (color: string) =>
    props.updateColor((next: string) => patchRichShapeLine(props, { color: next }), color);
  const label = translate('editor.compact.strokeColor');

  return (
    <ColorField
      title={label}
      label={label}
      {...buildShapeColorControlProps(
        line.color,
        props.recentColors,
        updateLineColor,
        updateLineColor,
        props.shapeStrokePalette
      )}
    />
  );
}

function RichShapeLineWidthField(props: RichShapeControlsProps) {
  const line = props.shape.style.line;

  return (
    <RangeField
      label={translate('editor.compact.strokeWidth')}
      value={line.width}
      min={0}
      max={32}
      step={1}
      valueLabel={`${Math.round(line.width)}px`}
      onChange={(width) => patchRichShapeLine(props, { width })}
    />
  );
}

function RichShapeLineTransparencyField(props: RichShapeControlsProps) {
  return (
    <PercentRangeField
      label={translate('editor.compact.richShapeTransparency')}
      value={props.shape.style.line.transparency}
      onChange={(transparency) => patchRichShapeLine(props, { transparency })}
    />
  );
}

function RichShapeLineStyleField(props: RichShapeControlsProps) {
  return (
    <SelectField
      label={translate('highlighter.editor.styleLabel')}
      value={props.shape.style.line.dashStyle}
      options={RICH_SHAPE_DASH_OPTIONS}
      onChange={(dashStyle) => patchRichShapeLine(props, { dashStyle })}
    />
  );
}

function RichShapeLineEndingFields(props: RichShapeControlsProps) {
  const line = props.shape.style.line;
  const supportsLineEnding =
    props.shape.shapeFamily === 'line' || props.shape.shapeFamily === 'connector';
  if (!supportsLineEnding) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <SelectField
        label={translate('editor.compact.richShapeLineCap')}
        value={line.cap}
        options={RICH_SHAPE_CAP_OPTIONS}
        onChange={(cap) => patchRichShapeLine(props, { cap })}
      />
      <SelectField
        label={translate('editor.compact.richShapeLineJoin')}
        value={line.join}
        options={RICH_SHAPE_JOIN_OPTIONS}
        onChange={(join) => patchRichShapeLine(props, { join })}
      />
    </div>
  );
}

function RichShapeLineArrowheadFields(props: RichShapeControlsProps) {
  const line = props.shape.style.line;
  if (!props.capabilities.includes('connectors')) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <SelectField
        label={translate('editor.compact.richShapeBeginArrowhead')}
        value={line.beginArrowhead}
        options={RICH_SHAPE_ARROWHEAD_OPTIONS}
        onChange={(beginArrowhead) => patchRichShapeLine(props, { beginArrowhead })}
      />
      <SelectField
        label={translate('editor.compact.richShapeEndArrowhead')}
        value={line.endArrowhead}
        options={RICH_SHAPE_ARROWHEAD_OPTIONS}
        onChange={(endArrowhead) => patchRichShapeLine(props, { endArrowhead })}
      />
    </div>
  );
}
