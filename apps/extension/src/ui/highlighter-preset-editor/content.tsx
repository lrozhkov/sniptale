import { useRef } from 'react';
import { translate } from '../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { BorderPresetEditorFields } from './fields';
import type { BorderPresetEditorProps } from './useBorderPresetEditorState';
import type { useBorderPresetEditorState } from './useBorderPresetEditorState';
import { usePresetEditorModalLifecycle } from './modal-lifecycle';

type EditorState = ReturnType<typeof useBorderPresetEditorState>;

function EditorFooter({
  disabled,
  isEditing,
  isSaving,
  onClose,
  onSave,
}: {
  disabled: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ProductModalFooter compact>
      <ProductActionButton type="button" onClick={onClose} tone="secondary">
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton
        type="button"
        onClick={onSave}
        aria-busy={isSaving || undefined}
        disabled={disabled || isSaving}
        tone="primary"
        compact
      >
        {isEditing
          ? translate('common.actions.save')
          : translate('highlighter.editor.createButton')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

export function BorderPresetEditorContent({
  isSaving = false,
  onClose,
  preset,
  state,
}: Pick<BorderPresetEditorProps, 'isSaving' | 'onClose' | 'preset'> & {
  state: EditorState;
}) {
  const modalRootRef = useRef<HTMLDivElement>(null);
  usePresetEditorModalLifecycle({ modalRootRef, onClose });
  const title = preset
    ? translate('highlighter.editor.editTitle')
    : translate('highlighter.editor.newTitle');

  return (
    <div ref={modalRootRef} style={{ display: 'contents' }}>
      <ProductModal
        dialogClassName="sniptale-highlighter-preset-editor-dialog"
        isOpen
        maxHeight="86vh"
        maxWidth="94vw"
        onClose={onClose}
        role="dialog"
        scrollable
        width="660px"
      >
        <ProductModalHeader compact title={title} onClose={onClose} />
        <ProductModalBody compact className="space-y-4">
          <BorderPresetEditorFields state={state} />
        </ProductModalBody>
        <EditorFooter
          disabled={!state.name.trim() || state.hasBlockedProps || Boolean(state.cssError)}
          isEditing={Boolean(preset)}
          isSaving={isSaving}
          onClose={onClose}
          onSave={state.handleSave}
        />
      </ProductModal>
    </div>
  );
}
