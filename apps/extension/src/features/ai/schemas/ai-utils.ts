import { translate } from '../../../platform/i18n';

function isLowercaseLetter(character: string) {
  return character >= 'a' && character <= 'z';
}

function isSchemaKeySegment(text: string, lowercaseOnly = false) {
  if (text.length === 0) {
    return false;
  }

  return [...text].every((character) => {
    if (lowercaseOnly) {
      return isLowercaseLetter(character);
    }

    return (
      isLowercaseLetter(character) ||
      (character >= 'A' && character <= 'Z') ||
      (character >= '0' && character <= '9') ||
      character === '-'
    );
  });
}

/**
 * Resolves a localized validation message for AI-related schemas.
 */
export function schemaMessage(key: Parameters<typeof translate>[0]): string {
  return translate(key);
}

/**
 * Stores a stable translation key in schema validation issues.
 */
export function schemaMessageKey(key: Parameters<typeof translate>[0]): string {
  return key;
}

export function isSchemaMessageKey(message: string): boolean {
  const segments = message.split('.');
  return (
    segments.length >= 2 &&
    segments.every((segment, index) => isSchemaKeySegment(segment, index === 0))
  );
}

export function translateSchemaMessage(message: string): string {
  return isSchemaMessageKey(message)
    ? translate(message as Parameters<typeof translate>[0])
    : message;
}
