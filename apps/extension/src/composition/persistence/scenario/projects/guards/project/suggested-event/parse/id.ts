export function getSuggestedEventId(id: unknown, index: number): string {
  return typeof id === 'string' && id ? id : `scenario-event-${index + 1}`;
}
