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

export type TimeMode = 'mine' | 'local';

/**
 * Location state that survives in the URL.
 * - Opening …/stellar/?place=Auckland,%20New%20Zealand&lat=-36.85&lon=174.76 starts there
 * - …/stellar/?place=Aukland, New Zeland (no coordinates) is geocoded on load, typos tolerated
 */
export const useSharedLocation = () => {
  const [{ location: initial, placeOnly }] = useState(readFromUrl);
  const [location, setLocationState] = useState<AppLocation | null>(initial);
  // ?time=local → show pass times in the selected place's time zone
  const [timeMode, setTimeModeState] = useState<TimeMode>(() =>
    new URLSearchParams(window.location.search).get('time') === 'local' ? 'local' : 'mine'
  );
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

  const setTimeMode = useCallback((mode: TimeMode) => {
    setTimeModeState(mode);
    const params = new URLSearchParams(window.location.search);
    if (mode === 'local') params.set('time', 'local');
    else params.delete('time');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  }, []);

  return { location, setLocation, resolving, timeMode, setTimeMode };
};

/**
 * Short link for sharing: just place and coordinates (~1 km is plenty), without view or time-zone
 * settings, so it reads well in a message: …/stellar/?place=Arvidsjaur&lat=65.67&lon=19.25
 */
const cleanShareUrl = (): string => {
  const current = new URLSearchParams(window.location.search);
  const params = new URLSearchParams();
  const place = current.get('place');
  if (place) params.set('place', place.split(',')[0].trim());
  for (const key of ['lat', 'lon']) {
    const v = parseFloat(current.get(key) ?? '');
    if (Number.isFinite(v)) params.set(key, v.toFixed(2));
  }
  const qs = params.toString().replace(/\+/g, '%20');
  return `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ''}`;
};

export interface ShareContent {
  title: string;
  text: string;
  url: string;
}

export const buildShare = (label: string | undefined, message: string): ShareContent => ({
  title: label ? `See the ISS fly over ${label.split(',')[0].trim()}` : 'See the ISS fly over',
  text: message,
  url: cleanShareUrl(),
});

/** Direct links for apps that are not in every share sheet (e.g. Gmail in the browser on a Mac) */
export const shareLinks = ({ title, text, url }: ShareContent) => {
  const body = `${text}\n${url}`;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(body)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
  };
};

export const copyShare = async ({ text, url }: ShareContent): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return true;
  } catch {
    return false;
  }
};

/** Open the native share sheet (phones, Safari) or copy message and link. Returns what happened. */
export const shareCurrentLink = async (share: ShareContent): Promise<'shared' | 'copied' | 'failed'> => {
  if (navigator.share) {
    try {
      await navigator.share(share);
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'shared'; // user closed the sheet
    }
  }
  return (await copyShare(share)) ? 'copied' : 'failed';
};
