import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NormalizedSettings } from '../../../contracts/settings';
import type { SettingsTransferDomainPayload } from '../../../contracts/settings-transfer';
import { cloneSettingsTransferJsonValue } from '../../../contracts/settings-transfer';
import { emptySummary } from '../../../workflows/settings-transfer/planner';
import { resolveStoredCalloutPresetCatalog } from '../callout-presets/migration';
import { resolveStoredStepBadgePresetCatalog } from '../step-badge-presets/migration';
import { createSurfaceStylePresetCatalog } from '../surface-style-presets/catalog';

const mocks = vi.hoisted(() => ({
  localGet: vi.fn(),
  localRemove: vi.fn(),
  localSet: vi.fn(),
  syncGet: vi.fn(),
  syncRemove: vi.fn(),
  syncSet: vi.fn(),
  loadSettings: vi.fn(),
  loadVideoSettings: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: { get: mocks.localGet, remove: mocks.localRemove, set: mocks.localSet },
    sync: { get: mocks.syncGet, remove: mocks.syncRemove, set: mocks.syncSet },
  },
}));
vi.mock('../settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettings,
}));

import { applySettingsTransferDomains, SettingsTransferRollbackError } from './apply';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSettings.mockResolvedValue(settingsFixture());
  mocks.loadVideoSettings.mockResolvedValue(structuredClone(DEFAULT_VIDEO_SETTINGS));
  mocks.syncGet.mockResolvedValue({ sniptale_settings: { imageFormat: 'png' } });
  mocks.localGet.mockResolvedValue({});
  mocks.syncSet.mockResolvedValue(undefined);
  mocks.syncRemove.mockResolvedValue(undefined);
  mocks.localRemove.mockResolvedValue(undefined);
});

describe('settings transfer AI owner transaction', () => {
  it('applies transferable settings while preserving local consent and matching AI secrets', async () => {
    const summary = emptySummary();
    mocks.localGet.mockResolvedValue({
      sniptale_ai_providers: [
        {
          id: 'provider-a',
          name: 'Provider',
          connectionType: 'openai-compatible',
          baseUrl: 'https://private.example',
          hasStoredApiKey: true,
          createdAt: 1,
        },
      ],
      sniptale_ai_provider_secrets: {
        'provider-a': {
          version: 1,
          algorithm: 'AES-GCM',
          iv: 'iv',
          ciphertext: 'ciphertext',
        },
      },
    });
    await applySettingsTransferDomains({
      domains: allDomainFixtures(),
      summary,
    });

    expect(mocks.syncSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sniptale_settings: expect.objectContaining({
          imageFormat: 'webp',
          authenticatedSnapshotAssetsEnabled: false,
          anonymousCrossOriginSnapshotAssetsEnabled: false,
          exportResourceLimits: { maxFileCount: 50, maxFileSizeMiB: 20, maxTotalSizeMiB: 100 },
          pagePackageCaptureTiming: { loadTimeoutMs: 60_000, settleDelayMs: 3_000 },
          voiceInput: expect.objectContaining({ microphoneDeviceId: null }),
        }),
        sniptale_callout_presets: expect.any(Object),
        sniptale_step_badge_presets: expect.any(Object),
        sniptale_surface_style_presets: expect.any(Object),
      }),
      undefined
    );
    expect(mocks.localSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sniptale_ai_provider_secrets: {
          'provider-a': expect.objectContaining({ version: 1, algorithm: 'AES-GCM' }),
        },
        sniptale_ai_providers: [expect.objectContaining({ id: 'provider-a' })],
      }),
      undefined
    );
    expect(mocks.localSet).toHaveBeenCalledWith(
      expect.objectContaining({
        'sniptale-theme-preference': 'dark',
        sniptale_video_settings: expect.any(Object),
      }),
      undefined
    );
    expect(summary.clearedAiSecretBindings).toEqual([]);
    expect(summary.missingAiSecretBindings).toEqual([]);
  });

  it('clears secrets whose provider binding changed and reports missing bindings', async () => {
    const summary = emptySummary();
    mocks.localGet.mockResolvedValue({
      sniptale_ai_providers: [
        {
          id: 'provider-a',
          name: 'Provider',
          connectionType: 'openai-compatible',
          baseUrl: 'https://old.example',
          hasStoredApiKey: true,
          createdAt: 1,
        },
        {
          id: 'removed',
          name: 'Removed',
          connectionType: 'openai-compatible',
          baseUrl: 'https://removed.example',
          hasStoredApiKey: true,
          createdAt: 2,
        },
      ],
      sniptale_ai_provider_secrets: { 'provider-a': 'secret-a', removed: 'secret-b' },
    });
    await applySettingsTransferDomains({
      domains: {
        'ai.providers': {
          schemaVersion: 1,
          data: {
            items: [
              {
                id: 'provider-a',
                name: 'Provider',
                connectionType: 'openai-compatible',
                baseUrl: 'https://new.example',
                createdAt: 1,
                authorization: 'canary-secret',
              },
            ],
          },
        },
        'ai.models': {
          schemaVersion: 1,
          data: {
            items: [
              {
                id: 'model-a',
                providerId: 'provider-a',
                modelCode: 'model-code',
                displayName: 'Model',
              },
            ],
            defaultModelId: null,
          },
        },
      },
      summary,
    });
    expect(summary.clearedAiSecretBindings).toEqual(['provider-a', 'removed']);
    expect(summary.missingAiSecretBindings).toEqual(['provider-a']);
    expect(mocks.localSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sniptale_ai_provider_secrets: {},
        sniptale_ai_providers: [expect.not.objectContaining({ authorization: 'canary-secret' })],
      }),
      undefined
    );
    expect(mocks.localSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sniptale_ai_models: [expect.not.objectContaining({ authorization: 'canary-secret' })],
        sniptale_ai_default_model: null,
      }),
      undefined
    );
  });

  it('rejects undeclared AI model metadata before storage writes', async () => {
    await expect(
      applySettingsTransferDomains({
        domains: {
          'ai.models': {
            schemaVersion: 1,
            data: {
              items: [
                {
                  id: 'model-a',
                  providerId: 'provider-a',
                  modelCode: 'model-code',
                  displayName: 'Model',
                  authorization: 'canary-secret',
                },
              ],
            },
          },
        },
        summary: emptySummary(),
      })
    ).rejects.toThrow('Invalid settings transfer AI model metadata');
    expect(mocks.localSet).not.toHaveBeenCalled();
  });
});

describe('settings transfer storage transaction', () => {
  it('performs no writes for an empty domain selection', async () => {
    await applySettingsTransferDomains({ domains: {}, summary: emptySummary() });
    expect(mocks.syncSet).not.toHaveBeenCalled();
    expect(mocks.localSet).not.toHaveBeenCalled();
  });

  it('applies the parsed full-page quality policy through the canonical settings payload', async () => {
    await applySettingsTransferDomains({
      domains: {
        'capture.image': {
          schemaVersion: 1,
          data: {
            fullPageQuality: {
              maxFileSizeMiB: 72,
              maxMegapixels: 70,
              minScalePercent: 40,
              profile: 'custom',
            },
          },
        },
      },
      summary: emptySummary(),
    });

    expect(mocks.syncSet).toHaveBeenCalledWith(
      {
        sniptale_settings: expect.objectContaining({
          fullPageQuality: {
            maxFileSizeMiB: 72,
            maxMegapixels: 70,
            minScalePercent: 40,
            profile: 'custom',
          },
        }),
      },
      undefined
    );
  });

  it('rejects an oversized sync item before any write', async () => {
    await expect(
      applySettingsTransferDomains({
        domains: {
          'styles.tags': { schemaVersion: 1, data: { tags: ['x'.repeat(9_000)] } },
        },
        summary: emptySummary(),
      })
    ).rejects.toThrow('Sync item quota exceeded');
    expect(mocks.syncSet).not.toHaveBeenCalled();
  });

  it.each([
    ['styles.callouts', 'Invalid callout catalog transfer state'],
    ['styles.numbering', 'Invalid numbering catalog transfer state'],
    ['styles.surfaces', 'Invalid surface catalog transfer state'],
  ])('rejects a malformed %s owner payload', async (domainId, error) => {
    await expect(
      applySettingsTransferDomains({
        domains: { [domainId]: { schemaVersion: 1, data: {} } },
        summary: emptySummary(),
      })
    ).rejects.toThrow(error);
  });

  it('restores a completed sync write when the local area fails', async () => {
    mocks.localSet.mockRejectedValueOnce(new Error('local write failed'));
    await expect(
      applySettingsTransferDomains({
        domains: {
          'capture.image': {
            schemaVersion: 1,
            data: { format: 'webp', quality: 80 },
          },
          'capture.quick-actions': {
            schemaVersion: 1,
            data: { items: [{ id: 'quick-a' }] },
          },
        },
        summary: emptySummary(),
      })
    ).rejects.toThrow('local write failed');
    expect(mocks.syncSet).toHaveBeenNthCalledWith(
      2,
      {
        sniptale_settings: { imageFormat: 'png' },
      },
      undefined
    );
  });

  it('compensates the canonical AI owner when a later local write fails', async () => {
    mocks.localGet.mockResolvedValue({
      sniptale_ai_providers: [
        {
          id: 'provider-a',
          name: 'Provider',
          connectionType: 'openai-compatible',
          baseUrl: 'https://old.example',
          hasStoredApiKey: false,
          createdAt: 1,
        },
      ],
    });
    mocks.localSet
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('local write failed'))
      .mockResolvedValueOnce(undefined);
    await expect(
      applySettingsTransferDomains({
        domains: {
          'ai.providers': {
            schemaVersion: 1,
            data: {
              items: [
                {
                  id: 'provider-a',
                  name: 'Provider',
                  connectionType: 'openai-compatible',
                  baseUrl: 'https://new.example',
                  createdAt: 1,
                },
              ],
            },
          },
          'capture.quick-actions': {
            schemaVersion: 1,
            data: { items: [{ id: 'quick-a' }] },
          },
        },
        summary: emptySummary(),
      })
    ).rejects.toThrow('local write failed');
    expect(mocks.localSet).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ sniptale_ai_providers: expect.any(Array) }),
      undefined
    );
  });

  it('surfaces an unverified rollback as a blocking failure', async () => {
    mocks.localSet.mockRejectedValueOnce(new Error('local write failed'));
    mocks.syncSet
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rollback failed'));
    await expect(
      applySettingsTransferDomains({
        domains: {
          'capture.image': {
            schemaVersion: 1,
            data: { format: 'webp', quality: 80 },
          },
          'capture.quick-actions': {
            schemaVersion: 1,
            data: { items: [{ id: 'quick-a' }] },
          },
        },
        summary: emptySummary(),
      })
    ).rejects.toBeInstanceOf(SettingsTransferRollbackError);
  });

  it('continues reverse compensation after the AI owner rollback fails', async () => {
    mocks.localGet.mockResolvedValue({
      sniptale_ai_providers: [
        {
          id: 'provider-a',
          name: 'Provider',
          connectionType: 'openai-compatible',
          baseUrl: 'https://old.example',
          hasStoredApiKey: false,
          createdAt: 1,
        },
      ],
    });
    mocks.localSet
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('local write failed'))
      .mockRejectedValueOnce(new Error('provider rollback failed'));

    await expect(
      applySettingsTransferDomains({
        domains: {
          'capture.image': {
            schemaVersion: 1,
            data: { format: 'webp', quality: 80 },
          },
          'ai.providers': {
            schemaVersion: 1,
            data: {
              items: [
                {
                  id: 'provider-a',
                  name: 'Provider',
                  connectionType: 'openai-compatible',
                  baseUrl: 'https://new.example',
                  createdAt: 1,
                },
              ],
            },
          },
          'capture.quick-actions': {
            schemaVersion: 1,
            data: { items: [{ id: 'quick-a' }] },
          },
        },
        summary: emptySummary(),
      })
    ).rejects.toBeInstanceOf(SettingsTransferRollbackError);
    expect(mocks.syncSet).toHaveBeenNthCalledWith(
      2,
      { sniptale_settings: { imageFormat: 'png' } },
      undefined
    );
  });
});

function allDomainFixtures(): Record<string, SettingsTransferDomainPayload> {
  const video = structuredClone(DEFAULT_VIDEO_SETTINGS);
  const domains = {
    'interface.preferences': {
      schemaVersion: 1,
      data: {
        theme: 'dark',
        locale: 'en',
        popupStartup: { page: 'capture' },
        contextMenu: settingsFixture().contextMenu,
      },
    },
    'capture.quick-actions': { schemaVersion: 1, data: { items: [{ id: 'quick-a' }] } },
    'capture.viewport-presets': {
      schemaVersion: 1,
      data: { items: [{ id: 'viewport-a', width: 1280, height: 720 }], defaultId: 'viewport-a' },
    },
    'capture.image': { schemaVersion: 1, data: { format: 'webp', quality: 80 } },
    'capture.pages': {
      schemaVersion: 1,
      data: {
        resourceLimits: { maxFileCount: 50, maxFileSizeMiB: 20, maxTotalSizeMiB: 100 },
        timing: { loadTimeoutMs: 60_000, settleDelayMs: 3_000 },
      },
    },
    'capture.after-capture': { schemaVersion: 1, data: { action: 'copy' } },
    'capture.saving': {
      schemaVersion: 1,
      data: {
        templates: [],
        defaultImagePresetId: null,
        defaultVideoPresetId: null,
        defaultExportPresetId: null,
      },
    },
    'capture.retention': {
      schemaVersion: 1,
      data: { policy: settingsFixture().localStoragePolicy },
    },
    'system.voice': { schemaVersion: 1, data: { language: 'en-US', mode: 'browser' } },
    'capture.video': {
      schemaVersion: 1,
      data: {
        profiles: video.qualityProfiles,
        qualityProfileId: video.qualityProfileId,
        outputProfile: video.outputProfile,
      },
    },
    'system.native': {
      schemaVersion: 1,
      data: {
        capture: { screenshots: video.native?.screenshots, video: video.native?.video },
        tray: video.native?.trayActions,
        telemetry: video.native?.video.telemetry,
      },
    },
    'styles.borders': { schemaVersion: 1, data: { borderPresets: [] } },
    'styles.callouts': { schemaVersion: 1, data: resolveStoredCalloutPresetCatalog({}) },
    'styles.numbering': { schemaVersion: 1, data: resolveStoredStepBadgePresetCatalog({}) },
    'styles.tags': { schemaVersion: 1, data: { tags: [] } },
    'styles.tool-presets': { schemaVersion: 1, data: { step: { presets: [] } } },
    'styles.palettes': { schemaVersion: 1, data: { slots: paletteSlots() } },
    'styles.gradients': { schemaVersion: 1, data: { presets: [] } },
    'styles.surfaces': { schemaVersion: 1, data: createSurfaceStylePresetCatalog() },
    'ai.prompt-templates': { schemaVersion: 1, data: { items: [], order: [] } },
    'ai.models': { schemaVersion: 1, data: { items: [], defaultModelId: null } },
    'ai.chrome': { schemaVersion: 1, data: { enabled: true } },
    'ai.prompts': { schemaVersion: 1, data: { global: 'Global', scenario: 'Scenario' } },
    'ai.providers': {
      schemaVersion: 1,
      data: {
        items: [
          {
            id: 'provider-a',
            name: 'Provider',
            connectionType: 'openai-compatible',
            baseUrl: 'https://private.example',
            createdAt: 1,
          },
        ],
      },
    },
  };
  return Object.fromEntries(
    Object.entries(domains).map(([domainId, payload]) => [
      domainId,
      { schemaVersion: 1, data: cloneSettingsTransferJsonValue(payload.data) },
    ])
  );
}

function paletteSlots(): Record<string, string> {
  return Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`slot-${index}`, '#000000']));
}

function settingsFixture(): NormalizedSettings {
  return {
    captureAction: 'download_default',
    contextMenu: {
      enabled: true,
      showScreenshots: true,
      showVideo: true,
      showExport: true,
      showImageEditor: true,
      showVideoEditor: true,
      showGallery: true,
      showPageLinkCopy: true,
      showWindowResize: true,
      showSettings: true,
    },
    localStoragePolicy: {
      cleanupEnabled: true,
      defaultDestination: 'temporary',
      draftRetentionDays: 7,
      videoDraftRetentionDays: 7,
    },
    saveCapturesToGallery: false,
    viewportPresets: [],
    defaultViewportPresetId: null,
    presets: [],
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultExportPresetId: null,
    imageFormat: 'png',
    imageQuality: 100,
    fullPageQuality: {
      maxFileSizeMiB: 64,
      maxMegapixels: 64,
      minScalePercent: 50,
      profile: 'safe',
    },
    authenticatedSnapshotAssetsEnabled: false,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    externalSnapshotLinksEnabled: false,
    exportResourceLimits: { maxFileCount: 30, maxFileSizeMiB: 30, maxTotalSizeMiB: 150 },
    pagePackageCaptureTiming: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
  };
}
