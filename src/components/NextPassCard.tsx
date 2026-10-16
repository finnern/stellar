import { useMemo } from 'react';
import { ISSPass, LOOKAHEAD_DAYS } from '../services/passPrediction';
import { makeTimeFormatter } from '../services/timeZones';
import Countdown from './Countdown';
import { CalendarPlus, Download } from 'lucide-react';
import { googleCalendarUrl, buildIcs, downloadIcs } from '../services/calendar';

const SOON_COUNT = 3; // next passes of any kind, so there is always something close by
const VISIBLE_COUNT = 5; // next visible passes, however far out

export type TimeMode = 'mine' | 'local';

interface NextPassCardProps {
  passes: ISSPass[];
  /** No pass reaches 10° here; these are the low ones (≥ 5°) */
  lowOnly?: boolean;
  /** Time zone of the selected place; the toggle only shows when it differs from the device's */
  placeTimeZone?: string;
  placeName?: string;
  showToggle: boolean;
  timeMode: TimeMode;
  onTimeModeChange: (mode: TimeMode) => void;
  /** Where the passes are computed for — used in calendar entries */
  location: { lat: number; lon: number; label?: string };
}

const NextPassCard = ({ passes, lowOnly, placeTimeZone, placeName, showToggle, timeMode, onTimeModeChange, location }: NextPassCardProps) => {
  const useLocal = showToggle && timeMode === 'local' && !!placeTimeZone;
  const fmt = useMemo(() => makeTimeFormatter(useLocal ? placeTimeZone : undefined), [useLocal, placeTimeZone]);
  const formatTime = fmt.time;
  const formatDay = fmt.day;
  const now = Date.now();
  const upcoming = passes.filter((p) => p.endTime.getTime() > now);
  const next = upcoming.find((p) => p.visible);
  const soon = upcoming.slice(0, SOON_COUNT);
  const visibleAhead = upcoming.filter((p) => p.visible).slice(0, VISIBLE_COUNT);
  const place = location.label ?? `${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°`;
  const calendarUrl = (p: ISSPass) => googleCalendarUrl(p, place, window.location.href);
  // Apple Calendar, Outlook & co.: .ics file with a 10-minute alarm
  const fileSlug = (location.label?.split(',')[0] ?? 'location').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const downloadPass = (p: ISSPass) =>
    downloadIcs(buildIcs([p], place, location.lat, location.lon, window.location.href), `iss-pass-${fileSlug}.ics`);

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
          {lowOnly && (
            <p className="text-center text-amber-300 text-sm mt-4 rounded-lg bg-amber-500/10 px-3 py-2">
              Low pass: from here the ISS stays close to the horizon, so you need an open view to the{' '}
              {next.maxDirection}, over a lake, a field or from a hilltop. It never climbs higher at this
              latitude, because its orbit only reaches 51.6° north and south.
            </p>
          )}
          <p className="text-center text-gray-400 text-sm mt-3">
            Overhead for {Math.round(next.durationSeconds / 60)} min — look{' '}
            {next.startDirection} first
          </p>
          <div className="mt-5 flex flex-col items-center gap-2">
            <a
              href={calendarUrl(next)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-space-blue hover:bg-space-accent text-white text-sm font-semibold transition-colors"
            >
              <CalendarPlus className="h-4 w-4" />
              Add to Google Calendar
            </a>
            <button
              onClick={() => downloadPass(next)}
              className="inline-flex items-center gap-1.5 text-xs text-space-blue hover:underline"
            >
              <Download className="h-3.5 w-3.5" />
              Other calendars (Apple, Outlook): .ics with a 10-min alarm
            </button>
          </div>
        </>
      ) : (
        <p className="text-center text-gray-300">
          No visible pass in the next {LOOKAHEAD_DAYS} days for this location.
        </p>
      )}
      <p className="text-center text-gray-500 text-xs mt-3">
        Visible = sky is dark but the ISS is still lit by the sun (after dusk / before dawn).
      </p>

      {soon.length > 0 && (
        <PassList title="Coming up next" passes={soon} formatDay={formatDay} formatTime={formatTime} />
      )}
      {visibleAhead.length > 0 && (
        <PassList
          title={`Next ${visibleAhead.length} visible passes`}
          passes={visibleAhead}
          formatDay={formatDay}
          formatTime={formatTime}
          calendarUrl={calendarUrl}
          onDownload={downloadPass}
        />
      )}
    </div>
  );
};

const conditionLabel = (p: ISSPass) =>
  p.condition === 'visible' ? 'visible' : p.condition === 'shadow' ? 'in shadow' : 'daylight';

/** One pass per row; with calendarUrl, each row gets a Google Calendar button and an .ics download */
const PassList = ({
  title,
  passes,
  formatDay,
  formatTime,
  calendarUrl,
  onDownload,
}: {
  title: string;
  passes: ISSPass[];
  formatDay: (d: Date) => string;
  formatTime: (d: Date) => string;
  calendarUrl?: (p: ISSPass) => string;
  onDownload?: (p: ISSPass) => void;
}) => (
  <div className="mt-6">
    <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">{title}</h3>
    <ul className="divide-y divide-white/10">
      {passes.map((p) => (
        <li key={p.startTime.getTime()} className="py-2 flex items-center gap-3 text-sm">
          <span className="text-gray-300 flex-1 min-w-0">
            {formatDay(p.startTime)} {formatTime(p.startTime)}
          </span>
          <span className="text-gray-400 hidden sm:inline">
            {p.startDirection}→{p.endDirection}, max {p.maxElevationDeg}°
          </span>
          <span className="text-gray-400 sm:hidden">max {p.maxElevationDeg}°</span>
          {calendarUrl ? (
            <a
              href={calendarUrl(p)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Add the pass on ${formatDay(p.startTime)} to Google Calendar`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-space-blue/20 hover:bg-space-blue/40 text-space-blue text-xs font-semibold transition-colors"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Google Calendar</span>
            </a>
          ) : null}
          {onDownload && (
            <button
              onClick={() => onDownload(p)}
              aria-label={`Download the pass on ${formatDay(p.startTime)} for other calendars (.ics)`}
              title="Other calendars (Apple, Outlook): .ics with a 10-min alarm"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-gray-400 hover:text-space-blue text-xs transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">.ics</span>
            </button>
          )}
          {!calendarUrl && (
            <span className={`w-20 text-right ${p.visible ? 'text-green-400 font-semibold' : 'text-gray-500'}`}>
              {conditionLabel(p)}
            </span>
          )}
        </li>
      ))}
    </ul>
  </div>
);

export default NextPassCard;
