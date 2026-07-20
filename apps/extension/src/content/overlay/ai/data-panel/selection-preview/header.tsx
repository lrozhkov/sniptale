import type React from 'react';
import { translate } from '../../../../../platform/i18n';
import { ExpandChevronIcon } from '../preview/icons';
import { DataSelectionPreviewActions } from './actions';

type DataSpoilerHeaderProps = {
  getSummaryToneClass: () => string;
  handleToggleSpoiler: () => void;
  isAnyExpanded: boolean;
  isAnySelected: boolean;
  isDataSpoilerOpen: boolean;
  isLoading: boolean;
  spoilerSummary: string;
  toggleExpandAll: () => void;
  toggleSelectAll: () => void;
};

export function DataSelectionPreviewHeader({
  getSummaryToneClass,
  handleToggleSpoiler,
  isAnyExpanded,
  isAnySelected,
  isDataSpoilerOpen,
  isLoading,
  spoilerSummary,
  toggleExpandAll,
  toggleSelectAll,
}: DataSpoilerHeaderProps) {
  const handleHeaderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    handleToggleSpoiler();
  };

  return (
    <div
      className="sniptale-spoiler-header"
      onClick={handleToggleSpoiler}
      onKeyDown={handleHeaderKeyDown}
      role="button"
      tabIndex={0}
    >
      <ExpandChevronIcon expanded={isDataSpoilerOpen} size={13} />
      <span className="sniptale-ai-spoiler-label">
        {translate('aiModal.dataForProcessingLabel')}
      </span>
      <span className={`sniptale-ai-spoiler-summary ${getSummaryToneClass()}`}>
        {spoilerSummary}
      </span>
      {isDataSpoilerOpen ? (
        <DataSelectionPreviewActions
          isAnyExpanded={isAnyExpanded}
          isAnySelected={isAnySelected}
          isLoading={isLoading}
          toggleExpandAll={toggleExpandAll}
          toggleSelectAll={toggleSelectAll}
        />
      ) : null}
    </div>
  );
}
