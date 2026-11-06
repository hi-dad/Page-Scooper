const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const manifest = readJson("manifest.json");
const packageJson = readJson("package.json");

test("manifest and package versions stay synchronized", () => {
  assert.equal(manifest.version, packageJson.version);
});

test("every extension entry point referenced by the manifest exists", () => {
  const requiredFiles = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page
  ];

  for (const file of requiredFiles) {
    assert.ok(fs.existsSync(path.join(projectRoot, file)), `missing manifest entry point: ${file}`);
  }
});

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, file), "utf8"));
}
