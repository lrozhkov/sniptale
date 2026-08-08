import { translate } from '../../../../../platform/i18n';
import { PromptTemplateEditor } from '../../../../../features/prompt-templates/editor';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { settingsSectionClassName } from '../../../../section-surface';
import { TemplatesHeader, TemplatesList } from './content.sections.tsx';
import type { TemplatesSectionContentProps } from './content.types.ts';

export function TemplatesSectionContent(props: TemplatesSectionContentProps) {
  return (
    <div className={settingsSectionClassName}>
      <TemplatesHeader />
      <TemplatesList
        isLoading={props.isLoading}
        onDelete={props.handleDeleteTemplate}
        onEdit={props.handleEditTemplate}
        onAdd={props.openNewTemplateEditor}
        templates={props.templates}
      />

      <PromptTemplateEditor
        isOpen={props.isEditorOpen}
        onClose={props.closeTemplateEditor}
        onSave={props.handleSaveTemplate}
        isLoading={props.isLoading}
        submitError={props.submitError}
        {...(props.editingTemplate === undefined ? {} : { template: props.editingTemplate })}
      />

      <ProductConfirmDialog
        isOpen={props.confirmState.isOpen}
        title={
          props.confirmState.template?.isDefault
            ? translate('templates.section.deleteDefaultTitle')
            : translate('templates.section.deleteCustomTitle')
        }
        message={
          `${translate('templates.section.deleteMessagePrefix')} ` +
          `"${props.confirmState.template?.name}"` +
          `${translate('templates.section.deleteMessageSuffix')}`
        }
        confirmText={translate('common.actions.delete')}
        cancelText={translate('common.actions.cancel')}
        onConfirm={props.confirmDelete}
        onCancel={props.closeDeleteDialog}
        isLoading={props.isLoading}
        backdropClassName="!z-[2147483648]"
      />
    </div>
  );
}
