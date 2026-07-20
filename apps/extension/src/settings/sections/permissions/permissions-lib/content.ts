import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import type { PermissionContent, PermissionInfo } from './types';

const t = translate as (key: string) => string;

function getPermissionDetails(id: PermissionInfo['id']) {
  switch (id) {
    case 'origins':
      return {
        name: t('settings.permissions.sitesName'),
        description: t('settings.permissions.sitesDescription'),
      };
    case 'microphone':
      return {
        name: t('settings.permissions.microphoneName'),
        description: t('settings.permissions.microphoneDescription'),
      };
    case 'camera':
      return {
        name: t('settings.permissions.cameraName'),
        description: t('settings.permissions.cameraDescription'),
      };
    case 'downloads':
      return {
        name: t('settings.permissions.downloadsName'),
        description: t('settings.permissions.downloadsDescription'),
      };
    case 'clipboard':
      return {
        name: t('settings.permissions.clipboardName'),
        description: t('settings.permissions.clipboardDescription'),
      };
    default:
      return { name: id, description: '' };
  }
}

export function getPermissionContent(permission: PermissionInfo): PermissionContent {
  const details = getPermissionDetails(permission.id);

  if (permission.state === 'granted') {
    return {
      ...details,
      badgeIcon: CheckCircle2,
      badgeText: t('settings.permissions.statusGranted'),
      badgeTone:
        'border-[color:color-mix(in_srgb,var(--sniptale-color-success)_24%,transparent)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-success)_10%,transparent)] ' +
        'text-[var(--sniptale-color-success)]',
    };
  }

  if (permission.state === 'denied') {
    return {
      ...details,
      badgeIcon: XCircle,
      badgeText: t('settings.permissions.statusDenied'),
      badgeTone:
        'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_24%,transparent)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger)_10%,transparent)] ' +
        'text-[var(--sniptale-color-danger)]',
    };
  }

  if (permission.state === 'error') {
    return {
      ...details,
      badgeIcon: AlertCircle,
      badgeText: t('settings.permissions.statusError'),
      badgeTone:
        'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_24%,transparent)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger)_10%,transparent)] ' +
        'text-[var(--sniptale-color-danger)]',
    };
  }

  return {
    ...details,
    badgeIcon: AlertCircle,
    badgeText: t('settings.permissions.statusUnknown'),
    badgeTone: 'text-[var(--sniptale-color-text-dim)]',
  };
}
