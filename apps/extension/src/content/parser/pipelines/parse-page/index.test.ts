// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveParserPipelineRegistry } from '../registry';
import { parseCapturedPage } from '.';
import {
  appendSimpleFormField,
  buildContentRootWithEmbeddedControlsSnapshot,
  buildNarrativeBeatsNoisyBodySnapshot,
  buildTraceDrivenGenericSnapshot,
  createSnapshot,
} from './index.test.helpers';
import {
  buildSnapshotOwnedPreferredRootFixture,
  mutateLiveArticleAfterSnapshot,
} from './snapshot-mutation.test.helpers';

function resetPipelineTestDom(): void {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.title = '';
}

function registerParserRegistryOwnershipTests(): void {
  it('builds a safe fallback registry without broad form-field heuristics', () => {
    const pipeline = resolveParserPipelineRegistry({
      vendor: 'unknown',
      appFamily: 'unknown',
      pageKind: 'unknown',
      pipelineId: 'generic-safe-fallback',
      confidence: 0.2,
      matchedSignals: [],
      preferredRoots: ['body'],
    });

    expect(pipeline.trace.registryId).toBe('generic-safe-fallback');
    expect(pipeline.trace.parserNames).not.toContain('FormFields');
    expect(pipeline.trace.rootStrategy).toBe('virtual-root');
  });

  it('keeps form heuristics only in generic structured pipeline', () => {
    const pipeline = resolveParserPipelineRegistry({
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'form',
      pipelineId: 'generic-structured',
      confidence: 0.8,
      matchedSignals: [],
      preferredRoots: ['form', 'body'],
    });

    expect(pipeline.trace.registryId).toBe('generic-structured');
    expect(pipeline.trace.parserNames).toContain('FormFields');
    expect(pipeline.trace.rootStrategy).toBe('preferred-root');
  });

  it('drops form heuristics from generic structured content pages', () => {
    const pipeline = resolveParserPipelineRegistry({
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'content',
      pipelineId: 'generic-structured',
      confidence: 0.8,
      matchedSignals: [],
      preferredRoots: ['article', 'main', 'body'],
    });

    expect(pipeline.trace.registryId).toBe('generic-structured');
    expect(pipeline.trace.parserNames).not.toContain('FormFields');
    expect(pipeline.trace.rootStrategy).toBe('preferred-root');
  });
}

function registerSafeFallbackMinimalBehaviorTest(): void {
  it('does not parse ad hoc form fields through safe fallback pipeline', () => {
    appendSimpleFormField();

    const tree = parseCapturedPage(createSnapshot('generic-safe-fallback'));
    const fields = tree.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field')
    );

    expect(fields).toHaveLength(0);
    expect(tree.meta?.pipelineTrace?.registryId).toBe('generic-safe-fallback');
    expect(tree.meta?.qualitySignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'fallback-pipeline-used', severity: 'info' }),
      ])
    );
  });
}

function registerStructuredFormBehaviorTest(): void {
  it('parses the same form through generic structured pipeline', () => {
    appendSimpleFormField();

    const tree = parseCapturedPage(createSnapshot('generic-structured'));
    const fields = tree.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field')
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Стоимость',
          value: '123321',
        }),
      ])
    );
    expect(tree.meta?.pipelineTrace?.registryId).toBe('generic-structured');
  });
}

function registerPreferredRootRetryTest(): void {
  it('retries later preferred roots when the first generic content root is empty', () => {
    const main = document.createElement('main');
    const article = document.createElement('article');
    const heading = document.createElement('h1');
    heading.textContent = 'Типовые схемы развертывания';
    const paragraph = document.createElement('p');
    paragraph.textContent =
      'Системы, построенные на основе SD Pro, могут быть развернуты в различных конфигурациях.';
    article.append(heading, paragraph);
    document.body.append(main, article);

    const tree = parseCapturedPage({
      ...createSnapshot('generic-structured'),
      pageProfile: {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.8,
        matchedSignals: [],
        preferredRoots: ['main', 'article', 'body'],
      },
      preferredRoot: main,
      rootCandidates: ['main', 'article', 'body'],
      rootSelectionTrace: {
        candidateSelectors: ['main', 'article', 'body'],
        selectedSelector: 'main',
        selectedTagName: 'main',
      },
    });

    const fields = tree.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field')
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value:
            'Системы, построенные на основе SD Pro, могут быть развернуты в различных конфигурациях.',
        }),
      ])
    );
    expect(tree.meta?.rootSelection?.selectedSelector).toBe('article');
  });
}

function registerSnapshotOwnedRootSelectionTest(): void {
  it('keeps preferred-root retries bound to snapshot metadata instead of live DOM mutations', () => {
    const snapshot = buildSnapshotOwnedPreferredRootFixture();
    mutateLiveArticleAfterSnapshot();

    const tree = parseCapturedPage(snapshot);

    expect(tree.structure[0]?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'Snapshot narrative content should survive later live DOM mutations.',
        }),
      ])
    );
    expect(tree.meta?.title).toBe('Snapshot article');
    expect(tree.meta?.url).toContain('/snapshot-article');
    expect(tree.meta?.rootSelection?.selectedSelector).toBe('article');
  });
}

function registerGenericTraceCandidateTest(): void {
  it('parses generic roots from snapshot trace and rewrites the selected candidate metadata', () => {
    const tree = parseCapturedPage(buildTraceDrivenGenericSnapshot());

    expect(tree.meta?.rootSelection?.selectedSelector).toBe('#article-root');
    expect(tree.meta?.rootSelection?.candidateEvaluations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: '#article-root', selected: true }),
        expect.objectContaining({ selector: '#empty-root', selected: false }),
      ])
    );
  });
}

function registerNarrativeQualitySelectionTest(): void {
  it('prefers a high-quality narrative root over a noisier body shell', () => {
    const tree = parseCapturedPage(buildNarrativeBeatsNoisyBodySnapshot());

    expect(tree.meta?.rootSelection?.selectedSelector).toBe('#content-root');
    expect(tree.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'paragraph',
          text: 'The Web was invented by Tim Berners-Lee at CERN.',
        }),
      ])
    );
    expect(
      tree.structure
        .flatMap((section) => section.children)
        .filter((child) => child.type === 'field' && child.valueType === 'boolean')
    ).toHaveLength(0);
    expect(tree.structure[0]?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentRole: 'paragraph',
          value: 'The Web was invented by Tim Berners-Lee at CERN.',
        }),
      ])
    );
  });
}

function registerContentRootEmbeddedControlsTest(): void {
  it('ignores embedded form controls when parsing generic content roots', () => {
    const tree = parseCapturedPage(buildContentRootWithEmbeddedControlsSnapshot());

    const fields = tree.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field')
    );

    expect(fields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Enabled', valueType: 'boolean' }),
        expect.objectContaining({ label: 'Small', valueType: 'boolean' }),
      ])
    );
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentRole: 'paragraph',
          value: 'The Web was invented by Tim Berners-Lee at CERN.',
        }),
      ])
    );
  });
}

function registerVirtualRootFallbackTest(): void {
  it('falls back to virtual snapshot content when preferred-root trace has no explicit candidate', () => {
    appendSimpleFormField();
    const snapshot = createSnapshot('generic-structured');
    document.body.replaceChildren();

    const tree = parseCapturedPage({
      ...snapshot,
      rootCandidates: [],
      rootSelectionTrace: {
        candidateSelectors: ['body'],
      },
    });

    expect(tree.structure.flatMap((section) => section.children)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Стоимость',
          value: '123321',
        }),
      ])
    );
    expect(tree.meta?.rootSelection?.selectedSelector).toBeUndefined();
  });
}

describe('parser pipeline ownership', () => {
  afterEach(() => {
    resetPipelineTestDom();
  });

  registerParserRegistryOwnershipTests();
  registerSafeFallbackMinimalBehaviorTest();
  registerStructuredFormBehaviorTest();
  registerPreferredRootRetryTest();
  registerSnapshotOwnedRootSelectionTest();
  registerGenericTraceCandidateTest();
  registerNarrativeQualitySelectionTest();
  registerContentRootEmbeddedControlsTest();
  registerVirtualRootFallbackTest();
});
