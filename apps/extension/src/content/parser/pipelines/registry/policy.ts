import type { PageProfile, PipelineTrace } from '@sniptale/runtime-contracts/dom-tree';

const GENERIC_STRUCTURED_FORMLESS_PAGE_KINDS = new Set<PageProfile['pageKind']>(['content']);

export function resolveParserNamesForProfile(
  profile: PageProfile,
  pipelineParsers: Readonly<Record<string, readonly string[]>>
): string[] {
  const fallbackParsers = pipelineParsers['generic-safe-fallback'] ?? [];
  const parserNames = [
    ...(pipelineParsers[profile.pipelineId as keyof typeof pipelineParsers] ?? fallbackParsers),
  ];

  if (
    profile.vendor === 'generic' &&
    profile.pipelineId === 'generic-structured' &&
    GENERIC_STRUCTURED_FORMLESS_PAGE_KINDS.has(profile.pageKind)
  ) {
    return parserNames.filter((parserName) => parserName !== 'FormFields');
  }

  return parserNames;
}

export function resolveRootStrategyForProfile(profile: PageProfile): PipelineTrace['rootStrategy'] {
  if (profile.vendor !== 'generic') {
    return 'virtual-root';
  }

  return profile.pipelineId === 'generic-safe-fallback' ? 'virtual-root' : 'preferred-root';
}
