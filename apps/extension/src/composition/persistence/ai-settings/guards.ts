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

interface LegacyAIProvider {
  apiKey: string;
  baseUrl: string;
  connectionType: 'openai-compatible';
  createdAt: number;
  id: string;
  name: string;
}

function isAIProvider(value: unknown): value is AIProvider {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    value['connectionType'] === 'openai-compatible' &&
    isString(value['baseUrl']) &&
    isAllowedAIProviderBaseUrl(value['baseUrl']) &&
    typeof value['hasStoredApiKey'] === 'boolean' &&
    isNumber(value['createdAt'])
  );
}

function isLegacyAIProvider(value: unknown): value is LegacyAIProvider {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    value['connectionType'] === 'openai-compatible' &&
    isString(value['baseUrl']) &&
    isAllowedAIProviderBaseUrl(value['baseUrl']) &&
    isString(value['apiKey']) &&
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

export function parseLegacyStoredAIProviders(
  value: unknown
): ParsedStoredListValue<LegacyAIProvider> {
  return parseStoredList(value, isLegacyAIProvider);
}

export function parseStoredAIModels(value: unknown): ParsedStoredListValue<AIModel> {
  return parseStoredList(value, isAIModel);
}

export function parseStoredDefaultModelId(value: unknown): string | null {
  return value === null || isString(value) ? value : null;
}

export function parseStoredChromeAiEnabled(value: unknown): boolean {
  return isBoolean(value) ? value : false;
}

export function parseStoredSystemPrompt(value: unknown, fallback: string): string {
  return isString(value) ? value : fallback;
}

export function cloneLegacyAiSettings(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || Array.isArray(value)) {
    return null;
  }

  return { ...value };
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
