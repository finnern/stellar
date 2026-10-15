# ISS pass in the Gmail signature

An Apps Script that runs hourly and keeps two lines of the Gmail signature current:

> [Next visible International Space Station (ISS) pass over the Black Forest:](https://finnern.com/stellar/?view=globe&speed=60)
> Fri, 16 Oct 2026, 7:12 am (CEST). Where is it right now, seen from your place? → [finnern.com/stellar](https://finnern.com/stellar/?view=globe&speed=60)

Both links open the app on the globe in 60× fast-forward (`?view=globe&speed=60`), so a curious
reader sees the ISS fly right away. If there is no visible pass in the next 10 days, it is one line:
"When can you see the International Space Station (ISS) from where you are? → finnern.com/stellar".

- Observer: Schramberg, 48.23 N, 8.38 E, 420 m.
- Pass prediction is the app's own `src/services/passPrediction.ts` (SGP4 via satellite.js), bundled into
  `build/stellar.js`, so the orbit source and visibility rules match the app: ISS sunlit, sun below −6° at
  the observer, peak elevation ≥ 10°. The time shown is when the pass starts (same as the app).
- Orbit data (wheretheiss.at, CelesTrak fallback) is fetched at most once a day and cached in Script
  Properties. If a fetch fails, the cache is used for up to 7 days.
- Signatures updated: the main address of the Google account that runs the script, plus
  `finnern@gmail.com` / `mark@finnern.com` where they are "Send mail as" addresses of it
  (`EXTRA_ADDRESSES` in `src/Code.js`). Each is handled on its own. A separate Google account
  (mark@finnern.com logs in on its own) gets its line by running the same project under its own
  login, see "Second Google account" below.
- Only the lines linking to or containing `finnern.com/stellar` are replaced (appended if missing);
  everything else in the signature is left as you wrote it in Gmail. Gmail is written only when the
  text changes.
- On any error the signature stays as it is; the error is logged and the run is marked failed.

## Files

- `src/Code.js`: the script (`updateSignature`, `installTrigger`)
- `src/appsscript.json`: manifest with the Gmail advanced service and scopes
- `build.mjs`: bundles the pass prediction and assembles `build/` (what clasp pushes)
- `test/dryrun.mjs`: runs the built script in Node with stand-in Google services and live orbit data

## One-time setup

Run the commands from the repo root unless noted. They need Node.js 20+ (`node -v`); if it is missing,
install the LTS `.pkg` from https://nodejs.org. Then run `npm ci`.

1. **Enable the Apps Script API** for your account: open https://script.google.com/home/usersettings and
   switch on "Google Apps Script API".
2. **Log in clasp:**
   `cd signature && npx @google/clasp@2.4.2 login`
   A browser window opens; sign in with the Gmail account whose signature should change and allow access.
3. **Create the Apps Script project** (still in `signature/`):
   `npx @google/clasp@2.4.2 create --type standalone --title "ISS Gmail signature" --rootDir build`
   This writes `signature/.clasp.json` with the new script ID (safe to commit).
4. **Build and push** (back in the repo root):
   `cd .. && npm run signature:push`
   Confirm that the files `appsscript`, `Code` and `stellar` are listed as pushed.
5. **Open the editor:** `cd signature && npx @google/clasp@2.4.2 open`
6. **Authorize and run once:** in the editor, choose `updateSignature` in the function dropdown and click
   **Run**. Google asks for permissions: Review permissions → choose your account → "Google hasn't
   verified this app" → Advanced → Go to ISS Gmail signature (unsafe) → Allow. (It is your own script.)
   The execution log shows `finnern@gmail.com: updated: Next visible ISS pass …` (and the same for
   mark@finnern.com). Check Gmail → Settings → General
   → Signature (both addresses) to see the line.
7. **Create the hourly trigger:** choose `installTrigger` in the dropdown and click **Run**. Under
   Triggers (clock icon) you should now see one `updateSignature` trigger, time-driven, every hour.

### Second Google account

Triggers run as the account that installed them, so the same project serves another account:

1. In the editor (as finnern@gmail.com) click **Share** (person icon, top right) and add
   `mark@finnern.com` as Editor.
2. In a browser window signed in as mark@finnern.com, open the project
   (https://script.google.com/home → Shared with me → ISS Gmail signature).
3. Run `updateSignature` and allow the permissions as in step 6, then run `installTrigger`.
   Each account sees and manages only its own trigger.

If mark@finnern.com is a Google Workspace account whose admin blocks unverified apps, step 3
shows an error instead of the permission screen; then that account cannot use the script.

After changing `src/` or the app's pass prediction, run `npm run signature:push` again.

## Dry run without Google

`npm run signature:build && node signature/test/dryrun.mjs` prints the line for the next visible pass and
checks the signature line replacement on sample signatures.
