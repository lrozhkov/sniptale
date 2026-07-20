function isFocusableTextInput(element: Element): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  const type = element.type || 'text';
  return ['email', 'number', 'password', 'search', 'tel', 'text', 'url'].includes(type);
}

function isVisibleInput(input: HTMLInputElement): boolean {
  if (
    input.disabled ||
    input.hidden ||
    input.getAttribute('aria-hidden') === 'true' ||
    input.closest('[hidden], [aria-hidden="true"]')
  ) {
    return false;
  }

  return true;
}

function resolveFocusScope(input: HTMLInputElement): ParentNode {
  return (
    input.closest('form') ??
    input.closest('[data-ui="shared.ui.compact-inspector.panel"]') ??
    input.closest('[data-ui="shared.ui.compact-inspector.numeric-row"]')?.parentElement ??
    input.parentElement ??
    document
  );
}

export function focusNextCompactInput(input: HTMLInputElement): void {
  const scope = resolveFocusScope(input);
  const inputs = Array.from(scope.querySelectorAll('input')).filter(
    (candidate): candidate is HTMLInputElement =>
      isFocusableTextInput(candidate) && isVisibleInput(candidate)
  );
  const currentIndex = inputs.indexOf(input);
  const nextInput = currentIndex >= 0 ? inputs[currentIndex + 1] : undefined;

  if (nextInput) {
    nextInput.focus();
    nextInput.select?.();
    return;
  }

  input.blur();
}
