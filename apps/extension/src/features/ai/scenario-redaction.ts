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
