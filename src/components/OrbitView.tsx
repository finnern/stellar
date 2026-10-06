import { useEffect, useMemo, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoCircle } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world110 from 'world-atlas/countries-110m.json';
import { Crosshair, FastForward } from 'lucide-react';
import type { TLEData } from '../services/passPrediction';
import {
  makeSatrec,
  subPointAt,
  groundTrack,
  headingAt,
  subsolarPoint,
  footprintRadiusDeg,
  issSunlitAt,
  SubPoint,
} from '../services/orbitGeometry';

type Mode = 'iss' | 'globe';

interface OrbitViewProps {
  tle: TLEData | undefined;
  userLocation: { lat: number; lon: number };
  /** Live API position — used only until orbit data (TLE) is loaded */
  fallbackPosition: { latitude: number; longitude: number; altitude: number } | null;
}

interface WorldShapes {
  land: GeoPermissibleObjects;
  borders: GeoPermissibleObjects;
}

const toShapes = (topo: unknown): WorldShapes => {
  const t = topo as Topology<{ land: GeometryCollection; countries: GeometryCollection }>;
  return {
    land: feature(t, t.objects.land) as GeoPermissibleObjects,
    borders: mesh(t, t.objects.countries, (a, b) => a !== b) as GeoPermissibleObjects,
  };
};

const COLORS = {
  space: '#0b0e1a',
  ocean: '#16466e',
  land: '#3f7a57',
  border: 'rgba(200, 230, 210, 0.3)',
  graticule: 'rgba(255, 255, 255, 0.06)',
  night: 'rgba(0, 3, 14, 0.5)',
  pastTrack: '#33c3f0',
  futureTrack: 'rgba(51, 195, 240, 0.55)',
  footprint: 'rgba(51, 195, 240, 0.08)',
  footprintEdge: 'rgba(255, 255, 255, 0.35)',
  user: '#ffb020',
};

const TRACK_MINUTES = 90; // ~one orbit behind and ahead
const FRAME_MS = 33;
const FAST_FORWARD = 60;

const OrbitView = ({ tle, userLocation, fallbackPosition }: OrbitViewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('iss');
  const [follow, setFollow] = useState(true);
  const [fast, setFast] = useState(false);
  const [issLit, setIssLit] = useState<boolean | null>(null);
  const litRef = useRef<boolean | null>(null);

  const satrec = useMemo(() => (tle ? makeSatrec(tle) : null), [tle]);
  const fallbackRef = useRef(fallbackPosition);
  fallbackRef.current = fallbackPosition;

  // Mutable view state shared with the render loop (avoids re-rendering React every frame)
  const view = useRef({
    rotate: [0, 0, 0] as [number, number, number],
    zoom: 1,
    follow: true,
    mode: 'iss' as Mode,
    fast: false,
    simStart: Date.now(),
    realStart: Date.now(),
    shapes: toShapes(world110) as WorldShapes,
    track: { past: [] as [number, number][], future: [] as [number, number][], computedAt: 0 },
  });

  useEffect(() => { view.current.follow = follow; }, [follow]);
  useEffect(() => {
    view.current.mode = mode;
    view.current.zoom = 1;
    setFollow(true);
  }, [mode]);
  useEffect(() => {
    const v = view.current;
    const now = Date.now();
    // Keep simulated time continuous when toggling fast-forward
    const simNow = v.fast ? v.simStart + (now - v.realStart) * FAST_FORWARD : now;
    v.fast = fast;
    v.realStart = now;
    v.simStart = fast ? simNow : now;
    v.track.computedAt = 0;
  }, [fast]);

  // Load detailed coastlines in the background (separate chunk, ~240 KB gzipped)
  useEffect(() => {
    let cancelled = false;
    import('world-atlas/countries-50m.json').then((m) => {
      if (!cancelled) view.current.shapes = toShapes(m.default);
    }).catch(() => { /* keep 110m */ });
    return () => { cancelled = true; };
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    const projection = geoOrthographic().clipAngle(90).precision(0.3);
    const path = geoPath(projection, ctx);
    const graticule = geoGraticule10();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const stars = Array.from({ length: 70 }, (_, i) => ({
      x: ((i * 97.3) % 100) / 100,
      y: ((i * 57.7 + 13) % 100) / 100,
      r: (i % 3) * 0.35 + 0.4,
    }));

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < FRAME_MS) return;
      last = ts;

      const v = view.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const now = v.fast ? new Date(v.simStart + (Date.now() - v.realStart) * FAST_FORWARD) : new Date();

      // Current ISS position
      let iss: SubPoint | null = null;
      let heading = 0;
      let sunlit: boolean | null = null;
      if (satrec) {
        iss = subPointAt(satrec, now);
        heading = headingAt(satrec, now) ?? 0;
        sunlit = issSunlitAt(satrec, now);
        if (sunlit !== null && sunlit !== litRef.current) {
          litRef.current = sunlit;
          setIssLit(sunlit);
        }
        // Recompute track every 20 s of simulated time
        if (Math.abs(now.getTime() - v.track.computedAt) > 20_000) {
          v.track.past = groundTrack(satrec, new Date(now.getTime() - TRACK_MINUTES * 60_000), now);
          v.track.future = groundTrack(satrec, now, new Date(now.getTime() + TRACK_MINUTES * 60_000));
          v.track.computedAt = now.getTime();
        }
      } else if (fallbackRef.current) {
        const f = fallbackRef.current;
        iss = { lat: f.latitude, lon: f.longitude, altKm: f.altitude || 420 };
      }

      // Camera
      const minDim = Math.min(width, height);
      const isIss = v.mode === 'iss';
      // ISS view: about ±22° of arc visible (roughly the astronaut's horizon); globe: whole disk
      const baseScale = isIss ? minDim / (2 * Math.sin((22 * Math.PI) / 180)) : (minDim / 2) * 0.9;
      projection.scale(baseScale * v.zoom).translate([width / 2, height / 2]);

      if (v.follow && iss) {
        const target: [number, number, number] = isIss
          ? [-iss.lon, -iss.lat, heading]
          : [-iss.lon, -Math.sign(userLocation.lat || 1) * 20, 0];
        // Ease toward target (handles longitude wrap-around)
        const ease = 0.18;
        const wrap180 = (d: number) => ((d + 540) % 360) - 180;
        v.rotate = [
          v.rotate[0] + wrap180(target[0] - v.rotate[0]) * ease,
          v.rotate[1] + (target[1] - v.rotate[1]) * ease,
          v.rotate[2] + wrap180(target[2] - v.rotate[2]) * ease,
        ];
      }
      projection.rotate(v.rotate);

      // Background
      ctx.fillStyle = COLORS.space;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ocean + atmosphere glow
      const r = projection.scale();
      const glow = ctx.createRadialGradient(width / 2, height / 2, r * 0.98, width / 2, height / 2, r * 1.08);
      glow.addColorStop(0, 'rgba(80, 170, 255, 0.35)');
      glow.addColorStop(1, 'rgba(80, 170, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, r * 1.08, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fillStyle = COLORS.ocean;
      ctx.fill();

      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = COLORS.graticule;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      ctx.beginPath();
      path(v.shapes.land);
      ctx.fillStyle = COLORS.land;
      ctx.fill();

      ctx.beginPath();
      path(v.shapes.borders);
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Night side: two layers give a soft twilight edge
      const [sunLon, sunLat] = subsolarPoint(now);
      const anti: [number, number] = [sunLon + 180, -sunLat];
      for (const radius of [90, 84]) {
        ctx.beginPath();
        path(geoCircle().center(anti).radius(radius)());
        ctx.fillStyle = COLORS.night;
        ctx.fill();
      }

      // Area from which the ISS is above the horizon right now
      if (iss) {
        ctx.beginPath();
        path(geoCircle().center([iss.lon, iss.lat]).radius(footprintRadiusDeg(iss.altKm))());
        ctx.fillStyle = COLORS.footprint;
        ctx.fill();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = COLORS.footprintEdge;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ground track: solid behind, dashed ahead
      if (v.track.future.length > 1) {
        ctx.beginPath();
        path({ type: 'LineString', coordinates: v.track.future });
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = COLORS.futureTrack;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (v.track.past.length > 1) {
        ctx.beginPath();
        path({ type: 'LineString', coordinates: v.track.past });
        ctx.strokeStyle = COLORS.pastTrack;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // You
      const userXY = projection([userLocation.lon, userLocation.lat]);
      const userVisible = isFront(projection.rotate(), userLocation.lon, userLocation.lat);
      if (userXY && userVisible) {
        ctx.beginPath();
        ctx.arc(userXY[0], userXY[1], 5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.user;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = COLORS.user;
        ctx.fillText('You', userXY[0] + 8, userXY[1] + 4);
      }

      // ISS icon, pointing along its direction of travel
      if (iss && isFront(projection.rotate(), iss.lon, iss.lat)) {
        const xy = projection([iss.lon, iss.lat]);
        if (xy) {
          // Screen angle of travel = heading minus view rotation (gamma)
          const screenAngle = ((heading - projection.rotate()[2]) * Math.PI) / 180;
          drawISS(ctx, xy[0], xy[1], screenAngle, ts, sunlit ?? true);
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [satrec, userLocation.lat, userLocation.lon]);

  // Drag to rotate, pinch / wheel to zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;

    const scaleNow = () => {
      const minDim = Math.min(canvas.clientWidth, canvas.clientHeight);
      const v = view.current;
      const base = v.mode === 'iss' ? minDim / (2 * Math.sin((22 * Math.PI) / 180)) : (minDim / 2) * 0.9;
      return base * v.zoom;
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      const v = view.current;

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) v.zoom = clampZoom(v.zoom * (d / pinchDist), v.mode);
        pinchDist = d;
        return;
      }

      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
      if (v.follow) setFollow(false);
      // Convert the screen drag into the north-up frame (undo the view's gamma rotation)
      const g = (v.rotate[2] * Math.PI) / 180;
      const nx = dx * Math.cos(g) - dy * Math.sin(g);
      const ny = dx * Math.sin(g) + dy * Math.cos(g);
      const k = 180 / (Math.PI * scaleNow());
      // Longitude lines converge toward the poles, so scale the east-west drag by 1/cos(latitude)
      const cosLat = Math.max(0.2, Math.cos((v.rotate[1] * Math.PI) / 180));
      v.rotate = [
        v.rotate[0] + (nx * k) / cosLat,
        Math.max(-89, Math.min(89, v.rotate[1] - ny * k)),
        v.rotate[2],
      ];
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      v.zoom = clampZoom(v.zoom * Math.exp(-e.deltaY * 0.0015), v.mode);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="inline-flex rounded-lg bg-black/30 p-1 text-sm">
          {(['iss', 'globe'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                mode === m ? 'bg-space-blue text-white' : 'text-gray-300'
              }`}
            >
              {m === 'iss' ? 'ISS view' : 'Globe'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFast((f) => !f)}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm ${
            fast ? 'bg-amber-500 text-black' : 'bg-black/30 text-gray-300'
          }`}
          aria-pressed={fast}
        >
          <FastForward className="h-4 w-4" />
          {fast ? '60× speed' : 'Real time'}
        </button>
      </div>

      <div
        ref={wrapRef}
        className="relative w-full rounded-xl overflow-hidden"
        style={{ height: mode === 'iss' ? '62vh' : '52vh', maxHeight: 560, minHeight: 320 }}
      >
        <canvas ref={canvasRef} className="block" style={{ touchAction: 'none' }} />
        {!follow && (
          <button
            onClick={() => setFollow(true)}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-space-blue text-white text-sm shadow-lg"
          >
            <Crosshair className="h-4 w-4" /> Follow ISS
          </button>
        )}
        {issLit !== null && (
          <div className="absolute top-2 right-2 text-[11px] bg-black/40 rounded px-2 py-1 text-gray-200">
            {issLit ? '☀ ISS in sunlight' : '● ISS in Earth’s shadow'}
          </div>
        )}
        {mode === 'iss' && follow && (
          <div className="absolute top-2 left-2 text-[11px] text-gray-300 bg-black/40 rounded px-2 py-1">
            ↑ direction of travel
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-400">
        <span><span className="inline-block w-5 h-0.5 bg-[#33c3f0] align-middle mr-1" />last 90 min</span>
        <span><span className="inline-block w-5 border-t-2 border-dashed border-[#33c3f0]/60 align-middle mr-1" />next 90 min</span>
        <span><span className="inline-block w-3 h-3 rounded-full border border-dashed border-white/50 align-middle mr-1" />ISS above horizon</span>
        <span><span className="inline-block w-3 h-3 bg-[#020410]/80 border border-white/20 align-middle mr-1" />night</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ffb020] align-middle mr-1" />you</span>
      </div>
      {fast && (
        <p className="text-xs text-amber-400 mt-2">
          Fast-forward: the map runs 60× faster than reality. Tap again to return to real time.
        </p>
      )}
    </div>
  );
};

const clampZoom = (z: number, mode: Mode) =>
  mode === 'iss' ? Math.max(0.25, Math.min(6, z)) : Math.max(0.6, Math.min(4, z));

/** True if [lon, lat] is on the visible hemisphere for an orthographic rotation. */
const isFront = (rotate: [number, number, number], lon: number, lat: number) => {
  const toR = Math.PI / 180;
  const λ0 = -rotate[0] * toR;
  const φ0 = -rotate[1] * toR;
  const λ = lon * toR;
  const φ = lat * toR;
  return Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ - λ0) > 0;
};

/**
 * ISS glyph: dark-blue solar arrays with a silver glint sweeping across them, silver modules.
 * Rotated to the direction of travel. In Earth's shadow it is drawn dark, without glint.
 */
const drawISS = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  t: number,
  sunlit: boolean
) => {
  ctx.save();
  ctx.translate(x, y);

  // Soft silver halo when sunlit
  if (sunlit) {
    const halo = ctx.createRadialGradient(0, 0, 3, 0, 0, 26);
    halo.addColorStop(0, 'rgba(225, 235, 255, 0.5)');
    halo.addColorStop(1, 'rgba(225, 235, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.rotate(angle);
  ctx.scale(1.25, 1.25);

  // Solar arrays: four wings either side of the truss (perpendicular to travel)
  const wings = [-15, -9.5, 4.5, 10];
  const wingW = 5;
  const wingH = 16;
  ctx.fillStyle = sunlit ? '#1a3a8a' : '#0b1430';
  for (const wx of wings) ctx.fillRect(wx, -wingH / 2, wingW, wingH);

  // Solar cell grid
  ctx.strokeStyle = sunlit ? 'rgba(120, 160, 255, 0.55)' : 'rgba(60, 80, 140, 0.4)';
  ctx.lineWidth = 0.4;
  for (const wx of wings) {
    ctx.strokeRect(wx, -wingH / 2, wingW, wingH);
    for (let gy = -wingH / 2 + 2; gy < wingH / 2; gy += 2) {
      ctx.beginPath();
      ctx.moveTo(wx, gy);
      ctx.lineTo(wx + wingW, gy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(wx + wingW / 2, -wingH / 2);
    ctx.lineTo(wx + wingW / 2, wingH / 2);
    ctx.stroke();
  }

  // Shimmer: a silver glint sweeps diagonally across the arrays every ~2.4 s
  if (sunlit) {
    const phase = (t % 2400) / 2400;
    const cx = -30 + phase * 60;
    const glint = ctx.createLinearGradient(cx - 7, -9, cx + 7, 9);
    glint.addColorStop(0, 'rgba(235, 242, 255, 0)');
    glint.addColorStop(0.5, 'rgba(235, 242, 255, 0.85)');
    glint.addColorStop(1, 'rgba(235, 242, 255, 0)');
    ctx.save();
    ctx.beginPath();
    for (const wx of wings) ctx.rect(wx, -wingH / 2, wingW, wingH);
    ctx.clip();
    ctx.fillStyle = glint;
    ctx.fillRect(-16, -wingH / 2, 32, wingH);
    ctx.restore();
  }

  // Truss
  const metal = (from: string, to: string) => {
    const g = ctx.createLinearGradient(0, -2, 0, 2);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  };
  ctx.fillStyle = sunlit ? metal('#f4f6fa', '#9aa4b2') : metal('#3a4150', '#22262f');
  ctx.fillRect(-15.5, -0.9, 31, 1.8);

  // Pressurised modules along the direction of travel (up = forward)
  const body = ctx.createLinearGradient(-2.2, 0, 2.2, 0);
  if (sunlit) {
    body.addColorStop(0, '#c9ced6');
    body.addColorStop(0.45, '#ffffff');
    body.addColorStop(1, '#8e97a4');
  } else {
    body.addColorStop(0, '#2a2f38');
    body.addColorStop(1, '#1a1d24');
  }
  ctx.fillStyle = body;
  ctx.fillRect(-2.2, -9, 4.4, 18);
  ctx.fillRect(-4, 3.5, 8, 2.2); // cross module

  // Radiators (small, light grey)
  ctx.fillStyle = sunlit ? 'rgba(230, 232, 238, 0.9)' : 'rgba(80, 85, 95, 0.9)';
  ctx.fillRect(-1.2, -12.5, 2.4, 3);

  // Forward marker
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(-2.5, -13);
  ctx.lineTo(2.5, -13);
  ctx.closePath();
  ctx.fillStyle = '#33c3f0';
  ctx.fill();
  ctx.restore();
};

export default OrbitView;
