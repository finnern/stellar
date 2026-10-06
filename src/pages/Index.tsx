import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getISSLocation } from '../services/issLocation';
import { fetchTLE, predictPasses } from '../services/passPrediction';
import NextPassCard from '../components/NextPassCard';
import LocationInput from '../components/LocationInput';
import Compass from '../components/Compass';
import OrbitView from '../components/OrbitView';
import { toast } from '@/components/ui/use-toast';
import { getDefaultLocation } from '../services/geocoding';
import { useSharedLocation, shareCurrentLink } from '@/hooks/use-shared-location';
import { placeTimeZone, deviceTimeZone, sameOffsetNow } from '../services/timeZones';
import { Share2 } from 'lucide-react';

const Index = () => {
  // Location lives in the URL (?place=…&lat=…&lon=…) so the page is always a shareable link
  const { location: userLocation, setLocation, resolving, timeMode, setTimeMode } = useSharedLocation();

  // Use Berlin as default until a location is chosen
  const currentLocation = userLocation || getDefaultLocation();
  const currentLabel = userLocation?.label;

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

  const passes = useMemo(() => {
    if (!tle) return [];
    return predictPasses(tle, currentLocation.lat, currentLocation.lon);
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

  const handleShare = async () => {
    const result = await shareCurrentLink(currentLabel);
    if (result === 'copied') {
      toast({ title: "Link copied", description: "Paste it into a message — it opens with this location." });
    } else if (result === 'failed') {
      toast({ title: "Could not share", description: window.location.href });
    }
  };

  return (
    <div className="min-h-screen bg-space-black text-white p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-space-blue mb-2">Stellar ISS Compass</h1>
          <p className="text-lg text-gray-300">Track the International Space Station in real-time</p>
        </header>

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
            <button
              onClick={handleShare}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-space-blue hover:bg-space-accent text-white text-sm font-semibold transition-colors"
            >
              <Share2 className="h-4 w-4" />
              Share link{currentLabel ? ` for ${currentLabel.split(',')[0]}` : ''}
            </button>
          )}
        </div>

        {/* Next Pass (real SGP4 prediction) */}
        {tle && (
          <NextPassCard
            passes={passes}
            placeTimeZone={placeTz}
            placeName={placeName}
            showToggle={showTimeToggle}
            timeMode={timeMode}
            onTimeModeChange={setTimeMode}
          />
        )}

        {/* Compass Component */}
        {issLocation && currentLocation && (
          <Compass
            userLocation={currentLocation}
            issLocation={issLocation}
          />
        )}

        {/* ISS view / Globe */}
        <OrbitView
          tle={tle}
          userLocation={currentLocation}
          fallbackPosition={issLocation ?? null}
        />

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
