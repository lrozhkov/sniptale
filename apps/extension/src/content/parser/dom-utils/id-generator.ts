/**
 * ID Generation utilities for DOM parsers
 * Extracted from dom-tree-parser.ts for reusability
 */

/**
 * Generates a stable ID based on element position in DOM
 * This ensures consistency between request and response
 */
export function generateStableId(prefix: string, element: HTMLElement, index?: number): string {
  // Use element position for stability
  if (element.id) {
    return `${prefix}-${element.id}`;
  }

  // Generate hash based on element path in DOM
  let path = element.tagName.toLowerCase();

  // Add classes
  if (element.className) {
    const classes = Array.from(element.classList)
      .filter((c) => !c.match(/^(sniptale-|shadow-)/))
      .sort()
      .join('.');
    if (classes) {
      path += `.${classes}`;
    }
  }

  // Add index if provided
  if (index !== undefined) {
    path += `[${index}]`;
  }

  // Add text content for uniqueness
  const text = extractTextContent(element);
  if (text) {
    path += `:${text.substring(0, 20)}`;
  }

  // Simple hash
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `${prefix}-${Math.abs(hash).toString(16)}`;
}

/**
 * Generates a unique ID (legacy, for compatibility)
 */
export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Extracts text content for ID generation
 */
function extractTextContent(element: HTMLElement): string {
  if (!element) return '';

  // Check for direct text nodes first
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text && text.length > 0) {
        return text;
      }
    }
  }

  return element.textContent?.trim() || '';
}
