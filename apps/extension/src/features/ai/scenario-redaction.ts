export function redactScenarioAiUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = '';
    parsedUrl.password = '';
    parsedUrl.search = '';
    parsedUrl.username = '';
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export function compactScenarioAiText(value: string | null | undefined, maxLength = 240) {
  if (!value) {
    return null;
  }

  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
