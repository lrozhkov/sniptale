/** Measured work within the current recovery stage, not an estimate of total time. */
export interface RecordingRecoveryProgress {
  stage: 'preparing' | 'remuxing' | 'validatingVideo' | 'validatingAudio' | 'publishing';
  completed: number;
}

export type RecordingRecoveryProgressObserver = (progress: RecordingRecoveryProgress) => void;

/** Progress is advisory: observers cannot interrupt source recovery or publication. */
export function createRecoveryProgressReporter(observer?: RecordingRecoveryProgressObserver) {
  let previousStage: RecordingRecoveryProgress['stage'] | undefined;
  let lastUpdate = -Infinity;
  return (progress: RecordingRecoveryProgress, flush = false) => {
    if (!observer) return;
    const now = performance.now();
    if (!flush && progress.stage === previousStage && now - lastUpdate < 250) return;
    previousStage = progress.stage;
    lastUpdate = now;
    try {
      observer(progress);
    } catch {
      return;
    }
  };
}
