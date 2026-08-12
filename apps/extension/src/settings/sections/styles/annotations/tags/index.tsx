import { useState } from 'react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../../../../platform/i18n';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  settingsModalClassName,
  settingsSectionClassName,
} from '../../../../section-surface';
import { AnnotationTemplateTagEditor, type AnnotationTemplateTagEditorState } from './editor';
import { useAnnotationTemplateTagsController } from './controller';

export function AnnotationTemplateTagsSettings() {
  const controller = useAnnotationTemplateTagsController();
  const [editor, setEditor] = useState<AnnotationTemplateTagEditorState>(null);
  const [deleteTagId, setDeleteTagId] = useState<string | null>(null);
  const items: readonly SettingsCollectionItem[] = controller.state.tags.map((tag) => ({
    id: tag.id,
    title: tag.label,
    meta: translate('highlighter.templateTags.usage').replace(
      '{count}',
      String(controller.usage.get(tag.id) ?? 0)
    ),
    capabilities: { delete: true, edit: true },
  }));
  const tagsById = new Map(controller.state.tags.map((tag) => [tag.id, tag]));
  const onAction = (action: SettingsCollectionAction) => {
    const tag = tagsById.get(action.itemId);
    if (!tag) return;
    if (action.type === 'edit') setEditor({ mode: 'edit', tag });
    if (action.type === 'delete') setDeleteTagId(tag.id);
  };
  const deleteTag = async () => {
    if (!deleteTagId) return;
    const deleted = await controller.actions.delete(deleteTagId);
    if (deleted) setDeleteTagId(null);
  };

  return (
    <section className={settingsSectionClassName}>
      <SettingsCollection
        addAction={{
          disabled: controller.state.tags.length >= 32,
          label: translate('highlighter.templateTags.add'),
          onInvoke: () => setEditor({ mode: 'create' }),
        }}
        ariaLabel={translate('highlighter.templateTags.title')}
        emptyState={translate('highlighter.templateTags.assignmentEmpty')}
        errorState={translate('highlighter.templateTags.loadError')}
        items={items}
        onAction={onAction}
        state={controller.isLoading ? 'loading' : controller.error ? 'error' : 'ready'}
      />
      <AnnotationTemplateTagEditor
        controller={controller}
        editor={editor}
        onClose={() => setEditor(null)}
      />
      <ProductConfirmDialog
        cancelText={translate('common.actions.cancel')}
        confirmText={translate('highlighter.templateTags.delete')}
        dialogClassName={settingsModalClassName}
        isOpen={deleteTagId !== null}
        message={translate('highlighter.templateTags.deleteDescription')}
        onCancel={() => setDeleteTagId(null)}
        onConfirm={deleteTag}
        title={translate('highlighter.templateTags.deleteTitle')}
      />
    </section>
  );
}
