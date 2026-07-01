/**
 * PREFERENCES (small, separate from the Ghost Directory on purpose)
 * --------------------------------------------------------------------
 * The Executioner's "zero footprint" promise is specifically about the
 * temp file cache — it has nothing to do with the app remembering whether
 * you've seen the onboarding tutorial. This is a tiny JSON file in
 * Electron's standard per-user app-data folder, the normal place any
 * desktop app stores settings. It gets wiped automatically on uninstall
 * (see the `deleteAppDataOnUninstall` build setting), so it doesn't leave
 * anything behind either.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function prefsPath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function getPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function setTutorialSeen() {
  const prefs = getPrefs();
  prefs.tutorialSeen = true;
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify(prefs));
  } catch {
    // Non-critical — worst case the tutorial just shows again next launch.
  }
}

module.exports = { getPrefs, setTutorialSeen };
