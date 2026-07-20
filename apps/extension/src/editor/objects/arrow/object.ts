import { Path, type FabricObject } from 'fabric';
import { createObjectLabel } from '../../document/model';
import { createArrowControls, readArrowPoints, readArrowSettings } from './controls';
import { readArrowAuthoredPoints } from './controls.helpers';
import type { ArrowPathInstance } from './controls.types';
import { buildArrowPointsFromOptions } from './geometry/options';
import { pickArrowPointUpdateOptions, resolveArrowUpdatePoints } from './state-points';
import { applyArrowObjectState, type ArrowUpdateOptions } from './state/apply';
import { normalizeScaledArrowGeometry } from './transform';
import type { ArrowObjectOptions } from './types';

export function isArrowObject(object: FabricObject): object is ArrowPathInstance {
  return object instanceof Path && object.sniptaleType === 'arrow';
}

export function normalizeScaledArrowObject(arrow: ArrowPathInstance): boolean {
  const settings = readArrowSettings(arrow);
  const points = readArrowPoints(arrow);
  return normalizeScaledArrowGeometry(arrow, settings, points, updateArrowObject);
}

export function updateArrowObject(arrow: ArrowPathInstance, options: ArrowUpdateOptions): void {
  const previousPoints = readArrowAuthoredPoints(arrow);
  const settings = options.settings ?? readArrowSettings(arrow);
  const points = resolveArrowUpdatePoints(previousPoints, settings, options);
  applyArrowObjectState(arrow, settings, points, () =>
    createArrowControls(arrow, (target, nextOptions) => updateArrowObject(target, nextOptions))
  );
}

export function createArrowObject(options: ArrowObjectOptions): ArrowPathInstance {
  const arrow = new Path('M 0 0 L 0 0', {
    objectCaching: false,
  }) as ArrowPathInstance;

  arrow.sniptaleId = options.id;
  arrow.sniptaleType = 'arrow';
  arrow.sniptaleRole = 'annotation';
  arrow.sniptaleLabel = options.label ?? createObjectLabel('arrow', options.labelIndex);

  updateArrowObject(arrow, {
    settings: options.settings,
    points: buildArrowPointsFromOptions(options),
    ...pickArrowPointUpdateOptions(options),
  });

  return arrow;
}
