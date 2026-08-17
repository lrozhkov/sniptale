import { useEffect, useState, type FormEvent } from 'react';
import type { AnnotationTemplateTag } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { translate } from '../../../../../platform/i18n';
import { settingsMetaLabelClassName, settingsModalClassName } from '../../../../section-surface';
import type { useAnnotationTemplateTagsController } from './controller';
import { getAnnotationTemplateTagDisplayName } from '../../../../../ui/annotation-template-query';

type Controller = ReturnType<typeof useAnnotationTemplateTagsController>;

export type AnnotationTemplateTagEditorState =
  | { mode: 'create' }
  | { mode: 'edit'; tag: AnnotationTemplateTag }
  | null;

export function AnnotationTemplateTagEditor(props: {
  controller: Controller;
  editor: AnnotationTemplateTagEditorState;
  onClose(): void;
}) {
  const [label, setLabel] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  useEffect(() => {
    setLabel(
      props.editor?.mode === 'edit' ? getAnnotationTemplateTagDisplayName(props.editor.tag) : ''
    );
    setMergeTarget('');
  }, [props.editor]);
  if (!props.editor) return null;
  const editingTag = props.editor.mode === 'edit' ? props.editor.tag : null;
  const options = props.controller.state.tags
    .filter((tag) => tag.id !== editingTag?.id && editingTag?.origin !== 'system')
    .map((tag) => ({ label: getAnnotationTemplateTagDisplayName(tag), value: tag.id }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const nextLabel = label.trim();
    if (!nextLabel) return;
    const saved = editingTag
      ? editingTag.origin === 'system' &&
        editingTag.customized !== true &&
        nextLabel === getAnnotationTemplateTagDisplayName(editingTag)
        ? true
        : await props.controller.actions.rename(editingTag.id, nextLabel)
      : await props.controller.actions.create(nextLabel);
    if (saved) props.onClose();
  };
  const merge = async () => {
    if (!editingTag || !mergeTarget) return;
    const merged = await props.controller.actions.merge(editingTag.id, mergeTarget);
    if (merged) props.onClose();
  };

  return (
    <ProductModal
      dialogClassName={settingsModalClassName}
      isOpen
      maxHeight="85vh"
      onClose={props.onClose}
      scrollable
      width="420px"
    >
      <ProductModalHeader
        compact
        onClose={props.onClose}
        title={translate(
          editingTag ? 'highlighter.templateTags.editTitle' : 'highlighter.templateTags.createTitle'
        )}
      />
      <form onSubmit={save}>
        <ProductModalBody compact>
          <label className={settingsMetaLabelClassName} htmlFor="annotation-template-tag-name">
            {translate('highlighter.templateTags.name')}
          </label>
          <ProductInput
            autoFocus
            id="annotation-template-tag-name"
            maxLength={32}
            onChange={(event) => setLabel(event.currentTarget.value)}
            value={label}
          />
          {editingTag?.origin !== 'system' && options.length > 0 ? (
            <div className="mt-4 border-t border-[var(--sniptale-color-border-soft)] pt-4">
              <label className={settingsMetaLabelClassName}>
                {translate('highlighter.templateTags.mergeTarget')}
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <ProductSelect
                  aria-label={translate('highlighter.templateTags.mergeTarget')}
                  className="min-w-0 flex-1"
                  onChange={setMergeTarget}
                  options={options}
                  value={mergeTarget}
                />
                <ProductActionButton
                  compact
                  disabled={!mergeTarget}
                  onClick={merge}
                  tone="secondary"
                >
                  {translate('highlighter.templateTags.merge')}
                </ProductActionButton>
              </div>
            </div>
          ) : null}
        </ProductModalBody>
        <ProductModalFooter compact>
          <ProductActionButton compact onClick={props.onClose} tone="secondary">
            {translate('common.actions.cancel')}
          </ProductActionButton>
          <ProductActionButton compact disabled={!label.trim()} type="submit">
            {translate(
              editingTag ? 'highlighter.templateTags.rename' : 'highlighter.templateTags.add'
            )}
          </ProductActionButton>
        </ProductModalFooter>
      </form>
    </ProductModal>
  );
}
