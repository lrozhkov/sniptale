// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { CapturedPageSnapshot } from '../../page-snapshot/types';
import { resolveCandidateRoots } from './candidate-roots';

function createSnapshotBase(): CapturedPageSnapshot {
  const liveRoot = document.createElement('main');
  liveRoot.id = 'live-root';
  document.body.append(liveRoot);

  const virtualRoot = liveRoot.cloneNode(true) as HTMLElement;

  return {
    iframeReadiness: {
      pendingIframes: [],
      timedOut: false,
      totalIframes: 0,
    },
    liveRoot,
    pageUrl: 'https://example.test/page',
    pageTitle: 'Page',
    pageHostname: 'example.test',
    pageProfile: {
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'content',
      pipelineId: 'generic-structured',
      confidence: 0.8,
      matchedSignals: [],
      preferredRoots: ['main', 'article', 'body'],
    },
    payloads: [],
    preferredRoot: liveRoot,
    profileTrace: [],
    rootCandidates: [],
    rootSelectionTrace: {
      candidateSelectors: [],
      selectedSelector: 'main',
      selectedTagName: 'main',
    },
    virtualRoot,
  };
}

function appendVirtualArticle(virtualRoot: HTMLElement, id: string) {
  const article = document.createElement('article');
  article.id = id;
  virtualRoot.append(article);
  return article;
}

afterEach(() => {
  document.body.replaceChildren();
});

function getRequiredValue<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function registerVirtualRootStrategyTest() {
  it('returns virtual-root candidates directly for virtual-root strategy', () => {
    const snapshot = createSnapshotBase();

    const candidates = resolveCandidateRoots(snapshot, 'virtual-root');

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.element).toBe(snapshot.virtualRoot);
  });
}

function registerGenericTraceDedupeTest() {
  it('uses generic trace candidates once and ignores duplicate or selector-less entries', () => {
    const snapshot = createSnapshotBase();
    const article = appendVirtualArticle(snapshot.virtualRoot, 'article-root');

    snapshot.rootSelectionTrace.candidateEvaluations = [
      {
        source: 'preferred-root',
        selector: '#article-root',
        score: 420,
        textLength: 120,
        linkDensity: 0,
        reasons: ['trace'],
        selected: true,
      },
      {
        source: 'preferred-root',
        selector: '#article-root',
        score: 410,
        textLength: 110,
        linkDensity: 0,
        reasons: ['duplicate'],
        selected: false,
      },
      {
        source: 'preferred-root',
        score: 50,
        textLength: 0,
        linkDensity: 0,
        reasons: ['missing-selector'],
        selected: false,
      },
    ];

    const candidates = resolveCandidateRoots(snapshot, 'preferred-root');

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      element: article,
      selector: '#article-root',
      rootScore: 420,
    });
  });
}

function registerPreferredRootFallbackTest() {
  it('falls back to virtual root when preferred-root metadata has no resolvable candidates', () => {
    const snapshot = createSnapshotBase();
    snapshot.rootSelectionTrace.selectedSelector = '#missing-root';
    delete snapshot.preferredRoot;

    const candidates = resolveCandidateRoots(snapshot, 'preferred-root');

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      element: snapshot.virtualRoot,
    });
    expect(candidates[0]).not.toHaveProperty('selector');
  });
}

function registerPreferredRootVirtualCandidateTest() {
  it('keeps preferred-root virtual candidate when selected selector is absent but preferred root exists', () => {
    const snapshot = createSnapshotBase();
    delete snapshot.rootSelectionTrace.selectedSelector;
    snapshot.rootCandidates = ['#secondary-root'];

    const secondaryRoot = appendVirtualArticle(snapshot.virtualRoot, 'secondary-root');
    const candidates = resolveCandidateRoots(snapshot, 'preferred-root');

    expect(candidates).toHaveLength(2);
    expect(getRequiredValue(candidates[0], 'preferred-root primary candidate').element).toBe(
      snapshot.virtualRoot
    );
    expect(getRequiredValue(candidates[1], 'preferred-root secondary candidate')).toMatchObject({
      element: secondaryRoot,
      selector: '#secondary-root',
    });
  });
}

function runCandidateRootsBranchesSuite() {
  registerVirtualRootStrategyTest();
  registerGenericTraceDedupeTest();
  registerPreferredRootFallbackTest();
  registerPreferredRootVirtualCandidateTest();
}

describe('parse-page candidate roots branches', runCandidateRootsBranchesSuite);
