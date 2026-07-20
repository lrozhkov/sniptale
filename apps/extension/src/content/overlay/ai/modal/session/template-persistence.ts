import { createLogger } from '@sniptale/platform/observability/logger';
import type { AIModalTemplateDraft } from '../shell/types';

const logger = createLogger({ namespace: 'ContentAiModal' });

export function createTemplateDeleteHandler(removeTemplate: (id: string) => Promise<void>) {
  return async (template: { id: string }) =>
    removeTemplate(template.id).catch((error) => {
      logger.error('Error deleting template', error);
      throw error;
    });
}

export function createTemplateSaveHandler(props: {
  addTemplate: (name: string, content: string) => Promise<void>;
  editingTemplate: AIModalTemplateDraft | undefined;
  updateTemplate: (id: string, draft: { name: string; content: string }) => Promise<void>;
}) {
  return async (name: string, content: string) => {
    if (props.editingTemplate) {
      await props.updateTemplate(props.editingTemplate.id, { name, content });
      return;
    }

    await props.addTemplate(name, content);
  };
}
