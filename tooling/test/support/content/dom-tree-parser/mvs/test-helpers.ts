import { vi } from 'vitest';
import {
  appendElement,
  createNaumenMvsEmbeddedAppContainer,
  ensureIframeDocument,
} from './fixture-dom';
import { populateNaumenMvsIframe } from './fixture-content';

export function silenceParserConsole(): void {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
}

export function setupCardPageContext(): void {
  window.history.replaceState({}, '', '/sd/operator/card');
  document.title = 'Карточка';
  appendElement(document.body, 'h1', { textContent: 'Карточка клиента' });
}

export function createNaumenMvsContainer(): {
  cardBlock: HTMLElement;
  cardValue: HTMLElement;
} {
  const iframe = createNaumenMvsEmbeddedAppContainer();
  const iframeDoc = ensureIframeDocument(iframe);
  populateNaumenMvsIframe(iframeDoc);

  const summaryBlock = iframeDoc.getElementById('h_mx_group-service$42839306');
  const cardBlock = iframeDoc.getElementById('dom_card-objectBase$47277013');
  const cardValue = iframeDoc.getElementById('mvs-status-value');

  if (!summaryBlock || !cardBlock || !cardValue) {
    throw new Error('Expected MVS fixture blocks');
  }

  return {
    cardBlock: cardBlock as HTMLElement,
    cardValue: cardValue as HTMLElement,
  };
}
