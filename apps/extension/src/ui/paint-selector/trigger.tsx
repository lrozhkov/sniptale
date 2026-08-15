import type { RefObject } from 'react';
import { serializePaintToCss, type GradientType, type Paint } from '@sniptale/foundation/paint';
import { ChevronDown } from 'lucide-react';
import { translate } from '../../platform/i18n';
import {
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_CLASS_NAME,
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_SURFACE_CLASS_NAME,
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_VISIBLE_CLASS_NAME,
  resolveCompactInspectorInteractiveControlStyle,
} from '../compact-inspector-controls/interactive-control-style';

const TRIGGER_CLASS_NAME = [
  'flex w-full min-w-0 items-center gap-2.5 px-2 text-left',
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_CLASS_NAME,
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_SURFACE_CLASS_NAME,
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55',
].join(' ');

function gradientTypeLabel(type: GradientType): string {
  if (type === 'radial') return translate('highlighter.paintPicker.radial');
  if (type === 'conic') return translate('highlighter.paintPicker.conic');
  return translate('highlighter.paintPicker.linear');
}

export function PaintSelectorTrigger(props: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  disabled: boolean | undefined;
  draft: Paint;
  label: string;
  onClick: () => void;
  open: boolean;
}) {
  const stopCount = translate('highlighter.paintPicker.stops');
  const summary =
    props.draft.kind === 'solid'
      ? props.draft.color.toUpperCase()
      : `${gradientTypeLabel(props.draft.gradient.type)} · ${props.draft.gradient.stops.length} ${stopCount}`;
  const previewImage =
    props.draft.kind === 'solid'
      ? `linear-gradient(${props.draft.color}, ${props.draft.color})`
      : serializePaintToCss(props.draft);
  return (
    <button
      ref={props.buttonRef}
      type="button"
      disabled={props.disabled}
      aria-label={props.label}
      aria-expanded={props.open}
      className={[
        TRIGGER_CLASS_NAME,
        props.open ? COMPACT_INSPECTOR_INTERACTIVE_CONTROL_VISIBLE_CLASS_NAME : '',
      ].join(' ')}
      style={resolveCompactInspectorInteractiveControlStyle(undefined)}
      onClick={props.onClick}
      data-ui="shared.ui.paint-selector.trigger"
    >
      <span
        className={[
          'rounded-[8px] border bg-white p-[2px] shadow-sm',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_85%,transparent)]',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className="block h-6 w-8 rounded-[5px]"
          data-ui="shared.ui.paint-selector.preview"
          style={{
            backgroundColor: '#fff',
            backgroundImage: [
              previewImage,
              'conic-gradient(#d1d5db 25%, #fff 0 50%, #d1d5db 0 75%, #fff 0)',
            ].join(', '),
            backgroundSize: '100% 100%, 8px 8px',
          }}
        />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[10px] font-medium text-[var(--sniptale-color-text-muted)]">
          {props.label}
        </span>
        <span
          className={[
            'mt-0.5 block truncate text-xs font-semibold',
            'text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
        >
          {summary}
        </span>
      </span>
      <ChevronDown
        aria-hidden="true"
        size={15}
        strokeWidth={2.2}
        className={[
          'shrink-0 text-[var(--sniptale-color-text-muted-strong)] opacity-75 transition-transform',
          props.open ? 'rotate-180' : '',
        ].join(' ')}
      />
    </button>
  );
}
