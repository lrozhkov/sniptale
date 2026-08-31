import type { PreparedSnapshotWarning } from './types';
import { PreparedSnapshotWarningKind } from './types';
import {
  collectWebSnapshotQueryRoots,
  shouldExcludeWebSnapshotFormControlValue,
  WEB_SNAPSHOT_UNDEFINED_CUSTOM_ELEMENT_ATTRIBUTE,
} from '../../../../features/web-snapshot/public';
import type { VirtualDomOriginalElementResolver } from '../../dom-tree-parser/traversal';

interface PreparedSnapshotLiveStateSource {
  clientHeight: number;
  clientWidth: number;
  scrollLeft: number;
  scrollTop: number;
  source: Element | null;
  tagName: string;
}

interface PreparedSnapshotLiveState {
  materialize(snapshotRoot: ParentNode): PreparedSnapshotWarning[];
}

const SCROLL_STATE_ATTRIBUTE = 'data-sniptale-scroll-state';
const SCROLL_STATE_STYLE_ATTRIBUTE = 'data-sniptale-captured-scroll-state';

function isPotentialCustomElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const definitionName = element.getAttribute('is') ?? tagName;
  return definitionName.includes('-');
}

function isDefinedCustomElement(element: Element): boolean {
  if (!isPotentialCustomElement(element)) return false;
  try {
    return element.matches(':defined');
  } catch {
    return false;
  }
}

function removeSnapshotAttribute(snapshotRoot: ParentNode, attribute: string): void {
  for (const root of collectWebSnapshotQueryRoots(snapshotRoot)) {
    for (const element of root.querySelectorAll(`[${attribute}]`)) {
      element.removeAttribute(attribute);
    }
  }
}

function collectSnapshotElements(snapshotRoot: ParentNode): Element[] {
  return collectWebSnapshotQueryRoots(snapshotRoot).flatMap((root) =>
    Array.from(root.querySelectorAll('*'))
  );
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

function materializeScrollState(
  target: Element,
  clientWidth: number,
  clientHeight: number,
  scrollLeft: number,
  scrollTop: number,
  rules: string[]
): void {
  if (scrollLeft === 0 && scrollTop === 0) return;
  const id = `scroll-${rules.length + 1}`;
  target.setAttribute(SCROLL_STATE_ATTRIBUTE, id);
  const selector = `[${SCROLL_STATE_ATTRIBUTE}="${id}"]`;
  rules.push(
    `${selector}{box-sizing:border-box!important;width:${clientWidth}px!important;height:${clientHeight}px!important;overflow:hidden!important;scrollbar-width:none!important}`,
    `${selector}::-webkit-scrollbar{display:none!important}`,
    `${selector}>*{translate:${-scrollLeft}px ${-scrollTop}px!important}`
  );
}

function appendScrollStateStyle(snapshotRoot: ParentNode, rules: string[]): void {
  if (rules.length === 0) return;
  const ownerDocument = snapshotRoot.ownerDocument ?? (snapshotRoot as Document);
  const style = ownerDocument.createElement('style');
  style.setAttribute(SCROLL_STATE_STYLE_ATTRIBUTE, 'true');
  style.textContent = rules.join('\n');
  ownerDocument.head.appendChild(style);
}

export function capturePreparedSnapshotLiveState(
  virtualRoot: HTMLElement,
  resolveOriginalElement: VirtualDomOriginalElementResolver
): PreparedSnapshotLiveState {
  const sources: PreparedSnapshotLiveStateSource[] = collectSnapshotElements(virtualRoot).map(
    (virtualElement) => {
      const source = resolveOriginalElement(virtualElement);
      return {
        clientHeight: source instanceof HTMLElement ? source.clientHeight : 0,
        clientWidth: source instanceof HTMLElement ? source.clientWidth : 0,
        scrollLeft: source instanceof HTMLElement ? source.scrollLeft : 0,
        scrollTop: source instanceof HTMLElement ? source.scrollTop : 0,
        source: source?.nodeType === Node.ELEMENT_NODE ? (source as Element) : null,
        tagName: virtualElement.tagName,
      };
    }
  );

  return {
    materialize(snapshotRoot) {
      const targets = collectSnapshotElements(snapshotRoot);
      if (
        targets.length !== sources.length ||
        targets.some((target, index) => target.tagName !== sources[index]?.tagName)
      ) {
        throw new Error('Prepared snapshot live-state structure changed during inert import.');
      }

      const warnings: PreparedSnapshotWarning[] = [];
      const scrollStateRules: string[] = [];
      removeSnapshotAttribute(snapshotRoot, WEB_SNAPSHOT_UNDEFINED_CUSTOM_ELEMENT_ATTRIBUTE);
      removeSnapshotAttribute(snapshotRoot, SCROLL_STATE_ATTRIBUTE);
      for (const [index, item] of sources.entries()) {
        const target = targets[index];
        if (!target || !item.source) continue;
        copyFormState(item.source, target);
        if (isPotentialCustomElement(item.source) && !isDefinedCustomElement(item.source)) {
          target.setAttribute(WEB_SNAPSHOT_UNDEFINED_CUSTOM_ELEMENT_ATTRIBUTE, '');
        }
        if (item.source.tagName.toLowerCase() === 'canvas') {
          const warning = materializeCanvasState(item.source as HTMLCanvasElement, target);
          if (warning) warnings.push(warning);
        }
        materializeScrollState(
          target,
          item.clientWidth,
          item.clientHeight,
          item.scrollLeft,
          item.scrollTop,
          scrollStateRules
        );
      }
      appendScrollStateStyle(snapshotRoot, scrollStateRules);
      return warnings;
    },
  };
}
