type CameraRecorderControlGrant = {
  documentId: string;
  expiresAt: number;
  launchToken: string;
  recordingId: string;
  senderUrl: string;
};

const CAMERA_RECORDER_LAUNCH_TTL_MS = 60_000;
const CAMERA_RECORDER_DOCUMENT_TTL_MS = 24 * 60 * 60 * 1000;

let activeGrant: CameraRecorderControlGrant | null = null;

export function issueCameraRecorderLaunchToken(recordingId: string): string {
  const launchToken = crypto.randomUUID();
  activeGrant = {
    documentId: '',
    expiresAt: Date.now() + CAMERA_RECORDER_LAUNCH_TTL_MS,
    launchToken,
    recordingId,
    senderUrl: '',
  };
  return launchToken;
}

export function authorizeCameraRecorderDocument(args: {
  documentId?: string | undefined;
  launchToken?: string | undefined;
  recordingId: string;
  senderUrl: string | null;
}): boolean {
  if (!activeGrant || activeGrant.recordingId !== args.recordingId) {
    return false;
  }
  if (!args.senderUrl || !args.documentId) {
    return false;
  }

  const now = Date.now();
  if (activeGrant.expiresAt <= now) {
    activeGrant = null;
    return false;
  }

  if (activeGrant.documentId) {
    return activeGrant.documentId === args.documentId && activeGrant.senderUrl === args.senderUrl;
  }

  if (!args.launchToken || activeGrant.launchToken !== args.launchToken) {
    return false;
  }

  activeGrant = {
    ...activeGrant,
    documentId: args.documentId,
    expiresAt: now + CAMERA_RECORDER_DOCUMENT_TTL_MS,
    senderUrl: args.senderUrl,
  };
  return true;
}

export function isAuthorizedCameraRecorderDocument(args: {
  documentId?: string | undefined;
  recordingId?: string | undefined;
  senderUrl: string | null;
}): boolean {
  if (
    !activeGrant ||
    !activeGrant.documentId ||
    !args.documentId ||
    !args.recordingId ||
    !args.senderUrl
  ) {
    return false;
  }
  if (activeGrant.expiresAt <= Date.now()) {
    activeGrant = null;
    return false;
  }

  return (
    activeGrant.documentId === args.documentId &&
    activeGrant.recordingId === args.recordingId &&
    activeGrant.senderUrl === args.senderUrl
  );
}

export function clearCameraRecorderControlGrant(recordingId?: string): void {
  if (!activeGrant || (recordingId !== undefined && activeGrant.recordingId !== recordingId)) {
    return;
  }
  activeGrant = null;
}
