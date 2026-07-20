import type {
  ScenarioProjectSummary,
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../../../../features/scenario/contracts/types/project';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioRestoreSnapshot,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioSessionPayload } from '../types';
import {
  isScenarioCaptureMetadata,
  isScenarioCaptureSourceKind,
  isScenarioCaptureSurface,
  isScenarioPageDescriptor,
  isScenarioPoint,
  isScenarioTargetDescriptor,
} from './capture';
import {
  hasOptionalField,
  isBoolean,
  isNullable,
  isNumber,
  isRecord,
  isString,
} from '../../validators/index';
import { isScenarioCaptureMode, isScenarioRecorderCaptureAction } from './capture';

function isScenarioProjectSummary(value: unknown): value is ScenarioProjectSummary {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    isNumber(value['createdAt']) &&
    isNumber(value['updatedAt']) &&
    hasOptionalField(value, 'tags', (tags) => Array.isArray(tags) && tags.every(isString))
  );
}

function isScenarioRecentStep(value: unknown): value is ScenarioRecentStep {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    hasOptionalField(value, 'metadata', (metadata) => {
      return (
        isRecord(metadata) &&
        isScenarioCaptureMetadata(metadata['captureMetadata']) &&
        isScenarioCaptureSurface(metadata['captureSurface']) &&
        isNullable(isScenarioPoint)(metadata['cursorPoint']) &&
        isNullable(isScenarioPoint)(metadata['interactionPoint']) &&
        isScenarioPageDescriptor(metadata['page']) &&
        isScenarioCaptureSourceKind(metadata['sourceKind']) &&
        isNullable(isScenarioTargetDescriptor)(metadata['target'])
      );
    }) &&
    isNumber(value['position']) &&
    isString(value['previewDataUrl']) &&
    isString(value['title'])
  );
}

function isScenarioTrashedStep(value: unknown): value is ScenarioTrashedStep {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isNumber(value['deletedAt']) &&
    isNumber(value['originalIndex']) &&
    isString(value['kind']) &&
    isString(value['title'])
  );
}

export function isScenarioSessionState(value: unknown): value is ScenarioSessionState {
  return (
    isRecord(value) &&
    isBoolean(value['enabled']) &&
    isScenarioCaptureMode(value['captureMode']) &&
    hasOptionalField(value, 'projectId', isNullable(isString)) &&
    hasOptionalField(value, 'projectName', isNullable(isString)) &&
    isBoolean(value['rememberProjectSelection']) &&
    isBoolean(value['pendingProjectSelection']) &&
    isBoolean(value['sidebarVisible'])
  );
}

export function isScenarioRecorderSurfaceState(
  value: unknown
): value is ScenarioRecorderSurfaceState {
  return (
    isRecord(value) &&
    isBoolean(value['screenshotMode']) &&
    isBoolean(value['toolbarVisible']) &&
    isScenarioRecorderCaptureAction(value['captureAction'])
  );
}

export function isScenarioRestoreSnapshot(value: unknown): value is ScenarioRestoreSnapshot {
  return (
    isRecord(value) &&
    isScenarioSessionState(value['session']) &&
    isScenarioRecorderSurfaceState(value['surface']) &&
    isNumber(value['projectRevision'])
  );
}

export function isScenarioSessionPayload(value: unknown): value is ScenarioSessionPayload {
  return (
    isRecord(value) &&
    hasOptionalField(value, 'session', isScenarioSessionState) &&
    hasOptionalField(value, 'surface', isScenarioRecorderSurfaceState) &&
    hasOptionalField(
      value,
      'projects',
      (projects) => Array.isArray(projects) && projects.every(isScenarioProjectSummary)
    ) &&
    hasOptionalField(
      value,
      'recentSteps',
      (recentSteps) => Array.isArray(recentSteps) && recentSteps.every(isScenarioRecentStep)
    ) &&
    hasOptionalField(
      value,
      'trashedSteps',
      (trashedSteps) => Array.isArray(trashedSteps) && trashedSteps.every(isScenarioTrashedStep)
    ) &&
    hasOptionalField(value, 'projectRevision', isNumber) &&
    hasOptionalField(value, 'snapshot', isScenarioRestoreSnapshot)
  );
}
