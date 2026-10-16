import { useRef } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type React from 'react';
import { translate } from '../../../../../platform/i18n';
import { ExpandChevronIcon } from '../preview/icons';
import { DataSelectionPreviewActions } from './actions';
import { ListFilter, Search, X } from 'lucide-react';

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
  const searchInput = useRef<HTMLInputElement>(null);
  const stopHeaderToggle = (event: React.SyntheticEvent) => event.stopPropagation();
  return (
    <div className="sniptale-spoiler-header">
      <ProductActionButton
        tone="secondary"
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
      </ProductActionButton>
      {isDataSpoilerOpen ? (
        <div
          className="sniptale-ai-spoiler-header-tools"
          onClick={stopHeaderToggle}
          onMouseDown={stopHeaderToggle}
          onPointerDown={stopHeaderToggle}
        >
          <label className="sniptale-ai-data-search">
            <Search aria-hidden="true" size={16} />
            <input
              ref={searchInput}
              aria-label={translate('aiModal.searchDataLabel')}
              title={translate('aiModal.searchDataLabel')}
              disabled={isLoading}
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder={translate('aiModal.searchDataPlaceholder')}
              type="text"
              value={filterQuery}
            />
            {filterQuery ? (
              <ProductActionButton
                tone="secondary"
                aria-label={translate('aiModal.clearSearchLabel')}
                className="sniptale-ai-data-search-clear"
                data-command-chrome="true"
                title={translate('aiModal.clearSearchLabel')}
                onPointerDown={(event) => event.preventDefault()}
                disabled={isLoading}
                onClick={() => {
                  setFilterQuery('');
                  searchInput.current?.focus();
                }}
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </ProductActionButton>
            ) : null}
          </label>
          <ProductActionButton
            tone="toggle"
            aria-label={translate(
              showSelectedOnly ? 'aiModal.showAllDataLabel' : 'aiModal.showSelectedOnlyLabel'
            )}
            aria-pressed={showSelectedOnly}
            active={showSelectedOnly}
            className={`sniptale-ai-data-selected-filter${showSelectedOnly ? ' active' : ''}`}
            disabled={isLoading}
            onClick={() => setShowSelectedOnly((value) => !value)}
            title={translate(
              showSelectedOnly ? 'aiModal.showAllDataLabel' : 'aiModal.showSelectedOnlyLabel'
            )}
            type="button"
          >
            <ListFilter aria-hidden="true" size={16} />
          </ProductActionButton>
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
