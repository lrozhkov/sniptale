import { cx } from '../../../../chrome/ui';

import type { SAVE_FORMAT_OPTIONS } from './constants';
import {
  formatOptionBaseClassName,
  formatOptionIdleClassName,
  formatOptionSelectedClassName,
} from './constants';

export function EditorDocumentExportPreferencesFormatOption(props: {
  disabled?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  option: (typeof SAVE_FORMAT_OPTIONS)[number];
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.isSelected}
      onClick={props.onSelect}
      className={cx(
        formatOptionBaseClassName,
        props.isSelected ? formatOptionSelectedClassName : formatOptionIdleClassName
      )}
    >
      <span className="block text-[13px] font-semibold">{props.option.label}</span>
    </button>
  );
}
