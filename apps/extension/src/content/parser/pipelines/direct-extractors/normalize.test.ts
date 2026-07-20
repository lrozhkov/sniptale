import { describe, expect, it, vi } from 'vitest';
import type { PageProfile, SectionNode } from '@sniptale/runtime-contracts/dom-tree';

import { normalizeDirectSections } from './normalize';

const normalizeLegacyTreeMock = vi.hoisted(() => vi.fn());

vi.mock('../../ir/normalize-legacy-tree', () => ({
  normalizeLegacyTree: normalizeLegacyTreeMock,
}));

function createProfile(): PageProfile {
  return {
    vendor: 'generic',
    appFamily: 'generic-web',
    pageKind: 'content',
    pipelineId: 'generic-structured',
    confidence: 0.8,
    matchedSignals: [],
    preferredRoots: ['body'],
  };
}

function createPageContext() {
  return {
    pageHostname: 'example.test',
    pageTitle: 'Example page',
    pageUrl: 'https://example.test/page',
  };
}

function createSection(id: string): SectionNode {
  return {
    type: 'section',
    id,
    title: `Section ${id}`,
    selected: true,
    children: [
      {
        type: 'field',
        id: `${id}-field`,
        label: 'Text',
        value: 'Example',
        valueType: 'string',
      },
    ],
  };
}

describe('direct-extractors normalize', () => {
  it('returns an empty result when there are no sections to normalize', () => {
    expect(normalizeDirectSections([], createProfile(), createPageContext())).toEqual({
      sections: [],
    });
    expect(normalizeLegacyTreeMock).not.toHaveBeenCalled();
  });

  it('falls back to normalized structure when normalized sections are missing', () => {
    const section = createSection('alpha');
    normalizeLegacyTreeMock.mockReturnValueOnce({
      context: 'example.test',
      title: 'Example page',
      structure: [section],
      sections: undefined,
    });

    expect(normalizeDirectSections([section], createProfile(), createPageContext())).toEqual({
      sections: [section],
    });
  });
});
