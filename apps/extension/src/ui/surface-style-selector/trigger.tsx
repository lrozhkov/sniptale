import { serializePaintToCss } from '@sniptale/foundation/paint';
import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { ChevronDown } from 'lucide-react';
import type { RefObject } from 'react';
import { projectCanonicalSurfaceCss } from '../../features/highlighter/surface-style/surface-css';
import { translate } from '../../platform/i18n';
import {
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_CLASS_NAME,
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_SURFACE_CLASS_NAME,
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_VISIBLE_CLASS_NAME,
  resolveCompactInspectorInteractiveControlStyle,
} from '../compact-inspector-controls/interactive-control-style';

const PREVIEW_FRAME_CLASS_NAME = [
  'rounded-[8px] border bg-white p-[2px] shadow-sm',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_85%,transparent)]',
].join(' ');

export function SurfaceStyleTrigger(props: {
  activeName: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  disabled: boolean | undefined;
  onClick: () => void;
  open: boolean;
  value: SurfaceStyle;
}) {
  const title = translate('content.callout.surfaceStyle.title');
  return (
    <button
      ref={props.buttonRef}
      type="button"
      disabled={props.disabled}
      aria-label={title}
      aria-expanded={props.open}
      className={[
        'flex w-full min-w-0 items-center gap-2 px-2 text-left',
        COMPACT_INSPECTOR_INTERACTIVE_CONTROL_CLASS_NAME,
        COMPACT_INSPECTOR_INTERACTIVE_CONTROL_SURFACE_CLASS_NAME,
        props.open ? COMPACT_INSPECTOR_INTERACTIVE_CONTROL_VISIBLE_CLASS_NAME : '',
        'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55',
      ].join(' ')}
      style={resolveCompactInspectorInteractiveControlStyle(undefined)}
      onClick={props.onClick}
      data-ui="shared.ui.surface-style-selector.trigger"
    >
      <span
        className={PREVIEW_FRAME_CLASS_NAME}
        style={{
          backgroundImage: 'conic-gradient(#d1d5db 25%, #fff 0 50%, #d1d5db 0 75%, #fff 0)',
          backgroundSize: '8px 8px',
        }}
      >
        <span
          aria-hidden="true"
          className="block h-5 w-7 rounded-[5px]"
          data-ui="shared.ui.surface-style-selector.preview"
          style={{
            background: serializePaintToCss(props.value.fillPaint),
            ...(projectCanonicalSurfaceCss(props.value.surfaceCss) ?? {}),
          }}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--sniptale-color-text-primary)]">
        {props.activeName}
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
