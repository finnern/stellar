import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import CityInput from './location/CityInput';
import CoordinatesInput from './location/CoordinatesInput';

interface LocationInputProps {
  /** source 'gps' = from the device, rounded before it goes into a shareable link */
  onLocationSubmit: (lat: number, lon: number, label?: string, source?: 'gps') => void;
  currentLocation: { lat: number; lon: number; label?: string };
}

const LocationInput = ({ onLocationSubmit, currentLocation }: LocationInputProps) => {
  const [locating, setLocating] = useState(false);

  const handleUseMyLocation = () => {
    if (!('geolocation' in navigator)) {
      toast({
        title: "Not available",
        description: "Your browser does not support geolocation.",
        variant: "destructive",
      });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onLocationSubmit(position.coords.latitude, position.coords.longitude, undefined, 'gps');
      },
      (err) => {
        setLocating(false);
        toast({
          title: "Could not get location",
          description: err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. You can enter a city or coordinates instead."
            : "Location unavailable. You can enter a city or coordinates instead.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <div className="glass-card p-6">
      <h2 className="text-xl font-bold text-space-blue mb-4">Enter Location</h2>
      <div className="mb-4 text-center">
        <div className="text-gray-400">Current Coordinates:</div>
        <div className="text-lg font-bold">{currentLocation.lat.toFixed(4)}°, {currentLocation.lon.toFixed(4)}°</div>
      </div>
      <Button
        type="button"
        onClick={handleUseMyLocation}
        disabled={locating}
        className="w-full mb-4 bg-space-blue hover:bg-space-accent transition-colors"
      >
        {locating ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <MapPin className="mr-2 h-4 w-4" />
        )}
        {locating ? 'Locating…' : 'Use my location'}
      </Button>
      <Tabs defaultValue="city" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="city">City, Country</TabsTrigger>
          <TabsTrigger value="coordinates">Coordinates</TabsTrigger>
        </TabsList>

        <TabsContent value="city">
          <CityInput onLocationSubmit={onLocationSubmit} initialValue={currentLocation.label} />
        </TabsContent>

        <TabsContent value="coordinates">
          <CoordinatesInput onLocationSubmit={onLocationSubmit} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LocationInput;