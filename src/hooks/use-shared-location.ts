import { useCallback, useEffect, useState } from 'react';
import { geocodeLocation } from '@/services/geocoding';

export interface AppLocation {
  lat: number;
  lon: number;
  label?: string;
}

const validLat = (v: number) => Number.isFinite(v) && v >= -90 && v <= 90;
const validLon = (v: number) => Number.isFinite(v) && v >= -180 && v <= 180;

/** Read ?place=…&lat=…&lon=… from the current URL */
const readFromUrl = (): { location: AppLocation | null; placeOnly?: string } => {
  const params = new URLSearchParams(window.location.search);
  const place = params.get('place')?.slice(0, 100) || undefined;
  const lat = parseFloat(params.get('lat') ?? '');
  const lon = parseFloat(params.get('lon') ?? '');
  if (validLat(lat) && validLon(lon)) return { location: { lat, lon, label: place } };
  return { location: null, placeOnly: place };
};

/** Write the location into the address bar so the current page is a shareable link */
const writeToUrl = (loc: AppLocation, decimals: number) => {
  const params = new URLSearchParams(window.location.search);
  if (loc.label) params.set('place', loc.label);
  else params.delete('place');
  params.set('lat', loc.lat.toFixed(decimals));
  params.set('lon', loc.lon.toFixed(decimals));
  const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(null, '', url);
};

/**
 * Location state that survives in the URL.
 * - Opening …/stellar/?place=Auckland,%20New%20Zealand&lat=-36.85&lon=174.76 starts there
 * - …/stellar/?place=Aukland, New Zeland (no coordinates) is geocoded on load, typos tolerated
 */
export const useSharedLocation = () => {
  const [{ location: initial, placeOnly }] = useState(readFromUrl);
  const [location, setLocationState] = useState<AppLocation | null>(initial);
  const [resolving, setResolving] = useState(!!placeOnly);

  // Link contained only a place name — look it up once
  useEffect(() => {
    if (!placeOnly) return;
    let cancelled = false;
    geocodeLocation(placeOnly)
      .then((r) => {
        if (cancelled || r.error) return;
        const loc = { lat: r.lat, lon: r.lon, label: r.label || placeOnly };
        setLocationState(loc);
        writeToUrl(loc, 4);
      })
      .finally(() => !cancelled && setResolving(false));
    return () => { cancelled = true; };
  }, [placeOnly]);

  const setLocation = useCallback((loc: AppLocation, source?: 'gps') => {
    setLocationState(loc);
    // Device position: ~1 km precision in the link is plenty for pass predictions and kinder to privacy
    writeToUrl(loc, source === 'gps' ? 2 : 4);
  }, []);

  return { location, setLocation, resolving };
};

/** Open the native share sheet (phones) or copy the link (desktop). Returns what happened. */
export const shareCurrentLink = async (label?: string): Promise<'shared' | 'copied' | 'failed'> => {
  const url = window.location.href;
  const title = label ? `ISS over ${label}` : 'Stellar ISS Compass';
  const text = label
    ? `When can you see the International Space Station from ${label}? Live tracker:`
    : 'When can you see the International Space Station? Live tracker:';
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'shared'; // user closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
};
