// macOS counterpart to publish-release.js — runs in GitHub Actions on
// macos-latest (see .github/workflows/build-mac.yml), since a real macOS
// build can't happen on Jack's Windows machine.
//
// Unlike the Windows script, this doesn't hardcode expected filenames.
// electron-builder's exact mac artifact naming (whether it includes the
// arch, "-mac" suffixes, etc.) wasn't something that could be verified
// against a real build before this shipped — nobody involved in building
// this has a Mac to test on. So instead, this just uploads whatever
// electron-builder actually produced in release/: every .dmg, every mac
// .zip, their .blockmap files, and latest-mac.yml. Each file keeps its own
// name on upload, which is also the name latest-mac.yml already refers to
// internally, so nothing here needs to predict or match a naming scheme.
const path = require("path");
const fs = require("fs");
const { version } = require("../package.json");
const { findOrCreateRelease, uploadAsset } = require("./github-release-utils.js");

const TAG = `v${version}`;
const RELEASE_DIR = path.join(__dirname, "..", "release");

function findMacAssets() {
  const entries = fs.readdirSync(RELEASE_DIR, { withFileTypes: true }).filter((e) => e.isFile());
  const names = entries
    .map((e) => e.name)
    .filter((name) => name.endsWith(".dmg") || name.endsWith(".zip") || name.endsWith(".blockmap") || name === "latest-mac.yml");
  return names;
}

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GH_TOKEN is not set — can't publish.");

  const assetNames = findMacAssets();
  if (assetNames.length === 0) {
    throw new Error(`No mac build output found in ${RELEASE_DIR} — did "electron-builder --mac" run first?`);
  }
  if (!assetNames.includes("latest-mac.yml")) {
    throw new Error("latest-mac.yml wasn't produced — electron-updater on Mac won't be able to find updates.");
  }
  console.log("Found mac build output:", assetNames.join(", "));

  const release = await findOrCreateRelease(token, TAG, version);
  for (const name of assetNames) {
    await uploadAsset(token, release, path.join(RELEASE_DIR, name), name);
  }

  console.log(`Published: ${release.html_url}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
