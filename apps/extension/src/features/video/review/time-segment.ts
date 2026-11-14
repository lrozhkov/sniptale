export interface ReviewTimeSegment {
  sourceStart: number;
  sourceEnd: number;
  resultStart: number;
  resultEnd: number;
  kind: 'keep' | 'cut' | 'speed' | 'freeze';
  /** Present only on an inserted hold; rate is zero and sourceStart equals sourceEnd. */
  freezeId?: string;
  frameTime?: number;
  frameDuration?: number;
  rate: number;
}

/** Source intervals retain their authored offsets and duration through result-time projection. */
export interface QuickEditVoiceoverAnchor {
  start: number;
  end: number;
  offset: number;
  duration: number;
}
