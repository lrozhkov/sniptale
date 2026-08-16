import type { SettingsSectionId } from '../../platform/navigation/extension-pages/settings-route/codec';

export const SETTINGS_TRANSFER_SECTION_COVERAGE = {
  'interface-browser': ['interface.preferences'],
  'quick-actions': ['capture.quick-actions'],
  'screen-sizes': ['capture.viewport-presets'],
  'media-quality': ['capture.image', 'capture.video'],
  saving: ['capture.after-capture', 'capture.saving', 'capture.retention'],
  annotations: ['styles.borders', 'styles.callouts', 'styles.numbering', 'styles.tags'],
  'editor-resources': [
    'styles.tool-presets',
    'styles.palettes',
    'styles.surfaces',
    'styles.gradients',
  ],
  'ai-connections': ['ai.providers', 'ai.models', 'ai.chrome'],
  'ai-prompts': ['ai.prompts', 'ai.prompt-templates'],
  'voice-input': ['system.voice', 'system.voice.microphone'],
  'native-app': ['system.native', 'system.native.connection'],
  'access-data': [
    'access.capture-assets',
    'access.capture-assets.permissions',
    'access.capture-assets.reset-actions',
  ],
  'settings-transfer': ['action/status'],
} as const satisfies Record<SettingsSectionId, readonly string[]>;

export const SETTINGS_TRANSFER_VIEW_COVERAGE = {
  'editor-resources': {
    tools: 'styles.tool-presets',
    palettes: 'styles.palettes',
    surfaces: 'styles.surfaces',
    gradients: 'styles.gradients',
  },
  annotations: {
    borders: 'styles.borders',
    callouts: 'styles.callouts',
    numbering: 'styles.numbering',
    tags: 'styles.tags',
  },
} as const;

type PersistenceMutationCoverage = {
  sourceFile: string;
  mutations: readonly string[];
  transferIds?: readonly string[];
  classification?: 'secret' | 'action/status';
};

export const SETTINGS_TRANSFER_PERSISTENCE_MUTATION_COVERAGE = [
  transferable('ai/connections/controller/chrome-ai.ts', ['saveChromeAiEnabled'], ['ai.chrome']),
  transferable(
    'ai/connections/controller/delete-actions.ts',
    ['deleteAIModel', 'deleteAIProvider'],
    ['ai.models', 'ai.providers']
  ),
  transferable('ai/connections/controller/model-order.ts', ['moveAIModel'], ['ai.models']),
  excluded(
    'ai/connections/controller/provider-secret-actions.ts',
    ['clearAIProviderSecret'],
    'secret'
  ),
  transferable('ai/connections/controller/save.ts', ['saveDefaultModelId'], ['ai.models']),
  excluded(
    'ai/connections/controller/section/secret-protection.ts',
    [
      'changeAISecretPassphraseProtection',
      'disableAISecretPassphraseProtection',
      'enableAISecretPassphraseProtection',
      'lockAISecretPassphraseProtection',
      'resetAISecretPassphraseProtection',
      'unlockAISecretPassphraseProtection',
    ],
    'secret'
  ),
  transferable(
    'ai/connections/forms/save.ts',
    ['addAIModel', 'addAIProvider', 'updateAIModel', 'updateAIProvider'],
    ['ai.models', 'ai.providers']
  ),
  transferable(
    'ai/prompts/save.ts',
    [
      'resetGlobalSystemPrompt',
      'resetScenarioEditorSystemPrompt',
      'saveGlobalSystemPrompt',
      'saveScenarioEditorSystemPrompt',
    ],
    ['ai.prompts']
  ),
  transferable('capture/media-quality/image/controller.ts', ['updateSettings'], ['capture.image']),
  transferable(
    'capture/media-quality/video/use-profiles.ts',
    ['mutateVideoSettings'],
    ['capture.video']
  ),
  transferable(
    'capture/quick-actions/crud/persistence.ts',
    ['saveQuickActions'],
    ['capture.quick-actions']
  ),
  transferable(
    'capture/saving/actions/sync.ts',
    ['updateSettings'],
    ['capture.after-capture', 'capture.saving']
  ),
  transferable('capture/screen-sizes/sync.ts', ['updateSettings'], ['capture.viewport-presets']),
  transferable(
    'capture/storage-drafts/use-storage-drafts-state.ts',
    ['patchSettings'],
    ['capture.retention']
  ),
  excluded(
    'capture/storage-drafts/use-storage-drafts-state.ts',
    ['cleanupDrafts'],
    'action/status'
  ),
  transferable(
    'general/interface-browser/controller.ts',
    ['updateSettings'],
    ['interface.preferences']
  ),
  transferable(
    'general/interface-browser/popup-startup-preference.ts',
    ['savePopupStartupSelection'],
    ['interface.preferences.popup-startup']
  ),
  transferable(
    'styles/annotations/borders/crud-actions.ts',
    [
      'addBorderPresetWithOutcome',
      'deleteBorderPreset',
      'resetSystemBorderPreset',
      'updateBorderPresetWithOutcome',
    ],
    ['styles.borders']
  ),
  transferable(
    'styles/annotations/borders/ordering-actions.ts',
    ['updateBorderPresetsOrder'],
    ['styles.borders']
  ),
  transferable(
    'styles/annotations/borders/persistence-actions.ts',
    [
      'saveDefaultBlurSettings',
      'saveDefaultFocusSettings',
      'setBorderPresetEnabled',
      'setDefaultBorderPreset',
    ],
    ['styles.borders']
  ),
  transferable(
    'styles/annotations/callouts/controller.ts',
    [
      'createUserCalloutPreset',
      'deleteCalloutPreset',
      'resetSystemCalloutPreset',
      'setCalloutPresetEnabled',
      'setDefaultCalloutPreset',
      'updateCalloutPreset',
      'updateCalloutSessionDefaults',
      'updateCalloutPresetsOrder',
    ],
    ['styles.callouts']
  ),
  transferable(
    'styles/annotations/numbering/controller-actions.ts',
    [
      'createUserStepBadgePreset',
      'deleteStoredStepBadgePreset',
      'resetStoredSystemStepBadgePreset',
      'setDefaultStoredStepBadgePreset',
      'setStoredStepBadgePresetEnabled',
      'updateStoredStepBadgePreset',
      'updateStoredStepBadgePresetOrder',
    ],
    ['styles.numbering']
  ),
  transferable(
    'styles/annotations/numbering/controller.ts',
    ['updateStepBadgeSessionDefaults'],
    ['styles.numbering']
  ),
  transferable(
    'styles/annotations/tags/controller.ts',
    ['createAnnotationTemplateTag', 'deleteAnnotationTemplateTag', 'mergeAnnotationTemplateTag'],
    ['styles.tags']
  ),
  transferable(
    'styles/editor-resources/palettes/actions.ts',
    ['saveEditorPaletteSettings'],
    ['styles.tool-presets']
  ),
  transferable(
    'styles/editor-resources/palettes/controller.ts',
    ['createDefaultDrawingPaletteState', 'changeDrawingPaletteColor', 'reorderDrawingPaletteColor'],
    ['styles.palettes']
  ),
  transferable(
    'styles/editor-resources/storage.ts',
    ['createDefaultEditorPresetStorageState'],
    ['styles.tool-presets']
  ),
  transferable(
    'styles/editor-resources/tools/actions.ts',
    [
      'deleteEditorPreset',
      'setDefaultEditorPreset',
      'setEditorPresetEnabled',
      'updateEditorPresetOrder',
    ],
    ['styles.tool-presets']
  ),
  transferable(
    'system/access-data/capture-resources/controller.ts',
    ['updateSettings'],
    ['access.capture-assets']
  ),
  excluded(
    'system/access-data/privacy/index.tsx',
    ['requestLocalExtensionDataErasure'],
    'action/status'
  ),
  transferable('system/native-app/controller.ts', ['mutateVideoSettings'], ['system.native']),
  excluded(
    'system/native-app/controller.ts',
    ['createNativeAppRuntimeClient', 'settingsRuntimeMessagingTransport'],
    'action/status'
  ),
  excluded(
    'system/settings-transfer/client.ts',
    ['createSettingsTransferClient', 'settingsRuntimeMessagingTransport'],
    'action/status'
  ),
  transferable('system/voice-input/use-voice-input.ts', ['updateSettings'], ['system.voice']),
] as const satisfies readonly PersistenceMutationCoverage[];

function transferable(
  sourceFile: string,
  mutations: readonly string[],
  transferIds: readonly string[]
): PersistenceMutationCoverage {
  return { sourceFile, mutations, transferIds };
}

function excluded(
  sourceFile: string,
  mutations: readonly string[],
  classification: 'secret' | 'action/status'
): PersistenceMutationCoverage {
  return { sourceFile, mutations, classification };
}
