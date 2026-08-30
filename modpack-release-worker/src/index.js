// esbuild keepNames helper（首次打包时被剥离，手动补回，必须返回 target）
var __name = /* @__PURE__ */ (target, value) => Object.defineProperty(target, "name", { value, configurable: true });
// src/github.js
var API = "https://api.github.com";
function headers(env, token) {
  return {
    Authorization: `token ${token || env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "modpack-release-worker"
  };
}
__name(headers, "headers");
function repoPath(env) {
  return `/repos/${env.REPO_OWNER}/${env.REPO_NAME}`;
}
__name(repoPath, "repoPath");
async function parse(res) {
  const text2 = await res.text();
  let data = null;
  try {
    data = JSON.parse(text2);
  } catch (_) {
    data = text2;
  }
  if (!res.ok) {
    const err2 = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err2.status = res.status;
    err2.data = data;
    throw err2;
  }
  return data;
}
__name(parse, "parse");
async function getUser(env, token) {
  return parse(await fetch(`${API}/user`, { headers: headers(env, token) }));
}
__name(getUser, "getUser");
async function getLatestRelease(env) {
  try {
    return await parse(await fetch(`${API}${repoPath(env)}/releases/latest`, { headers: headers(env) }));
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}
__name(getLatestRelease, "getLatestRelease");
async function listReleases(env) {
  return parse(await fetch(`${API}${repoPath(env)}/releases?per_page=20`, { headers: headers(env) }));
}
__name(listReleases, "listReleases");
async function createRelease(env, tagName, name, body) {
  return parse(await fetch(`${API}${repoPath(env)}/releases`, {
    method: "POST",
    headers: { ...headers(env), "Content-Type": "application/json" },
    body: JSON.stringify({ tag_name: tagName, name, body, draft: false, prerelease: false, generate_release_notes: false })
  }));
}
__name(createRelease, "createRelease");
async function uploadAsset(env, releaseId, data, assetName, contentType = "application/zip") {
  const url = `https://uploads.github.com${repoPath(env)}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers(env), "Content-Type": contentType },
    body: data
  });
  return parse(res);
}
__name(uploadAsset, "uploadAsset");
async function deleteRelease(env, releaseId) {
  return parse(await fetch(`${API}${repoPath(env)}/releases/${releaseId}`, { method: "DELETE", headers: headers(env) }));
}
__name(deleteRelease, "deleteRelease");
async function getRelease(env, id) {
  return parse(await fetch(`${API}${repoPath(env)}/releases/${id}`, { headers: headers(env) }));
}
__name(getRelease, "getRelease");
async function getReleaseAsset(env, assetId) {
  const res = await fetch(`${API}${repoPath(env)}/releases/assets/${assetId}`, {
    headers: { ...headers(env), Accept: "application/octet-stream" }
  });
  if (!res.ok) {
    const err2 = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err2.status = res.status;
    throw err2;
  }
  return new Uint8Array(await res.arrayBuffer());
}
__name(getReleaseAsset, "getReleaseAsset");
async function deleteTag(env, tag) {
  return parse(await fetch(`${API}${repoPath(env)}/git/refs/tags/${encodeURIComponent(tag)}`, { method: "DELETE", headers: headers(env) }));
}
__name(deleteTag, "deleteTag");
function repoBranch(env) {
  return env.REPO_BRANCH || "main";
}
__name(repoBranch, "repoBranch");
function encPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}
__name(encPath, "encPath");
async function fileMeta(env, path) {
  try {
    return await parse(await fetch(`${API}${repoPath(env)}/contents/${encPath(path)}`, { headers: headers(env) }));
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}
__name(fileMeta, "fileMeta");
async function listRepoDir(env, dir) {
  const meta = await fileMeta(env, dir);
  if (!meta) return [];
  if (Array.isArray(meta)) return meta.filter((e) => e.type === "file");
  return [];
}
__name(listRepoDir, "listRepoDir");
async function readRepoFile(env, path) {
  const res = await fetch(`${API}${repoPath(env)}/contents/${encPath(path)}`, {
    headers: { ...headers(env), Accept: "application/vnd.github.raw+json" }
  });
  if (!res.ok) {
    const err2 = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err2.status = res.status;
    throw err2;
  }
  return new Uint8Array(await res.arrayBuffer());
}
__name(readRepoFile, "readRepoFile");
async function writeRepoFile(env, path, data, message) {
  const existing = await fileMeta(env, path);
  const body = { message, content: bytesToBase64(data), branch: repoBranch(env) };
  if (existing) body.sha = existing.sha;
  return parse(await fetch(`${API}${repoPath(env)}/contents/${encPath(path)}`, {
    method: "PUT",
    headers: { ...headers(env), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }));
}
__name(writeRepoFile, "writeRepoFile");
async function deleteRepoFile(env, path, message) {
  const meta = await fileMeta(env, path);
  if (!meta) return null;
  return parse(await fetch(`${API}${repoPath(env)}/contents/${encPath(path)}`, {
    method: "DELETE",
    headers: { ...headers(env), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha: meta.sha, branch: repoBranch(env) })
  }));
}
__name(deleteRepoFile, "deleteRepoFile");
function bytesToBase64(bytes) {
  let binary = "";
  const CHUNK = 32768;
  for (let i2 = 0; i2 < bytes.length; i2 += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i2, i2 + CHUNK));
  }
  return btoa(binary);
}
__name(bytesToBase64, "bytesToBase64");

// src/store.js
var STATE_KEY = "state";
var MODS_DIR = "mods";
var UPDATER_PATH = "updater/mod-updater.exe";
function defaultState() {
  return { currentVersion: "1.0.0", lastPublishAt: null, lastReleaseId: null, lastReleaseTag: null };
}
__name(defaultState, "defaultState");
async function readState(env) {
  const raw = await env.MODS_KV.get(STATE_KEY);
  if (!raw) return defaultState();
  try {
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch (_) {
    return defaultState();
  }
}
__name(readState, "readState");
async function writeState(env, state) {
  await env.MODS_KV.put(STATE_KEY, JSON.stringify(state));
}
__name(writeState, "writeState");
function bumpVersion(v) {
  const parts = String(v || "1.0.0").split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join(".");
}
__name(bumpVersion, "bumpVersion");
async function listMods(env) {
  const entries = await listRepoDir(env, MODS_DIR);
  return entries.filter((e) => e.name.toLowerCase().endsWith(".jar")).map((e) => ({ name: e.name, size: e.size, mtime: null }));
}
__name(listMods, "listMods");
async function putMod(env, name, data, size) {
  const toR2 = new Uint8Array(data.slice(0));
  const toGit = new Uint8Array(data.slice(0));
  await env.MODS_R2.put(name, toR2);
  try {
    await writeRepoFile(env, `${MODS_DIR}/${name}`, toGit, `\u4E0A\u4F20\u6A21\u7EC4 ${name}`);
  } catch (e) {
    throw e;
  }
  await env.MODS_R2.delete(name).catch(() => {
  });
  return { name, size, mtime: null };
}
__name(putMod, "putMod");
async function removeMod(env, name) {
  await deleteRepoFile(env, `${MODS_DIR}/${name}`, `\u5220\u9664\u6A21\u7EC4 ${name}`);
}
__name(removeMod, "removeMod");
async function renameMod(env, oldName, newName) {
  const raw = await readRepoFile(env, `${MODS_DIR}/${oldName}`);
  await writeRepoFile(env, `${MODS_DIR}/${newName}`, raw, `\u91CD\u547D\u540D\u6A21\u7EC4 ${oldName} \u2192 ${newName}`);
  await deleteRepoFile(env, `${MODS_DIR}/${oldName}`, `\u91CD\u547D\u540D\u6A21\u7EC4 ${oldName} \u2192 ${newName}`);
}
__name(renameMod, "renameMod");
async function readUpdater(env) {
  try {
    return await readRepoFile(env, UPDATER_PATH);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}
__name(readUpdater, "readUpdater");
async function createSession(env, user) {
  const rnd = /* @__PURE__ */ __name(() => crypto.randomUUID().replace(/-/g, ""), "rnd");
  const token = rnd() + rnd();
  const ttlHours = parseInt(env.SESSION_TTL_HOURS || "168", 10);
  const session = { login: user.login, name: user.name || user.login, avatar_url: user.avatar_url };
  await env.MODS_KV.put(`session:${token}`, JSON.stringify(session), { expirationTtl: ttlHours * 3600 });
  return token;
}
__name(createSession, "createSession");
async function getSession(env, token) {
  if (!token) return null;
  const raw = await env.MODS_KV.get(`session:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}
__name(getSession, "getSession");
async function deleteSession(env, token) {
  if (token) await env.MODS_KV.delete(`session:${token}`);
}
__name(deleteSession, "deleteSession");

// node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = /* @__PURE__ */ __name(function(eb, start) {
  var b = new u16(31);
  for (var i2 = 0; i2 < 31; ++i2) {
    b[i2] = start += 1 << eb[i2 - 1];
  }
  var r = new i32(b[30]);
  for (var i2 = 1; i2 < 30; ++i2) {
    for (var j = b[i2]; j < b[i2 + 1]; ++j) {
      r[j] = j - b[i2] << 5 | i2;
    }
  }
  return { b, r };
}, "freb");
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = /* @__PURE__ */ __name((function(cd, mb, r) {
  var s = cd.length;
  var i2 = 0;
  var l = new u16(mb);
  for (; i2 < s; ++i2) {
    if (cd[i2])
      ++l[cd[i2] - 1];
  }
  var le = new u16(mb);
  for (i2 = 1; i2 < mb; ++i2) {
    le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        var sv = i2 << 4 | cd[i2];
        var r_1 = mb - cd[i2];
        var v = le[cd[i2] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
      }
    }
  }
  return co;
}), "hMap");
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flm = /* @__PURE__ */ hMap(flt, 9, 0);
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = /* @__PURE__ */ __name(function(a) {
  var m = a[0];
  for (var i2 = 1; i2 < a.length; ++i2) {
    if (a[i2] > m)
      m = a[i2];
  }
  return m;
}, "max");
var bits = /* @__PURE__ */ __name(function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
}, "bits");
var bits16 = /* @__PURE__ */ __name(function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
}, "bits16");
var shft = /* @__PURE__ */ __name(function(p) {
  return (p + 7) / 8 | 0;
}, "shft");
var slc = /* @__PURE__ */ __name(function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
}, "slc");
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = /* @__PURE__ */ __name(function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
}, "err");
var inflt = /* @__PURE__ */ __name(function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = /* @__PURE__ */ __name(function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  }, "cbuf");
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i2 = 0; i2 < hcLen; ++i2) {
          clt[clim[i2]] = bits(dat, pos + i2 * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i2 = 0; i2 < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i2++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i2++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i2 = sym - 257, b = fleb[i2];
          add = bits(dat, pos, (1 << b) - 1) + fl[i2];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
}, "inflt");
var wbits = /* @__PURE__ */ __name(function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
}, "wbits");
var wbits16 = /* @__PURE__ */ __name(function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
}, "wbits16");
var hTree = /* @__PURE__ */ __name(function(d, mb) {
  var t = [];
  for (var i2 = 0; i2 < d.length; ++i2) {
    if (d[i2])
      t.push({ s: i2, f: d[i2] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et, l: 0 };
  if (s == 1) {
    var v = new u8(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i22 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i22].f ? i0++ : i22++];
    r = t[i0 != i1 && t[i0].f < t[i22].f ? i0++ : i22++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i2 = 1; i2 < s; ++i2) {
    if (t2[i2].s > maxSym)
      maxSym = t2[i2].s;
  }
  var tr = new u16(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i2 = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (; i2 < s; ++i2) {
      var i2_1 = t2[i2].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i2].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i2;
    }
    for (; i2 >= 0 && dt; --i2) {
      var i2_3 = t2[i2].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u8(tr), l: mbt };
}, "hTree");
var ln = /* @__PURE__ */ __name(function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
}, "ln");
var lc = /* @__PURE__ */ __name(function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u16(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = /* @__PURE__ */ __name(function(v) {
    cl[cli++] = v;
  }, "w");
  for (var i2 = 1; i2 <= s; ++i2) {
    if (c[i2] == cln && i2 != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (; cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (; cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i2];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
}, "lc");
var clen = /* @__PURE__ */ __name(function(cf, cl) {
  var l = 0;
  for (var i2 = 0; i2 < cl.length; ++i2)
    l += cf[i2] * cl[i2];
  return l;
}, "clen");
var wfblk = /* @__PURE__ */ __name(function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i2 = 0; i2 < s; ++i2)
    out[o + i2 + 4] = dat[i2];
  return (o + 4 + s) * 8;
}, "wfblk");
var wblk = /* @__PURE__ */ __name(function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
  var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u16(19);
  for (var i2 = 0; i2 < lclt.length; ++i2)
    ++lcfreq[lclt[i2] & 31];
  for (var i2 = 0; i2 < lcdt.length; ++i2)
    ++lcfreq[lcdt[i2] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i2 = 0; i2 < nlcc; ++i2)
      wbits(out, p + 3 * i2, lct[clim[i2]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0; it < 2; ++it) {
      var clct = lcts[it];
      for (var i2 = 0; i2 < clct.length; ++i2) {
        var len = clct[i2] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i2] >> 5 & 127), p += clct[i2] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt, dm = fdm, dl = fdt;
  }
  for (var i2 = 0; i2 < li; ++i2) {
    var sym = syms[i2];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
}, "wblk");
var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et = /* @__PURE__ */ new u8(0);
var dflt = /* @__PURE__ */ __name(function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = /* @__PURE__ */ __name(function(i3) {
      return (dat[i3] ^ dat[i3 + 1] << bs1_1 ^ dat[i3 + 2] << bs2_1) & msk_1;
    }, "hsh");
    var syms = new i32(25e3);
    var lf = new u16(288), df = new u16(32);
    var lc_1 = 0, eb = 0, i2 = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (; i2 + 2 < s; ++i2) {
      var hv = hsh(i2);
      var imod = i2 & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i2) {
        var rem = s - i2;
        if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i2 - bs, pos);
          li = lc_1 = eb = 0, bs = i2;
          for (var j = 0; j < 286; ++j)
            lf[j] = 0;
          for (var j = 0; j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i2 - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i2);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i2 + l] == dat[i2 + l - dif]) {
              var nl = 0;
              for (; nl < ml && dat[i2 + nl] == dat[i2 + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0; j < mmd; ++j) {
                  var ti = i2 - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
          var lin = revfl[l] & 31, din = revfd[d] & 31;
          eb += fleb[lin] + fdeb[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i2 + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i2];
          ++lf[dat[i2]];
        }
      }
    }
    for (i2 = Math.max(i2, wi); i2 < s; ++i2) {
      syms[li++] = dat[i2];
      ++lf[dat[i2]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i2 - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i2, st.w = wi;
    }
  } else {
    for (var i2 = st.w || 0; i2 < s + lst; i2 += 65535) {
      var e = i2 + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i2, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
}, "dflt");
var crct = /* @__PURE__ */ (function() {
  var t = new Int32Array(256);
  for (var i2 = 0; i2 < 256; ++i2) {
    var c = i2, k = 9;
    while (--k)
      c = (c & 1 && -306674912) ^ c >>> 1;
    t[i2] = c;
  }
  return t;
})();
var crc = /* @__PURE__ */ __name(function() {
  var c = -1;
  return {
    p: /* @__PURE__ */ __name(function(d) {
      var cr = c;
      for (var i2 = 0; i2 < d.length; ++i2)
        cr = crct[cr & 255 ^ d[i2]] ^ cr >>> 8;
      c = cr;
    }, "p"),
    d: /* @__PURE__ */ __name(function() {
      return ~c;
    }, "d")
  };
}, "crc");
var dopt = /* @__PURE__ */ __name(function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u8(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
}, "dopt");
var mrg = /* @__PURE__ */ __name(function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
}, "mrg");
var b2 = /* @__PURE__ */ __name(function(d, b) {
  return d[b] | d[b + 1] << 8;
}, "b2");
var b4 = /* @__PURE__ */ __name(function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
}, "b4");
var b8 = /* @__PURE__ */ __name(function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
}, "b8");
var wbytes = /* @__PURE__ */ __name(function(d, b, v) {
  for (; v; ++b)
    d[b] = v, v >>>= 8;
}, "wbytes");
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
__name(deflateSync, "deflateSync");
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
__name(inflateSync, "inflateSync");
var fltn = /* @__PURE__ */ __name(function(d, p, t, o) {
  for (var k in d) {
    var val = d[k], n = p + k, op = o;
    if (Array.isArray(val))
      op = mrg(o, val[1]), val = val[0];
    if (ArrayBuffer.isView(val))
      t[n] = [val, op];
    else {
      t[n += "/"] = [new u8(0), op];
      fltn(val, n, t, o);
    }
  }
}, "fltn");
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = /* @__PURE__ */ __name(function(d) {
  for (var r = "", i2 = 0; ; ) {
    var c = d[i2++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i2 + eb > d.length)
      return { s: r, r: slc(d, i2 - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i2++] & 63) << 12 | (d[i2++] & 63) << 6 | d[i2++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i2++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i2++] & 63) << 6 | d[i2++] & 63);
  }
}, "dutf8");
function strToU8(str, latin1) {
  if (latin1) {
    var ar_1 = new u8(str.length);
    for (var i2 = 0; i2 < str.length; ++i2)
      ar_1[i2] = str.charCodeAt(i2);
    return ar_1;
  }
  if (te)
    return te.encode(str);
  var l = str.length;
  var ar = new u8(str.length + (str.length >> 1));
  var ai = 0;
  var w = /* @__PURE__ */ __name(function(v) {
    ar[ai++] = v;
  }, "w");
  for (var i2 = 0; i2 < l; ++i2) {
    if (ai + 5 > ar.length) {
      var n = new u8(ai + 8 + (l - i2 << 1));
      n.set(ar);
      ar = n;
    }
    var c = str.charCodeAt(i2);
    if (c < 128 || latin1)
      w(c);
    else if (c < 2048)
      w(192 | c >> 6), w(128 | c & 63);
    else if (c > 55295 && c < 57344)
      c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i2) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
    else
      w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
  }
  return slc(ar, 0, ai);
}
__name(strToU8, "strToU8");
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i2 = 0; i2 < dat.length; i2 += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i2, i2 + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
__name(strFromU8, "strFromU8");
var slzh = /* @__PURE__ */ __name(function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
}, "slzh");
var zh = /* @__PURE__ */ __name(function(d, b, z) {
  var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
  var _a2 = z64hs(d, es, efl, z, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a2[0], su = _a2[1], off = _a2[2];
  return [b2(d, b + 10), sc, su, fn, es + efl + b2(d, b + 32), off];
}, "zh");
var z64hs = /* @__PURE__ */ __name(function(d, b, l, z, sc, su, off) {
  var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
  var nf = nsc + nsu + noff;
  if (z && nf) {
    for (; b + 4 < e; b += 4 + b2(d, b + 2)) {
      if (b2(d, b) == 1) {
        return [
          nsc ? b8(d, b + 4 + 8 * nsu) : sc,
          nsu ? b8(d, b + 4) : su,
          noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
          1
        ];
      }
    }
    if (z < 2)
      err(13);
  }
  return [sc, su, off, 0];
}, "z64hs");
var exfl = /* @__PURE__ */ __name(function(ex) {
  var le = 0;
  if (ex) {
    for (var k in ex) {
      var l = ex[k].length;
      if (l > 65535)
        err(9);
      le += l + 4;
    }
  }
  return le;
}, "exfl");
var wzh = /* @__PURE__ */ __name(function(d, b, f, fn, u, c, ce, co) {
  var fl2 = fn.length, ex = f.extra, col = co && co.length;
  var exl = exfl(ex);
  wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
  if (ce != null)
    d[b++] = 20, d[b++] = f.os;
  d[b] = 20, b += 2;
  d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
  d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
  var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
  if (y < 0 || y > 119)
    err(10);
  wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
  if (c != -1) {
    wbytes(d, b, f.crc);
    wbytes(d, b + 4, c < 0 ? -c - 2 : c);
    wbytes(d, b + 8, f.size);
  }
  wbytes(d, b + 12, fl2);
  wbytes(d, b + 14, exl), b += 16;
  if (ce != null) {
    wbytes(d, b, col);
    wbytes(d, b + 6, f.attrs);
    wbytes(d, b + 10, ce), b += 14;
  }
  d.set(fn, b);
  b += fl2;
  if (exl) {
    for (var k in ex) {
      var exf = ex[k], l = exf.length;
      wbytes(d, b, +k);
      wbytes(d, b + 2, l);
      d.set(exf, b + 4), b += 4 + l;
    }
  }
  if (col)
    d.set(co, b), b += col;
  return b;
}, "wzh");
var wzf = /* @__PURE__ */ __name(function(o, b, c, d, e) {
  wbytes(o, b, 101010256);
  wbytes(o, b + 8, c);
  wbytes(o, b + 10, c);
  wbytes(o, b + 12, d);
  wbytes(o, b + 16, e);
}, "wzf");
function zipSync(data, opts) {
  if (!opts)
    opts = {};
  var r = {};
  var files = [];
  fltn(data, "", r, opts);
  var o = 0;
  var tot = 0;
  for (var fn in r) {
    var _a2 = r[fn], file = _a2[0], p = _a2[1];
    var compression = p.level == 0 ? 0 : 8;
    var f = strToU8(fn), s = f.length;
    var com = p.comment, m = com && strToU8(com), ms = m && m.length;
    var exl = exfl(p.extra);
    if (s > 65535)
      err(11);
    var d = compression ? deflateSync(file, p) : file, l = d.length;
    var c = crc();
    c.p(file);
    files.push(mrg(p, {
      size: file.length,
      crc: c.d(),
      c: d,
      f,
      m,
      u: s != fn.length || m && com.length != ms,
      o,
      compression
    }));
    o += 30 + s + exl + l;
    tot += 76 + 2 * (s + exl) + (ms || 0) + l;
  }
  var out = new u8(tot + 22), oe = o, cdl = tot - o;
  for (var i2 = 0; i2 < files.length; ++i2) {
    var f = files[i2];
    wzh(out, f.o, f, f.f, f.u, f.c.length);
    var badd = 30 + f.f.length + exfl(f.extra);
    out.set(f.c, f.o + badd);
    wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
  }
  wzf(out, o, files.length, cdl, oe);
  return out;
}
__name(zipSync, "zipSync");
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  ;
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z = b4(data, e - 20) == 117853008;
  if (z) {
    var ze = b4(data, e - 12);
    z = b4(data, ze) == 101075792;
    if (z) {
      c = b4(data, ze + 32);
      o = b4(data, ze + 48);
    }
  }
  var fltr = opts && opts.filter;
  for (var i2 = 0; i2 < c; ++i2) {
    var _a2 = zh(data, o, z), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
    o = no;
    if (!fltr || fltr({
      name: fn,
      size: sc,
      originalSize: su,
      compression: c_2
    })) {
      if (!c_2)
        files[fn] = slc(data, b, b + sc);
      else if (c_2 == 8)
        files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}
__name(unzipSync, "unzipSync");

// src/publish.js
async function publish(env, message = "") {
  const mods = await listMods(env);
  if (mods.length === 0) {
    const err2 = new Error("mods \u4E2D\u6CA1\u6709\u6A21\u7EC4\uFF0C\u65E0\u6CD5\u53D1\u5E03");
    err2.status = 400;
    throw err2;
  }
  const state = await readState(env);
  const version = bumpVersion(state.currentVersion);
  const tag = `v${version}`;
  const files = {};
  for (const m of mods) {
    try {
      files[m.name] = await readRepoFile(env, `mods/${m.name}`);
    } catch (_) {
    }
  }
  if (Object.keys(files).length === 0) {
    const err2 = new Error("\u4ECE GitHub \u4ED3\u5E93\u8BFB\u53D6\u6A21\u7EC4\u5931\u8D25\uFF0C\u65E0\u6CD5\u53D1\u5E03");
    err2.status = 400;
    throw err2;
  }
  const zipped = zipSync(files, { level: 0 });
  let release = null;
  try {
    const modsList = mods.filter((m) => files[m.name]).map((f) => `- \`${f.name}\` (${(f.size / 1024).toFixed(1)} KB)`).join("\n");
    const notes = `## \u68A6\u4E4B\u97F5\u6A21\u7EC4\u5305 v${version}

\u5171 ${Object.keys(files).length} \u4E2A\u6A21\u7EC4\uFF1A

${modsList}

${message ? `> ${message}` : ""}

> \u7531\u68A6\u4E4B\u97F5\u6A21\u7EC4\u53D1\u5E03\u7CFB\u7EDF\u81EA\u52A8\u6253\u5305\u751F\u6210\u3002`;
    release = await createRelease(env, tag, `\u68A6\u4E4B\u97F5\u6A21\u7EC4\u5305 v${version}`, notes);
    const asset = await uploadAsset(env, release.id, zipped, `mods-${version}.zip`);
    const fixedAsset = await uploadAsset(env, release.id, zipped, "modpack.zip");
    let updaterAsset = null;
    const updaterBuf = await readUpdater(env);
    if (updaterBuf) {
      const exe = await uploadAsset(env, release.id, updaterBuf, "mod-updater.exe", "application/octet-stream");
      updaterAsset = { name: exe.name, url: exe.browser_download_url, size: exe.size };
    }
    state.currentVersion = version;
    state.lastPublishAt = (/* @__PURE__ */ new Date()).toISOString();
    state.lastReleaseId = release.id;
    state.lastReleaseTag = tag;
    await writeState(env, state);
    return {
      version,
      tag,
      release: { id: release.id, url: release.html_url },
      asset: { name: asset.name, url: asset.browser_download_url, size: asset.size },
      fixedAsset: { name: fixedAsset.name, url: fixedAsset.browser_download_url, size: fixedAsset.size },
      updaterAsset,
      mods: Object.keys(files).map((n) => ({ name: n })),
      zipSize: zipped.byteLength
    };
  } catch (e) {
    if (release && release.id) {
      try {
        await deleteRelease(env, release.id);
      } catch (_) {
      }
      try {
        await deleteTag(env, tag);
      } catch (_) {
      }
    }
    throw e;
  }
}
__name(publish, "publish");

// src/index.js
var SESSION_COOKIE = "mp_session";
var MIRROR_PROXIES = [
  { name: "GitHub \u6E90\u7AD9", prefix: "" },
  { name: "gh-proxy.com", prefix: "https://gh-proxy.com/" },
  { name: "gh.dpik.top", prefix: "https://gh.dpik.top/" },
  { name: "ghfast.top", prefix: "https://ghfast.top/" }
];
var DOWNLOAD_PATH = "/maoxinhe/modpack/releases/latest/download/modpack.zip";
async function testMirror(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12e3);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-524287" },
      // 前 512KB
      redirect: "follow",
      signal: controller.signal
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    if (!res.body) throw new Error("\u65E0\u54CD\u5E94\u4F53");
    const reader = res.body.getReader();
    let total = 0;
    while (total < 524288) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
    }
    const ms = Date.now() - start;
    return { ok: true, time_ms: ms, speed_bps: ms > 0 ? Math.round(total * 1e3 / ms) : 0 };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "\u8FDE\u63A5\u8D85\u65F6" : e.message };
  } finally {
    clearTimeout(timer);
  }
}
__name(testMirror, "testMirror");
async function handleMirrors(request) {
  const base = "https://github.com" + DOWNLOAD_PATH;
  const list = MIRROR_PROXIES.map((p) => ({ name: p.name, url: p.prefix + base }));
  if (new URL(request.url).searchParams.get("test") === "1") {
    const results = await Promise.all(list.map(async (m) => ({ ...m, ...await testMirror(m.url) })));
    return json({ mirrors: results });
  }
  return json({ mirrors: list });
}
__name(handleMirrors, "handleMirrors");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
function text(msg, status = 400) {
  return new Response(String(msg), { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
__name(text, "text");
function getSessionToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const i2 = part.indexOf("=");
    if (i2 < 0) continue;
    const k = part.slice(0, i2).trim();
    const v = part.slice(i2 + 1).trim();
    if (k === SESSION_COOKIE) return decodeURIComponent(v);
  }
  return null;
}
__name(getSessionToken, "getSessionToken");
function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}
__name(sessionCookie, "sessionCookie");
function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
__name(clearSessionCookie, "clearSessionCookie");
async function isAdmin(request, env) {
  const devToken = request.headers.get("X-Dev-Token");
  if (env.DEV_AUTH_TOKEN && devToken === env.DEV_AUTH_TOKEN) return true;
  const session = await getSession(env, getSessionToken(request));
  return !!(session && session.login === env.ADMIN_LOGIN);
}
__name(isAdmin, "isAdmin");
async function requireAdmin(request, env) {
  if (await isAdmin(request, env)) return null;
  return json({ error: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" }, 403);
}
__name(requireAdmin, "requireAdmin");
async function tryPublish(env) {
  try {
    return await publish(env);
  } catch (e) {
    console.error("[publish-error]", e.message, e.data ? "| " + JSON.stringify(e.data).slice(0, 300) : "");
    return { error: e.message };
  }
}
__name(tryPublish, "tryPublish");
async function handleLogin(env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return text("\u5C1A\u672A\u914D\u7F6E GitHub OAuth\uFF08GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET\uFF09\uFF0C\u8BF7\u7528 wrangler secret \u914D\u7F6E\u540E\u91CD\u8BD5", 400);
  }
  const redirectUri = `${env.BASE_URL || "https://modpack-release.catkinr-93f.workers.dev"}/auth/callback`;
  const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.GITHUB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user&state=modpack`;
  return Response.redirect(url, 302);
}
__name(handleLogin, "handleLogin");
async function handleCallback(request, env) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!code) return text("\u7F3A\u5C11\u6388\u6743\u7801", 400);
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return text(`GitHub \u6388\u6743\u5931\u8D25: ${tokenData.error_description || tokenData.error || "unknown"}`, 400);
    }
    const user = await getUser(env, tokenData.access_token);
    const sessionToken = await createSession(env, user);
    const redirect = user.login === env.ADMIN_LOGIN ? "/admin.html" : "/";
    return new Response(null, {
      status: 302,
      headers: { Location: redirect, "Set-Cookie": sessionCookie(sessionToken) }
    });
  } catch (e) {
    return text("\u767B\u5F55\u5931\u8D25: " + e.message, 500);
  }
}
__name(handleCallback, "handleCallback");
async function handleMods(env) {
  const mods = (await listMods(env)).map((m) => ({ name: m.name, size: m.size, mtime: m.mtime }));
  return json({ mods });
}
__name(handleMods, "handleMods");
async function handleLatest(env) {
  try {
    const release = await getLatestRelease(env);
    if (!release) return json({ release: null, state: await readState(env) });
    return json({
      release: {
        tag_name: release.tag_name,
        name: release.name,
        published_at: release.published_at,
        html_url: release.html_url,
        body: release.body,
        assets: (release.assets || []).map((a) => ({ name: a.name, browser_download_url: a.browser_download_url, size: a.size }))
      },
      state: await readState(env)
    });
  } catch (e) {
    return json({ error: e.message || "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF" }, e.status || 500);
  }
}
__name(handleLatest, "handleLatest");
async function handleReleases(env) {
  try {
    const releases = await listReleases(env);
    return json({
      releases: releases.map((r) => ({
        id: r.id,
        tag: r.tag_name,
        name: r.name,
        published_at: r.published_at,
        html_url: r.html_url,
        assets: (r.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size }))
      }))
    });
  } catch (e) {
    return json({ error: e.message || "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF" }, e.status || 500);
  }
}
__name(handleReleases, "handleReleases");
async function handleAdminModsList(env) {
  return json({ mods: await listMods(env) });
}
__name(handleAdminModsList, "handleAdminModsList");
function extractJarsFromZip(buf, maxBytes) {
  let files;
  try {
    files = unzipSync(new Uint8Array(buf), {
      filter: /* @__PURE__ */ __name((f) => (f.name.split("/").pop() || "").toLowerCase().endsWith(".jar"), "filter")
    });
  } catch (e) {
    throw new Error("ZIP \u89E3\u538B\u5931\u8D25: " + (e.message || "\u65E0\u6CD5\u89E3\u6790\u538B\u7F29\u5305"));
  }
  const entries = [];
  for (const [path, data] of Object.entries(files)) {
    const segments = path.replace(/\\/g, "/").split("/").filter(Boolean);
    const fileName = segments.pop();
    if (!fileName || !fileName.toLowerCase().endsWith(".jar")) continue;
    if (data.byteLength > maxBytes) {
      throw new Error(`ZIP \u4E2D\u7684 ${fileName} \u8D85\u8FC7\u5927\u5C0F\u4E0A\u9650`);
    }
    entries.push({ name: fileName, data, inMods: segments.some((s) => s.toLowerCase() === "mods") });
  }
  let selected = entries.filter((e) => e.inMods);
  if (selected.length === 0) selected = entries;
  const byName = /* @__PURE__ */ new Map();
  for (const e of selected) byName.set(e.name, e);
  return [...byName.values()].map((e) => ({
    name: e.name,
    data: e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength)
  }));
}
__name(extractJarsFromZip, "extractJarsFromZip");
async function handleAdminUpload(request, env) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return json({ error: "\u672A\u6536\u5230\u6587\u4EF6" }, 400);
    const name = file.name;
    const lower = name.toLowerCase();
    if (!lower.endsWith(".jar") && !lower.endsWith(".zip")) {
      return json({ error: "\u4EC5\u652F\u6301 .jar \u6A21\u7EC4\u6216 .zip \u538B\u7F29\u5305\uFF08\u81EA\u52A8\u89E3\u538B\u5E76\u63D0\u53D6 mods \u4E2D\u7684\u6A21\u7EC4\uFF09" }, 400);
    }
    const maxBytes = parseInt(env.MAX_UPLOAD_MB || "100", 10) * 1024 * 1024;
    const buf = await file.arrayBuffer();
    if (buf.byteLength > maxBytes) return json({ error: "\u6587\u4EF6\u8D85\u8FC7\u5927\u5C0F\u4E0A\u9650" }, 400);
    if (lower.endsWith(".jar")) {
      const mod = await putMod(env, name, buf, buf.byteLength);
      const publishResult2 = await tryPublish(env);
      return json({ ok: true, mod, publish: publishResult2 });
    }
    const jars = extractJarsFromZip(buf, maxBytes);
    if (jars.length === 0) return json({ error: "ZIP \u4E2D\u672A\u627E\u5230\u4EFB\u4F55 .jar \u6A21\u7EC4\u6587\u4EF6" }, 400);
    const mods = [];
    try {
      for (const jar of jars) {
        mods.push(await putMod(env, jar.name, jar.data, jar.data.byteLength));
      }
    } catch (e) {
      await Promise.all(jars.map((j) => env.MODS_R2.delete(j.name).catch(() => {
      })));
      throw e;
    }
    const publishResult = await tryPublish(env);
    return json({ ok: true, count: mods.length, mods, publish: publishResult });
  } catch (e) {
    return json({ error: e.message || "\u4E0A\u4F20\u5931\u8D25" }, e.status || 500);
  }
}
__name(handleAdminUpload, "handleAdminUpload");
async function handleAdminRename(request, env) {
  try {
    const body = await request.json();
    const { oldName, newName } = body || {};
    if (!oldName || !newName) return json({ error: "\u7F3A\u5C11\u53C2\u6570" }, 400);
    if (!newName.toLowerCase().endsWith(".jar")) return json({ error: "\u65B0\u540D\u79F0\u5FC5\u987B\u4EE5 .jar \u7ED3\u5C3E" }, 400);
    if (oldName === newName) return json({ error: "\u65B0\u65E7\u540D\u79F0\u76F8\u540C" }, 400);
    await renameMod(env, oldName, newName);
    const publishResult = await tryPublish(env);
    return json({ ok: true, name: newName, publish: publishResult });
  } catch (e) {
    return json({ error: e.message || "\u91CD\u547D\u540D\u5931\u8D25" }, e.status || 500);
  }
}
__name(handleAdminRename, "handleAdminRename");
async function handleAdminDelete(request, env, name) {
  try {
    const decoded = decodeURIComponent(name);
    await removeMod(env, decoded);
    const publishResult = await tryPublish(env);
    return json({ ok: true, name: decoded, publish: publishResult });
  } catch (e) {
    return json({ error: e.message || "\u5220\u9664\u5931\u8D25" }, e.status || 500);
  }
}
__name(handleAdminDelete, "handleAdminDelete");
async function handleAdminPublish(request, env) {
  try {
    let message = "";
    try {
      const body = await request.json();
      message = (body || {}).message || "";
    } catch (_) {
    }
    const result = await publish(env, message);
    return json({ ok: true, result });
  } catch (e) {
    return json({ error: e.message || "\u53D1\u5E03\u5931\u8D25" }, e.status || 500);
  }
}
__name(handleAdminPublish, "handleAdminPublish");
async function handleAdminReleaseRollback(request, env) {
  try {
    const body = await request.json();
    const { id, tag } = body || {};
    if (!id) return json({ error: "\u7F3A\u5C11\u7248\u672C ID" }, 400);
    const release = await getRelease(env, id);
    const asset = (release.assets || []).find((a) => a.name.toLowerCase().endsWith(".zip"));
    if (!asset) return json({ error: "\u8BE5\u7248\u672C\u6CA1\u6709\u6A21\u7EC4\u5305\u8D44\u4EA7\uFF0C\u65E0\u6CD5\u56DE\u6EDA" }, 400);
    const zipped = await getReleaseAsset(env, asset.id);
    const maxBytes = parseInt(env.MAX_UPLOAD_MB || "100", 10) * 1024 * 1024;
    const jars = extractJarsFromZip(zipped, maxBytes);
    if (jars.length === 0) return json({ error: "\u6A21\u7EC4\u5305\u4E2D\u672A\u627E\u5230\u4EFB\u4F55 .jar \u6A21\u7EC4" }, 400);
    const rollTag = tag || release.tag_name;
    const existing = await listMods(env);
    for (const m of existing) {
      await deleteRepoFile(env, `mods/${m.name}`, `\u56DE\u6EDA\u5230 ${rollTag}\uFF1A\u79FB\u9664 ${m.name}`);
    }
    for (const jar of jars) {
      await writeRepoFile(env, `mods/${jar.name}`, jar.data, `\u56DE\u6EDA\u5230 ${rollTag}\uFF1A\u6062\u590D ${jar.name}`);
    }
    const publishResult = await tryPublish(env);
    return json({ ok: true, count: jars.length, tag: rollTag, publish: publishResult });
  } catch (e) {
    return json({ error: e.message || "\u56DE\u6EDA\u5931\u8D25" }, e.status || 500);
  }
}
__name(handleAdminReleaseRollback, "handleAdminReleaseRollback");
async function handleAdminReleaseDelete(request, env, id) {
  try {
    const release = await getRelease(env, id);
    await deleteRelease(env, id);
    try {
      await deleteTag(env, release.tag_name);
    } catch (_) {
    }
    const state = await readState(env);
    const latest = await getLatestRelease(env);
    if (latest) {
      state.lastReleaseId = latest.id;
      state.lastReleaseTag = latest.tag_name;
      const v = String(latest.tag_name).replace(/^v/i, "");
      if (v) state.currentVersion = v;
    } else {
      state.lastReleaseId = null;
      state.lastReleaseTag = null;
    }
    await writeState(env, state);
    return json({ ok: true, tag: release.tag_name });
  } catch (e) {
    return json({ error: e.message || "\u5220\u9664\u5931\u8D25" }, e.status || 500);
  }
}
__name(handleAdminReleaseDelete, "handleAdminReleaseDelete");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/auth/login") return handleLogin(env);
    if (path === "/auth/callback") return handleCallback(request, env);
    if (path === "/auth/logout") {
      await deleteSession(env, getSessionToken(request));
      return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": clearSessionCookie() } });
    }
    if (path === "/api/me") {
      const session = await getSession(env, getSessionToken(request));
      const user = session ? { login: session.login, name: session.name, avatar_url: session.avatar_url } : null;
      return json({ user, isAdmin: user ? user.login === env.ADMIN_LOGIN : false });
    }
    if (path === "/api/mods") return handleMods(env);
    if (path === "/api/mirrors") return handleMirrors(request);
    if (path === "/api/releases/latest") return handleLatest(env);
    if (path === "/api/releases") return handleReleases(env);
    if (path === "/api/admin/mods" || path.startsWith("/api/admin/mods/")) {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      if (path === "/api/admin/mods" && request.method === "GET") return handleAdminModsList(env);
      if (path === "/api/admin/mods" && request.method === "POST") return handleAdminUpload(request, env);
      if (path === "/api/admin/mods/rename" && request.method === "POST") return handleAdminRename(request, env);
      if (request.method === "DELETE") {
        const name = path.slice("/api/admin/mods/".length);
        if (name) return handleAdminDelete(request, env, name);
      }
      return json({ error: "\u4E0D\u652F\u6301\u7684\u8BF7\u6C42" }, 404);
    }
    if (path === "/api/admin/publish" && request.method === "POST") {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      return handleAdminPublish(request, env);
    }
    if (path === "/api/admin/releases/rollback" && request.method === "POST") {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      return handleAdminReleaseRollback(request, env);
    }
    if (path.startsWith("/api/admin/releases/")) {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      const id = path.slice("/api/admin/releases/".length);
      if (id && request.method === "DELETE") return handleAdminReleaseDelete(request, env, id);
      return json({ error: "\u4E0D\u652F\u6301\u7684\u8BF7\u6C42" }, 404);
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
