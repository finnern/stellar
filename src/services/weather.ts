/** Cloud cover forecast from Open-Meteo (free, no API key, hourly, up to 16 days). */

const HOUR_MS = 60 * 60 * 1000;
// Beyond about a week cloud forecasts are guesswork; don't show them
export const CLOUD_FORECAST_DAYS = 7;

/** Total cloud cover in % per UTC hour (key: epoch ms at the full hour). */
export type CloudForecast = Map<number, number>;

export const fetchCloudForecast = async (lat: number, lon: number): Promise<CloudForecast> => {
  const params = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    hourly: 'cloud_cover',
    forecast_days: String(CLOUD_FORECAST_DAYS + 1),
    timezone: 'GMT',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Weather forecast failed (${res.status})`);
  const data = await res.json();
  const times: string[] = data?.hourly?.time ?? [];
  const cover: (number | null)[] = data?.hourly?.cloud_cover ?? [];
  const forecast: CloudForecast = new Map();
  times.forEach((t, i) => {
    const pct = cover[i];
    if (typeof pct === 'number') forecast.set(Date.parse(`${t}:00Z`), pct);
  });
  return forecast;
};

/** Cloud cover for the hour nearest to `time`, if it is within the forecast range. */
export const cloudCoverAt = (forecast: CloudForecast | undefined, time: Date): number | undefined => {
  if (!forecast) return undefined;
  if (time.getTime() - Date.now() > CLOUD_FORECAST_DAYS * 24 * HOUR_MS) return undefined;
  return forecast.get(Math.round(time.getTime() / HOUR_MS) * HOUR_MS);
};

export type SkyOutlook = 'clear' | 'partly' | 'cloudy';

export const skyOutlook = (cloudPct: number): SkyOutlook =>
  cloudPct <= 25 ? 'clear' : cloudPct <= 60 ? 'partly' : 'cloudy';

export const skyLabel: Record<SkyOutlook, string> = {
  clear: 'clear sky',
  partly: 'partly cloudy',
  cloudy: 'cloudy',
};
