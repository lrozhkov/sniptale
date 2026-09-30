import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../../../platform/i18n';
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type MouseEventHandler,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  ScenarioRecorderSidebarMetadataModal,
  ScenarioRecorderSidebarPreviewOverlay,
} from './overlays';
import { ScenarioRecorderSidebarSurface } from './surface';
import type { ScenarioRecorderSidebarStep } from './types';
import type { ScenarioSidebarControlsProps } from './controls';
import { useScenarioRecorderSidebarTransientState } from './transient';

function runStepHighlight(args: {
  latestStepId: string;
  setHighlightedStepId: Dispatch<SetStateAction<string | null>>;
  stepsContainerRef: RefObject<HTMLDivElement | null>;
}) {
  args.setHighlightedStepId(args.latestStepId);
  if (typeof args.stepsContainerRef.current?.scrollTo === 'function') {
    args.stepsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }
  return window.setTimeout(() => {
    args.setHighlightedStepId((current) => (current === args.latestStepId ? null : current));
  }, 1800);
}

function useHighlightedRecentStep(args: {
  highlightToken?: number;
  forcedHighlightStepId?: string | null;
  forcedHighlightVersion?: number;
  recentSteps: ScenarioRecorderSidebarStep[];
}) {
  const latestStepId = args.recentSteps[0]?.id ?? null;
  const [highlightedStepId, setHighlightedStepId] = useState<string | null>(null);
  const previousHighlightTokenRef = useRef(args.highlightToken ?? 0);
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!latestStepId || (args.highlightToken ?? 0) === previousHighlightTokenRef.current) {
      return;
    }

    previousHighlightTokenRef.current = args.highlightToken ?? 0;
    const timeoutId = runStepHighlight({
      latestStepId,
      setHighlightedStepId,
      stepsContainerRef,
    });

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [args.highlightToken, latestStepId]);

  useEffect(() => {
    if (!args.forcedHighlightStepId || args.forcedHighlightStepId !== latestStepId) {
      return;
    }

    const timeoutId = runStepHighlight({
      latestStepId: args.forcedHighlightStepId,
      setHighlightedStepId,
      stepsContainerRef,
    });

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [args.forcedHighlightStepId, args.forcedHighlightVersion, latestStepId]);

  return { highlightedStepId, stepsContainerRef };
}

export function ScenarioRecorderSidebar(
  props: ScenarioSidebarControlsProps & {
    dragging: boolean;
    highlightToken?: number;
    forcedHighlightStepId?: string | null;
    forcedHighlightVersion?: number;
    onDeleteStep: (stepId: string) => void;
    onFinish: () => void;
    onCollapse: (event: MouseEvent<HTMLButtonElement>) => void;
    onCaptureVisible: (event: MouseEvent<HTMLButtonElement>) => Promise<void>;
    captureBusy: boolean;
    onMoveStep: (stepId: string, toIndex: number) => void;
    onOpenEditor: (stepId?: string | null) => void;
    onSidebarHeaderMouseDown: MouseEventHandler<HTMLDivElement>;
    pendingProjectSelection: boolean;
    projectName: string | null;
    position: { x: number; y: number };
    recentSteps: ScenarioRecorderSidebarStep[];
    sidebarRef: RefObject<HTMLElement | null>;
    uiScale?: number;
  }
) {
  const sidebarState = useScenarioRecorderSidebarTransientState(
    props.projectId,
    props.pendingProjectSelection,
    props.sidebarRef
  );
  const { highlightedStepId, stepsContainerRef } = useHighlightedRecentStep({
    recentSteps: props.recentSteps,
    ...(props.highlightToken === undefined ? {} : { highlightToken: props.highlightToken }),
    ...(props.forcedHighlightStepId === undefined
      ? {}
      : { forcedHighlightStepId: props.forcedHighlightStepId }),
    ...(props.forcedHighlightVersion === undefined
      ? {}
      : { forcedHighlightVersion: props.forcedHighlightVersion }),
  });
  return (
    <>
      <ScenarioRecorderSidebarSurface
        {...props}
        highlightedStepId={highlightedStepId}
        onDeleteStep={sidebarState.openDeleteStep}
        onInspectStep={sidebarState.openInspectedStep}
        onOpenEditor={() => props.onOpenEditor()}
        onPreviewOpen={sidebarState.openPreviewStep}
        onProjectMenuToggle={() => sidebarState.setProjectMenuOpen((open) => !open)}
        onProjectMenuClose={sidebarState.closeProjectMenu}
        projectMenuOpen={sidebarState.projectMenuOpen}
        stepsContainerRef={stepsContainerRef}
      />
      {renderScenarioRecorderSidebarOverlays(sidebarState)}
      <ProductConfirmDialog
        isOpen={sidebarState.deleteStepId !== null}
        title={translate('scenario.content.deleteStep')}
        message={translate('scenario.content.deleteStepMessage')}
        confirmText={translate('common.actions.delete')}
        cancelText={translate('common.actions.cancel')}
        onCancel={() => sidebarState.setDeleteStepId(null)}
        onConfirm={() => {
          if (
            sidebarState.deleteStepId &&
            props.recentSteps.some((step) => step.id === sidebarState.deleteStepId)
          )
            props.onDeleteStep(sidebarState.deleteStepId);
          sidebarState.setDeleteStepId(null);
        }}
        backdropClassName="!z-[2147483648]"
      />
    </>
  );
}

function renderScenarioRecorderSidebarOverlays(
  sidebarState: ReturnType<typeof useScenarioRecorderSidebarTransientState>
) {
  return (
    <>
      <ScenarioRecorderSidebarMetadataModal
        inspectedStep={sidebarState.inspectedStep}
        onClose={sidebarState.closeInspectedStep}
      />
      <ScenarioRecorderSidebarPreviewOverlay
        onClose={sidebarState.closePreviewStep}
        step={sidebarState.previewStep}
      />
    </>
  );
}
