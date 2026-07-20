// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getSelector } from './dom-helpers-selectors';

function registerIframeCompositeSelectorTest() {
  it('builds a composite selector for iframe-owned attrList fields', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'dynamic-fields-frame';
    document.body.append(iframe);

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc?.body || !iframe.contentWindow) {
      throw new Error('Expected iframe document');
    }

    Object.defineProperty(iframe.contentWindow, 'frameElement', {
      configurable: true,
      value: iframe,
    });

    const table = iframeDoc.createElement('table');
    table.className = 'attrList';
    const body = iframeDoc.createElement('tbody');
    const row = iframeDoc.createElement('tr');
    const captionCell = iframeDoc.createElement('td');
    const valueCell = iframeDoc.createElement('td');

    captionCell.className = 'attrTitle';
    valueCell.className = 'attrValue';
    row.append(captionCell, valueCell);
    body.append(row);
    table.append(body);
    iframeDoc.body.append(table);

    expect(getSelector(valueCell)).toBe(
      'iframe#dynamic-fields-frame => table.attrList:nth-of-type(1) tbody tr:nth-child(1) td.attrValue'
    );
  });
}

function registerDetachedSnapshotSelectorTests() {
  it('keeps indexed selectors for detached snapshot roots', () => {
    const virtualRoot = document.body.cloneNode(false) as HTMLElement;
    const table = document.createElement('table');
    table.className = 'attrList';
    const body = document.createElement('tbody');
    const firstRow = document.createElement('tr');
    const firstCaption = document.createElement('td');
    const firstValue = document.createElement('td');
    const secondRow = document.createElement('tr');
    const secondCaption = document.createElement('td');
    const secondValue = document.createElement('td');

    firstCaption.className = 'attrTitle';
    firstValue.className = 'attrValue';
    secondCaption.className = 'attrTitle';
    secondValue.className = 'attrValue';

    firstRow.append(firstCaption, firstValue);
    secondRow.append(secondCaption, secondValue);
    body.append(firstRow, secondRow);
    table.append(body);
    virtualRoot.append(table);

    expect(getSelector(firstValue)).toBe(
      'table.attrList:nth-of-type(1) tbody tr:nth-child(1) td.attrValue'
    );
    expect(getSelector(secondValue)).toBe(
      'table.attrList:nth-of-type(1) tbody tr:nth-child(2) td.attrValue'
    );
  });
}

function registerRowSelectorTests() {
  it('builds row selectors without duplicating the row tag', () => {
    const table = document.createElement('table');
    table.className = 'cellTableWidget';
    const body = document.createElement('tbody');
    const row = document.createElement('tr');

    row.className = 'tableRow';
    body.append(row);
    table.append(body);
    document.body.append(table);

    expect(getSelector(row)).toBe('table.cellTableWidget:nth-of-type(1) tbody tr:nth-child(1)');
  });
}

describe('dom-helpers-selectors', () => {
  registerIframeCompositeSelectorTest();
  registerDetachedSnapshotSelectorTests();
  registerRowSelectorTests();
});
