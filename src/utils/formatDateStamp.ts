export function formatDateStamp(value: string | number): string {
  const text = String(value).trim();
  const calendarDate = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);

  let date: Date;
  if (calendarDate) {
    const [, year, month, day] = calendarDate;
    date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  } else if (/^\d+$/.test(text)) {
    const timestamp = Number(text);
    date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  } else {
    date = new Date(text);
  }

  if (Number.isNaN(date.getTime())) return text;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
