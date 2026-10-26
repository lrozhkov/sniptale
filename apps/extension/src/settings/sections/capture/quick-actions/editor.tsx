import { Camera, Image, Info, PanelTop, Zap } from 'lucide-react';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { createQuickActionAppearance } from '../../../../contracts/quick-action-appearance';
import { QuickActionHeaderSettings } from './appearance/header';
import { QuickActionBackgroundSettings } from './appearance/background';
import { QuickActionInformationSettings } from './appearance/information';
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

function resolveQuickActionsEditorTitle(isExisting: boolean) {
  return isExisting
    ? translate('settings.quickActions.editTitle')
    : translate('settings.quickActions.newTitle');
}

function QuickActionsEditorBody(props: {
  state: QuickActionsSectionState;
  viewportPresets: ViewportPreset[] | undefined;
}) {
  const appearance = props.state.editForm?.appearance ?? createQuickActionAppearance();
  const onChange = (value: typeof appearance) => props.state.updateFormField('appearance', value);
  return (
    <ProductModalBody compact className="!space-y-0 !p-0">
      <CategorizedInspector
        initialSection="action"
        showSectionHeading
        ariaLabel={translate('settings.quickActions.appearanceNavigation')}
        dataUi="quick-action.appearance.inspector"
        sections={[
          { id: 'action', icon: Zap, label: translate('settings.quickActions.appearanceAction') },
          {
            id: 'capture',
            icon: Camera,
            label: translate('settings.quickActions.appearanceCapture'),
          },
          {
            id: 'header',
            icon: PanelTop,
            label: translate('settings.quickActions.appearanceHeader'),
          },
          {
            id: 'background',
            icon: Image,
            label: translate('settings.quickActions.appearanceBackground'),
          },
          {
            id: 'information',
            icon: Info,
            label: translate('settings.quickActions.appearanceInformation'),
          },
        ]}
        renderSection={(section) => {
          if (section === 'header')
            return <QuickActionHeaderSettings value={appearance} onChange={onChange} />;
          if (section === 'background')
            return <QuickActionBackgroundSettings value={appearance} onChange={onChange} />;
          if (section === 'information')
            return <QuickActionInformationSettings value={appearance} onChange={onChange} />;
          return (
            <div className="space-y-3">
              {section === 'action' ? (
                <>
                  <QuickActionsEditorIdentityFields state={props.state} />
                  <QuickActionsEditorPrimaryOutputField state={props.state} />
                  <QuickActionsEditorToggleRow
                    state={props.state}
                    includeExitAfterCapture={props.state.editForm?.screenshotMode !== 'desktop'}
                  />
                </>
              ) : (
                <>
                  <QuickActionsEditorPrimaryCaptureFields state={props.state} />
                  <QuickActionsEditorSecondaryCaptureFields
                    state={props.state}
                    viewportPresets={props.viewportPresets}
                  />
                  <QuickActionsEditorAdvancedOutputFields state={props.state} />
                </>
              )}
            </div>
          );
        }}
      />
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
      width="540px"
      maxHeight="85vh"
      scrollable
      dialogClassName={settingsModalClassName}
    >
      <ProductModalHeader
        compact
        title={resolveQuickActionsEditorTitle(isExisting)}
        onClose={state.handleCancelEdit}
      />
      <QuickActionsEditorBody
        key={state.editingId}
        state={state}
        viewportPresets={viewportPresets}
      />
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
