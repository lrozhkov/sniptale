import { useSyncExternalStore } from 'react';
import { Ruler, ScanLine } from 'lucide-react';
import {
  getDesignReviewModeState,
  subscribeToDesignReviewMode,
  toggleDesignReviewMeasurementDetails,
  toggleDesignReviewMeasurements,
} from '../../../selection/design-review';
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
  const mode = useSyncExternalStore(
    subscribeToDesignReviewMode,
    getDesignReviewModeState,
    getDesignReviewModeState
  );
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
      <ContentToolbarButton
        active={mode.measurementsEnabled}
        aria-pressed={mode.measurementsEnabled}
        disabled={!mode.enabled}
        dataUi="content.toolbar.design-review-measurements-button"
        onClick={(event) => {
          event.stopPropagation();
          toggleDesignReviewMeasurements();
        }}
        title={translate(
          mode.measurementsEnabled
            ? 'content.designReview.hideDistances'
            : 'content.designReview.showDistances'
        )}
      >
        <Ruler size={20} strokeWidth={2} />
      </ContentToolbarButton>
      <ContentToolbarButton
        active={mode.measurementsExpanded}
        aria-pressed={mode.measurementsExpanded}
        disabled={!mode.enabled || !mode.measurementsEnabled}
        dataUi="content.toolbar.design-review-measurement-details-button"
        onClick={(event) => {
          event.stopPropagation();
          toggleDesignReviewMeasurementDetails();
        }}
        title={translate(
          mode.measurementsExpanded
            ? 'content.designReview.hideLayoutGuides'
            : 'content.designReview.showLayoutGuides'
        )}
      >
        <ScanLine size={20} strokeWidth={2} />
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
