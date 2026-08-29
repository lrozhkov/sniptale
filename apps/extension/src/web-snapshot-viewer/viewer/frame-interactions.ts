type Axis = 'x' | 'y';

type DisclosureProjection = {
  controller: HTMLElement;
  controllerAriaExpanded: string | null;
  controllerClass: string | null;
  open: boolean;
  owner: HTMLElement;
  ownerStyle: string | null;
  region: HTMLElement;
  regionHiddenAttribute: string | null;
  regionStyle: string | null;
  regionClass: string | null;
};

const DISCLOSURE_STATE_CLASS = /^(?:closed|collapsed|folded|hidden|is-collapsed|is-hidden)$/iu;
const DIRECTIONAL_CLASS_PAIRS = [
  ['down', 'up'],
  ['arrow-down', 'arrow-up'],
  ['chevron-down', 'chevron-up'],
  ['icon-chevron-down', 'icon-chevron-up'],
] as const;

function toElement(target: EventTarget | null): HTMLElement | null {
  if (!target || (target as Node).nodeType !== Node.ELEMENT_NODE) return null;
  const element = target as HTMLElement;
  return typeof element.closest === 'function' ? element : null;
}

function isClippedScrollable(element: HTMLElement, axis: Axis): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return false;
  const overflow = axis === 'x' ? style.overflowX : style.overflowY;
  const extent =
    axis === 'x'
      ? element.scrollWidth - element.clientWidth
      : element.scrollHeight - element.clientHeight;
  return overflow === 'hidden' && extent > 2;
}

function findClippedScrollableAncestor(target: HTMLElement, axis: Axis): HTMLElement | null {
  let current: HTMLElement | null = target;
  while (current && current !== current.ownerDocument.body) {
    if (isClippedScrollable(current, axis)) return current;
    current = current.parentElement;
  }
  return current && isClippedScrollable(current, axis) ? current : null;
}

function moveClippedScroller(element: HTMLElement, axis: Axis, delta: number): boolean {
  const position = axis === 'x' ? element.scrollLeft : element.scrollTop;
  const maximum =
    axis === 'x'
      ? Math.max(0, element.scrollWidth - element.clientWidth)
      : Math.max(0, element.scrollHeight - element.clientHeight);
  const next = Math.max(0, Math.min(maximum, position + delta));
  if (next === position) return false;
  if (axis === 'x') element.scrollLeft = next;
  else element.scrollTop = next;
  return true;
}

function isVisuallyHidden(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    element.hasAttribute('hidden') || style?.display === 'none' || style?.visibility === 'hidden'
  );
}

function hasMeaningfulContent(element: HTMLElement): boolean {
  return (element.textContent?.trim().length ?? 0) > 0 || element.childElementCount > 0;
}

function findDirectChild(owner: HTMLElement, descendant: HTMLElement): HTMLElement | null {
  for (const child of Array.from(owner.children)) {
    if (child === descendant || child.contains(descendant)) return child as HTMLElement;
  }
  return null;
}

function findExplicitAriaRegion(controller: HTMLElement): HTMLElement | null {
  const controlledId = controller.getAttribute('aria-controls')?.trim();
  if (!controlledId || /\s/u.test(controlledId)) return null;
  const region = controller.ownerDocument.getElementById(controlledId);
  return region &&
    typeof region.style === 'object' &&
    region !== controller &&
    !region.contains(controller)
    ? (region as HTMLElement)
    : null;
}

function findImplicitSiblingRegion(controller: HTMLElement): {
  owner: HTMLElement;
  region: HTMLElement;
} | null {
  const view = controller.ownerDocument.defaultView;
  if (view?.getComputedStyle(controller).cursor !== 'pointer') return null;
  let owner = controller.parentElement;
  for (let depth = 0; owner && depth < 4; depth += 1, owner = owner.parentElement) {
    const directController = findDirectChild(owner, controller);
    if (!directController) continue;
    const siblings = Array.from(owner.children);
    const controllerIndex = siblings.indexOf(directController);
    for (const candidate of siblings.slice(controllerIndex + 1)) {
      const region = candidate as HTMLElement;
      if (
        typeof region.style === 'object' &&
        hasMeaningfulContent(region) &&
        isVisuallyHidden(region)
      ) {
        return { owner, region };
      }
    }
  }
  return null;
}

function createDisclosureProjection(controller: HTMLElement): DisclosureProjection | null {
  if (controller.closest('a, input, select, textarea, label, [contenteditable="true"]'))
    return null;
  const explicitRegion = findExplicitAriaRegion(controller);
  const implicit = explicitRegion
    ? { owner: explicitRegion.parentElement, region: explicitRegion }
    : findImplicitSiblingRegion(controller);
  if (!implicit?.owner || !isVisuallyHidden(implicit.region)) return null;
  return {
    controller,
    controllerAriaExpanded: controller.getAttribute('aria-expanded'),
    controllerClass: controller.getAttribute('class'),
    open: false,
    owner: implicit.owner,
    ownerStyle: implicit.owner.getAttribute('style'),
    region: implicit.region,
    regionHiddenAttribute: implicit.region.getAttribute('hidden'),
    regionStyle: implicit.region.getAttribute('style'),
    regionClass: implicit.region.getAttribute('class'),
  };
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function projectDirectionalClass(controller: HTMLElement): void {
  for (const [closedClass, openClass] of DIRECTIONAL_CLASS_PAIRS) {
    if (!controller.classList.contains(closedClass)) continue;
    controller.classList.replace(closedClass, openClass);
    return;
  }
}

function openDisclosure(projection: DisclosureProjection): void {
  projection.region.removeAttribute('hidden');
  for (const className of Array.from(projection.region.classList)) {
    if (DISCLOSURE_STATE_CLASS.test(className)) projection.region.classList.remove(className);
  }
  const regionStyle = projection.region.ownerDocument.defaultView?.getComputedStyle(
    projection.region
  );
  if (regionStyle?.display === 'none') {
    projection.region.style.setProperty('display', 'block', 'important');
  }
  if (regionStyle?.visibility === 'hidden') {
    projection.region.style.setProperty('visibility', 'visible', 'important');
  }
  projection.controller.setAttribute('aria-expanded', 'true');
  projectDirectionalClass(projection.controller);
  const ownerRect = projection.owner.getBoundingClientRect();
  const regionRect = projection.region.getBoundingClientRect();
  if (regionRect.bottom > ownerRect.bottom + 1) {
    projection.owner.style.setProperty('height', 'auto', 'important');
    projection.owner.style.setProperty('overflow', 'visible', 'important');
  }
  projection.open = true;
}

function closeDisclosure(projection: DisclosureProjection): void {
  restoreAttribute(projection.region, 'class', projection.regionClass);
  restoreAttribute(projection.region, 'style', projection.regionStyle);
  restoreAttribute(projection.region, 'hidden', projection.regionHiddenAttribute);
  restoreAttribute(projection.owner, 'style', projection.ownerStyle);
  restoreAttribute(projection.controller, 'class', projection.controllerClass);
  restoreAttribute(projection.controller, 'aria-expanded', projection.controllerAriaExpanded);
  projection.open = false;
}

/**
 * Adds a bounded, extension-owned interaction layer to an inert snapshot document.
 * It never executes archived code: only clipped scrolling and unambiguous disclosure state are
 * projected onto already-sanitized DOM.
 */
export function installSnapshotFrameStaticInteractions(
  iframe: HTMLIFrameElement | null
): () => void {
  const doc = iframe?.contentDocument;
  if (!doc) return () => undefined;
  const disclosures = new Map<HTMLElement, DisclosureProjection>();

  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey) return;
    const target = toElement(event.target);
    if (!target) return;
    const horizontal = findClippedScrollableAncestor(target, 'x');
    const vertical = findClippedScrollableAncestor(target, 'y');
    const horizontalDelta = event.deltaX || (event.shiftKey || !vertical ? event.deltaY : 0);
    if (
      horizontal &&
      horizontalDelta !== 0 &&
      moveClippedScroller(horizontal, 'x', horizontalDelta)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (vertical && event.deltaY !== 0 && moveClippedScroller(vertical, 'y', event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const handleClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.defaultPrevented) return;
    const target = toElement(event.target);
    if (!target || target.closest('a')) return;
    const existing = Array.from(disclosures.values()).find((item) =>
      item.controller.contains(target)
    );
    const projection = existing ?? createDisclosureProjection(target);
    if (!projection) return;
    if (!existing) disclosures.set(projection.controller, projection);
    if (projection.open) closeDisclosure(projection);
    else openDisclosure(projection);
    event.preventDefault();
    event.stopPropagation();
  };

  doc.addEventListener('wheel', handleWheel, { capture: true, passive: false });
  doc.addEventListener('click', handleClick, true);
  return () => {
    doc.removeEventListener('wheel', handleWheel, true);
    doc.removeEventListener('click', handleClick, true);
    for (const projection of disclosures.values()) closeDisclosure(projection);
  };
}
