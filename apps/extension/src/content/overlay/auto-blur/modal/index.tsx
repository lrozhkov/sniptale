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

function AutoBlurModalState(props: { status: AutoBlurController['status'] }) {
  if (props.status === 'loading') {
    return <div className="py-8 text-sm">{translate('content.autoBlur.loading')}</div>;
  }

  if (props.status === 'error') {
    return <div className="sniptale-error-text">{translate('content.autoBlur.scanError')}</div>;
  }

  return null;
}

function AutoBlurModalReadyContent(props: { controller: AutoBlurController }) {
  if (props.controller.status === 'loading' || props.controller.status === 'error') {
    return <AutoBlurModalState status={props.controller.status} />;
  }

  return (
    <div className="grid gap-6">
      <AutoBlurTable
        matches={props.controller.matches}
        selectedCategories={props.controller.selectedCategories}
        selectedMatchIds={props.controller.selectedMatchIds}
        toggleAllSelection={props.controller.toggleAllSelection}
        toggleCategory={props.controller.toggleCategory}
        toggleMatch={props.controller.toggleMatch}
      />
      {props.controller.status === 'empty' ? (
        <div className="text-sm text-[var(--sniptale-color-text-dim)]">
          {translate('content.autoBlur.empty')}
        </div>
      ) : null}
      <AutoBlurBlurControls
        blurSettings={props.controller.blurSettings}
        setBlurSettings={props.controller.setBlurSettings}
      />
    </div>
  );
}

export function AutoBlurModal(props: { controller: AutoBlurController }) {
  if (!props.controller.isOpen) {
    return null;
  }

  const disabled = props.controller.isApplying || props.controller.status === 'loading';
  const applyDisabled =
    disabled || props.controller.status !== 'ready' || props.controller.selectedTargetCount === 0;

  return (
    <ProductModal
      closeOnBackdrop={false}
      dialogClassName="sniptale-auto-blur-modal"
      maxWidth="760px"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !disabled) props.controller.close();
      }}
    >
      <ProductModalHeader
        title={translate('content.autoBlur.title')}
        onClose={props.controller.close}
        closeTitle={translate('content.autoBlur.cancel')}
        disabled={disabled}
      />
      <ProductModalBody className="grid gap-4 sniptale-modal-scroll">
        <AutoBlurModalReadyContent controller={props.controller} />
        {props.controller.errorMessage ? (
          <div className="sniptale-error-text">{translate(props.controller.errorMessage)}</div>
        ) : null}
      </ProductModalBody>
      <ProductModalFooter>
        <ProductActionButton tone="secondary" onClick={props.controller.reset} disabled={disabled}>
          <BrushCleaning className="h-4 w-4" />
          {translate('content.autoBlur.reset')}
        </ProductActionButton>
        <div className="flex-1" />
        <ProductActionButton tone="secondary" onClick={props.controller.close} disabled={disabled}>
          {translate('content.autoBlur.cancel')}
        </ProductActionButton>
        <ProductActionButton onClick={() => void props.controller.apply()} disabled={applyDisabled}>
          {translate('content.autoBlur.apply')}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
}
