import { describe, expect, it, vi } from 'vitest';
import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import {
  resolveDirectExtractorForProfile,
  type DirectExtractorMap,
} from './direct-extractor-routes';

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

describe('direct extractor routes', () => {
  it('resolves a direct extractor for known vendors', () => {
    const genericExtractor = vi.fn();
    const extractors: DirectExtractorMap = {
      generic: genericExtractor,
    };

    expect(resolveDirectExtractorForProfile(createProfile({ vendor: 'generic' }), extractors)).toBe(
      genericExtractor
    );
  });

  it('returns null when the vendor has no registered direct extractor', () => {
    const extractors: DirectExtractorMap = {
      generic: vi.fn(),
    };

    expect(
      resolveDirectExtractorForProfile(
        createProfile({
          vendor: 'unknown',
          appFamily: 'unknown',
          pageKind: 'unknown',
          pipelineId: 'generic-safe-fallback',
        }),
        extractors
      )
    ).toBeNull();
  });
});
