import type React from 'react';
import type {
  EditorLineCornerStyle,
  EditorLineFillMode,
  EditorLineStyle,
} from '../../../../features/editor/document/line-types';
import {
  SegmentedRow,
  SelectField,
  type CompactSelectOption,
} from '../../../../ui/compact-inspector-controls';
import { TablerIcon } from '../tabler-icon';

type IconOption<T extends string> = CompactSelectOption<T> & { icon: React.ReactNode };

function LineStrokeGlyph(props: { style: 'dash-dot' | 'long-dash' | 'solid' }) {
  const backgroundImage =
    props.style === 'dash-dot'
      ? [
          'repeating-linear-gradient(90deg',
          'currentColor 0 8px',
          'transparent 8px 13px',
          'currentColor 13px 15px',
          'transparent 15px 20px)',
        ].join(',')
      : props.style === 'long-dash'
        ? 'repeating-linear-gradient(90deg,currentColor 0 12px,transparent 12px 18px)'
        : undefined;

  return (
    <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">
      <span
        className={`block h-[2px] w-5 rounded-full ${backgroundImage ? '' : 'bg-current'}`}
        style={backgroundImage ? { backgroundImage } : undefined}
      />
    </span>
  );
}

function createLineStyleIcon(style: EditorLineStyle) {
  if (style === 'dash') {
    return <TablerIcon icon="tabler:line-dashed" />;
  }
  if (style === 'dot') {
    return <TablerIcon icon="tabler:line-dotted" />;
  }

  return <LineStrokeGlyph style={style} />;
}

function createLineCornerIcon(corners: EditorLineCornerStyle) {
  return (
    <TablerIcon
      icon={corners === 'round' ? 'tabler:border-corner-rounded' : 'tabler:border-corner-square'}
    />
  );
}

function toIconOptions<T extends string>(
  options: readonly CompactSelectOption<T>[],
  createIcon: (value: T) => React.ReactNode
): IconOption<T>[] {
  return options.map((option) => ({ ...option, icon: createIcon(option.value) }));
}

export function LineStyleSelector(props: {
  ariaLabel: string;
  onChange: (value: EditorLineStyle) => void;
  options: readonly CompactSelectOption<EditorLineStyle>[];
  value: EditorLineStyle;
}) {
  return (
    <SelectField
      label={props.ariaLabel}
      value={props.value}
      onChange={props.onChange}
      options={toIconOptions(props.options, createLineStyleIcon)}
    />
  );
}

export function LineCornerSelector(props: {
  ariaLabel: string;
  onChange: (value: EditorLineCornerStyle) => void;
  options: readonly CompactSelectOption<EditorLineCornerStyle>[];
  value: EditorLineCornerStyle;
}) {
  return (
    <SegmentedRow
      ariaLabel={props.ariaLabel}
      label={props.ariaLabel}
      columns={2}
      onChange={props.onChange}
      options={toIconOptions(props.options, createLineCornerIcon)}
      value={props.value}
    />
  );
}

export function LineFillModeSelector(props: {
  ariaLabel: string;
  onChange: (value: EditorLineFillMode) => void;
  options: readonly CompactSelectOption<EditorLineFillMode>[];
  value: EditorLineFillMode;
}) {
  return (
    <SelectField
      label={props.ariaLabel}
      value={props.value}
      onChange={props.onChange}
      options={props.options}
    />
  );
}

export function LineStyleTrigger(props: { value: EditorLineStyle }) {
  return createLineStyleIcon(props.value);
}

export function LineCornerTrigger(props: { value: EditorLineCornerStyle }) {
  return createLineCornerIcon(props.value);
}
