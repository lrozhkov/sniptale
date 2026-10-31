import type { browserStorage } from './infrastructure/browser-storage';
type NativeAppTrustStorage = typeof browserStorage.local;
import { runWithAtomicPersistenceMutationPermit } from './infrastructure/mutation-barrier';

const TRUST_KEY = 'sniptale.nativeApp.trustedClient';

/** Reads the installation pin for the configured Native Messaging host. */
export async function isNativeAppTrusted(
  storage: NativeAppTrustStorage,
  hostName: string,
  clientId: string
): Promise<boolean> {
  const values = await storage.get(TRUST_KEY);
  const value: unknown = values[TRUST_KEY];
  return (
    typeof value === 'object' &&
    value !== null &&
    'hostName' in value &&
    value.hostName === hostName &&
    'clientId' in value &&
    value.clientId === clientId &&
    'trustVersion' in value &&
    value.trustVersion === 1
  );
}

/** Pins only the installation that the current connection still presents. */
export function trustNativeAppClient(args: {
  storage: NativeAppTrustStorage;
  hostName: string;
  clientId: string;
  isCurrent(): boolean;
}): Promise<boolean> {
  return runWithAtomicPersistenceMutationPermit(async (permit) => {
    if (!args.isCurrent() || !/^[a-f0-9]{64}$/.test(args.clientId)) return false;
    await args.storage.set(
      {
        [TRUST_KEY]: { hostName: args.hostName, clientId: args.clientId, trustVersion: 1 },
      },
      permit
    );
    return args.isCurrent();
  });
}

/** Removes the pin without granting authority to a pending connection. */
export function forgetNativeAppClient(storage: NativeAppTrustStorage): Promise<void> {
  return runWithAtomicPersistenceMutationPermit((permit) => storage.remove(TRUST_KEY, permit));
}

const AUTO_CONNECT_PAUSE_KEY = 'sniptale.nativeApp.autoConnectPaused';

/** Reads the intentional-exit state for the current browser session. */
export async function isNativeAppAutoConnectPaused(
  storage: NativeAppTrustStorage
): Promise<boolean> {
  const values = await storage.get(AUTO_CONNECT_PAUSE_KEY);
  return values[AUTO_CONNECT_PAUSE_KEY] === true;
}

/** Serializes Quit and explicit reconnect without restoring an invalidated intent. */
export function setNativeAppAutoConnectPaused(
  storage: NativeAppTrustStorage,
  paused: boolean,
  isCurrent: () => boolean
): Promise<boolean> {
  return runWithAtomicPersistenceMutationPermit(async (permit) => {
    if (!isCurrent()) return false;
    if (paused) await storage.set({ [AUTO_CONNECT_PAUSE_KEY]: true }, permit);
    else await storage.remove(AUTO_CONNECT_PAUSE_KEY, permit);
    return isCurrent();
  });
}
