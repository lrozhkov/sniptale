import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react';
import { buildRecentCommandPaletteActionIds, buildCommandPaletteGroups } from './helpers';
import type { CommandPaletteAction } from './types';
import {
  loadRecentCommandPaletteActionIds,
  saveRecentCommandPaletteActionIds,
} from '../../composition/persistence/command-palette';

export function useCommandPaletteController(
  actions: readonly CommandPaletteAction[],
  isOpen: boolean,
  storageKey?: string
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const recentActionIdsRef = useRef<string[]>([]);
  const [query, setQuery] = useState('');
  const [recentActionIdsState, setRecentActionIdsState] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const setRecentActionIds = useCallback((value: string[]) => {
    recentActionIdsRef.current = value;
    setRecentActionIdsState(value);
  }, []);

  const groups = useMemo(
    () => buildCommandPaletteGroups(actions, recentActionIdsState, query),
    [actions, query, recentActionIdsState]
  );
  const flatActions = useMemo(() => groups.flatMap((group) => group.actions), [groups]);
  const flatActionIds = useMemo(() => flatActions.map((action) => action.id), [flatActions]);

  useCommandPaletteOpenState(
    isOpen,
    storageKey,
    inputRef,
    recentActionIdsRef,
    setQuery,
    setRecentActionIds,
    setSelectedIndex
  );
  useCommandPaletteSelectionState(isOpen, flatActions.length, setSelectedIndex);

  return {
    inputRef,
    query,
    setQuery,
    groups,
    flatActions,
    flatActionIds,
    recentActionIds: recentActionIdsState,
    selectedIndex,
    setSelectedIndex,
    setRecentActionIds,
    storageKey,
  };
}

function useCommandPaletteOpenState(
  isOpen: boolean,
  storageKey: string | undefined,
  inputRef: RefObject<HTMLInputElement | null>,
  recentActionIdsRef: React.MutableRefObject<string[]>,
  setQuery: (value: string) => void,
  setRecentActionIds: (value: string[]) => void,
  setSelectedIndex: (value: number) => void
) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery('');
    setRecentActionIds([]);
    setSelectedIndex(0);
    let active = true;

    void loadRecentCommandPaletteActionIds(storageKey).then((actionIds) => {
      if (active && recentActionIdsRef.current.length === 0) {
        setRecentActionIds(actionIds);
      }
    });

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
    };
  }, [
    inputRef,
    isOpen,
    recentActionIdsRef,
    setQuery,
    setRecentActionIds,
    setSelectedIndex,
    storageKey,
  ]);
}

function useCommandPaletteSelectionState(
  isOpen: boolean,
  flatActionCount: number,
  setSelectedIndex: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedIndex((current) => {
      if (flatActionCount === 0) {
        return 0;
      }

      return Math.min(current, flatActionCount - 1);
    });
  }, [flatActionCount, isOpen, setSelectedIndex]);
}

async function recordCommandPaletteSelection(
  storageKey: string | undefined,
  recentActionIds: readonly string[],
  actionId: string,
  setRecentActionIds: (value: string[]) => void
) {
  const previousRecentIds = [...recentActionIds];
  const nextRecentIds = buildRecentCommandPaletteActionIds(recentActionIds, actionId);
  setRecentActionIds(nextRecentIds);
  try {
    await saveRecentCommandPaletteActionIds(storageKey, nextRecentIds);
  } catch (error) {
    setRecentActionIds(previousRecentIds);
    throw error;
  }
}

export function useCommandPaletteSelectAction(props: {
  recentActionIds: readonly string[];
  storageKey: string | undefined;
  setRecentActionIds: (value: string[]) => void;
  onClose: () => void;
}) {
  return useCallback(
    async (action: CommandPaletteAction | undefined) => {
      if (!action || action.disabled) {
        return;
      }

      await recordCommandPaletteSelection(
        props.storageKey,
        props.recentActionIds,
        action.id,
        props.setRecentActionIds
      );

      await action.onSelect();
      props.onClose();
    },
    [props]
  );
}

export function useCommandPaletteKeyDown(props: {
  flatActions: readonly CommandPaletteAction[];
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  onClose: () => void;
  onSelectAction: (action: CommandPaletteAction | undefined) => void;
}) {
  return useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        props.onClose();
        return;
      }

      if (props.flatActions.length === 0) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        props.setSelectedIndex((current) => (current + 1) % props.flatActions.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        props.setSelectedIndex(
          (current) => (current - 1 + props.flatActions.length) % props.flatActions.length
        );
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        props.onSelectAction(props.flatActions[props.selectedIndex]);
      }
    },
    [props]
  );
}
