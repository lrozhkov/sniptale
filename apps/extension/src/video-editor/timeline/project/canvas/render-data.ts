interface ProjectTimelineRulerMarker {
  id: string;
  isMajor: boolean;
  label: string | null;
  second: number;
  spanSeconds: number;
}

const WAVEFORM_CENTER_Y = 50;
const WAVEFORM_VERTICAL_PADDING = 8;
const WAVEFORM_MIN_AMPLITUDE = 4;
const WAVEFORM_BAR_GAP_PERCENT = 0.8;

export function buildProjectTimelineRulerMarkers(
  timelineWidth: number,
  pixelsPerSecond: number
): ProjectTimelineRulerMarker[] {
  const spanSeconds = resolveTimelineRulerSpanSeconds(pixelsPerSecond);
  const markerCount =
    Math.ceil((timelineWidth + 120) / (Math.max(1, pixelsPerSecond) * spanSeconds)) + 1;

  return Array.from({ length: markerCount }, (_, index) => {
    const second = roundTimelineMarkerSecond(index * spanSeconds);
    const isMajor = Number.isInteger(second);

    return {
      id: `marker-${second.toFixed(2)}`,
      isMajor,
      label: isMajor ? buildTimelineRulerLabel(second) : null,
      second,
      spanSeconds,
    };
  });
}

export function buildAudioClipWaveformPath(peaks: number[]): string {
  if (peaks.length === 0) {
    return '';
  }

  return peaks
    .map((peak, index) => {
      const { left, right } = getWaveformBarXRange(index, peaks.length);
      const amplitude = getWaveformAmplitude(peak);
      const top = roundWaveformPoint(WAVEFORM_CENTER_Y - amplitude);
      const bottom = roundWaveformPoint(WAVEFORM_CENTER_Y + amplitude);
      return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
    })
    .join(' ');
}

function getWaveformBarXRange(index: number, peaksLength: number): { left: number; right: number } {
  const bucketWidth = 100 / peaksLength;
  const gap = Math.min(WAVEFORM_BAR_GAP_PERCENT, bucketWidth * 0.3);
  return {
    left: roundWaveformPoint(index * bucketWidth + gap / 2),
    right: roundWaveformPoint((index + 1) * bucketWidth - gap / 2),
  };
}

function getWaveformAmplitude(peak: number): number {
  const clampedPeak = Math.max(0, Math.min(1, Number.isFinite(peak) ? peak : 0));
  const maxAmplitude = WAVEFORM_CENTER_Y - WAVEFORM_VERTICAL_PADDING;
  if (clampedPeak === 0) {
    return WAVEFORM_MIN_AMPLITUDE;
  }

  return Math.max(WAVEFORM_MIN_AMPLITUDE, roundWaveformPoint(clampedPeak * maxAmplitude));
}

function roundWaveformPoint(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveTimelineRulerSpanSeconds(pixelsPerSecond: number): number {
  const candidateSteps = [1, 5, 10, 20, 30, 60];
  const minimumStepWidth = 88;

  for (const step of candidateSteps) {
    if (step * pixelsPerSecond >= minimumStepWidth) {
      return step;
    }
  }

  return candidateSteps.at(-1) ?? 60;
}

function roundTimelineMarkerSecond(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildTimelineRulerLabel(second: number): string {
  const totalSeconds = Math.max(0, Math.floor(second));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
