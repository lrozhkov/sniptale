import { Path, controlsUtils, type FabricObject } from 'fabric';
import type { EditorLineSettings } from '../../../features/editor/document/line-types';
import { createObjectLabel } from '../../document/model';
import { createLineControls } from './controls/factory';
import { isLineObject } from './state/identity';
import { readLinePoints } from './state/points';
import { updateLineObject } from './state/update';
import { readLineSettings } from './settings/read';
import type { LineObjectOptions, LinePathInstance, LinePoint } from './types';
import { normalizeScaledLineGeometry } from './transform';

export type { LinePathInstance, LinePoint };
export { isLineObject, readLinePoints, readLineSettings, updateLineObject };

export function setLineEditMode(line: LinePathInstance, editMode: boolean): void {
  line.sniptaleLineEditMode = editMode;
  line.controls = editMode
    ? createLineControls(line, (target, options) => updateLineObject(target, options))
    : controlsUtils.createObjectDefaultControls();
  line.set({
    hasBorders: !editMode,
    hasControls: true,
    lockScalingX: editMode,
    lockScalingY: editMode,
    lockRotation: editMode,
  });
  line.setCoords();
}

export function updateLinePointOnDoubleClick(line: LinePathInstance): void {
  setLineEditMode(line, !line.sniptaleLineEditMode);
}

export function createLineObject(options: LineObjectOptions): LinePathInstance {
  const line = new Path('M 0 0 L 0 0', {
    objectCaching: false,
  }) as LinePathInstance;

  line.sniptaleId = options.id;
  line.sniptaleType = 'line';
  line.sniptaleRole = 'annotation';
  line.sniptaleLabel = options.label ?? createObjectLabel('line', options.labelIndex);
  line.sniptaleLineEditMode = false;

  updateLineObject(line, {
    settings: options.settings,
    points: options.points,
    closed: options.closed ?? false,
  });
  setLineEditMode(line, false);

  return line;
}

export function getLineSettings(line: LinePathInstance): EditorLineSettings {
  return readLineSettings(line);
}

export function getLinePoints(line: LinePathInstance): LinePoint[] {
  return readLinePoints(line);
}

export function normalizeScaledLineObject(line: LinePathInstance): boolean {
  return normalizeScaledLineGeometry(
    line,
    readLineSettings(line),
    readLinePoints(line),
    updateLineObject
  );
}

export function isEditableLineObject(object: FabricObject): object is LinePathInstance {
  return isLineObject(object);
}
