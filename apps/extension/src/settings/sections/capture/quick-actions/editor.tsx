import { translate } from '../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import type { ViewportPreset } from '../../../../contracts/settings';
import {
  QuickActionsEditorIdentityFields,
  QuickActionsEditorPrimaryCaptureFields,
  QuickActionsEditorSecondaryCaptureFields,
} from './editor-fields';
import {
  QuickActionsEditorAdvancedOutputFields,
  QuickActionsEditorPrimaryOutputField,
  QuickActionsEditorToggleRow,
} from './editor-output';
import { type QuickActionsSectionState } from './controller';
import { settingsModalClassName } from '../../../section-surface/panel-controls';

const editorSectionClassName = [
  'border-b border-[var(--sniptale-color-border-subtle)] py-3',
  'first:pt-0 last:border-b-0 last:pb-0',
].join(' ');

function resolveQuickActionsEditorTitle(isExisting: boolean) {
  return isExisting
    ? translate('settings.quickActions.editTitle')
    : translate('settings.quickActions.newTitle');
}

function QuickActionsEditorBody(props: {
  state: QuickActionsSectionState;
  viewportPresets: ViewportPreset[] | undefined;
}) {
  return (
    <ProductModalBody compact className="!space-y-0">
      <div className={editorSectionClassName}>
        <QuickActionsEditorIdentityFields state={props.state} />
      </div>
      <div className={editorSectionClassName}>
        <QuickActionsEditorPrimaryCaptureFields state={props.state} />
      </div>
      <div className={editorSectionClassName}>
        <QuickActionsEditorPrimaryOutputField state={props.state} />
      </div>
      <div className={editorSectionClassName}>
        <QuickActionsEditorSecondaryCaptureFields
          state={props.state}
          viewportPresets={props.viewportPresets}
        />
        <QuickActionsEditorAdvancedOutputFields state={props.state} />
      </div>
      <div className={editorSectionClassName}>
        <QuickActionsEditorToggleRow state={props.state} includeExitAfterCapture />
      </div>
    </ProductModalBody>
  );
}

export function QuickActionsEditor(props: {
  state: QuickActionsSectionState;
  viewportPresets: ViewportPreset[] | undefined;
}) {
  const { state, viewportPresets } = props;

  if (!state.editingId || !state.editForm) {
    return null;
  }

  const isExisting = state.actions.some((action) => action.id === state.editingId);

  return (
    <ProductModal
      isOpen
      onClose={state.handleCancelEdit}
      width="500px"
      maxHeight="85vh"
      scrollable
      dialogClassName={settingsModalClassName}
    >
      <ProductModalHeader
        compact
        title={resolveQuickActionsEditorTitle(isExisting)}
        onClose={state.handleCancelEdit}
      />
      <QuickActionsEditorBody state={state} viewportPresets={viewportPresets} />
      <QuickActionsEditorFooter state={state} />
    </ProductModal>
  );
}

function QuickActionsEditorFooter(props: { state: QuickActionsSectionState }) {
  return (
    <ProductModalFooter compact>
      <ProductActionButton onClick={props.state.handleCancelEdit} tone="secondary">
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton onClick={props.state.handleSaveEdit} tone="primary">
        {translate('common.actions.save')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}
