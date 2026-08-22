export const LIVE_VIDEO_KEY_FRAME_INTERVAL_SECONDS = 4;
// WebCodecs defines bitrate as an average target and leaves fluctuation implementation-defined.
// Judge payload-only recordings over 15+ seconds with 15% steady-state variance plus one
// half-second startup allowance for the initial random-access frame and rate-control warm-up.
export const LIVE_VIDEO_BITRATE_TOLERANCE = 0.15;
export const LIVE_VIDEO_STARTUP_ALLOWANCE_SECONDS = 0.5;

type LiveVideoByteBudget = Readonly<{
  actualBitrate: number;
  allowedBytes: number;
  configuredBytes: number;
  encodedBytes: number;
  withinBudget: boolean;
}>;

/** Evaluates video payload only; audio and container bytes are deliberately excluded. */
export function evaluateLiveVideoByteBudget(input: {
  configuredBitrate: number;
  duration: number;
  encodedBytes: number;
}): LiveVideoByteBudget {
  const { configuredBitrate, duration, encodedBytes } = input;
  if (!Number.isFinite(configuredBitrate) || configuredBitrate <= 0) {
    throw new Error('Configured live video bitrate must be positive and finite.');
  }
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error('Live video budget duration must be non-negative and finite.');
  }
  if (!Number.isSafeInteger(encodedBytes) || encodedBytes < 0) {
    throw new Error('Encoded live video bytes must be a non-negative safe integer.');
  }
  const configuredBytes = (configuredBitrate * duration) / 8;
  const startupAllowance = (configuredBitrate * LIVE_VIDEO_STARTUP_ALLOWANCE_SECONDS) / 8;
  const allowedBytes = configuredBytes * (1 + LIVE_VIDEO_BITRATE_TOLERANCE) + startupAllowance;
  return {
    actualBitrate: duration > 0 ? (encodedBytes * 8) / duration : 0,
    allowedBytes,
    configuredBytes,
    encodedBytes,
    withinBudget: encodedBytes <= allowedBytes,
  };
}
