import {
  VIDEO_EDITOR_PLAYBACK_RATE_MAX,
  VIDEO_EDITOR_PLAYBACK_RATE_MIN,
} from '../../project/state/clip-property/playback-rate';

const PLAYBACK_RATE_SLIDER_MIN = 0;
const PLAYBACK_RATE_SLIDER_MAX = 100;

const LOG_PLAYBACK_RATE_MIN = Math.log(VIDEO_EDITOR_PLAYBACK_RATE_MIN);
const LOG_PLAYBACK_RATE_MAX = Math.log(VIDEO_EDITOR_PLAYBACK_RATE_MAX);

function clampSliderValue(value: number) {
  return Math.min(PLAYBACK_RATE_SLIDER_MAX, Math.max(PLAYBACK_RATE_SLIDER_MIN, value));
}

function normalizePlaybackRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.min(VIDEO_EDITOR_PLAYBACK_RATE_MAX, Math.max(VIDEO_EDITOR_PLAYBACK_RATE_MIN, value));
}

function roundPlaybackRate(value: number) {
  return value < 1 ? Math.round(value * 1000) / 1000 : Math.round(value * 100) / 100;
}

function mapPlaybackRateToSliderValue(playbackRate: number) {
  const normalizedPlaybackRate = normalizePlaybackRate(playbackRate);
  const progress =
    (Math.log(normalizedPlaybackRate) - LOG_PLAYBACK_RATE_MIN) /
    (LOG_PLAYBACK_RATE_MAX - LOG_PLAYBACK_RATE_MIN);

  return clampSliderValue(progress * PLAYBACK_RATE_SLIDER_MAX);
}

export function mapSliderValueToPlaybackRate(sliderValue: number) {
  const progress =
    clampSliderValue(sliderValue) / (PLAYBACK_RATE_SLIDER_MAX - PLAYBACK_RATE_SLIDER_MIN);
  const playbackRate = Math.exp(
    LOG_PLAYBACK_RATE_MIN + progress * (LOG_PLAYBACK_RATE_MAX - LOG_PLAYBACK_RATE_MIN)
  );

  return roundPlaybackRate(playbackRate);
}

export function formatPlaybackRateLabel(playbackRate: number) {
  const normalizedPlaybackRate = normalizePlaybackRate(playbackRate);
  return normalizedPlaybackRate < 1
    ? `${normalizedPlaybackRate.toFixed(3)}x`
    : `${normalizedPlaybackRate.toFixed(2)}x`;
}

export function getPlaybackRateSliderProps(playbackRate: number) {
  return {
    max: PLAYBACK_RATE_SLIDER_MAX,
    min: PLAYBACK_RATE_SLIDER_MIN,
    step: 1,
    value: mapPlaybackRateToSliderValue(playbackRate),
  } as const;
}
