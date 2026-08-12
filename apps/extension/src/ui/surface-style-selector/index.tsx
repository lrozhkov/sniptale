import { serializePaintToCss } from '@sniptale/foundation/paint';
import { FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';
import { translate } from '../../platform/i18n';
import { useSurfaceStyleSelectorController } from './controller';
import { SurfaceStyleManagementPanel } from './management-panel';
import { SurfaceStyleSelectionPanel } from './selection-panel';
import type { SurfaceStyleSelectorProps } from './types';

export type { SurfaceStyleSelectorActions, SurfaceStyleSelectorProps } from './types';

export function SurfaceStyleSelector(props: SurfaceStyleSelectorProps) {
  const controller = useSurfaceStyleSelectorController(props);
  const management = props.presentation !== 'selection';

  return (
    <div
      ref={controller.refs.root}
      {...{ [FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE]: 'surface-style-selector' }}
      className="min-w-0"
      data-ui="shared.ui.surface-style-selector"
    >
      <button
        ref={controller.refs.trigger}
        type="button"
        disabled={props.disabled}
        aria-expanded={controller.state.open}
        className={[
          'flex h-9 w-full items-center gap-2 rounded-[8px] border px-2 text-xs',
          'border-[var(--sniptale-color-border-soft)]',
        ].join(' ')}
        onClick={() => controller.actions.notifyOpen(!controller.state.open)}
      >
        <span
          className="h-5 w-7 rounded-[5px] border border-[var(--sniptale-color-border-soft)]"
          style={{ background: serializePaintToCss(props.value.fillPaint) }}
        />
        <span className="truncate">
          {controller.state.active?.name ?? translate('content.callout.surfaceStyle.custom')}
        </span>
      </button>
      {controller.state.open ? (
        <div
          className="mt-2 grid max-w-full gap-2 rounded-[10px] border border-[var(--sniptale-color-border-soft)] p-2"
          role="dialog"
          aria-label={translate('content.callout.surfaceStyle.title')}
        >
          {management ? (
            <SurfaceStyleManagementPanel controller={controller} selector={props} />
          ) : (
            <SurfaceStyleSelectionPanel controller={controller} selector={props} />
          )}
        </div>
      ) : null}
    </div>
  );
}
