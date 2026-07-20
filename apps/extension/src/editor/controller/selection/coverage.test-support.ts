export function createTextSelectionObject(kind: 'meta-stamp' | 'text') {
  if (kind === 'meta-stamp') {
    return {
      backgroundColor: '#fafafa',
      fill: '#444',
      fontFamily: 'Monospace',
      fontSize: 16,
      sniptaleTextBackgroundOpacity: 0.25,
      sniptaleTextCalloutFormat: 'panel',
    };
  }

  return {
    backgroundColor: '#fff',
    fill: '#333',
    fontFamily: 'Serif',
    fontSize: 22,
    fontWeight: 'bold',
    sniptaleTextBackgroundOpacity: 0.5,
    sniptaleTextCalloutFormat: 'panel',
    sniptaleTextVerticalAlign: 'bottom',
    width: 180,
  };
}
