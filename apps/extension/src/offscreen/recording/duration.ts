type DurationUpdateHandler = (duration: number) => void;

function createDurationClock() {
  let recordedDurationMs = 0;
  let currentSegmentStartedAt: number | null = null;

  const getElapsedSeconds = (): number => {
    const activeSegmentMs =
      currentSegmentStartedAt === null ? 0 : Date.now() - currentSegmentStartedAt;
    return Math.max(0, Math.floor((recordedDurationMs + activeSegmentMs) / 1000));
  };

  return {
    getElapsedSeconds,
    startSegment: () => {
      currentSegmentStartedAt = Date.now();
    },
    freeze: () => {
      if (currentSegmentStartedAt !== null) {
        recordedDurationMs += Date.now() - currentSegmentStartedAt;
        currentSegmentStartedAt = null;
      }
    },
    reset: () => {
      recordedDurationMs = 0;
      currentSegmentStartedAt = null;
    },
  };
}

export function createDurationTracker(sendUpdate: DurationUpdateHandler) {
  const clock = createDurationClock();
  let durationBroadcastInterval: ReturnType<typeof setInterval> | null = null;

  const publishDuration = () => {
    sendUpdate(clock.getElapsedSeconds());
  };

  const startBroadcast = () => {
    stopBroadcast();
    publishDuration();
    durationBroadcastInterval = setInterval(publishDuration, 1000);
  };

  const stopBroadcast = () => {
    if (durationBroadcastInterval !== null) {
      clearInterval(durationBroadcastInterval);
      durationBroadcastInterval = null;
    }
  };

  const freeze = () => clock.freeze();

  const reset = () => {
    stopBroadcast();
    clock.reset();
  };

  const startSegment = () => {
    clock.startSegment();
    startBroadcast();
  };

  const stopSegment = () => {
    stopBroadcast();
  };

  return {
    getElapsedSeconds: clock.getElapsedSeconds,
    publishDuration,
    startSegment,
    stopSegment,
    freeze,
    reset,
  };
}
