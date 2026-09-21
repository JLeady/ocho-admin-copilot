// electron-builder's own `--publish always` flag is unreliable here: it
// creates two separate GitHubPublisher instances per run (visible as
// "publishing publisher=Github" logged twice), which have raced each other
// into creating two separate releases for the same version with the
// upload assets split between them — sometimes as drafts, sometimes with
// the installer or latest.yml (which electron-updater needs) missing
// entirely. Both failure modes silently break auto-update.
//
// This script replaces that flag. `npm run electron:publish` now runs
// electron-builder WITHOUT --publish (just producing the local files in
// release/), then this uploads them itself: one release, created fresh,
// assets uploaded one at a time in a fixed order. No concurrency, no
// ambiguity about what state things were left in.
//
// Requires the git tag for this version to already exist and be pushed
// (`git tag vX.Y.Z && git push origin vX.Y.Z`) — GitHub refuses to create a
// non-draft release against a tag that doesn't exist yet.
const fs = require("fs");
const path = require("path");
const { version } = require("../package.json");

const OWNER = "JLeady";
const REPO = "ocho-admin-copilot";
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

function authHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GH_TOKEN is not set — can't publish.");

  for (const asset of ASSETS) {
    const p = path.join(RELEASE_DIR, asset.local);
    if (!fs.existsSync(p)) {
      throw new Error(`Expected build output missing: ${p} — did "electron-builder" run first?`);
    }
  }

  const listRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
    headers: authHeaders(token),
  });
  const existing = (await listRes.json()).filter((r) => r.tag_name === TAG);
  for (const r of existing) {
    console.log(`Removing existing ${TAG} release (id ${r.id}) to publish a clean one...`);
    await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${r.id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  }

  console.log(`Creating release ${TAG}...`);
  const createRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ tag_name: TAG, name: version, draft: false }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create release: ${createRes.status} ${await createRes.text()}`);
  }
  const release = await createRes.json();

  for (const asset of ASSETS) {
    const filePath = path.join(RELEASE_DIR, asset.local);
    const data = fs.readFileSync(filePath);
    console.log(`Uploading ${asset.remote} (${(data.length / 1024 / 1024).toFixed(1)} MB)...`);
    const uploadRes = await fetch(
      `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(asset.remote)}`,
      {
        method: "POST",
        headers: authHeaders(token, {
          "Content-Type": "application/octet-stream",
          "Content-Length": data.length,
        }),
        body: data,
      }
    );
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload ${asset.remote}: ${uploadRes.status} ${await uploadRes.text()}`);
    }
  }

  console.log(`Published: ${release.html_url}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
