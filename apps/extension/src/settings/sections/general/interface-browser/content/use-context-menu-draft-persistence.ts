import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseContextMenuTree,
  type ContextMenuTree,
} from '../../../../../contracts/settings/context-menu-layout';
import { translate } from '../../../../../platform/i18n';
import type { AppearanceSectionState } from './types';
import {
  clearPendingContextMenuDraft,
  keepPendingContextMenuDraft,
  readPendingContextMenuDraft,
} from './context-menu-draft-recovery';

/** Owns recovery, admitted draft writes, retries and the complete editor persistence lifetime. */
export function useContextMenuDraftPersistence(
  state: Pick<AppearanceSectionState, 'updateContextMenu' | 'locale'>
) {
  const [tree, setTree] = useState<ContextMenuTree | null>(null);
  const [status, setStatus] = useState<'ready' | 'editing' | 'saving' | 'failed' | 'saved'>(
    'ready'
  );
  const [announcement, setAnnouncement] = useState('');
  const saving = useRef(false);
  const draftRevision = useRef(0);
  const savedRevision = useRef(0);
  const latestTree = useRef<ContextMenuTree | null>(null);
  const draftProtection = useRef(Promise.resolve(true));
  const updateSettings = useRef(state.updateContextMenu);
  updateSettings.current = state.updateContextMenu;
  const t = (key: Parameters<typeof translate>[0]) => translate(key, state.locale);
  const loadTree = useCallback((stored: ContextMenuTree): ContextMenuTree => {
    const pending = !latestTree.current ? readPendingContextMenuDraft() : null;
    const recovered = pending && JSON.stringify(pending) !== JSON.stringify(stored);
    if (pending && !recovered) void clearPendingContextMenuDraft(pending);
    const next = recovered ? pending : stored;
    if (recovered) {
      draftRevision.current += 1;
      setStatus('failed');
    }
    setTree(next);
    latestTree.current = next;
    return next;
  }, []);
  const changeTree = (next: ContextMenuTree) => {
    draftRevision.current += 1;
    latestTree.current = next;
    setTree(next);
    const valid = Boolean(parseContextMenuTree(next));
    const revision = draftRevision.current;
    draftProtection.current = valid ? keepPendingContextMenuDraft(next) : Promise.resolve(false);
    if (!saving.current) setStatus('editing');
    void draftProtection.current.then((protectedDraft) => {
      if (
        valid &&
        !protectedDraft &&
        !saving.current &&
        draftRevision.current === revision &&
        savedRevision.current < revision
      )
        setStatus('failed');
    });
  };
  const save = async (retryProtection = true) => {
    const candidate = latestTree.current;
    if (saving.current || !candidate || !parseContextMenuTree(candidate)) return;
    saving.current = true;
    const submittedRevision = draftRevision.current;
    setStatus('saving');
    try {
      if (!(await draftProtection.current) && retryProtection)
        draftProtection.current = keepPendingContextMenuDraft(candidate);
      if (!(await draftProtection.current)) {
        setStatus('failed');
        return;
      }
      await updateSettings.current({ layout: candidate });
      savedRevision.current = submittedRevision;
      if (draftRevision.current === submittedRevision)
        await clearPendingContextMenuDraft(candidate);
      const stillCurrent = draftRevision.current === submittedRevision;
      setStatus(stillCurrent ? 'saved' : 'editing');
      setAnnouncement(
        t(
          stillCurrent
            ? 'settings.appearance.contextMenuSaved'
            : 'settings.appearance.contextMenuUnsaved'
        )
      );
    } catch {
      setStatus(draftRevision.current === submittedRevision ? 'failed' : 'editing');
    } finally {
      saving.current = false;
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (status !== 'editing' || !tree || !parseContextMenuTree(tree)) return;
    const timer = setTimeout(() => void saveRef.current(false), 350);
    return () => clearTimeout(timer);
  }, [tree, status]);
  useEffect(
    () => () => {
      const pending = latestTree.current;
      if (pending && draftRevision.current > savedRevision.current && parseContextMenuTree(pending))
        void draftProtection.current
          .then((protectedDraft) =>
            protectedDraft ? updateSettings.current({ layout: pending }) : undefined
          )
          .catch(() => {
            // The page-local draft remains available for retry when settings reopen.
          });
    },
    []
  );
  return { tree, loadTree, changeTree, status, announcement, setAnnouncement, save };
}
