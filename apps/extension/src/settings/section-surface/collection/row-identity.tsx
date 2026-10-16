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
            'sniptale-settings-preview flex flex-none items-center justify-center overflow-hidden border',
            item.previewVariant === 'image' ? 'h-14 w-24 rounded-[4px]' : 'h-8 w-8 rounded-[4px]',
            'border-[var(--sniptale-color-border-soft)]',
          ].join(' ')}
        >
          {item.preview}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div
          title={typeof item.title === 'string' ? item.title : undefined}
          className="truncate text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text)]"
        >
          {item.title}
        </div>
        {item.meta === undefined ? null : (
          <div
            title={typeof item.meta === 'string' ? item.meta : undefined}
            className="truncate text-[12px] leading-4 text-[var(--sniptale-color-text-dim)]"
          >
            {item.meta}
          </div>
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
        <span
          className={`rounded-[4px] px-2 py-0.5 text-[12px] leading-4 ${badgeToneClassNames.neutral}`}
        >
          {translate('settings.collection.builtInBadge')}
        </span>
      ) : null}
      {item.badges?.map((badge) => (
        <span
          key={badge.id}
          className={`rounded-[4px] px-2 py-0.5 text-[12px] leading-4 ${badgeToneClassNames[badge.tone]}`}
        >
          {badge.label}
        </span>
      ))}
      {item.isDefault ? (
        <span
          className={`rounded-[4px] px-2 py-0.5 text-[12px] leading-4 ${badgeToneClassNames.success}`}
        >
          {translate('settings.collection.defaultBadge')}
        </span>
      ) : null}
    </div>
  );
}
