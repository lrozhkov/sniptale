import { translate } from '../../../../../platform/i18n';
import type { JsonPreviewProps } from '../preview/types';
import { JsonPreviewActions } from './actions';

type JsonPreviewHeaderProps = Pick<
  JsonPreviewProps,
  | 'copied'
  | 'copyFormattedJson'
  | 'formattedJSON'
  | 'isLoading'
  | 'setShowDataPreview'
  | 'showDataPreview'
>;

export function JsonPreviewHeader({
  copied,
  copyFormattedJson,
  formattedJSON,
  isLoading,
  setShowDataPreview,
  showDataPreview,
}: JsonPreviewHeaderProps) {
  return (
    <div className="sniptale-ai-json-header">
      <label className="sniptale-label" style={{ marginBottom: 0 }}>
        {translate('aiModal.dataForSendingLabel')}
      </label>
      <JsonPreviewActions
        copied={copied}
        copyFormattedJson={copyFormattedJson}
        formattedJSON={formattedJSON}
        isLoading={isLoading}
        setShowDataPreview={setShowDataPreview}
        showDataPreview={showDataPreview}
      />
    </div>
  );
}
