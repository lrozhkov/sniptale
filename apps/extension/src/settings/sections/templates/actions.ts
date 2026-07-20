import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { ConfirmState } from './delete-state';

const logger = createLogger({ namespace: 'SettingsTemplatesSection' });

interface TemplateActionsProps {
  addTemplate: (name: string, content: string) => Promise<void>;
  closeDeleteDialog: () => void;
  closeTemplateEditor: () => void;
  confirmState: ConfirmState;
  editingTemplate?: { id: string; name: string; content: string };
  removeTemplate: (id: string) => Promise<void>;
  updateTemplate: (id: string, patch: { name: string; content: string }) => Promise<void>;
}

export function useTemplateActions(props: TemplateActionsProps) {
  const handleSaveTemplate = async (name: string, content: string) => {
    try {
      if (props.editingTemplate) {
        await props.updateTemplate(props.editingTemplate.id, { name, content });
        toast.success(translate('templates.messages.updated'));
      } else {
        await props.addTemplate(name, content);
        toast.success(translate('templates.messages.created'));
      }
    } catch (error) {
      logger.error('Failed to save template', error);
      toast.error(
        `${translate('common.states.error')}${translate('templates.messages.saveErrorSuffix')}`
      );
      throw error;
    }

    props.closeTemplateEditor();
  };

  const confirmDelete = async () => {
    if (!props.confirmState.template) {
      return;
    }

    try {
      await props.removeTemplate(props.confirmState.template.id);
      toast.success(translate('templates.messages.deleted'));
    } catch (error) {
      logger.error('Failed to delete template', error);
      toast.error(
        `${translate('common.states.error')}${translate('templates.messages.deleteErrorSuffix')}`
      );
      throw error;
    }

    props.closeDeleteDialog();
  };

  return { confirmDelete, handleSaveTemplate };
}
