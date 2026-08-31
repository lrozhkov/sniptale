import {
  browserPermissions,
  getMissingOriginPermissions,
} from '@sniptale/platform/browser/permissions';
import type {
  PageAccessOperation,
  PageAccessStatus,
} from '@sniptale/runtime-contracts/messaging/page-access';
import {
  PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS,
  PAGE_ACCESS_FILE_SCHEME_ORIGIN_PATTERN,
  PageAccessOperation as PageAccessOperationValue,
} from '@sniptale/runtime-contracts/messaging/page-access';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRuntimeMessagingTransport } from '../../../platform/runtime-messaging';
import { openExtensionDetailsPage } from '../../../platform/navigation/extension-pages';
import {
  hasLocalFileAccessOptIn,
  setLocalFileAccessOptIn,
} from '../../../composition/persistence/settings/file-scheme-consent';

export type UiGrantResolution =
  | { kind: 'external-file-setting-required' }
  | {
      kind: 'granted';
      operation: PageAccessOperation;
      rollbackFileOptIn?: boolean;
      rollbackOrigins?: string[];
    };

function createOriginPattern(origin: string | null): string | null {
  if (!origin) {
    return null;
  }

  try {
    const url = new URL(origin);
    if (url.protocol === 'file:') {
      return PAGE_ACCESS_FILE_SCHEME_ORIGIN_PATTERN;
    }
    return url.protocol === 'http:' || url.protocol === 'https:' ? `${url.origin}/*` : null;
  } catch {
    return null;
  }
}

async function requestOriginGrant(origins: string[]): Promise<string[] | null> {
  const rollbackOrigins = await getMissingOriginPermissions(origins);
  const granted = rollbackOrigins.length === 0 || (await browserPermissions.request({ origins }));
  if (!granted) {
    return null;
  }

  return rollbackOrigins;
}

async function rollbackOriginGrant(origins: string[] | undefined): Promise<void> {
  if (!origins || origins.length === 0) {
    return;
  }

  try {
    await browserPermissions.remove({ origins });
  } catch {
    // Preserve the original registration failure for the UI.
  }
}

export async function rollbackUiGrant(resolution: UiGrantResolution | null): Promise<void> {
  if (!resolution || resolution.kind !== 'granted') return;
  await rollbackOriginGrant(resolution.rollbackOrigins);
  if (!resolution.rollbackFileOptIn) return;
  await setLocalFileAccessOptIn(false).catch(() => undefined);
  await createRuntimeMessagingTransport()
    .sendRuntimeMessage({
      operation: PageAccessOperationValue.REGISTER_GRANTED_FILE_SCHEME,
      type: MessageType.PAGE_ACCESS,
    })
    .catch(() => undefined);
}

export async function applyUiPageAccessGrant(args: {
  activeTabId: number | null;
  operation: PageAccessOperation;
  status: PageAccessStatus | null;
}): Promise<UiGrantResolution | null> {
  if (args.operation === PageAccessOperationValue.GRANT_ALL_SITES) {
    const origins = [...PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS];
    const rollbackOrigins = await requestOriginGrant(origins);
    return rollbackOrigins
      ? {
          kind: 'granted',
          operation: PageAccessOperationValue.REGISTER_GRANTED_ALL_SITES,
          rollbackOrigins,
        }
      : null;
  }

  if (args.operation === PageAccessOperationValue.GRANT_SITE) {
    if (args.status?.currentTabId !== args.activeTabId) {
      return null;
    }

    const originPattern = createOriginPattern(args.status?.currentTabOrigin ?? null);
    if (!originPattern) {
      return null;
    }

    const isFileScheme = originPattern === PAGE_ACCESS_FILE_SCHEME_ORIGIN_PATTERN;
    if (isFileScheme && !(await browserPermissions.isFileSchemeAccessAllowed())) {
      await openExtensionDetailsPage();
      return { kind: 'external-file-setting-required' };
    }

    const rollbackOrigins = await requestOriginGrant([originPattern]);
    if (!rollbackOrigins) return null;
    const rollbackFileOptIn = isFileScheme && !(await hasLocalFileAccessOptIn());
    if (isFileScheme) {
      try {
        await setLocalFileAccessOptIn(true);
      } catch (error) {
        await rollbackOriginGrant(rollbackOrigins);
        throw error;
      }
    }
    return rollbackOrigins
      ? {
          kind: 'granted',
          operation: PageAccessOperationValue.REGISTER_GRANTED_SITE,
          rollbackFileOptIn,
          rollbackOrigins,
        }
      : null;
  }

  return { kind: 'granted', operation: args.operation };
}
