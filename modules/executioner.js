/**
 * THE EXECUTIONER (The Purge)
 * ----------------------------
 * The psychological hook: the user never has to remember to clean up,
 * because this module guarantees the Ghost Directory dies with the app.
 *
 * Multiple hooks are armed because Electron/OS exit paths are not
 * uniform — a graceful Quit, a SIGTERM, and a hard "End Task" from
 * Task Manager all behave differently, and only some of them give you
 * time to run async cleanup. We use a synchronous fs.rmSync everywhere
 * so the purge can complete inside the narrow window every exit path
 * actually gives us. Anything that still slips through (e.g. a SIGKILL
 * that gives zero notice) is mopped up by ghostDirectory.purgeOrphans()
 * the next time the app launches — that failsafe is what makes "zero
 * footprint" a guarantee instead of a best effort.
 */

const fs = require('fs');

function armExitHooks(app, sessionDir) {
  let purged = false;

  const purgeNow = () => {
    if (purged) return;
    purged = true;
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {
      // Best effort. If this failed, the orphan sweep on next launch
      // is the actual guarantee, not this line.
    }
  };

  app.on('before-quit', purgeNow); // normal Quit from the tray
  app.on('will-quit', purgeNow); // belt-and-suspenders, fires right before exit

  process.on('exit', purgeNow); // covers most synchronous shutdown paths
  process.on('SIGINT', () => {
    purgeNow();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    purgeNow();
    process.exit(0);
  });

  return purgeNow;
}

module.exports = { armExitHooks };
