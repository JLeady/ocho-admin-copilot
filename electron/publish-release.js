// electron-builder's GitHub publisher has a known quirk (two publisher
// instances end up racing to create the release — see the "publishing
// publisher=Github" line appearing twice in its own build output) where the
// release can end up left as a draft even with `releaseType: "release"` set.
// A draft release is invisible to electron-updater and to anyone browsing
// GitHub's Releases page, so this runs right after `electron-builder
// --publish always` and force-publishes whatever draft matches this
// version, if one was left behind.
const { version } = require("../package.json");

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GH_TOKEN is not set — can't verify the release published correctly.");

  const owner = "JLeady";
  const repo = "ocho-admin-copilot";
  const tag = `v${version}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const releases = await res.json();
  const release = releases.find((r) => r.tag_name === tag);

  if (!release) {
    throw new Error(`No GitHub release found for ${tag} — the publish step may have failed.`);
  }
  if (!release.draft) {
    console.log(`${tag} is already published (not a draft) — nothing to do.`);
    return;
  }

  console.log(`${tag} was left as a draft — publishing it now...`);
  const patchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${release.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ draft: false }),
  });
  if (!patchRes.ok) {
    throw new Error(`Failed to publish release: ${patchRes.status} ${await patchRes.text()}`);
  }
  console.log(`${tag} is now published: ${release.html_url}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
