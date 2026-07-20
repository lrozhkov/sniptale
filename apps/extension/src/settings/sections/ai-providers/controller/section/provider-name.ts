import type { AIProvider } from '../../../../../contracts/settings';

export function getAiProvidersSectionProviderName(
  providers: AIProvider[],
  providerId: string
): string {
  for (const provider of providers) {
    if (provider.id === providerId) {
      return provider.name;
    }
  }

  return 'Unknown';
}
