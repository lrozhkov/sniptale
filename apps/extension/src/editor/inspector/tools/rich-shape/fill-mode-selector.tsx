import type { EditorRichShapeGradientFill } from '../../../../features/editor/document/rich-shape';
import { translate } from '../../../../platform/i18n';
import { SelectField } from '../../../chrome/ui';
import type { FillMode, createFillModeOptions } from './fill-mode';
import type { RichShapeControlsProps } from './types';

export function RichShapeFillModeSelector(args: {
  mode: FillMode;
  options: ReturnType<typeof createFillModeOptions>;
  props: RichShapeControlsProps;
  setMode: (mode: FillMode) => void;
  solidColor: string;
  stops: EditorRichShapeGradientFill['stops'];
}) {
  return (
    <SelectField
      label={translate('editor.compact.richShapeFillMode')}
      value={args.mode}
      onChange={(value) => applyRichShapeFillMode({ ...args, mode: value })}
      options={args.options}
    />
  );
}

function applyRichShapeFillMode(args: {
  mode: FillMode;
  props: RichShapeControlsProps;
  setMode: (mode: FillMode) => void;
  solidColor: string;
  stops: EditorRichShapeGradientFill['stops'];
}) {
  args.setMode(args.mode);
  if (args.mode === 'none') {
    args.props.applyRichShapePatch({ rough: { enabled: false }, style: { fillTransparency: 1 } });
    return;
  }
  if (args.mode === 'solid') {
    args.props.applyRichShapePatch({
      rough: { enabled: false },
      style: { fill: { type: 'solid', color: args.solidColor }, fillTransparency: 0 },
    });
    return;
  }
  if (args.mode === 'gradient') {
    args.props.applyRichShapePatch({
      rough: { enabled: false },
      style: {
        fill: { type: 'gradient', gradientType: 'linear', angle: 90, stops: args.stops },
        fillTransparency: 0,
      },
    });
    return;
  }
  args.props.applyRichShapePatch({
    rough: { enabled: true, fillColor: args.props.shape.rough.fillColor ?? args.solidColor },
    style: { fillTransparency: 0 },
  });
}
