// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { resolvePageProfile } from '.';

function resetProfileDom(): void {
  document.body.replaceChildren();
  document.title = '';
  window.history.replaceState({}, '', '/');
}

function registerNaumenProfileDetectionTests(): void {
  it('detects Naumen SD GWT object cards by hard DOM and URL signals', () => {
    window.history.replaceState({}, '', '/sd/operator/#Call$123');

    const tabLayout = document.createElement('div');
    tabLayout.className = 'gwt-TabLayoutPanel';

    const propertyList = document.createElement('table');
    propertyList.className = 'attrList';

    const value = document.createElement('span');
    value.className = 'stringView';
    value.textContent = 'Активно';

    document.body.append(tabLayout, propertyList, value);

    const result = resolvePageProfile(document);

    expect(result.profile.vendor).toBe('naumen-sd-gwt');
    expect(result.profile.pageKind).toBe('object-card');
    expect(result.profile.pipelineId).toBe('naumen-sd-gwt');
    expect(result.matchedSignals.map((signal) => signal.id)).toContain('url.sd-operator');
  });

  it('detects Naumen Portal service calls by portal layout signals', () => {
    window.history.replaceState({}, '', '/portal/servicecall/49784');

    const serviceCall = document.createElement('div');
    serviceCall.id = 'serviceCall';
    serviceCall.className = 'ServiceCall__serviceCall';

    const comment = document.createElement('div');
    comment.className = 'Comment__comment';

    document.body.append(serviceCall, comment);

    const result = resolvePageProfile(document);

    expect(result.profile.vendor).toBe('naumen-portal');
    expect(result.profile.pageKind).toBe('service-call');
    expect(result.profile.pipelineId).toBe('naumen-portal');
    expect(result.profile.preferredRoots[0]).toBe('#serviceCall');
  });
}

function registerSourceUrlDetectionTest(): void {
  it('uses explicit source URL instead of the ambient viewer URL', () => {
    window.history.replaceState({}, '', '/apps/extension/src/web-snapshot-viewer/index.html');

    const homepageRoot = document.createElement('div');
    homepageRoot.className = 'Main__root';
    const searchBlock = document.createElement('div');
    searchBlock.className = 'SearchBlock__root';
    homepageRoot.append(searchBlock);
    document.body.append(homepageRoot);

    const result = resolvePageProfile(document, {
      pageUrl: 'https://portal.example/portal/',
    });

    expect(result.profile.vendor).toBe('naumen-portal');
    expect(result.profile.pageKind).toBe('homepage');
    expect(result.matchedSignals.map((signal) => signal.id)).toContain('url.portal-root');
  });
}

function registerGenericContentDetectionTest(): void {
  it('detects generic content pages through a universal content profile', () => {
    const main = document.createElement('main');
    const article = document.createElement('article');
    const heading = document.createElement('h1');
    heading.textContent = 'Canonical parsing';
    const firstParagraph = document.createElement('p');
    firstParagraph.textContent =
      'This article explains how structured parsers, profiles, and projectors ' +
      'should cooperate across a shared intermediate representation.';
    const secondParagraph = document.createElement('p');
    secondParagraph.textContent =
      'It also demonstrates why the fallback parser must stay safe, ' +
      'conservative, and predictable under low-confidence conditions.';

    article.append(heading, firstParagraph, secondParagraph);
    main.append(article);
    document.body.append(main);

    const result = resolvePageProfile(document);

    expect(result.profile.vendor).toBe('generic');
    expect(result.profile.pageKind).toBe('content');
    expect(result.profile.pipelineId).toBe('generic-structured');
  });
}

function registerNarrativeOverFormDetectionTest(): void {
  it('prefers generic content over stray form controls when the content root is narrative', () => {
    const toolbarForm = document.createElement('form');
    const searchLabel = document.createElement('label');
    searchLabel.textContent = 'Search';
    const searchInput = document.createElement('input');
    toolbarForm.append(searchLabel, searchInput);

    const contentRoot = document.createElement('div');
    contentRoot.id = 'content';
    const heading = document.createElement('h1');
    heading.textContent = 'World Wide Web';
    const firstParagraph = document.createElement('p');
    firstParagraph.textContent =
      'The Web was invented by Tim Berners-Lee and contains enough narrative text to win over generic form detection.';
    const secondParagraph = document.createElement('p');
    secondParagraph.textContent =
      'A second paragraph keeps the content detector above the safe threshold while the toolbar form stays incidental.';

    contentRoot.append(heading, firstParagraph, secondParagraph);
    document.body.append(toolbarForm, contentRoot);

    const result = resolvePageProfile(document);

    expect(result.profile.vendor).toBe('generic');
    expect(result.profile.pageKind).toBe('content');
    expect(result.profile.preferredRoots).toContain('#content');
  });
}

function registerFormOverPayloadPrecedenceTest(): void {
  it('prefers generic form detection over lower-confidence payload-framework signals', () => {
    const nextData = document.createElement('script');
    nextData.id = '__NEXT_DATA__';

    const form = document.createElement('form');
    for (let index = 0; index < 3; index += 1) {
      const label = document.createElement('label');
      label.textContent = `Field ${index + 1}`;
      const input = document.createElement('input');
      form.append(label, input);
    }

    document.body.append(nextData, form);

    const result = resolvePageProfile(document);

    expect(result.profile.vendor).toBe('generic');
    expect(result.profile.pageKind).toBe('form');
    expect(result.profile.pipelineId).toBe('generic-structured');
  });
}

function registerGenericSearchLikeDetectionTest(): void {
  it('classifies search-like result pages through the same generic content profile', () => {
    window.history.replaceState({}, '', '/search?q=windows+key');

    const main = document.createElement('main');
    for (let index = 0; index < 5; index += 1) {
      const resultCard = document.createElement('article');
      const heading = document.createElement('h2');
      const link = document.createElement('a');
      link.href = `https://example.com/${index}`;
      link.textContent = `Результат ${index + 1}: ключ для Windows`;
      const snippet = document.createElement('p');
      snippet.textContent =
        'Подробное описание поискового результата с пояснением, ссылками и дополнительным контекстом.';
      heading.append(link);
      resultCard.append(heading, snippet);
      main.append(resultCard);
    }
    document.body.append(main);

    const result = resolvePageProfile(document);

    expect(result.profile.vendor).toBe('generic');
    expect(result.profile.pageKind).toBe('content');
    expect(result.profile.pipelineId).toBe('generic-structured');
  });
}

function registerUnknownFallbackDetectionTest(): void {
  it('falls back to generic safe-minimal profile for unknown pages', () => {
    const shell = document.createElement('div');
    shell.textContent = 'Short content';
    document.body.append(shell);

    const result = resolvePageProfile(document);

    expect(result.profile.vendor).toBe('unknown');
    expect(result.profile.pipelineId).toBe('generic-safe-fallback');
    expect(result.profile.preferredRoots).toEqual(['main', '[role="main"]', 'article', 'body']);
  });
}

describe('resolvePageProfile', () => {
  afterEach(() => {
    resetProfileDom();
  });

  registerNaumenProfileDetectionTests();
  registerSourceUrlDetectionTest();
  registerGenericContentDetectionTest();
  registerNarrativeOverFormDetectionTest();
  registerFormOverPayloadPrecedenceTest();
  registerGenericSearchLikeDetectionTest();
  registerUnknownFallbackDetectionTest();
});
