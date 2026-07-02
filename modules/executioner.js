/**
 * THE EXECUTIONER (The Purge)
 * ----------------------------
 * Arms exit hooks that guarantee the session temp directory is wiped
 * when the app closes. The permanent shelf (%APPDATA%\Ghost-Drop\Shelf\)
 * is intentionally NOT touched here — that storage outlives sessions by
 * design so Premiere references stay valid. The 30-day sweep in
 * ghostDirectory.sweepOldShelfFiles() handles shelf cleanup instead.
 *
 * Session dir is set after initSession() resolves via setSessionDir().
 * Hooks are armed immediately on bootstrap so even a very fast quit
 * (before initSession finishes) is still caught.
 */

const fs = require('fs');

let _sessionDir = null;
let _purged = false;

function setSessionDir(dir) {
  _sessionDir = dir;
}

function armExitHooks(app) {
  const purgeNow = () => {
    if (_purged) return;
    _purged = true;
    if (!_sessionDir) return;
    try {
      fs.rmSync(_sessionDir, { recursive: true, force: true });
    } catch {
      // Failsafe: purgeOrphans() on next launch catches anything that slips through
    }
  };

  app.on('before-quit', purgeNow);
  app.on('will-quit', purgeNow);
  process.on('exit', purgeNow);
  process.on('SIGINT',  () => { purgeNow(); process.exit(0); });
  process.on('SIGTERM', () => { purgeNow(); process.exit(0); });
}

module.exports = { armExitHooks, setSessionDir };
