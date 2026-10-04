import { useEffect, useRef, useState } from 'react';

export type ReviewBeforeAction = (action: () => void) => void;

/** A pending note owns one selected continuation; raw lifecycle callbacks never enter here. */
export function createReviewNoteTransitions(args: {
  isNew(): boolean;
  finishNew(): Promise<void>;
  isActive?(): boolean;
  blocked?(): boolean;
  leaveAllowed?(): boolean;
  onPending(value: boolean): void;
  onFailure(): void;
}) {
  let pending = false;
  let failed = false;
  const leave = () => {
    if (
      pending ||
      failed ||
      args.blocked?.() ||
      args.leaveAllowed?.() === false ||
      args.isActive?.() === false ||
      !args.isNew()
    )
      return;
    void args.finishNew().catch(() => {
      failed = true;
      if (args.isActive?.() !== false) args.onFailure();
    });
  };
  const perform = <T>(action: () => T): T | Promise<T | undefined> | undefined => {
    if (pending || args.isActive?.() === false) return;
    if (!args.isNew()) {
      failed = false;
      return action();
    }
    if (args.blocked?.()) return;
    pending = true;
    failed = false;
    args.onPending(true);
    return args.finishNew().then(
      () => {
        pending = false;
        if (args.isActive?.() === false) return;
        args.onPending(false);
        return action();
      },
      () => {
        pending = false;
        failed = true;
        if (args.isActive?.() === false) return undefined;
        args.onPending(false);
        args.onFailure();
        return undefined;
      }
    );
  };
  const beforeAction: ReviewBeforeAction = (action) => {
    void perform(action);
  };
  return { leave, beforeAction, perform };
}

/** Keep admission identity stable while its composer and status callbacks stay current. */
export function useReviewNoteTransitions(
  args: Omit<Parameters<typeof createReviewNoteTransitions>[0], 'onPending'>
) {
  const latest = useRef(args);
  latest.current = args;
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [pending, setPending] = useState(false);
  const owner = useRef<ReturnType<typeof createReviewNoteTransitions> | null>(null);
  owner.current ??= createReviewNoteTransitions({
    isNew: () => latest.current.isNew(),
    isActive: () => active.current,
    blocked: () => latest.current.blocked?.() ?? false,
    leaveAllowed: () => latest.current.leaveAllowed?.() ?? true,
    finishNew: () => latest.current.finishNew(),
    onPending: setPending,
    onFailure: () => latest.current.onFailure(),
  });
  return { ...owner.current, pending };
}

/** Pointer owners retain typed ranges; admission holds their selection and final commit together. */
export function deferReviewGesture(
  beforeAction: ReviewBeforeAction | undefined,
  select: () => void
) {
  let ready = false;
  let cancelled = false;
  let commit: (() => void) | null = null;
  (beforeAction ?? ((action) => action()))(() => {
    if (cancelled) return;
    ready = true;
    select();
    commit?.();
  });
  return {
    commit(action: () => void) {
      if (cancelled) return;
      if (ready) action();
      else commit = action;
    },
    cancel() {
      cancelled = true;
      commit = null;
    },
  };
}
