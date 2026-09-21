export interface ReviewTimeSegment {
  sourceStart: number;
  sourceEnd: number;
  resultStart: number;
  resultEnd: number;
  kind: 'keep' | 'cut' | 'speed';
  rate: number;
}
