import { ISSPass, LOOKAHEAD_DAYS } from '../services/passPrediction';
import Countdown from './Countdown';

interface NextPassCardProps {
  passes: ISSPass[];
}

const formatTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDay = (d: Date) => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

const NextPassCard = ({ passes }: NextPassCardProps) => {
  const now = Date.now();
  const upcoming = passes.filter((p) => p.endTime.getTime() > now);
  const next = upcoming.find((p) => p.visible);

  return (
    <div className="glass-card p-6">
      <h2 className="text-xl font-bold text-space-blue mb-2 text-center">
        Next Visible Pass
      </h2>
      {next ? (
        <>
          <Countdown targetDate={next.startTime} />
          <div className="text-center text-gray-300 mt-2">
            {formatDay(next.startTime)} {formatTime(next.startTime)} – {formatTime(next.endTime)}
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
                  {p.visible ? 'visible' : 'daylight'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NextPassCard;
