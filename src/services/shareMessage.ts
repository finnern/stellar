import type { ISSPass } from './passPrediction';
import { LOOKAHEAD_DAYS } from './passPrediction';

const MAX_PASSES = 3;

/**
 * Text for "Share with a friend": what the app is and the next visible passes in the place's own
 * time, with explicit dates (the message may be read days later, so no "Today"/"Tomorrow").
 */
export const shareMessage = ({
  placeName,
  lat,
  passes,
  lowOnly,
  timeZone,
  now = Date.now(),
}: {
  placeName: string;
  lat: number;
  passes: ISSPass[];
  lowOnly: boolean;
  /** The place's time zone; undefined = this device's */
  timeZone?: string;
  now?: number;
}): string => {
  const when = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone,
  });
  const zone = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short', timeZone });
  const zoneName = (d: Date) => zone.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const next = passes.filter((p) => p.visible && p.startTime.getTime() > now).slice(0, MAX_PASSES);

  const intro =
    `Here's a little app that shows when the International Space Station flies over ${placeName}: ` +
    'a bright, steady dot gliding across the sky, no telescope needed.';

  if (!next.length) {
    return [
      intro,
      '',
      `There's no visible pass from ${placeName} in the next ${LOOKAHEAD_DAYS} days, but the live globe shows where it is right now:`,
    ].join('\n');
  }

  const lines = next.map(
    (p) =>
      `• ${when.format(p.startTime)}: appears in the ${p.startDirection}, highest ${p.maxElevationDeg}° in the ${p.maxDirection}`
  );
  const low = lowOnly
    ? [
        '',
        `${placeName} is so far ${lat >= 0 ? 'north' : 'south'} that the ISS stays low over the horizon. ` +
          `Find a spot with an open view to the ${next[0].maxDirection}, over a lake or a field.`,
      ]
    : [];

  return [
    intro,
    '',
    `Next chances to see it (${placeName} time, ${zoneName(next[0].startTime)}):`,
    ...lines,
    ...low,
    '',
    'Countdown, compass, a live globe and Google Calendar reminders:',
  ].join('\n');
};
