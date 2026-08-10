import { translate } from '../../../platform/i18n';
import type { SettingsCollectionItem } from './types';

const badgeToneClassNames = {
  neutral: 'bg-[var(--sniptale-color-surface-muted)] text-[var(--sniptale-color-text-muted)]',
  success: 'bg-[var(--sniptale-color-surface-success)] text-[var(--sniptale-color-text-success)]',
  warning: 'bg-[var(--sniptale-color-surface-warning)] text-[var(--sniptale-color-text-warning)]',
} as const;

export function SettingsCollectionRowIdentity({ item }: { item: SettingsCollectionItem }) {
  return (
    <>
      {item.preview === undefined ? null : (
        <span
          className={[
            'flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-lg border',
            'border-[var(--sniptale-color-border-soft)]',
          ].join(' ')}
        >
          {item.preview}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--sniptale-color-text)]">
          {item.title}
        </div>
        {item.meta === undefined ? null : (
          <div className="truncate text-xs text-[var(--sniptale-color-text-dim)]">{item.meta}</div>
        )}
      </div>
    </>
  );
}

export function SettingsCollectionRowMarkers({ item }: { item: SettingsCollectionItem }) {
  const hasBadges =
    item.isBuiltIn === true || item.isDefault === true || (item.badges?.length ?? 0) > 0;
  if (!hasBadges && item.supplement === undefined) return null;
  return (
    <div
      data-settings-collection-markers
      className="flex max-w-[42%] flex-none flex-wrap items-center justify-end gap-1.5"
    >
      {item.supplement}
      {item.isBuiltIn ? (
        <span className={`rounded-full px-2 py-0.5 text-xs ${badgeToneClassNames.neutral}`}>
          {translate('settings.collection.builtInBadge')}
        </span>
      ) : null}
      {item.badges?.map((badge) => (
        <span
          key={badge.id}
          className={`rounded-full px-2 py-0.5 text-xs ${badgeToneClassNames[badge.tone]}`}
        >
          {badge.label}
        </span>
      ))}
      {item.isDefault ? (
        <span className={`rounded-full px-2 py-0.5 text-xs ${badgeToneClassNames.success}`}>
          {translate('settings.collection.defaultBadge')}
        </span>
      ) : null}
    </div>
  );
}
