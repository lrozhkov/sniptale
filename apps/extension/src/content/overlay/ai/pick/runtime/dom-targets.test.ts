// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findElementBySelectorMock, findElementByTargetMock, findElementByTargetOrSelectorMock } =
  vi.hoisted(() => ({
    findElementBySelectorMock: vi.fn(),
    findElementByTargetMock: vi.fn(),
    findElementByTargetOrSelectorMock: vi.fn(),
  }));

vi.mock('../../../../platform/frame', () => ({
  findElementBySelector: findElementBySelectorMock,
}));

vi.mock('./target-resolution/target-lookup', () => ({
  findElementByTarget: findElementByTargetMock,
  findElementByTargetOrSelector: findElementByTargetOrSelectorMock,
}));

import { createAiPickElementIndex } from './dom-index';
import {
  findElementForTarget,
  getContainingFrameElement,
  registerFieldElement,
  registerTableElements,
} from './dom-targets';

beforeEach(() => {
  vi.clearAllMocks();
  findElementByTargetOrSelectorMock.mockImplementation(
    (nodeId: string, targetRef: unknown, selector?: string) => {
      const targetMatch = findElementByTargetMock(nodeId, targetRef);
      if (targetMatch) {
        return targetMatch;
      }

      return selector ? findElementBySelectorMock(selector) : null;
    }
  );
});

afterEach(() => {
  document.body.replaceChildren();
});

function shouldDelegateTargetLookups(): void {
  const targetRef = { selectors: ['#selector-hit'] };
  const target = document.createElement('div');
  findElementByTargetMock.mockReturnValue(target);

  expect(findElementForTarget('node-1', targetRef as never)).toBe(target);
  expect(findElementByTargetMock).toHaveBeenCalledWith('node-1', targetRef);
}

function shouldRegisterFieldElementsThroughSelectorFallback(): void {
  const index = createAiPickElementIndex();
  const parent = document.createElement('section');
  const element = document.createElement('div');
  parent.appendChild(element);
  document.body.appendChild(parent);
  findElementByTargetMock.mockReturnValue(null);
  findElementBySelectorMock.mockReturnValue(element);

  registerFieldElement(index, {
    id: 'field-1',
    selector: '.field-target',
    targetRef: { selectors: ['.field-target'] },
  } as never);

  expect(index.primaryElements.has(element)).toBe(true);
  expect(index.dataIdToElement.get('field-1')).toBe(element);
  expect(index.elementToDataIds.get(element)).toEqual(new Set(['field-1']));
  expect(index.elementToDataIds.get(parent)).toEqual(new Set(['field-1']));
}

function shouldPreferDirectTargetMatchesForFieldRegistration(): void {
  const index = createAiPickElementIndex();
  const element = document.createElement('div');
  document.body.appendChild(element);
  findElementByTargetMock.mockReturnValue(element);

  registerFieldElement(index, {
    id: 'field-2',
    selector: '.unused-selector',
    targetRef: { selectors: ['.unused-selector'] },
  } as never);

  expect(findElementBySelectorMock).not.toHaveBeenCalled();
  expect(index.primaryElements.has(element)).toBe(true);
  expect(index.dataIdToElement.get('field-2')).toBe(element);
}

function shouldRegisterTableAndRowElements(): void {
  const index = createAiPickElementIndex();
  const tableElement = document.createElement('table');
  const rowParent = document.createElement('div');
  const rowElement = document.createElement('div');
  rowParent.appendChild(rowElement);
  document.body.append(tableElement, rowParent);
  findElementByTargetMock.mockImplementation((nodeId: string) => {
    if (nodeId === 'table-1') {
      return tableElement;
    }
    return null;
  });
  findElementBySelectorMock.mockReturnValue(rowElement);

  registerTableElements(index, {
    id: 'table-1',
    rows: [
      {
        id: 'row-1',
        selector: '.row-target',
        targetRef: { selectors: ['.row-target'] },
      },
    ],
    targetRef: { selectors: ['#table-target'] },
  } as never);

  expect(index.primaryElements.has(tableElement)).toBe(true);
  expect(index.primaryElements.has(rowElement)).toBe(true);
  expect(index.dataIdToElement.get('table-1')).toBe(tableElement);
  expect(index.dataIdToElement.get('row-1')).toBe(rowElement);
  expect(index.elementToDataIds.get(tableElement)).toEqual(new Set(['table-1']));
  expect(index.elementToDataIds.get(rowParent)).toEqual(new Set(['row-1']));
}

function shouldReturnContainingFrameElement(): void {
  const frameElement = document.createElement('iframe');
  const foreignDocument = document.implementation.createHTMLDocument('frame');
  const target = foreignDocument.createElement('div');
  foreignDocument.body.appendChild(target);
  Object.defineProperty(foreignDocument, 'defaultView', {
    configurable: true,
    value: { frameElement },
  });

  expect(getContainingFrameElement(target)).toBe(frameElement);
}

function shouldReturnNullForSameDocumentTargets(): void {
  const target = document.createElement('div');
  document.body.appendChild(target);

  expect(getContainingFrameElement(target)).toBeNull();
}

describe('ai-pick dom targets', () => {
  it(
    'delegates target lookups through the shared target-resolution seam',
    shouldDelegateTargetLookups
  );
  it(
    'registers field elements through selector fallback and records parent ownership',
    shouldRegisterFieldElementsThroughSelectorFallback
  );
  it(
    'prefers direct target matches before selector fallback for field registration',
    shouldPreferDirectTargetMatchesForFieldRegistration
  );
  it(
    'registers table and row elements from the shared lookup seam',
    shouldRegisterTableAndRowElements
  );
  it(
    'returns the containing frame element for cross-document targets',
    shouldReturnContainingFrameElement
  );
  it('returns null for same-document targets', shouldReturnNullForSameDocumentTargets);
});
