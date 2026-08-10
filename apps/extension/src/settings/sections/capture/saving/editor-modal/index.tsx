import { ProductModal, ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';
import { SavePresetEditorActions } from './actions';
import { resolveSavePresetEditorTitle } from './copy';
import { SavePresetEditorFields } from './fields';
import { useSavePresetEditorState } from './state';
import type { SavePresetEditorModalProps } from './types';
import { settingsModalClassName } from '../../../../section-surface';

/**
 * Modal editor for a single save preset.
 */
export function SavePresetEditorModal(props: SavePresetEditorModalProps) {
  const state = useSavePresetEditorState(props);
  const actionsProps = {
    disabled: state.isSubmitDisabled,
    onClose: props.onClose,
    saving: state.saving,
    ...(props.preset === undefined ? {} : { preset: props.preset }),
  };

  return (
    <ProductModal
      isOpen
      onClose={props.onClose}
      width="400px"
      maxHeight="85vh"
      scrollable
      dialogClassName={settingsModalClassName}
    >
      <ProductModalHeader
        compact
        title={resolveSavePresetEditorTitle(props.preset)}
        onClose={props.onClose}
      />
      <form onSubmit={state.handleSubmit} className="contents">
        <ProductModalBody compact>
          <SavePresetEditorFields
            enabled={state.enabled}
            name={state.name}
            path={state.path}
            setEnabled={state.setEnabled}
            setName={state.setName}
            setPath={state.setPath}
          />
        </ProductModalBody>
        <SavePresetEditorActions {...actionsProps} />
      </form>
    </ProductModal>
  );
}
