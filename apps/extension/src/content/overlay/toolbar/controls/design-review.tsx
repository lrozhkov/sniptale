import { PageToolbarGroup } from './page-layout';
import { useContext, useSyncExternalStore } from 'react';
import {
  Ruler,
  ScanLine,
  MessageSquare,
  ScanSearch,
  BetweenHorizontalStart,
  Move,
  Accessibility,
} from 'lucide-react';
import { PageControlVisibility } from './control-visibility';
import { PageToolbarControlsContext } from '../state/page-controls';
import {
  getDesignReviewModeState,
  subscribeToDesignReviewMode,
  toggleDesignReviewMeasurementDetails,
  toggleDesignReviewMeasurements,
  setDesignReviewTool,
  openDesignReviewChecks,
  type DesignReviewTool,
} from '../../../selection/design-review';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { FeedbackCollectionIcon } from '../../design-review/icons';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import { AnnotationExportMenu } from '../design-review/export-menu';
import type { ToolbarMenuState } from '../state/menu';

const REVIEW_TOOLS: Array<{ tool: DesignReviewTool; icon: typeof Ruler; label: TranslationKey }> = [
  { tool: 'comment', icon: MessageSquare, label: 'content.designReview.toolComment' },
  { tool: 'inspect', icon: ScanSearch, label: 'content.designReview.toolInspect' },
  { tool: 'compare', icon: Ruler, label: 'content.designReview.toolCompare' },
  { tool: 'move', icon: Move, label: 'content.designReview.toolMove' },
];

export function ToolbarDesignReviewControls(props: {
  compactMenus: boolean;
  displayMode: 'horizontal' | 'vertical';
  panelOpen: boolean;
  toolbarMenuState: ToolbarMenuState;
  onTogglePanel: () => void;
}) {
  const visibility = useContext(PageToolbarControlsContext);
  const mode = useSyncExternalStore(
    subscribeToDesignReviewMode,
    getDesignReviewModeState,
    getDesignReviewModeState
  );
  if (
    visibility &&
    !(
      [
        'review-comment',
        'review-inspect',
        'review-compare',
        'review-move',
        'review-check',
        'review-panel',
        'review-measurements',
        'review-layout-guides',
        'review-export',
      ] as const
    ).some(visibility.isVisible)
  )
    return null;
  return (
    <PageToolbarGroup dataUi="content.toolbar.design-review-controls" utilities>
      {REVIEW_TOOLS.map(({ tool, icon: Icon, label }) => (
        <PageControlVisibility key={tool} control={`review-${tool}`} label={translate(label)}>
          <ContentToolbarButton
            data-content-tool="true"
            active={mode.enabled && mode.tool === tool}
            aria-pressed={mode.enabled && mode.tool === tool}
            disabled={!mode.enabled}
            dataUi={`content.toolbar.review-tool.${tool}`}
            title={translate(label)}
            aria-label={translate(label)}
            onClick={(event) => {
              event.stopPropagation();
              setDesignReviewTool(tool);
            }}
          >
            <Icon size={20} strokeWidth={2} />
          </ContentToolbarButton>
        </PageControlVisibility>
      ))}
      <PageControlVisibility
        control="review-check"
        label={translate('content.designReview.checkTitle')}
      >
        <ContentToolbarButton
          tone="property"
          disabled={!mode.enabled}
          aria-expanded={mode.checkOpen}
          dataUi="content.toolbar.review-check"
          title={translate('content.designReview.checkTitle')}
          aria-label={translate('content.designReview.checkTitle')}
          onClick={() => openDesignReviewChecks()}
        >
          <Accessibility size={20} strokeWidth={2} />
        </ContentToolbarButton>
      </PageControlVisibility>
      <PageControlVisibility
        control="review-panel"
        label={translate('content.designReview.showFeedbackPanel')}
      >
        <ContentToolbarButton
          tone="property"
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
      </PageControlVisibility>
      <PageControlVisibility
        control="review-measurements"
        label={translate('content.designReview.showDistances')}
      >
        <ContentToolbarButton
          data-content-tool="true"
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
          <BetweenHorizontalStart size={20} strokeWidth={2} />
        </ContentToolbarButton>
      </PageControlVisibility>
      <PageControlVisibility
        control="review-layout-guides"
        label={translate('content.designReview.showLayoutGuides')}
      >
        <ContentToolbarButton
          data-content-tool="true"
          active={mode.measurementsExpanded}
          aria-pressed={mode.measurementsExpanded}
          disabled={!mode.enabled}
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
      </PageControlVisibility>
      <PageControlVisibility
        control="review-export"
        label={translate('content.toolbar.annotationExportMenuTitle')}
      >
        <AnnotationExportMenu
          compactMenus={props.compactMenus}
          disabled={false}
          displayMode={props.displayMode}
          toolbarMenuState={props.toolbarMenuState}
        />
      </PageControlVisibility>
    </PageToolbarGroup>
  );
}
