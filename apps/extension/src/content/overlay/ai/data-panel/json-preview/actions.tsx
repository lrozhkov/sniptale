import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { JsonPreviewProps } from '../preview/types';
import { translate } from '../../../../../platform/i18n';
import { CheckIcon, CodeBracketsIcon, CopyIcon } from '../preview/icons';

type JsonPreviewActionsProps = Pick<
  JsonPreviewProps,
  | 'copied'
  | 'copyFormattedJson'
  | 'formattedJSON'
  | 'isLoading'
  | 'setShowDataPreview'
  | 'showDataPreview'
>;

export function JsonPreviewActions({
  copied,
  copyFormattedJson,
  formattedJSON,
  isLoading,
  setShowDataPreview,
  showDataPreview,
}: JsonPreviewActionsProps) {
  return (
    <div className="sniptale-ai-json-actions">
      <ProductActionButton
        type="button"
        onClick={() => setShowDataPreview((prev) => !prev)}
        disabled={isLoading}
        className="sniptale-toggle-btn sniptale-ai-data-preview-toggle"
        aria-pressed={showDataPreview}
        active={showDataPreview}
        tone="toggle"
        title={
          showDataPreview ? translate('aiModal.hideJsonTitle') : translate('aiModal.showJsonTitle')
        }
      >
        <CodeBracketsIcon />
        {showDataPreview
          ? translate('aiModal.hideJsonButton')
          : translate('aiModal.showJsonButton')}
      </ProductActionButton>
      {showDataPreview && formattedJSON ? (
        <ProductActionButton
          tone="secondary"
          type="button"
          onClick={copyFormattedJson}
          className={`sniptale-copy-btn ${copied ? 'copied' : ''}`}
          title={translate(copied ? 'aiModal.copied' : 'aiModal.copyButton')}
        >
          {copied ? (
            <>
              <CheckIcon />
              {translate('aiModal.copied')}
            </>
          ) : (
            <>
              <CopyIcon />
              {translate('aiModal.copyButton')}
            </>
          )}
        </ProductActionButton>
      ) : null}
    </div>
  );
}
