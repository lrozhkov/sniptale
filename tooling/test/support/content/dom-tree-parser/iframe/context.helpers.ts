import { vi } from 'vitest';

import { appendElement } from './dom.helpers';

export function silenceParserLogging() {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

export function setPageTitleContext() {
  document.title = 'Карточка';
  appendElement(document.body, 'h1', { textContent: 'Карточка клиента' });
}

export function setNaumenSdPageContext() {
  window.history.replaceState({}, '', '/sd/operator/card');
  setPageTitleContext();
}

export function setNaumenPortalPageContext() {
  window.history.replaceState({}, '', '/portal/servicecall/49784');
  setPageTitleContext();
}
