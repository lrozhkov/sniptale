export interface VideoExportSampleWindow {
  start: number;
  end: number;
}

export interface VideoExportSizeEstimate {
  bytes: number;
  lowerBytes: number;
  upperBytes: number;
  sampledSeconds: number;
}

/** Interior strata avoid overweighting opening/closing effects; at most 135 frame intervals are sampled. */
export function videoExportSampleWindows(duration: number, fps = 30): VideoExportSampleWindow[] {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fps) || fps <= 0)
    throw new Error('Invalid export duration or frame rate');
  const length = Math.min(0.75, 15 / fps);
  const count = 9;
  if (duration <= length * count) return [{ start: 0, end: duration }];
  return Array.from({ length: count }, (_, index) => {
    const start = (duration * (index + 0.5)) / count - length / 2;
    return { start, end: start + length };
  });
}

/** Normalize extra probe keyframes to the export cadence; otherwise short windows overestimate size. */
export function normalizeVideoExportSample(
  sample: { bytes: number; keyBytes: number; frames: number; keyFrames: number; seconds: number },
  fps: number,
  duration: number
) {
  const keyRate = Math.min(fps, Math.ceil(duration / 2) / duration);
  const keyBytes = sample.keyFrames
    ? sample.keyBytes / sample.keyFrames
    : sample.bytes / Math.max(1, sample.frames);
  const deltaFrames = sample.frames - sample.keyFrames;
  const deltaBytes = deltaFrames ? (sample.bytes - sample.keyBytes) / deltaFrames : keyBytes;
  return {
    seconds: sample.seconds,
    bytes: (keyBytes * keyRate + deltaBytes * (fps - keyRate)) * sample.seconds,
  };
}

/** A content-dependent range, not a statistical guarantee; audio and mux overhead are allowances. */
export function projectVideoExportSize(
  samples: readonly { bytes: number; seconds: number }[],
  duration: number,
  audioBitrate: number
): VideoExportSizeEstimate {
  if (
    !samples.length ||
    samples.some(
      (sample) =>
        !Number.isFinite(sample.bytes) ||
        sample.bytes <= 0 ||
        !Number.isFinite(sample.seconds) ||
        sample.seconds <= 0
    ) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(audioBitrate) ||
    audioBitrate < 0
  )
    throw new Error('Invalid export size samples');
  const sampledSeconds = samples.reduce((sum, sample) => sum + sample.seconds, 0);
  const rate = samples.reduce((sum, sample) => sum + sample.bytes, 0) / sampledSeconds;
  const rates = samples.map((sample) => sample.bytes / sample.seconds);
  const audio = (audioBitrate * duration) / 8;
  const total = (videoRate: number) => Math.ceil((videoRate * duration + audio) * 1.02 + 4096);
  return {
    bytes: total(rate),
    lowerBytes: total(Math.min(...rates) * 0.75),
    upperBytes: total(Math.max(...rates) * 1.35),
    sampledSeconds,
  };
}
