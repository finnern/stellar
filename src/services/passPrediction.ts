import {
  twoline2satrec,
  propagate,
  gstime,
  eciToEcf,
  ecfToLookAngles,
  sunPos,
  shadowFraction,
  degreesToRadians,
  radiansToDegrees,
  jday,
} from 'satellite.js';
import type { SatRec } from 'satellite.js';

const KM_PER_AU = 149597870.69098932;
const STEP_SECONDS = 30;
// Visible-pass windows come in clusters with gaps of a week or more, so look far enough ahead
export const LOOKAHEAD_DAYS = 30;
const LOOKAHEAD_HOURS = LOOKAHEAD_DAYS * 24;
const MIN_PEAK_ELEVATION_DEG = 10;
// Observer sun elevation below which the sky is dark enough to spot the ISS
const DARKNESS_SUN_ELEVATION_DEG = -6;

export interface ISSPass {
  startTime: Date;
  endTime: Date;
  maxElevationTime: Date;
  maxElevationDeg: number;
  startAzimuthDeg: number;
  maxAzimuthDeg: number;
  endAzimuthDeg: number;
  startDirection: string;
  maxDirection: string;
  endDirection: string;
  durationSeconds: number;
  // True if at some point during the pass the ISS is sunlit while the observer is in darkness
  visible: boolean;
  /** Why a pass is (not) visible: sky too bright, or sky dark but ISS in Earth's shadow */
  condition: 'visible' | 'daylight' | 'shadow';
}

export interface TLEData {
  line1: string;
  line2: string;
  fetchedAt: number;
}

export const getCardinalDirection = (bearing: number): string => {
  const directions = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  const index = Math.round(((bearing % 360) + 360) % 360 / 22.5) % 16;
  return directions[index];
};

export const fetchTLE = async (): Promise<TLEData> => {
  // Primary: wheretheiss.at (same API family as the live position)
  try {
    const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544/tles');
    if (response.ok) {
      const data = await response.json();
      if (typeof data?.line1 === 'string' && typeof data?.line2 === 'string') {
        return { line1: data.line1, line2: data.line2, fetchedAt: Date.now() };
      }
    }
  } catch {
    // fall through to secondary source
  }
  // Fallback: CelesTrak
  const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE');
  if (!response.ok) throw new Error('Could not fetch ISS orbit data');
  const text = await response.text();
  const lines = text.trim().split('\n').map((l) => l.trim());
  const line1 = lines.find((l) => l.startsWith('1 '));
  const line2 = lines.find((l) => l.startsWith('2 '));
  if (!line1 || !line2) throw new Error('Could not parse ISS orbit data');
  return { line1, line2, fetchedAt: Date.now() };
};

interface Sample {
  time: Date;
  elevationDeg: number;
  azimuthDeg: number;
  issSunlit: boolean;
  observerDark: boolean;
}

const sampleAt = (
  satrec: SatRec,
  observerGd: { latitude: number; longitude: number; height: number },
  time: Date
): Sample | null => {
  const pv = propagate(satrec, time);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;

  const gmst = gstime(time);
  const positionEcf = eciToEcf(pv.position, gmst);
  const look = ecfToLookAngles(observerGd, positionEcf);
  const elevationDeg = radiansToDegrees(look.elevation);

  // Below the horizon: skip the (costlier) sun/shadow math — keeps a 14-day scan fast on phones
  if (elevationDeg <= 0) {
    return { time, elevationDeg, azimuthDeg: 0, issSunlit: false, observerDark: false };
  }

  const jd = jday(time);
  const sun = sunPos(jd);
  // Sun ECI in km, reused for the observer's sun elevation
  const sunEciKm = {
    x: sun.rsun.x * KM_PER_AU,
    y: sun.rsun.y * KM_PER_AU,
    z: sun.rsun.z * KM_PER_AU,
  };
  const sunEcf = eciToEcf(sunEciKm, gmst);
  const sunLook = ecfToLookAngles(observerGd, sunEcf);

  return {
    time,
    elevationDeg,
    azimuthDeg: ((radiansToDegrees(look.azimuth) % 360) + 360) % 360,
    issSunlit: shadowFraction(sun.rsun, pv.position) < 0.5,
    observerDark: radiansToDegrees(sunLook.elevation) < DARKNESS_SUN_ELEVATION_DEG,
  };
};

/**
 * Predict upcoming ISS passes over an observer location using SGP4 propagation.
 * Scans LOOKAHEAD_HOURS ahead in STEP_SECONDS steps; a pass is any interval above
 * the horizon whose peak elevation reaches MIN_PEAK_ELEVATION_DEG.
 */
export const predictPasses = (
  tle: TLEData,
  latitude: number,
  longitude: number,
  startFrom: Date = new Date()
): ISSPass[] => {
  const satrec = twoline2satrec(tle.line1, tle.line2);
  const observerGd = {
    latitude: degreesToRadians(latitude),
    longitude: degreesToRadians(longitude),
    height: 0.3, // km above sea level; small effect on look angles
  };

  const passes: ISSPass[] = [];
  const totalSteps = (LOOKAHEAD_HOURS * 3600) / STEP_SECONDS;
  let current: Sample[] = [];

  for (let i = 0; i <= totalSteps; i++) {
    const time = new Date(startFrom.getTime() + i * STEP_SECONDS * 1000);
    const sample = sampleAt(satrec, observerGd, time);
    if (!sample) continue;

    if (sample.elevationDeg > 0) {
      current.push(sample);
    } else if (current.length > 0) {
      const pass = buildPass(current);
      if (pass) passes.push(pass);
      current = [];
    }
  }
  if (current.length > 1) {
    const pass = buildPass(current);
    if (pass) passes.push(pass);
  }
  return passes;
};

const buildPass = (samples: Sample[]): ISSPass | null => {
  if (samples.length < 2) return null;
  let peak = samples[0];
  for (const s of samples) {
    if (s.elevationDeg > peak.elevationDeg) peak = s;
  }
  if (peak.elevationDeg < MIN_PEAK_ELEVATION_DEG) return null;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const visible = samples.some(
    (s) => s.elevationDeg > MIN_PEAK_ELEVATION_DEG && s.issSunlit && s.observerDark
  );

  return {
    startTime: first.time,
    endTime: last.time,
    maxElevationTime: peak.time,
    maxElevationDeg: Math.round(peak.elevationDeg),
    startAzimuthDeg: Math.round(first.azimuthDeg),
    maxAzimuthDeg: Math.round(peak.azimuthDeg),
    endAzimuthDeg: Math.round(last.azimuthDeg),
    startDirection: getCardinalDirection(first.azimuthDeg),
    maxDirection: getCardinalDirection(peak.azimuthDeg),
    endDirection: getCardinalDirection(last.azimuthDeg),
    durationSeconds: Math.round((last.time.getTime() - first.time.getTime()) / 1000),
    visible,
    condition: visible ? 'visible' : peak.observerDark ? 'shadow' : 'daylight',
  };
};

/** The next pass worth looking up for: prefers visible passes. */
export const nextVisiblePass = (passes: ISSPass[]): ISSPass | null =>
  passes.find((p) => p.visible) ?? null;
