import {
  isRecordingMediaPermissionBootstrap,
  type RecordingMediaPermissionBootstrap,
  type RecordingMediaPermissionResult,
} from '@sniptale/runtime-contracts/video/types/messages.surface';

type MediaKind = 'audioinput' | 'videoinput';
type PermissionStream = { getTracks(): readonly { stop(): void }[] };

type PermissionSessionDependencies = {
  authorize: (request: RecordingMediaPermissionBootstrap['request']) => Promise<boolean>;
  acquire: (kind: MediaKind) => Promise<PermissionStream>;
  policyAllows: (kind: MediaKind) => boolean;
  report: (result: RecordingMediaPermissionResult) => void;
};

function classifyAcquisitionFailure(error: unknown): 'denied' | 'unavailable' {
  return error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'denied'
    : 'unavailable';
}

/** Owns the permission probe and retains its tracks until the recording owner releases them. */
export function createRecordingMediaPermissionSession(dependencies: PermissionSessionDependencies) {
  let started = false;
  let disposed = false;
  let stream: PermissionStream | null = null;

  const stop = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };

  return {
    async start(value: unknown): Promise<void> {
      if (started || disposed) return;
      started = true;
      if (!isRecordingMediaPermissionBootstrap(value)) {
        dependencies.report({ status: 'failed', reason: 'unauthorized' });
        return;
      }
      try {
        if (!(await dependencies.authorize(value.request))) {
          if (!disposed) dependencies.report({ status: 'failed', reason: 'unauthorized' });
          return;
        }
      } catch {
        if (!disposed) dependencies.report({ status: 'failed', reason: 'unauthorized' });
        return;
      }
      if (disposed) return;
      const kind = value.request.command.deviceKind;
      if (!dependencies.policyAllows(kind)) {
        dependencies.report({ status: 'failed', reason: 'policy' });
        return;
      }
      try {
        const acquired = await dependencies.acquire(kind);
        if (disposed) {
          acquired.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = acquired;
        if (stream.getTracks().length === 0) {
          stop();
          dependencies.report({ status: 'failed', reason: 'unavailable' });
          return;
        }
        dependencies.report({ status: 'granted' });
      } catch (error) {
        if (!disposed) {
          dependencies.report({ status: 'failed', reason: classifyAcquisitionFailure(error) });
        }
      }
    },
    cancel() {
      if (disposed) return;
      disposed = true;
      stop();
      dependencies.report({ status: 'cancelled' });
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
