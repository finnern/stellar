import { useEffect, useState, useCallback, useRef } from 'react';
import { calculateBearing, getCardinalDirection } from '@/utils/compassUtils';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { drawISS } from '@/lib/drawISS';

// Dial geometry: the needle length and the ISS marker position both derive from NEEDLE_RADIUS
const DIAL_SIZE = 192; // px, matches w-48 / h-48
const RING_WIDTH = 2; // px, border-2 on the dial
const NEEDLE_RADIUS = DIAL_SIZE / 2 - RING_WIDTH / 2; // centre to the middle of the ring
const ISS_ICON_SIZE = 30; // px, visible size of the ISS glyph
const ISS_CANVAS_SIZE = 44; // px, glyph plus its halo
// drawISS's glyph spans about 40 units (forward marker to tail) at its own 1.25 scale
const ISS_GLYPH_SCALE = ISS_ICON_SIZE / 40;

/** The map's ISS glyph, drawn upright and sunlit on a small canvas. */
const IssMarker = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = ISS_CANVAS_SIZE * dpr;
    canvas.height = ISS_CANVAS_SIZE * dpr;
    let raf = 0;
    const draw = (ts: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, ISS_CANVAS_SIZE, ISS_CANVAS_SIZE);
      ctx.translate(ISS_CANVAS_SIZE / 2, ISS_CANVAS_SIZE / 2);
      ctx.scale(ISS_GLYPH_SCALE, ISS_GLYPH_SCALE);
      drawISS(ctx, 0, 0, 0, ts, true);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: ISS_CANVAS_SIZE, height: ISS_CANVAS_SIZE }}
    />
  );
};

interface CompassProps {
  userLocation: { lat: number; lon: number };
  issLocation: { latitude: number; longitude: number };
}

const Compass = ({ userLocation, issLocation }: CompassProps) => {
  const [bearing, setBearing] = useState(0);
  const [deviceOrientation, setDeviceOrientation] = useState(0);
  const [hasOrientationSupport, setHasOrientationSupport] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const listenersAttached = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Check for orientation support on mount
  useEffect(() => {
    const checkOrientationSupport = () => {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        setHasOrientationSupport(true);
        return;
      }
      if ('DeviceOrientationEvent' in window) {
        setHasOrientationSupport(true);
        return;
      }
      setHasOrientationSupport(false);
    };
    checkOrientationSupport();
  }, []);

  // Calculate initial bearing
  useEffect(() => {
    const newBearing = calculateBearing(
      userLocation.lat,
      userLocation.lon,
      issLocation.latitude,
      issLocation.longitude
    );
    setBearing(newBearing);
  }, [userLocation, issLocation]);

  // Attach orientation event listeners (deduplicated via ref)
  const attachListeners = useCallback(() => {
    if (listenersAttached.current) return;
    listenersAttached.current = true;

    console.log("Setting up orientation listeners...");

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const webkitEvent = event as DeviceOrientationEvent & { webkitCompassHeading?: number };

      // Log every 10th event to avoid spam
      if (Math.random() < 0.1) {
        console.log("Orientation event:", {
          alpha: event.alpha,
          webkitCompassHeading: webkitEvent.webkitCompassHeading,
          absolute: event.absolute
        });
      }

      if (typeof webkitEvent.webkitCompassHeading === 'number') {
        // iOS: webkitCompassHeading is degrees from magnetic north
        setDeviceOrientation(webkitEvent.webkitCompassHeading);
      } else if (event.alpha !== null) {
        // Android/other: convert alpha to compass heading
        const heading = event.absolute
          ? (360 - event.alpha) % 360
          : (360 - event.alpha) % 360;
        setDeviceOrientation(heading);
      }
    };

    // Try absolute orientation first (more accurate), fall back to regular
    const supportsAbsolute = 'ondeviceorientationabsolute' in window;
    const eventName = supportsAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';

    console.log(`Using ${eventName} event, supportsAbsolute: ${supportsAbsolute}`);

    window.addEventListener(eventName, handleOrientation as EventListener);

    // Also listen to regular deviceorientation as fallback
    if (supportsAbsolute) {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    toast({
      title: "Orientation Active",
      description: "Rotate your phone to point toward the ISS.",
    });

    cleanupRef.current = () => {
      console.log("Removing orientation listeners");
      window.removeEventListener(eventName, handleOrientation as EventListener);
      if (supportsAbsolute) {
        window.removeEventListener('deviceorientation', handleOrientation);
      }
      listenersAttached.current = false;
    };
  }, []);

  // Request device orientation permission (iOS 13+ requires user gesture)
  const requestPermission = async () => {
    console.log("Requesting orientation permission...");

    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        // iOS 13+: request DeviceOrientationEvent permission
        const orientationPermission = await (DeviceOrientationEvent as any).requestPermission();
        console.log("Orientation permission result:", orientationPermission);

        // iOS also requires DeviceMotionEvent permission for full sensor access.
        // Some iOS versions need both granted for webkitCompassHeading to work.
        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof (DeviceMotionEvent as any).requestPermission === 'function') {
          try {
            const motionPermission = await (DeviceMotionEvent as any).requestPermission();
            console.log("Motion permission result:", motionPermission);
          } catch (motionError) {
            // Continue even if motion permission fails; orientation is the critical one
            console.warn("Motion permission request failed:", motionError);
          }
        }

        if (orientationPermission === 'granted') {
          console.log("Permission granted, attaching listeners in gesture context");
          // Attach listeners immediately within the user gesture call stack.
          // iOS Safari may ignore listeners added outside the gesture that
          // triggered requestPermission().
          attachListeners();
          setPermissionGranted(true);
        } else {
          toast({
            title: "Permission Denied",
            description: "Please enable motion & orientation access in Settings > Safari > Motion & Orientation Access.",
            variant: "destructive",
          });
        }
      } else if ('DeviceOrientationEvent' in window) {
        // Non-iOS browsers: no permission needed
        attachListeners();
        setPermissionGranted(true);
      } else {
        toast({
          title: "Not Supported",
          description: "Your device doesn't support orientation tracking.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error requesting permission:", error);
      toast({
        title: "Permission Error",
        description: "Could not request sensor permissions. Ensure you are using HTTPS and try again.",
        variant: "destructive",
      });
    }
  };

  // Fallback: if permissionGranted was set but listeners weren't attached yet
  // (e.g. hot-reload or state restored), set them up via effect.
  useEffect(() => {
    if (permissionGranted && !listenersAttached.current) {
      attachListeners();
    }
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [permissionGranted, attachListeners]);

  // Calculate the final rotation including device orientation
  const finalRotation = permissionGranted
    ? bearing - deviceOrientation
    : bearing;

  return (
    <div className="glass-card p-6 relative">
      <h2 className="text-xl font-bold text-space-blue mb-4">ISS Direction</h2>
      
      {!permissionGranted && hasOrientationSupport && (
        <Button 
          onClick={requestPermission}
          className="mb-4 bg-space-blue hover:bg-space-accent transition-colors"
        >
          Enable Device Orientation
        </Button>
      )}

      {!hasOrientationSupport && (
        <p className="text-yellow-400 mb-4">
          Your device doesn't support orientation tracking. The compass will show static directions only.
        </p>
      )}

      {/* Vertical margin leaves room for the ISS marker when it sits at the top or bottom of the ring */}
      <div className="relative mx-auto my-6" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
        {/* Compass Rose - rotates to keep N pointing to real north */}
        <div 
          className="absolute inset-0 rounded-full border-2 border-space-blue/30 transition-transform duration-100 ease-out"
          style={{ transform: permissionGranted ? `rotate(${-deviceOrientation}deg)` : 'rotate(0deg)' }}
        >
          {/* Cardinal Directions */}
          {['N', 'E', 'S', 'W'].map((direction) => (
            <div
              key={direction}
              className="absolute text-space-blue font-bold"
              style={{
                top: direction === 'N' ? '0.5rem' : direction === 'S' ? 'calc(100% - 2rem)' : '50%',
                left: direction === 'W' ? '0.5rem' : direction === 'E' ? 'calc(100% - 2rem)' : '50%',
                transform: 'translate(-50%, -50%)'
              }}
            >
              {direction}
            </div>
          ))}
        </div>
          
        {/* Direction Arrow - always points to ISS relative to screen */}
        <div
          className="absolute inset-0 transition-transform duration-100 ease-out pointer-events-none"
          style={{ transform: `rotate(${finalRotation}deg)` }}
        >
          {/* Needle: from the centre up to the ring */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-0.5 bg-space-blue/50"
            style={{ top: DIAL_SIZE / 2 - NEEDLE_RADIUS, height: NEEDLE_RADIUS }}
          />
          {/* ISS marker: centred on the needle tip, counter-rotated to stay upright */}
          <div
            className="absolute transition-transform duration-100 ease-out"
            style={{
              left: DIAL_SIZE / 2 - ISS_CANVAS_SIZE / 2,
              top: DIAL_SIZE / 2 - NEEDLE_RADIUS - ISS_CANVAS_SIZE / 2,
              width: ISS_CANVAS_SIZE,
              height: ISS_CANVAS_SIZE,
              transform: `rotate(${-finalRotation}deg)`,
            }}
          >
            <IssMarker />
          </div>
        </div>
      </div>

      {/* Direction Information */}
      <div className="text-center">
        <p className="text-gray-400">Point phone toward the ISS to face it</p>
        <p className="text-sm text-gray-500">ISS is {getCardinalDirection(bearing)} ({bearing.toFixed(0)}°)</p>
        {permissionGranted && (
          <p className="text-xs text-gray-600">
            Heading: {deviceOrientation.toFixed(0)}°
          </p>
        )}
      </div>
    </div>
  );
};

export default Compass;
