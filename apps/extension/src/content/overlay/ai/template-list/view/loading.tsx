import { translate } from '../../../../../platform/i18n';

export function TemplateListLoadingState() {
  return (
    <div>
      <label className="sniptale-label">{translate('aiModal.templatesLabel')}</label>
      <div className="sniptale-template-loading">
        {translate('common.states.loading')}
        {translate('aiModal.templatesLoadingSuffix')}
      </div>
    </div>
  );
}
