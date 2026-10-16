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

  const intro = [
    `Have you ever seen the International Space Station fly over ${placeName}? 🛰️`,
    '',
    'It looks like a bright, steady star that crosses the sky in a few minutes: no blinking, ' +
      'no telescope needed. Up there, about 400 km high, astronauts are circling the Earth every ' +
      '90 minutes, and you can watch them pass with your own eyes.',
  ].join('\n');

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
    'Step outside a few minutes early so your eyes get used to the dark. This little app shows ' +
      'a countdown, a compass pointing to where it appears, a live globe and calendar reminders:',
  ].join('\n');
};
