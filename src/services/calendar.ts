import type { ISSPass } from './passPrediction';

const REMINDER_MINUTES = 10;
const DAYS_AHEAD = 7; // beyond ~a week, predicted times can drift by minutes

/** ICS UTC timestamp, e.g. 20261015T042400Z */
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Escape text per RFC 5545 */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets (RFC 5545 §3.1) */
const fold = (line: string) => {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
};

const title = (p: ISSPass) => `🛰️ ISS visible – look ${p.startDirection}`;

const details = (p: ISSPass, appUrl: string) =>
  [
    `Appears ${p.startDirection}, climbs to ${p.maxElevationDeg}° in the ${p.maxDirection}, disappears ${p.endDirection}.`,
    `Visible for about ${Math.round(p.durationSeconds / 60)} min: a bright, steady dot (no blinking), faster than a plane.`,
    `Times can shift by a minute or two – live view: ${appUrl}`,
  ].join('\n');

/** Passes worth putting in a calendar: visible ones in the next week, or at least the next visible one. */
export const passesForCalendar = (passes: ISSPass[], now = Date.now()): ISSPass[] => {
  const upcoming = passes.filter((p) => p.visible && p.startTime.getTime() > now);
  const week = upcoming.filter((p) => p.startTime.getTime() - now < DAYS_AHEAD * 24 * 60 * 60 * 1000);
  return week.length ? week : upcoming.slice(0, 1);
};

/** iCalendar file with one event per pass, each with a display alarm 10 minutes before. */
export const buildIcs = (passes: ISSPass[], placeLabel: string, lat: number, lon: number, appUrl: string): string => {
  const stamp = icsDate(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//finnern.com//Stellar ISS Compass//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const p of passes) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:iss-${icsDate(p.startTime)}-${lat.toFixed(2)}_${lon.toFixed(2)}@finnern.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(p.startTime)}`,
      `DTEND:${icsDate(p.endTime)}`,
      `SUMMARY:${esc(title(p))}`,
      `DESCRIPTION:${esc(details(p, appUrl))}`,
      `LOCATION:${esc(placeLabel)}`,
      `GEO:${lat.toFixed(4)};${lon.toFixed(4)}`,
      `URL:${appUrl}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`ISS in ${REMINDER_MINUTES} minutes – look ${p.startDirection}`)}`,
      `TRIGGER:-PT${REMINDER_MINUTES}M`,
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
};

/** Save the .ics so the phone offers "Add to Calendar". */
export const downloadIcs = (ics: string, fileName: string) => {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/** Google Calendar "add event" link for one pass (uses your calendar's default reminder). */
export const googleCalendarUrl = (p: ISSPass, placeLabel: string, appUrl: string) => {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title(p),
    dates: `${icsDate(p.startTime)}/${icsDate(p.endTime)}`,
    details: details(p, appUrl),
    location: placeLabel,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};
