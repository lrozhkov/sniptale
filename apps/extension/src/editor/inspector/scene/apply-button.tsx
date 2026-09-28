import { translate } from '../../../platform/i18n';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME } from '../chrome';

export function FrameApplyButton(props: { onApplyFrame: () => void }) {
  return (
    <div className="border-t border-[color:var(--sniptale-color-border-soft)] pt-3">
      <button
        className={`${INSPECTOR_PRIMARY_BUTTON_CLASS_NAME} justify-center px-3.5`}
        onClick={props.onApplyFrame}
        type="button"
      >
        {translate('editor.scene.applyButton')}
      </button>
    </div>
  );
}
