import React from 'react';
import { translate } from '../../../../../platform/i18n';

type TemplateListShowMoreButtonProps = {
  hasMore: boolean;
  isLoading: boolean;
  orderedTemplatesCount: number;
  setShowAll: React.Dispatch<React.SetStateAction<boolean>>;
  showAll: boolean;
};

export function TemplateListShowMoreButton({
  hasMore,
  isLoading,
  orderedTemplatesCount,
  setShowAll,
  showAll,
}: TemplateListShowMoreButtonProps) {
  if (!hasMore || showAll) {
    return null;
  }

  return (
    <button
      onClick={() => setShowAll(true)}
      disabled={isLoading}
      type="button"
      className="sniptale-show-more-btn"
      title={translate('aiModal.templatesShowAllTitle')}
    >
      +{orderedTemplatesCount - 6}
      {translate('aiModal.templatesShowMoreSuffix')}
    </button>
  );
}
