import { expect, it } from 'vitest';
import {
  createContextMenuLayout,
  createRecommendedContextMenuTree,
} from '../../contracts/settings/context-menu-layout';
import { parseSettingsTransferDomains } from './domain-parser';
import type { SettingsTransferDomainPayload } from '../../contracts/settings-transfer';

function domains(contextMenu: SettingsTransferDomainPayload['data']) {
  return { 'interface.preferences': { schemaVersion: 1, data: { contextMenu } } };
}

it('round trips layout, disabled block positions and legacy partial menu preferences', () => {
  const payload = domains({ enabled: false, showVideo: false, layout: createContextMenuLayout() });
  expect(parseSettingsTransferDomains(payload)).toEqual(payload);
  expect(parseSettingsTransferDomains(parseSettingsTransferDomains(payload))).toEqual(payload);
  expect(parseSettingsTransferDomains(domains({ enabled: false }))).toEqual(
    domains({ enabled: false })
  );
});

it('round trips v2 structure and unavailable references without changing transfer envelope', () => {
  const layout = createRecommendedContextMenuTree([], []);
  layout.nodes.unshift({
    type: 'command',
    command: 'sniptale.screenshots.quick-action.missing',
    enabled: false,
    title: 'Old action',
  });
  const payload = domains(JSON.parse(JSON.stringify({ enabled: true, layout })));
  expect(parseSettingsTransferDomains(payload)).toEqual(payload);
});

it.each([
  null,
  { layout: { version: 2, sections: [] } },
  { layout: { version: 1, sections: [] } },
  { showVideo: 'yes' },
  { layout: { version: 3, nodes: [] } },
  {
    layout: {
      version: 2,
      nodes: [{ type: 'command', command: 'sniptale.unknown', enabled: true }],
    },
  },
  {
    layout: {
      version: 2,
      nodes: Array.from({ length: 81 }, () => ({
        type: 'command',
        command: 'sniptale.settings',
        enabled: true,
      })),
    },
  },
  { enabled: true, unknown: 'field' },
])('rejects invalid menus before transfer apply %#', (value) => {
  expect(() => parseSettingsTransferDomains(domains(value))).toThrow();
});
