import { expect, it } from 'vitest';
import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import type { TableNode } from '@sniptale/runtime-contracts/dom-tree';
import { formatDataForAI, formatDataForAIJSON } from './editable-format';

type SectionChild = ParsedDocument['structure'][number]['children'][number];
type UnsafeFieldFixture = {
  evidence?: Array<{ confidence: number; locator: string; source: 'dom' | 'virtual-dom' }>;
  id: string;
  label: string;
  targetSelectors?: string[];
  value: string;
};

function createSecretTable(): TableNode {
  return {
    type: 'table',
    id: 'table-secrets',
    headers: ['Name', 'Value'],
    rows: [
      {
        id: 'row-api-key',
        selected: true,
        data: { Name: 'API key', Value: 'opaque-secret' },
        cellTypes: { Name: 'string', Value: 'string' },
        selector: '#row-api-key',
      },
      {
        id: 'row-otp',
        selected: true,
        data: { Name: 'OTP', Value: '123456' },
        cellTypes: { Name: 'string', Value: 'string' },
        selector: '#row-otp',
      },
      {
        id: 'row-authorization',
        selected: true,
        data: { Name: 'Authorization', Value: 'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==' },
        cellTypes: { Name: 'string', Value: 'string' },
        selector: '#row-authorization',
      },
      {
        id: 'row-display',
        selected: true,
        data: { Name: 'Display name', Value: 'Alice' },
        cellTypes: { Name: 'string', Value: 'string' },
        selector: '#row-display',
      },
    ],
  };
}

function createTablePrivacyFixture(): ParsedDocument {
  return {
    context: 'test',
    title: 'Secrets table',
    structure: [
      {
        type: 'section',
        id: 'section-secrets',
        title: 'Settings',
        children: [createSecretTable()],
      },
    ],
    meta: {
      profile: {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.8,
        matchedSignals: [],
        preferredRoots: ['body'],
      },
      title: 'Secrets table',
      url: 'https://example.test/settings',
      warnings: [],
    },
  };
}

function createUnsafeFieldFixture(args: UnsafeFieldFixture): SectionChild {
  return {
    type: 'field',
    id: args.id,
    label: args.label,
    selected: true,
    value: args.value,
    valueType: 'string',
    ...(args.evidence === undefined ? {} : { evidence: args.evidence }),
    ...(args.targetSelectors === undefined
      ? {}
      : {
          targetRef: {
            anchorStrategy: 'selector-chain',
            editable: true,
            realmId: 'document',
            selectors: args.targetSelectors,
          },
        }),
  };
}

function createUnsafeProvenanceFields(): SectionChild[] {
  return [
    createUnsafeFieldFixture({
      id: 'field-safe',
      label: 'Display name',
      value: 'Alice',
      evidence: [{ confidence: 1, locator: '#display-name', source: 'dom' }],
    }),
    createUnsafeFieldFixture({
      id: 'field-contenteditable',
      label: 'Editor note',
      value: 'contenteditable-code-123456',
      evidence: [{ confidence: 1, locator: '[contenteditable="true"]', source: 'dom' }],
    }),
    createUnsafeFieldFixture({
      id: 'field-shadow',
      label: 'Widget text',
      value: 'shadow-widget-secret',
      evidence: [{ confidence: 1, locator: 'shadow-root #token', source: 'dom' }],
    }),
    createUnsafeFieldFixture({
      id: 'field-frame',
      label: 'Frame text',
      value: 'iframe-session-value',
      evidence: [{ confidence: 1, locator: 'iframe#auth => #session', source: 'virtual-dom' }],
    }),
    createUnsafeFieldFixture({
      id: 'field-custom-widget',
      label: 'Support widget',
      value: 'custom-widget-code',
      targetSelectors: ['[role="textbox"]'],
    }),
  ];
}

function createUnsafeProvenanceTable(): SectionChild {
  return {
    type: 'table',
    id: 'table-rows',
    headers: ['Name', 'Value'],
    rows: [
      {
        id: 'row-safe',
        selected: true,
        data: { Name: 'Project', Value: 'Launch' },
        selector: '#row-safe',
      },
      {
        id: 'row-iframe',
        selected: true,
        data: { Name: 'Session', Value: 'iframe-row-session' },
        evidence: [{ confidence: 1, locator: '[data-virtual-iframe="true"] #row', source: 'dom' }],
        selector: '#row-iframe',
      },
      {
        id: 'row-selector-only',
        selected: true,
        data: { Name: 'Widget', Value: 'selector-only-widget-code' },
        selector: '[role="textbox"] tr:nth-child(2)',
      },
    ],
  };
}

function createUnsafeProvenanceFixture(): ParsedDocument {
  return {
    context: 'test',
    title: 'Unsafe provenance',
    structure: [
      {
        type: 'section',
        id: 'section-provenance',
        title: 'Profile',
        children: [...createUnsafeProvenanceFields(), createUnsafeProvenanceTable()],
      },
    ],
  };
}

it('redacts key-value table secret cells before AI payload formatting', () => {
  const jsonPayload = formatDataForAIJSON(createTablePrivacyFixture());
  const markdownPayload = formatDataForAI(createTablePrivacyFixture());
  const parsed = JSON.parse(jsonPayload) as {
    t: Array<{ r: Array<{ id: string; d: Record<string, string>; new: Record<string, string> }> }>;
  };

  expect(jsonPayload).not.toContain('opaque-secret');
  expect(jsonPayload).not.toContain('123456');
  expect(jsonPayload).not.toContain('QWxhZGRpbjpvcGVuIHNlc2FtZQ');
  expect(markdownPayload).not.toContain('opaque-secret');
  expect(markdownPayload).not.toContain('123456');
  expect(markdownPayload).not.toContain('QWxhZGRpbjpvcGVuIHNlc2FtZQ');
  expect(markdownPayload).not.toContain('new_2. Value');
  expect(parsed.t[0]?.r).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'row-api-key',
        d: expect.objectContaining({ Name: 'API key', Value: '[redacted]' }),
        new: expect.not.objectContaining({ Value: '' }),
      }),
      expect.objectContaining({
        id: 'row-otp',
        d: expect.objectContaining({ Name: 'OTP', Value: '[redacted]' }),
        new: expect.not.objectContaining({ Value: '' }),
      }),
      expect.objectContaining({
        id: 'row-authorization',
        d: expect.objectContaining({ Name: 'Authorization', Value: '[redacted]' }),
        new: expect.not.objectContaining({ Value: '' }),
      }),
      expect.objectContaining({
        id: 'row-display',
        d: expect.objectContaining({ Name: 'Display name', Value: 'Alice' }),
        new: expect.objectContaining({ Value: '' }),
      }),
    ])
  );
  expect(markdownPayload).toContain('Alice');
});

it('omits unsafe provenance fields and rows before AI payload formatting', () => {
  const jsonPayload = formatDataForAIJSON(createUnsafeProvenanceFixture());
  const markdownPayload = formatDataForAI(createUnsafeProvenanceFixture());

  expect(jsonPayload).toContain('Alice');
  expect(jsonPayload).toContain('Launch');
  expect(markdownPayload).toContain('Alice');
  expect(markdownPayload).toContain('Launch');
  for (const forbidden of [
    'contenteditable-code-123456',
    'shadow-widget-secret',
    'iframe-session-value',
    'custom-widget-code',
    'iframe-row-session',
    'selector-only-widget-code',
  ]) {
    expect(jsonPayload).not.toContain(forbidden);
    expect(markdownPayload).not.toContain(forbidden);
  }
});
