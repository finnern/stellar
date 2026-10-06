export interface GeocodingResult {
  lat: number;
  lon: number;
  /** Short human-readable name of what was found, e.g. "Auckland, New Zealand" */
  label?: string;
  /** True when the input didn't match exactly and we picked the closest place */
  approximate?: boolean;
  error?: string;
}

const BERLIN_COORDS = { lat: 52.52, lon: 13.405 };
export const getDefaultLocation = () => BERLIN_COORDS;

// ---------- text helpers ----------

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Levenshtein edit distance */
const editDistance = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
};

/** 0..1, 1 = identical */
export const similarity = (a: string, b: string): number => {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
};

// ---------- country recognition (English + German + browser language names) ----------

const ISO_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US', 'u s a': 'US', america: 'US', 'united states of america': 'US', amerika: 'US',
  uk: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'great britain': 'GB', britain: 'GB', grossbritannien: 'GB',
  holland: 'NL', schweiz: 'CH', suisse: 'CH', oesterreich: 'AT', osterreich: 'AT', nz: 'NZ', aotearoa: 'NZ',
};

let countryNames: { name: string; code: string }[] | null = null;
const getCountryNames = () => {
  if (countryNames) return countryNames;
  const list: { name: string; code: string }[] = [];
  const langs = Array.from(new Set(['en', 'de', ...(typeof navigator !== 'undefined' ? navigator.languages ?? [] : [])]));
  for (const lang of langs) {
    try {
      const dn = new Intl.DisplayNames([lang], { type: 'region' });
      for (const code of ISO_CODES) {
        const name = dn.of(code);
        if (name && name !== code) list.push({ name: normalize(name), code });
      }
    } catch {
      /* Intl.DisplayNames unsupported for this language */
    }
  }
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) list.push({ name: alias, code });
  countryNames = list;
  return list;
};

/** Best-guess ISO country code for possibly misspelled input ("New Zeland", "Neuseeland", "USA") */
export const guessCountryCode = (input: string): string | undefined => {
  const q = normalize(input);
  if (!q) return undefined;
  if (/^[a-z]{2}$/.test(q) && ISO_CODES.includes(q.toUpperCase())) return q.toUpperCase();
  let best: { code: string; score: number } | undefined;
  for (const { name, code } of getCountryNames()) {
    const score = similarity(q, name);
    if (!best || score > best.score) best = { code, score };
  }
  return best && best.score >= 0.7 ? best.code : undefined;
};

const countryLabel = (code?: string, fallback?: string) => {
  if (code) {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? fallback;
    } catch {
      /* ignore */
    }
  }
  return fallback;
};

// ---------- geocoders ----------

interface Candidate {
  lat: number;
  lon: number;
  name: string;
  countryCode?: string;
  population?: number;
}

const fetchJson = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/** 1. Nominatim (OpenStreetMap) — exact-ish search */
const nominatim = async (q: string): Promise<Candidate[]> => {
  const data = await fetchJson(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=en&q=${encodeURIComponent(q)}`
  );
  if (!Array.isArray(data)) return [];
  return data
    .filter((d) => d && d.lat && d.lon)
    .map((d) => ({
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      name: d.address?.city || d.address?.town || d.address?.village || d.name || String(d.display_name).split(',')[0],
      countryCode: d.address?.country_code?.toUpperCase(),
    }));
};

/** 2. Photon (komoot) — typo-tolerant OpenStreetMap search */
const photon = async (q: string): Promise<Candidate[]> => {
  const data = await fetchJson(`https://photon.komoot.io/api/?limit=10&lang=en&q=${encodeURIComponent(q)}`);
  const features = Array.isArray(data?.features) ? data.features : [];
  return features
    .filter((f: any) => Array.isArray(f?.geometry?.coordinates))
    .map((f: any) => ({
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      name: f.properties?.name ?? '',
      countryCode: f.properties?.countrycode?.toUpperCase(),
      // Prefer real settlements over streets/shops with the same name
      population: f.properties?.osm_key === 'place' ? 1000 : 0,
    }));
};

/** 3. Open-Meteo — places in a given country whose name starts with a short prefix */
const openMeteoInCountry = async (prefix: string, countryCode: string): Promise<Candidate[]> => {
  const data = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?count=100&language=en&format=json&countryCode=${countryCode}&name=${encodeURIComponent(prefix)}`
  );
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((r: any) => ({
    lat: r.latitude,
    lon: r.longitude,
    name: r.name,
    countryCode: r.country_code,
    population: r.population ?? 0,
  }));
};

/** Pick the candidate whose name is closest to what was typed; bigger places win ties. */
const bestMatch = (cands: Candidate[], city: string, countryCode?: string) => {
  let best: { c: Candidate; score: number } | undefined;
  for (const c of cands) {
    if (countryCode && c.countryCode && c.countryCode !== countryCode) continue;
    const score = similarity(city, c.name) + Math.min(0.15, Math.log10((c.population ?? 0) + 1) / 50);
    if (!best || score > best.score) best = { c, score };
  }
  return best;
};

/**
 * Geocode "City, Country" — tolerant of typos.
 * Tries an exact search first, then fuzzy search, then a name search within the guessed country.
 */
export const geocodeLocation = async (input: string): Promise<GeocodingResult> => {
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  const city = parts[0] ?? input;
  const countryText = parts.length > 1 ? parts[parts.length - 1] : '';
  const countryCode = countryText ? guessCountryCode(countryText) : undefined;

  const done = (c: Candidate, approximate: boolean): GeocodingResult => ({
    lat: c.lat,
    lon: c.lon,
    label: [c.name, countryLabel(c.countryCode ?? countryCode, countryText)].filter(Boolean).join(', '),
    approximate,
  });

  // 1. Exact search
  try {
    const hits = await nominatim(input);
    const hit = hits.find((h) => !countryCode || !h.countryCode || h.countryCode === countryCode);
    if (hit) return done(hit, similarity(city, hit.name) < 0.9);
  } catch { /* try next */ }

  // 2. Typo-tolerant search (full text, then city only)
  for (const q of countryText ? [input, city] : [input]) {
    try {
      const best = bestMatch(await photon(q), city, countryCode);
      if (best && best.score >= 0.55) return done(best.c, similarity(city, best.c.name) < 0.9);
    } catch { /* try next */ }
  }

  // 3. Within the guessed country: search by short name prefixes, pick the closest name
  if (countryCode && city.length >= 3) {
    const n = normalize(city).replace(/ /g, '');
    const prefixes = Array.from(new Set([n.slice(0, 3), n.slice(0, 2) + n.slice(3, 4), n.slice(0, 1) + n.slice(2, 4)]))
      .filter((p) => p.length === 3);
    const cands: Candidate[] = [];
    for (const p of prefixes) {
      try { cands.push(...(await openMeteoInCountry(p, countryCode))); } catch { /* ignore */ }
    }
    const best = bestMatch(cands, city, countryCode);
    if (best && best.score >= 0.55) return done(best.c, true);
  }

  return { ...BERLIN_COORDS, error: 'Could not find this location.' };
};
