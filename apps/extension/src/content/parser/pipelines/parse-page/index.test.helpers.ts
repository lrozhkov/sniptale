import type { CapturedPageSnapshot } from '../../page-snapshot/types';

export function createSnapshot(
  pipelineId: CapturedPageSnapshot['pageProfile']['pipelineId']
): CapturedPageSnapshot {
  const liveRoot = document.body;
  const virtualRoot = document.body.cloneNode(true) as HTMLElement;

  return {
    iframeReadiness: {
      pendingIframes: [],
      timedOut: false,
      totalIframes: 0,
    },
    liveRoot,
    pageUrl: window.location.href,
    pageTitle: document.title,
    pageHostname: window.location.hostname,
    pageProfile: {
      vendor: pipelineId.startsWith('naumen') ? 'naumen-portal' : 'generic',
      appFamily: 'test',
      pageKind: pipelineId === 'generic-safe-fallback' ? 'unknown' : 'form',
      pipelineId,
      confidence: 0.9,
      matchedSignals: [],
      preferredRoots: ['body'],
    },
    payloads: [],
    preferredRoot: liveRoot,
    profileTrace: [],
    rootCandidates: ['body'],
    rootSelectionTrace: {
      candidateSelectors: ['body'],
      selectedSelector: 'body',
      selectedTagName: 'body',
    },
    virtualRoot,
  };
}

export function appendSimpleFormField(): void {
  const group = document.createElement('div');
  group.className = 'form-group';

  const label = document.createElement('label');
  label.textContent = 'Стоимость';

  const input = document.createElement('input');
  input.value = '123321';

  group.append(label, input);
  document.body.append(group);
}

function appendTraceDrivenGenericRoots(): {
  main: HTMLElement;
  article: HTMLElement;
} {
  const main = document.createElement('main');
  main.id = 'empty-root';
  main.textContent = 'Header shell';

  const article = document.createElement('article');
  article.id = 'article-root';
  const heading = document.createElement('h1');
  heading.textContent = 'Документация по внедрению';
  const paragraph = document.createElement('p');
  paragraph.textContent =
    'Подробное описание процесса внедрения должно победить пустой shell даже если scorer выбрал shell первым.';
  article.append(heading, paragraph);

  document.body.append(main, article);

  return { main, article };
}

function createTraceDrivenRootSelectionTrace(): CapturedPageSnapshot['rootSelectionTrace'] {
  return {
    candidateSelectors: ['main', 'article', 'body', '#empty-root', '#article-root'],
    selectedSelector: '#empty-root',
    selectedTagName: 'main',
    candidateEvaluations: [
      {
        source: 'preferred-root',
        selector: '#empty-root',
        score: 500,
        textLength: 12,
        linkDensity: 0,
        reasons: ['source:preferred-root'],
        selected: true,
      },
      {
        source: 'preferred-root',
        selector: '#article-root',
        score: 300,
        textLength: 140,
        linkDensity: 0,
        reasons: ['source:preferred-root'],
        selected: false,
      },
    ],
  };
}

export function buildTraceDrivenGenericSnapshot(): CapturedPageSnapshot {
  const { main } = appendTraceDrivenGenericRoots();

  return {
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
    rootCandidates: [],
    rootSelectionTrace: createTraceDrivenRootSelectionTrace(),
    virtualRoot: document.body.cloneNode(true) as HTMLElement,
  };
}

function buildNarrativeArticle(): HTMLElement {
  const article = document.createElement('article');
  article.id = 'content-root';

  const heading = document.createElement('h1');
  heading.textContent = 'World Wide Web';

  const paragraph = document.createElement('p');
  const link = document.createElement('a');
  link.href = 'https://example.com/tim';
  link.textContent = 'Tim Berners-Lee';
  paragraph.append(
    document.createTextNode('The Web was invented by '),
    link,
    document.createTextNode(' at CERN.')
  );

  const secondParagraph = document.createElement('p');
  secondParagraph.textContent =
    'Hypertext Markup Language (HTML) is the standard markup language for documents displayed in a browser.';

  article.append(heading, paragraph, secondParagraph);
  return article;
}

function buildToolbarShell(): HTMLElement {
  const toolbar = document.createElement('div');
  const form = document.createElement('form');

  for (const id of ['main-menu', 'appearance', 'tools']) {
    const label = document.createElement('label');
    label.textContent = id;
    const input = document.createElement('input');
    form.append(label, input);
  }

  toolbar.append(form);
  return toolbar;
}

function createNarrativeBeatsNoisyBodyTrace(): CapturedPageSnapshot['rootSelectionTrace'] {
  return {
    candidateSelectors: ['article', 'body', '#content-root'],
    selectedSelector: 'body',
    selectedTagName: 'body',
    candidateEvaluations: [
      {
        source: 'preferred-root',
        selector: 'body',
        score: 900,
        textLength: 260,
        linkDensity: 0.1,
        reasons: ['source:preferred-root'],
        selected: true,
      },
      {
        source: 'preferred-root',
        selector: '#content-root',
        score: 870,
        textLength: 180,
        linkDensity: 0,
        reasons: ['source:preferred-root'],
        selected: false,
      },
    ],
  };
}

export function buildNarrativeBeatsNoisyBodySnapshot(): CapturedPageSnapshot {
  document.body.append(buildToolbarShell(), buildNarrativeArticle());

  return {
    ...createSnapshot('generic-structured'),
    pageProfile: {
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'content',
      pipelineId: 'generic-structured',
      confidence: 0.8,
      matchedSignals: [],
      preferredRoots: ['article', 'body'],
    },
    preferredRoot: document.body,
    rootCandidates: [],
    rootSelectionTrace: createNarrativeBeatsNoisyBodyTrace(),
    virtualRoot: document.body.cloneNode(true) as HTMLElement,
  };
}

export function buildContentRootWithEmbeddedControlsSnapshot(): CapturedPageSnapshot {
  const contentRoot = document.createElement('main');
  contentRoot.id = 'content';

  const controls = buildToolbarShell();
  const article = buildNarrativeArticle();
  contentRoot.append(controls, article);
  document.body.append(contentRoot);

  return {
    ...createSnapshot('generic-structured'),
    pageProfile: {
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'content',
      pipelineId: 'generic-structured',
      confidence: 0.8,
      matchedSignals: [],
      preferredRoots: ['main', 'article', '#content'],
    },
    preferredRoot: contentRoot,
    rootCandidates: [],
    rootSelectionTrace: {
      candidateSelectors: ['main', '#content', 'article'],
      selectedSelector: '#content',
      selectedTagName: 'main',
      candidateEvaluations: [
        {
          source: 'preferred-root',
          selector: '#content',
          score: 1100,
          textLength: 260,
          linkDensity: 0.05,
          reasons: ['source:preferred-root', 'main', 'structured'],
          selected: true,
        },
      ],
    },
    virtualRoot: document.body.cloneNode(true) as HTMLElement,
  };
}
