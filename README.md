# Tare

A modern weight tracker that runs in the browser and installs on your phone like an app. Your data stays on your device: no account, no server, no tracking.

It was inspired by the iOS app *Monitor Your Weight* and rebuilt with a cleaner, modern design.

## Features

- **Overview.** A big scale-style reading of your current weight, a ruler from start weight to goal, an "On pace / Behind pace" badge and a trend chart (1M to All).
- **Statistics.** Total change, amount left, average change per day and per week, projected goal date and the weekly rate you need.
- **Calorie calculator:**
  - Resting metabolism, maintenance calories and a daily target for your chosen pace
  - Two formulas: Mifflin–St Jeor (standard) or Katch–McArdle (when you know your body fat)
  - Suggested protein, fat and carbs
  - A table comparing paces (lose up to 1 kg a week, maintain, or gain) with the date you'd reach your goal at each
  - Safety limits: never below 1,200 kcal (women) or 1,500 kcal (men), plus a warning for losing more than 1 % of body weight a week
- **Health estimates.** BMI with category scale, healthy weight range, ideal weight (Devine formula), and body fat from BMI and from tape measurements (US Navy method).
- **Body measurements.** Waist, hips, chest, neck, upper arm and thigh, with trend lines and waist-to-height ratio.
- **History.** Every weigh-in by month. A colored dot shows whether that day was on pace (green), slower (amber) or moved away from the goal (red).
- **Motivation.** Weekly averages that smooth out water swings, daily and weekly logging streaks, and milestones (every 5 kg / 10 lb / 1 st, 25/50/75 % of the goal, reaching the goal, moving into a better BMI category). Logging a weight that reaches a milestone says so.
- **Events.** Mark medication, a holiday, an illness, exercise or a diet change. Each shows on the chart as a band, and History compares the trend before and since.
- **Share your progress.** A picture of your change, trend, pace and latest milestone to save or send. It leaves weights off unless you turn them on, and it is made on your device.
- **Patterns.** Spots plateaus (the trend flat for two weeks or more) and which days of the week you tend to weigh more, and explains both.
- **Quick log.** If you haven't weighed in today, the log form opens by itself when you open Tare (once a day; can be turned off). On an installed app, long-press the icon and choose **Log weight**.
- **Safe with several windows.** Tabs and the installed app stay in sync, so one window can't undo changes made in another.
- **Backup reminder.** A reminder two weeks after you start logging, and again whenever your last backup is 30 days old.
- **PIN lock with encryption.** An optional 4–6 digit PIN, with auto-lock after the app has been in the background. With a PIN, saved data is encrypted (AES-256-GCM, key derived from the PIN with PBKDF2) and can only be opened with it. Downloaded backups are not encrypted.
- **Daily reminder.** A reminder inside the app if you haven't weighed in by your chosen time, plus a calendar file (.ics) with a daily alert for your phone.
- **App icon badge.** On an installed app, the icon can show the weight left to your goal, or a dot until today's weigh-in.
- **English and Czech.** Chosen automatically from the browser, or set under Profile & goal → App settings. Numbers and dates follow the language (84.1 kg / 84,1 kg).
- **Multiple profiles** and **units**: kg, lb, or stones and pounds, with cm or inches.
- **Backup and restore.** A full backup file (.json), plus CSV export for spreadsheets.
- **Import from other apps.** Reads a CSV from almost any weight app, such as Monitor Your Weight. It finds the date and weight columns, the date order and the unit on its own. It can also read an Apple Health export (`export.zip`), even one of several hundred MB. A preview shows what will be added before anything is saved.
- **Installable and offline.** A Progressive Web App you can add to your home screen. It works without internet.
- **Light and dark mode.** Automatic (follows your device) by default, or pick Light or Dark under Profile & goal → App settings → Appearance.

## Development

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install        # once
npm run dev        # local dev server at http://localhost:5173
npm test           # run the unit tests
npm run e2e        # browser tests on the production build (run npm run build first)
npm run build      # production build into dist/
npm run preview    # serve the production build at http://localhost:4173
```

To install it as an app, run `npm run build` and `npm run preview`, open http://localhost:4173 in Chrome or Edge, and choose **Install app**. Offline mode only works from the production build, not from `npm run dev`.

### Project structure

```
src/
  i18n/        translations: en.ts is the reference, cs.ts must cover every key (checked by TypeScript and tests)
  lib/         calculations: units, dates, BMI/body fat, calories, stats, insights, PIN hashing (all unit-tested)
  data/        saved-data format and upgrades (schema.ts), storage, backups, example data
  ui/          screens (views/), chart, entry dialog, small DOM helpers
  app.ts       app state shared by the screens
  main.ts      start-up, navigation, install and update prompts
public/        icons (regenerate with `npm run icons`)
.github/       CI: type-check, tests and build on every push
```

### Browser tests and checks

`npm run e2e` runs Playwright tests in Chromium at desktop and phone size, and in WebKit (Safari's engine) at iPhone size. They cover the main flows, including logging a weight, units, the PIN lock, import, Czech and offline use. A few Chrome-only features (saving backups to a folder, the virtual authenticator for Face ID unlock) are tested in Chromium only. First run `npx playwright install chromium webkit` once, and `npm run build` before each run.

The same command runs the layout check, `scripts/visual-audit.js`, on every screen. It runs at 320, 414, 768 and 1440 px wide, in light and dark mode, in English and Czech. It looks for sideways scrolling, elements off the screen, cut-off or covered text, text drawn across a bar or badge, and contrast below WCAG AA. You can also paste the script into the browser console and run `await tareAudit()`.

On every pull request, GitHub Actions runs the unit tests, the browser tests and Lighthouse. Lighthouse must score 100 for accessibility and at least 90 for best practices. Its report is saved with the run. Dependabot opens weekly pull requests for package and GitHub Actions updates.

**Screenshot tests** (`e2e/screens.spec.ts`) compare each screen with a reference image, at desktop and phone size and in dark mode, with the clock fixed to one day so the example data looks the same every run. Fonts render differently on each operating system, so the references are made on Linux and compared only there; on Windows and macOS these tests are skipped.

- **If a change is meant to look different**, update the references: put `[update screenshots]` in a commit message, or run **Update screenshots** from the Actions tab on your branch. The workflow commits the new images to the branch. Its own commit doesn't start the other checks, so push again (or re-run them) afterwards.
- **When they fail**, the report saved with the run shows the expected image, the actual one, and the difference.

### Adding a language

1. Copy `src/i18n/cs.ts` to a new file (for example `de.ts`) and translate every value. Keep the `{placeholders}` and give plural entries the forms the language needs (`one`, `few`, `many`, `other`).
2. Register it in `DICTS` and `detectLang()` in `src/i18n/index.ts`, add it to `Lang` in `src/data/schema.ts`, and add its name to `LANG_NAMES` in `src/ui/views/settings.ts`.
3. Run `npm test`. The tests check that no key is missing and that placeholders match.

### Data and future sync

- All saved data goes through the `Store` interface in `src/data/storage.ts`. It uses IndexedDB today, falling back to localStorage. A cloud store for accounts and sync can be added later as another `Store`, without changing the screens.
- The saved format has a version number (`SCHEMA_VERSION` in `src/data/schema.ts`). When the format changes, `migrate()` upgrades older data and backup files. Data from the original single-file version of Tare is picked up automatically.
- Every weigh-in has an id and an `updatedAt` time, which a future sync would need to merge devices.
- With a PIN, `createSaver` encrypts before saving (`src/lib/crypto.ts`) and `loadData` returns the encrypted envelope as `locked`; the lock screen decrypts it. Decrypting is the PIN check, so a wrong PIN can never produce data.

## Using Tare on two devices

There's no account or server, so each device keeps its own data. To bring them together, download a backup on one (or let automatic backups save it to a OneDrive, Google Drive or Dropbox folder), then on the other choose **Restore from backup…** and **Merge into what's here**:

- **New things are added:** profiles, weigh-ins and events that aren't on this device yet.
- **The newer copy wins** where both have the same thing (a weigh-in on the same date, the same event, a profile's details).
- **Nothing is deleted.** Something removed on this device but still in the backup comes back, so delete it again after merging.
- **This device keeps** its settings, PIN and language.
- **Undo** takes a merge back for a few seconds afterwards.

Live sync between devices is discussed in issue #19.

## Logging a weight from a link

Opening Tare with `?log=` fills in the entry form; one tap on **Save** logs it. Nothing is saved without that tap, and the link is removed from the address bar afterwards.

| Part | Example | Default |
|---|---|---|
| `log` | `84.2` (a decimal comma works too) | required |
| `unit` | `kg`, `lb` or `st` | the unit chosen in the app |
| `date` | `2026-10-20` (not in the future) | today |
| `note` | `after+a+run` | none |

For example: `https://tare-weight-tracker.pages.dev/?log=84.2`

**Android:** an automation app (for example Tasker), a home-screen shortcut or an NFC tag on the scale can open the link. The installed app and Chrome share their data, so the weigh-in lands in your usual Tare.

**iPhone (Shortcuts and Siri):** make a shortcut with **Ask for Input** (Number, "Weight?"), then **URL** `https://…/?log=` followed by the answer, then **Open URLs**, and name it "Log my weight". Siri then runs it by name. One catch: iOS keeps a Home Screen web app's data separate from Safari's, and Shortcuts opens links in Safari. So this works if you use Tare in Safari, but not with Tare added to the Home Screen.

## Putting it online

Tare is a static site: `npm run build` produces `dist/`, which any static host can serve. It needs HTTPS for the app install, offline mode and the icon shortcut to work, so test those on a real phone only once it's hosted.

**Cloudflare Pages (free, works with a private repository)**

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) and open **Workers & Pages → Create → Pages → Connect to Git**.
2. Allow access to this repository only, then pick it.
3. Build settings: framework preset **None**, build command `npm run build`, output directory `dist`. Under environment variables, add `NODE_VERSION` = `24`.
4. **Save and Deploy.** The site gets an address like `https://tare-weight-tracker.pages.dev`. Every merge into `main` updates it, and every pull request gets its own preview address.

Netlify works the same way: **Add new site → Import an existing project**, with the same build command and `dist` as the publish directory.

Both hosts read `public/_headers`. It sets security headers (no framing, no referrer, no camera or location access) and caching: the built files are kept for a year, while the page and service worker are always checked for a new version. The build also adds a content security policy to the page (`vite.config.ts`). The page may load only its own files, and inline scripts are blocked.

Anyone with the address can open the site, but each person's data stays in their own browser. Nothing is sent to the host.

## Privacy

Tare makes no requests to other servers: no analytics, no ads, and the fonts are part of the app. Entries are stored only in your browser on your device. Clearing browser data deletes them, so use **Profile & goal → Download backup** now and then.

## Fonts

[Bricolage Grotesque](https://github.com/ateliertriay/bricolage), [Figtree](https://github.com/erikdkennedy/figtree) and [Azeret Mono](https://github.com/displaay/azeret), all under the SIL Open Font License 1.1, installed from [Fontsource](https://fontsource.org). Only the Latin and Latin Extended subsets are included (`src/fonts.css`).

## Disclaimer

The BMI, body fat and calorie figures are general estimates, not medical advice.
