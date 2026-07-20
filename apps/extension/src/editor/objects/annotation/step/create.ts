import { Group } from 'fabric';
import type { EditorStepSettings as StepSettings } from '../../../../features/editor/document/step-types';
import { createObjectLabel } from '../../../document/model';
import { resolveStepGroupGeometry } from './geometry';
import { assignStepMetadata } from './metadata';
import { createStepCircle, createStepText } from './parts';

interface StepGroupOptions {
  id: string;
  labelIndex: number;
  left: number;
  top: number;
  settings: StepSettings;
}

export function createStepGroup(options: StepGroupOptions): Group {
  const { id, labelIndex, left, top, settings } = options;
  const geometry = resolveStepGroupGeometry(settings.sizeLevel);
  const circle = createStepCircle(settings, geometry.radius);
  const text = createStepText(settings, geometry);

  const group = new Group([circle, text], {
    left,
    top,
    originX: 'center',
    originY: 'center',
    objectCaching: false,
  });

  group.sniptaleId = id;
  group.sniptaleType = 'step';
  group.sniptaleRole = 'annotation';
  group.sniptaleLabel = createObjectLabel('step', labelIndex);
  assignStepMetadata(group, settings);

  return group;
}
