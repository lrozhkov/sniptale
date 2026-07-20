import { ChevronDown, MousePointerClick } from 'lucide-react';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { translate } from '../../../platform/i18n';
import {
  FloatingChromePanel,
  FloatingChromeToolbar,
  floatingChromeClassNames,
} from '@sniptale/ui/floating-chrome';
import { ScenarioBuildTimeline } from '../timeline';

type ScenarioFloatingBuildTimelineProps = {
  clickIndex: number;
  hidden: boolean;
  onClickIndexChange: (clickIndex: number) => void;
  onHiddenChange: (hidden: boolean) => void;
  selectedElementId: string | null;
  slide: ScenarioSlide;
};

function getScenarioBuildTimelineRootClassName() {
  return floatingChromeClassNames(
    'absolute bottom-3 left-[21rem] right-[24rem] z-40 mx-auto max-w-[760px]',
    'max-[1480px]:left-[19rem] max-[1480px]:right-[23.5rem] max-[720px]:bottom-[5.25rem]',
    'max-[720px]:left-3 max-[720px]:right-3'
  );
}

function ScenarioFloatingBuildTimelineHidden(props: {
  onHiddenChange: (hidden: boolean) => void;
  rootClassName: string;
}) {
  return (
    <div data-ui="scenario.floating.build-timeline.hidden" className={props.rootClassName}>
      <FloatingChromeToolbar className="mx-auto w-max">
        <EditorIconButton
          title={translate('scenario.editor.buildTimeline')}
          onClick={() => props.onHiddenChange(false)}
        >
          <MousePointerClick size={17} strokeWidth={2} />
        </EditorIconButton>
      </FloatingChromeToolbar>
    </div>
  );
}

export function ScenarioFloatingBuildTimeline(props: ScenarioFloatingBuildTimelineProps) {
  const { hidden, onHiddenChange, ...timelineProps } = props;
  const hideTitle = `${translate('scenario.editor.buildTimeline')} · ${translate(
    'editor.toolbar.collapseInspector'
  )}`;
  const rootClassName = getScenarioBuildTimelineRootClassName();

  if (hidden) {
    return (
      <ScenarioFloatingBuildTimelineHidden
        onHiddenChange={onHiddenChange}
        rootClassName={rootClassName}
      />
    );
  }

  return (
    <FloatingChromePanel
      dataUi="scenario.floating.build-timeline"
      className={floatingChromeClassNames(rootClassName, 'max-h-28 p-0')}
    >
      <div className="absolute right-2 top-2 z-10">
        <EditorIconButton
          title={hideTitle}
          onClick={() => onHiddenChange(true)}
          className="h-7 w-7"
        >
          <ChevronDown size={15} strokeWidth={2} />
        </EditorIconButton>
      </div>
      <ScenarioBuildTimeline {...timelineProps} embedded />
    </FloatingChromePanel>
  );
}
