import { clickHostPageElement } from '../host-page-click';
import {
  clearDomDriverTimeout,
  resolveMutationObserverConstructor,
  scheduleDomDriverTimeout,
} from './dom-runtime';
import { FILE_PREVIEW_POPUP_SELECTORS, resolveVisibleFilePreviewPopup } from './dom-driver';

type ResolveFilePreviewUrlArgs = {
  trigger: HTMLElement;
  fallbackUrl: string | null;
  timeoutMs?: number;
  targetDocument?: Document;
  onTriggerError?: (error: unknown) => void;
};

type PreviewResolutionState = {
  resolved: boolean;
  timeoutId: ReturnType<typeof globalThis.setTimeout> | null;
};

function closePopupElement(popup: HTMLElement | null): void {
  const closeButton = popup?.querySelector(FILE_PREVIEW_POPUP_SELECTORS.modalClose);
  if (!(closeButton instanceof HTMLElement)) {
    return;
  }

  clickHostPageElement(closeButton);
}

function observePreviewPopupResolution(args: {
  targetDocument: Document;
  onResolved: (url: string) => void;
}): MutationObserver | null {
  const MutationObserverConstructor = resolveMutationObserverConstructor(args.targetDocument);
  if (!MutationObserverConstructor) {
    return null;
  }

  return new MutationObserverConstructor(() => {
    const popupState = resolveVisibleFilePreviewPopup(args.targetDocument);
    if (!popupState?.resolvedUrl) {
      return;
    }

    closePopupElement(popupState.popup);
    args.onResolved(popupState.resolvedUrl);
  });
}

function resolvePreviewFallback(args: {
  fallbackUrl: string | null;
  observer: MutationObserver | null;
  resolve: (url: string | null) => void;
  state?: PreviewResolutionState;
}): void {
  if (args.state) {
    args.state.resolved = true;
  }
  args.observer?.disconnect();
  args.resolve(args.fallbackUrl);
}

function resolvePreviewUrl(args: {
  observer: MutationObserver | null;
  resolve: (url: string | null) => void;
  state: PreviewResolutionState;
  targetDocument: Document;
  url: string;
}): void {
  if (args.state.resolved) {
    return;
  }

  args.state.resolved = true;
  if (args.state.timeoutId !== null) {
    clearDomDriverTimeout(args.state.timeoutId, args.targetDocument);
  }
  args.observer?.disconnect();
  args.resolve(args.url);
}

function handlePreviewTriggerClick(args: {
  fallbackUrl: string | null;
  observer: MutationObserver | null;
  onTriggerError?: (error: unknown) => void;
  resolve: (url: string | null) => void;
  trigger: HTMLElement;
}): boolean {
  try {
    const clickResult = clickHostPageElement(args.trigger);
    if (clickResult.clicked) {
      return true;
    }
  } catch (error) {
    args.onTriggerError?.(error);
    return true;
  }

  resolvePreviewFallback(args);
  return false;
}

function schedulePreviewFallbackTimeout(args: {
  fallbackUrl: string | null;
  observer: MutationObserver | null;
  resolve: (url: string | null) => void;
  state: PreviewResolutionState;
  targetDocument: Document;
  timeoutMs: number;
}): void {
  args.state.timeoutId = scheduleDomDriverTimeout(
    () => {
      if (!args.state.resolved) {
        resolvePreviewFallback(args);
      }
    },
    args.timeoutMs,
    args.targetDocument
  );
}

function startFilePreviewUrlResolution(args: {
  trigger: HTMLElement;
  fallbackUrl: string | null;
  timeoutMs: number;
  targetDocument: Document;
  onTriggerError?: (error: unknown) => void;
  resolve: (url: string | null) => void;
}): void {
  closePopupElement(resolveVisibleFilePreviewPopup(args.targetDocument)?.popup ?? null);

  const state: PreviewResolutionState = { resolved: false, timeoutId: null };
  const observer = observePreviewPopupResolution({
    targetDocument: args.targetDocument,
    onResolved: (url) => {
      resolvePreviewUrl({
        observer,
        resolve: args.resolve,
        state,
        targetDocument: args.targetDocument,
        url,
      });
    },
  });
  observer?.observe(args.targetDocument.body, { childList: true, subtree: true });
  if (
    !handlePreviewTriggerClick({
      fallbackUrl: args.fallbackUrl,
      observer,
      resolve: args.resolve,
      trigger: args.trigger,
      ...(args.onTriggerError === undefined ? {} : { onTriggerError: args.onTriggerError }),
    })
  ) {
    return;
  }
  schedulePreviewFallbackTimeout({ ...args, observer, state });
}

/** Resolves a file-preview download URL by interacting with the popup boundary seam. */
export async function resolveFilePreviewUrlFromTrigger(
  args: ResolveFilePreviewUrlArgs
): Promise<string | null> {
  const {
    trigger,
    fallbackUrl,
    timeoutMs = 3000,
    targetDocument = document,
    onTriggerError,
  } = args;

  return new Promise((resolve) => {
    startFilePreviewUrlResolution({
      fallbackUrl,
      resolve,
      targetDocument,
      timeoutMs,
      trigger,
      ...(onTriggerError === undefined ? {} : { onTriggerError }),
    });
  });
}
