import { FREEHAND_RECOGNITION_TEMPLATES } from '../templates';
import type { FreehandPointRecord } from '../points';
import type { FreehandRecognitionKind } from '../recognition-types';
import { normalizePointCloud } from './normalize';
import type { PointCloudTemplate } from './types';

function createTemplate(
  kind: FreehandRecognitionKind,
  closed: boolean,
  templatePoints: readonly FreehandPointRecord[]
): PointCloudTemplate {
  return {
    kind,
    closed,
    points: normalizePointCloud(templatePoints),
  };
}

export const POINT_CLOUD_TEMPLATES: readonly PointCloudTemplate[] = [
  createTemplate('line', false, FREEHAND_RECOGNITION_TEMPLATES.line),
  createTemplate('arrow', false, FREEHAND_RECOGNITION_TEMPLATES.arrow),
  createTemplate('rectangle', true, FREEHAND_RECOGNITION_TEMPLATES.rectangle),
  createTemplate('ellipse', true, FREEHAND_RECOGNITION_TEMPLATES.ellipse),
  createTemplate('diamond', true, FREEHAND_RECOGNITION_TEMPLATES.diamond),
  createTemplate('triangle', true, FREEHAND_RECOGNITION_TEMPLATES.polygon3),
];
