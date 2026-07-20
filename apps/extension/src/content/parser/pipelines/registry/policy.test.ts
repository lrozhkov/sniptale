import { describe, expect, it } from 'vitest';
import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import { resolveParserNamesForProfile, resolveRootStrategyForProfile } from './policy';

const TEST_PIPELINES = {
  'generic-safe-fallback': ['TextContent'],
  'generic-structured': ['TextContent', 'FormFields'],
  'naumen-portal': ['PortalHomepage', 'FormFields'],
} as const;

function createProfile(overrides: Partial<PageProfile>): PageProfile {
  return {
    vendor: 'generic',
    appFamily: 'generic-web',
    pageKind: 'content',
    pipelineId: 'generic-structured',
    confidence: 0.8,
    matchedSignals: [],
    preferredRoots: ['body'],
    ...overrides,
  };
}

describe('parser registry policy', () => {
  it('drops FormFields for generic structured content pages', () => {
    const parserNames = resolveParserNamesForProfile(createProfile({}), TEST_PIPELINES);

    expect(parserNames).toEqual(['TextContent']);
  });

  it('keeps FormFields for generic structured form pages', () => {
    const parserNames = resolveParserNamesForProfile(
      createProfile({ pageKind: 'form' }),
      TEST_PIPELINES
    );

    expect(parserNames).toEqual(['TextContent', 'FormFields']);
  });

  it('keeps vendor-specific parser lists intact', () => {
    const parserNames = resolveParserNamesForProfile(
      createProfile({
        vendor: 'naumen-portal',
        appFamily: 'naumen-portal',
        pageKind: 'homepage',
        pipelineId: 'naumen-portal',
      }),
      TEST_PIPELINES
    );

    expect(parserNames).toEqual(['PortalHomepage', 'FormFields']);
  });

  it('uses preferred-root only for generic non-fallback pipelines', () => {
    expect(resolveRootStrategyForProfile(createProfile({ pipelineId: 'generic-structured' }))).toBe(
      'preferred-root'
    );
    expect(
      resolveRootStrategyForProfile(createProfile({ pipelineId: 'generic-safe-fallback' }))
    ).toBe('virtual-root');
    expect(
      resolveRootStrategyForProfile(
        createProfile({
          vendor: 'naumen-sd-gwt',
          appFamily: 'naumen-sd',
          pipelineId: 'naumen-sd-gwt',
        })
      )
    ).toBe('virtual-root');
  });
});
