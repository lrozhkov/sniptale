import { installSnapshotFramePan } from './frame-pan';

type DisclosureProjection = {
  controller: HTMLElement;
  controllerAriaExpanded: string | null;
  controllerClass: string | null;
  initiallyOpen: boolean;
  open: boolean;
  owner: HTMLElement;
  ownerStyle: string | null;
  region: HTMLElement;
  regionHiddenAttribute: string | null;
  regionStyle: string | null;
  regionClass: string | null;
};

const DISCLOSURE_STATE_CLASS =
  /^(?:closed|collapsed|folded|hidden|is-collapsed|is-hidden|.*__bodyHidden)$/iu;
const OPEN_CONTROL_STATE_CLASS = /__visibilityControlOpen$/u;
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

function findImplicitSiblingRegion(
  controller: HTMLElement,
  allowVisibleRegion: boolean
): {
  owner: HTMLElement;
  region: HTMLElement;
} | null {
  const view = controller.ownerDocument.defaultView;
  if (view?.getComputedStyle(controller).cursor !== 'pointer') return null;
  let owner = controller.parentElement;
  for (let depth = 0; owner && depth < 6; depth += 1, owner = owner.parentElement) {
    const directController = findDirectChild(owner, controller);
    if (!directController) continue;
    const siblings = Array.from(owner.children);
    const controllerIndex = siblings.indexOf(directController);
    for (const candidate of siblings.slice(controllerIndex + 1)) {
      const region = candidate as HTMLElement;
      if (
        typeof region.style === 'object' &&
        hasMeaningfulContent(region) &&
        (allowVisibleRegion || isVisuallyHidden(region))
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
  const hasOpenState =
    controller.getAttribute('aria-expanded') === 'true' ||
    Array.from(controller.classList).some((className) =>
      OPEN_CONTROL_STATE_CLASS.test(className)
    ) ||
    DIRECTIONAL_CLASS_PAIRS.some(([, openClass]) => controller.classList.contains(openClass));
  const implicit = explicitRegion
    ? { owner: explicitRegion.parentElement, region: explicitRegion }
    : findImplicitSiblingRegion(controller, hasOpenState);
  if (!implicit?.owner) return null;
  const initiallyOpen = !isVisuallyHidden(implicit.region);
  if (initiallyOpen && !explicitRegion && !hasOpenState) return null;
  return {
    controller,
    controllerAriaExpanded: controller.getAttribute('aria-expanded'),
    controllerClass: controller.getAttribute('class'),
    initiallyOpen,
    open: initiallyOpen,
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

function projectDirectionalClass(controller: HTMLElement, open: boolean): void {
  for (const [closedClass, openClass] of DIRECTIONAL_CLASS_PAIRS) {
    const from = open ? closedClass : openClass;
    const to = open ? openClass : closedClass;
    if (!controller.classList.contains(from)) continue;
    controller.classList.replace(from, to);
    return;
  }
  const openStateClass = Array.from(controller.classList).find((className) =>
    OPEN_CONTROL_STATE_CLASS.test(className)
  );
  if (!open) {
    if (openStateClass) controller.classList.remove(openStateClass);
    return;
  }
  if (openStateClass) return;
  const baseClass = Array.from(controller.classList).find((className) =>
    className.endsWith('__visibilityControl')
  );
  if (baseClass) controller.classList.add(`${baseClass}Open`);
}

function restoreDisclosure(projection: DisclosureProjection): void {
  restoreAttribute(projection.region, 'class', projection.regionClass);
  restoreAttribute(projection.region, 'style', projection.regionStyle);
  restoreAttribute(projection.region, 'hidden', projection.regionHiddenAttribute);
  restoreAttribute(projection.owner, 'style', projection.ownerStyle);
  restoreAttribute(projection.controller, 'class', projection.controllerClass);
  restoreAttribute(projection.controller, 'aria-expanded', projection.controllerAriaExpanded);
  projection.open = projection.initiallyOpen;
}

function openDisclosure(projection: DisclosureProjection): void {
  if (projection.initiallyOpen) {
    restoreDisclosure(projection);
    return;
  }
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
  projectDirectionalClass(projection.controller, true);
  const ownerRect = projection.owner.getBoundingClientRect();
  const regionRect = projection.region.getBoundingClientRect();
  if (regionRect.bottom > ownerRect.bottom + 1) {
    projection.owner.style.setProperty('height', 'auto', 'important');
    projection.owner.style.setProperty('overflow', 'visible', 'important');
  }
  projection.open = true;
}

function closeDisclosure(projection: DisclosureProjection): void {
  if (!projection.initiallyOpen) {
    restoreDisclosure(projection);
    return;
  }
  projection.region.setAttribute('hidden', '');
  projection.region.style.setProperty('display', 'none', 'important');
  projection.controller.setAttribute('aria-expanded', 'false');
  projectDirectionalClass(projection.controller, false);
  projection.open = false;
}

/**
 * Adds a bounded, extension-owned interaction layer to an inert snapshot document.
 * It never executes archived code: only clipped scrolling and unambiguous disclosure state are
 * projected onto already-sanitized DOM.
 */
export function installSnapshotFrameStaticInteractions(
  iframe: HTMLIFrameElement | null,
  options: { dragHint?: string } = {}
): () => void {
  const doc = iframe?.contentDocument;
  if (!doc) return () => undefined;
  const disclosures = new Map<HTMLElement, DisclosureProjection>();
  const cleanupPan = installSnapshotFramePan(doc, options.dragHint);
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

  doc.addEventListener('click', handleClick, true);
  return () => {
    doc.removeEventListener('click', handleClick, true);
    cleanupPan();
    for (const projection of disclosures.values()) restoreDisclosure(projection);
  };
}
