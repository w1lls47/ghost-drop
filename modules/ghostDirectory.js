/**
 * THE GHOST DIRECTORY (The Storage)
 * -----------------------------------
 * Owns all on-disk state for a Ghost-Drop session. Nothing in this file
 * ever asks the user where to save — it dictates the location, inside the
 * OS's own temp directory, and nothing else in the app is allowed to know
 * or care about the real path.
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PREFIX = 'GhostDrop_';

let currentSessionDir = null;

function tempRoot() {
  return os.tmpdir(); // %TEMP% on Windows, $TMPDIR on macOS/Linux
}

function generateRunId() {
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * FAILSAFE — run before anything else on every launch.
 * Sweeps the OS temp root for any GhostDrop_* folder left behind by a
 * previous crash or force-kill (where the normal exit hook never fired)
 * and deletes it. Zero footprint is non-negotiable, even across crashes.
 */
async function purgeOrphans() {
  const root = tempRoot();
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return; // can't read temp root — nothing we can do, fail silent
  }

  const orphans = entries.filter((e) => e.isDirectory() && e.name.startsWith(PREFIX));

  await Promise.all(
    orphans.map((e) =>
      fs.rm(path.join(root, e.name), { recursive: true, force: true }).catch(() => {})
    )
  );
}

/** Creates this run's hidden subfolder: %TEMP%\GhostDrop_<runId> */
async function initSession() {
  const dir = path.join(tempRoot(), `${PREFIX}${generateRunId()}`);
  await fs.mkdir(dir, { recursive: true });
  currentSessionDir = dir;
  return dir;
}

/**
 * Asynchronous, silent copy from wherever the source file actually lives
 * (browser download cache, Explorer, Finder, anywhere) into the Ghost
 * Directory. Returns the new cached path. Never overwrites — collisions
 * get a "(1)", "(2)"... suffix like a normal OS copy would.
 */
async function copyFileIn(sourcePath) {
  if (!currentSessionDir) throw new Error('Ghost Directory session not initialized');

  const baseName = path.basename(sourcePath);
  let destName = baseName;
  let destPath = path.join(currentSessionDir, destName);
  let counter = 1;

  while (fsSync.existsSync(destPath)) {
    const ext = path.extname(baseName);
    const stem = path.basename(baseName, ext);
    destName = `${stem} (${counter})${ext}`;
    destPath = path.join(currentSessionDir, destName);
    counter += 1;
  }

  await fs.copyFile(sourcePath, destPath);
  return destPath;
}

function getSessionDir() {
  return currentSessionDir;
}

module.exports = { purgeOrphans, initSession, copyFileIn, getSessionDir, PREFIX };
