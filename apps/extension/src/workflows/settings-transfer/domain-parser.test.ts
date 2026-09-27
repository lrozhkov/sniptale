import { expect, it } from 'vitest';
import { createContextMenuLayout } from '../../contracts/settings/context-menu-layout';
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

it.each([
  null,
  { layout: { version: 2, sections: [] } },
  { layout: { version: 1, sections: [] } },
  { showVideo: 'yes' },
])('rejects invalid menus before transfer apply %#', (value) => {
  expect(() => parseSettingsTransferDomains(domains(value))).toThrow();
});
