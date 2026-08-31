export function normalizeSyncProcessResult(result) {
  if (result?.error?.code !== 'EPERM' || !Number.isInteger(result.status)) {
    return result;
  }

  return {
    ...result,
    error: undefined,
  };
}
