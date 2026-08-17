import type { AIModel } from '../settings';

export const SETTINGS_TRANSFER_MODEL_METADATA_KEYS = [
  'id',
  'providerId',
  'modelCode',
  'displayName',
  'systemPrompt',
] as const;

export function parseSettingsTransferModelMetadata(value: unknown): AIModel {
  if (!isRecord(value) || !hasOnlySettingsTransferModelMetadataKeys(value)) {
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
    id: value['id'],
    providerId: value['providerId'],
    modelCode: value['modelCode'],
    displayName: value['displayName'],
    ...(value['systemPrompt'] === undefined ? {} : { systemPrompt: value['systemPrompt'] }),
  };
}

export function selectSettingsTransferModelMetadata(model: AIModel): AIModel {
  return {
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
