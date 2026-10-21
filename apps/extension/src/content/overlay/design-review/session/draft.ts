import { useEffect, useMemo, useRef, useState } from 'react';
import type { PageStylePatch } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleSelectionSnapshot } from '../../../selection/design-review/snapshot';
import { createPageStyleValuesFromPatch } from '../../../selection/design-review/snapshot';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import {
  createManualPageStylePatch,
  listModifiedPageStyleProperties,
} from '../value-editing/state';

export function usePageStyleDraftState(selection: PageStyleSelectionSnapshot | null) {
  const baselines = useRef(new WeakMap<Element, ReturnType<typeof createEmptyPageStyleValues>>());
  const [defaultValues, setDefaultValues] = useState(createEmptyPageStyleValues);
  const [values, setValues] = useState(createEmptyPageStyleValues);
  const [sideFieldLinks, setSideFieldLinks] = useState<Record<string, boolean>>({});

  useEffect(
    () =>
      pagePreparationHistory.subscribeToClear(() => {
        baselines.current = new WeakMap();
      }),
    []
  );

  useEffect(() => {
    const nextValues = selection ? createPageStyleValuesFromPatch(selection.patch) : {};
    const baseline = selection ? (baselines.current.get(selection.element) ?? nextValues) : {};
    if (selection) baselines.current.set(selection.element, baseline);
    setDefaultValues(baseline);
    setValues(nextValues);
    setSideFieldLinks({});
  }, [selection]);

  const draftPatch = useMemo<PageStylePatch>(
    () => createManualPageStylePatch({ defaultValues, values }),
    [defaultValues, values]
  );
  const modifiedProperties = useMemo(
    () => listModifiedPageStyleProperties({ defaultValues, values }),
    [defaultValues, values]
  );

  return {
    defaultValues,
    draftPatch,
    modifiedProperties,
    setSideFieldLinked: (fieldKey: string, linked: boolean) =>
      setSideFieldLinks((current) => ({ ...current, [fieldKey]: linked })),
    setValues,
    sideFieldLinks,
    values,
  };
}

function createEmptyPageStyleValues() {
  return createPageStyleValuesFromPatch({ declarations: [] });
}
