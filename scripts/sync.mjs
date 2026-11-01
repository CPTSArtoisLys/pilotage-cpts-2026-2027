// Synchronisation Plexus -> formulaire de pilotage (dépôt public).
// Le robot lit le dossier Plexus et écrit data/plexus-index.json : nombre de fichiers par dossier et lien vers le dossier,
// SANS nom de fichier ni nom de personne. Les justificatifs eux-mêmes ne quittent jamais Plexus.
// Aucun mot de passe n'est stocké dans le code : NC_USER et NC_APP_PASSWORD viennent des secrets GitHub.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const normUrl = (u) => { u = (u || '').trim().replace(/\s+/g, ''); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return u.replace(/\/+$/, ''); };
// L'adresse de Plexus Cloud n'est pas confidentielle : elle est fixée ici (le secret NC_URL n'est plus utilisé).
const NC = normUrl('https://cptsartoislys-cloud.plexus-sante.fr');
const USER = (process.env.NC_USER || '').trim();
const PW = (process.env.NC_APP_PASSWORD || '').trim();
const ROOT = process.env.NC_ROOT || '/Projets/Bilan annuel 2025-2026';
const FALLBACK_DIR = 'Dépôts du formulaire';
if (!NC || !USER || !PW) { console.error('Secrets NC_URL / NC_USER / NC_APP_PASSWORD manquants.'); process.exit(1); }

const AUTH = 'Basic ' + Buffer.from(`${USER}:${PW}`).toString('base64');
const DAV = `${NC}/remote.php/dav/files/${encodeURIComponent(USER)}`;
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const MAP = JSON.parse(fs.readFileSync('config/mapping.json', 'utf8'));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n');
const sh = (c) => execSync(c, { stdio: 'pipe' }).toString();

/* ---------- correspondance ligne -> dossier Plexus (même règle que le formulaire) ---------- */
function folderOf(ligne) {
  const n = Number(ligne);
  if (Number.isNaN(n)) return null;
  const m = MAP.missions.find(([a, b]) => n >= a && n <= b);
  if (!m) return null;
  const sub = MAP.subs[String(n)];
  return { rel: m[2] + (sub ? '/' + sub : ''), label: m[2] + (sub ? ' / ' + sub : '') };
}
const plexusLink = (relDir, name) =>
  `${NC}/apps/files/?dir=${encodeURIComponent(`${ROOT}/${relDir}`)}` + (name ? `&scrollto=${encodeURIComponent(name)}` : '');

/* ---------- WebDAV ---------- */
async function dav(method, rel, { body, headers } = {}) {
  const r = await fetch(`${DAV}${enc(rel)}`, { method, headers: { Authorization: AUTH, ...headers }, body });
  return r;
}
async function ensureDir(relDir) {
  const parts = `${ROOT}/${relDir}`.split('/').filter(Boolean);
  let cur = '';
  for (const p of parts) {
    cur += '/' + p;
    const r = await dav('MKCOL', cur);
    if (![201, 405, 409].includes(r.status) && r.status >= 400) throw new Error(`MKCOL ${cur} -> ${r.status}`);
  }
}
async function exists(rel) { return (await dav('HEAD', rel)).status === 200; }
async function propfind(rel) {
  const r = await dav('PROPFIND', rel, {
    headers: { Depth: 'infinity', 'Content-Type': 'application/xml' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop></d:propfind>',
  });
  if (r.status !== 207) throw new Error(`PROPFIND ${rel} -> ${r.status}`);
  const xml = await r.text();
  const out = [];
  for (const m of xml.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)) {
    const x = m[1];
    const href = decodeURIComponent(x.match(/<d:href>([^<]+)/)[1]);
    const marker = `/remote.php/dav/files/${USER}${ROOT}/`;
    const i = href.indexOf(marker);
    if (i < 0) continue;
    const relp = href.slice(i + marker.length).replace(/\/$/, '');
    out.push({
      rel: relp, dir: /<d:collection/.test(x),
      size: Number((x.match(/getcontentlength>(\d+)/) || [])[1] || 0),
      mtime: (x.match(/getlastmodified>([^<]+)/) || [])[1] ? new Date(x.match(/getlastmodified>([^<]+)/)[1]).toISOString() : null,
    });
  }
  return out;
}

/* ---------- phase 1 : (supprimée) les justificatifs sont déposés directement dans Plexus ---------- */
const result = { uploaded: [], index: null, newFiles: [] };

/* ---------- phase 2 : Plexus -> index ---------- */
const entries = await propfind(ROOT);
const lignes = Object.keys(readJson('data/indicateurs.json', {}))
  .map((k) => (readJson('data/indicateurs.json', {})[k] || {}).ligne).filter((l) => l !== undefined && !Number.isNaN(Number(l)));
const dirToLignes = {};
for (const l of new Set(lignes)) {
  const fo = folderOf(l);
  if (fo) (dirToLignes[fo.rel] = dirToLignes[fo.rel] || { label: fo.label, lignes: [] }).lignes.push(String(l));
}
const byDir = {};
for (const e of entries.filter((x) => !x.dir)) {
  const d = path.posix.dirname(e.rel) === '.' ? '' : path.posix.dirname(e.rel);
  (byDir[d] = byDir[d] || []).push(e);
}
const hash = (t) => createHash('sha1').update(t).digest('hex').slice(0, 12);
const folders = [], orphans = [];
for (const [d, files] of Object.entries(byDir).sort()) {
  if (d === '') continue; // fichiers à la racine du dossier « Bilan annuel » (ex. le tableau Excel)
  const info = dirToLignes[d];
  const label = info ? info.label : d.replace(/\//g, ' / ');
  // Dépôt public : ni nom de fichier ni nom de personne. On garde le nombre de fichiers et des empreintes pour repérer les nouveautés.
  folders.push({
    path: d, label, lignes: info ? info.lignes : [], count: files.length,
    mtime: files.map((x) => x.mtime).filter(Boolean).sort().pop() || null,
    url: plexusLink(d), h: files.map((x) => hash(path.posix.basename(x.rel))).sort(),
  });
  if (!info) orphans.push({ label, files: files.length });
}
const prev = readJson('data/plexus-index.json', {});
const prevH = new Map((prev.folders || []).map((f) => [f.path, new Set(f.h || [])]));
if (prev.generatedAt) {
  for (const f of folders) {
    const before = prevH.get(f.path) || new Set();
    const n = f.h.filter((x) => !before.has(x)).length;
    if (n > 0) result.newFiles.push({ folder: f, n });
  }
}
result.index = { generatedAt: new Date().toISOString(), root: ROOT, folders, orphans };

/* ---------- phase 3 : écriture dans le dépôt (reprise sur conflit) ---------- */
function applyAndCommit() {
  const journal = readJson('data/journal.json', {});
  const now = new Date().toISOString();
  let n = 0;
  for (const { folder, n: k } of result.newFiles) {
    for (const l of folder.lignes) {
      journal[`j_new_${hash(`${folder.path}#${l}#${folder.h.join('')}`)}`] = {
        ligne: String(l), kind: 'piece', texte: `${k} nouveau${k > 1 ? 'x' : ''} fichier${k > 1 ? 's' : ''} détecté${k > 1 ? 's' : ''} dans le dossier Plexus (${folder.label})`, at: now, by: 'synchro-plexus',
      };
    }
    n += k;
  }
  writeJson('data/journal.json', journal);
  writeJson('data/plexus-index.json', result.index);
  sh('git config user.name "synchro-plexus" && git config user.email "synchro-plexus@users.noreply.github.com"');
  sh('git add -A data');
  const status = sh('git status --porcelain');
  // l'index horodaté change à chaque passage : on ne commite que si le contenu utile a changé
  const only = status.split('\n').filter(Boolean);
  const meaningful = only.some((l) => !l.endsWith('data/plexus-index.json')) || indexChanged();
  if (!meaningful) { sh('git reset -q'); console.log('Aucun changement.'); return true; }
  sh(`git commit -m "Synchro Plexus : ${n} nouveau(x) fichier(s)"`);
  try { sh('git push'); return true; } catch { return false; }
}
function indexChanged() {
  try {
    const old = JSON.parse(sh('git show HEAD:data/plexus-index.json'));
    const strip = (o) => JSON.stringify({ f: (o.folders || []).map((x) => [x.path, x.count, x.h]), o: o.orphans });
    return strip(old) !== strip(result.index);
  } catch { return true; }
}
for (let i = 0; i < 4; i++) {
  if (i > 0) { sh('git fetch -q origin && git reset -q --hard origin/main'); }
  if (applyAndCommit()) { console.log('Synchronisation terminée.'); process.exit(0); }
  await new Promise((r) => setTimeout(r, 2000 + i * 3000));
}
console.error('Échec de la poussée après plusieurs tentatives.');
process.exit(1);
