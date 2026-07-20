import type { BrowserStorageAreaAdapter } from '@sniptale/platform/browser/storage-types';
import type { NativeControllerIdentity } from '../../../contracts/native-app';

const NATIVE_CONTROLLER_PROFILE_KEY_STORAGE_KEY = 'sniptale.nativeApp.controllerProfileKey';

type NativeControllerBrowserFamily = NativeControllerIdentity['browserFamily'];

type NativeControllerIdentityStorage = { local: BrowserStorageAreaAdapter };

export async function resolveNativeControllerIdentity(args: {
  connectionId: string;
  extensionId: string;
  storage: NativeControllerIdentityStorage;
}): Promise<NativeControllerIdentity> {
  return {
    browserFamily: resolveNativeControllerBrowserFamily(),
    connectionId: args.connectionId,
    extensionId: args.extensionId,
    profileKey: await readOrCreateNativeControllerProfileKey(args.storage),
  };
}

function resolveNativeControllerBrowserFamily(): NativeControllerBrowserFamily {
  const brands = getNavigatorBrands();
  if (brands.includes('Microsoft Edge')) {
    return 'edge';
  }
  if (brands.includes('Google Chrome')) {
    return 'chrome';
  }
  if (brands.includes('Chromium')) {
    return 'chromium';
  }

  const userAgent = globalThis.navigator?.userAgent ?? '';
  if (/\bEdg\//.test(userAgent)) {
    return 'edge';
  }
  if (/\bChrome\//.test(userAgent)) {
    return 'chrome';
  }
  if (/\bChromium\//.test(userAgent)) {
    return 'chromium';
  }
  return 'unknown';
}

async function readOrCreateNativeControllerProfileKey(
  storage: NativeControllerIdentityStorage
): Promise<string> {
  const stored = await storage.local.get(NATIVE_CONTROLLER_PROFILE_KEY_STORAGE_KEY);
  const value = stored[NATIVE_CONTROLLER_PROFILE_KEY_STORAGE_KEY];
  if (isNativeControllerProfileKey(value)) {
    return value;
  }

  const profileKey = createNativeControllerProfileKey();
  await storage.local.set({ [NATIVE_CONTROLLER_PROFILE_KEY_STORAGE_KEY]: profileKey });
  return profileKey;
}

function createNativeControllerProfileKey(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return `profile:${randomUuid}`;
  }

  const random = Math.random().toString(36).slice(2, 12);
  return `profile:${Date.now().toString(36)}:${random}`;
}

function isNativeControllerProfileKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(value) &&
    value.startsWith('profile:')
  );
}

function getNavigatorBrands(): string[] {
  const navigatorWithBrands = globalThis.navigator as
    | (Navigator & { userAgentData?: { brands?: Array<{ brand?: string }> } })
    | undefined;
  return (
    navigatorWithBrands?.userAgentData?.brands
      ?.map((brand) => brand.brand)
      .filter((brand): brand is string => typeof brand === 'string') ?? []
  );
}
