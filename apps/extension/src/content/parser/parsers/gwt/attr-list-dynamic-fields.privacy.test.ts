// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../types';
import {
  buildDynamicIframeFieldNodes,
  extractVirtualDynamicFieldsContent,
  extractVirtualDynamicFieldsText,
} from './attr-list-dynamic-fields.helpers';

function createTraversalContext(): TraversalContext {
  return {
    currentSection: null,
    globalFieldIndex: 0,
    globalTableIndex: 0,
    processedAttrLists: new Set<HTMLTableElement>(),
    processedCommentContainers: new Set<HTMLElement>(),
    processedComments: new Set<HTMLElement>(),
    processedFieldElements: new Set<HTMLElement>(),
    processedTables: new Set<HTMLTableElement>(),
    result: { context: '', structure: [], title: '' },
    sectionElements: [],
    sectionIndex: 0,
  };
}

function appendDynamicField(
  root: ParentNode,
  options: { id: string; label: string; value: string }
) {
  const field = document.createElement('div');
  field.id = options.id;
  field.className = 'FormField-EA__field FormField-EA__fieldRead';

  const info = document.createElement('div');
  info.className = 'FormField-EA__fieldInfo';
  const label = document.createElement('span');
  label.textContent = options.label;
  info.append(label);
  field.append(info);

  const body = document.createElement('div');
  body.className = 'FormField-EA__fieldBody';
  body.textContent = options.value;
  field.append(body);
  root.append(field);
}

const SENSITIVE_DYNAMIC_ROWS = [
  ['row-password', 'Password', 'password-marker'],
  ['row-hidden-token', 'Hidden token', 'hidden-token-marker'],
  ['row-otp', 'OTP', 'otp-marker'],
  ['row-csrf', 'CSRF token', 'csrf-marker'],
  ['row-bearer', 'Authorization', 'Bearer bearer-marker'],
  ['row-api-key', 'API key', 'api-key-marker'],
  ['row-email', 'Email', 'email-marker@example.test'],
  ['row-phone', 'Phone', '+1 555 0100'],
  ['row-visible', 'Display name', 'Alice'],
] as const;

const SENSITIVE_DYNAMIC_MARKERS = [
  'password-marker',
  'hidden-token-marker',
  'otp-marker',
  'csrf-marker',
  'bearer-marker',
  'api-key-marker',
  'email-marker@example.test',
  '+1 555 0100',
] as const;

function createVirtualContainer() {
  const virtualContainer = document.createElement('div');
  SENSITIVE_DYNAMIC_ROWS.forEach(([id, label, value]) =>
    appendDynamicField(virtualContainer, { id, label, value })
  );
  return virtualContainer;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('gwt dynamic fields helper privacy', () => {
  it('redacts sensitive dynamic field values before parser output', () => {
    const virtualContainer = createVirtualContainer();
    const fields = extractVirtualDynamicFieldsContent(virtualContainer, createTraversalContext());

    const outputText = JSON.stringify(fields);
    SENSITIVE_DYNAMIC_MARKERS.forEach((marker) => expect(outputText).not.toContain(marker));
    expect(fields?.find((field) => field.label === 'Password')?.value).toBe('[redacted]');
  });

  it('redacts sensitive dynamic field values before text serialization', () => {
    const serializedText = extractVirtualDynamicFieldsText(createVirtualContainer());

    SENSITIVE_DYNAMIC_MARKERS.forEach((marker) => expect(serializedText).not.toContain(marker));
    expect(serializedText).toContain('Alice');
  });

  it('redacts sensitive values when building dynamic iframe field nodes directly', () => {
    const sourceElement = document.createElement('div');
    sourceElement.id = 'source-password';
    document.body.appendChild(sourceElement);

    const [field] = buildDynamicIframeFieldNodes([
      {
        id: 'field-source-password',
        label: 'Password',
        linkRef: 'https://example.test/?token=node-link-secret',
        sourceElement,
        value: 'node-secret',
        valueType: 'link',
      },
    ]);

    expect(field).toEqual(
      expect.objectContaining({
        id: 'field-source-password',
        label: 'Password',
        value: '[redacted]',
      })
    );
    expect(JSON.stringify(field)).not.toContain('node-secret');
    expect(JSON.stringify(field)).not.toContain('node-link-secret');
  });
});
