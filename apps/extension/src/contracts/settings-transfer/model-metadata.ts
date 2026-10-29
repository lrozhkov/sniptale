import {
  getAIModelLifecycle,
  isValidAIModelOperationConfiguration,
} from '../settings/model-operation';
import { isAIModelCapabilities } from '../settings/ai-catalog';
import type { AIModel } from '../settings';

export const SETTINGS_TRANSFER_MODEL_METADATA_KEYS = [
  'id',
  'providerId',
  'modelCode',
  'displayName',
  'systemPrompt',
  'operation',
  'audio',
  'source',
  'propertySource',
  'enabled',
  'retirementOverride',
  'capabilities',
] as const;

/** Admits portable configuration without accepting catalog evidence or local trust. */
export function parseSettingsTransferModelMetadata(value: unknown): AIModel {
  if (
    !isRecord(value) ||
    !hasOnlySettingsTransferModelMetadataKeys(value) ||
    !isValidAIModelOperationConfiguration(value)
  ) {
    throw new TypeError('Invalid settings transfer AI model metadata');
  }
  if (
    typeof value['id'] !== 'string' ||
    typeof value['providerId'] !== 'string' ||
    typeof value['modelCode'] !== 'string' ||
    typeof value['displayName'] !== 'string' ||
    (value['systemPrompt'] !== undefined && typeof value['systemPrompt'] !== 'string')
  ) {
    throw new TypeError('Invalid settings transfer AI model metadata');
  }
  const source = value['source'];
  const propertySource = value['propertySource'];
  const enabled = value['enabled'];
  const retirementOverride = value['retirementOverride'];
  const capabilities = value['capabilities'];
  if (
    (source !== undefined && source !== 'manual' && source !== 'catalog') ||
    (propertySource !== undefined && propertySource !== 'manual' && propertySource !== 'catalog') ||
    (enabled !== undefined && typeof enabled !== 'boolean') ||
    (retirementOverride !== undefined && typeof retirementOverride !== 'boolean') ||
    (capabilities !== undefined && !isAIModelCapabilities(capabilities))
  ) {
    throw new TypeError('Invalid settings transfer AI model metadata');
  }
  return {
    ...(source === undefined ? {} : { source }),
    ...(propertySource === undefined ? {} : { propertySource }),
    ...(enabled === undefined ? {} : { enabled }),
    ...(retirementOverride === undefined ? {} : { retirementOverride }),
    ...(capabilities === undefined ? {} : { capabilities: structuredClone(capabilities) }),
    ...(value.operation === undefined ? {} : { operation: value.operation }),
    ...(value.audio === undefined ? {} : { audio: structuredClone(value.audio) }),
    id: value['id'],
    providerId: value['providerId'],
    modelCode: value['modelCode'],
    displayName: value['displayName'],
    ...(value['systemPrompt'] === undefined ? {} : { systemPrompt: value['systemPrompt'] }),
  };
}

/** Projects configuration and keeps lifecycle-blocked models disabled when cache evidence is omitted. */
export function selectSettingsTransferModelMetadata(model: AIModel): AIModel {
  const retirementPermitted =
    model.source === 'manual' &&
    model.propertySource !== 'catalog' &&
    model.retirementOverride === true;
  const lifecycleBlocked =
    (getAIModelLifecycle(model.catalog) === 'retired' && !retirementPermitted) ||
    (model.catalog?.lifecycle === 'absent' && (model.catalog.absenceCount ?? 0) >= 2);
  const enabled = lifecycleBlocked ? false : model.enabled;
  return {
    ...(model.source === undefined ? {} : { source: model.source }),
    ...(model.propertySource === undefined ? {} : { propertySource: model.propertySource }),
    ...(enabled === undefined ? {} : { enabled }),
    ...(model.retirementOverride === undefined
      ? {}
      : { retirementOverride: model.retirementOverride }),
    ...(model.capabilities === undefined
      ? {}
      : { capabilities: structuredClone(model.capabilities) }),
    ...(model.operation === undefined ? {} : { operation: model.operation }),
    ...(model.audio === undefined ? {} : { audio: structuredClone(model.audio) }),
    id: model.id,
    providerId: model.providerId,
    modelCode: model.modelCode,
    displayName: model.displayName,
    ...(model.systemPrompt === undefined ? {} : { systemPrompt: model.systemPrompt }),
  };
}

function hasOnlySettingsTransferModelMetadataKeys(value: Record<string, unknown>): boolean {
  const allowed = new Set<string>(SETTINGS_TRANSFER_MODEL_METADATA_KEYS);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
