// policyStateIds: [] - exact live DOM bindings are bounded recovery state and grant no capability.
import {
  findElementBySelector,
  getSniptaleIdCleanupGeneration,
  releaseSniptaleId,
  retainSniptaleId,
} from '../../../platform/frame';
import {
  createCompositeSelector,
  serializeCompositeSelector,
} from '../../../platform/frame/selectors';
import { escapeCssString } from '@sniptale/platform/browser/iframe-selectors/css';
import type { PagePreparationDomElement } from './types';

const HISTORY_LOCATOR_MAX_ATTEMPTS = 32;

interface HistoryLocatorBinding {
  currentId: string;
  locator: string;
  ownerDocument: Document;
  originalId: string | null;
  originalIdCleanupGeneration: number;
}

interface HistoryLocatorAllocationContext {
  element: PagePreparationDomElement;
  generation: number;
  lastAttemptedId: string;
  originalId: string | null;
  originalIdCleanupGeneration: number;
  ownerDocument: Document;
}

type HistoryLocatorAllocationResult =
  | { binding: HistoryLocatorBinding; status: 'allocated' }
  | { status: 'collision' | 'failed' };

let historyLocatorGeneration = 0;
let historyLocatorReleaseDepth = 0;
let pagePreparationHistoryElementId = 0;
const activeHistoryLocatorMutations = new WeakSet<PagePreparationDomElement>();
const historyLocatorBindings = new Map<PagePreparationDomElement, HistoryLocatorBinding>();

export class HistoryLocatorAllocationError extends Error {
  readonly code = 'history-locator-unavailable';

  constructor() {
    super('Unable to allocate an exact history locator for the target element');
    this.name = 'HistoryLocatorAllocationError';
  }
}

function createHistoryIdentitySelector(id: string): string {
  return `[data-sniptale-id="${escapeCssString(id)}"]`;
}

function restoreHistoryLocatorIdentity(
  element: PagePreparationDomElement,
  binding: Pick<HistoryLocatorBinding, 'currentId' | 'originalId' | 'originalIdCleanupGeneration'>
): void {
  if (element.getAttribute('data-sniptale-id') !== binding.currentId) {
    return;
  }

  try {
    if (
      binding.originalId === null ||
      getSniptaleIdCleanupGeneration() !== binding.originalIdCleanupGeneration
    ) {
      element.removeAttribute('data-sniptale-id');
    } else {
      element.setAttribute('data-sniptale-id', binding.originalId);
    }
  } catch {
    // Hostile page reactions cannot turn cleanup into another runtime failure.
  }
}

function withHistoryLocatorReleasePhase<T>(operation: () => T): T {
  historyLocatorReleaseDepth += 1;
  try {
    return operation();
  } finally {
    historyLocatorReleaseDepth -= 1;
  }
}

function releaseHistoryLocatorBinding(
  element: PagePreparationDomElement,
  binding: HistoryLocatorBinding
): void {
  withHistoryLocatorReleasePhase(() => {
    if (historyLocatorBindings.get(element) === binding) {
      historyLocatorBindings.delete(element);
    }
    releaseSniptaleId(binding.currentId);
    restoreHistoryLocatorIdentity(element, binding);
  });
}

function createExactHistoryLocator(
  element: PagePreparationDomElement,
  currentId: string,
  ownerDocument: Document
): string | null {
  if (
    !element.isConnected ||
    element.ownerDocument !== ownerDocument ||
    element.getAttribute('data-sniptale-id') !== currentId
  ) {
    return null;
  }

  try {
    const composite = createCompositeSelector(element);
    if (composite.elementSelector !== createHistoryIdentitySelector(currentId)) {
      return null;
    }

    const locator = serializeCompositeSelector(composite);
    return element.getAttribute('data-sniptale-id') === currentId &&
      findElementBySelector(locator) === element
      ? locator
      : null;
  } catch {
    return null;
  }
}

function isHistoryIdentityCollision(context: HistoryLocatorAllocationContext): boolean {
  const { element, lastAttemptedId, ownerDocument } = context;
  if (
    !element.isConnected ||
    element.ownerDocument !== ownerDocument ||
    element.getAttribute('data-sniptale-id') !== lastAttemptedId
  ) {
    return false;
  }

  try {
    const matches = ownerDocument.querySelectorAll(createHistoryIdentitySelector(lastAttemptedId));
    return matches.length > 1 && Array.from(matches).includes(element);
  } catch {
    return false;
  }
}

function isHistoryLocatorBindingValid(
  element: PagePreparationDomElement,
  binding: HistoryLocatorBinding
): boolean {
  return (
    element.ownerDocument === binding.ownerDocument &&
    createExactHistoryLocator(element, binding.currentId, binding.ownerDocument) === binding.locator
  );
}

function withHistoryLocatorMutationGuard<T>(
  element: PagePreparationDomElement,
  operation: () => T
): T {
  if (activeHistoryLocatorMutations.has(element)) {
    throw new HistoryLocatorAllocationError();
  }

  activeHistoryLocatorMutations.add(element);
  try {
    return operation();
  } finally {
    activeHistoryLocatorMutations.delete(element);
  }
}

function isAllocationContextCurrent(context: HistoryLocatorAllocationContext): boolean {
  return (
    historyLocatorGeneration === context.generation &&
    context.element.isConnected &&
    context.element.ownerDocument === context.ownerDocument
  );
}

function tryAllocateHistoryLocator(
  context: HistoryLocatorAllocationContext
): HistoryLocatorAllocationResult {
  if (!isAllocationContextCurrent(context)) {
    return { status: 'failed' };
  }

  pagePreparationHistoryElementId += 1;
  context.lastAttemptedId = `history-${pagePreparationHistoryElementId}`;
  try {
    context.element.setAttribute('data-sniptale-id', context.lastAttemptedId);
  } catch {
    return { status: 'failed' };
  }

  if (
    !isAllocationContextCurrent(context) ||
    context.element.getAttribute('data-sniptale-id') !== context.lastAttemptedId
  ) {
    return { status: 'failed' };
  }

  const locator = createExactHistoryLocator(
    context.element,
    context.lastAttemptedId,
    context.ownerDocument
  );
  if (!locator) {
    return { status: isHistoryIdentityCollision(context) ? 'collision' : 'failed' };
  }

  if (
    !isAllocationContextCurrent(context) ||
    historyLocatorBindings.has(context.element) ||
    context.element.getAttribute('data-sniptale-id') !== context.lastAttemptedId
  ) {
    return { status: 'failed' };
  }

  const binding: HistoryLocatorBinding = {
    currentId: context.lastAttemptedId,
    locator,
    originalId: context.originalId,
    originalIdCleanupGeneration: context.originalIdCleanupGeneration,
    ownerDocument: context.ownerDocument,
  };
  historyLocatorBindings.set(context.element, binding);
  retainSniptaleId(binding.currentId);
  return { binding, status: 'allocated' };
}

function allocateHistoryLocator(element: PagePreparationDomElement): HistoryLocatorBinding {
  const context: HistoryLocatorAllocationContext = {
    element,
    generation: historyLocatorGeneration,
    lastAttemptedId: '',
    originalId: element.getAttribute('data-sniptale-id'),
    originalIdCleanupGeneration: getSniptaleIdCleanupGeneration(),
    ownerDocument: element.ownerDocument,
  };

  for (let attempt = 0; attempt < HISTORY_LOCATOR_MAX_ATTEMPTS; attempt += 1) {
    const result = tryAllocateHistoryLocator(context);
    if (result.status === 'allocated') {
      return result.binding;
    }
    if (result.status === 'failed') {
      break;
    }
  }

  withHistoryLocatorReleasePhase(() => {
    restoreHistoryLocatorIdentity(element, {
      currentId: context.lastAttemptedId,
      originalId: context.originalId,
      originalIdCleanupGeneration: context.originalIdCleanupGeneration,
    });
  });
  throw new HistoryLocatorAllocationError();
}

function ensureStableHistoryLocatorWithinGuard(element: PagePreparationDomElement): {
  binding: HistoryLocatorBinding;
  isNew: boolean;
} {
  const existingBinding = historyLocatorBindings.get(element);
  if (!existingBinding) {
    return { binding: allocateHistoryLocator(element), isNew: true };
  }
  if (isHistoryLocatorBindingValid(element, existingBinding)) {
    return { binding: existingBinding, isNew: false };
  }

  releaseHistoryLocatorBinding(element, existingBinding);
  throw new HistoryLocatorAllocationError();
}

function ensureStableHistoryLocator(element: PagePreparationDomElement): {
  binding: HistoryLocatorBinding;
  isNew: boolean;
} {
  if (historyLocatorReleaseDepth > 0) {
    throw new HistoryLocatorAllocationError();
  }

  return withHistoryLocatorMutationGuard(element, () =>
    ensureStableHistoryLocatorWithinGuard(element)
  );
}

function releaseAllocatedHistoryLocators(elements: Iterable<PagePreparationDomElement>): void {
  Array.from(elements).forEach((element) => {
    const binding = historyLocatorBindings.get(element);
    if (!binding) {
      return;
    }

    withHistoryLocatorMutationGuard(element, () => {
      releaseHistoryLocatorBinding(element, binding);
    });
  });
}

export function clearHistoryDomLocators(): void {
  historyLocatorGeneration += 1;
  releaseAllocatedHistoryLocators(Array.from(historyLocatorBindings.keys()));
}

export function hasExactHistoryLocatorBinding(
  element: PagePreparationDomElement,
  locator: string
): boolean {
  if (historyLocatorReleaseDepth > 0) {
    return false;
  }

  const binding = historyLocatorBindings.get(element);
  return binding?.locator === locator && isHistoryLocatorBindingValid(element, binding);
}

export function withHistoryLocatorCapture<T>(
  operation: (getLocator: (element: PagePreparationDomElement) => string) => T
): T {
  const allocatedElements = new Set<PagePreparationDomElement>();
  const getLocator = (element: PagePreparationDomElement): string => {
    const result = ensureStableHistoryLocator(element);
    if (result.isNew) {
      allocatedElements.add(element);
    }
    return result.binding.locator;
  };

  try {
    return operation(getLocator);
  } catch (error) {
    releaseAllocatedHistoryLocators(allocatedElements);
    throw error;
  }
}
