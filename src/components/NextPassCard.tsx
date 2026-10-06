import { useMemo } from 'react';
import { ISSPass, LOOKAHEAD_DAYS } from '../services/passPrediction';
import { makeTimeFormatter } from '../services/timeZones';
import Countdown from './Countdown';
import { BellRing, CalendarPlus } from 'lucide-react';
import { passesForCalendar, buildIcs, downloadIcs, googleCalendarUrl } from '../services/calendar';

export type TimeMode = 'mine' | 'local';

interface NextPassCardProps {
  passes: ISSPass[];
  /** Time zone of the selected place; the toggle only shows when it differs from the device's */
  placeTimeZone?: string;
  placeName?: string;
  showToggle: boolean;
  timeMode: TimeMode;
  onTimeModeChange: (mode: TimeMode) => void;
  /** Where the passes are computed for — used in calendar entries */
  location: { lat: number; lon: number; label?: string };
}

const NextPassCard = ({ passes, placeTimeZone, placeName, showToggle, timeMode, onTimeModeChange, location }: NextPassCardProps) => {
  const useLocal = showToggle && timeMode === 'local' && !!placeTimeZone;
  const fmt = useMemo(() => makeTimeFormatter(useLocal ? placeTimeZone : undefined), [useLocal, placeTimeZone]);
  const formatTime = fmt.time;
  const formatDay = fmt.day;
  const now = Date.now();
  const upcoming = passes.filter((p) => p.endTime.getTime() > now);
  const next = upcoming.find((p) => p.visible);

  return (
    <div className="glass-card p-6">
      <h2 className="text-xl font-bold text-space-blue mb-2 text-center">
        Next Visible Pass
      </h2>
      {showToggle && (
        <div className="flex justify-center mb-3">
          <div className="inline-flex rounded-lg bg-black/30 p-1 text-sm" role="group" aria-label="Time zone">
            {(['mine', 'local'] as TimeMode[]).map((m) => (
              <button
                key={m}
                onClick={() => onTimeModeChange(m)}
                aria-pressed={timeMode === m}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  timeMode === m ? 'bg-space-blue text-white' : 'text-gray-300'
                }`}
              >
                {m === 'mine' ? 'My time' : `${placeName ?? 'Local'} time`}
              </button>
            ))}
          </div>
        </div>
      )}
      {next ? (
        <>
          <Countdown targetDate={next.startTime} />
          <div className="text-center text-gray-300 mt-2">
            {formatDay(next.startTime)} {formatTime(next.startTime)} – {formatTime(next.endTime)}{' '}
            <span className="text-gray-500 text-sm">{fmt.zone(next.startTime)}</span>
          </div>
          {next.startTime.getTime() - now > 7 * 24 * 60 * 60 * 1000 && (
            <p className="text-center text-gray-500 text-xs mt-1">
              More than a week out — time may shift by a few minutes; check again closer to the date.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 text-center mt-4">
            <div>
              <p className="text-gray-400 text-sm">Appears</p>
              <p className="text-2xl font-bold">{next.startDirection}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Max height</p>
              <p className="text-2xl font-bold">{next.maxElevationDeg}°</p>
              <p className="text-gray-400 text-sm">{next.maxDirection}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Disappears</p>
              <p className="text-2xl font-bold">{next.endDirection}</p>
            </div>
          </div>
          <p className="text-center text-gray-400 text-sm mt-3">
            Overhead for {Math.round(next.durationSeconds / 60)} min — look{' '}
            {next.startDirection} first
          </p>
          <ReminderButtons passes={passes} location={location} />
        </>
      ) : (
        <p className="text-center text-gray-300">
          No visible pass in the next {LOOKAHEAD_DAYS} days for this location.
        </p>
      )}
      <p className="text-center text-gray-500 text-xs mt-3">
        Visible = sky is dark but the ISS is still lit by the sun (after dusk / before dawn).
      </p>

      {upcoming.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">
            Upcoming passes
          </h3>
          <ul className="divide-y divide-white/10">
            {upcoming.slice(0, 6).map((p) => (
              <li
                key={p.startTime.getTime()}
                className="py-2 flex items-center justify-between text-sm"
              >
                <span className="text-gray-300">
                  {formatDay(p.startTime)} {formatTime(p.startTime)}
                </span>
                <span className="text-gray-400">
                  {p.startDirection}→{p.endDirection}, max {p.maxElevationDeg}°
                </span>
                <span
                  className={
                    p.visible
                      ? 'text-green-400 font-semibold'
                      : 'text-gray-500'
                  }
                >
                  {p.condition === 'visible' ? 'visible' : p.condition === 'shadow' ? 'in shadow' : 'daylight'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/** "Remind me" — calendar file with a 10-minute alarm for each visible pass this week */
const ReminderButtons = ({
  passes,
  location,
}: {
  passes: ISSPass[];
  location: { lat: number; lon: number; label?: string };
}) => {
  const forCalendar = passesForCalendar(passes);
  if (!forCalendar.length) return null;
  const place = location.label ?? `${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°`;
  const fileSlug = (location.label?.split(',')[0] ?? 'location').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const onDownload = () => {
    const ics = buildIcs(forCalendar, place, location.lat, location.lon, window.location.href);
    downloadIcs(ics, `iss-passes-${fileSlug}.ics`);
  };

  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <button
        onClick={onDownload}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-space-blue hover:bg-space-accent text-white text-sm font-semibold transition-colors"
      >
        <BellRing className="h-4 w-4" />
        Remind me 10 min before
      </button>
      <p className="text-xs text-gray-500 text-center">
        Adds {forCalendar.length === 1 ? 'this pass' : `all ${forCalendar.length} visible passes of the next 7 days`} to
        your calendar, each with a 10-minute alarm.
      </p>
      <a
        href={googleCalendarUrl(forCalendar[0], place, window.location.href)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-space-blue hover:underline"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        or add the next pass to Google Calendar
      </a>
    </div>
  );
};

export default NextPassCard;
