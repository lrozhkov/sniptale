import { translate } from '../../../../platform/i18n';
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

type EditorState = ReturnType<typeof useBorderPresetEditorState>;

function EditorFooter({
  disabled,
  isEditing,
  onClose,
  onSave,
}: {
  disabled: boolean;
  isEditing: boolean;
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
        disabled={disabled}
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
  onClose,
  preset,
  state,
}: Pick<BorderPresetEditorProps, 'onClose' | 'preset'> & {
  state: EditorState;
}) {
  const title = preset
    ? translate('highlighter.editor.editTitle')
    : translate('highlighter.editor.newTitle');

  return (
    <ProductModal
      isOpen
      onClose={onClose}
      width="720px"
      maxWidth="95vw"
      maxHeight="88vh"
      scrollable
      accent="compact"
    >
      <ProductModalHeader compact title={title} onClose={onClose} />
      <ProductModalBody compact className="space-y-6">
        <BorderPresetEditorFields state={state} />
      </ProductModalBody>
      <EditorFooter
        disabled={!state.name.trim() || state.hasBlockedProps || Boolean(state.cssError)}
        isEditing={Boolean(preset)}
        onClose={onClose}
        onSave={state.handleSave}
      />
    </ProductModal>
  );
}
