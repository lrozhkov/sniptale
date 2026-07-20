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
  PageAccessOperation as PageAccessOperationValue,
} from '@sniptale/runtime-contracts/messaging/page-access';

export type UiGrantResolution = {
  operation: PageAccessOperation;
  rollbackOrigins?: string[];
};

function createOriginPattern(origin: string | null): string | null {
  if (!origin) {
    return null;
  }

  try {
    const url = new URL(origin);
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

export async function rollbackOriginGrant(origins: string[] | undefined): Promise<void> {
  if (!origins || origins.length === 0) {
    return;
  }

  try {
    await browserPermissions.remove({ origins });
  } catch {
    // Preserve the original registration failure for the UI.
  }
}

export async function resolveBackgroundOperationAfterUiGrant(args: {
  activeTabId: number | null;
  operation: PageAccessOperation;
  status: PageAccessStatus | null;
}): Promise<UiGrantResolution | null> {
  if (args.operation === PageAccessOperationValue.GRANT_ALL_SITES) {
    const origins = [...PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS];
    const rollbackOrigins = await requestOriginGrant(origins);
    return rollbackOrigins
      ? { operation: PageAccessOperationValue.REGISTER_GRANTED_ALL_SITES, rollbackOrigins }
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

    const rollbackOrigins = await requestOriginGrant([originPattern]);
    return rollbackOrigins
      ? { operation: PageAccessOperationValue.REGISTER_GRANTED_SITE, rollbackOrigins }
      : null;
  }

  return { operation: args.operation };
}
