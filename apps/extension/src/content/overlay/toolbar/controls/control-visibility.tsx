import { useContext, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { PageToolbarControl } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { PageToolbarControlsContext } from '../state/page-controls';
import { PageToolbarSlot } from './page-layout';

/** Retains the real control beneath a non-executing customization choice. */
export function PageControlVisibility(props: {
  control: PageToolbarControl;
  label: string;
  children: ReactNode;
}) {
  const preferences = useContext(PageToolbarControlsContext);
  if (!preferences) return props.children;
  if (!preferences.isVisible(props.control)) return null;
  if (preferences.layoutActive)
    return (
      <PageToolbarSlot id={props.control} control={props.control} label={props.label}>
        {props.children}
      </PageToolbarSlot>
    );
  if (!preferences.editing) return props.children;
  const visible = preferences.controls[props.control] !== false;
  const Indicator = visible ? Eye : EyeOff;
  const overridden = preferences.isOverridden(props.control);
  const label = translate('content.toolbar.pageControlVisible').replace('{tool}', props.label);
  const description = overridden
    ? `${label}\n${translate('content.toolbar.pageControlOverride')}`
    : label;
  return (
    <div className="relative inline-flex shrink-0">
      <div
        inert
        aria-hidden="true"
        className={
          visible ? '[&_button:disabled]:opacity-100' : 'opacity-40 [&_button:disabled]:opacity-100'
        }
      >
        {props.children}
      </div>
      <ContentToolbarButton
        type="button"
        tone="property"
        aria-pressed={visible}
        aria-label={description}
        title={description}
        dataUi={`content.toolbar.visibility.${props.control}`}
        aria-disabled={preferences.pending}
        className="!absolute inset-0 !h-full !w-full"
        style={{ background: 'transparent' }}
        onClick={(event) => {
          event.stopPropagation();
          void preferences.setVisible(props.control, !visible);
        }}
      >
        <span
          className="relative inline-flex shrink-0"
          style={{
            width: 'calc(var(--sniptale-toolbar-button-size) - 2px)',
            height: 'calc(var(--sniptale-toolbar-button-size) - 2px)',
          }}
        >
          <Indicator
            size={10}
            style={{ width: 10, height: 10 }}
            className="absolute bottom-0 right-0 text-[var(--sniptale-color-text-secondary)]"
          />
          {overridden ? (
            <span
              aria-hidden="true"
              data-ui="content.toolbar.visibility-override"
              className="absolute left-0 top-0 h-1 w-1 rounded-full bg-[var(--sniptale-color-text-secondary)]"
            />
          ) : null}
        </span>
      </ContentToolbarButton>
    </div>
  );
}

/** Keeps required controls visible but non-interactive during page customization. */
export function PageProtectedControls(props: { children: ReactNode }) {
  const preferences = useContext(PageToolbarControlsContext);
  if (!preferences?.editing) return props.children;
  return (
    <fieldset disabled className="contents">
      {props.children}
    </fieldset>
  );
}
