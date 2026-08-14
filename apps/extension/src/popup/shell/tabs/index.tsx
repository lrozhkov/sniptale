import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { translate, useAppLocale } from '../../../platform/i18n';
import type { PopupPageAccessRuntime } from '../runtime/page-access';
import type { PopupPage } from '../navigation/actions';

const popupTabs = [
  ['home', 'popup.tabs.home'],
  ['video', 'popup.tabs.video'],
  ['export', 'popup.tabs.export'],
] satisfies Array<[PopupPage, Parameters<typeof translate>[0]]>;

function PopupTabButton({
  active,
  disabled,
  label,
  onClick,
  onPreload,
  pending,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  onPreload: () => void;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={pending || undefined}
      onClick={onClick}
      onFocus={onPreload}
      onPointerDown={onPreload}
      onPointerEnter={onPreload}
      data-active={active ? 'true' : 'false'}
      className={[
        'relative min-w-0 rounded-[14px] px-3 py-2.5 text-[12px] font-medium transition-colors',
        'border border-transparent bg-transparent',
        disabled
          ? 'cursor-not-allowed text-[var(--sniptale-color-text-dim)] opacity-45'
          : active
            ? 'text-[var(--sniptale-color-text-primary-strong)]'
            : [
                'text-[var(--sniptale-color-text-secondary)]',
                'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
                'hover:text-[var(--sniptale-color-text-primary)]',
              ].join(' '),
      ].join(' ')}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none absolute bottom-1 left-4 right-4 h-[2px] rounded-full transition-colors',
          active ? 'bg-[var(--sniptale-color-accent)]' : 'bg-transparent',
        ].join(' ')}
      />
    </button>
  );
}

export function PopupTabs({
  pageAccess,
  page,
  onChange,
  onPreload = () => undefined,
  pendingPage = null,
}: {
  page: PopupPage;
  activeTabCapabilities: ActiveTabCapabilities;
  pageAccess?: PopupPageAccessRuntime;
  onChange: (page: PopupPage) => void;
  onPreload?: (page: PopupPage) => void;
  pendingPage?: PopupPage | null;
}) {
  const locale = useAppLocale();
  const pageAccessRequired =
    pageAccess?.status?.supported === true && !pageAccess.status.currentTabActive;

  return (
    <div className="mb-3">
      <div
        className={[
          'grid grid-cols-3 gap-1 overflow-hidden rounded-[18px] border p-1',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
        ].join(' ')}
      >
        {popupTabs.map(([value, labelKey]) => {
          const disabled = pageAccessRequired && value === 'export';
          return (
            <PopupTabButton
              key={value}
              active={page === value}
              disabled={disabled}
              label={translate(labelKey, locale)}
              pending={pendingPage === value}
              onPreload={() => {
                if (!disabled) onPreload(value);
              }}
              onClick={() => {
                if (!disabled) {
                  onChange(value);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
