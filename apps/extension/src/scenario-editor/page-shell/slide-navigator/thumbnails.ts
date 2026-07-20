import { useEffect, useMemo, useState } from 'react';
import type {
  ScenarioCaptureStep,
  ScenarioStep,
} from '../../../features/scenario/contracts/types/project';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';

export function useScenarioNavigatorThumbnails(steps: ScenarioStep[]) {
  const captureSteps = useMemo(
    () => steps.filter((step): step is ScenarioCaptureStep => step.kind === 'capture'),
    [steps]
  );
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    void Promise.all(
      captureSteps.map(async (step) => {
        const blob = await getScenarioAssetBlob(step.assetId);
        if (!blob) {
          return null;
        }

        const url = URL.createObjectURL(blob);
        createdUrls.push(url);
        return [step.id, url] as const;
      })
    )
      .then((entries) => {
        if (cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        setUrls(
          Object.fromEntries(
            entries.filter((entry): entry is readonly [string, string] => entry !== null)
          )
        );
      })
      .catch(() => {
        if (!cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          setUrls({});
        }
      });

    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [captureSteps]);

  return urls;
}
