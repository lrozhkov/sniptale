import { FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';
import { translate } from '../../platform/i18n';
import { useSurfaceStyleSelectorController } from './controller';
import { SurfaceStyleManagementPanel } from './management-panel';
import { SurfaceStyleSelectionPanel } from './selection-panel';
import type { SurfaceStyleSelectorProps } from './types';
import { SurfaceStyleTrigger } from './trigger';

export type { SurfaceStyleSelectorActions, SurfaceStyleSelectorProps } from './types';

const FIELD_LABEL_CLASS_NAME =
  'min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--sniptale-color-text-secondary)]';
const FIELD_ROW_CLASS_NAME = 'grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2';

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
      {props.fieldLabel ? (
        <div className={FIELD_ROW_CLASS_NAME}>
          <span className={FIELD_LABEL_CLASS_NAME}>{props.fieldLabel}</span>
          <div className="min-w-0">
            <SurfaceStyleSelectorTrigger selector={props} controller={controller} />
          </div>
        </div>
      ) : (
        <SurfaceStyleSelectorTrigger selector={props} controller={controller} />
      )}
      {controller.state.open ? (
        <div
          className={[
            'mt-2 grid max-w-full gap-3 rounded-[14px] border p-3 outline-none',
            'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_58%,transparent)]',
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
            'shadow-[0_16px_36px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_16%,transparent)]',
          ].join(' ')}
          tabIndex={-1}
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

function SurfaceStyleSelectorTrigger(props: {
  controller: ReturnType<typeof useSurfaceStyleSelectorController>;
  selector: SurfaceStyleSelectorProps;
}) {
  return (
    <SurfaceStyleTrigger
      activeName={
        props.controller.state.active?.name ?? translate('content.callout.surfaceStyle.custom')
      }
      buttonRef={props.controller.refs.trigger}
      disabled={props.selector.disabled}
      onClick={() => props.controller.actions.notifyOpen(!props.controller.state.open)}
      open={props.controller.state.open}
      value={props.selector.value}
    />
  );
}
