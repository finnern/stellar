import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { geocodeLocation } from '@/services/geocoding';
import { toast } from "@/hooks/use-toast";
import { cityInputSchema } from "@/utils/securitySchemas";

interface CityInputProps {
  onLocationSubmit: (lat: number, lon: number, label?: string) => void;
  /** Pre-fill, e.g. the place from a shared link */
  initialValue?: string;
}

const CityInput = ({ onLocationSubmit, initialValue }: CityInputProps) => {
  const [cityCountry, setCityCountry] = useState(initialValue || 'Berlin, Germany');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialValue) setCityCountry(initialValue);
  }, [initialValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Keep letters of any alphabet (ü, é, ā …), digits and basic punctuation
    let sanitizedInput = cityCountry.trim().replace(/[^\p{L}\p{M}0-9\s,\-'.()]/gu, "");
    if (sanitizedInput.length > 100) sanitizedInput = sanitizedInput.slice(0, 100);

    const validationResult = cityInputSchema.safeParse(sanitizedInput);
    if (!validationResult.success) {
      toast({
        title: "Invalid Input",
        description: validationResult.error.issues[0].message,
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await geocodeLocation(sanitizedInput);

      if (result.error) {
        toast({
          title: "Location not found",
          description: "Try the format “City, Country”, e.g. “Auckland, New Zealand”.",
        });
        return;
      }

      const label = result.label || sanitizedInput;
      setCityCountry(label);
      onLocationSubmit(result.lat, result.lon, label);
      if (result.approximate) {
        toast({
          title: `Did you mean ${label}?`,
          description: `Closest match for “${sanitizedInput}”.`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "There was a problem looking up this location.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="text"
        placeholder="City, Country (e.g. Auckland, New Zealand)"
        value={cityCountry}
        onChange={(e) => setCityCountry(e.target.value)}
        className="bg-space-purple/50 border-space-blue/30 text-white"
      />
      <Button
        type="submit"
        className="w-full bg-space-blue hover:bg-space-accent transition-colors"
        disabled={isLoading}
      >
        {isLoading ? "Searching…" : "Track ISS"}
      </Button>
    </form>
  );
};

export default CityInput;
