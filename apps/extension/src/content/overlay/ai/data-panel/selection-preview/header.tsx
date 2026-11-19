import type React from 'react';
import { translate } from '../../../../../platform/i18n';
import { SearchField } from '../../../../../ui/compact-inspector-controls/row-controls';
import { ExpandChevronIcon } from '../preview/icons';
import { DataSelectionPreviewActions } from './actions';
import { ListFilter } from 'lucide-react';

type DataSpoilerHeaderProps = {
  getSummaryToneClass: () => string;
  handleToggleSpoiler: () => void;
  isAnyExpanded: boolean;
  isAnySelected: boolean;
  isDataSpoilerOpen: boolean;
  isLoading: boolean;
  spoilerSummary: string;
  filterQuery: string;
  setFilterQuery: React.Dispatch<React.SetStateAction<string>>;
  setShowSelectedOnly: React.Dispatch<React.SetStateAction<boolean>>;
  showSelectedOnly: boolean;
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
  filterQuery,
  setFilterQuery,
  setShowSelectedOnly,
  showSelectedOnly,
  toggleExpandAll,
  toggleSelectAll,
}: DataSpoilerHeaderProps) {
  const stopHeaderToggle = (event: React.SyntheticEvent) => event.stopPropagation();
  return (
    <div className="sniptale-spoiler-header">
      <button
        aria-expanded={isDataSpoilerOpen}
        title={translate('aiModal.dataForProcessingLabel')}
        className="sniptale-ai-spoiler-toggle"
        onClick={handleToggleSpoiler}
        type="button"
      >
        <ExpandChevronIcon expanded={isDataSpoilerOpen} size={13} />
        <span className="sniptale-ai-spoiler-label">
          {translate('aiModal.dataForProcessingLabel')}
        </span>
        <span
          title={spoilerSummary}
          className={`sniptale-ai-spoiler-summary ${getSummaryToneClass()}`}
        >
          {spoilerSummary}
        </span>
      </button>
      {isDataSpoilerOpen ? (
        <div
          className="sniptale-ai-spoiler-header-tools"
          onClick={stopHeaderToggle}
          onMouseDown={stopHeaderToggle}
          onPointerDown={stopHeaderToggle}
        >
          <SearchField
            className="sniptale-ai-data-search"
            label={translate('aiModal.searchDataLabel')}
            clearLabel={translate('aiModal.clearSearchLabel')}
            disabled={isLoading}
            onChange={setFilterQuery}
            placeholder={translate('aiModal.searchDataPlaceholder')}
            value={filterQuery}
          />
          <button
            aria-label={translate(
              showSelectedOnly ? 'aiModal.showAllDataLabel' : 'aiModal.showSelectedOnlyLabel'
            )}
            aria-pressed={showSelectedOnly}
            className={`sniptale-ai-data-selected-filter${showSelectedOnly ? ' active' : ''}`}
            disabled={isLoading}
            onClick={() => setShowSelectedOnly((value) => !value)}
            title={translate(
              showSelectedOnly ? 'aiModal.showAllDataLabel' : 'aiModal.showSelectedOnlyLabel'
            )}
            type="button"
          >
            <ListFilter aria-hidden="true" size={13} />
          </button>
          <DataSelectionPreviewActions
            isAnyExpanded={isAnyExpanded}
            isAnySelected={isAnySelected}
            isLoading={isLoading}
            toggleExpandAll={toggleExpandAll}
            toggleSelectAll={toggleSelectAll}
          />
        </div>
      ) : null}
    </div>
  );
}
