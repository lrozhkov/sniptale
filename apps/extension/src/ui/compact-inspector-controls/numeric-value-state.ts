import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { focusNextCompactInput } from '@sniptale/ui/compact-inspector-controls/focus';
import {
  clampNumber,
  formatCompactEditNumber,
  parseCompactNumber,
  resolveCompactUnitLabel,
  type CompactInspectorUnit,
} from './shared';

interface NumericValueStateParams {
  max?: number | undefined;
  min?: number | undefined;
  onCommitValue: (value: number) => void;
  onPreviewValue: (value: number) => void;
  precision?: number | undefined;
  step: number;
  unit: CompactInspectorUnit;
  value: number | null;
}

export function useNumericValueFieldState(params: NumericValueStateParams) {
  const draftState = useNumericDraftState(params);
  const actions = useNumericFieldActions({ ...params, draftState });

  return {
    ...draftState,
    ...actions,
  };
}

function useNumericDraftState({
  precision,
  unit,
  value,
}: Pick<NumericValueStateParams, 'precision' | 'unit' | 'value'>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatCompactEditNumber(value, { precision }));
  const editingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stepValueRef = useRef(value ?? 0);
  const syncedPropKeyRef = useRef('');
  const propKey = `${value ?? 'mixed'}|${precision ?? 'auto'}|${unit}`;

  useEffect(() => {
    if (editing) {
      syncedPropKeyRef.current = propKey;
      return;
    }
    if (syncedPropKeyRef.current === propKey) {
      return;
    }
    syncedPropKeyRef.current = propKey;
    stepValueRef.current = value ?? 0;
    setDraft(formatCompactEditNumber(value, { precision }));
  }, [editing, precision, propKey, value]);

  return {
    draft,
    editing,
    editingRef,
    editValue: formatCompactEditNumber(value, { precision }),
    inputRef,
    setDraft,
    setEditing,
    stepValueRef,
    unitLabel: resolveCompactUnitLabel(unit),
  };
}

type NumericDraftState = ReturnType<typeof useNumericDraftState>;

function useNumericFieldActions({
  draftState,
  max,
  min,
  onCommitValue,
  onPreviewValue,
  precision,
  step,
  unit,
}: NumericValueStateParams & { draftState: NumericDraftState }) {
  const commitDraft = () => {
    commitNumericDraft({ draftState, max, min, onCommitValue, precision, unit });
  };
  const applyStep = (direction: 1 | -1) => {
    applyNumericStep({
      direction,
      draftState,
      max,
      min,
      onCommitValue,
      onPreviewValue,
      precision,
      step,
    });
  };
  const handleFocus = (event: FocusEvent<HTMLInputElement>, disabled: boolean) => {
    beginNumericEditing({ disabled, draftState, event });
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateNumericDraft({ draftState, event, max, min, precision, unit });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    handleNumericKeyDown({ commitDraft, draftState, event });
  };
  const handlePointerDown = (event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };

  return { applyStep, commitDraft, handleChange, handleFocus, handleKeyDown, handlePointerDown };
}

function commitNumericDraft({
  draftState,
  max,
  min,
  onCommitValue,
  precision,
  unit,
}: Pick<NumericValueStateParams, 'max' | 'min' | 'onCommitValue' | 'precision' | 'unit'> & {
  draftState: NumericDraftState;
}) {
  if (!draftState.editingRef.current) {
    return;
  }
  const parsed = parseCompactNumber(draftState.draft, unit);
  draftState.editingRef.current = false;
  if (parsed === null) {
    cancelNumericEditing(draftState);
    return;
  }
  const next = clampNumber(parsed, min, max);
  draftState.stepValueRef.current = next;
  draftState.setEditing(false);
  draftState.setDraft(formatCompactEditNumber(next, { precision }));
  onCommitValue(next);
}

function applyNumericStep({
  direction,
  draftState,
  max,
  min,
  onCommitValue,
  onPreviewValue,
  precision,
  step,
}: Pick<
  NumericValueStateParams,
  'max' | 'min' | 'onCommitValue' | 'onPreviewValue' | 'precision' | 'step'
> & {
  direction: 1 | -1;
  draftState: NumericDraftState;
}) {
  const next = clampNumber(draftState.stepValueRef.current + step * direction, min, max);
  draftState.stepValueRef.current = next;
  draftState.setEditing(draftState.editingRef.current);
  draftState.setDraft(formatCompactEditNumber(next, { precision }));
  onPreviewValue(next);
  onCommitValue(next);
}

function updateNumericDraft({
  draftState,
  event,
  max,
  min,
  precision,
  unit,
}: Pick<NumericValueStateParams, 'max' | 'min' | 'precision' | 'unit'> & {
  draftState: NumericDraftState;
  event: ChangeEvent<HTMLInputElement>;
}) {
  const nextDraft = event.currentTarget.value;
  if (!draftState.editingRef.current) {
    draftState.editingRef.current = true;
    draftState.setEditing(true);
  }
  const parsed = parseCompactNumber(nextDraft, unit);
  if (parsed === null) {
    draftState.setDraft(nextDraft);
    return;
  }
  const next = clampNumber(parsed, min, max);
  draftState.stepValueRef.current = next;
  draftState.setDraft(resolveVisibleNumericDraft({ draftState, next, nextDraft, precision, unit }));
}

function beginNumericEditing({
  disabled,
  draftState,
  event,
}: {
  disabled: boolean;
  draftState: NumericDraftState;
  event: FocusEvent<HTMLInputElement>;
}) {
  if (disabled || draftState.editingRef.current) {
    return;
  }
  draftState.editingRef.current = true;
  draftState.setEditing(true);
  draftState.setDraft(draftState.editValue);
  const input = event.currentTarget;
  window.requestAnimationFrame(() => input.select());
}

function cancelNumericEditing(draftState: NumericDraftState) {
  draftState.editingRef.current = false;
  draftState.setEditing(false);
  draftState.setDraft(draftState.editValue);
}

function handleNumericKeyDown({
  commitDraft,
  draftState,
  event,
}: {
  commitDraft: () => void;
  draftState: NumericDraftState;
  event: KeyboardEvent<HTMLInputElement>;
}) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitDraft();
    focusNextCompactInput(event.currentTarget);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelNumericEditing(draftState);
  }
}

function resolveVisibleNumericDraft({
  draftState,
  next,
  nextDraft,
  precision,
  unit,
}: Pick<NumericValueStateParams, 'precision' | 'unit'> & {
  draftState: NumericDraftState;
  next: number;
  nextDraft: string;
}) {
  const trimmedDraft = nextDraft.trim();
  const hasExplicitUnit =
    (unit && trimmedDraft.endsWith(unit)) ||
    (draftState.unitLabel && trimmedDraft.endsWith(draftState.unitLabel));
  return hasExplicitUnit ? formatCompactEditNumber(next, { precision }) : nextDraft;
}
