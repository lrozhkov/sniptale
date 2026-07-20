import { aiModalMessages } from './ai-modal';
import { backgroundMessages } from './background';
import { commonMessages } from './common';
import { contentMessages } from './content';
import { defineMessageSource } from './source';
import { designSystemMessages } from './design-system';
import { editorMessages } from './editor';
import { exportModalMessages } from './export-modal';
import { galleryMessages } from './gallery';
import { highlighterMessages } from './highlighter';
import { imageSettingsMessages } from './image-settings';
import { localeLanguageMessages } from '@sniptale/platform/i18n/config';
import { offscreenExportMessages } from './offscreen-export';
import { popupMessages } from './popup';
import { savePresetsMessages } from './save-presets';
import { scenarioMessages } from './scenario';
import { settingsMessages } from './settings';
import { sharedMessages } from './shared';
import { templatesMessages } from './templates';
import { validationMessages } from './validation';
import { videoEditorMessages } from './video-editor';
import { webSnapshotViewerMessages } from './web-snapshot-viewer';
import { viewportPresetsMessages } from './viewport-presets';

export const translationMessages = defineMessageSource({
  common: defineMessageSource({ ...commonMessages, languages: localeLanguageMessages }),
  settings: settingsMessages,
  templates: templatesMessages,
  shared: sharedMessages,
  highlighter: highlighterMessages,
  designSystem: designSystemMessages,
  validation: validationMessages,
  editor: editorMessages,
  exportModal: exportModalMessages,
  offscreenExport: offscreenExportMessages,
  aiModal: aiModalMessages,
  savePresets: savePresetsMessages,
  imageSettings: imageSettingsMessages,
  viewportPresets: viewportPresetsMessages,
  content: contentMessages,
  popup: popupMessages,
  gallery: galleryMessages,
  scenario: scenarioMessages,
  background: backgroundMessages,
  videoEditor: videoEditorMessages,
  webSnapshotViewer: webSnapshotViewerMessages,
});
