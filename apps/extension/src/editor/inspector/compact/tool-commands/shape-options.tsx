import type React from 'react';
import type { EditorShapeSettings } from '../../../../features/editor/document/types';
import { SegmentedRow, type CompactSelectOption } from '../../../../ui/compact-inspector-controls';
import { TablerIcon } from '../tabler-icon';

type ShapeStrokeStyle = EditorShapeSettings['strokeStyle'];
type IconOption<T extends string> = CompactSelectOption<T> & { icon: React.ReactNode };

function ShapeSolidLineGlyph() {
  return (
    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">
      <span className="block h-[2px] w-5 rounded-full bg-current" />
    </span>
  );
}

function createShapeStrokeStyleIcon(style: ShapeStrokeStyle) {
  if (style === 'dashed') {
    return <TablerIcon icon="tabler:line-dashed" />;
  }
  if (style === 'dotted') {
    return <TablerIcon icon="tabler:line-dotted" />;
  }

  return <ShapeSolidLineGlyph />;
}

export function ShapeStrokeStyleSelector(props: {
  ariaLabel: string;
  onChange: (value: ShapeStrokeStyle) => void;
  options: readonly CompactSelectOption<ShapeStrokeStyle>[];
  value: ShapeStrokeStyle;
}) {
  const options: IconOption<ShapeStrokeStyle>[] = props.options.map((option) => ({
    ...option,
    icon: createShapeStrokeStyleIcon(option.value),
  }));

  return (
    <SegmentedRow
      ariaLabel={props.ariaLabel}
      label={props.ariaLabel}
      columns={3}
      onChange={props.onChange}
      options={options}
      value={props.value}
    />
  );
}

export function ShapeStrokeStyleTrigger(props: { value: ShapeStrokeStyle }) {
  return createShapeStrokeStyleIcon(props.value);
}
