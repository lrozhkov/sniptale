export function normalizeSuggestedEventStatus(
  value: unknown
): 'accepted' | 'dismissed' | 'pending' {
  return value === 'accepted' || value === 'dismissed' ? value : 'pending';
}
