#!/usr/bin/env node

/**
 * Merge electron-builder update manifests from parallel per-architecture
 * build artifacts into canonical manifests at the artifacts root.
 *
 * macOS: Both arches produce the same manifest name → merge files arrays.
 * Linux: Each arch produces its own manifest name → copy to artifacts root.
 *
 * Usage: node merge-update-manifests.js <artifacts-dir>
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function log(msg) {
  console.log(`[merge-manifests] ${msg}`);
}

function mergeMacManifests(artifactsDir) {
  const dirs = fs.readdirSync(artifactsDir).filter((d) => /^mac-/.test(d));
  const ymlNames = new Set();
  for (const dir of dirs) {
    for (const f of fs.readdirSync(path.join(artifactsDir, dir))) {
      if (/^(\w+)-mac\.yml$/.test(f)) {
        ymlNames.add(f);
      }
    }
  }

  for (const ymlName of ymlNames) {
    const manifests = [];
    for (const dir of dirs) {
      const filePath = path.join(artifactsDir, dir, ymlName);
      if (fs.existsSync(filePath)) {
        log(`Found ${dir}/${ymlName}`);
        manifests.push({ dir, content: fs.readFileSync(filePath, 'utf8') });
      }
    }
    if (manifests.length === 0) {
      continue;
    }

    const parsed = manifests.map((m) => yaml.load(m.content));
    const seen = new Set();
    const mergedFiles = [];
    for (const doc of parsed) {
      for (const file of doc.files || []) {
        if (!seen.has(file.url)) {
          seen.add(file.url);
          mergedFiles.push(file);
        }
      }
    }

    const base = parsed[0];
    const merged = { version: base.version, files: mergedFiles, path: base.path, sha512: base.sha512, releaseDate: base.releaseDate };
    const output = yaml.dump(merged, { lineWidth: -1, quotingType: "'", forceQuotes: false });
    fs.writeFileSync(path.join(artifactsDir, ymlName), output);
    log(`Wrote merged ${ymlName} (${mergedFiles.length} files from ${manifests.length} artifacts)`);
  }
}

function collectLinuxManifests(artifactsDir) {
  const dirs = fs.readdirSync(artifactsDir).filter((d) => /^linux-/.test(d));
  for (const dir of dirs) {
    const dirPath = path.join(artifactsDir, dir);
    for (const f of fs.readdirSync(dirPath).filter((f) => /^(\w+)-linux.*\.yml$/.test(f))) {
      fs.copyFileSync(path.join(dirPath, f), path.join(artifactsDir, f));
      log(`Copied ${dir}/${f} → ${f}`);
    }
  }
}

const artifactsDir = process.argv[2];
if (!artifactsDir || !fs.existsSync(artifactsDir)) {
  console.error('Usage: node merge-update-manifests.js <artifacts-dir>');
  process.exit(1);
}
mergeMacManifests(artifactsDir);
collectLinuxManifests(artifactsDir);
