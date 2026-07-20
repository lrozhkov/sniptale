import {
  useEffect,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { parsePositiveInteger } from './helpers';
import { CONTENT_SIZE_TOOLTIP_INPUT_CLASS_NAME, CONTENT_SIZE_TOOLTIP_INPUT_STYLE } from './styles';

export function TooltipSizeInput(props: {
  ariaLabel: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  onRawChange: (value: number) => void;
  value: number;
}) {
  const inputDraft = useTooltipSizeInputDraft(props);

  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={props.ariaLabel}
      title={props.ariaLabel}
      min={props.min}
      max={props.max}
      value={inputDraft.draftValue}
      className={CONTENT_SIZE_TOOLTIP_INPUT_CLASS_NAME}
      onChange={inputDraft.handleChange}
      onBlur={inputDraft.handleBlur}
      onKeyDown={inputDraft.handleKeyDown}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      style={CONTENT_SIZE_TOOLTIP_INPUT_STYLE as CSSProperties}
    />
  );
}

function useTooltipSizeInputDraft(props: {
  max: number;
  min: number;
  onCommit: (value: number) => void;
  value: number;
}) {
  const [draftValue, setDraftValue] = useState(() => Math.round(props.value).toString());

  useEffect(() => {
    setDraftValue(Math.round(props.value).toString());
  }, [props.value]);

  const commitDraft = (value: string) => {
    if (value.trim() === '') {
      setDraftValue(Math.round(props.value).toString());
      return;
    }

    const parsedValue = parsePositiveInteger(value);
    const nextValue = Math.min(props.max, Math.max(props.min, parsedValue ?? props.min));
    setDraftValue(nextValue.toString());
    props.onCommit(nextValue);
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftValue(event.target.value);
  };
  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    commitDraft(event.target.value);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    commitDraft(event.currentTarget.value);
  };

  return {
    draftValue,
    handleBlur,
    handleChange,
    handleKeyDown,
  };
}
