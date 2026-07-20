import { isSensitiveAiFormControl } from '@sniptale/platform/security/ai-payload-privacy';

export function getPrivacySafeInputValue(element: HTMLElement, label?: string): string {
  if (isSensitiveAiFormControl(element, label)) {
    return '';
  }

  const tagName = element.tagName.toLowerCase();

  switch (tagName) {
    case 'input': {
      const input = element as HTMLInputElement;
      if (input.type === 'checkbox' || input.type === 'radio') {
        return input.checked ? 'да' : 'нет';
      }
      return input.value?.trim() || '';
    }
    case 'select': {
      const select = element as HTMLSelectElement;
      return select.options[select.selectedIndex]?.text?.trim() || select.value?.trim() || '';
    }
    case 'textarea':
      return (element as HTMLTextAreaElement).value?.trim() || '';
    default:
      return element.textContent?.trim() || '';
  }
}

export function shouldSkipSensitiveLabeledField(labelEl: HTMLLabelElement, label: string): boolean {
  return isSensitiveAiFormControl(labelEl, label);
}
