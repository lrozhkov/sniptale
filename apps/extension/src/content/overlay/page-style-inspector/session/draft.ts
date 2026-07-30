import { useEffect, useMemo, useState } from 'react';
import type { PageStylePatch } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';
import { createPageStyleValuesFromPatch } from '../runtime/properties';
import {
  createManualPageStylePatch,
  listModifiedPageStyleProperties,
} from '../value-editing/state';

export function usePageStyleDraftState(selection: PageStyleSelectionSnapshot | null) {
  const [defaultValues, setDefaultValues] = useState(createEmptyPageStyleValues);
  const [values, setValues] = useState(createEmptyPageStyleValues);
  const [sideFieldLinks, setSideFieldLinks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const nextValues = selection ? createPageStyleValuesFromPatch(selection.patch) : {};
    setDefaultValues(nextValues);
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
