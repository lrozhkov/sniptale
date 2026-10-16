import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { SETTINGS_NAV_GROUPS, type SettingsNavItem } from './registry';
import type { SettingsTab } from '.';
import { settingsPageSidebarClassName } from '../../section-surface';

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  disabled?: boolean;
  onTabChange: (tab: SettingsTab) => void;
}

const SETTINGS_NAV_CLASS_NAME = 'flex min-h-0 flex-col overflow-hidden';

const SETTINGS_ITEM_ACTIVE_CLASS_NAME = [
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-hover)] text-[var(--sniptale-color-text-primary)]',
].join(' ');

const SETTINGS_ITEM_IDLE_CLASS_NAME = 'text-[var(--sniptale-color-text-muted-strong)]';

const SETTINGS_ITEM_IDLE_HOVER_CLASS_NAME = [
  'hover:border-[var(--sniptale-color-border-soft)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_78%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

const SETTINGS_ACTIVE_MARKER_CLASS_NAME =
  'absolute left-1 top-1/2 h-5 w-[2px] translate-x-0 -translate-y-1/2 rounded-full ' +
  'bg-[var(--sniptale-color-text-secondary)]';

function getSettingsSidebarFooterLabel() {
  const brand = translate('settings.navigation.footerBrand');

  try {
    const manifest = runtimeInfo.getManifest();
    const version = manifest.version_name || manifest.version;
    return version ? `${brand} v${version}` : brand;
  } catch {
    return brand;
  }
}

function SettingsSidebarItem(props: {
  activeTab: SettingsTab;
  disabled?: boolean;
  item: SettingsNavItem;
  onTabChange: (tab: SettingsTab) => void;
}) {
  const isActive = props.activeTab === props.item.id;
  const Icon = props.item.icon;
  return (
    <ContentToolbarButton
      tone="property"
      active={isActive}
      key={props.item.id}
      type="button"
      title={translate(props.item.label)}
      disabled={props.disabled}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => props.onTabChange(props.item.id)}
      className={`
        flex !h-auto min-h-8 !w-full cursor-pointer items-center !justify-start gap-2
        rounded-[4px] border border-transparent
        !px-3 !py-1 !whitespace-normal transition-colors
        text-left relative
        ${
          isActive
            ? SETTINGS_ITEM_ACTIVE_CLASS_NAME
            : `${SETTINGS_ITEM_IDLE_CLASS_NAME} ${SETTINGS_ITEM_IDLE_HOVER_CLASS_NAME}`
        }
      `}
    >
      {isActive && <div className={SETTINGS_ACTIVE_MARKER_CLASS_NAME} />}
      <span className="flex-none text-[var(--sniptale-color-text-secondary)]">
        <Icon size={16} />
      </span>
      <span className="min-w-0 text-[13px] leading-[18px] font-medium">
        {translate(props.item.label)}
      </span>
    </ContentToolbarButton>
  );
}

export function SettingsSidebar({ activeTab, disabled, onTabChange }: SettingsSidebarProps) {
  return (
    <nav
      data-ui="settings.sidebar"
      className={[SETTINGS_NAV_CLASS_NAME, settingsPageSidebarClassName].join(' ')}
    >
      <div
        data-ui="settings.sidebar.header"
        className="border-b border-solid border-[var(--sniptale-color-border-soft)] px-4 py-3"
      >
        <p className="text-[14px] leading-5 font-semibold text-[var(--sniptale-color-text-dim)]">
          {translate('settings.navigation.sidebarEyebrow')}
        </p>
      </div>

      <div
        data-ui="settings.sidebar.nav-list"
        className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-2"
      >
        {SETTINGS_NAV_GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`settings-nav-group-${group.id}`}>
            <h2
              id={`settings-nav-group-${group.id}`}
              className={[
                'mb-1 px-3 text-[14px] font-semibold leading-5',
                'text-[var(--sniptale-color-text-dim)]',
              ].join(' ')}
            >
              {translate(group.label)}
            </h2>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SettingsSidebarItem
                  key={item.id}
                  activeTab={activeTab}
                  {...(disabled === undefined ? {} : { disabled })}
                  item={item}
                  onTabChange={onTabChange}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div
        data-ui="settings.sidebar.footer"
        className="border-t border-solid border-[var(--sniptale-color-border-soft)] px-4 py-2.5"
      >
        <p className="text-[12px] leading-4 text-[var(--sniptale-color-text-dim)]">
          {getSettingsSidebarFooterLabel()}
        </p>
      </div>
    </nav>
  );
}
