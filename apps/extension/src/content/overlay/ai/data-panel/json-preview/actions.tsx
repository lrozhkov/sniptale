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
      <button
        onClick={() => setShowDataPreview((prev) => !prev)}
        disabled={isLoading}
        className={`sniptale-toggle-btn ${showDataPreview ? 'active' : ''}`}
        title={
          showDataPreview ? translate('aiModal.hideJsonTitle') : translate('aiModal.showJsonTitle')
        }
      >
        <CodeBracketsIcon />
        {showDataPreview
          ? translate('aiModal.hideJsonButton')
          : translate('aiModal.showJsonButton')}
      </button>
      {showDataPreview && formattedJSON ? (
        <button
          onClick={copyFormattedJson}
          className={`sniptale-copy-btn ${copied ? 'copied' : ''}`}
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
        </button>
      ) : null}
    </div>
  );
}
