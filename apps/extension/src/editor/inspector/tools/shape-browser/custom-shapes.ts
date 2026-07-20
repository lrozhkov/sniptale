import React from 'react';
import {
  assertCustomShapeImportFileCanBeRead,
  saveCustomShapeDefinitionsWithRollback,
} from '../../../objects/custom-shapes/import-persistence';
import { parseCustomShapeImport } from '../../../objects/custom-shapes/importer';
import {
  deleteCustomShapeDefinition,
  disableCustomShapeDefinition,
  loadCustomShapeLibrary,
} from '../../../objects/custom-shapes/storage';
import type { EditorCustomShapeStoredDefinition } from '../../../../features/editor/document/rich-shape';
import { createShapeBrowserImportSummary } from './import-state';
import type { ShapeBrowserEntry, ShapeBrowserImportState } from './types';

interface ShapeBrowserCustomShapeState {
  entries: readonly ShapeBrowserEntry[];
  importState: ShapeBrowserImportState;
  importFile: (file: File) => Promise<void>;
  deleteShape: (id: string) => Promise<void>;
  disableShape: (id: string) => Promise<void>;
}

type ImportStateSetter = React.Dispatch<React.SetStateAction<ShapeBrowserImportState>>;
type EntriesSetter = React.Dispatch<React.SetStateAction<readonly ShapeBrowserEntry[]>>;
type OperationIdRef = React.MutableRefObject<number>;
type ReloadCustomShapes = (operationId: number) => Promise<boolean>;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createCustomShapeBrowserEntry(item: EditorCustomShapeStoredDefinition): ShapeBrowserEntry {
  const imported = item.source?.type === 'manual-excalidraw-import';
  return {
    id: item.id,
    labelFallback: item.label,
    category: imported ? 'imported' : 'custom',
    source: imported ? 'imported-library' : 'custom',
    searchAliases: [item.label, item.category],
    tags: item.tags,
    thumbnail: item.geometry,
    insertKind: item.id,
    roughCapable: true,
    customDefinition: item,
  };
}

function createCustomShapeBrowserEntries(
  items: readonly EditorCustomShapeStoredDefinition[]
): ShapeBrowserEntry[] {
  return items.filter((item) => item.enabled).map(createCustomShapeBrowserEntry);
}

function useCustomShapeReload(
  operationIdRef: OperationIdRef,
  setEntries: EntriesSetter,
  setImportState: ImportStateSetter
): ReloadCustomShapes {
  return React.useCallback(
    async (operationId: number) => {
      const items = await loadCustomShapeLibrary();
      if (operationId !== operationIdRef.current) {
        return false;
      }
      const nextEntries = createCustomShapeBrowserEntries(items);
      setEntries(nextEntries);
      setImportState((state) => ({
        status: nextEntries.length > 0 ? 'ready' : state.status === 'error' ? 'error' : 'empty',
        ...(state.status === 'error' && state.message ? { message: state.message } : {}),
        ...(state.status === 'error' && state.summary ? { summary: state.summary } : {}),
      }));
      return true;
    },
    [operationIdRef, setEntries, setImportState]
  );
}

function useInitialCustomShapeLoad(
  operationIdRef: OperationIdRef,
  setEntries: EntriesSetter,
  setImportState: ImportStateSetter
): void {
  React.useEffect(() => {
    let active = true;
    const operationId = ++operationIdRef.current;
    loadCustomShapeLibrary()
      .then((items) => {
        if (!active || operationId !== operationIdRef.current) {
          return;
        }
        const nextEntries = createCustomShapeBrowserEntries(items);
        setEntries(nextEntries);
        setImportState({ status: nextEntries.length > 0 ? 'ready' : 'empty' });
      })
      .catch((error) => {
        if (active && operationId === operationIdRef.current) {
          setImportState({ status: 'error', message: toErrorMessage(error) });
        }
      });
    return () => {
      active = false;
    };
  }, [operationIdRef, setEntries, setImportState]);
}

function useImportCustomShape(
  operationIdRef: OperationIdRef,
  reload: ReloadCustomShapes,
  setImportState: ImportStateSetter
): (file: File) => Promise<void> {
  return React.useCallback(
    async (file: File) => {
      const operationId = ++operationIdRef.current;
      try {
        assertCustomShapeImportFileCanBeRead(file);
        const text = await file.text();
        if (operationId !== operationIdRef.current) {
          return;
        }
        const result = parseCustomShapeImport({
          fileName: file.name,
          mimeType: file.type,
          text,
        });
        const summary = createShapeBrowserImportSummary({ fileName: file.name, result });
        if (!result.ok) {
          setImportState({
            status: 'error',
            summary,
          });
          return;
        }

        await saveCustomShapeDefinitionsWithRollback(result.definitions, file.name);
        const reloaded = await reload(operationId);
        if (reloaded) {
          setImportState({ status: 'ready', summary });
        }
      } catch (error) {
        if (operationId === operationIdRef.current) {
          setImportState({ status: 'error', message: toErrorMessage(error) });
        }
      }
    },
    [operationIdRef, reload, setImportState]
  );
}

function useDeleteCustomShape(
  operationIdRef: OperationIdRef,
  reload: ReloadCustomShapes,
  setImportState: ImportStateSetter
): (id: string) => Promise<void> {
  return React.useCallback(
    async (id: string) => {
      const operationId = ++operationIdRef.current;
      try {
        await deleteCustomShapeDefinition(id);
        await reload(operationId);
      } catch (error) {
        if (operationId === operationIdRef.current) {
          setImportState({ status: 'error', message: toErrorMessage(error) });
        }
      }
    },
    [operationIdRef, reload, setImportState]
  );
}

function useDisableCustomShape(
  operationIdRef: OperationIdRef,
  reload: ReloadCustomShapes,
  setImportState: ImportStateSetter
): (id: string) => Promise<void> {
  return React.useCallback(
    async (id: string) => {
      const operationId = ++operationIdRef.current;
      try {
        await disableCustomShapeDefinition(id);
        await reload(operationId);
      } catch (error) {
        if (operationId === operationIdRef.current) {
          setImportState({ status: 'error', message: toErrorMessage(error) });
        }
      }
    },
    [operationIdRef, reload, setImportState]
  );
}

export function useShapeBrowserCustomShapes(): ShapeBrowserCustomShapeState {
  const [entries, setEntries] = React.useState<readonly ShapeBrowserEntry[]>([]);
  const [importState, setImportState] = React.useState<ShapeBrowserImportState>({
    status: 'empty',
  });
  const operationIdRef = React.useRef(0);
  const reload = useCustomShapeReload(operationIdRef, setEntries, setImportState);
  useInitialCustomShapeLoad(operationIdRef, setEntries, setImportState);

  const importFile = useImportCustomShape(operationIdRef, reload, setImportState);
  const deleteShape = useDeleteCustomShape(operationIdRef, reload, setImportState);
  const disableShape = useDisableCustomShape(operationIdRef, reload, setImportState);

  return { entries, importState, importFile, deleteShape, disableShape };
}
