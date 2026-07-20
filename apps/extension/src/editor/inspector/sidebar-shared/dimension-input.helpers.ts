import { toNumber } from './helpers';

export function createDimensionDraftActions({
  draft,
  value,
  min,
  step,
  onChange,
  setDraft,
}: {
  draft: string;
  value: number;
  min: number;
  step: number;
  onChange: (value: number) => void;
  setDraft: (value: string) => void;
}) {
  const resolveDraftValue = (): number => {
    if (draft.trim().length === 0) {
      return value;
    }

    return Math.max(min, toNumber(draft, value));
  };

  return {
    commitDraft() {
      if (draft.trim().length === 0) {
        setDraft(String(value));
        return;
      }

      onChange(Math.max(min, toNumber(draft, value)));
    },
    applyStep(direction: 1 | -1) {
      onChange(Math.max(min, resolveDraftValue() + direction * step));
    },
  };
}
