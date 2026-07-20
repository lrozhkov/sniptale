import type { FreehandPointRecord } from '../points';
import type { FreehandRecognitionKind } from '../recognition-types';

export type PointCloudTemplate = {
  kind: FreehandRecognitionKind;
  closed: boolean;
  points: FreehandPointRecord[];
};
