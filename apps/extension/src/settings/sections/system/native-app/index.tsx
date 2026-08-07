import { ShieldAlert } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import {
  settingsMetaLabelClassName,
  settingsSectionClassName,
  settingsPanelClassName,
  SettingsSubpageTabs,
} from '../../../section-surface';
import { useNativeAppSectionController } from './controller';
import { NativeConnectionView } from './connection';
import { NativeSettingsView } from './views';

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

function NativeAppHeader() {
  return (
    <header className="border-b border-[var(--sniptale-color-border-soft)] pb-4">
      <p className={settingsMetaLabelClassName}>{translate('settings.navigation.nativeApp')}</p>
      <h1 className="mt-2 text-xl font-semibold text-[var(--sniptale-color-text-primary-strong)]">
        {translate('settings.nativeApp.title')}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.nativeApp.description')}
      </p>
    </header>
  );
}

type NativeAppView = 'connection' | 'capture' | 'commands' | 'telemetry';

function resolveView(view?: string): NativeAppView {
  return view === 'capture' || view === 'commands' || view === 'telemetry' ? view : 'connection';
}

export function NativeAppSection(props: { onViewChange?: (view: string) => void; view?: string }) {
  const controller = useNativeAppSectionController();
  const view = resolveView(props.view);

  return (
    <section className={settingsSectionClassName}>
      <NativeAppHeader />
      <NativeAppErrorPanel error={controller.error} />
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
