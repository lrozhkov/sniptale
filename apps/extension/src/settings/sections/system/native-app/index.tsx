import { Cable, ShieldAlert } from 'lucide-react';
import { getControlPrimaryButtonClassName } from '@sniptale/ui/control-language';

import { translate } from '../../../../platform/i18n';
import {
  settingsSectionClassName,
  settingsPanelClassName,
  SettingsSubpageTabs,
} from '../../../section-surface';
import { useNativeAppSectionController } from './controller';
import { NativeConnectionView } from './connection';
import { NativeSettingsView } from './views';

const permissionGateClassName = [
  'rounded-[18px] border p-5',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_88%,var(--sniptale-color-surface-canvas)_12%)]',
].join(' ');

const permissionIconClassName = [
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
  'text-[var(--sniptale-color-accent)]',
].join(' ');

function NativeAppErrorPanel({ error }: { error: string | null }) {
  if (!error) {
    return null;
  }
  return (
    <div
      className={[
        settingsPanelClassName,
        'flex gap-3 text-sm text-[var(--sniptale-color-danger)]',
      ].join(' ')}
    >
      <ShieldAlert className="h-5 w-5 shrink-0" />
      <p>{error}</p>
    </div>
  );
}

type NativeAppView = 'connection' | 'capture' | 'commands' | 'telemetry';

function resolveView(view?: string): NativeAppView {
  return view === 'capture' || view === 'commands' || view === 'telemetry' ? view : 'connection';
}

function NativeAppPermissionGate(props: { loading: boolean; onEnable: () => void }) {
  return (
    <div className={permissionGateClassName}>
      <div className="flex items-start gap-3">
        <div className={permissionIconClassName}>
          <Cable size={20} aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('settings.nativeApp.permissionRequiredTitle')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.nativeApp.permissionRequiredDescription')}
          </p>
        </div>
      </div>
      <button
        type="button"
        className={`${getControlPrimaryButtonClassName({ density: 'default' })} mt-4`}
        disabled={props.loading}
        onClick={props.onEnable}
      >
        {translate(
          props.loading
            ? 'settings.nativeApp.permissionChecking'
            : 'settings.nativeApp.permissionEnable'
        )}
      </button>
    </div>
  );
}

export function NativeAppSection(props: { onViewChange?: (view: string) => void; view?: string }) {
  const controller = useNativeAppSectionController();
  const view = resolveView(props.view);

  if (controller.permissionGranted !== true) {
    return (
      <section className={settingsSectionClassName}>
        <NativeAppErrorPanel error={controller.error} />
        <NativeAppPermissionGate
          loading={controller.loading}
          onEnable={() => {
            void controller.requestPermission();
          }}
        />
      </section>
    );
  }

  return (
    <section className={settingsSectionClassName}>
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.nativeApp')}
        items={[
          { id: 'connection', label: translate('settings.navigation.views.connection') },
          { id: 'capture', label: translate('settings.navigation.views.capture') },
          { id: 'commands', label: translate('settings.navigation.views.commands') },
          { id: 'telemetry', label: translate('settings.navigation.views.telemetry') },
        ]}
        onChange={props.onViewChange}
      />
      <NativeAppErrorPanel error={controller.error} />
      {view === 'connection' ? (
        <NativeConnectionView
          status={controller.status}
          onAction={(operation) => {
            void controller.handleRuntimeAction(operation);
          }}
        />
      ) : (
        <NativeSettingsView
          view={view}
          capabilities={controller.status?.capabilities ?? null}
          disabled={controller.loading}
          settings={controller.nativeSettings}
          onChange={(native) => {
            void controller.updateNativeSettings(native);
          }}
        />
      )}
      <p className="text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
        {translate('settings.nativeApp.privacyCopy')}
      </p>
    </section>
  );
}
