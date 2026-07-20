import { Camera, Globe, Mic } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS } from '@sniptale/runtime-contracts/messaging/page-access';

export type PermissionState = 'error' | 'granted' | 'denied' | 'prompt' | 'unknown';
type PermissionType = 'web' | 'chrome' | 'origin';

export interface PermissionInfo {
  id: string;
  icon: LucideIcon;
  state: PermissionState;
  type: PermissionType;
  chromePermission?: chrome.runtime.ManifestPermissions;
  originPattern?: string;
  originPatterns?: string[];
}

export interface PermissionContent {
  badgeIcon?: LucideIcon;
  badgeTone: string;
  badgeText: string;
  description: string;
  name: string;
}

export const initialPermissions: PermissionInfo[] = [
  {
    id: 'origins',
    icon: Globe,
    state: 'unknown',
    type: 'origin',
    originPatterns: [...PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS],
  },
  {
    id: 'microphone',
    icon: Mic,
    state: 'unknown',
    type: 'web',
  },
  {
    id: 'camera',
    icon: Camera,
    state: 'unknown',
    type: 'web',
  },
];
