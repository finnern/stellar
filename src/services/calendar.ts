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

/** How high a pass gets, in everyday terms (a fist at arm's length ≈ 10°) */
const heightHint = (deg: number) => {
  if (deg >= 60) return 'nearly overhead, look straight up!';
  if (deg >= 30) return `high in the sky (about ${Math.round(deg / 10)} fists above the horizon)`;
  if (deg >= 20) return `about ${Math.round(deg / 10)} fists above the horizon`;
  return 'low, about 1–2 fists above the horizon – find a spot with a clear view that way';
};

const details = (p: ISSPass, appUrl: string) => {
  const minutes = Math.round(p.durationSeconds / 60);
  const toPeak = Math.max(1, Math.round((p.maxElevationTime.getTime() - p.startTime.getTime()) / 60_000));
  return [
    `What you'll see: the International Space Station – a bright, steady white dot (no blinking, no coloured lights) gliding across the sky faster than any plane. It's about 400 km up and carries the astronauts living on board.`,
    '',
    'How to watch:',
    `• At the start time, look ${p.startDirection}, just above the horizon`,
    `• About ${toPeak} min later it's at its highest: ${p.maxElevationDeg}° in the ${p.maxDirection} – ${heightHint(p.maxElevationDeg)}`,
    `• It disappears in the ${p.endDirection} after about ${minutes} min – sometimes it fades out mid-sky as it enters Earth's shadow`,
    '• No telescope needed. Step outside a few minutes early so your eyes adjust to the dark.',
    '',
    "Why you can see it: it's already dark where you are, but the ISS is so high that it's still lit by the sun.",
    '',
    `Live compass, map and 3D view: ${appUrl}`,
    'Times can shift by a minute or two – the link always shows the latest prediction.',
  ].join('\n');
};

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
