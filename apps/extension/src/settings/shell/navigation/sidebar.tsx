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

const SETTINGS_ITEM_ACTIVE_CLASS_NAME =
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_20%,var(--sniptale-color-border-soft)_80%)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_22%,var(--sniptale-color-surface-panel)_78%)] ' +
  'text-[var(--sniptale-color-text-primary)] ' +
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_10%,transparent)]';

const SETTINGS_ITEM_IDLE_CLASS_NAME = 'text-[var(--sniptale-color-text-muted-strong)]';

const SETTINGS_ITEM_IDLE_HOVER_CLASS_NAME = [
  'hover:border-[var(--sniptale-color-border-soft)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_78%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

const SETTINGS_ACTIVE_MARKER_CLASS_NAME =
  'absolute left-1 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_84%,transparent)]';

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
    <button
      key={props.item.id}
      type="button"
      disabled={props.disabled}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => props.onTabChange(props.item.id)}
      className={`
        flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-transparent
        px-3 py-1.5 transition-colors
        text-left relative
        ${
          isActive
            ? SETTINGS_ITEM_ACTIVE_CLASS_NAME
            : `${SETTINGS_ITEM_IDLE_CLASS_NAME} ${SETTINGS_ITEM_IDLE_HOVER_CLASS_NAME}`
        }
      `}
    >
      {isActive && <div className={SETTINGS_ACTIVE_MARKER_CLASS_NAME} />}
      <span
        className={
          isActive
            ? 'text-[var(--sniptale-color-accent)]'
            : 'text-[var(--sniptale-color-text-secondary)]'
        }
      >
        <Icon size={16} />
      </span>
      <span className="text-sm font-medium tracking-[-0.01em]">{translate(props.item.label)}</span>
    </button>
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
        className="border-b border-[var(--sniptale-color-border-soft)] px-4 py-3"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--sniptale-color-text-dim)]">
          {translate('settings.navigation.sidebarEyebrow')}
        </p>
      </div>

      <div
        data-ui="settings.sidebar.nav-list"
        className={[
          'min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto p-2.5',
          'lg:overflow-y-hidden',
        ].join(' ')}
      >
        {SETTINGS_NAV_GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`settings-nav-group-${group.id}`}>
            <h2
              id={`settings-nav-group-${group.id}`}
              className={[
                'mb-0.5 px-3 text-[10px] font-semibold uppercase leading-4 tracking-[0.1em]',
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
        className="border-t border-[var(--sniptale-color-border-soft)] px-4 py-2.5"
      >
        <p className="text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
          {getSettingsSidebarFooterLabel()}
        </p>
      </div>
    </nav>
  );
}
