export interface ReviewTimeSegment {
  sourceStart: number;
  sourceEnd: number;
  resultStart: number;
  resultEnd: number;
  kind: 'keep' | 'cut' | 'speed';
  rate: number;
}

/** Source intervals retain their authored offsets and duration through result-time projection. */
export interface QuickEditVoiceoverAnchor {
  start: number;
  end: number;
  offset: number;
  duration: number;
}
