export function NativeHint({ trigger, text, shouldShow = () => true }) {
  let content = text;
  function refresh() {
    if (shouldShow()) trigger.title = content;
    else trigger.removeAttribute('title');
  }
  function hide() {
    trigger.removeAttribute('title');
  }
  trigger.addEventListener('pointerenter', refresh);
  trigger.addEventListener('focus', refresh);
  refresh();
  return {
    show: refresh,
    hide,
    setText(value) {
      content = value;
      refresh();
    },
  };
}
