import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getISSLocation } from '../services/issLocation';
import { fetchTLE, predictPasses, LOW_PASS_MIN_PEAK_DEG } from '../services/passPrediction';
import NextPassCard from '../components/NextPassCard';
import LocationInput from '../components/LocationInput';
import Compass from '../components/Compass';
import OrbitView from '../components/OrbitView';
import { toast } from '@/components/ui/use-toast';
import { getDefaultLocation } from '../services/geocoding';
import { useSharedLocation, shareCurrentLink, buildShare, shareLinks, copyShare } from '@/hooks/use-shared-location';
import { placeTimeZone, deviceTimeZone, sameOffsetNow } from '../services/timeZones';
import { shareMessage } from '../services/shareMessage';
import { Share2, Mail, MessageCircle, Copy } from 'lucide-react';

const Index = () => {
  // Location lives in the URL (?place=…&lat=…&lon=…) so the page is always a shareable link
  const { location: userLocation, setLocation, resolving, timeMode, setTimeMode } = useSharedLocation();

  // Use Berlin as default until a location is chosen
  const currentLocation = userLocation || getDefaultLocation();
  const currentLabel = userLocation?.label;

  // The globe opens in 60× fast-forward; ?view=iss and ?speed=1 start in ISS view / real time
  const [linkView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { globe: params.get('view') !== 'iss', fast: params.get('speed') !== '1' };
  });

  // Time-zone toggle: only offered when the chosen place's clock differs from this device's
  const placeTz = useMemo(
    () => (userLocation ? placeTimeZone(userLocation.lat, userLocation.lon) : undefined),
    [userLocation]
  );
  const showTimeToggle = !!placeTz && !sameOffsetNow(placeTz, deviceTimeZone());
  const placeName = currentLabel?.split(',')[0]?.trim() || 'Local';

  const { data: issLocation, error } = useQuery({
    queryKey: ['issLocation'],
    queryFn: getISSLocation,
    refetchInterval: 5000,
  });

  // Orbit data (TLE) changes slowly — refresh every 6 hours
  const { data: tle, error: tleError } = useQuery({
    queryKey: ['issTLE'],
    queryFn: fetchTLE,
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
  });

  // Where no pass reaches 10° (far north/south), fall back to low passes so the answer isn't just "never"
  const { passes, lowOnly } = useMemo(() => {
    if (!tle) return { passes: [], lowOnly: false };
    const normal = predictPasses(tle, currentLocation.lat, currentLocation.lon);
    if (normal.some((p) => p.visible)) return { passes: normal, lowOnly: false };
    const low = predictPasses(tle, currentLocation.lat, currentLocation.lon, new Date(), {
      minPeakDeg: LOW_PASS_MIN_PEAK_DEG,
    });
    return low.some((p) => p.visible) ? { passes: low, lowOnly: true } : { passes: normal, lowOnly: false };
  }, [tle, currentLocation.lat, currentLocation.lon]);

  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch ISS location. Please try again later.",
        variant: "destructive",
      });
    }
  }, [error]);

  useEffect(() => {
    if (tleError) {
      toast({
        title: "Error",
        description: "Failed to fetch ISS orbit data. Pass predictions unavailable.",
        variant: "destructive",
      });
    }
  }, [tleError]);

  const handleLocationSubmit = (lat: number, lon: number, label?: string, source?: 'gps') => {
    setLocation({ lat, lon, label }, source);
    toast({
      title: "Location Updated",
      description: label ?? `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
    });
  };

  const share = useMemo(
    () =>
      buildShare(
        currentLabel,
        shareMessage({
          placeName: currentLabel ? placeName : `${currentLocation.lat.toFixed(2)}°, ${currentLocation.lon.toFixed(2)}°`,
          passes,
          lowOnly,
          timeZone: placeTz,
        })
      ),
    // The link itself comes from the address bar, which follows the location
    [currentLabel, placeName, currentLocation.lat, currentLocation.lon, passes, lowOnly, placeTz]
  );
  const links = shareLinks(share);

  const copied = (ok: boolean) =>
    ok
      ? toast({ title: "Message copied", description: "Paste it into Threema, Signal or any chat or email." })
      : toast({ title: "Could not copy", description: share.url });

  const handleShare = async () => {
    const result = await shareCurrentLink(share);
    if (result !== 'shared') copied(result === 'copied');
  };

  return (
    <div className="min-h-screen bg-space-black text-white p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-space-blue mb-2">Stellar ISS Compass</h1>
          <p className="text-lg text-gray-300">Track the International Space Station in real-time</p>
        </header>

        {/* ISS view / Globe: first, so a curious visitor sees where the ISS is right now */}
        <OrbitView
          tle={tle}
          userLocation={currentLocation}
          fallbackPosition={issLocation ?? null}
          initialMode={linkView.globe ? 'globe' : 'iss'}
          initialFast={linkView.fast}
        />

        {/* Current location + share link */}
        <div className="glass-card p-4 mb-4 text-center">
          <div className="text-gray-400">
            {resolving ? 'Finding location…' : userLocation ? 'Location' : 'Default location (Berlin) — set yours below'}
          </div>
          {currentLabel && <div className="text-xl font-bold">{currentLabel}</div>}
          <div className={currentLabel ? 'text-sm text-gray-400' : 'text-lg font-bold'}>
            {currentLocation.lat.toFixed(4)}°, {currentLocation.lon.toFixed(4)}°
          </div>
          {userLocation && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-space-blue hover:bg-space-accent text-white text-sm font-semibold transition-colors"
              >
                <Share2 className="h-4 w-4" />
                Share the ISS flyover experience with a friend
              </button>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-space-blue">
                <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
                <a href={links.email} className="inline-flex items-center gap-1 hover:underline">
                  <Mail className="h-3.5 w-3.5" /> Email
                </a>
                <a href={links.gmail} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  <Mail className="h-3.5 w-3.5" /> Gmail
                </a>
                <button onClick={async () => copied(await copyShare(share))} className="inline-flex items-center gap-1 hover:underline">
                  <Copy className="h-3.5 w-3.5" /> Copy text (Threema, Signal …)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Next Pass (real SGP4 prediction) */}
        {tle && (
          <NextPassCard
            passes={passes}
            lowOnly={lowOnly}
            placeTimeZone={placeTz}
            placeName={placeName}
            showToggle={showTimeToggle}
            timeMode={timeMode}
            onTimeModeChange={setTimeMode}
            location={{ ...currentLocation, label: currentLabel }}
          />
        )}

        {/* Compass Component */}
        {issLocation && currentLocation && (
          <Compass
            userLocation={currentLocation}
            issLocation={issLocation}
          />
        )}

        {/* Location Input */}
        <LocationInput onLocationSubmit={handleLocationSubmit} currentLocation={currentLocation} />

        {issLocation && (
          <div className="glass-card p-6">
            <h2 className="text-xl font-bold text-space-blue mb-4">Current ISS Status</h2>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-gray-400">Latitude</p>
                <p className="text-2xl font-bold">{issLocation.latitude.toFixed(4)}°</p>
              </div>
              <div>
                <p className="text-gray-400">Longitude</p>
                <p className="text-2xl font-bold">{issLocation.longitude.toFixed(4)}°</p>
              </div>
              <div>
                <p className="text-gray-400">Altitude</p>
                <p className="text-2xl font-bold">{issLocation.altitude.toFixed(2)} km</p>
              </div>
              <div>
                <p className="text-gray-400">Velocity</p>
                <p className="text-2xl font-bold">{(issLocation.velocity).toFixed(0)} km/h</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-400">Visibility</p>
                <p className="text-2xl font-bold capitalize">{issLocation.visibility}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
