import type { RuntimeMessageResponse } from './contracts/response';
import type { MessageType } from './message-types';

export const PageAccessOperation = {
  ACTIVATE_CURRENT_TAB: 'activate-current-tab',
  GRANT_ALL_SITES: 'grant-all-sites',
  GRANT_SITE: 'grant-site',
  REGISTER_GRANTED_ALL_SITES: 'register-granted-all-sites',
  REGISTER_GRANTED_SITE: 'register-granted-site',
  READ_STATUS: 'read-status',
  REVOKE_SITE: 'revoke-site',
} as const;

export type PageAccessOperation = (typeof PageAccessOperation)[keyof typeof PageAccessOperation];

export const PAGE_ACCESS_ALL_SITES_ORIGIN_PATTERNS = ['<all_urls>'] as const;
export const PAGE_ACCESS_ALL_SITES_CONTENT_SCRIPT_MATCHES = ['http://*/*', 'https://*/*'] as const;
export const PAGE_ACCESS_LEGACY_ALL_SITES_ORIGIN_PATTERNS = ['http://*/*', 'https://*/*'] as const;

type PageAccessResult =
  | 'activated'
  | 'already-active'
  | 'granted'
  | 'registered'
  | 'permission-denied'
  | 'revoked'
  | 'unsupported-url';

type PageAccessUnsupportedReason = 'missing-tab' | 'unsupported-url';

export interface PageAccessStatus {
  allSitesGranted: boolean;
  currentTabActive: boolean;
  currentTabId: number | null;
  currentTabOrigin: string | null;
  siteGranted: boolean;
  supported: boolean;
  unsupportedReason?: PageAccessUnsupportedReason;
}

export interface PageAccessMessage {
  type: typeof MessageType.PAGE_ACCESS;
  operation: PageAccessOperation;
  tabId?: number;
}

export type PageAccessResponse = RuntimeMessageResponse<{
  result?: PageAccessResult;
  status: PageAccessStatus;
}>;
