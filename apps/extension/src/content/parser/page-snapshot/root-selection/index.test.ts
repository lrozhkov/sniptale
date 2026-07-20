// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { resolvePreferredRoot } from '.';

function resetRootSelectionDom(): void {
  document.body.replaceChildren();
  document.title = '';
}

function createGenericProfile() {
  return {
    vendor: 'generic' as const,
    appFamily: 'generic-web',
    pageKind: 'content',
    pipelineId: 'generic-structured',
    confidence: 0.8,
    matchedSignals: [],
    preferredRoots: ['main article', 'article', '.content', 'main', '[role="main"]'],
  };
}

function createLegacyProfile(preferredRoots: string[] = ['main', '.content']) {
  return {
    vendor: 'unknown' as const,
    appFamily: 'legacy-web',
    pageKind: 'content',
    pipelineId: 'legacy-structured',
    confidence: 0.8,
    matchedSignals: [],
    preferredRoots,
  };
}

function createParagraph(text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  return paragraph;
}

afterEach(() => {
  resetRootSelectionDom();
});

describe('resolvePreferredRoot narrative surfaces', () => {
  it('prefers a narrative article root over surrounding chrome', () => {
    const article = document.createElement('article');
    article.id = 'article-root';
    article.append(
      createParagraph(
        'A long narrative paragraph that clearly belongs to the main article content area.'
      ),
      createParagraph(
        'A second paragraph keeps the candidate above the readable content threshold.'
      )
    );
    document.body.append(document.createElement('aside'), article);

    const resolution = resolvePreferredRoot(createGenericProfile(), {
      liveRoot: document,
      virtualRoot: document.body,
    });

    expect(Object.hasOwn(resolution, 'element')).toBe(true);
    expect(Object.hasOwn(resolution, 'selector')).toBe(true);
    expect(resolution.selector).toBe('#article-root');
    expect(resolution.trace.candidateEvaluations?.[0]).toEqual(
      expect.objectContaining({
        source: 'preferred-root',
        selector: '#article-root',
        selected: true,
      })
    );
  });
});

describe('resolvePreferredRoot docs surfaces', () => {
  it('recognizes docs-like roots with structured content', () => {
    const docsRoot = document.createElement('div');
    docsRoot.id = 'docs-root';
    docsRoot.className = 'markdown-body';
    const code = document.createElement('pre');
    code.textContent = 'const answer = 42;';
    docsRoot.append(
      createParagraph('Documentation prose explains the API surface before the code example.'),
      code
    );
    document.body.append(docsRoot);

    const resolution = resolvePreferredRoot(createGenericProfile(), {
      liveRoot: document,
      virtualRoot: document.body,
    });

    expect(resolution.selector).toBe('#docs-root');
    expect(resolution.trace.candidateEvaluations?.[0]?.reasons).toContain('structured');
  });
});

describe('resolvePreferredRoot legacy preferred roots', () => {
  it('uses a matching legacy preferred root selector when the vendor is not generic', () => {
    const contentRoot = document.createElement('main');
    contentRoot.id = 'legacy-root';
    contentRoot.append(
      createParagraph(
        'Legacy preferred-root content lives here with enough narrative detail to pass the ' +
          'selectable-element threshold for a preferred-root candidate.'
      ),
      createParagraph(
        'A second paragraph keeps the preferred root clearly above the minimum readable-content ' +
          'threshold used by the legacy resolver.'
      )
    );
    document.body.append(contentRoot);

    const resolution = resolvePreferredRoot(createLegacyProfile(['#legacy-root', '.content']), {
      liveRoot: document,
      virtualRoot: document.body,
    });

    expect(Object.hasOwn(resolution, 'element')).toBe(true);
    expect(Object.hasOwn(resolution, 'selector')).toBe(true);
    expect(resolution.selector).toBe('#legacy-root');
    expect(resolution.trace.selectedSelector).toBe('#legacy-root');
    expect(resolution.trace.selectedTagName).toBe('main');
    expect(resolution.trace.candidateEvaluations?.[0]).toEqual(
      expect.objectContaining({
        source: 'preferred-root',
        selector: '#legacy-root',
        selected: true,
      })
    );
  });

  it('omits legacy preferred-root selection fields when no selector matches', () => {
    const resolution = resolvePreferredRoot(createLegacyProfile(['#missing-root']), {
      liveRoot: document,
      virtualRoot: document.body,
    });

    expect(Object.hasOwn(resolution, 'element')).toBe(false);
    expect(Object.hasOwn(resolution, 'selector')).toBe(false);
    expect(resolution.trace.candidateSelectors).toEqual(['#missing-root']);
    expect(resolution.trace.selectedSelector).toBeUndefined();
    expect(resolution.trace.selectedTagName).toBeUndefined();
    expect(resolution.trace.candidateEvaluations).toBeUndefined();
  });
});

describe('resolvePreferredRoot listing fallback heuristics', () => {
  it('penalizes listing-style card grids in favor of prose content', () => {
    const grid = document.createElement('main');
    grid.id = 'listing-root';
    for (let index = 0; index < 3; index += 1) {
      const card = document.createElement('article');
      const title = document.createElement('h2');
      title.textContent = `Popular story ${index + 1}`;
      const link = document.createElement('a');
      link.href = `#story-${index + 1}`;
      link.textContent = `Open story ${index + 1}`;
      const snippet = document.createElement('p');
      snippet.textContent = 'Short preview snippet for a search-like card result block.';
      card.append(title, link, snippet);
      grid.append(card);
    }

    const contentRoot = document.createElement('div');
    contentRoot.id = 'content-root';
    contentRoot.className = 'content';
    contentRoot.append(
      createParagraph(
        'Long-form prose content should win even when a listing grid is visible above it.'
      ),
      createParagraph(
        'A follow-up paragraph makes the narrative root clearly stronger than the grid.'
      )
    );

    document.body.append(grid, contentRoot);

    const resolution = resolvePreferredRoot(createGenericProfile(), {
      liveRoot: document,
      virtualRoot: document.body,
    });

    expect(resolution.selector).toBe('#content-root');
    expect(
      resolution.trace.candidateEvaluations?.some((evaluation) => {
        return evaluation.selector === '#listing-root' && evaluation.reasons.includes('card-grid');
      })
    ).toBe(true);
  });
});

describe('resolvePreferredRoot hidden fallback heuristics', () => {
  it('adds a hidden subtree candidate when the content lives behind a hidden wrapper', () => {
    const teaser = document.createElement('main');
    teaser.id = 'teaser-root';
    teaser.textContent = 'Short teaser';

    const hiddenRoot = document.createElement('div');
    hiddenRoot.id = 'hidden-root';
    hiddenRoot.hidden = true;
    hiddenRoot.append(
      createParagraph(
        'Hidden article content appears here with enough text to beat the teaser shell and keep ' +
          'the subtree safely above the minimum threshold for hidden-content fallback selection.'
      ),
      createParagraph(
        'A second hidden paragraph adds more narrative detail so the hidden subtree clearly ' +
          'exceeds two hundred visible characters of meaningful prose content for the resolver.'
      )
    );

    document.body.append(teaser, hiddenRoot);

    const resolution = resolvePreferredRoot(createGenericProfile(), {
      liveRoot: document,
      virtualRoot: document.body,
    });

    expect(resolution.selector).toBe('#hidden-root');
    expect(resolution.trace.candidateEvaluations?.[0]).toEqual(
      expect.objectContaining({
        source: 'hidden-subtree',
        selector: '#hidden-root',
      })
    );
  });
});

describe('resolvePreferredRoot schema guidance', () => {
  it('uses schema text to re-anchor content inside feed-like pages', () => {
    const feedRoot = document.createElement('main');
    feedRoot.id = 'feed-root';

    const teaserCard = document.createElement('article');
    teaserCard.id = 'teaser-card';
    teaserCard.append(
      createParagraph('A short teaser that should not win the schema-guided match.')
    );

    const targetCard = document.createElement('article');
    targetCard.id = 'target-card';
    targetCard.append(
      createParagraph(
        'Canonical schema paragraph begins here and continues with detailed article prose ' +
          'that mirrors the structured article body from the payload very closely.'
      ),
      createParagraph(
        'A follow-up paragraph keeps the candidate above the schema coverage threshold and adds ' +
          'enough overlap for the resolver to prefer this exact subtree over the whole feed shell.'
      )
    );

    feedRoot.append(teaserCard, targetCard);
    document.body.append(feedRoot);

    const resolution = resolvePreferredRoot(createGenericProfile(), {
      liveRoot: document,
      virtualRoot: document.body,
      schemaTextHint:
        'Canonical schema paragraph begins here and continues with detailed article prose ' +
        'that mirrors the structured article body from the payload very closely.\n\n' +
        'A follow-up paragraph keeps the candidate above the schema coverage threshold and adds ' +
        'enough overlap for the resolver to prefer this exact subtree over the whole feed shell.',
    });

    expect(resolution.selector).toBe('#target-card');
    expect(resolution.trace.candidateEvaluations?.[0]).toEqual(
      expect.objectContaining({
        source: 'schema-text',
        selector: '#target-card',
      })
    );
  });
});

describe('resolvePreferredRoot minimal fallback guidance', () => {
  it('returns an empty resolution when no viable content root is available', () => {
    const resolution = resolvePreferredRoot(createGenericProfile(), {
      liveRoot: document,
      virtualRoot: document.body,
    });

    expect(Object.hasOwn(resolution, 'element')).toBe(false);
    expect(Object.hasOwn(resolution, 'selector')).toBe(false);
    expect(resolution.selector).toBeUndefined();
    expect(resolution.element).toBeUndefined();
    expect(resolution.trace.candidateEvaluations).toEqual([]);
  });
});
