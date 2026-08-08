import { ContentToolbarButton, ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import { FeedbackCollectionIcon } from '../../design-review/icons';
import { translate } from '../../../../platform/i18n';
import { AnnotationExportMenu } from '../design-review/export-menu';
import type { ToolbarMenuState } from '../state/menu';

export function ToolbarDesignReviewControls(props: {
  compactMenus: boolean;
  displayMode: 'horizontal' | 'vertical';
  panelOpen: boolean;
  toolbarMenuState: ToolbarMenuState;
  onTogglePanel: () => void;
}) {
  return (
    <ContentToolbarGroup dataUi="content.toolbar.design-review-controls" utilities>
      <ContentToolbarButton
        active={props.panelOpen}
        aria-pressed={props.panelOpen}
        dataUi="content.toolbar.design-review-panel-button"
        onClick={(event) => {
          event.stopPropagation();
          props.onTogglePanel();
        }}
        title={translate(
          props.panelOpen
            ? 'content.designReview.hideFeedbackPanel'
            : 'content.designReview.showFeedbackPanel'
        )}
      >
        <FeedbackCollectionIcon size={20} strokeWidth={2} />
      </ContentToolbarButton>
      <AnnotationExportMenu
        compactMenus={props.compactMenus}
        disabled={false}
        displayMode={props.displayMode}
        toolbarMenuState={props.toolbarMenuState}
      />
    </ContentToolbarGroup>
  );
}
