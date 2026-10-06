
import { z } from "zod";

// Allow only letters, numbers, spaces, commas and hyphens for city/country
export const cityInputSchema = z.string()
  .max(100, "City, Country must be at most 100 characters.")
  .regex(/^[\p{L}\p{M}0-9\s,\-'.()]{1,100}$/u, "Invalid characters in city/country name.");

// Geocoding API response validator
export const geoResultSchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
});

export const geoApiArraySchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
  })
);

// ISS API response validator
export const issApiSchema = z.object({
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  altitude: z.coerce.number(),
  velocity: z.coerce.number(),
  visibility: z.string(),
  timestamp: z.coerce.number(),
});
