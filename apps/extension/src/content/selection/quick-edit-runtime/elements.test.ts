// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../platform/dom-host';
import {
  buildEditableElementRecord,
  isQuickEditStyleInspectableElement,
  isQuickEditTextElement,
} from './elements';

function shouldAcceptPlainTextElementsAndRejectExtensionOwnedSurfaces() {
  const editable = document.createElement('div');
  editable.textContent = 'Editable text';
  const ownedHost = document.createElement('div');
  ownedHost.id = CONTENT_ROOT_ID;
  const shadowRoot = ownedHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(shadowRoot);
  document.body.append(ownedHost);
  const ownedButton = document.createElement('button');
  ownedButton.textContent = 'Extension action';
  shadowRoot.append(ownedButton);

  const nonTextContainer = document.createElement('div');
  nonTextContainer.append(document.createElement('span'));

  expect(isQuickEditTextElement(editable)).toBe(true);
  expect(isQuickEditTextElement(nonTextContainer)).toBe(false);
  expect(isQuickEditTextElement(ownedButton)).toBe(false);
}

function shouldCaptureTheOriginalEditableElementRecord() {
  const element = document.createElement('p');
  element.className = 'note';
  element.setAttribute('style', 'color: red;');
  element.textContent = 'Original text';
  element.contentEditable = 'plaintext-only';

  const record = buildEditableElementRecord(element);

  expect(record).toMatchObject({
    element,
    originalText: 'Original text',
    originalInnerHTML: 'Original text',
    originalContentEditable: 'plaintext-only',
    originalClass: 'note',
    originalStyle: 'color: red;',
  });
  expect(record.originalChildNodes).toHaveLength(1);
  expect(record.originalChildNodes?.[0]).not.toBe(element.childNodes[0]);
  expect(record.originalChildNodes?.[0]?.textContent).toBe('Original text');
}

function shouldRecognizeImageAndBlockStyleTargetsWithoutWideningDirectTextEditing() {
  const image = document.createElement('img');
  const section = document.createElement('section');
  section.append(document.createElement('p'));

  expect(isQuickEditTextElement(image)).toBe(false);
  expect(isQuickEditStyleInspectableElement(image)).toBe(true);
  expect(isQuickEditStyleInspectableElement(section)).toBe(true);
}

describe('quick-edit runtime elements', () => {
  it(
    'accepts plain text elements and rejects extension-owned surfaces',
    shouldAcceptPlainTextElementsAndRejectExtensionOwnedSurfaces
  );

  it(
    'captures the original editable element record',
    shouldCaptureTheOriginalEditableElementRecord
  );

  it(
    'recognizes image and block style targets without widening direct text editing',
    shouldRecognizeImageAndBlockStyleTargetsWithoutWideningDirectTextEditing
  );
});
