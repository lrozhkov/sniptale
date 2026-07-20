import { translate } from '../../../../../platform/i18n';
import { AiSparkIcon } from '../../../icons/icons';
import type { AIModalProps } from './types';

export function AIModalHeaderTitle({ treeData }: Pick<AIModalProps, 'treeData'>) {
  return (
    <div className="sniptale-ai-modal-header-content">
      <div className="sniptale-ai-icon-badge">
        <AiSparkIcon className="sniptale-ai-modal-header-icon" />
      </div>
      <div>
        <div>{translate('aiModal.title')}</div>
        {treeData && (
          <div className="sniptale-ai-modal-context-info">
            <span>{treeData.context}</span>
            {treeData.title && (
              <span className="sniptale-ai-modal-context-title"> · {treeData.title}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
