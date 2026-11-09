const TIME_ZONE = 'America/Santiago';
const DAY_MS = 86_400_000;

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
const timeOfDay = new Intl.DateTimeFormat('es-CL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('es-CL', { timeZone: TIME_ZONE, day: '2-digit', month: 'short' });
const yearOnly = new Intl.DateTimeFormat('es-CL', { timeZone: TIME_ZONE, year: 'numeric' });

/** Calendar day in Santiago as YYYY-MM-DD, so comparisons follow local midnight. */
function santiagoDay(at: number): string {
  return dayKey.format(new Date(at));
}

/**
 * Inbox row timestamp: time of day for today, "Ayer" for the previous day,
 * day-month for older messages this year and day-month-year otherwise.
 */
export function formatListTimestamp(at: number, now: number): string {
  const day = santiagoDay(at);
  const today = santiagoDay(now);
  if (day === today) return timeOfDay.format(new Date(at));
  // Step back from noon of today so DST days (23h/25h) still land on the previous date.
  const [year, month, date] = today.split('-').map(Number);
  if (day === santiagoDay(Date.UTC(year, month - 1, date, 12) - DAY_MS)) return 'Ayer';
  const short = dayMonth.format(new Date(at));
  return yearOnly.format(new Date(at)) === yearOnly.format(new Date(now)) ? short : `${short}-${yearOnly.format(new Date(at))}`;
}
