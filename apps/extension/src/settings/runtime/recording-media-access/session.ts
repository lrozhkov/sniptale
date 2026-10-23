import {
  type VideoRecordingRuntimeState,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';

export type RecordingMediaAccessKind = 'microphone' | 'camera';

interface RecordingMediaAccessDependencies {
  readState: () => Promise<VideoRecordingRuntimeState>;
  subscribeState: (listener: (state: VideoRecordingRuntimeState) => void) => () => void;
  retainDevice: (
    kind: RecordingMediaAccessKind,
    deviceId: string | null,
    signal: AbortSignal
  ) => Promise<void>;
  onFailure: () => void;
  onIdle: () => void;
}

interface DeviceRetention {
  deviceId: string | null;
  controller: AbortController;
}

interface StateRead {
  revision: number;
  deadline: ReturnType<typeof setTimeout>;
}

function isAdmitted(state: VideoRecordingRuntimeState): boolean {
  return (
    !state.error &&
    (state.status === VideoRecordingStatus.PREPARING ||
      state.status === VideoRecordingStatus.COUNTDOWN ||
      state.status === VideoRecordingStatus.RECORDING ||
      state.status === VideoRecordingStatus.PAUSED)
  );
}

/** Retains disposable selected-device resources only while authoritative recording state admits them. */
export function createRecordingMediaAccessSession(deps: RecordingMediaAccessDependencies): {
  dispose(): void;
} {
  let disposed = false;
  let revision = 0;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let pendingRead: StateRead | null = null;
  const retentions = new Map<RecordingMediaAccessKind, DeviceRetention>();

  function stopHeartbeat(): void {
    if (heartbeat !== null) clearInterval(heartbeat);
    heartbeat = null;
  }

  function releaseAll(): void {
    for (const retention of retentions.values()) retention.controller.abort();
    retentions.clear();
    stopHeartbeat();
  }

  function failObservation(): void {
    for (const retention of retentions.values()) retention.controller.abort();
    stopHeartbeat();
    deps.onFailure();
  }

  function retain(kind: RecordingMediaAccessKind, deviceId: string | null): void {
    const current = retentions.get(kind);
    if (current?.deviceId === deviceId) return;
    current?.controller.abort();
    const retention = { deviceId, controller: new AbortController() };
    retentions.set(kind, retention);
    const fail = () => {
      if (disposed || retention.controller.signal.aborted || retentions.get(kind) !== retention) {
        return;
      }
      retention.controller.abort();
      deps.onFailure();
    };
    try {
      void deps.retainDevice(kind, deviceId, retention.controller.signal).then(fail, fail);
    } catch {
      fail();
    }
  }

  function applyState(state: VideoRecordingRuntimeState): void {
    if (disposed) return;
    const media = state.liveMedia;
    if (!isAdmitted(state) || !media) {
      releaseAll();
      if (state.status === VideoRecordingStatus.IDLE) deps.onIdle();
      return;
    }
    const selected = {
      microphone: media.microphoneSelected,
      camera: media.webcamSelected,
    };
    for (const kind of ['microphone', 'camera'] as const) {
      if (selected[kind]) {
        retain(kind, kind === 'microphone' ? media.microphoneDeviceId : media.webcamDeviceId);
      } else {
        retentions.get(kind)?.controller.abort();
        retentions.delete(kind);
      }
    }
    if (selected.microphone || selected.camera) {
      if (heartbeat === null) heartbeat = setInterval(readState, 1_000);
    } else {
      stopHeartbeat();
    }
  }

  function readState(): void {
    if (disposed || pendingRead) return;
    const read: StateRead = {
      revision,
      deadline: setTimeout(() => {
        if (disposed || pendingRead !== read) return;
        pendingRead = null;
        if (read.revision === revision) failObservation();
      }, 5_000),
    };
    pendingRead = read;
    const finish = (): boolean => {
      if (disposed || pendingRead !== read) return false;
      clearTimeout(read.deadline);
      pendingRead = null;
      return read.revision === revision;
    };
    try {
      void deps.readState().then(
        (state) => {
          if (finish()) applyState(state);
        },
        () => {
          if (finish()) failObservation();
        }
      );
    } catch {
      if (finish()) failObservation();
    }
  }

  const unsubscribe = deps.subscribeState((state) => {
    if (disposed) return;
    revision += 1;
    applyState(state);
  });
  readState();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      if (pendingRead) clearTimeout(pendingRead.deadline);
      pendingRead = null;
      releaseAll();
    },
  };
}
