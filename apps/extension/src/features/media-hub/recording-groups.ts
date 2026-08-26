const RECORDING_GROUP_MEMBER_ROLES = ['display', 'webcam', 'microphone'] as const;

export type RecordingGroupMemberRole = (typeof RECORDING_GROUP_MEMBER_ROLES)[number];

export interface RecordingGroupMember {
  dimensions?: { height: number; width: number };
  groupId: string;
  order: number;
  role: RecordingGroupMemberRole;
  sourceFavicon?: string | null;
  sourceLabel: string | null;
  sourceUrl?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isRecordingGroupMemberRole(value: unknown): value is RecordingGroupMemberRole {
  return RECORDING_GROUP_MEMBER_ROLES.some((role) => role === value);
}

export function parseRecordingGroupMember(value: unknown): RecordingGroupMember | null {
  if (!isRecord(value)) return null;
  const groupId = value['groupId'];
  const order = value['order'];
  const role = value['role'];
  const sourceLabel = value['sourceLabel'];
  const sourceFavicon = value['sourceFavicon'];
  const sourceUrl = value['sourceUrl'];
  const dimensions = value['dimensions'];
  if (
    typeof groupId !== 'string' ||
    groupId.trim().length === 0 ||
    typeof order !== 'number' ||
    !Number.isSafeInteger(order) ||
    order < 0 ||
    !isRecordingGroupMemberRole(role) ||
    (sourceFavicon !== undefined && sourceFavicon !== null && typeof sourceFavicon !== 'string') ||
    (sourceLabel !== null && typeof sourceLabel !== 'string') ||
    (sourceUrl !== undefined && sourceUrl !== null && typeof sourceUrl !== 'string') ||
    (dimensions !== undefined &&
      (!isRecord(dimensions) ||
        typeof dimensions['height'] !== 'number' ||
        !Number.isSafeInteger(dimensions['height']) ||
        dimensions['height'] <= 0 ||
        typeof dimensions['width'] !== 'number' ||
        !Number.isSafeInteger(dimensions['width']) ||
        dimensions['width'] <= 0))
  ) {
    return null;
  }
  return {
    ...(dimensions === undefined
      ? {}
      : {
          dimensions: {
            height: dimensions['height'] as number,
            width: dimensions['width'] as number,
          },
        }),
    groupId,
    order,
    role,
    ...(sourceFavicon === undefined ? {} : { sourceFavicon }),
    sourceLabel,
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
  };
}
