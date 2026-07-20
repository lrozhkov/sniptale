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
  PageAccessOperation,
} from '@sniptale/runtime-contracts/messaging/page-access';
import { createRuntimeMessagingTransport } from '../../../../../../platform/runtime-messaging';

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
