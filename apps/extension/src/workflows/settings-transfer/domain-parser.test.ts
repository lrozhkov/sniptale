import { createQuickActionAppearance } from '../../contracts/quick-action-appearance';
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

it('round trips independent new material destinations without dropping categories', () => {
  const input = {
    'capture.retention': {
      schemaVersion: 1,
      data: {
        policy: {
          cleanupEnabled: true,
          defaultDestination: 'temporary',
          recordingDestination: 'library',
          webSnapshotDestination: 'temporary',
          draftRetentionDays: 30,
          videoDraftRetentionDays: 7,
          trashCleanupEnabled: false,
          trashRetentionDays: 30,
        },
      },
    },
  };
  expect(parseSettingsTransferDomains(input)).toEqual(input);
  expect(parseSettingsTransferDomains(parseSettingsTransferDomains(input))).toEqual(input);
});

it('round trips audio model parameters and rejects retired selection metadata', () => {
  const model = {
    id: 'audio',
    providerId: 'provider',
    modelCode: 'custom',
    displayName: 'Speech',
    operation: 'speech',
    audio: { speech: { voiceId: 'voice', responseFormat: 'mp3', speed: 1 } },
  };
  const payload = {
    'ai.models': { schemaVersion: 1, data: { items: [model] } },
  };
  expect(parseSettingsTransferDomains(payload)).toEqual(payload);
  expect(() =>
    parseSettingsTransferDomains({
      'ai.models': { schemaVersion: 1, data: { items: [model], defaultModelId: 'audio' } },
    })
  ).toThrow();
});

it('admits bounded optional recognition instructions without changing legacy prompt payloads', () => {
  const legacy = {
    'ai.prompts': { schemaVersion: 1, data: { global: 'Global', scenario: 'Scenario' } },
  };
  expect(parseSettingsTransferDomains(legacy)).toEqual(legacy);
  const payload = { 'ai.prompts': { schemaVersion: 1, data: { recognition: 'Native language' } } };
  expect(parseSettingsTransferDomains(payload)).toEqual(payload);
  expect(() =>
    parseSettingsTransferDomains({
      'ai.prompts': { schemaVersion: 1, data: { recognition: 'x'.repeat(10001) } },
    })
  ).toThrow();
});

it('retains bounded optional voice correction prompts and rejects oversized values', () => {
  const payload = {
    'ai.prompts': { schemaVersion: 1, data: { voiceCorrection: 'Keep my meaning' } },
  };
  expect(parseSettingsTransferDomains(payload)).toEqual(payload);
  expect(() =>
    parseSettingsTransferDomains({
      'ai.prompts': { schemaVersion: 1, data: { voiceCorrection: 'x'.repeat(10001) } },
    })
  ).toThrow();
});

it('normalizes imported legacy scenario sinks and preserves quick-action identity and metadata', () => {
  const action = {
    id: 'legacy-scenario',
    status: true,
    name: 'My capture',
    icon: 'Camera',
    screenshotMode: 'full',
    afterCapture: 'scenario',
    viewportPresetId: 'wide',
    delay: 5,
    imageFormat: 'webp',
    imageQuality: 71,
    exitAfterCapture: true,
    origin: 'user',
    hotkey: { key: 'K', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false },
  };
  const result = parseSettingsTransferDomains({
    'capture.after-capture': { schemaVersion: 1, data: { action: 'scenario' } },
    'capture.quick-actions': { schemaVersion: 1, data: { items: [action] } },
  });
  expect(result['capture.after-capture']?.data).toEqual({ action: 'download_default' });
  expect(result['capture.quick-actions']?.data).toEqual({
    items: [{ ...action, afterCapture: 'download_default' }],
  });
});

it('refuses embedded quick-action artwork before the storage parser can admit it', () => {
  const appearance = createQuickActionAppearance();
  appearance.background = {
    ...appearance.background,
    kind: 'image',
    imageDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=',
  };
  const action = {
    id: 'styled',
    status: true,
    name: 'Styled',
    icon: 'Camera',
    screenshotMode: 'visible',
    exitAfterCapture: false,
    appearance,
  };
  expect(() =>
    parseSettingsTransferDomains({
      'capture.quick-actions': {
        schemaVersion: 1,
        data: JSON.parse(JSON.stringify({ items: [action] })),
      },
    })
  ).toThrow();
});

it('round trips page-launch preferences and preserves legacy preference payloads', () => {
  const pageLaunch = {
    enabled: true,
    hoverOnly: true,
    corner: 'top-left',
    quickActionsPopup: false,
    quickActionsCorner: true,
    quickActionsToolbar: true,
  };
  const input = { 'interface.preferences': { schemaVersion: 1, data: { pageLaunch } } };
  expect(parseSettingsTransferDomains(input)).toEqual(input);
  const legacy = { 'interface.preferences': { schemaVersion: 1, data: { theme: 'dark' } } };
  expect(parseSettingsTransferDomains(legacy)).toEqual(legacy);
});
it.each([
  null,
  [],
  { corner: 'middle' },
  { enabled: 'yes' },
  { hoverOnly: 1 },
  { quickActionsPopup: 'false' },
  { quickActionsCorner: null },
  { quickActionsToolbar: 1 },
  { enabled: true, private: 'not allowed' },
])('rejects malformed page-launch transfer preferences %#', (pageLaunch) => {
  expect(() =>
    parseSettingsTransferDomains({
      'interface.preferences': { schemaVersion: 1, data: { pageLaunch } },
    })
  ).toThrow();
});

it('retains model capabilities, ownership and independent audio blocks through domain admission', () => {
  const model = {
    id: 'configured',
    providerId: 'provider',
    modelCode: 'exact/code',
    displayName: 'Configured',
    source: 'manual',
    propertySource: 'catalog',
    enabled: false,
    retirementOverride: false,
    capabilities: {
      operations: { text: 'supported', transcription: 'supported', speech: 'supported' },
      input: { text: 'supported', audio: 'supported' },
      output: { audio: 'supported' },
      features: {},
    },
    audio: {
      transcription: { language: 'en', responseFormat: 'json', timestampGranularity: 'none' },
      speech: { voiceId: 'voice', responseFormat: 'mp3' },
    },
  };
  const input = {
    'ai.models': { schemaVersion: 1, data: { items: [model] } },
  };
  expect(parseSettingsTransferDomains(input)).toEqual(input);
  expect(parseSettingsTransferDomains(parseSettingsTransferDomains(input))).toEqual(input);
  expect(() =>
    parseSettingsTransferDomains({
      'ai.models': {
        schemaVersion: 1,
        data: { items: [{ ...model, catalog: { lifecycle: 'active' } }] },
      },
    })
  ).toThrow();
});

it('round trips provider management and disabled state without admitting runtime evidence', () => {
  const provider = {
    id: 'provider',
    name: 'Provider',
    baseUrl: 'https://example.com/v1',
    connectionType: 'openai-compatible',
    createdAt: 1,
    management: 'manual',
    enabled: false,
  };
  const domain = (item: SettingsTransferDomainPayload['data']) => ({
    'ai.providers': { schemaVersion: 1, data: { items: [item] } },
  });
  expect(parseSettingsTransferDomains(domain(provider))).toEqual(domain(provider));
  for (const invalid of [
    { enabled: 'false' },
    { management: 'unknown' },
    { incarnation: 'imported' },
  ]) {
    expect(() => parseSettingsTransferDomains(domain({ ...provider, ...invalid }))).toThrow();
  }
});

it.each([null, 'configured-model'])(
  'rejects retired global model selection %s at domain admission',
  (defaultModelId) => {
    expect(() =>
      parseSettingsTransferDomains({
        'ai.models': { schemaVersion: 1, data: { items: [], defaultModelId } },
      })
    ).toThrow();
  }
);
