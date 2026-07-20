interface ParsedScenarioEditorCanvas {
  objects: Record<string, unknown>[];
  version: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseScenarioEditorCanvasJson(
  canvasJson: string
): ParsedScenarioEditorCanvas | null {
  try {
    const parsed: unknown = JSON.parse(canvasJson);
    if (!isRecord(parsed)) {
      return null;
    }

    const objects = Array.isArray(parsed['objects']) ? parsed['objects'].filter(isRecord) : [];

    return {
      objects,
      version: typeof parsed['version'] === 'string' ? parsed['version'] : null,
    };
  } catch {
    return null;
  }
}
