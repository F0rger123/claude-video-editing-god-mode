// hf-paper: Paper Shaders (github.com/paper-design/shaders, Apache-2.0) as
// seek-safe HyperFrames layers.
//
//   <div class="hf-shader" id="bg1" data-shader="grain-gradient" data-preset="wave"
//        data-params='{"colors":["#ff5a1f","#ffd166"],"colorBack":"#120a06"}'
//        data-speed="1" data-t0="0"></div>
//
// Time NEVER comes from requestAnimationFrame: every mount is created with
// speed 0 (Paper stops its rAF loop) and is redrawn with setFrame(ms) from the
// HyperFrames `hf-seek` event (fired by the runtime on every seek, in preview,
// snapshot and render). frame(t) = frame0 + (t - t0) * speed * 1000, so any
// time always gives the same pixels regardless of seek order.
//
// Extra (ours, not Paper's):
//   data-jitter='{"fps":12,"amount":0.004}'  boil the grain like film: offsetX/Y
//       get a hashed per-step nudge (deterministic, steps at `fps`)
//   image "gen:radial" | "gen:radial-inv" | "gen:vertical" | "gen:flat"
//       a generated grey ramp, e.g. to drive halftone dot size as a vignette
//   HFPaper.tween(tl, "#bg1", {distortion: .2}, {distortion: .9}, at, dur, ease)
//       GSAP-driven param animation (fromTo on a proxy, seek-safe)
import * as Core from "@paper-design/shaders";
import * as R from "@paper-design/shaders-react";

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const REG = {};
for (const [name, val] of Object.entries(R)) {
  if (val && val.$$paper && typeof val.type === "function") {
    const presets = R[name[0].toLowerCase() + name.slice(1) + "Presets"] || [];
    REG[kebab(name)] = { name, fn: val.type, presets };
  }
}
// these three pre-process their image with React hooks (useLayoutEffect); not supported here
const NEEDS_HOOKS = new Set(["heatmap", "liquid-metal", "gem-smoke"]);

// --- ported from @paper-design/shaders-react (Apache-2.0): set-min-image-size + processUniforms
function setMinImageSize(img) {
  if (img.naturalWidth < 1024 && img.naturalHeight < 1024) {
    if (img.naturalWidth < 1 || img.naturalHeight < 1) return;
    const aspect = img.naturalWidth / img.naturalHeight;
    img.width = Math.round(aspect > 1 ? 1024 * aspect : 1024);
    img.height = Math.round(aspect > 1 ? 1024 : 1024 / aspect);
  }
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`hf-paper: could not load image ${String(url).slice(0, 80)}`));
    img.src = url;
  });
}
async function processUniforms(uniforms) {
  const out = {};
  const jobs = [];
  for (const [k, v] of Object.entries(uniforms)) {
    if (typeof v === "string") {
      jobs.push(loadImage(v || Core.emptyPixel).then((img) => { setMinImageSize(img); out[k] = img; }));
    } else if (typeof HTMLImageElement !== "undefined" && v instanceof HTMLImageElement) {
      jobs.push(v.decode().then(() => { setMinImageSize(v); out[k] = v; }));
    } else out[k] = v;
  }
  await Promise.all(jobs);
  return out;
}
// ---

function genImage(kind, w, h) {
  const c = document.createElement("canvas");
  const s = 1024 / Math.max(w, h);
  c.width = Math.max(2, Math.round(w * s));
  c.height = Math.max(2, Math.round(h * s));
  const g = c.getContext("2d");
  const [cx, cy] = [c.width / 2, c.height * 0.42];
  const rad = Math.hypot(c.width, c.height) * 0.6;
  let grad;
  if (kind === "radial" || kind === "radial-inv") {
    grad = g.createRadialGradient(cx, cy, rad * 0.12, cx, cy, rad);
    const a = kind === "radial" ? "#ffffff" : "#000000", b = kind === "radial" ? "#000000" : "#ffffff";
    grad.addColorStop(0, a); grad.addColorStop(0.55, a === "#ffffff" ? "#d0d0d0" : "#303030"); grad.addColorStop(1, b);
  } else if (kind === "vertical") {
    grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "#ffffff"); grad.addColorStop(1, "#000000");
  } else {
    g.fillStyle = "#808080"; g.fillRect(0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };

const layers = new Map(); // id -> layer
let lastTime = 0;

function resolvePreset(entry, presetName) {
  if (!presetName) return entry.presets[0]?.params || {};
  const p = entry.presets.find((x) => x.name.toLowerCase() === String(presetName).toLowerCase());
  if (!p) console.warn(`hf-paper: preset "${presetName}" not found for ${entry.name}; have ${entry.presets.map((x) => x.name).join(", ")}`);
  return (p || entry.presets[0])?.params || {};
}

function uniformsFor(layer, params) {
  const el = layer.entry.fn(params);
  return { fragmentShader: el.props.fragmentShader, uniforms: el.props.uniforms, speed: el.props.speed, frame: el.props.frame };
}

function frameAt(layer, t) {
  return layer.frame0 + (t - layer.t0) * layer.speed * 1000;
}

function jitterParams(layer, t) {
  const j = layer.jitter;
  if (!j) return null;
  const k = Math.floor(Math.max(0, t - layer.t0) * (j.fps || 12) + 1e-6);
  const a = j.amount ?? 0.004;
  return { offsetX: (layer.params.offsetX || 0) + a * (hash(k) - 0.5) * 2, offsetY: (layer.params.offsetY || 0) + a * (hash(k + 7919) - 0.5) * 2 };
}

function numericUniforms(u) {
  const out = {};
  for (const [k, v] of Object.entries(u)) {
    if (typeof v === "number" || typeof v === "boolean" || Array.isArray(v)) out[k] = v;
  }
  return out;
}

function drawLayer(layer, t) {
  if (!layer.mount) return;
  const jp = jitterParams(layer, t);
  if (jp || layer.dirty) {
    const p = jp ? { ...layer.params, ...jp } : layer.params;
    layer.mount.setUniformValues(numericUniforms(uniformsFor(layer, p).uniforms));
    layer.dirty = false;
  }
  layer.mount.setFrame(frameAt(layer, t));
}

async function mountLayer(el) {
  const kind = (el.dataset.shader || "").toLowerCase();
  const entry = REG[kind];
  if (!entry) throw new Error(`hf-paper: unknown shader "${kind}". Known: ${Object.keys(REG).join(", ")}`);
  if (NEEDS_HOOKS.has(kind)) throw new Error(`hf-paper: "${kind}" needs React hooks for image pre-processing; not supported`);
  const user = el.dataset.params ? JSON.parse(el.dataset.params) : {};
  const params = { ...resolvePreset(entry, el.dataset.preset), ...user };
  const r = el.getBoundingClientRect();
  const W = r.width || el.offsetWidth || 1080, H = r.height || el.offsetHeight || 1920;
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.startsWith("gen:")) params[k] = genImage(v.slice(4), W, H);
  }
  const id = el.id || `hf-shader-${layers.size}`;
  const layer = layers.get(id) || {}; // keep `pending` params set before the mount finished
  Object.assign(layer, {
    id, el, entry, params,
    speed: el.dataset.speed !== undefined ? parseFloat(el.dataset.speed) : (params.speed ?? 1),
    frame0: el.dataset.frame !== undefined ? parseFloat(el.dataset.frame) : (params.frame ?? 0),
    t0: parseFloat(el.dataset.t0 || "0"),
    jitter: el.dataset.jitter ? JSON.parse(el.dataset.jitter) : null,
    mount: null, dirty: false,
  });
  layers.set(id, layer);
  const u = uniformsFor(layer, params);
  const uniforms = await processUniforms(u.uniforms);
  const minPR = parseFloat(el.dataset.minPixelRatio || "1");
  const maxPx = parseFloat(el.dataset.maxPixelCount || String(1920 * 1080 * 4));
  layer.mount = new Core.ShaderMount(el, u.fragmentShader, uniforms, { preserveDrawingBuffer: true, antialias: false }, 0, frameAt(layer, lastTime), minPR, maxPx);
  if (!layer.mount.program) throw new Error(`hf-paper: shader program for ${kind} failed to compile`);
  if (layer.pending) { Object.assign(layer.params, layer.pending); layer.pending = null; layer.dirty = true; }
  drawLayer(layer, lastTime);
  return layer;
}

function seek(t) {
  lastTime = Math.max(0, Number(t) || 0);
  for (const layer of layers.values()) drawLayer(layer, lastTime);
}

function setParams(selOrId, partial) {
  const id = String(selOrId).replace(/^#/, "");
  const layer = layers.get(id);
  if (!layer) return;
  if (!layer.mount) { layer.pending = { ...(layer.pending || {}), ...partial }; return; }
  Object.assign(layer.params, partial);
  layer.dirty = true;
  drawLayer(layer, lastTime);
}

// GSAP param tween, registered synchronously on the composition timeline.
function tween(tl, sel, from, to, at, duration, ease = "power2.inOut") {
  const proxy = { ...from };
  const keys = Object.keys(to);
  tl.fromTo(proxy, { ...from }, {
    ...to, duration, ease, immediateRender: false,
    onUpdate: () => setParams(sel, Object.fromEntries(keys.map((k) => [k, proxy[k]]))),
  }, at);
}

let readyPromise = null;
function init(root = document) {
  if (readyPromise) return readyPromise;
  const els = [...root.querySelectorAll("[data-shader]")];
  // ids first, so tween()/setParams() calls made synchronously find their layer
  els.forEach((el, i) => { if (!el.id) el.id = `hf-shader-${i}`; layers.set(el.id, { id: el.id, el, mount: null, params: {}, pending: null }); });
  readyPromise = Promise.all(els.map((el) => mountLayer(el).catch((e) => { console.error(e); throw e; }))).then((ls) => {
    seek(lastTime);
    document.documentElement.setAttribute("data-hf-paper-ready", String(ls.length));
    return ls.length;
  });
  return readyPromise;
}

window.addEventListener("hf-seek", (e) => seek(e.detail ? e.detail.time : 0));

const api = { init, seek, setParams, tween, shaders: Object.keys(REG).filter((k) => !NEEDS_HOOKS.has(k)), presets: (k) => (REG[k]?.presets || []).map((p) => p.name), layers, version: "0.0.81" };
window.HFPaper = api;

// auto-init: register the build hold synchronously so the runtime waits for the GL programs + textures
const start = () => {
  window.__hf = window.__hf || {};
  window.__hf.buildReady = window.__hf.buildReady || {};
  window.__hf.buildReady["hf-paper"] = init();
};
if (document.readyState === "loading") {
  // the buildReady key must exist before the runtime's first readiness check
  window.__hf = window.__hf || {};
  window.__hf.buildReady = window.__hf.buildReady || {};
  let resolveHold;
  window.__hf.buildReady["hf-paper"] = new Promise((r) => { resolveHold = r; });
  document.addEventListener("DOMContentLoaded", () => { init().then(resolveHold, (e) => resolveHold(Promise.reject(e))); });
} else start();

export default api;
