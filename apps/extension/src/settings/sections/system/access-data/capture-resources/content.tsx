import { translate } from '../../../../../platform/i18n';
import { settingsPanelClassName } from '../../../../section-surface';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';
import type { useCaptureResourcesController } from './controller';

type CaptureResourcesState = ReturnType<typeof useCaptureResourcesController>;

function ResourceToggle(props: {
  checked: boolean;
  description: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
          {props.label}
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
          {props.description}
        </p>
      </div>
      <SettingsSwitch checked={props.checked} onClick={props.onToggle} />
    </div>
  );
}

export function CaptureResourcesContent({ state }: { state: CaptureResourcesState }) {
  return (
    <section className={[settingsPanelClassName, 'space-y-3'].join(' ')}>
      <div>
        <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('settings.appearance.capturePrivacyTitle', state.locale)}
        </h2>
      </div>
      <div className="divide-y divide-[var(--sniptale-color-border-subtle)]">
        <ResourceToggle
          checked={state.authenticatedSnapshotAssetsEnabled}
          label={translate('settings.appearance.authenticatedSnapshotAssetsLabel', state.locale)}
          description={translate(
            'settings.appearance.authenticatedSnapshotAssetsDescription',
            state.locale
          )}
          onToggle={() => {
            void state.updateAuthenticatedSnapshotAssetsEnabled(
              !state.authenticatedSnapshotAssetsEnabled
            );
          }}
        />
        {state.authenticatedSnapshotAssetsEnabled ? (
          <p className="py-3 text-xs leading-5 text-[var(--sniptale-color-warning)]">
            {translate('settings.appearance.authenticatedSnapshotAssetsWarning', state.locale)}
          </p>
        ) : null}
        <ResourceToggle
          checked={state.anonymousCrossOriginSnapshotAssetsEnabled}
          label={translate(
            'settings.appearance.anonymousCrossOriginSnapshotAssetsLabel',
            state.locale
          )}
          description={translate(
            'settings.appearance.anonymousCrossOriginSnapshotAssetsDescription',
            state.locale
          )}
          onToggle={() => {
            void state.updateAnonymousCrossOriginSnapshotAssetsEnabled(
              !state.anonymousCrossOriginSnapshotAssetsEnabled
            );
          }}
        />
      </div>
    </section>
  );
}
