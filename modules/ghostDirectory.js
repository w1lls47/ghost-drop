/**
 * THE GHOST DIRECTORY (The Storage) — v1.2.0
 * --------------------------------------------
 * Two distinct storage areas:
 *
 *   PERMANENT SHELF  %APPDATA%\Ghost-Drop\Shelf\
 *     Every file that enters Ghost-Drop lands here. This is what gets
 *     handed to Premiere, Photoshop, etc. on drag-out — so any app that
 *     imports from Ghost-Drop always holds a stable, permanent path that
 *     survives quitting the app, reboots, and anything else. Premiere
 *     will never lose track of an imported file.
 *     Cleanup: files older than 30 days are silently swept on next launch.
 *     Uninstall: deleted automatically by the NSIS uninstaller via
 *     deleteAppDataOnUninstall:true in the build config.
 *
 *   SESSION TEMP  %TEMP%\GhostDrop_<runid>\
 *     Staging area only — used as the download target when fetching a
 *     URL from the browser before we move it to the shelf. Wiped on
 *     every clean exit by the Executioner. Any leftovers from a crash
 *     are swept by purgeOrphans() at the next launch.
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const PREFIX = 'GhostDrop_';
const SHELF_MAX_AGE_DAYS = 30;

let currentSessionDir = null;
let _shelfDir = null;

function tempRoot() {
  return os.tmpdir();
}

// Called lazily — app must be ready before app.getPath() works.
function getShelfDir() {
  if (_shelfDir) return _shelfDir;
  // Require electron lazily so the module can be unit-tested without a full
  // Electron runtime (we mock it in tests).
  const { app } = require('electron');
  _shelfDir = path.join(app.getPath('userData'), 'Shelf');
  return _shelfDir;
}

function generateRunId() {
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Build a unique destination path; if a file with baseName already exists,
// append " (1)", " (2)", etc. — same behavior as Windows Explorer copies.
async function uniquePath(dir, baseName) {
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  let name = baseName;
  let dest = path.join(dir, name);
  let n = 1;
  while (fsSync.existsSync(dest)) {
    name = `${stem} (${n})${ext}`;
    dest = path.join(dir, name);
    n++;
  }
  return dest;
}

// --- STARTUP ROUTINES -------------------------------------------------------

/**
 * Sweep %TEMP% for GhostDrop_* folders left by any previous crash.
 * Zero footprint is a guarantee, not a best effort.
 */
async function purgeOrphans() {
  const root = tempRoot();
  let entries = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return; }
  const orphans = entries.filter(e => e.isDirectory() && e.name.startsWith(PREFIX));
  await Promise.all(orphans.map(e =>
    fs.rm(path.join(root, e.name), { recursive: true, force: true }).catch(() => {})
  ));
}

/**
 * Remove shelf files older than SHELF_MAX_AGE_DAYS days.
 * Runs once on launch, silently, in the background.
 */
async function sweepOldShelfFiles() {
  const shelf = getShelfDir();
  try {
    await fs.mkdir(shelf, { recursive: true });
    const entries = await fs.readdir(shelf, { withFileTypes: true });
    const cutoff = Date.now() - SHELF_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    await Promise.all(entries.map(async e => {
      if (!e.isFile()) return;
      try {
        const stat = await fs.stat(path.join(shelf, e.name));
        if (stat.mtimeMs < cutoff) {
          await fs.rm(path.join(shelf, e.name), { force: true });
        }
      } catch {}
    }));
  } catch {}
}

/**
 * Create this run's temp session directory.
 * Also ensures the shelf directory exists.
 */
async function initSession() {
  const shelf = getShelfDir();
  await fs.mkdir(shelf, { recursive: true });

  const dir = path.join(tempRoot(), `${PREFIX}${generateRunId()}`);
  await fs.mkdir(dir, { recursive: true });
  currentSessionDir = dir;
  return dir;
}

// --- INBOUND FILE OPERATIONS ------------------------------------------------

/**
 * Copy a local file (from Explorer, Finder, download bar) into the
 * permanent shelf. Returns the new shelf path.
 */
async function copyFileIn(sourcePath) {
  const dest = await uniquePath(getShelfDir(), path.basename(sourcePath));
  await fs.copyFile(sourcePath, dest);
  return dest;
}

/**
 * Fetch a remote URL and save it directly to the permanent shelf.
 * Handles redirects (up to 5), guesses extension from Content-Type if
 * the URL path doesn't have one, and times out after 30 s.
 * Returns the shelf path.
 */
async function fetchUrlToShelf(url, redirectCount = 0) {
  if (redirectCount > 5) throw new Error('Too many redirects');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('Only http/https URLs are supported');
  }

  return new Promise((resolve, reject) => {
    let rawName;
    try {
      rawName = decodeURIComponent(path.basename(new URL(url).pathname)) || 'download';
      // Strip query strings that accidentally ended up in the filename
      rawName = rawName.replace(/\?.*$/, '');
    } catch {
      rawName = 'download';
    }

    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Ghost-Drop/1.2' },
      timeout: 30000,
    }, async (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); // drain
        fetchUrlToShelf(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      // Determine extension from URL or Content-Type header
      let ext = path.extname(rawName);
      if (!ext) {
        const ct = res.headers['content-type'] || '';
        if (ct.includes('image/png'))  ext = '.png';
        else if (ct.includes('image/jpeg')) ext = '.jpg';
        else if (ct.includes('image/gif'))  ext = '.gif';
        else if (ct.includes('image/webp')) ext = '.webp';
        else if (ct.includes('image/svg'))  ext = '.svg';
        else if (ct.includes('image/bmp'))  ext = '.bmp';
        else if (ct.includes('video/mp4'))  ext = '.mp4';
        else if (ct.includes('application/pdf')) ext = '.pdf';
        rawName += ext;
      }

      let dest;
      try {
        dest = await uniquePath(getShelfDir(), rawName);
      } catch (err) {
        res.resume();
        reject(err);
        return;
      }

      const writeStream = fsSync.createWriteStream(dest);
      res.pipe(writeStream);

      writeStream.on('finish', () => {
        writeStream.close();
        resolve(dest);
      });
      writeStream.on('error', err => {
        writeStream.close();
        fs.unlink(dest).catch(() => {});
        reject(err);
      });
      res.on('error', err => {
        writeStream.close();
        fs.unlink(dest).catch(() => {});
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

/**
 * Write a raw buffer (from a browser blob / canvas export) to the shelf.
 * Returns the shelf path.
 */
async function writeBufferToShelf(buffer, fileName) {
  const dest = await uniquePath(getShelfDir(), fileName || 'file');
  await fs.writeFile(dest, Buffer.from(buffer));
  return dest;
}

function getSessionDir() { return currentSessionDir; }

module.exports = {
  purgeOrphans,
  sweepOldShelfFiles,
  initSession,
  copyFileIn,
  fetchUrlToShelf,
  writeBufferToShelf,
  getSessionDir,
  PREFIX,
};
