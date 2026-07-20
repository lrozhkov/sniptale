import { useCallback, useEffect, useState } from 'react';
import { listScenarioProjectSummaries } from '../../composition/persistence/scenario/store/project-records/index';
import type { ScenarioProjectSummary } from '../../features/scenario/contracts/types/project';

export function useGalleryScenarioProjectsState() {
  const [scenarioProjects, setScenarioProjects] = useState<ScenarioProjectSummary[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void listScenarioProjectSummaries().then((projects) => {
      if (!cancelled) {
        setScenarioProjects(projects);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return {
    refresh,
    scenarioProjects,
  };
}
