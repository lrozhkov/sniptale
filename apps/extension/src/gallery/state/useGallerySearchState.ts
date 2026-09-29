import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

const SEARCH_COMMIT_DELAY_MS = 250;
type SearchMode = 'library' | 'trash';
type SearchQueries = Record<SearchMode, { raw: string; applied: string }>;

function resolveSearchAction(action: SetStateAction<string>, current: string): string {
  return typeof action === 'function' ? action(current) : action;
}

export function useGallerySearchState() {
  const [searchQueries, setSearchQueries] = useState<SearchQueries>({
    library: { raw: '', applied: '' },
    trash: { raw: '', applied: '' },
  });
  const searchQueriesRef = useRef(searchQueries);
  const searchModeRef = useRef<SearchMode>('library');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trashMode, setTrashMode] = useState(false);

  const cancelSearchTimer = useCallback(() => {
    if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
  }, []);
  const updateSearchMode = useCallback((mode: SearchMode, raw: string, applied?: string) => {
    const next = {
      ...searchQueriesRef.current,
      [mode]: { raw, applied: applied ?? searchQueriesRef.current[mode].applied },
    };
    searchQueriesRef.current = next;
    setSearchQueries(next);
  }, []);
  const scheduleSearchCommit = useCallback(
    (mode: SearchMode) => {
      cancelSearchTimer();
      searchTimerRef.current = setTimeout(() => {
        searchTimerRef.current = null;
        if (searchModeRef.current !== mode) return;
        const current = searchQueriesRef.current[mode];
        if (current.raw !== current.applied) updateSearchMode(mode, current.raw, current.raw);
      }, SEARCH_COMMIT_DELAY_MS);
    },
    [cancelSearchTimer, updateSearchMode]
  );
  useEffect(() => cancelSearchTimer, [cancelSearchTimer]);

  const setSearch: Dispatch<SetStateAction<string>> = useCallback(
    (action) => {
      const mode = searchModeRef.current;
      const raw = resolveSearchAction(action, searchQueriesRef.current[mode].raw);
      cancelSearchTimer();
      updateSearchMode(mode, raw, raw === '' ? '' : undefined);
      if (raw !== '' && raw !== searchQueriesRef.current[mode].applied) {
        scheduleSearchCommit(mode);
      }
    },
    [cancelSearchTimer, scheduleSearchCommit, updateSearchMode]
  );
  const commitSearch = useCallback(
    (value: string) => {
      cancelSearchTimer();
      updateSearchMode(searchModeRef.current, value, value);
    },
    [cancelSearchTimer, updateSearchMode]
  );
  const switchTrashMode = useCallback(
    (value: boolean) => {
      cancelSearchTimer();
      const mode = value ? 'trash' : 'library';
      searchModeRef.current = mode;
      setTrashMode(value);
      const destination = searchQueriesRef.current[mode];
      if (destination.raw !== destination.applied) scheduleSearchCommit(mode);
    },
    [cancelSearchTimer, scheduleSearchCommit]
  );

  const current = searchQueries[trashMode ? 'trash' : 'library'];
  return {
    actions: { commitSearch, setSearch, switchTrashMode },
    state: { search: current.raw, appliedSearch: current.applied, trashMode },
  };
}
