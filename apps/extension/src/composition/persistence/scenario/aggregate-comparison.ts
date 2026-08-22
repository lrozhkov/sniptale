import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import { parseScenarioProject } from './projects/guards';

type StoredScenarioProject = ScenarioProject | ScenarioProjectV3;

export function areScenarioProjectsEqual(
  left: StoredScenarioProject,
  right: StoredScenarioProject
): boolean {
  const canonicalLeft = left.version === 3 ? left : (parseScenarioProject(left) ?? left);
  const canonicalRight = right.version === 3 ? right : (parseScenarioProject(right) ?? right);
  return areJsonValuesEqual(canonicalLeft, canonicalRight);
}

function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => areJsonValuesEqual(value, right[index]))
    );
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        areJsonValuesEqual(leftRecord[key], rightRecord[key])
    )
  );
}
