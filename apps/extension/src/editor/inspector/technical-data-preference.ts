import { useEffect, useRef, useState } from 'react';
import type {
  EditorTechnicalDataKind,
  EditorTechnicalDataLayout,
} from '../../features/editor/document/technical-data';
import {
  loadEditorTechnicalDataPreference,
  saveEditorTechnicalDataPreference,
} from '../persistence/ui-state/technical-data';

export function useTechnicalDataPreference() {
  const [selectedKinds, setSelectedKinds] = useState<EditorTechnicalDataKind[]>([]);
  const [layout, setLayout] = useState<EditorTechnicalDataLayout>('column');
  const [saveError, setSaveError] = useState(false);
  const userChangedRef = useRef(false);
  const writeEpochRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadEditorTechnicalDataPreference().then((preference) => {
      if (!cancelled && !userChangedRef.current) {
        setSelectedKinds(preference.kinds);
        setLayout(preference.layout);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleKind = (kind: EditorTechnicalDataKind) => {
    userChangedRef.current = true;
    setSelectedKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]
    );
  };

  const selectLayout = (nextLayout: EditorTechnicalDataLayout) => {
    userChangedRef.current = true;
    setLayout(nextLayout);
  };

  const saveSelection = (kinds: EditorTechnicalDataKind[]) => {
    const writeEpoch = ++writeEpochRef.current;
    setSaveError(false);
    const write = saveEditorTechnicalDataPreference({ kinds, layout });
    void write.catch(() => {
      if (writeEpochRef.current === writeEpoch) setSaveError(true);
    });
  };

  return { layout, saveError, saveSelection, selectLayout, selectedKinds, toggleKind };
}
