import { ShieldCheck } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { settingsPanelClassName } from '../../../section-surface';
import { SettingsSwitch } from '../../../section-surface/panel-controls';
import type { useWebSnapshotsController } from './controller';

type WebSnapshotsState = ReturnType<typeof useWebSnapshotsController>;

function ToggleRow(props: {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  onToggle: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-5 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 max-w-[680px]">
        <div className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
          {props.label}
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
          {props.description}
        </p>
      </div>
      <SettingsSwitch
        aria-label={props.label}
        aria-busy={props.pending === true}
        checked={props.checked}
        disabled={props.disabled || props.pending}
        onClick={props.onToggle}
      />
    </div>
  );
}

export function WebSnapshotsContent({ state }: { state: WebSnapshotsState }) {
  const resourcesDisabled = !state.webSnapshotEnabled || state.pendingSetting !== null;
  return (
    <div className="space-y-5" data-ui="settings.web-snapshots">
      <section className={settingsPanelClassName}>
        <ToggleRow
          checked={state.webSnapshotEnabled}
          disabled={state.pendingSetting !== null}
          description={translate('settings.webSnapshots.enableDescription', state.locale)}
          label={translate('settings.webSnapshots.enableLabel', state.locale)}
          onToggle={() => void state.updateWebSnapshotEnabled(!state.webSnapshotEnabled)}
          pending={state.pendingSetting === 'webSnapshotEnabled'}
        />
      </section>

      <section className={[settingsPanelClassName, 'space-y-4'].join(' ')}>
        <div>
          <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('settings.webSnapshots.aboutTitle', state.locale)}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.webSnapshots.aboutDescription', state.locale)}
          </p>
        </div>
        <div className="flex gap-3 rounded-xl bg-[var(--sniptale-color-warning-soft)] p-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          <div>
            <div className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
              {translate('settings.webSnapshots.privacyTitle', state.locale)}
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
              {translate('settings.webSnapshots.privacyDescription', state.locale)}
            </p>
          </div>
        </div>
      </section>

      <section className={settingsPanelClassName}>
        <div className="pb-3">
          <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('settings.webSnapshots.resourcesTitle', state.locale)}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.webSnapshots.resourcesDescription', state.locale)}
          </p>
          {!state.webSnapshotEnabled ? (
            <p className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('settings.webSnapshots.disabledHint', state.locale)}
            </p>
          ) : null}
        </div>
        <div className="divide-y divide-[var(--sniptale-color-border-subtle)]">
          <ToggleRow
            checked={state.authenticatedSnapshotAssetsEnabled}
            description={translate('settings.webSnapshots.currentSiteDescription', state.locale)}
            disabled={resourcesDisabled}
            label={translate('settings.webSnapshots.currentSiteLabel', state.locale)}
            onToggle={() =>
              void state.updateAuthenticatedSnapshotAssetsEnabled(
                !state.authenticatedSnapshotAssetsEnabled
              )
            }
            pending={state.pendingSetting === 'authenticatedSnapshotAssetsEnabled'}
          />
          <ToggleRow
            checked={state.anonymousCrossOriginSnapshotAssetsEnabled}
            description={translate('settings.webSnapshots.externalDescription', state.locale)}
            disabled={resourcesDisabled}
            label={translate('settings.webSnapshots.externalLabel', state.locale)}
            onToggle={() =>
              void state.updateAnonymousCrossOriginSnapshotAssetsEnabled(
                !state.anonymousCrossOriginSnapshotAssetsEnabled
              )
            }
            pending={state.pendingSetting === 'anonymousCrossOriginSnapshotAssetsEnabled'}
          />
        </div>
      </section>

      {state.saveFailed ? (
        <p className="text-sm text-[var(--sniptale-color-danger)]" role="alert">
          {translate('settings.webSnapshots.saveError', state.locale)}
        </p>
      ) : null}
    </div>
  );
}
