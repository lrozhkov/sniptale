// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { detectGenericDashboard } from './generic-dashboard.detector';

describe('generic-dashboard detector', () => {
  it('ignores pages with a single table and no dashboard card signals', () => {
    const root = document.createElement('main');
    root.innerHTML = '<table><tr><td>Cell</td></tr></table>';

    expect(detectGenericDashboard(root)).toBeNull();
  });

  it('detects dashboards when cards or multiple tables provide enough structure', () => {
    const cardRoot = document.createElement('main');
    cardRoot.innerHTML = [
      '<section class="sales-card"></section>',
      '<section class="stats-widget"></section>',
      '<section class="overview-tile"></section>',
    ].join('');
    const tableRoot = document.createElement('main');
    tableRoot.innerHTML = ['<table></table>', '<table></table>'].join('');

    expect(detectGenericDashboard(cardRoot)?.matchedSignals).toEqual([
      { id: 'dom.dashboard-cards', source: 'dom', strength: 'soft' },
    ]);
    expect(detectGenericDashboard(tableRoot)?.matchedSignals).toEqual([
      { id: 'dom.dashboard-tables', source: 'dom', strength: 'soft' },
    ]);
  });
});
