// Electron main process — turns the existing local web app (Express server +
// built React client) into a native desktop window. No app logic lives here;
// this just starts the same server/src/index.js used by `npm start`, points
// its data directory at a proper per-user app-data folder instead of a
// folder next to the installed code, and opens a window at it.

const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const PORT = 51247; // arbitrary, unlikely to collide with anything else running locally
const SERVER_URL = `http://localhost:${PORT}`;

app.setName("Ocho AI"); // otherwise userData defaults to package.json's "name" in dev vs "productName" once packaged — keep them the same folder

let mainWindow = null;

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  try {
    require("dotenv").config({ path: envPath });
  } catch (err) {
    console.error("Failed to read", envPath, err);
  }
}

async function startServer() {
  const userDataDir = app.getPath("userData");
  const dataDir = path.join(userDataDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  // Christie/Jack drop an ANTHROPIC_API_KEY (and optionally SMTP settings)
  // into this file once, by hand — it's never bundled into the installer,
  // so an employee's install simply has no key unless one is placed here.
  loadEnvFile(path.join(userDataDir, ".env"));

  process.env.OCHO_DATA_DIR = dataDir;
  process.env.PORT = String(PORT);
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET || readOrCreatePersistedSecret(userDataDir);

  // server/src/index.js is an ES module that starts listening as a side
  // effect of being imported — dynamic import() from this CommonJS file
  // triggers that the same way `node src/index.js` would.
  const serverEntry = path.join(__dirname, "..", "server", "src", "index.js");
  await import(pathToFileURL(serverEntry).href);
}

// A random SESSION_SECRET generated on first run and reused after that —
// desktop installs don't get one from an env var the way a hosted server
// would, but sessions still need a stable secret to stay valid across
// restarts. Stored alongside the rest of this install's data, never shipped
// in the installer itself.
function readOrCreatePersistedSecret(userDataDir) {
  const secretFile = path.join(userDataDir, "session-secret");
  try {
    return fs.readFileSync(secretFile, "utf-8").trim();
  } catch {
    const secret = require("crypto").randomBytes(32).toString("hex");
    fs.writeFileSync(secretFile, secret);
    return secret;
  }
}

// The server binds asynchronously (app.listen's callback), so the window's
// first loadURL can race it — retry briefly instead of guessing a delay.
async function loadWithRetry(win, url, attemptsLeft = 25) {
  try {
    await win.loadURL(url);
  } catch (err) {
    if (attemptsLeft <= 0) throw err;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return loadWithRetry(win, url, attemptsLeft - 1);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "Ocho AI",
    icon: path.join(__dirname, "icon.ico"),
    backgroundColor: "#F5F6FA",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // This app never needs to navigate anywhere but its own local server —
  // block anything else instead of letting a stray link take the window
  // somewhere unexpected. External-looking links open in the real browser.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(SERVER_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  loadWithRetry(mainWindow, SERVER_URL).catch((err) => {
    console.error("Ocho AI server never came up:", err);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // no File/Edit/View bar — this isn't a document editor
  await startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

// ---- auto-update ----
// Checks GitHub Releases (configured under "publish" in package.json) once
// per launch. Downloads silently in the background if there's a newer
// version, then asks once before restarting into it — nobody has to know
// where to find or how to run a new installer themselves. Only runs in a
// packaged build: there's no meaningful "update" to check for while
// developing, and checkForUpdates() errors on an unpackaged app anyway.
if (app.isPackaged) {
  autoUpdater.autoDownload = true;

  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update ready",
      message: `Ocho AI ${info.version} has downloaded and is ready to install.`,
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // Silent by design: no internet, no GitHub release yet, rate-limited —
  // none of that should ever block someone from just using the app.
  autoUpdater.on("error", (err) => {
    console.error("Auto-update check failed:", err);
  });

  app.whenReady().then(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  });
}
