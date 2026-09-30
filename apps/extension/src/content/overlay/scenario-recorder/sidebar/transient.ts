import { useEffect, useState, type RefObject } from 'react';
import type { ScenarioRecorderSidebarStep } from './types';

export function useScenarioRecorderSidebarTransientState(
  projectId: string | null,
  pendingProjectSelection: boolean,
  sidebarRef: RefObject<HTMLElement | null>
) {
  const [deleteStepId, setDeleteStepId] = useState<string | null>(null);
  const [inspectedStep, setInspectedStep] = useState<ScenarioRecorderSidebarStep | null>(null);
  const [previewStep, setPreviewStep] = useState<ScenarioRecorderSidebarStep | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  useEffect(() => {
    setDeleteStepId(null);
    setInspectedStep(null);
    setPreviewStep(null);
    setProjectMenuOpen(false);
  }, [projectId]);

  useEffect(() => {
    if (pendingProjectSelection) setProjectMenuOpen(true);
  }, [pendingProjectSelection]);

  useEffect(() => {
    if (!projectMenuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setProjectMenuOpen(false);
      sidebarRef.current
        ?.querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.project-button"]')
        ?.focus();
    };
    const handleOutsidePointer = (event: PointerEvent) => {
      const path = event.composedPath();
      const trigger = sidebarRef.current?.querySelector(
        '[data-ui="content.scenario.sidebar.project-button"]'
      );
      const picker = sidebarRef.current?.querySelector(
        '[data-ui="content.scenario.sidebar.project-picker"]'
      );
      if (!path.includes(trigger as EventTarget) && !path.includes(picker as EventTarget)) {
        setProjectMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    return () => {
      window.removeEventListener('keydown', handleEscape, true);
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
    };
  }, [projectMenuOpen, sidebarRef]);

  return {
    closeInspectedStep: () => setInspectedStep(null),
    closePreviewStep: () => setPreviewStep(null),
    closeProjectMenu: () => {
      setProjectMenuOpen(false);
      sidebarRef.current
        ?.querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.project-button"]')
        ?.focus();
    },
    deleteStepId,
    inspectedStep,
    openDeleteStep: (stepId: string) => {
      setProjectMenuOpen(false);
      setDeleteStepId(stepId);
    },
    openInspectedStep: (step: ScenarioRecorderSidebarStep) => {
      setProjectMenuOpen(false);
      setInspectedStep(step);
    },
    openPreviewStep: (step: ScenarioRecorderSidebarStep) => {
      setProjectMenuOpen(false);
      setPreviewStep(step);
    },
    previewStep,
    projectMenuOpen,
    setDeleteStepId,
    setProjectMenuOpen,
  };
}
