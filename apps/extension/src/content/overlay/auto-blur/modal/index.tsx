import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorLayout } from '../../../../ui/compact-inspector-controls/layout';
import { BrushCleaning } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { AutoBlurController } from '../controller';
import { AutoBlurBlurControls } from './controls';
import { AutoBlurTable } from './table';
import { useAutoBlurBorderPresetCatalog } from './use-border-preset-catalog';
import { resolveEnabledBorderPreset } from '../../../../features/highlighter/presets/enabled-catalog';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import type { HighlighterSettings } from '../../../../features/highlighter/contracts';
import { AutoBlurAutoApplyCategories } from './auto-apply-categories';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';

function AutoBlurModalState(props: { status: AutoBlurController['status'] }) {
  if (props.status === 'loading') {
    return (
      <div className="py-8 text-[13px] leading-[18px]">{translate('content.autoBlur.loading')}</div>
    );
  }

  if (props.status === 'error') {
    return <div className="sniptale-error-text">{translate('content.autoBlur.scanError')}</div>;
  }

  return null;
}

function AutoBlurModalReadyContent(props: {
  catalog: HighlighterSettings;
  controller: AutoBlurController;
}) {
  if (props.controller.configurationMode === 'auto-apply') {
    return (
      <div className="grid gap-2">
        <AutoBlurAutoApplyCategories
          selectedCategories={props.controller.selectedCategories}
          toggleCategory={props.controller.toggleCategory}
        />
        <AutoBlurBlurControls
          blurSettings={props.controller.blurSettings}
          borderPresets={props.catalog.borderPresets}
          defaultBorderPresetId={props.catalog.defaultBorderPresetId}
          setBlurSettings={props.controller.setBlurSettings}
        />
      </div>
    );
  }

  if (props.controller.status === 'loading' || props.controller.status === 'error') {
    return <AutoBlurModalState status={props.controller.status} />;
  }

  return (
    <div className="grid gap-2">
      <AutoBlurTable
        matches={props.controller.matches}
        selectedCategories={props.controller.selectedCategories}
        selectedMatchIds={props.controller.selectedMatchIds}
        toggleAllSelection={props.controller.toggleAllSelection}
        toggleCategory={props.controller.toggleCategory}
        toggleMatch={props.controller.toggleMatch}
      />
      {props.controller.status === 'empty' ? (
        <div className="text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]">
          {translate('content.autoBlur.empty')}
        </div>
      ) : null}
      <AutoBlurBlurControls
        blurSettings={props.controller.blurSettings}
        borderPresets={props.catalog.borderPresets}
        defaultBorderPresetId={props.catalog.defaultBorderPresetId}
        setBlurSettings={props.controller.setBlurSettings}
      />
    </div>
  );
}

function AutoBlurModalFooter(props: {
  autoApplyMode: boolean;
  disabled: boolean;
  applyDisabled: boolean;
  catalog: HighlighterSettings;
  controller: AutoBlurController;
}) {
  return (
    <ProductModalFooter compact>
      {props.autoApplyMode ? null : (
        <ProductActionButton
          compact
          disabled={props.disabled}
          onClick={props.controller.reset}
          tone="secondary"
        >
          <BrushCleaning className="h-4 w-4" />
          {translate('content.autoBlur.reset')}
        </ProductActionButton>
      )}
      <div className="flex-1" />
      <ProductActionButton
        compact
        tone="secondary"
        onClick={props.controller.close}
        disabled={props.disabled}
      >
        {translate('content.autoBlur.cancel')}
      </ProductActionButton>
      <ProductActionButton
        compact
        onClick={(event) => {
          const borderSettings = projectBorderPresetToAppliedSettings(
            resolveEnabledBorderPreset(props.catalog, props.controller.blurSettings.borderPresetId)
          );
          if (props.autoApplyMode) {
            void props.controller.apply(
              borderSettings,
              createTrustedContentActionIntentSource(event.nativeEvent) ?? undefined
            );
          } else {
            void props.controller.apply(borderSettings);
          }
        }}
        disabled={props.applyDisabled}
      >
        {translate('content.autoBlur.apply')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

export function AutoBlurModal(props: { controller: AutoBlurController }) {
  const catalog = useAutoBlurBorderPresetCatalog();

  if (!props.controller.isOpen) {
    return null;
  }

  const autoApplyMode = props.controller.configurationMode === 'auto-apply';
  const disabled =
    props.controller.isApplying || (!autoApplyMode && props.controller.status === 'loading');
  const applyDisabled =
    disabled ||
    (!autoApplyMode &&
      (props.controller.status !== 'ready' || props.controller.selectedTargetCount === 0));

  return (
    <CommandPressScope value={true}>
      <InspectorLayout>
        <ProductModal
          closeOnBackdrop={false}
          backdropClassName="sniptale-auto-blur-backdrop"
          dialogClassName="sniptale-auto-blur-modal sniptale-compact-workspace"
          maxWidth={autoApplyMode ? '450px' : '780px'}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape' && !event.defaultPrevented && !disabled)
              props.controller.close();
          }}
        >
          <ProductModalHeader
            compact
            title={translate('content.autoBlur.title')}
            onClose={props.controller.close}
            closeTitle={translate('content.autoBlur.cancel')}
            disabled={disabled}
          />
          <ProductModalBody
            compact
            className="grid min-h-0 gap-2 overflow-y-auto sniptale-modal-scroll"
          >
            <AutoBlurModalReadyContent catalog={catalog} controller={props.controller} />
            {props.controller.errorMessage ? (
              <div className="sniptale-error-text">{translate(props.controller.errorMessage)}</div>
            ) : null}
          </ProductModalBody>
          <AutoBlurModalFooter
            autoApplyMode={autoApplyMode}
            disabled={disabled}
            applyDisabled={applyDisabled}
            catalog={catalog}
            controller={props.controller}
          />
        </ProductModal>
      </InspectorLayout>
    </CommandPressScope>
  );
}
