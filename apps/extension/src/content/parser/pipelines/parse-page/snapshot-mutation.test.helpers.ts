import type { CapturedPageSnapshot } from '../../page-snapshot/types';
import { createSnapshot } from './index.test.helpers';

export function buildSnapshotOwnedPreferredRootFixture(): CapturedPageSnapshot {
  window.history.replaceState({}, '', '/snapshot-article');
  document.title = 'Snapshot article';

  const main = document.createElement('main');
  const article = document.createElement('article');
  const heading = document.createElement('h1');
  heading.textContent = 'Типовые схемы развертывания';
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Snapshot narrative content should survive later live DOM mutations.';
  article.append(heading, paragraph);
  document.body.append(main, article);

  return {
    ...createSnapshot('generic-structured'),
    pageTitle: document.title,
    pageUrl: window.location.href,
    pageHostname: window.location.hostname,
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
    virtualRoot: document.body.cloneNode(true) as HTMLElement,
  };
}

export function mutateLiveArticleAfterSnapshot(): void {
  window.history.replaceState({}, '', '/mutated-live-article');
  document.title = 'Mutated live title';
  const liveArticle = document.querySelector('article');
  liveArticle?.replaceChildren();
  const mutatedParagraph = document.createElement('p');
  mutatedParagraph.textContent = 'Live DOM mutation should not affect parsed snapshot content.';
  liveArticle?.append(mutatedParagraph);
}
