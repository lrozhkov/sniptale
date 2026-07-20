import type { FreehandPointRecord } from './points';

export type FreehandRecognitionKind =
  | 'arrow'
  | 'circle'
  | 'diamond'
  | 'ellipse'
  | 'line'
  | 'rectangle'
  | 'triangle';

interface FreehandRecognitionAxes {
  major: number;
  minor: number;
}

interface FreehandRecognitionHead {
  left: FreehandPointRecord;
  right: FreehandPointRecord;
  tip: FreehandPointRecord;
}

interface FreehandRecognitionShaft {
  end: FreehandPointRecord;
  start: FreehandPointRecord;
}

export interface FreehandRecognitionCandidate {
  axes?: FreehandRecognitionAxes;
  center?: FreehandPointRecord;
  confidence: number;
  head?: FreehandRecognitionHead;
  height?: number;
  isSquare?: boolean;
  kind: FreehandRecognitionKind;
  rotation?: number;
  shaft?: FreehandRecognitionShaft;
  vertices?: FreehandPointRecord[];
  width?: number;
}
