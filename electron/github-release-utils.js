// Shared by publish-release.js (Windows) and publish-mac-release.js (macOS,
// run in GitHub Actions). Both platforms' assets end up in the SAME GitHub
// release for a given tag, built independently (Windows locally, macOS in
// CI) and possibly in either order — so this only ever finds-or-creates the
// release and replaces its OWN named files, never the whole release. An
// earlier version deleted and recreated the entire release every time,
// which worked while only one platform existed but would silently wipe out
// the other platform's assets the moment a second one was added.
const fs = require("fs");

const OWNER = "JLeady";
const REPO = "ocho-admin-copilot";

function authHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function findOrCreateRelease(token, tag, versionName) {
  const listRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
    headers: authHeaders(token),
  });
  if (!listRes.ok) throw new Error(`Failed to list releases: ${listRes.status} ${await listRes.text()}`);
  const releases = await listRes.json();
  const existing = releases.find((r) => r.tag_name === tag);
  if (existing) return existing;

  const createRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ tag_name: tag, name: versionName, draft: false }),
  });
  if (!createRes.ok) throw new Error(`Failed to create release: ${createRes.status} ${await createRes.text()}`);
  return createRes.json();
}

async function deleteAssetIfExists(token, releaseId, assetName) {
  const assetsRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`, {
    headers: authHeaders(token),
  });
  if (!assetsRes.ok) return; // nothing to clean up if this fails, upload will just fail loudly instead
  const assets = await assetsRes.json();
  const existing = assets.find((a) => a.name === assetName);
  if (existing) {
    await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  }
}

// Replaces only the one named asset — any other files already on the
// release (e.g. the other platform's installer) are left untouched.
async function uploadAsset(token, release, filePath, assetName) {
  await deleteAssetIfExists(token, release.id, assetName);
  const data = fs.readFileSync(filePath);
  console.log(`Uploading ${assetName} (${(data.length / 1024 / 1024).toFixed(1)} MB)...`);
  const res = await fetch(
    `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
    {
      method: "POST",
      headers: authHeaders(token, { "Content-Type": "application/octet-stream", "Content-Length": data.length }),
      body: data,
    }
  );
  if (!res.ok) throw new Error(`Failed to upload ${assetName}: ${res.status} ${await res.text()}`);
}

module.exports = { OWNER, REPO, findOrCreateRelease, uploadAsset };
