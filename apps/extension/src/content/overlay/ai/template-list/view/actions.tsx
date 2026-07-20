import React from 'react';
import { TemplateListAddButton } from '../controls/add';
import { TemplateListShowMoreButton } from '../controls/show-more';

type TemplateListActionsProps = {
  hasMore: boolean;
  isLoading: boolean;
  onAddTemplate: () => void;
  orderedTemplatesCount: number;
  setShowAll: React.Dispatch<React.SetStateAction<boolean>>;
  showAll: boolean;
};

export function TemplateListActions({
  hasMore,
  isLoading,
  onAddTemplate,
  orderedTemplatesCount,
  setShowAll,
  showAll,
}: TemplateListActionsProps) {
  return (
    <>
      <TemplateListShowMoreButton
        hasMore={hasMore}
        isLoading={isLoading}
        orderedTemplatesCount={orderedTemplatesCount}
        setShowAll={setShowAll}
        showAll={showAll}
      />
      <TemplateListAddButton isLoading={isLoading} onAddTemplate={onAddTemplate} />
    </>
  );
}
