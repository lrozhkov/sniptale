import { useContext } from 'react';
import { Check, Eye, RefreshCw } from 'lucide-react';
import { Icon } from '@iconify/react';
import eyeCogIcon from '@iconify-icons/tabler/eye-cog';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { PopoverCheckIcon } from '../../icons/icons';
import { translate } from '../../../../platform/i18n';
import { PageToolbarControlsContext } from '../state/page-controls';

export function PageToolbarCustomizationSettings(props: { onClose: () => void }) {
  const preferences = useContext(PageToolbarControlsContext);
  if (!preferences) return null;
  return (
    <>
      <ProductToolbarMenuItem
        dataUi="content.toolbar.settings.customize-buttons"
        disabled={!preferences.ready || preferences.pending}
        onClick={() => {
          props.onClose();
          preferences.toggleEditing();
        }}
      >
        <Icon icon={eyeCogIcon} className="sniptale-popover-icon" />
        <ProductToolbarMenuItemCopy label={translate('content.toolbar.pageCustomizeControls')} />
      </ProductToolbarMenuItem>
      <ProductToolbarMenuItem
        dataUi="content.toolbar.settings.show-hidden-buttons"
        selected={preferences.revealed}
        ariaPressed={preferences.revealed}
        disabled={!preferences.ready || preferences.pending}
        onClick={() => {
          preferences.toggleRevealed();
        }}
      >
        <Eye className="sniptale-popover-icon" />
        <ProductToolbarMenuItemCopy
          label={translate('content.toolbar.pageShowHidden')}
          hint={translate('content.toolbar.pageShowHiddenHint')}
        />
        {preferences.revealed ? <PopoverCheckIcon /> : null}
      </ProductToolbarMenuItem>
      {preferences.error ? (
        <ProductToolbarMenuItem
          onClick={() => void preferences.reload()}
          dataUi="content.toolbar.settings.visibility-retry"
        >
          <RefreshCw className="sniptale-popover-icon" />
          <ProductToolbarMenuItemCopy
            label={translate('common.actions.retry')}
            hint={preferences.error}
          />
        </ProductToolbarMenuItem>
      ) : null}
    </>
  );
}

export function PageToolbarCustomizationDone(props: { onCloseMenus: () => void }) {
  const preferences = useContext(PageToolbarControlsContext);
  if (!preferences?.editing) return null;
  return (
    <ContentToolbarButton
      type="button"
      tone="property"
      active
      aria-pressed="true"
      dataUi="content.toolbar.customize-done"
      title={translate('content.toolbar.recordingCustomizeDone')}
      onClick={() => {
        props.onCloseMenus();
        preferences.toggleEditing();
      }}
    >
      <Check size={18} />
    </ContentToolbarButton>
  );
}
