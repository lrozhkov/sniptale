import { useEffect, useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';

import {
  loadScenarioEditorNavigatorCollapsed,
  saveScenarioEditorNavigatorCollapsed,
} from '../../persistence/navigator-state';

const logger = createLogger({ namespace: 'ScenarioEditorUiState' });

export type ScenarioEditorLeftPanelMode = 'navigator' | 'projects' | 'ai-editor';

export function useScenarioEditorUiState() {
  const hasNavigatorCollapsedOverrideRef = useRef(false);
  const [leftPanelMode, setLeftPanelMode] = useState<ScenarioEditorLeftPanelMode>('navigator');
  const [navigatorCollapsed, setNavigatorCollapsedState] = useState(false);
  const [visibleStepId, setVisibleStepId] = useState<string | null>(null);
  const [inspectedStepId, setInspectedStepId] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  useEffect(() => {
    let active = true;

    void loadScenarioEditorNavigatorCollapsed()
      .then((collapsed) => {
        if (active && !hasNavigatorCollapsedOverrideRef.current) {
          setNavigatorCollapsedState(collapsed);
        }
      })
      .catch((error) => {
        logger.error('Failed to load navigator-collapsed preference', error);
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    exportDialogOpen,
    inspectedStepId,
    leftPanelMode,
    navigatorCollapsed,
    setExportDialogOpen,
    setInspectedStepId,
    setLeftPanelMode,
    setNavigatorCollapsed: (collapsed: boolean) => {
      hasNavigatorCollapsedOverrideRef.current = true;
      setNavigatorCollapsedState(collapsed);
      void saveScenarioEditorNavigatorCollapsed(collapsed).catch((error) => {
        logger.error('Failed to persist navigator-collapsed preference', error);
      });
    },
    setVisibleStepId,
    visibleStepId,
  };
}
