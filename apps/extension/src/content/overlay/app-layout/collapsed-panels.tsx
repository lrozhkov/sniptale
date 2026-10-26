import { PageQuickActionsMenu } from '../quick-actions/menu';
import { useEffect, useId, useState } from 'react';
import { FileStack, GripVertical, PanelLeft } from 'lucide-react';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { FloatingChromeToolbar } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import {
  queryContentUiElement,
  resolveContentShadowRoot,
  useContentUiScale,
} from '../../platform/dom-host';
import { ToolbarDockingGuides } from '../toolbar/shell/docking-guides';
import type { ContentAppLayoutProps } from './types';
import { useCollapsedPanelDrag } from './collapsed-panels.drag';

type CollapsedPanelsProps = {
  countdownActive: boolean;
  toolbar: Pick<
    ContentAppLayoutProps['toolbar'],
    'isCompletelyHidden' | 'isToolbarVisible' | 'setPinnedToolbarVisible'
  > & {
    modes: Pick<ContentAppLayoutProps['toolbar']['modes'], 'screenshotMode' | 'videoRecordingMode'>;
  };
  scenario: {
    state: Pick<
      ContentAppLayoutProps['scenario']['state'],
      'captureAction' | 'scenarioEnabled' | 'sidebarVisible'
    >;
    actions: Pick<ContentAppLayoutProps['scenario']['actions'], 'setSidebarVisible'>;
  };
};

export function CollapsedPanels(props: CollapsedPanelsProps) {
  const dragHintId = useId();
  const hidden = props.toolbar.isCompletelyHidden || props.countdownActive;
  const showToolbar =
    !props.toolbar.isToolbarVisible &&
    (props.toolbar.modes.screenshotMode || props.toolbar.modes.videoRecordingMode === true);
  const showScenario =
    props.toolbar.modes.videoRecordingMode !== true &&
    props.scenario.state.scenarioEnabled &&
    !props.scenario.state.sidebarVisible;
  const visible = !hidden && (showToolbar || showScenario);
  const uiScale = useContentUiScale();
  const drag = useCollapsedPanelDrag(visible, uiScale);
  const [focusTarget, setFocusTarget] = useState<'toolbar' | 'scenario' | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    if (hidden) {
      setFocusTarget(null);
      return;
    }
    const selector =
      focusTarget === 'toolbar'
        ? '[data-ui="content.toolbar.root"] button:not(:disabled)'
        : '[data-ui="content.scenario.sidebar.project-button"]';
    let finished = false;
    const cancel = () => {
      finished = true;
      setFocusTarget(null);
    };
    const focus = () => {
      if (finished) return;
      const target = queryContentUiElement<HTMLButtonElement>(selector);
      if (
        !target ||
        target.getBoundingClientRect().width === 0 ||
        getComputedStyle(target).visibility === 'hidden'
      )
        return;
      target.focus();
      cancel();
    };
    const observer = new MutationObserver(focus);
    observer.observe(resolveContentShadowRoot() ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('keydown', cancel, true);
    window.addEventListener('blur', cancel);
    focus();
    return () => {
      finished = true;
      observer.disconnect();
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('keydown', cancel, true);
      window.removeEventListener('blur', cancel);
    };
  }, [focusTarget, hidden, props.toolbar.isToolbarVisible, props.scenario.state.sidebarVisible]);

  if (!visible) return null;
  return (
    <CommandPressScope value={true}>
      <FloatingChromeToolbar
        ref={drag.dockRef}
        dataUi="content.collapsed-panels"
        className="sniptale-collapsed-panels sniptale-content-toolbar-adopted"
        data-floating-ui-capture-transient="true"
        data-corner={drag.corner}
        data-dragging={drag.dragging ? 'true' : 'false'}
        style={drag.style}
        role="group"
        aria-label={translate('content.runtime.collapsedPanelsTitle')}
        onMouseDown={(event) => event.preventDefault()}
      >
        <ContentToolbarButton
          {...drag.handleProps}
          type="button"
          tone="utility"
          size="compact"
          className="sniptale-drag-handle"
          dataUi="content.collapsed-panels.drag-handle"
          aria-label={translate('content.runtime.moveCollapsedPanels')}
          aria-describedby={dragHintId}
          title={translate('content.runtime.moveCollapsedPanelsHint')}
        >
          <GripVertical aria-hidden="true" size={16} />
        </ContentToolbarButton>
        <span id={dragHintId} className="sr-only">
          {translate('content.runtime.moveCollapsedPanelsHint')}
        </span>
        {showToolbar ? (
          <ContentToolbarButton
            id="sniptale-show-toolbar-btn"
            type="button"
            dataUi="content.collapsed-panels.restore-toolbar"
            tone="utility"
            size="compact"
            title={translate('content.runtime.showToolbarTitle')}
            onClick={(event) => {
              if (event.detail === 0) setFocusTarget('toolbar');
              props.toolbar.setPinnedToolbarVisible(true);
            }}
          >
            <PanelLeft aria-hidden="true" size={16} />
          </ContentToolbarButton>
        ) : null}
        {showToolbar && drag.preferences.quickActionsCorner ? (
          <PageQuickActionsMenu compact />
        ) : null}
        {showScenario ? (
          <ContentToolbarButton
            dataUi="content.scenario.sidebar.restore"
            type="button"
            tone="utility"
            size="compact"
            title={translate('scenario.content.restorePanel')}
            onClick={(event) => {
              if (event.detail === 0) setFocusTarget('scenario');
              props.scenario.actions.setSidebarVisible(true);
            }}
          >
            <FileStack aria-hidden="true" size={16} />
          </ContentToolbarButton>
        ) : null}
      </FloatingChromeToolbar>
      {drag.dragging ? (
        <ToolbarDockingGuides activeEdge={drag.activeCorner} uiScale={uiScale} cornersOnly />
      ) : null}
    </CommandPressScope>
  );
}
