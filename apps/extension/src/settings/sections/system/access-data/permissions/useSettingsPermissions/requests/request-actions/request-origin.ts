import {
  requestOriginPermission,
  requestOriginPermissions,
  type PermissionInfo,
} from '../../../permissions-lib';
import {
  browserPermissions,
  getMissingOriginPermissions,
} from '@sniptale/platform/browser/permissions';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS,
  PAGE_ACCESS_FILE_SCHEME_ORIGIN_PATTERN,
  PageAccessOperation,
} from '@sniptale/runtime-contracts/messaging/page-access';
import { createRuntimeMessagingTransport } from '../../../../../../../../platform/runtime-messaging';
import { openExtensionDetailsPage } from '../../../../../../../../platform/navigation/extension-pages';
import { setLocalFileAccessOptIn } from '../../../../../../../../composition/persistence/settings/file-scheme-consent';

import { createMarkPermissionGranted } from './grant-permission';
import type { PermissionSetter } from '../../types';

function isAllSitesOriginPatterns(originPatterns: string[]): boolean {
  return (
    originPatterns.length === PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS.length &&
    PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS.every((origin) => originPatterns.includes(origin))
  );
}

async function registerGrantedOriginPermissions(originPatterns: string[]): Promise<void> {
  if (!isAllSitesOriginPatterns(originPatterns)) {
    return;
  }

  const response = await createRuntimeMessagingTransport().sendRuntimeMessage({
    operation: PageAccessOperation.REGISTER_GRANTED_ALL_SITES,
    type: MessageType.PAGE_ACCESS,
  });
  if (response.success === false) {
    throw new Error(response.error ?? 'Failed to register granted site access.');
  }
}

async function rollbackOriginPermissions(originPatterns: string[]): Promise<void> {
  if (originPatterns.length === 0) {
    return;
  }

  try {
    await browserPermissions.remove({ origins: originPatterns });
  } catch {
    // Preserve the registration failure for the caller.
  }
}

export function createRequestOriginAction(setPermissions: PermissionSetter) {
  const markPermissionGranted = createMarkPermissionGranted(setPermissions);

  return async function requestOrigin(permission: PermissionInfo) {
    const originPatterns = permission.originPatterns ?? [];
    const rollbackOrigins =
      originPatterns.length > 0 ? await getMissingOriginPermissions(originPatterns) : [];
    const granted =
      originPatterns.length > 0
        ? await requestOriginPermissions(originPatterns)
        : await requestOriginPermission(permission.originPattern!);
    if (granted) {
      try {
        await registerGrantedOriginPermissions(originPatterns);
      } catch (error) {
        await rollbackOriginPermissions(rollbackOrigins);
        throw error;
      }
      markPermissionGranted((item) =>
        originPatterns.length > 0
          ? item.originPatterns?.join('\n') === originPatterns.join('\n')
          : item.originPattern === permission.originPattern
      );
    }
    return granted;
  };
}

export async function registerEffectiveFileSchemeAccess(): Promise<boolean> {
  const response = await createRuntimeMessagingTransport().sendRuntimeMessage({
    operation: PageAccessOperation.REGISTER_GRANTED_FILE_SCHEME,
    type: MessageType.PAGE_ACCESS,
  });
  return response.success === true;
}

export function createRequestFileSchemeAction(setPermissions: PermissionSetter) {
  const markPermissionGranted = createMarkPermissionGranted(setPermissions);

  return async function requestFileScheme(permission: PermissionInfo): Promise<boolean> {
    const originPattern = permission.originPattern ?? PAGE_ACCESS_FILE_SCHEME_ORIGIN_PATTERN;
    if (!(await browserPermissions.isFileSchemeAccessAllowed())) {
      await openExtensionDetailsPage();
      return false;
    }

    const alreadyGranted = await browserPermissions.contains({ origins: [originPattern] });
    const granted = alreadyGranted || (await requestOriginPermission(originPattern));
    if (!granted) {
      return false;
    }

    try {
      await setLocalFileAccessOptIn(true);
      if (!(await registerEffectiveFileSchemeAccess())) {
        throw new Error('Failed to register granted local-file access.');
      }
    } catch (error) {
      await setLocalFileAccessOptIn(false).catch(() => undefined);
      if (!alreadyGranted) {
        await browserPermissions.remove({ origins: [originPattern] }).catch(() => undefined);
      }
      await registerEffectiveFileSchemeAccess().catch(() => undefined);
      throw error;
    }

    markPermissionGranted((item) => item.id === permission.id);
    return true;
  };
}
