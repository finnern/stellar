// Runs build/stellar.js + build/Code.js in Node with stand-ins for the Apps Script services.
// Fetches live orbit data, prints the signature line, and checks the signature line replacement.
// Usage: npm run signature:build && node signature/test/dryrun.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const build = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');

// UrlFetchApp is synchronous; fetch both sources up front
const responses = {};
for (const url of [
  'https://api.wheretheiss.at/v1/satellites/25544/tles',
  'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
]) {
  try {
    const r = await fetch(url);
    responses[url] = { code: r.status, text: await r.text() };
  } catch (e) {
    responses[url] = { code: 599, text: String(e) };
  }
}

const props = new Map();
const fetched = [];
// Signatures by address, as the stand-in Gmail stores them
const signatures = {};
const patches = [];
let primary = 'finnern@gmail.com';

const formatDate = (date, tz, pattern) => {
  assert.equal(pattern, 'yyyy|M|d|u|H|mm|Z');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
      hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  const offset = parts.timeZoneName.replace('GMT', '').replace(':', '') || '+0000';
  return [parts.year, parts.month, parts.day, dow, Number(parts.hour), parts.minute, offset].join('|');
};

const context = vm.createContext({
  console,
  Utilities: { formatDate },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => props.set(k, v),
    }),
  },
  UrlFetchApp: {
    fetch: (url) => {
      fetched.push(url);
      const r = responses[url];
      return { getResponseCode: () => r.code, getContentText: () => r.text };
    },
  },
  Gmail: {
    Users: {
      Settings: {
        SendAs: {
          list: (user) => {
            assert.equal(user, 'me');
            return {
              sendAs: [primary, 'other@example.com', ...Object.keys(signatures).filter((a) => a !== primary)]
                .filter((a) => a in signatures || a === 'other@example.com')
                .map((a) => ({ sendAsEmail: a, isPrimary: a === primary })),
            };
          },
          get: (user, email) => {
            assert.equal(user, 'me');
            if (!(email in signatures)) throw new Error('Invalid send-as address ' + email);
            return { sendAsEmail: email, signature: signatures[email] };
          },
          patch: (resource, user, email) => {
            assert.equal(user, 'me');
            if (email === 'broken@example.com') throw new Error('patch failed');
            patches.push(email);
            signatures[email] = resource.signature;
          },
        },
      },
    },
  },
});
for (const f of ['stellar.js', 'Code.js']) {
  vm.runInContext(readFileSync(join(build, f), 'utf8'), context, { filename: f });
}
const run = (code) => vm.runInContext(code, context);

// --- Live run ---------------------------------------------------------------------------------
const gmailSig = '<div dir="ltr">Mark Finnern<div><br></div><div>+49 123 456</div></div>';
signatures['finnern@gmail.com'] = gmailSig;
signatures['mark@finnern.com'] = '';
const t0 = Date.now();
const text = run('updateSignature()');
console.log(`\nLine (${Date.now() - t0} ms):\n  ${text}\n`);
console.log('finnern@gmail.com signature HTML after first run:\n  ' + signatures['finnern@gmail.com'] + '\n');
assert.deepEqual(patches, ['finnern@gmail.com', 'mark@finnern.com'], 'first run writes both');
assert.ok(signatures['finnern@gmail.com'].startsWith(gmailSig));
assert.ok(signatures['mark@finnern.com'].endsWith('finnern.com/stellar</b></a>'));

run('updateSignature()');
assert.equal(patches.length, 2, 'second run with the same pass does not write');
assert.equal(fetched.length, 1, 'orbit data fetched once, then cached');

// mark@finnern.com not a send-as address of this account: only the main address is updated
delete signatures['mark@finnern.com'];
signatures['finnern@gmail.com'] = gmailSig;
run('updateSignature()');
assert.equal(patches.at(-1), 'finnern@gmail.com');
assert.ok(signatures['finnern@gmail.com'].startsWith(gmailSig));
assert.ok(!('other@example.com' in signatures), 'unlisted send-as addresses are left alone');

// Run by another account (its own login): its main address is updated
primary = 'mark@work.example';
signatures[primary] = 'Mark';
run('updateSignature()');
assert.equal(patches.at(-1), primary);

// One address failing: the other is still updated, the run fails, nothing is blanked
primary = 'finnern@gmail.com';
signatures['broken@example.com'] = 'x';
run("EXTRA_ADDRESSES.push('broken@example.com')");
signatures['finnern@gmail.com'] = gmailSig;
assert.throws(() => run('updateSignature()'), /broken@example.com/);
assert.equal(patches.at(-1), 'finnern@gmail.com');
assert.ok(signatures['finnern@gmail.com'].startsWith(gmailSig));

// --- Line replacement and formatting ------------------------------------------------------------
const line = run('signatureLine(new Date("2026-10-16T05:28:00Z"))');
assert.equal(
  line.text,
  '🛰️ Next visible International Space Station (ISS) pass over the Black Forest: Fri, 16 Oct 2026, 7:28 am (CEST). ' +
    'Where is it right now, seen from your place? → finnern.com/stellar'
);
const href = '<a href="https://finnern.com/stellar/?view=globe&amp;speed=60">';
assert.equal(
  line.html,
  '🛰️ ' + href + '<b>Next visible International Space Station (ISS) pass over the Black Forest:</b></a><br>' +
    'Fri, 16 Oct 2026, 7:28 am (CEST). Where is it right now, seen from your place? → ' +
    href + '<b>finnern.com/stellar</b></a>'
);
assert.match(run('signatureLine(new Date("2026-12-24T17:05:00Z")).text'), /: Thu, 24 Dec 2026, 6:05 pm \(CET\)\. /);
assert.equal(
  run('signatureLine(null).text'),
  '🛰️ When can you see the International Space Station (ISS) from where you are? → finnern.com/stellar'
);

context.line = line;
const replace = (sig) => run(`replaceStellarLine(${JSON.stringify(sig)}, line)`);
const L = line.html;
const old = 'Next visible ISS pass: Mon, 1 Jan 2026 → <a href="https://finnern.com/stellar/">finnern.com/stellar</a>';
const cases = [
  ['', L],
  ['Mark', 'Mark<br>' + L],
  ['<div dir="ltr">Mark</div>', '<div dir="ltr">Mark</div><div>' + L + '</div>'],
  [`<div dir="ltr">Mark<div>${old}</div><div>Tel</div></div>`, `<div dir="ltr">Mark<div>${L}</div><div>Tel</div></div>`],
  [`Mark<br>${old}<br>Tel`, `Mark<br>${L}<br>Tel`],
  [`<div><span style="color:#555">${old}</span></div>`, `<div>${L}</div>`],
  [`Mark<div>${L}</div>`, null],
  [`Mark<div>${L.replace('→', '&rarr;')}</div>`, null],
  // Gmail may store the link with a raw &
  [`Mark<div>${L.replaceAll('&amp;', '&')}</div>`, null],
  // The previous two-line version (heading and detail lines) is replaced as a whole
  [`Mark<div>${L.replace('<br>', '</div><div>')}</div><div>Tel</div>`.replace('ISS) pass', 'ISS) old pass'),
    `Mark<div>${L}</div><div>Tel</div>`],
  // Old one-line version with the plain link is updated
  [`Mark<div>${L.replace(/\?view=globe&amp;speed=60/g, '')}</div>`, `Mark<div>${L}</div>`],
];
for (const [input, expected] of cases) assert.equal(replace(input), expected, input);

console.log('All checks passed');
