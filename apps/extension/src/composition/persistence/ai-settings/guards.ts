import { isAIProviderType } from '../../../contracts/settings/ai-provider';
import {
  isAIModelCapabilities,
  isAICatalogFacts,
  isAIConnectionObservation,
} from '../../../contracts/settings/ai-catalog';
import { isValidAIModelOperationConfiguration } from '../../../contracts/settings/model-operation';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import { isAllowedAIProviderBaseUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import {
  isEncryptedSecretEnvelope,
  type EncryptedSecretEnvelope,
} from '@sniptale/platform/security/local-secret-crypto';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';

interface ParsedStoredListValue<TValue> {
  hasInvalidRoot: boolean;
  invalidEntryCount: number;
  value: TValue[];
}

function isAIProvider(value: unknown): value is AIProvider {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    isAIProviderType(value['connectionType']) &&
    value['connectionType'] !== 'chrome-built-in' &&
    isString(value['baseUrl']) &&
    isAllowedAIProviderBaseUrl(value['baseUrl']) &&
    typeof value['hasStoredApiKey'] === 'boolean' &&
    (value['management'] === undefined ||
      value['management'] === 'automatic' ||
      value['management'] === 'manual') &&
    (value['enabled'] === undefined || typeof value['enabled'] === 'boolean') &&
    (value['incarnation'] === undefined || typeof value['incarnation'] === 'string') &&
    (value['refreshGeneration'] === undefined ||
      (typeof value['refreshGeneration'] === 'string' &&
        value['refreshGeneration'].length <= 200)) &&
    ['revision', 'credentialRevision', 'catalogUpdatedAt', 'lastRefreshAttemptAt'].every(
      (key) =>
        value[key] === undefined ||
        (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0)
    ) &&
    (value['observation'] === undefined || isAIConnectionObservation(value['observation'])) &&
    isNumber(value['createdAt'])
  );
}

function isAIModel(value: unknown): value is AIModel {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['providerId']) &&
    isString(value['modelCode']) &&
    isString(value['displayName']) &&
    isValidAIModelOperationConfiguration(value) &&
    (value['source'] === undefined ||
      value['source'] === 'manual' ||
      value['source'] === 'catalog') &&
    (value['propertySource'] === undefined ||
      value['propertySource'] === 'catalog' ||
      value['propertySource'] === 'manual') &&
    (value['enabled'] === undefined || typeof value['enabled'] === 'boolean') &&
    (value['retirementOverride'] === undefined ||
      typeof value['retirementOverride'] === 'boolean') &&
    (value['capabilities'] === undefined || isAIModelCapabilities(value['capabilities'])) &&
    (value['catalog'] === undefined || isAICatalogFacts(value['catalog'])) &&
    (value['systemPrompt'] === undefined || isString(value['systemPrompt']))
  );
}

function parseStoredList<TValue>(
  value: unknown,
  validator: (entry: unknown) => entry is TValue
): ParsedStoredListValue<TValue> {
  if (value === undefined) {
    return { value: [], hasInvalidRoot: false, invalidEntryCount: 0 };
  }

  if (!Array.isArray(value)) {
    return { value: [], hasInvalidRoot: true, invalidEntryCount: 0 };
  }

  const entries = value.filter(validator);
  return {
    value: entries,
    hasInvalidRoot: false,
    invalidEntryCount: value.length - entries.length,
  };
}

export function parseStoredAIProviders(value: unknown): ParsedStoredListValue<AIProvider> {
  return parseStoredList(value, isAIProvider);
}

export function parseStoredAIModels(value: unknown): ParsedStoredListValue<AIModel> {
  return parseStoredList(value, isAIModel);
}

export function parseStoredChromeAiEnabled(value: unknown): boolean {
  return isBoolean(value) ? value : false;
}

export function parseStoredSystemPrompt(value: unknown, fallback: string): string {
  return isString(value) ? value : fallback;
}

export function parseStoredProviderSecretMap(
  value: unknown
): Record<string, EncryptedSecretEnvelope> | null {
  if (!isRecord(value) || Array.isArray(value)) {
    return null;
  }

  const parsedSecrets: Record<string, EncryptedSecretEnvelope> = {};
  for (const [key, secret] of Object.entries(value)) {
    if (isEncryptedSecretEnvelope(secret)) {
      parsedSecrets[key] = secret;
    }
  }

  return parsedSecrets;
}
