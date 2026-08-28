import { z } from 'zod';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type {
  SettingsTransferDomainPayload,
  SettingsTransferJsonValue,
} from '../../contracts/settings-transfer';
import {
  hasOnlySettingsTransferProviderMetadataKeys,
  parseSettingsTransferModelMetadata,
  selectSettingsTransferProviderMetadata,
} from '../../contracts/settings-transfer';
import { parseStoredAIProviders } from '../../composition/persistence/ai-settings/guards';
import { parseStoredVideoSettings } from '../../composition/persistence/capture-settings/guards';
import { parseStoredPopupStartupState } from '../../composition/persistence/capture-settings/popup-startup-guards';
import {
  parseStoredPromptTemplates,
  parseStoredTemplateOrder,
} from '../../composition/persistence/prompt-templates/guards';
import { parseStoredQuickActions } from '../../composition/persistence/quick-actions/guards';
import { parseStoredSettings } from '../../composition/persistence/settings/guards';
import { SETTINGS_TRANSFER_DOMAIN_IDS } from './registry';
import { failSettingsTransferDomain, SettingsTransferDomainError } from './domain-error';
import { parseSettingsTransferStyleDomain } from './style-domain-parser';
import { asSettingsRecord as asRecord, cloneJsonValue as json } from './json-value';

export { SettingsTransferDomainError } from './domain-error';

const recordSchema = z.record(z.string(), z.unknown());
const interfaceSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    locale: z.enum(['en', 'ru']).optional(),
    popupStartup: z.unknown().optional(),
    contextMenu: z.unknown().optional(),
  })
  .strict();

export function parseSettingsTransferDomains(
  domains: Record<string, SettingsTransferDomainPayload>
): Record<string, SettingsTransferDomainPayload> {
  const known = new Set(SETTINGS_TRANSFER_DOMAIN_IDS);
  return Object.fromEntries(
    Object.entries(domains).map(([domainId, payload]) => {
      if (!known.has(domainId)) {
        throw new SettingsTransferDomainError(domainId, `Unsupported settings domain: ${domainId}`);
      }
      if (payload.schemaVersion !== 1) {
        throw new SettingsTransferDomainError(domainId, 'Unsupported domain schema version');
      }
      return [domainId, { schemaVersion: 1, data: parseDomainData(domainId, payload.data) }];
    })
  );
}

function parseDomainData(
  domainId: string,
  data: SettingsTransferJsonValue
): SettingsTransferJsonValue {
  const raw = recordSchema.safeParse(data);
  if (!raw.success) failSettingsTransferDomain(domainId);
  const value = raw.data;
  if (domainId.startsWith('styles.')) return parseSettingsTransferStyleDomain(domainId, value);
  if (domainId.startsWith('ai.')) return parseAiDomain(domainId, value);
  return parseCoreDomain(domainId, value);
}

function parseCoreDomain(
  domainId: string,
  value: Record<string, unknown>
): SettingsTransferJsonValue {
  switch (domainId) {
    case 'interface.preferences': {
      const parsed = interfaceSchema.safeParse(value);
      if (!parsed.success) failSettingsTransferDomain(domainId);
      const result: Record<string, unknown> = {};
      assignDefined(result, 'theme', parsed.data.theme);
      assignDefined(result, 'locale', parsed.data.locale);
      if (parsed.data.popupStartup !== undefined) {
        if (!isPlainRecord(parsed.data.popupStartup)) failSettingsTransferDomain(domainId);
        const popup = asRecord(parsed.data.popupStartup);
        if (Object.keys(popup).some((key) => key !== 'selection' && key !== 'lastPage')) {
          failSettingsTransferDomain(domainId);
        }
        const parsedPopup = parseStoredPopupStartupState(popup);
        if (Object.keys(parsedPopup).length !== Object.keys(popup).length) {
          failSettingsTransferDomain(domainId);
        }
        result['popupStartup'] = parsedPopup;
      }
      if (parsed.data.contextMenu !== undefined) {
        const settings = parseStoredSettings({ contextMenu: parsed.data.contextMenu });
        if (settings.invalidFieldCount > 0 || settings.hasInvalidRoot)
          failSettingsTransferDomain(domainId);
        result['contextMenu'] = settings.value.contextMenu;
      }
      return json(result);
    }
    case 'capture.quick-actions': {
      const parsed = parseStoredQuickActions(value['items']);
      if (parsed.hasInvalidRoot || parsed.invalidEntryCount > 0)
        failSettingsTransferDomain(domainId);
      return json({ items: parsed.actions ?? [] });
    }
    case 'capture.viewport-presets':
    case 'capture.image':
    case 'capture.after-capture':
    case 'capture.saving':
    case 'capture.retention':
    case 'system.voice': {
      const storageShape = mainSettingsStorageShape(domainId, value);
      const parsed = parseStoredSettings(storageShape);
      if (parsed.hasInvalidRoot || parsed.invalidFieldCount > 0)
        failSettingsTransferDomain(domainId);
      return json(coreSettingsTransferData(domainId, value, parsed.value));
    }
    case 'capture.video':
    case 'system.native': {
      const storageShape =
        domainId === 'capture.video'
          ? {
              qualityProfiles: value['profiles'],
              qualityProfileId: value['qualityProfileId'],
              outputProfile: value['outputProfile'],
            }
          : { ...DEFAULT_VIDEO_SETTINGS, native: buildNativeSettingsShape(domainId, value) };
      const parsed = parseStoredVideoSettings(storageShape);
      if (parsed.hasInvalidRoot || parsed.invalidFieldCount > 0)
        failSettingsTransferDomain(domainId);
      return domainId === 'capture.video'
        ? json({
            ...(value['profiles'] === undefined ? {} : { profiles: parsed.value.qualityProfiles }),
            ...(value['qualityProfileId'] === undefined
              ? {}
              : { qualityProfileId: parsed.value.qualityProfileId }),
            ...(value['outputProfile'] === undefined
              ? {}
              : { outputProfile: parsed.value.outputProfile }),
          })
        : json(canonicalNativeTransferData(value, parsed.value.native));
    }
  }
  return failSettingsTransferDomain(domainId);
}

function parseAiDomain(
  domainId: string,
  value: Record<string, unknown>
): SettingsTransferJsonValue {
  switch (domainId) {
    case 'ai.providers': {
      if (Object.keys(value).some((key) => key !== 'items')) failSettingsTransferDomain(domainId);
      const items = Array.isArray(value['items'])
        ? value['items'].map((provider) => {
            const record = asRecord(provider);
            if (!record || !hasOnlySettingsTransferProviderMetadataKeys(record))
              failSettingsTransferDomain(domainId);
            return {
              id: record['id'],
              name: record['name'],
              connectionType: record['connectionType'],
              baseUrl: record['baseUrl'],
              createdAt: record['createdAt'],
              hasStoredApiKey: false,
            };
          })
        : value['items'];
      const parsed = parseStoredAIProviders(items);
      if (parsed.hasInvalidRoot || parsed.invalidEntryCount > 0)
        failSettingsTransferDomain(domainId);
      return json({
        items: parsed.value.map(selectSettingsTransferProviderMetadata),
      });
    }
    case 'ai.models': {
      if (Object.keys(value).some((key) => key !== 'items' && key !== 'defaultModelId')) {
        failSettingsTransferDomain(domainId);
      }
      if (!Array.isArray(value['items'])) failSettingsTransferDomain(domainId);
      let items;
      try {
        items = value['items'].map(parseSettingsTransferModelMetadata);
      } catch {
        return failSettingsTransferDomain(domainId);
      }
      if (
        value['defaultModelId'] !== null &&
        value['defaultModelId'] !== undefined &&
        typeof value['defaultModelId'] !== 'string'
      )
        failSettingsTransferDomain(domainId);
      return json({ items, defaultModelId: value['defaultModelId'] ?? null });
    }
    case 'ai.chrome':
      if (
        Object.keys(value).some((key) => key !== 'enabled') ||
        typeof value['enabled'] !== 'boolean'
      )
        failSettingsTransferDomain(domainId);
      return json({ enabled: value['enabled'] });
    case 'ai.prompts':
      if (
        Object.keys(value).some((key) => key !== 'global' && key !== 'scenario') ||
        (value['global'] !== undefined && typeof value['global'] !== 'string') ||
        (value['scenario'] !== undefined && typeof value['scenario'] !== 'string')
      )
        failSettingsTransferDomain(domainId);
      return json({
        ...(value['global'] === undefined ? {} : { global: value['global'] }),
        ...(value['scenario'] === undefined ? {} : { scenario: value['scenario'] }),
      });
    case 'ai.prompt-templates': {
      const templates = parseStoredPromptTemplates(value['items']);
      const order = parseStoredTemplateOrder(value['order']);
      if (
        templates.hasInvalidRoot ||
        templates.invalidEntryCount > 0 ||
        order.hasInvalidRoot ||
        order.invalidEntryCount > 0
      )
        failSettingsTransferDomain(domainId);
      return json({ items: templates.templates, order: order.orderedIds });
    }
  }
  return failSettingsTransferDomain(domainId);
}

function buildNativeSettingsShape(domainId: string, value: Record<string, unknown>) {
  const defaults = DEFAULT_VIDEO_SETTINGS.native!;
  const capture = asRecord(value['capture']);
  const captureVideo = asRecord(capture['video']);
  if (
    Object.keys(value).some((key) => key !== 'capture' && key !== 'tray' && key !== 'telemetry') ||
    Object.keys(capture).some((key) => key !== 'screenshots' && key !== 'video') ||
    Object.keys(captureVideo).some(
      (key) => key !== 'advanced' && key !== 'codec' && key !== 'enabled'
    )
  ) {
    failSettingsTransferDomain(domainId);
  }
  return {
    screenshots: capture['screenshots'] ?? defaults.screenshots,
    trayActions: value['tray'] ?? defaults.trayActions,
    video: {
      advanced: captureVideo['advanced'] ?? defaults.video.advanced,
      codec: captureVideo['codec'] ?? defaults.video.codec,
      enabled: captureVideo['enabled'] ?? defaults.video.enabled,
      telemetry: value['telemetry'] ?? defaults.video.telemetry,
    },
  };
}

function canonicalNativeTransferData(
  source: Record<string, unknown>,
  native: (typeof DEFAULT_VIDEO_SETTINGS)['native'] | undefined
) {
  if (!native) failSettingsTransferDomain('system.native');
  return {
    ...(source['capture'] === undefined
      ? {}
      : {
          capture: {
            screenshots: native.screenshots,
            video: {
              advanced: native.video.advanced,
              codec: native.video.codec,
              enabled: native.video.enabled,
            },
          },
        }),
    ...(source['tray'] === undefined ? {} : { tray: native.trayActions }),
    ...(source['telemetry'] === undefined ? {} : { telemetry: native.video.telemetry }),
  };
}

function mainSettingsStorageShape(domainId: string, value: Record<string, unknown>) {
  switch (domainId) {
    case 'capture.viewport-presets':
      return { viewportPresets: value['items'], defaultViewportPresetId: value['defaultId'] };
    case 'capture.image':
      return {
        imageFormat: value['format'],
        imageQuality: value['quality'],
        fullPageQuality: value['fullPageQuality'],
      };
    case 'capture.after-capture':
      return { captureAction: value['action'] };
    case 'capture.saving':
      return {
        presets: value['templates'],
        defaultImagePresetId: value['defaultImagePresetId'],
        defaultVideoPresetId: value['defaultVideoPresetId'],
        defaultExportPresetId: value['defaultExportPresetId'],
      };
    case 'capture.retention':
      return { localStoragePolicy: value['policy'] };
    case 'system.voice':
      return {
        voiceInput: { language: value['language'], mode: value['mode'], microphoneDeviceId: null },
      };
    default:
      return value;
  }
}

function coreSettingsTransferData(
  domainId: string,
  source: Record<string, unknown>,
  parsed: ReturnType<typeof parseStoredSettings>['value']
) {
  switch (domainId) {
    case 'capture.viewport-presets':
      return {
        ...(source['items'] === undefined ? {} : { items: parsed.viewportPresets }),
        ...(source['defaultId'] === undefined ? {} : { defaultId: parsed.defaultViewportPresetId }),
      };
    case 'capture.image':
      return {
        ...(source['format'] === undefined ? {} : { format: parsed.imageFormat }),
        ...(source['quality'] === undefined ? {} : { quality: parsed.imageQuality }),
        ...(source['fullPageQuality'] === undefined
          ? {}
          : { fullPageQuality: parsed.fullPageQuality }),
      };
    case 'capture.after-capture':
      return source['action'] === undefined ? {} : { action: parsed.captureAction };
    case 'capture.saving':
      return {
        ...(source['templates'] === undefined ? {} : { templates: parsed.presets }),
        ...(source['defaultImagePresetId'] === undefined
          ? {}
          : { defaultImagePresetId: parsed.defaultImagePresetId }),
        ...(source['defaultVideoPresetId'] === undefined
          ? {}
          : { defaultVideoPresetId: parsed.defaultVideoPresetId }),
        ...(source['defaultExportPresetId'] === undefined
          ? {}
          : { defaultExportPresetId: parsed.defaultExportPresetId }),
      };
    case 'capture.retention':
      return source['policy'] === undefined ? {} : { policy: parsed.localStoragePolicy };
    case 'system.voice':
      return source['language'] === undefined && source['mode'] === undefined
        ? {}
        : {
            ...(source['language'] === undefined ? {} : { language: parsed.voiceInput?.language }),
            ...(source['mode'] === undefined ? {} : { mode: parsed.voiceInput?.mode }),
          };
    default:
      return failSettingsTransferDomain(domainId);
  }
}

function assignDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
