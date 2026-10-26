import { expect, it } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeQuickActionAppearanceContracts } from './quick-action-appearance';
const contract = runtimeQuickActionAppearanceContracts[MessageType.OFFSCREEN_QUICK_ACTION_HEADER];
const request = {
  type: MessageType.OFFSCREEN_QUICK_ACTION_HEADER,
  capabilityToken: 'native-capability',
  header: DEFAULT_WINDOW_HEADER,
  source: { width: 1280, height: 560 },
};
it('admits only bounded typed header artwork with a background capability', () => {
  expect(contract.parseRequest(request)).toEqual(request);
  for (const patch of [
    { capabilityToken: undefined },
    { source: { width: Infinity, height: 1 } },
    { source: { width: 32768, height: 32768 } },
    { header: { ...DEFAULT_WINDOW_HEADER, title: 'x'.repeat(513) } },
    { rawHtml: '<script>unsafe</script>' },
  ]) {
    expect(() => contract.parseRequest({ ...request, ...patch })).toThrow();
  }
});
it('admits bounded PNG completion and refuses arbitrary or oversized payloads', () => {
  const dataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=';
  expect(contract.parseResponse({ success: true, dataUrl })).toEqual({ success: true, dataUrl });
  expect(() =>
    contract.parseResponse({ success: true, dataUrl: 'https://example.test/image.png' })
  ).toThrow();
  expect(() =>
    contract.parseResponse({
      success: true,
      dataUrl: 'data:image/png;base64,' + 'A'.repeat(22_369_648),
    })
  ).toThrow();
});
