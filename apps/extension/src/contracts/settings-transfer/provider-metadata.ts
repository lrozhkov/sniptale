import type { AIProvider } from '../settings';

export type SettingsTransferProviderMetadata = Omit<AIProvider, 'hasStoredApiKey'>;

export const SETTINGS_TRANSFER_PROVIDER_METADATA_KEYS = [
  'id',
  'name',
  'connectionType',
  'baseUrl',
  'createdAt',
] as const;

export function hasOnlySettingsTransferProviderMetadataKeys(
  value: Record<string, unknown>
): boolean {
  const allowed = new Set<string>(SETTINGS_TRANSFER_PROVIDER_METADATA_KEYS);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function selectSettingsTransferProviderMetadata(
  provider: AIProvider
): SettingsTransferProviderMetadata {
  return {
    id: provider.id,
    name: provider.name,
    connectionType: provider.connectionType,
    baseUrl: provider.baseUrl,
    createdAt: provider.createdAt,
  };
}
