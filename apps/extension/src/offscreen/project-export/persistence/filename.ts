export function sanitizeFilename(value: string): string {
  return (
    value
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/ /g, '_')
      .slice(0, 64) || 'project-export'
  );
}
