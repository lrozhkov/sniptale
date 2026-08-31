import { translate } from '../../../../platform/i18n/popup';
import { PagesSummaryRow } from './summary-row';
import type { PopupExportTabItem } from '../selection/tabs/types';

export function ExportPagesSummary(props: {
  onRemove: (tabId: number) => void;
  selectedTabs: PopupExportTabItem[];
}) {
  if (props.selectedTabs.length === 0) {
    return (
      <div className={['py-1 text-[11px]', 'text-[var(--sniptale-color-text-dim)]'].join(' ')}>
        {translate('popup.export.noSelectedTabs')}
      </div>
    );
  }
  return (
    <div
      data-testid="export-pages-summary"
      className="h-full overflow-y-auto space-y-1 pl-1.5 pr-1"
    >
      {props.selectedTabs.map((tab) => (
        <PagesSummaryRow
          key={`${tab.tabId ?? 'fallback'}-${tab.title}`}
          onRemove={() => {
            if (typeof tab.tabId === 'number') {
              props.onRemove(tab.tabId);
            }
          }}
          title={tab.title}
          url={tab.url}
          {...(tab.favIconUrl === undefined ? {} : { favIconUrl: tab.favIconUrl })}
        />
      ))}
    </div>
  );
}

export function ExportUrlsSummary(props: { onRemove: (url: string) => void; urls: string[] }) {
  if (props.urls.length === 0) {
    return (
      <div className="py-1 text-[11px] text-[var(--sniptale-color-text-dim)]">
        {translate('popup.export.noSelectedUrls')}
      </div>
    );
  }
  return (
    <div
      data-testid="export-pages-summary"
      className="h-full space-y-1 overflow-y-auto pl-1.5 pr-1"
    >
      {props.urls.map((url) => (
        <PagesSummaryRow
          key={url}
          onRemove={() => props.onRemove(url)}
          title={new URL(url).hostname}
          url={url}
        />
      ))}
    </div>
  );
}
