type EditorArrowKeyCode = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export interface EditorSelectionNudge {
  code: EditorArrowKeyCode;
  deltaX: number;
  deltaY: number;
  step: number;
}

export interface EditorSelectionNudgeSession {
  code: EditorArrowKeyCode;
  step: number;
}

export function createSelectionNudge(code: string, shiftKey: boolean): EditorSelectionNudge | null {
  const step = shiftKey ? 5 : 1;

  switch (code) {
    case 'ArrowLeft':
      return { code, deltaX: -step, deltaY: 0, step };
    case 'ArrowRight':
      return { code, deltaX: step, deltaY: 0, step };
    case 'ArrowUp':
      return { code, deltaX: 0, deltaY: -step, step };
    case 'ArrowDown':
      return { code, deltaX: 0, deltaY: step, step };
    default:
      return null;
  }
}

export function hasMatchingNudgeSignature(
  session: EditorSelectionNudgeSession | null,
  nudge: Pick<EditorSelectionNudge, 'code' | 'step'>
): boolean {
  return session?.code === nudge.code && session.step === nudge.step;
}
