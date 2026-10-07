export interface ReviewSpeechFlushRegistration {
  hasPending(): boolean;
  flush(): Promise<void>;
}

/** Keeps selection/close continuations behind the selected speech editor's durable writes. */
export function createReviewSpeechEditGuard(onFailure: () => void) {
  let editor: ReviewSpeechFlushRegistration | undefined;
  let pending = false;
  return {
    register(next: ReviewSpeechFlushRegistration) {
      editor = next;
      return () => {
        if (editor === next) editor = undefined;
      };
    },
    async flush(): Promise<void> {
      if (editor?.hasPending()) await editor.flush();
    },
    perform<T>(action: () => T): T | Promise<T | undefined> | undefined {
      if (pending) return;
      if (!editor?.hasPending()) return action();
      const owner = editor;
      pending = true;
      return owner.flush().then(
        () => {
          pending = false;
          // A replaced editor cannot authorize a continuation from its old selection.
          if (editor !== owner) return undefined;
          return action();
        },
        () => {
          pending = false;
          onFailure();
          return undefined;
        }
      );
    },
  };
}
