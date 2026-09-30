import { ProductModal, ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';
import { SavePresetEditorActions } from './actions';
import { resolveSavePresetEditorTitle } from './copy';
import { SavePresetEditorFields } from './fields';
import { useSavePresetEditorState } from './state';
import type { SavePresetEditorModalProps } from './types';
import { settingsModalClassName } from '../../../../section-surface';
import { translate } from '../../../../../platform/i18n';

/**
 * Modal editor for a single save preset.
 */
export function SavePresetEditorModal(props: SavePresetEditorModalProps) {
  const state = useSavePresetEditorState(props);
  const close = () => {
    if (!state.saving) props.onClose();
  };
  const actionsProps = {
    disabled: state.isSubmitDisabled,
    onClose: close,
    saving: state.saving,
    ...(props.preset === undefined ? {} : { preset: props.preset }),
  };

  return (
    <ProductModal
      isOpen
      onClose={close}
      width="560px"
      maxHeight="85vh"
      scrollable
      dialogClassName={settingsModalClassName}
    >
      <ProductModalHeader
        compact
        title={resolveSavePresetEditorTitle(props.preset)}
        onClose={close}
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
            {...(props.preset ? { previousPath: props.preset.path } : {})}
          />
          {state.saveFailed ? (
            <p role="alert" className="mt-3 text-sm text-[var(--sniptale-color-danger)]">
              {translate('savePresets.editor.saveFailed')}
            </p>
          ) : null}
        </ProductModalBody>
        <SavePresetEditorActions {...actionsProps} />
      </form>
    </ProductModal>
  );
}
