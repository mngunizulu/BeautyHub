export const minute = 60_000;
const day = 24 * 60 * minute;

export function localClock(timezone: string) {
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return (instant: number) => {
    const parts = Object.fromEntries(format.formatToParts(instant).map(({ type, value }) => [type, value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  };
}

export function dateNumber(date: string) {
  return Date.parse(date + "T00:00:00Z");
}

export function localDayMinutes(date: string, timezone: string) {
  const origin = dateNumber(date);
  const clock = localClock(timezone);
  const minutes: { instant: number; time: string }[] = [];
  // Enumerate actual instants so skipped wall times never appear and folded times remain distinct.
  for (let instant = origin - 14 * 60 * minute; instant < origin + day + 14 * 60 * minute; instant += minute) {
    const local = clock(instant);
    if (local.date === date) minutes.push({ instant, time: local.time });
  }
  return minutes;
}
