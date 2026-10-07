// Runs after `electron-builder` (no --publish — see git history for why:
// electron-builder's own --publish races two internal publisher instances
// against each other and can split a release's assets across duplicates).
// Uploads this platform's files to the release for the current version,
// creating it if this is the first platform to publish for this tag.
const path = require("path");
const fs = require("fs");
const { version } = require("../package.json");
const { findOrCreateRelease, uploadAsset } = require("./github-release-utils.js");

const TAG = `v${version}`;
const RELEASE_DIR = path.join(__dirname, "..", "release");

// electron-builder's local filenames have spaces ("Ocho AI Setup 1.2.3.exe");
// latest.yml (used as-is, not regenerated here) references the dashed form,
// so uploads must use that exact name for electron-updater to find them.
const ASSETS = [
  { local: `Ocho AI Setup ${version}.exe`, remote: `Ocho-AI-Setup-${version}.exe` },
  { local: `Ocho AI Setup ${version}.exe.blockmap`, remote: `Ocho-AI-Setup-${version}.exe.blockmap` },
  { local: "latest.yml", remote: "latest.yml" },
];

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GH_TOKEN is not set — can't publish.");

  for (const asset of ASSETS) {
    const p = path.join(RELEASE_DIR, asset.local);
    if (!fs.existsSync(p)) {
      throw new Error(`Expected build output missing: ${p} — did "electron-builder" run first?`);
    }
  }

  const release = await findOrCreateRelease(token, TAG, version);
  for (const asset of ASSETS) {
    await uploadAsset(token, release, path.join(RELEASE_DIR, asset.local), asset.remote);
  }

  console.log(`Published: ${release.html_url}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
