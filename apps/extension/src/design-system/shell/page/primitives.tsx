import { MoonStar, SunMedium } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppLocale } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import type { DesignSystemRegistryEntry } from '../../catalog/registry/types';
import { DesignSystemCatalogCard } from '../../catalog/card';

const ACTIVE_THEME_CHIP_CLASS =
  'border-[var(--sniptale-color-border-accent-strong)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_82%,var(--sniptale-color-surface-panel)_18%)] ' +
  'text-[var(--sniptale-color-text-primary-strong)]';

const INACTIVE_THEME_CHIP_CLASS =
  'border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_52%,transparent)] ' +
  'text-[var(--sniptale-color-text-secondary)] hover:border-[var(--sniptale-color-border-strong)]';

const HEADER_ANCHOR_CLASS =
  'rounded-full border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_74%,transparent)] ' +
  'px-2.5 py-1 text-xs font-semibold text-[var(--sniptale-color-text-secondary)] ' +
  'transition hover:border-[var(--sniptale-color-border-strong)] ' +
  'hover:text-[var(--sniptale-color-text-primary)]';

const ACTIVE_FILTER_CHIP_CLASS =
  'border-[var(--sniptale-color-border-accent-strong)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_82%,transparent)] ' +
  'text-[var(--sniptale-color-accent-emphasis)]';

const INACTIVE_FILTER_CHIP_CLASS =
  'border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_74%,transparent)] ' +
  'text-[var(--sniptale-color-text-secondary)] hover:border-[var(--sniptale-color-border-strong)]';

const EMPTY_STATE_CLASS =
  'mt-5 rounded-[16px] border border-dashed border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_84%,transparent)] ' +
  'px-4 py-8 text-center text-sm text-[var(--sniptale-color-text-secondary)]';

const STAT_CARD_CLASS =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)] p-4';

const TOOLBAR_BUTTON_ACTIVE_CLASS =
  'border-[var(--sniptale-color-border-accent-strong)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_82%,transparent)] ' +
  'text-[var(--sniptale-color-text-primary-strong)]';

const TOOLBAR_BUTTON_INACTIVE_CLASS =
  'border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_88%,transparent)] ' +
  'text-[var(--sniptale-color-text-secondary)] hover:border-[var(--sniptale-color-border-strong)]';

export function DesignSystemThemeChips(props: {
  previewTheme: 'light' | 'dark';
  setPreviewTheme: (theme: 'light' | 'dark') => void;
}) {
  return (
    <>
      <ThemeChip
        theme="light"
        label={translate('designSystem.page.lightPreview')}
        icon={<SunMedium className="h-4 w-4" />}
        active={props.previewTheme === 'light'}
        onClick={() => props.setPreviewTheme('light')}
      />
      <ThemeChip
        theme="dark"
        label={translate('designSystem.page.darkPreview')}
        icon={<MoonStar className="h-4 w-4" />}
        active={props.previewTheme === 'dark'}
        onClick={() => props.setPreviewTheme('dark')}
      />
    </>
  );
}

export function HeaderAnchor(props: { href: string; label: string }) {
  return (
    <a href={props.href} className={HEADER_ANCHOR_CLASS}>
      {props.label}
    </a>
  );
}

export function FilterChip(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        'rounded-full border px-2.5 py-1 text-xs font-semibold transition',
        props.active ? ACTIVE_FILTER_CHIP_CLASS : INACTIVE_FILTER_CHIP_CLASS,
      ].join(' ')}
    >
      {props.label}
    </button>
  );
}

export function CatalogSectionState(props: {
  entries: DesignSystemRegistryEntry[];
  locale: AppLocale;
  previewMap: Map<string, ReactNode>;
  renderEntry?: (entry: DesignSystemRegistryEntry) => ReactNode;
}) {
  if (props.entries.length === 0) {
    return (
      <div className={EMPTY_STATE_CLASS}>
        {translate('designSystem.page.emptyFilterState', props.locale)}
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-5">
      {props.entries.map((entry) =>
        props.renderEntry ? (
          props.renderEntry(entry)
        ) : (
          <DesignSystemCatalogCard
            key={entry.componentId}
            entry={entry}
            locale={props.locale}
            previewMap={props.previewMap}
          />
        )
      )}
    </div>
  );
}

export function StatCard(props: { label: string; value: string }) {
  return (
    <div className={STAT_CARD_CLASS}>
      <div className="text-2xl font-semibold text-[var(--sniptale-color-text-primary-strong)]">
        {props.value}
      </div>
      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--sniptale-color-text-muted-strong)]">
        {props.label}
      </div>
    </div>
  );
}

function ThemeChip(props: {
  theme: 'light' | 'dark';
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-ui={`design-system.theme-preview.${props.theme}`}
      onClick={props.onClick}
      className={[
        'inline-flex h-10 items-center gap-2 rounded-[12px] border px-3.5 text-sm font-medium transition-colors',
        props.active ? ACTIVE_THEME_CHIP_CLASS : INACTIVE_THEME_CHIP_CLASS,
      ].join(' ')}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

export function ToolbarButton(props: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={[
        'inline-flex h-10 items-center rounded-[12px] border px-3 text-sm font-medium transition-colors',
        props.active ? TOOLBAR_BUTTON_ACTIVE_CLASS : TOOLBAR_BUTTON_INACTIVE_CLASS,
        props.disabled ? 'cursor-not-allowed opacity-50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.label}
    </button>
  );
}

export function ResultBadge(props: { label: string; value: number }) {
  return (
    <div
      className={
        'rounded-[14px] border border-[var(--sniptale-color-border-soft)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)] px-3 py-2'
      }
    >
      <div className="text-lg font-semibold text-[var(--sniptale-color-text-primary-strong)]">
        {props.value}
      </div>
      <div
        className={[
          'text-[11px] font-semibold uppercase tracking-[0.14em]',
          'text-[var(--sniptale-color-text-muted-strong)]',
        ].join(' ')}
      >
        {props.label}
      </div>
    </div>
  );
}
