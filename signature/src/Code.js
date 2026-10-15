/**
 * Keeps one line of the Gmail signature up to date with the next visible ISS pass
 * over the Black Forest. Pass prediction is the app's own code (src/services/passPrediction.ts),
 * bundled together with satellite.js into stellar.js as the global `Stellar`.
 *
 * Entry points: updateSignature (run by the hourly trigger), installTrigger (run once).
 */

const OBSERVER = { lat: 48.23, lon: 8.38, heightKm: 0.42 }; // Schramberg, 420 m
const TIME_ZONE = 'Europe/Berlin';
const LOOKAHEAD_DAYS = 10;
const MARKER = 'finnern.com/stellar';
// Opens the app on the globe in fast-forward, so a curious reader sees the ISS fly right away
const LINK_URL = 'https://finnern.com/stellar/?view=globe&speed=60';
const LINK_HREF = LINK_URL.replace(/&/g, '&amp;');
// Besides the main address of the account running the script, these "Send mail as" addresses
// get the line too, if the account has them. Another Google account (e.g. mark@finnern.com as
// its own login) runs the same script under its own authorization and trigger.
const EXTRA_ADDRESSES = ['finnern@gmail.com', 'mark@finnern.com'];

const TLE_KEY = 'tle';
const TLE_ATTEMPT_KEY = 'tleLastAttempt';
const DAY_MS = 24 * 60 * 60 * 1000;
// Older orbit data than this is too inaccurate to announce a pass time
const TLE_MAX_AGE_MS = 7 * DAY_MS;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Hourly trigger target. Each address is updated on its own; on any error a signature is left
 * as it is, and the run fails at the end so Google's trigger failure digest reports it.
 */
function updateSignature() {
  let line;
  try {
    line = signatureLine(nextVisiblePassStart(new Date()));
  } catch (err) {
    logError('No signature changed', err);
    throw err;
  }

  const failed = [];
  for (const address of signatureAddresses()) {
    try {
      updateAddress(address, line);
    } catch (err) {
      logError(address + ': signature not changed', err);
      failed.push(address);
    }
  }
  if (failed.length) throw new Error('Signature update failed for ' + failed.join(', '));
  return line.text;
}

/** The account's main address plus any of EXTRA_ADDRESSES it can send as. */
function signatureAddresses() {
  const sendAs = Gmail.Users.Settings.SendAs.list('me').sendAs || [];
  return sendAs
    .filter((s) => s.isPrimary || EXTRA_ADDRESSES.indexOf(s.sendAsEmail.toLowerCase()) !== -1)
    .map((s) => s.sendAsEmail);
}

function updateAddress(address, line) {
  const sendAs = Gmail.Users.Settings.SendAs.get('me', address);
  const updated = replaceStellarLine(sendAs.signature || '', line);
  if (updated === null) {
    console.log(address + ': unchanged: ' + line.text);
    return;
  }
  Gmail.Users.Settings.SendAs.patch({ signature: updated }, 'me', address);
  console.log(address + ': updated: ' + line.text);
}

function logError(message, err) {
  console.error(message + ': ' + (err && err.stack ? err.stack : err));
}

/** Run once: replaces any existing updateSignature triggers with a single hourly one. */
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'updateSignature')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('updateSignature').timeBased().everyHours(1).create();
  console.log('Hourly trigger installed');
}

/** Start time of the next visible pass within LOOKAHEAD_DAYS, or null if there is none. */
function nextVisiblePassStart(now) {
  // Start the scan a little early so a pass already in progress gets its real start time
  // and is then skipped, instead of being reported as starting "now"
  const scanFrom = new Date(now.getTime() - 20 * 60 * 1000);
  const passes = Stellar.predictPasses(getTle(now), OBSERVER.lat, OBSERVER.lon, scanFrom, {
    lookaheadHours: LOOKAHEAD_DAYS * 24 + 1,
    heightKm: OBSERVER.heightKm,
  });
  const until = now.getTime() + LOOKAHEAD_DAYS * DAY_MS;
  const upcoming = passes.filter(
    (p) => p.startTime.getTime() >= now.getTime() && p.startTime.getTime() <= until
  );
  const next = Stellar.nextVisiblePass(upcoming);
  return next ? next.startTime : null;
}

/** Orbit data from the cache, refreshed at most once a day; falls back to the cache if a fetch fails. */
function getTle(now) {
  const props = PropertiesService.getScriptProperties();
  const cachedJson = props.getProperty(TLE_KEY);
  const cached = cachedJson ? JSON.parse(cachedJson) : null;
  const lastAttempt = Number(props.getProperty(TLE_ATTEMPT_KEY) || 0);

  if (!cached || now.getTime() - lastAttempt >= DAY_MS) {
    props.setProperty(TLE_ATTEMPT_KEY, String(now.getTime()));
    try {
      const fresh = fetchTle(now);
      props.setProperty(TLE_KEY, JSON.stringify(fresh));
      return fresh;
    } catch (err) {
      console.warn('Orbit data fetch failed, using cache: ' + err);
      if (!cached) throw err;
    }
  }
  if (now.getTime() - cached.fetchedAt > TLE_MAX_AGE_MS) {
    throw new Error('Cached orbit data is older than 7 days');
  }
  return cached;
}

/** Same sources as the app's fetchTLE: wheretheiss.at, CelesTrak as fallback. */
function fetchTle(now) {
  try {
    const res = UrlFetchApp.fetch('https://api.wheretheiss.at/v1/satellites/25544/tles', {
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      if (typeof data.line1 === 'string' && typeof data.line2 === 'string') {
        return { line1: data.line1, line2: data.line2, fetchedAt: now.getTime() };
      }
    }
  } catch (err) {
    console.warn('wheretheiss.at failed: ' + err);
  }
  const res = UrlFetchApp.fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', {
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Could not fetch ISS orbit data');
  const lines = res.getContentText().trim().split('\n').map((l) => l.trim());
  const line1 = lines.find((l) => l.startsWith('1 '));
  const line2 = lines.find((l) => l.startsWith('2 '));
  if (!line1 || !line2) throw new Error('Could not parse ISS orbit data');
  return { line1, line2, fetchedAt: now.getTime() };
}

/**
 * The signature lines as plain text (for comparing and logging) and as HTML: a linked heading,
 * then the pass time on the next line. Without a pass it is one linked question.
 */
function signatureLine(passStart) {
  const link = (label) => '<a href="' + LINK_HREF + '">' + escapeHtml(label) + '</a>';
  if (!passStart) {
    const question = 'When can you see the International Space Station (ISS) from where you are?';
    return {
      text: question + ' → ' + MARKER,
      html: link(question) + ' → ' + link(MARKER),
    };
  }
  const heading = 'Next visible International Space Station (ISS) pass over the Black Forest:';
  const detail = formatBerlin(passStart) + '. Where is it right now, seen from your place? → ';
  return {
    text: heading + ' ' + detail + MARKER,
    html: link(heading) + '<br>' + escapeHtml(detail) + link(MARKER),
  };
}

/** "Fri, 16 Oct 2026, 7:28 am (CEST)", independent of the script's locale. */
function formatBerlin(date) {
  const [y, mon, d, dow, h, min, offset] = Utilities.formatDate(date, TIME_ZONE, 'yyyy|M|d|u|H|mm|Z').split('|');
  const hour = Number(h);
  const zone = offset === '+0200' ? 'CEST' : offset === '+0100' ? 'CET' : 'UTC' + offset;
  return (
    WEEKDAYS[Number(dow) - 1] + ', ' + d + ' ' + MONTHS[Number(mon) - 1] + ' ' + y + ', ' +
    (hour % 12 || 12) + ':' + min + ' ' + (hour < 12 ? 'am' : 'pm') + ' (' + zone + ')'
  );
}

// Line boundaries in Gmail signature HTML: <br> and <div> open/close tags
const LINE_BREAK = /(<br\s*\/?>|<\/?div\b[^>]*>)/i;

/**
 * Replaces the lines containing MARKER (in text or link, from the first to the last of them)
 * with line.html, or appends it if there are none, leaving all other HTML untouched.
 * Returns null when the lines already read the same and link to LINK_URL.
 */
function replaceStellarLine(signature, line) {
  const parts = signature.split(new RegExp(LINE_BREAK.source, 'gi'));
  // split with a capture group: even indexes are line contents, odd ones the separators
  const hits = [];
  parts.forEach((p, i) => {
    if (i % 2 === 0 && p.indexOf(MARKER) !== -1) hits.push(i);
  });

  if (!hits.length) {
    if (signature.trim() === '') return line.html;
    if (/<\/div>\s*$/i.test(signature)) return signature + '<div>' + line.html + '</div>';
    return signature + '<br>' + line.html;
  }
  const first = hits[0];
  const last = hits[hits.length - 1];
  const existing = parts.slice(first, last + 1).join('');
  const linksOk = existing.indexOf(LINK_HREF) !== -1 || existing.indexOf(LINK_URL) !== -1;
  if (linksOk && htmlToText(existing) === line.text) return null;
  parts.splice(first, last - first + 1, line.html);
  return parts.join('');
}

function htmlToText(html) {
  return html
    .replace(new RegExp(LINE_BREAK.source, 'gi'), ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rarr;/g, '→')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
