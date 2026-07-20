import {
  isPageStyleInspectorTab,
  type PageStyleInspectorTab,
} from '@sniptale/runtime-contracts/page-style';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

const PAGE_STYLE_INSPECTOR_OPEN_EVENT = 'sniptale-page-style-inspector-open';
const pageStyleInspectorEventTarget = new EventTarget();

interface PageStyleInspectorOpenEventDetail {
  targetTab: PageStyleInspectorTab;
}

export function dispatchPageStyleInspectorOpen(targetTab: PageStyleInspectorTab): void {
  pageStyleInspectorEventTarget.dispatchEvent(
    new CustomEvent<PageStyleInspectorOpenEventDetail>(PAGE_STYLE_INSPECTOR_OPEN_EVENT, {
      detail: { targetTab },
    })
  );
}

export function addPageStyleInspectorOpenListener(
  listener: (detail: PageStyleInspectorOpenEventDetail) => void
): () => void {
  const wrappedListener = (event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    const detail: unknown = event.detail;
    if (!isRecord(detail) || !isPageStyleInspectorTab(detail['targetTab'])) {
      return;
    }

    listener({ targetTab: detail['targetTab'] });
  };

  pageStyleInspectorEventTarget.addEventListener(PAGE_STYLE_INSPECTOR_OPEN_EVENT, wrappedListener);
  return () => {
    pageStyleInspectorEventTarget.removeEventListener(
      PAGE_STYLE_INSPECTOR_OPEN_EVENT,
      wrappedListener
    );
  };
}
