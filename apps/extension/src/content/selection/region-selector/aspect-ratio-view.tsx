import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CompactSelect, type CompactSelectOption } from '../../../ui/compact-inspector-controls';
import { translate } from '../../../platform/i18n';

function RegionAspectRatioControl(props: {
  options: readonly CompactSelectOption[];
  value: string;
  menuSession: number;
  onChange: (value: string) => void;
}) {
  return (
    <>
      {props.options.map((option) => (
        <span
          key={option.value}
          aria-hidden="true"
          style={{
            gridArea: '1 / 1',
            visibility: 'hidden',
            padding: '0 44px 0 12px',
            whiteSpace: 'nowrap',
          }}
        >
          {option.label}
        </span>
      ))}
      <div style={{ gridArea: '1 / 1', minWidth: 0 }}>
        <CompactSelect
          key={props.menuSession}
          aria-label={translate('content.overlayControls.regionAspectRatio')}
          dataUi="content.region-aspect-ratio"
          menuClassName="sniptale-parameter-menu"
          style={{ height: 32, fontWeight: 400, borderRadius: 4 }}
          options={props.options}
          value={props.value}
          onChange={props.onChange}
        />
      </div>
    </>
  );
}

/** Owns the shared region selector mount and its pointer-focus adaptation. */
export function createRegionAspectRatioView(
  toolbar: HTMLElement,
  onChange: (value: string) => void
) {
  const slot = document.createElement('div');
  slot.style.cssText = 'display: grid; flex: 0 0 auto;';
  toolbar.prepend(slot);
  const root = createRoot(slot);
  let selectedValue = 'free';
  let menuSession = 0;
  const options = [
    { value: 'free', label: translate('content.overlayControls.regionAspectFree') },
    { value: 'current', label: translate('content.overlayControls.regionAspectCurrent') },
    ...['16:9', '4:3', '1:1', '9:16'].map((value) => ({ value, label: value })),
  ];
  const preventPointerFocus = (event: MouseEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const tree = toolbar.getRootNode();
    const focused = tree instanceof ShadowRoot ? tree.activeElement : document.activeElement;
    if (focused instanceof HTMLElement && toolbar.contains(focused)) focused.blur();
    event.preventDefault();
  };
  toolbar.addEventListener('mousedown', preventPointerFocus, true);
  const render = (value: string) => {
    selectedValue = value;
    flushSync(() =>
      root.render(
        <RegionAspectRatioControl
          options={options}
          value={value}
          menuSession={menuSession}
          onChange={onChange}
        />
      )
    );
  };
  return {
    render,
    dismissMenu() {
      if (!slot.querySelector('[aria-expanded="true"]')) return;
      menuSession += 1;
      render(selectedValue);
    },
    dispose() {
      toolbar.removeEventListener('mousedown', preventPointerFocus, true);
      root.unmount();
      slot.remove();
    },
  };
}
