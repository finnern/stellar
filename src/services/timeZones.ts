import tzlookup from 'tz-lookup';

/** IANA time zone at a coordinate, e.g. "Pacific/Auckland" — offline lookup, no network. */
export const placeTimeZone = (lat: number, lon: number): string | undefined => {
  try {
    return tzlookup(lat, lon);
  } catch {
    return undefined;
  }
};

export const deviceTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Same wall-clock rules right now? (e.g. Berlin and Paris count as the same) */
export const sameOffsetNow = (a?: string, b?: string): boolean => {
  if (!a || !b) return true;
  if (a === b) return true;
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).format(new Date());
  try {
    return fmt(a) === fmt(b);
  } catch {
    return false;
  }
};

/** Time-of-day and day-label formatting in a given time zone (undefined = device time). */
export const makeTimeFormatter = (timeZone?: string) => {
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone });
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', timeZone });
  const ymd = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone });
  const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone });

  const dayKey = (d: Date) => ymd.format(d); // YYYY-MM-DD in that zone

  return {
    time: (d: Date) => time.format(d),
    /** Short zone name like "NZDT" or "GMT+13" */
    zone: (d: Date) => zone.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '',
    day: (d: Date) => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      if (dayKey(d) === dayKey(now)) return 'Today';
      if (dayKey(d) === dayKey(tomorrow)) return 'Tomorrow';
      return longDay.format(d);
    },
  };
};
