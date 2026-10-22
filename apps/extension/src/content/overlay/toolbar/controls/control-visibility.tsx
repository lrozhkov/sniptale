import { useContext, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { PageToolbarControl } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { PageToolbarControlsContext } from '../state/page-controls';

/** Replaces an optional control with its visibility choice while editing the toolbar. */
export function PageControlVisibility(props: {
  control: PageToolbarControl;
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  const preferences = useContext(PageToolbarControlsContext);
  if (!preferences) return props.children;
  if (!preferences.isVisible(props.control)) return null;
  if (!preferences.editing) return props.children;
  const visible = preferences.controls[props.control] !== false;
  const Indicator = visible ? Eye : EyeOff;
  const label = translate('content.toolbar.pageControlVisible').replace('{tool}', props.label);
  return (
    <ContentToolbarButton
      type="button"
      tone="property"
      aria-pressed={visible}
      aria-label={label}
      title={label}
      dataUi={`content.toolbar.visibility.${props.control}`}
      disabled={preferences.pending}
      onClick={(event) => {
        event.stopPropagation();
        void preferences.setVisible(props.control, !visible);
      }}
    >
      <span
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 'calc(var(--sniptale-toolbar-button-size) - 2px)',
          height: 'calc(var(--sniptale-toolbar-button-size) - 2px)',
        }}
      >
        <span className={visible ? undefined : 'opacity-40'}>{props.icon}</span>
        <Indicator
          size={10}
          style={{ width: 10, height: 10 }}
          className="absolute bottom-0 right-0 text-[var(--sniptale-color-text-secondary)]"
        />
      </span>
    </ContentToolbarButton>
  );
}
