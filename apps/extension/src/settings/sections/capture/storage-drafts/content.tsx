import type { ReactNode } from 'react';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { LocalStorageDestination, LocalStoragePolicy } from '../../../../contracts/settings';
import {
  DEFAULT_LOCAL_STORAGE_POLICY,
  LOCAL_STORAGE_RETENTION_DAY_OPTIONS,
} from '../../../../composition/persistence/library-lifecycle';
import { formatBytes } from '../../../../platform/i18n/format-bytes';
import { translate } from '../../../../platform/i18n';
import { openGalleryPage, openSettingsPage } from '../../../../platform/navigation/extension-pages';
import {
  settingsAddButtonClassName,
  settingsCardClassName,
  SettingsSwitch,
} from '../../../section-surface/panel-controls';
import { settingsMetaLabelClassName } from '../../../section-surface';
import type { StorageUsageState } from './use-storage-drafts-state';

const destinationOptions = [
  { value: 'temporary' as const, label: translate('settings.storageDrafts.destinationTemporary') },
  { value: 'library' as const, label: translate('settings.storageDrafts.destinationLibrary') },
];

const retentionOptions = LOCAL_STORAGE_RETENTION_DAY_OPTIONS.map((days) => ({
  value: String(days),
  label: `${days} ${translate('settings.storageDrafts.daySuffix')}`,
}));

export function StorageDraftsContent(props: {
  busy: boolean;
  policy: LocalStoragePolicy;
  runCleanup: (includeUnexpired: boolean) => Promise<void>;
  updatePolicy: (patch: Partial<LocalStoragePolicy>) => Promise<void>;
  usage: StorageUsageState | null;
}) {
  return (
    <>
      <NewItemsPanel {...props} />
      <RetentionPanel {...props} />
      <StorageUsagePanel {...props} />
    </>
  );
}

function NewItemsPanel(
  props: Pick<Parameters<typeof StorageDraftsContent>[0], 'busy' | 'policy' | 'updatePolicy'>
) {
  return (
    <SettingsPanel title={translate('settings.storageDrafts.newItemsTitle')}>
      <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.storageDrafts.newItemsDescription')}
      </p>
      <SettingsField label={translate('settings.storageDrafts.destinationLabel')}>
        <ProductSelect<LocalStorageDestination>
          disabled={props.busy}
          value={props.policy.defaultDestination}
          options={destinationOptions}
          onChange={(value) => props.updatePolicy({ defaultDestination: value })}
        />
      </SettingsField>
    </SettingsPanel>
  );
}

function RetentionPanel(
  props: Pick<Parameters<typeof StorageDraftsContent>[0], 'busy' | 'policy' | 'updatePolicy'>
) {
  return (
    <SettingsPanel title={translate('settings.storageDrafts.cleanupTitle')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {translate('settings.storageDrafts.cleanupEnabled')}
          </p>
          <p className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
            {translate('settings.storageDrafts.cleanupEnabledDescription')}
          </p>
        </div>
        <SettingsSwitch
          checked={props.policy.cleanupEnabled}
          disabled={props.busy}
          onClick={() => props.updatePolicy({ cleanupEnabled: !props.policy.cleanupEnabled })}
        />
      </div>
      {!props.policy.cleanupEnabled ? (
        <p role="status" className="text-sm text-[var(--sniptale-color-warning)]">
          {translate('settings.storageDrafts.cleanupDisabledWarning')}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <RetentionField
          disabled={props.busy || !props.policy.cleanupEnabled}
          label={translate('settings.storageDrafts.ordinaryRetention')}
          value={props.policy.draftRetentionDays}
          onChange={(value) => props.updatePolicy({ draftRetentionDays: value })}
        />
        <RetentionField
          disabled={props.busy || !props.policy.cleanupEnabled}
          label={translate('settings.storageDrafts.videoRetention')}
          value={props.policy.videoDraftRetentionDays}
          onChange={(value) => props.updatePolicy({ videoDraftRetentionDays: value })}
        />
      </div>
    </SettingsPanel>
  );
}

function StorageUsagePanel(
  props: Pick<
    Parameters<typeof StorageDraftsContent>[0],
    'busy' | 'runCleanup' | 'updatePolicy' | 'usage'
  >
) {
  return (
    <SettingsPanel title={translate('settings.storageDrafts.usageTitle')}>
      {props.usage ? (
        <UsageGrid usage={props.usage} />
      ) : (
        <p>{translate('settings.storageDrafts.loading')}</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className={settingsAddButtonClassName}
          onClick={() => void openGalleryPage({ scope: 'temporary' })}
        >
          {translate('settings.storageDrafts.openDrafts')}
        </button>
        <button
          className={settingsAddButtonClassName}
          disabled={props.busy}
          onClick={() => props.runCleanup(false)}
        >
          {translate('settings.storageDrafts.deleteExpired')}
        </button>
        <button
          className={settingsAddButtonClassName}
          disabled={props.busy}
          onClick={() => {
            if (window.confirm(translate('settings.storageDrafts.deleteAllConfirm')))
              void props.runCleanup(true);
          }}
        >
          {translate('settings.storageDrafts.deleteAll')}
        </button>
        <button
          className={settingsAddButtonClassName}
          onClick={() =>
            void openSettingsPage({ route: { section: 'access-data', view: 'privacy' } })
          }
        >
          {translate('settings.storageDrafts.privacyLink')}
        </button>
      </div>
      <button
        className={settingsAddButtonClassName}
        disabled={props.busy}
        onClick={() => props.updatePolicy(DEFAULT_LOCAL_STORAGE_POLICY)}
      >
        {translate('settings.storageDrafts.resetDefaults')}
      </button>
    </SettingsPanel>
  );
}

function SettingsPanel(props: { children: ReactNode; title: string }) {
  return (
    <div className={`${settingsCardClassName} space-y-4`}>
      <h2 className="text-lg font-semibold text-[var(--sniptale-color-text-primary)]">
        {props.title}
      </h2>
      {props.children}
    </div>
  );
}

function SettingsField(props: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-2">
      <span className={settingsMetaLabelClassName}>{props.label}</span>
      {props.children}
    </label>
  );
}

function RetentionField(props: {
  disabled: boolean;
  label: string;
  onChange: (value: number) => Promise<void>;
  value: number;
}) {
  return (
    <SettingsField label={props.label}>
      <ProductSelect<string>
        disabled={props.disabled}
        value={String(props.value)}
        options={retentionOptions}
        onChange={(value) => props.onChange(Number(value))}
      />
    </SettingsField>
  );
}

function UsageGrid({ usage }: { usage: StorageUsageState }) {
  const rows = [
    [translate('settings.storageDrafts.totalUsage'), usage.total],
    [translate('settings.storageDrafts.libraryUsage'), usage.library],
    [translate('settings.storageDrafts.draftsUsage'), usage.drafts],
    [translate('settings.storageDrafts.availableUsage'), usage.available],
  ] as const;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-[var(--sniptale-color-border-soft)] p-3"
        >
          <dt className={settingsMetaLabelClassName}>{label}</dt>
          <dd className="mt-1 text-lg font-semibold">{formatBytes(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
