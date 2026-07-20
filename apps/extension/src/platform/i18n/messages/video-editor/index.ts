import { defineMessageSource } from '../source';
import { videoEditorAppMessages } from './app';
import { videoEditorDiagnosticsMessages } from './diagnostics';
import { videoEditorExportDialogMessages } from './export-dialog';
import { videoEditorEffectsLibraryMessages } from './effects-library';
import { videoEditorProgressMessages } from './progress';
import { videoEditorSidebarMessages } from './sidebar/index';
import { videoEditorStageMessages } from './stage';
import { videoEditorTemplateMessages } from './templates';
import { videoEditorTimelineMessages } from './timeline';

export const videoEditorMessages = defineMessageSource({
  progress: videoEditorProgressMessages,
  diagnostics: videoEditorDiagnosticsMessages,
  sidebar: videoEditorSidebarMessages,
  timeline: videoEditorTimelineMessages,
  exportDialog: videoEditorExportDialogMessages,
  effectsLibrary: videoEditorEffectsLibraryMessages,
  stage: videoEditorStageMessages,
  templates: videoEditorTemplateMessages,
  app: videoEditorAppMessages,
});
