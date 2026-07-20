export const CONTENT_PRIVILEGED_ACTION_TYPES = [
  'CAPTURE_VISIBLE',
  'CAPTURE_FULL',
  'CAPTURE_VISIBLE_FOR_CROP',
  'EXPORT_CAPTURE_FULL_PAGE',
  'EXECUTE_SAVE',
  'OPEN_EDITOR_WITH_IMAGE',
  'SAVE_SCREENSHOT_TO_GALLERY',
  'STAGE_RECORDING_DOWNLOAD_CHUNK',
  'SAVE_RECORDING_FOR_DOWNLOAD',
  'RELEASE_RECORDING_DOWNLOAD',
  'TRIGGER_QUICK_ACTION',
] as const;

export type ContentPrivilegedActionType = (typeof CONTENT_PRIVILEGED_ACTION_TYPES)[number];

export type ContentPrivilegedActionCapability = {
  requestId: string;
  token: string;
};

export type ContentPrivilegedActionAutoStartGrant = {
  grantToken: string;
};

export type ContentPrivilegedActionTrustedEventProof = {
  proofToken: string;
};

export type ContentPrivilegedActionRuntimeToken = {
  runtimeToken: string;
};

export type ContentPrivilegedActionActivationKey = {
  expiresAtEpochMs: number;
  keyId: string;
  secret: string;
};

export type ContentPrivilegedActionActivationProof = {
  expiresAtEpochMs: number;
  keyId: string;
  secret: string;
};

export type ContentPrivilegedActionActivationPurpose =
  | 'recording-download'
  | 'trusted-content-event';

export type ContentPrivilegedActionRequestSource =
  | { kind: 'background-auto-start'; grantToken: string }
  | { kind: 'trusted-content-event-proof'; proofToken: string };

const contentPrivilegedActionTypeSet = new Set<string>(CONTENT_PRIVILEGED_ACTION_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isContentPrivilegedActionType(
  value: unknown
): value is ContentPrivilegedActionType {
  return typeof value === 'string' && contentPrivilegedActionTypeSet.has(value);
}

export function isContentPrivilegedActionCapability(
  value: unknown
): value is ContentPrivilegedActionCapability {
  return (
    isRecord(value) &&
    typeof value['requestId'] === 'string' &&
    typeof value['token'] === 'string' &&
    Object.keys(value).length === 2
  );
}

export function isContentPrivilegedActionAutoStartGrant(
  value: unknown
): value is ContentPrivilegedActionAutoStartGrant {
  return (
    isRecord(value) && typeof value['grantToken'] === 'string' && Object.keys(value).length === 1
  );
}

export function isContentPrivilegedActionTrustedEventProof(
  value: unknown
): value is ContentPrivilegedActionTrustedEventProof {
  return (
    isRecord(value) && typeof value['proofToken'] === 'string' && Object.keys(value).length === 1
  );
}

export function isContentPrivilegedActionRuntimeToken(
  value: unknown
): value is ContentPrivilegedActionRuntimeToken {
  return (
    isRecord(value) && typeof value['runtimeToken'] === 'string' && Object.keys(value).length === 1
  );
}

export function isContentPrivilegedActionActivationKey(
  value: unknown
): value is ContentPrivilegedActionActivationKey {
  return (
    isRecord(value) &&
    typeof value['expiresAtEpochMs'] === 'number' &&
    Number.isFinite(value['expiresAtEpochMs']) &&
    typeof value['keyId'] === 'string' &&
    typeof value['secret'] === 'string' &&
    Object.keys(value).length === 3
  );
}

export function isContentPrivilegedActionActivationProof(
  value: unknown
): value is ContentPrivilegedActionActivationProof {
  return isContentPrivilegedActionActivationKey(value);
}

export function isContentPrivilegedActionActivationPurpose(
  value: unknown
): value is ContentPrivilegedActionActivationPurpose {
  return value === 'recording-download' || value === 'trusted-content-event';
}

export function isContentPrivilegedActionRequestSource(
  value: unknown
): value is ContentPrivilegedActionRequestSource {
  if (!isRecord(value) || typeof value['kind'] !== 'string') {
    return false;
  }

  if (value['kind'] === 'trusted-content-event-proof') {
    return typeof value['proofToken'] === 'string' && Object.keys(value).length === 2;
  }

  return (
    value['kind'] === 'background-auto-start' &&
    typeof value['grantToken'] === 'string' &&
    Object.keys(value).length === 2
  );
}
