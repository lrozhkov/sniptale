const OFFSCREEN_DOCUMENT_CONTEXT_TYPE =
  'OFFSCREEN_DOCUMENT' satisfies `${chrome.runtime.ContextType}`;
const OFFSCREEN_DOCUMENT_REASON = 'USER_MEDIA' satisfies `${chrome.offscreen.Reason}`;
const PRIVACY_ERASURE_OFFSCREEN_DOCUMENT_REASON =
  'LOCAL_STORAGE' satisfies `${chrome.offscreen.Reason}`;

type OffscreenContextFilter = Omit<chrome.runtime.ContextFilter, 'contextTypes'> & {
  contextTypes: [typeof OFFSCREEN_DOCUMENT_CONTEXT_TYPE];
};
type OffscreenCreateDocumentOptions = Omit<chrome.offscreen.CreateParameters, 'reasons'> & {
  reasons: [typeof OFFSCREEN_DOCUMENT_REASON];
};
type PrivacyErasureOffscreenCreateDocumentOptions = Omit<
  chrome.offscreen.CreateParameters,
  'reasons'
> & {
  reasons: [typeof PRIVACY_ERASURE_OFFSCREEN_DOCUMENT_REASON];
};

export function createOffscreenDocumentContextFilter(): chrome.runtime.ContextFilter {
  return {
    contextTypes: [OFFSCREEN_DOCUMENT_CONTEXT_TYPE],
  } as OffscreenContextFilter as chrome.runtime.ContextFilter;
}

export function createUserMediaOffscreenDocumentOptions(
  offscreenUrl: string,
  justification: string
): chrome.offscreen.CreateParameters {
  return {
    url: offscreenUrl,
    reasons: [OFFSCREEN_DOCUMENT_REASON],
    justification,
  } as OffscreenCreateDocumentOptions as chrome.offscreen.CreateParameters;
}

export function createPrivacyErasureOffscreenDocumentOptions(
  offscreenUrl: string
): chrome.offscreen.CreateParameters {
  return {
    url: offscreenUrl,
    reasons: [PRIVACY_ERASURE_OFFSCREEN_DOCUMENT_REASON],
    justification: 'Erase and verify extension-origin local storage',
  } as PrivacyErasureOffscreenCreateDocumentOptions as chrome.offscreen.CreateParameters;
}
