type PrepareTeardown = () => () => void;
let prepare: PrepareTeardown | null = null;

/** The mounted page producer registers one private lifecycle boundary, without a DOM event. */
export function registerPageRecoveryTeardown(next: PrepareTeardown): () => void {
  prepare = next;
  return () => {
    if (prepare === next) prepare = null;
  };
}

/** Captures current user data before existing service Undo/Clear operations begin. */
export function beginPageRecoveryTeardown(): () => void {
  return prepare?.() ?? (() => {});
}
