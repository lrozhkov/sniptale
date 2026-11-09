import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import type { SettingsRoute } from '../../platform/navigation/extension-pages/settings-route/codec';
import { createSecretProtectionClient } from '../runtime/secret-protection';
import { settingsRuntimeMessagingTransport } from '../runtime/messaging';
import {
  useSecretProtectionController,
  type SecretProtectionParticipant,
  type SecretProtectionState,
} from './controller';
import { SecretProtectionDialog } from './dialog';
import { SecretProtectionParticipantRow } from './view';

const Context = createContext<{
  state: SecretProtectionState;
  onOpenConfiguration: () => void;
} | null>(null);

/** Composes ordinary Settings protection with its existing transport and route callback. */
export function SettingsSecretProtectionProvider(props: {
  children: ReactNode;
  onOpenConfiguration: () => void;
  route?: SettingsRoute;
}) {
  const client = useMemo(() => createSecretProtectionClient(settingsRuntimeMessagingTransport), []);
  const state = useSecretProtectionController(client);
  const reloadStatus = state.reloadStatus;
  const section = props.route?.section;
  const view = props.route?.view;
  const previousRoute = useRef({ section, view });
  // Route commit retires form continuations and stale status before any late native ACK.
  useLayoutEffect(() => {
    if (previousRoute.current.section === section && previousRoute.current.view === view) return;
    previousRoute.current = { section, view };
    void reloadStatus();
  }, [reloadStatus, section, view]);
  return (
    <Context.Provider value={{ state, onOpenConfiguration: props.onOpenConfiguration }}>
      {props.children}
      <SecretProtectionDialog state={state} />
    </Context.Provider>
  );
}
/** Returns the shared configuration owner; missing composition is a wiring error. */
export function useSettingsSecretProtection(): SecretProtectionState {
  const context = useContext(Context);
  if (!context) throw new Error('Settings secret protection provider is required');
  return context.state;
}
/** Shows participant controls; isolated presentation without the provider stays unavailable. */
export function SettingsSecretProtectionParticipantSummary(props: {
  participant: SecretProtectionParticipant;
}) {
  const context = useContext(Context);
  return (
    <SecretProtectionParticipantRow
      participant={props.participant}
      state={context?.state ?? null}
      onOpenConfiguration={context?.onOpenConfiguration}
    />
  );
}
