function createMoscowDate(now: Date): Date {
  const moscowOffsetMinutes = 3 * 60;
  const utcOffsetMinutes = now.getTimezoneOffset();

  return new Date(now.getTime() + (moscowOffsetMinutes + utcOffsetMinutes) * 60 * 1000);
}

export function getMoscowFilenameTimestamp(now = new Date()): string {
  const moscowTime = createMoscowDate(now);
  const year = moscowTime.getFullYear();
  const month = String(moscowTime.getMonth() + 1).padStart(2, '0');
  const day = String(moscowTime.getDate()).padStart(2, '0');
  const hours = String(moscowTime.getHours()).padStart(2, '0');
  const minutes = String(moscowTime.getMinutes()).padStart(2, '0');
  const seconds = String(moscowTime.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}
