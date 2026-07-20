export function formatSelectedDataJson(selectedData: string) {
  if (!selectedData) {
    return '';
  }

  try {
    return JSON.stringify(JSON.parse(selectedData), null, 2);
  } catch {
    return selectedData;
  }
}
