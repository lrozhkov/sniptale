function formatScreenshotTimestamp(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

  return {
    base: `Screenshot_${year}-${month}-${day}_${hours}-${minutes}-${seconds}`,
    unique: `_${milliseconds}`,
  };
}

export function buildScreenshotFilename(suffix?: string, format = 'png'): string {
  const { base, unique } = formatScreenshotTimestamp(new Date());
  const mode = suffix ? `_${suffix}` : '';
  const ext = format === 'jpeg' ? 'jpg' : format;

  return `${base}${unique}${mode}.${ext}`;
}
