# Tare

A modern weight tracker that runs in the browser. It's one HTML file with no build step and no server, and your data never leaves your device.

It was inspired by the iOS app *Monitor Your Weight* and rebuilt with a cleaner, modern design.

## Features

- **Multiple profiles.** Track yourself, family members, or separate stages of a bigger goal.
- **Goal tracking.** A progress ruler from your start weight to your goal, a pace check ("On pace", "Behind pace"), a projected goal date and the weekly rate you need.
- **Trend chart.** Daily weigh-ins plus a smoothed trend line, a goal line, hover details, and 1M / 3M / 6M / 1Y / All ranges.
- **Statistics.** Total change, amount left, average change per day and per week, and number of weigh-ins.
- **Health estimates:**
  - BMI with a category scale and the weight needed to reach the next category
  - Healthy weight range (BMI 18.5–24.9)
  - Ideal weight (Devine formula, adjusted for body frame)
  - Body fat from BMI (Deurenberg) and from tape measurements (US Navy method)
  - Daily calories to maintain and to reach your goal (Mifflin–St Jeor)
- **Body measurements.** Waist, hips, chest, neck, upper arm and thigh, each with a sparkline, plus waist-to-height ratio.
- **History.** Every weigh-in grouped by month. A colored dot shows whether that day was on pace (green), slower than planned (amber) or moved away from the goal (red).
- **Units.** Kilograms, pounds, or stones and pounds, with centimeters or inches.
- **Back-dated entries and notes.** Log a weight for any past date and add a note.
- **Export.** Copy all entries as CSV.
- **Light and dark mode.** It follows your system setting.

## Run it

Open `index.html` in any modern browser. That's all.

To host it for free with **GitHub Pages**:

1. Push this repository to GitHub.
2. Open **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**, then pick `main` and `/ (root)`.
4. The site goes live at `https://<your-username>.github.io/<repo-name>/`.

## Data & privacy

Entries are stored in your browser's `localStorage`. There's no account, server or tracking. Clearing your browser data deletes your entries, so use **Profile & goal → Export your data** to keep a backup.

The first visit shows an example profile ("Alex") so you can see how everything works. Remove it with **Remove example**.

## Disclaimer

The BMI, body fat and calorie figures are general estimates, not medical advice.
