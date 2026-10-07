// macOS counterpart to publish-release.js — runs in GitHub Actions on
// macos-latest (see .github/workflows/build-mac.yml), since a real macOS
// build can't happen on Jack's Windows machine.
//
// Doesn't hardcode expected filenames — electron-builder's exact mac
// artifact naming wasn't something that could be verified against a real
// build before this shipped (nobody involved has a Mac to test on). Instead
// this scans release/ for whatever electron-builder actually produced:
// every .dmg, every mac .zip, their .blockmap files, and latest-mac.yml.
//
// It DOES rewrite spaces to dashes in the uploaded name, matching
// electron-builder's own internal convention — latest-mac.yml (read
// as-is, not regenerated here) already references the dashed form
// internally, since that's what electron-builder assumes its own naming
// produces. Uploading the raw space-containing local filename instead
// caused GitHub's asset API to sanitize it inconsistently between
// electron-builder's own (also-racing — see below) internal uploads and
// this script's, producing two different mangled names for the same file
// in the one release. Pre-sanitizing to the exact expected form avoids
// that entirely.
const path = require("path");
const fs = require("fs");
const { version } = require("../package.json");
const { findOrCreateRelease, uploadAsset } = require("./github-release-utils.js");

const TAG = `v${version}`;
const RELEASE_DIR = path.join(__dirname, "..", "release");

function findMacAssets() {
  const entries = fs.readdirSync(RELEASE_DIR, { withFileTypes: true }).filter((e) => e.isFile());
  return entries
    .map((e) => e.name)
    .filter((name) => name.endsWith(".dmg") || name.endsWith(".zip") || name.endsWith(".blockmap") || name === "latest-mac.yml");
}

function sanitizeAssetName(name) {
  return name === "latest-mac.yml" ? name : name.replace(/ /g, "-");
}

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GH_TOKEN is not set — can't publish.");

  const localNames = findMacAssets();
  if (localNames.length === 0) {
    throw new Error(`No mac build output found in ${RELEASE_DIR} — did "electron-builder --mac --publish never" run first?`);
  }
  if (!localNames.includes("latest-mac.yml")) {
    throw new Error("latest-mac.yml wasn't produced — electron-updater on Mac won't be able to find updates.");
  }
  console.log("Found mac build output:", localNames.join(", "));

  const release = await findOrCreateRelease(token, TAG, version);
  for (const localName of localNames) {
    await uploadAsset(token, release, path.join(RELEASE_DIR, localName), sanitizeAssetName(localName));
  }

  console.log(`Published: ${release.html_url}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
