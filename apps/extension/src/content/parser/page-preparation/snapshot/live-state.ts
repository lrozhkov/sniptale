import type { PreparedSnapshotWarning } from './types';
import { PreparedSnapshotWarningKind } from './types';
import { shouldExcludeWebSnapshotFormControlValue } from '../../../../features/web-snapshot/public';
import { collectOpenShadowQueryRoots } from '../../dom-tree-parser/traversal/virtual-dom.helpers';

const LIVE_STATE_MARKER_ATTRIBUTE = 'data-sniptale-live-state-id';
const LIVE_STATE_SELECTOR = 'canvas, details, dialog, input, option, select, textarea';

interface MarkedLiveStateElement {
  element: Element;
  id: string;
  previousMarker: string | null;
}

interface PreparedSnapshotLiveStateMarks {
  cleanup(): void;
  materialize(snapshot: Document): PreparedSnapshotWarning[];
}

function setBooleanAttribute(element: Element, name: string, enabled: boolean): void {
  if (enabled) element.setAttribute(name, '');
  else element.removeAttribute(name);
}

function copyFormState(source: Element, target: Element): void {
  const tagName = source.tagName.toLowerCase();
  if (tagName === 'input') {
    const input = source as HTMLInputElement;
    if (shouldExcludeWebSnapshotFormControlValue(input)) {
      target.removeAttribute('checked');
      target.removeAttribute('value');
    } else {
      target.setAttribute('value', input.value);
      setBooleanAttribute(target, 'checked', input.checked);
    }
    return;
  }
  if (tagName === 'textarea') {
    if (shouldExcludeWebSnapshotFormControlValue(source)) {
      target.removeAttribute('value');
      target.textContent = '';
    } else target.textContent = (source as HTMLTextAreaElement).value;
    return;
  }
  if (tagName === 'select' && shouldExcludeWebSnapshotFormControlValue(source)) {
    target.removeAttribute('value');
    target.replaceChildren();
    return;
  }
  if (tagName === 'option') {
    const select = source.closest('select');
    if (select && shouldExcludeWebSnapshotFormControlValue(select)) {
      target.removeAttribute('label');
      target.removeAttribute('selected');
      target.removeAttribute('value');
      target.textContent = '';
      return;
    }
    setBooleanAttribute(target, 'selected', (source as HTMLOptionElement).selected);
    return;
  }
  if (tagName === 'details' || tagName === 'dialog') {
    setBooleanAttribute(target, 'open', (source as HTMLDetailsElement | HTMLDialogElement).open);
  }
}

function materializeCanvasState(
  source: HTMLCanvasElement,
  target: Element
): PreparedSnapshotWarning | null {
  try {
    const dataUrl = source.toDataURL('image/png');
    const targetCanvas = target as HTMLElement;
    const existingBackground = targetCanvas.style.backgroundImage.trim();
    targetCanvas.style.setProperty(
      'background-image',
      existingBackground && existingBackground !== 'none'
        ? `url("${dataUrl}"), ${existingBackground}`
        : `url("${dataUrl}")`,
      'important'
    );
    targetCanvas.style.setProperty('background-position', '0 0', 'important');
    targetCanvas.style.setProperty('background-repeat', 'no-repeat', 'important');
    targetCanvas.style.setProperty('background-size', '100% 100%', 'important');
    targetCanvas.setAttribute('data-sniptale-canvas-rasterized', 'true');
    return null;
  } catch {
    return {
      kind: PreparedSnapshotWarningKind.CanvasUnreadable,
      message: 'Canvas pixels could not be retained in the static snapshot.',
      target: '<canvas>',
    };
  }
}

export function markPreparedSnapshotLiveState(
  sourceDocument: Document
): PreparedSnapshotLiveStateMarks {
  const sourceElements = collectOpenShadowQueryRoots(sourceDocument).flatMap((root) =>
    Array.from(root.querySelectorAll(LIVE_STATE_SELECTOR))
  );
  const marked = sourceElements.map((element, index): MarkedLiveStateElement => {
    const previousMarker = element.getAttribute(LIVE_STATE_MARKER_ATTRIBUTE);
    const id = `sniptale-live-${index + 1}`;
    element.setAttribute(LIVE_STATE_MARKER_ATTRIBUTE, id);
    return { element, id, previousMarker };
  });

  return {
    cleanup() {
      for (const item of marked) {
        if (item.previousMarker === null) item.element.removeAttribute(LIVE_STATE_MARKER_ATTRIBUTE);
        else item.element.setAttribute(LIVE_STATE_MARKER_ATTRIBUTE, item.previousMarker);
      }
    },
    materialize(snapshot) {
      const warnings: PreparedSnapshotWarning[] = [];
      for (const item of marked) {
        const target = snapshot.querySelector(`[${LIVE_STATE_MARKER_ATTRIBUTE}="${item.id}"]`);
        if (!target) continue;
        copyFormState(item.element, target);
        if (item.element.tagName.toLowerCase() === 'canvas') {
          const warning = materializeCanvasState(item.element as HTMLCanvasElement, target);
          if (warning) warnings.push(warning);
        }
        target.removeAttribute(LIVE_STATE_MARKER_ATTRIBUTE);
      }
      return warnings;
    },
  };
}
