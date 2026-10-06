import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  eciToEcf,
  sunPos,
  shadowFraction,
  jday,
  radiansToDegrees,
} from 'satellite.js';
import type { SatRec } from 'satellite.js';
import type { TLEData } from './passPrediction';

const EARTH_RADIUS_KM = 6371;

export interface SubPoint {
  lat: number; // degrees
  lon: number; // degrees, -180..180
  altKm: number;
}

export const makeSatrec = (tle: TLEData): SatRec => twoline2satrec(tle.line1, tle.line2);

/** ISS sub-satellite point (where it is directly overhead) at a given time. */
export const subPointAt = (satrec: SatRec, time: Date): SubPoint | null => {
  const pv = propagate(satrec, time);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
  const geo = eciToGeodetic(pv.position, gstime(time));
  let lon = radiansToDegrees(geo.longitude);
  lon = ((lon + 540) % 360) - 180;
  return { lat: radiansToDegrees(geo.latitude), lon, altKm: geo.height };
};

/** Ground track as [lon, lat] pairs between two times — suitable for a GeoJSON LineString. */
export const groundTrack = (
  satrec: SatRec,
  from: Date,
  to: Date,
  stepSeconds = 30
): [number, number][] => {
  const points: [number, number][] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += stepSeconds * 1000) {
    const p = subPointAt(satrec, new Date(t));
    if (p) points.push([p.lon, p.lat]);
  }
  return points;
};

/** Initial great-circle bearing (degrees, 0 = north, clockwise) from a to b. */
export const bearing = (a: SubPoint, b: SubPoint): number => {
  const toRad = Math.PI / 180;
  const φ1 = a.lat * toRad;
  const φ2 = b.lat * toRad;
  const Δλ = (b.lon - a.lon) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / toRad) + 360) % 360;
};

/** Direction the ISS is travelling over the ground right now. */
export const headingAt = (satrec: SatRec, time: Date): number | null => {
  const a = subPointAt(satrec, time);
  const b = subPointAt(satrec, new Date(time.getTime() + 20_000));
  if (!a || !b) return null;
  return bearing(a, b);
};

/** The point on Earth where the sun is directly overhead — centre of the daylight hemisphere. */
export const subsolarPoint = (time: Date): [number, number] => {
  const s = sunPos(jday(time)).rsun;
  const ecf = eciToEcf({ x: s.x, y: s.y, z: s.z }, gstime(time));
  const lon = radiansToDegrees(Math.atan2(ecf.y, ecf.x));
  const lat = radiansToDegrees(Math.atan2(ecf.z, Math.hypot(ecf.x, ecf.y)));
  return [lon, lat];
};

/**
 * Angular radius (degrees) of the area on the ground from which the ISS is above the horizon.
 * At ~420 km altitude this is ~20° — about 2,200 km.
 */
export const footprintRadiusDeg = (altKm: number): number =>
  radiansToDegrees(Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm)));

/** True if the ISS is in sunlight (not in Earth's shadow) at the given time. */
export const issSunlitAt = (satrec: SatRec, time: Date): boolean | null => {
  const pv = propagate(satrec, time);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
  return shadowFraction(sunPos(jday(time)).rsun, pv.position) < 0.5;
};
