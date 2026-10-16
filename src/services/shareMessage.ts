import type { ISSPass } from './passPrediction';
import { LOOKAHEAD_DAYS } from './passPrediction';

const MAX_PASSES = 3;

/**
 * Text for "Share with a friend": what the app is and the next visible passes in the place's own
 * time, with explicit dates (the message may be read days later, so no "Today"/"Tomorrow").
 */
export const shareMessage = ({
  placeName,
  passes,
  lowOnly,
  timeZone,
  now = Date.now(),
}: {
  placeName: string;
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
    `🛰️ Want to see the International Space Station fly over ${placeName}? ` +
    "It's a bright, steady dot crossing the sky in a few minutes, no telescope needed.";

  if (!next.length) {
    return [
      intro,
      '',
      `No visible pass in the next ${LOOKAHEAD_DAYS} days, but the live globe shows where it is right now:`,
    ].join('\n');
  }

  const lines = next.map(
    (p) => `• ${when.format(p.startTime)}: from the ${p.startDirection}, up to ${p.maxElevationDeg}° in the ${p.maxDirection}`
  );
  const low = lowOnly ? [`It stays low from there, so find an open view to the ${next[0].maxDirection}.`] : [];

  return [
    intro,
    '',
    `Next chances (${zoneName(next[0].startTime)}):`,
    ...lines,
    ...low,
    '',
    'Countdown, compass and live globe:',
  ].join('\n');
};
