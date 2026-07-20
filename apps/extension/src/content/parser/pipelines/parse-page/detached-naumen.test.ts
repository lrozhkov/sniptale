// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCapturedPage } from '.';
import type { CapturedPageSnapshot } from '../../page-snapshot/types';

function resetPipelineTestDom(): void {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.title = '';
}

function buildNaumenSnapshotResolver(
  liveRoot: HTMLElement,
  virtualRoot: HTMLElement
): NonNullable<CapturedPageSnapshot['resolveOriginalElement']> {
  const liveByKey = new Map(
    Array.from(liveRoot.querySelectorAll<HTMLElement>('[data-test-key]')).map((element) => [
      element.dataset['testKey'] ?? '',
      element,
    ])
  );

  return (node) => {
    if (!(node instanceof HTMLElement)) {
      return null;
    }

    const testKey = node.dataset['testKey'];
    if (!testKey) {
      return node === virtualRoot ? liveRoot : null;
    }

    return liveByKey.get(testKey) ?? null;
  };
}

function createDetachedNaumenFixture() {
  const table = document.createElement('table');
  table.className = 'attrList';
  table.dataset['testKey'] = 'profile-table';
  const body = document.createElement('tbody');
  const rows = [
    ['Фамилия', 'Иванов', 'last-name-cell', 'last-name-value'],
    ['Имя', 'Лев', 'first-name-cell', 'first-name-value'],
  ] as const;

  rows.forEach(([label, value, cellKey, valueKey]) => {
    const row = document.createElement('tr');
    const titleCell = document.createElement('td');
    const valueCell = document.createElement('td');
    const valueEl = document.createElement('div');

    titleCell.className = 'attrTitle';
    titleCell.textContent = `${label}:`;
    valueCell.className = 'attrValue';
    valueCell.dataset['testKey'] = cellKey;
    valueEl.className = 'stringView';
    valueEl.id = valueKey;
    valueEl.textContent = value;
    valueCell.append(valueEl);
    row.append(titleCell, valueCell);
    body.append(row);
  });

  table.append(body);
  document.body.append(table);

  return {
    liveRoot: document.body,
    virtualRoot: document.body.cloneNode(true) as HTMLElement,
  };
}

function parseDetachedNaumenSnapshot() {
  const { liveRoot, virtualRoot } = createDetachedNaumenFixture();

  return parseCapturedPage({
    iframeReadiness: { pendingIframes: [], timedOut: false, totalIframes: 0 },
    liveRoot,
    virtualRoot,
    resolveOriginalElement: buildNaumenSnapshotResolver(liveRoot, virtualRoot),
    pageUrl: window.location.href,
    pageTitle: document.title,
    pageHostname: window.location.hostname,
    payloads: [],
    pageProfile: {
      vendor: 'naumen-sd-gwt',
      appFamily: 'naumen-sd',
      pageKind: 'object-card-with-dynamic-fields',
      pipelineId: 'naumen-sd-gwt',
      confidence: 0.9,
      matchedSignals: [],
      preferredRoots: [],
    },
    profileTrace: [],
    rootCandidates: [],
    rootSelectionTrace: { candidateSelectors: [] },
  });
}

function registerDetachedNaumenSnapshotTest() {
  it('keeps indexed selectors and live sniptale ids for detached Naumen snapshots', () => {
    const tree = parseDetachedNaumenSnapshot();
    const fields = tree.structure.flatMap((section) =>
      section.children.filter((child) => child.type === 'field')
    );
    const lastNameField = fields.find((field) => field.label === 'Фамилия');
    const firstNameField = fields.find((field) => field.label === 'Имя');

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Фамилия',
          selector: 'table.attrList:nth-of-type(1) tbody tr:nth-child(1) td.attrValue',
        }),
        expect.objectContaining({
          label: 'Имя',
          selector: 'table.attrList:nth-of-type(1) tbody tr:nth-child(2) td.attrValue',
        }),
      ])
    );
    expect(
      document.querySelector('[data-test-key="last-name-cell"]')?.getAttribute('data-sniptale-id')
    ).toBe(lastNameField?.id);
    expect(
      document.querySelector('[data-test-key="first-name-cell"]')?.getAttribute('data-sniptale-id')
    ).toBe(firstNameField?.id);
  });
}

describe('parser pipeline detached Naumen snapshot ownership', () => {
  afterEach(() => {
    resetPipelineTestDom();
  });

  registerDetachedNaumenSnapshotTest();
});
