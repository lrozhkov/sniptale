import type { Rect } from 'fabric';
import type { CropSelection, DrawSession } from '../core/types';

export type DrawWorkflowState = {
  drawSession: DrawSession | null;
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
};
