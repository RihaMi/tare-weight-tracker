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
- **Multiple profiles** and **units**: kg, lb, or stones and pounds, with cm or inches.
- **Backup and restore.** A full backup file (.json), plus CSV export and import for spreadsheets or data from other apps.
- **Installable and offline.** A Progressive Web App you can add to your home screen. It works without internet.
- **Light and dark mode.** It follows your system setting.

## Development

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install        # once
npm run dev        # local dev server at http://localhost:5173
npm test           # run the tests
npm run build      # production build into dist/
npm run preview    # serve the production build at http://localhost:4173
```

To install it as an app, run `npm run build` and `npm run preview`, open http://localhost:4173 in Chrome or Edge, and choose **Install app**. Offline mode only works from the production build, not from `npm run dev`.

### Project structure

```
src/
  lib/         calculations: units, dates, BMI/body fat, calories, stats (all unit-tested)
  data/        saved-data format and upgrades (schema.ts), storage, backups, example data
  ui/          screens (views/), chart, entry dialog, small DOM helpers
  app.ts       app state shared by the screens
  main.ts      start-up, navigation, install and update prompts
public/        icons (regenerate with `npm run icons`)
.github/       CI: type-check, tests and build on every push
```

### Data and future sync

- All saved data goes through the `Store` interface in `src/data/storage.ts`. It uses IndexedDB today, falling back to localStorage. A cloud store for accounts and sync can be added later as another `Store`, without changing the screens.
- The saved format has a version number (`SCHEMA_VERSION` in `src/data/schema.ts`). When the format changes, `migrate()` upgrades older data and backup files. Data from the original single-file version of Tare is picked up automatically.
- Every weigh-in has an id and an `updatedAt` time, which a future sync would need to merge devices.

## Privacy

Entries are stored only in your browser on your device. Clearing browser data deletes them, so use **Profile & goal → Download backup** now and then.

## Disclaimer

The BMI, body fat and calorie figures are general estimates, not medical advice.
