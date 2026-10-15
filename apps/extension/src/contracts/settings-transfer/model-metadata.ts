import { isValidAIModelOperationConfiguration } from '../settings/model-operation';
import type { AIModel } from '../settings';

export const SETTINGS_TRANSFER_MODEL_METADATA_KEYS = [
  'id',
  'providerId',
  'modelCode',
  'displayName',
  'systemPrompt',
  'operation',
  'audio',
] as const;

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
  return {
    ...(value.operation === undefined ? {} : { operation: value.operation }),
    ...(value.audio === undefined ? {} : { audio: structuredClone(value.audio) }),
    id: value['id'],
    providerId: value['providerId'],
    modelCode: value['modelCode'],
    displayName: value['displayName'],
    ...(value['systemPrompt'] === undefined ? {} : { systemPrompt: value['systemPrompt'] }),
  };
}

export function selectSettingsTransferModelMetadata(model: AIModel): AIModel {
  return {
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
