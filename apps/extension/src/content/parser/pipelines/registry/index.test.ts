import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./policy');
});

describe('parser registries', () => {
  it('throws when a resolved parser name has no registered factory', async () => {
    vi.doMock('./policy', () => {
      return {
        resolveParserNamesForProfile: () => ['MissingParser'],
        resolveRootStrategyForProfile: () => 'virtual-root',
      };
    });

    const { resolveParserPipelineRegistry } = await import('.');

    expect(() =>
      resolveParserPipelineRegistry({
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.8,
        matchedSignals: [],
        preferredRoots: ['body'],
      })
    ).toThrow('Unknown parser factory: MissingParser');
  });
});
