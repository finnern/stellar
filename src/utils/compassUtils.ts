/**
 * Converts degrees to radians
 */
const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

/**
 * Converts radians to degrees
 */
const toDegrees = (radians: number): number => {
  return radians * (180 / Math.PI);
};

/**
 * Calculates the bearing between two points on Earth
 * @returns Bearing in degrees (0° = North, 90° = East, etc.)
 */
export const calculateBearing = (
  userLat: number,
  userLon: number,
  issLat: number,
  issLon: number
): number => {
  // Convert to radians
  const lat1 = toRadians(userLat);
  const lat2 = toRadians(issLat);
  const dLon = toRadians(issLon - userLon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
           Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  
  let bearing = toDegrees(Math.atan2(y, x));
  bearing = (bearing + 360) % 360; // Normalize to 0-360
  
  return bearing;
};

/**
 * Converts bearing to cardinal direction
 */
export const getCardinalDirection = (bearing: number): string => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16;
  return directions[index];
};

/**
 * Requests device orientation and motion permissions (iOS 13+ requires both)
 */
export const requestOrientationPermission = async (): Promise<boolean> => {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
    try {
      const orientationPermission = await (DeviceOrientationEvent as any).requestPermission();

      // Also request DeviceMotionEvent permission on iOS — some versions
      // require both for webkitCompassHeading to be populated.
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        try {
          await (DeviceMotionEvent as any).requestPermission();
        } catch {
          // Non-critical: continue even if motion permission fails
        }
      }

      return orientationPermission === 'granted';
    } catch (err) {
      console.error('Error requesting device orientation permission:', err);
      return false;
    }
  }
  return true; // Permission not required on this device
};