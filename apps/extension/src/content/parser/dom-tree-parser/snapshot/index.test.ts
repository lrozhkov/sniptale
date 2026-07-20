// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertTreeToMarkdown } from '../ai/markdown';
import {
  createNaumenMvsContainer,
  setupCardPageContext,
  silenceParserConsole,
} from '../../../../../../../tooling/test/support/content/dom-tree-parser/mvs/test-helpers';
import {
  createDynamicFieldsIframe,
  createNaumenDynamicFieldsContainer,
  populateDynamicFieldsIframe,
  populateNaumenDynamicFieldsIframe,
} from '../../../../../../../tooling/test/support/content/dom-tree-parser/snapshot/fixtures';
import {
  createNaumenCommentsContainer,
  populateNaumenCommentIframe,
} from '../../../../../../../tooling/test/support/content/dom-tree-parser/snapshot/comments.fixtures';
import { parseDOMTreeAfterIframePreflight, prepareDOMTreeSnapshot } from '.';

function setupSnapshotCardPage(): void {
  silenceParserConsole();
  setupCardPageContext();
}

async function readSnapshotPreviews(contextLabel: string): Promise<{
  jsonPreview: string;
  markdownPreview: string;
}> {
  const tree = await parseDOMTreeAfterIframePreflight(contextLabel);
  return {
    jsonPreview: JSON.stringify(tree, null, 2),
    markdownPreview: convertTreeToMarkdown(tree),
  };
}

function resetSnapshotDom(): void {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
  document.body.replaceChildren();
  document.title = '';
}

afterEach(() => {
  resetSnapshotDom();
});

function registerDynamicIframeCoverageTests() {
  it('waits for delayed iframe content and keeps it in json and markdown snapshots', async () => {
    setupSnapshotCardPage();
    const iframeDoc = createDynamicFieldsIframe();
    window.setTimeout(() => {
      populateDynamicFieldsIframe(iframeDoc);
    }, 20);

    const { jsonPreview, markdownPreview } = await readSnapshotPreviews('snapshot-test');

    expect(jsonPreview).toContain('Принадлежность к ДИТиЦР/ДИБ');
    expect(jsonPreview).toContain('ДИБ');
    expect(markdownPreview).toContain('**Принадлежность к ДИТиЦР/ДИБ:** [ДИБ]');
  });

  it('keeps dynamic fields from the real Naumen embedded container shape', async () => {
    setupSnapshotCardPage();
    const iframeDoc = createNaumenDynamicFieldsContainer();
    window.setTimeout(() => {
      populateNaumenDynamicFieldsIframe(iframeDoc);
    }, 20);

    const { jsonPreview, markdownPreview } = await readSnapshotPreviews('naumen-snapshot-test');

    expect(jsonPreview).toContain('Дополнительные параметры');
    expect(jsonPreview).toContain('Принадлежность к ДИТиЦР/ДИБ');
    expect(jsonPreview).toContain('ДИБ');
    expect(markdownPreview).toContain('## Дополнительные параметры');
    expect(markdownPreview).toContain('**Принадлежность к ДИТиЦР/ДИБ:** [ДИБ]');
  });
}

function registerEmbeddedAppCoverageTests() {
  it('includes MVS card fields in json and markdown previews without iframe chrome noise', async () => {
    setupSnapshotCardPage();
    createNaumenMvsContainer();

    const { jsonPreview, markdownPreview } = await readSnapshotPreviews('mvs-snapshot-test');

    expect(jsonPreview).toContain('Rsm Config Item');
    expect(jsonPreview).toContain('Лицензии / Менеджеры услуги');
    expect(jsonPreview).toContain('Антивирусное ПО (6912) / Системный статус');
    expect(jsonPreview).toContain('Активно');
    expect(jsonPreview).not.toContain('"минут"');
    expect(markdownPreview).toContain('## Rsm Config Item');
    expect(markdownPreview).toContain('**Лицензии / Менеджеры услуги:** Мелихов Игорь Андреевич');
    expect(markdownPreview).toContain(
      '**Антивирусное ПО (6912) / Тип Актива / КЕ:** Программное обеспечение'
    );
    expect(markdownPreview).not.toContain('минут');
  });

  it('includes rendered Naumen comments and skips the draft comment composer', async () => {
    setupSnapshotCardPage();
    const iframeDoc = createNaumenCommentsContainer();
    window.setTimeout(() => {
      populateNaumenCommentIframe(iframeDoc);
    }, 20);

    const { jsonPreview, markdownPreview } = await readSnapshotPreviews('comments-snapshot-test');

    expect(jsonPreview).toContain('Комментарии');
    expect(jsonPreview).toContain('Тестов Тест Тестович');
    expect(jsonPreview).toContain('01.01.2000 10:00');
    expect(jsonPreview).toContain('Тест');
    expect(jsonPreview).not.toContain('comment$currentUser');
    expect(markdownPreview).toContain('| Автор | Дата | Текст |');
    expect(markdownPreview).toContain('| Тестов Тест Тестович | 01.01.2000 10:00 | Тест |');
  });
}

function createGenericArticleSurface(): void {
  const pageToolbar = document.createElement('div');
  pageToolbar.id = 'vector-page-titlebar';
  const tocToggle = document.createElement('input');
  tocToggle.id = 'vector-page-titlebar-toc-checkbox';
  tocToggle.setAttribute('aria-label', 'Toggle the table of contents');
  pageToolbar.append(tocToggle);

  const contentRoot = document.createElement('div');
  contentRoot.id = 'mw-content-text';
  const heading = document.createElement('h1');
  heading.id = 'firstHeading';
  heading.textContent = 'Web';
  const paragraph = document.createElement('p');
  paragraph.textContent =
    'The Web most often refers to an Internet-based hypertext system used to navigate pages.';
  const paragraphTwo = document.createElement('p');
  paragraphTwo.textContent =
    'It also refers to interconnected documents, browsers, hyperlinks, and linked resources.';

  contentRoot.append(heading, paragraph, paragraphTwo);
  document.body.append(pageToolbar, contentRoot);
}

describe('parseDOMTreeAfterIframePreflight iframe coverage', () => {
  registerDynamicIframeCoverageTests();
  registerEmbeddedAppCoverageTests();
});

describe('parseDOMTreeAfterIframePreflight generic root selection', () => {
  it('prefers the main content root on generic article pages', async () => {
    silenceParserConsole();
    window.history.replaceState({}, '', '/search?q=windows+web');
    document.title = 'Web - Wikipedia';
    createGenericArticleSurface();

    const { jsonPreview, markdownPreview } = await readSnapshotPreviews('generic-root-test');

    expect(jsonPreview).toContain('"title": "Web"');
    expect(markdownPreview).toContain('# Web');
    expect(markdownPreview).toContain('Internet-based hypertext system');
    expect(markdownPreview).not.toContain('Toggle the table of contents');
  });

  it('returns iframe readiness diagnostics together with the parsed tree snapshot', async () => {
    setupSnapshotCardPage();
    createNaumenMvsContainer();

    const snapshot = await prepareDOMTreeSnapshot('mvs-prepared-snapshot-test');

    expect(snapshot.iframeReadiness).toEqual({
      pendingIframes: [],
      timedOut: false,
      totalIframes: 1,
    });
    expect(JSON.stringify(snapshot.tree, null, 2)).toContain('Rsm Config Item');
    expect(convertTreeToMarkdown(snapshot.tree)).toContain('## Rsm Config Item');
  });
});
