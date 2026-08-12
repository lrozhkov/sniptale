import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import type { LocalStorageDestination, LocalStoragePolicy } from '../../../../contracts/settings';
import { LOCAL_STORAGE_RETENTION_DAY_OPTIONS } from '../../../../composition/persistence/library-lifecycle';
import { formatBytes } from '../../../../platform/i18n/format-bytes';
import { translate } from '../../../../platform/i18n';
import { openGalleryPage, openSettingsPage } from '../../../../platform/navigation/extension-pages';
import { SettingsSwitch } from '../../../section-surface/panel-controls';
import {
  SettingsControlRow,
  settingsCompactWorkbenchClassName,
  settingsMetaLabelClassName,
} from '../../../section-surface';
import type { StorageUsageState } from './use-storage-drafts-state';

const destinationOptions = [
  {
    value: 'temporary' as const,
    label: translate('settings.storageDrafts.destinationTemporary'),
  },
  { value: 'library' as const, label: translate('settings.storageDrafts.destinationLibrary') },
];

const retentionOptions = LOCAL_STORAGE_RETENTION_DAY_OPTIONS.map((days) => ({
  value: String(days),
  label: `${days} ${translate('settings.storageDrafts.daySuffix')}`,
}));

const sectionClassName = 'space-y-1';

type StorageDraftsContentProps = {
  busy: boolean;
  onDeleteAllRequest(): void;
  policy: LocalStoragePolicy;
  runCleanup(includeUnexpired: boolean): Promise<void>;
  updatePolicy(patch: Partial<LocalStoragePolicy>): Promise<void>;
  usage: StorageUsageState | null;
  view: 'settings' | 'storage';
};

export function StorageDraftsContent(props: StorageDraftsContentProps) {
  if (props.view === 'storage') {
    return (
      <div className={settingsCompactWorkbenchClassName}>
        <StorageUsageSection {...props} />
      </div>
    );
  }
  return (
    <div className={`${settingsCompactWorkbenchClassName} space-y-6`}>
      <NewItemsSection {...props} />
      <RetentionSection {...props} />
    </div>
  );
}

function SectionLabel(props: { children: string }) {
  return <h2 className={settingsMetaLabelClassName}>{props.children}</h2>;
}

function NewItemsSection(
  props: Pick<StorageDraftsContentProps, 'busy' | 'policy' | 'updatePolicy'>
) {
  const label = translate('settings.storageDrafts.destinationLabel');
  return (
    <section className={sectionClassName}>
      <SectionLabel>{translate('settings.storageDrafts.newItemsTitle')}</SectionLabel>
      <p className="max-w-[720px] text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
        {translate('settings.storageDrafts.newItemsDescription')}
      </p>
      <SettingsControlRow
        label={label}
        description={translate('settings.storageDrafts.destinationDescription')}
      >
        <ProductSelect<LocalStorageDestination>
          aria-label={label}
          disabled={props.busy}
          value={props.policy.defaultDestination}
          options={destinationOptions}
          onChange={(value) => props.updatePolicy({ defaultDestination: value })}
        />
      </SettingsControlRow>
    </section>
  );
}

function RetentionSection(
  props: Pick<StorageDraftsContentProps, 'busy' | 'policy' | 'updatePolicy'>
) {
  return (
    <section className={sectionClassName}>
      <SectionLabel>{translate('settings.storageDrafts.cleanupTitle')}</SectionLabel>
      <SettingsControlRow
        label={translate('settings.storageDrafts.cleanupEnabled')}
        description={translate('settings.storageDrafts.cleanupEnabledDescription')}
        valueClassName="flex justify-start sm:justify-end"
      >
        <SettingsSwitch
          aria-label={translate('settings.storageDrafts.cleanupEnabled')}
          checked={props.policy.cleanupEnabled}
          disabled={props.busy}
          onClick={() => props.updatePolicy({ cleanupEnabled: !props.policy.cleanupEnabled })}
        />
      </SettingsControlRow>
      {!props.policy.cleanupEnabled ? (
        <p role="status" className="pb-2 text-xs text-[var(--sniptale-color-warning)]">
          {translate('settings.storageDrafts.cleanupDisabledWarning')}
        </p>
      ) : null}
      <div className="space-y-1">
        <RetentionRow
          disabled={props.busy || !props.policy.cleanupEnabled}
          label={translate('settings.storageDrafts.ordinaryRetention')}
          value={props.policy.draftRetentionDays}
          onChange={(value) => props.updatePolicy({ draftRetentionDays: value })}
        />
        <RetentionRow
          disabled={props.busy || !props.policy.cleanupEnabled}
          label={translate('settings.storageDrafts.videoRetention')}
          value={props.policy.videoDraftRetentionDays}
          onChange={(value) => props.updatePolicy({ videoDraftRetentionDays: value })}
        />
      </div>
    </section>
  );
}

function RetentionRow(props: {
  disabled: boolean;
  label: string;
  onChange(value: number): Promise<void>;
  value: number;
}) {
  return (
    <SettingsControlRow label={props.label}>
      <ProductSelect<string>
        aria-label={props.label}
        disabled={props.disabled}
        value={String(props.value)}
        options={retentionOptions}
        onChange={(value) => props.onChange(Number(value))}
      />
    </SettingsControlRow>
  );
}

function StorageUsageSection(
  props: Pick<StorageDraftsContentProps, 'busy' | 'onDeleteAllRequest' | 'runCleanup' | 'usage'>
) {
  return (
    <section className={sectionClassName}>
      <SectionLabel>{translate('settings.storageDrafts.usageTitle')}</SectionLabel>
      <div className="mt-3">
        {props.usage ? (
          <UsageGrid usage={props.usage} />
        ) : (
          <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.storageDrafts.loading')}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={getControlSecondaryButtonClassName({ density: 'compact' })}
          onClick={() => void openGalleryPage({ scope: 'temporary' })}
        >
          {translate('settings.storageDrafts.openDrafts')}
        </button>
        <button
          type="button"
          className={getControlSecondaryButtonClassName({ density: 'compact' })}
          disabled={props.busy}
          onClick={() => void props.runCleanup(false)}
        >
          {translate('settings.storageDrafts.deleteExpired')}
        </button>
        <button
          type="button"
          className={getControlSecondaryButtonClassName({
            density: 'compact',
            tone: 'danger',
          })}
          disabled={props.busy}
          onClick={props.onDeleteAllRequest}
        >
          {translate('settings.storageDrafts.deleteAll')}
        </button>
        <button
          type="button"
          className={getControlSecondaryButtonClassName({ density: 'compact' })}
          onClick={() =>
            void openSettingsPage({ route: { section: 'access-data', view: 'privacy' } })
          }
        >
          {translate('settings.storageDrafts.privacyLink')}
        </button>
      </div>
    </section>
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
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className={settingsMetaLabelClassName}>{label}</dt>
          <dd className="mt-1 text-base font-semibold">{formatBytes(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
