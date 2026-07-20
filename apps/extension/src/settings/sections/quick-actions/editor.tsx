import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import type { QuickActionsDisplayMode, ViewportPreset } from '../../../contracts/settings';
import { displayModeOptions } from './section/constants';
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
import { type QuickActionsSectionState } from './section';
import { settingsModalFieldSurfaceClassName } from '../../section-surface/panel-controls';

const displayModeCardClassName = [settingsModalFieldSurfaceClassName, 'mb-6'].join(' ');

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
    <ProductModalBody compact className="space-y-5">
      <div className={settingsModalFieldSurfaceClassName}>
        <QuickActionsEditorIdentityFields state={props.state} />
      </div>
      <div className={settingsModalFieldSurfaceClassName}>
        <QuickActionsEditorPrimaryCaptureFields state={props.state} />
      </div>
      <div className={settingsModalFieldSurfaceClassName}>
        <QuickActionsEditorPrimaryOutputField state={props.state} />
      </div>
      <div className={settingsModalFieldSurfaceClassName}>
        <QuickActionsEditorSecondaryCaptureFields
          state={props.state}
          viewportPresets={props.viewportPresets}
        />
        <QuickActionsEditorAdvancedOutputFields state={props.state} />
      </div>
      <div className={settingsModalFieldSurfaceClassName}>
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
      width="560px"
      maxHeight="85vh"
      scrollable
      accent="compact"
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

export function QuickActionsDisplayModeCard(props: {
  displayMode: QuickActionsDisplayMode;
  onChange: (value: QuickActionsDisplayMode) => Promise<void>;
}) {
  return (
    <div className={displayModeCardClassName}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {translate('settings.quickActions.displayModeTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--sniptale-color-text-dim)]">
            {displayModeOptions.find((option) => option.value === props.displayMode)?.description}
          </p>
        </div>
        <ProductSelect
          value={props.displayMode}
          onChange={(value) => props.onChange(value as QuickActionsDisplayMode)}
          options={displayModeOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </div>
    </div>
  );
}
