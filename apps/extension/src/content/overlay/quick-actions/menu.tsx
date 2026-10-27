import { Icon, Zap } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../platform/i18n';
import { getQuickActionReactIconNode } from '../../../features/quick-actions-presets/icons';
import { getQuickActionDisplayName } from '../../../features/quick-actions-presets/catalog';
import { ToolbarMenuDropdown } from '../toolbar/menu/dropdown';
import type { ToolbarMenuState } from '../toolbar/state/menu';
import { usePageQuickActionsMenu } from './controller';

export function PageQuickActionsMenu(props: {
  toolbarMenuState?: ToolbarMenuState;
  displayMode?: 'horizontal' | 'vertical';
  compact?: boolean;
}) {
  const { title, triggerRef, menuRef, open, busy, side, dropdown, actions, trigger, toggle } =
    usePageQuickActionsMenu(props);
  return (
    <div className="relative" data-ui="content.quick-actions">
      <ContentToolbarButton
        ref={triggerRef}
        type="button"
        tone="property"
        size={props.compact ? 'compact' : 'default'}
        dataUi="content.quick-actions.trigger"
        title={title}
        aria-label={title}
        menuIndicator
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        data-menu-side={side}
        onClick={(event) => {
          event.stopPropagation();
          toggle(event.detail === 0);
        }}
      >
        <Zap size={18} />
      </ContentToolbarButton>
      {open && dropdown.style ? (
        <ToolbarMenuDropdown dataUi="content.quick-actions.dropdown" menuRef={menuRef}>
          <ProductToolbarMenu
            className="sniptale-content-menu-adopted"
            compact
            title={title}
            placement={dropdown.placement}
            style={{
              ...dropdown.style,
              width: 280,
              minWidth: 0,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: dropdown.style.maxHeight ?? 'calc(100vh - 16px)',
              overflowY: 'auto',
            }}
          >
            {actions.length === 0 ? (
              <ProductToolbarMenuItem disabled>
                <ProductToolbarMenuItemCopy label={translate('content.pageLauncher.empty')} />
              </ProductToolbarMenuItem>
            ) : null}
            {actions.map((action, index) => (
              <ProductToolbarMenuItem
                key={action.id}
                onClick={(event) => {
                  void trigger(action, event.nativeEvent);
                }}
              >
                <Icon
                  iconNode={getQuickActionReactIconNode(action.icon)}
                  size={18}
                  aria-hidden="true"
                />
                <ProductToolbarMenuItemCopy label={getQuickActionDisplayName(action)} />
                {index < 10 ? (
                  <kbd className="sniptale-toolbar-menu-shortcut">
                    {index === 9 ? '0' : index + 1}
                  </kbd>
                ) : null}
              </ProductToolbarMenuItem>
            ))}
          </ProductToolbarMenu>
        </ToolbarMenuDropdown>
      ) : null}
    </div>
  );
}
