'use strict';
// Registrazione di una traccia dall'ingresso audio (microfono, scheda audio) mentre il progetto suona.
// Armando una traccia vuota si apre l'ingresso scelto e il VU meter mostra il segnale in arrivo;
// la registrazione parte con la riproduzione (pre-click compreso) e finisce con pausa/stop,
// il file va nella libreria e prende il posto della traccia. La traccia resta armata: una nuova
// ripresa sostituisce solo il tratto registrato e mantiene il resto.

const rec = { active: false, busy: false, moduleReady: null };
// ingresso aperto: resta attivo finché c'è una traccia armata (serve al VU meter)
const input = { stream: null, source: null, analysers: [], key: null, channels: 1, opening: null, raf: 0,
  devices: [], level: 0, clipUntil: 0, buf: new Float32Array(1024) };

const REC_PREFS = 'noises.recInput';
function loadRecPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(REC_PREFS) || '{}'); } catch {}
  state.recDevice = p.device || '';
  state.recChannel = ['stereo', '1', '2'].includes(p.channel) ? p.channel : 'stereo';
}
function saveRecPrefs() {
  try { localStorage.setItem(REC_PREFS, JSON.stringify({ device: state.recDevice, channel: state.recChannel })); } catch {}
}

/** Aggiunge una traccia vuota in fondo al progetto e la arma per la registrazione. */
async function addEmptyTrack() {
  if (!state.current) return null;
  if (state.pending) await new Promise((r) => { const w = setInterval(() => { if (!state.pending) { clearInterval(w); r(); } }, 100); });
  pushUndo('Aggiungi traccia vuota');
  const n = engine.tracks.filter(isEmptyTrack).length + 1;
  const t = engine.addTrack({ name: newTrackName(), song: '', part: 'original', label: `Registrazione ${n}`, clips: [], rec: true, ...emptyAudio() });
  selectTracks([t.name]);
  saveProject();
  buildTracks();
  scrollTrackIntoView(t);
  setRecTarget(t.name);
  return t;
}

/** Arma (o disarma con null) la traccia in cui registrare: armata, il suo VU meter mostra l'ingresso. */
function setRecTarget(name) {
  if (rec.active) return;
  state.recTarget = name;
  syncTrackButtons();
  if (name) openInput().catch(inputError);
  else closeInput();
}

/** Traccia in cui finirà la registrazione: quella armata, altrimenti quella vuota selezionata. */
function recTargetTrack() {
  const armed = state.recTarget && engine.tracks.find((t) => t.name === state.recTarget);
  if (armed && isRecTrack(armed)) return armed;
  return engine.tracks.find((t) => isEmptyTrack(t) && state.selTracks.has(t.name)) || null;
}

function recSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
}

// ------------------------------------------------------------------ ingresso

async function openInput() {
  if (!recSupported()) throw new Error('insecure');
  if (input.opening) await input.opening.catch(() => {});
  if (input.stream && input.key === state.recDevice) return input;
  input.opening = (async () => {
    closeInput();
    // segnale "pulito": niente elaborazioni pensate per le chiamate; fino a 2 canali (ingressi 1 e 2 della scheda)
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } };
    if (state.recDevice) audio.deviceId = { exact: state.recDevice };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (e) {
      if (!state.recDevice || !['OverconstrainedError', 'NotFoundError'].includes(e.name)) throw e;
      // il dispositivo scelto non c'è più: si torna a quello predefinito
      state.recDevice = '';
      saveRecPrefs();
      delete audio.deviceId;
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    }
    engine.ctx.resume();
    const source = engine.ctx.createMediaStreamSource(stream);
    const splitter = engine.ctx.createChannelSplitter(2);
    source.connect(splitter);
    const analysers = [0, 1].map((i) => {
      const a = engine.ctx.createAnalyser();
      a.fftSize = 1024;
      splitter.connect(a, i);
      return a;
    });
    const settings = stream.getAudioTracks()[0].getSettings ? stream.getAudioTracks()[0].getSettings() : {};
    Object.assign(input, { stream, source, splitter, analysers, key: state.recDevice, channels: settings.channelCount || 1, level: 0 });
    stream.getAudioTracks()[0].addEventListener('ended', () => { if (input.stream === stream) closeInput(); });
    await refreshInputDevices(); // dopo il permesso i dispositivi hanno un nome
    startMeter();
  })();
  try { await input.opening; } finally { input.opening = null; }
  return input;
}

function closeInput() {
  if (rec.active) return;
  cancelAnimationFrame(input.raf);
  input.raf = 0;
  if (input.stream) input.stream.getTracks().forEach((t) => t.stop());
  for (const n of [input.source, input.splitter, ...input.analysers]) { try { n && n.disconnect(); } catch {} }
  Object.assign(input, { stream: null, source: null, splitter: null, analysers: [], key: null, level: 0 });
  document.querySelectorAll('.vu-fill').forEach((f) => { f.style.width = '100%'; });
  document.querySelectorAll('.vu').forEach((v) => v.classList.remove('clip', 'live'));
}

function inputError(e) {
  state.recTarget = null;
  syncTrackButtons();
  closeInput();
  if (e.message === 'insecure') alert('La registrazione richiede una pagina sicura (HTTPS o localhost) e un browser con accesso all\'audio in ingresso.');
  else if (e.name === 'NotAllowedError') alert('Accesso all\'ingresso audio negato: consentilo dalle impostazioni del browser per registrare.');
  else if (e.name === 'NotFoundError') alert('Nessun ingresso audio trovato.');
  else alert(`Impossibile aprire l'ingresso audio: ${e.message}`);
}

async function refreshInputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    input.devices = (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  } catch { input.devices = []; }
  document.querySelectorAll('.rec-dev').forEach(fillDeviceSelect);
}

function fillDeviceSelect(sel) {
  const opts = [['', 'Ingresso predefinito'], ...input.devices.map((d, i) => [d.deviceId, d.label || `Ingresso ${i + 1}`])];
  if (state.recDevice && !opts.some(([v]) => v === state.recDevice)) opts.push([state.recDevice, 'Ingresso scelto']);
  sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  sel.value = state.recDevice;
  sel.title = `Sorgente della registrazione: ${sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : ''}`;
}

/** Riga "ingresso" delle tracce vuote: sorgente, canali e VU meter. */
function setupRecLine(t, row) {
  const dev = row.querySelector('.rec-dev'), ch = row.querySelector('.rec-ch');
  fillDeviceSelect(dev);
  ch.value = state.recChannel;
  dev.disabled = ch.disabled = rec.active;
  // la prima volta i nomi dei dispositivi non ci sono: aprendo l'elenco si chiede il permesso
  dev.addEventListener('pointerdown', () => { if (!input.stream && state.recTarget !== t.name) setRecTarget(t.name); });
  dev.addEventListener('change', () => {
    state.recDevice = dev.value;
    saveRecPrefs();
    document.querySelectorAll('.rec-dev').forEach(fillDeviceSelect);
    if (state.recTarget !== t.name) setRecTarget(t.name);
    else openInput().catch(inputError);
  });
  ch.addEventListener('change', () => {
    state.recChannel = ch.value;
    saveRecPrefs();
    document.querySelectorAll('.rec-ch').forEach((s) => { s.value = state.recChannel; });
  });
}

/** Picco dei canali scelti nell'ultimo blocco. */
function inputPeak() {
  const peak = (i) => {
    const a = input.analysers[i];
    if (!a) return 0;
    a.getFloatTimeDomainData(input.buf);
    let m = 0;
    for (let j = 0; j < input.buf.length; j++) { const v = Math.abs(input.buf[j]); if (v > m) m = v; }
    return m;
  };
  const two = input.channels > 1;
  if (state.recChannel === '1' || !two) return peak(0);
  if (state.recChannel === '2') return peak(1);
  return Math.max(peak(0), peak(1));
}

function startMeter() {
  if (input.raf) return;
  const step = () => {
    input.raf = requestAnimationFrame(step);
    const targetName = rec.active || rec.busy ? rec.target : state.recTarget;
    const target = targetName && engine.tracks.find((t) => t.name === targetName);
    if (!target && !rec.active && !rec.busy) { closeInput(); return; }
    const p = inputPeak();
    input.level = Math.max(p, input.level * 0.9); // discesa morbida
    const now = performance.now();
    if (p >= 0.99) input.clipUntil = now + 1500;
    // scala in dB: -60 dB … 0 dB
    const frac = input.level > 0 ? Math.max(0, Math.min(1, 1 + (20 * Math.log10(input.level)) / 60)) : 0;
    for (const t of engine.tracks) {
      if (!t.row || !isRecTrack(t)) continue;
      const vu = t.row.querySelector('.vu');
      if (!vu) continue;
      const on = t === target;
      vu.classList.toggle('live', on);
      vu.classList.toggle('clip', on && now < input.clipUntil);
      vu.firstElementChild.style.width = on ? `${(1 - frac) * 100}%` : '100%';
    }
  };
  input.raf = requestAnimationFrame(step);
}

// ------------------------------------------------------------- registrazione

async function startRecording() {
  if (rec.active || rec.busy) return;
  if (!state.current) { toast('Apri un progetto per registrare'); return; }
  if (!recSupported() || !engine.node) { inputError(new Error('insecure')); return; }
  if (engine.tempo !== 100) { toast('Per registrare riporta la velocità al 100%'); return; }
  if (engine.loop) { toast('Disattiva il loop per registrare'); return; }
  rec.busy = true;
  updateRecUI();
  try {
    if (engine.playing) engine.pause();
    // progetto vuoto o nessuna traccia vuota pronta: se ne crea una
    const target = recTargetTrack() || await addEmptyTrack();
    if (state.recTarget !== target.name) setRecTarget(target.name);
    await openInput();
    if (!rec.moduleReady) rec.moduleReady = engine.ctx.audioWorklet.addModule('rec-worklet.js');
    await rec.moduleReady;
    const node = new AudioWorkletNode(engine.ctx, 'noises-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const sink = engine.ctx.createGain();
    sink.gain.value = 0; // il nodo deve essere collegato all'uscita per essere elaborato, ma resta muto
    input.source.connect(node);
    node.connect(sink).connect(engine.ctx.destination);
    const chunks = [];
    node.port.onmessage = (e) => {
      if (e.data.type !== 'chunk') return;
      chunks.push(e.data);
      if (rec.active) { addLivePeaks(e.data); requestRedraw(); }
    };
    Object.assign(rec, { node, sink, chunks, target: target.name, live: null });
    playWithCountIn();
    if (!engine.playing) throw new Error('riproduzione non avviata');
    const track = input.stream.getAudioTracks()[0];
    // ritardo tra il suono emesso e il suono ricatturato: uscita + ingresso
    const latency = (engine.ctx.outputLatency || 0) + (engine.ctx.baseLatency || 0) + ((track.getSettings && track.getSettings().latency) || 0);
    Object.assign(rec, { active: true, latency, channel: input.channels > 1 ? state.recChannel : '1',
      t0: engine.t0, startPos: engine.offset, timer: setInterval(watchPlayback, 100),
      from: Math.round((engine.t0 + latency) * engine.sr), live: new Float32Array(4096), liveN: 0 });
    chunks.forEach(addLivePeaks);
    document.querySelectorAll('.rec-dev, .rec-ch').forEach((s) => { s.disabled = true; });
  } catch (e) {
    cleanupRecording();
    inputError(e);
  } finally {
    rec.busy = false;
    updateRecUI();
  }
}

/** Pausa, stop o fine del brano chiudono la registrazione. */
function watchPlayback() {
  if (!rec.active) return;
  if (!engine.playing) { stopRecording(); return; }
  // registrando oltre la fine del progetto la timeline si allunga
  if (engine.duration - engine.position() < 5) {
    engine.origDuration += 30;
    engine.duration = engine.origDuration * engine.k();
    engine.post({ type: 'length', length: Math.round(engine.origDuration * engine.sr) });
    layoutTimeline();
  }
}

async function stopRecording() {
  if (!rec.active) return;
  const end = engine.ctx.currentTime;
  if (engine.playing) engine.pause();
  rec.active = false;
  rec.busy = true;
  clearInterval(rec.timer);
  updateRecUI();
  const { node, chunks, latency, t0, startPos, target, channel } = rec;
  try {
    await new Promise((resolve) => {
      const prev = node.port.onmessage;
      node.port.onmessage = (e) => { prev(e); if (e.data.type === 'done') resolve(); };
      node.port.postMessage('stop');
      setTimeout(resolve, 1000);
    });
    cleanupRecording();
    const sr = engine.sr;
    const from = Math.round((t0 + latency) * sr), to = Math.round((end + latency) * sr);
    const len = to - from;
    if (len < sr * 0.3) { toast('Registrazione troppo breve: scartata'); engine.updateLength(true); layoutTimeline(); return; }
    // canali scelti: 1 o 2 → traccia mono da quell'ingresso, 1+2 → stereo
    const stereo = channel === 'stereo' && chunks.some((c) => c.r);
    const pick = (c) => (channel === '2' ? c.r || c.l : c.l);
    const l = new Float32Array(len), r = stereo ? new Float32Array(len) : l;
    for (const c of chunks) {
      const at = c.frame - from;
      const s = Math.max(0, -at), e = Math.min(c.l.length, len - at);
      if (e <= s) continue;
      l.set(pick(c).subarray(s, e), at + s);
      if (stereo) r.set((c.r || c.l).subarray(s, e), at + s);
    }
    await saveRecording(l, r, stereo, startPos, target);
  } catch (e) {
    alert(`Salvataggio della registrazione fallito: ${e.message}`);
  } finally {
    cleanupRecording();
    rec.busy = false;
    rec.live = null;
    updateRecUI();
    requestRedraw();
    document.querySelectorAll('.rec-dev, .rec-ch').forEach((s) => { s.disabled = false; });
  }
}

// ------------------------------------------------- forma d'onda dal vivo

/** Aggiorna i picchi della ripresa in corso (blocchi di PEAK_BLOCK campioni dall'inizio della ripresa). */
function addLivePeaks(c) {
  if (!rec.live) return;
  const sig = rec.channel === '2' ? [c.r || c.l] : rec.channel === 'stereo' && c.r ? [c.l, c.r] : [c.l];
  for (let i = 0; i < c.l.length; i++) {
    const at = c.frame + i - rec.from;
    if (at < 0) continue; // pre-click e latenza: fuori dalla ripresa
    const b = Math.floor(at / PEAK_BLOCK);
    if (b >= rec.live.length) {
      const grown = new Float32Array(rec.live.length * 2);
      grown.set(rec.live);
      rec.live = grown;
    }
    let v = 0;
    for (const s of sig) { const a = s[i] < 0 ? -s[i] : s[i]; if (a > v) v = a; }
    if (v > rec.live[b]) rec.live[b] = v;
    if (b + 1 > rec.liveN) rec.liveN = b + 1;
  }
}

/** Disegna sopra la traccia il tratto registrato finora (chiamata da drawTrack). */
function drawRecLive(t) {
  if (!rec.live || rec.target !== t.name || !t.canvas) return;
  const ctx = t.canvas.getContext('2d'), w = t.canvas.width, h = t.canvas.height;
  const dpr = (window.devicePixelRatio || 1) * uiZoom();
  const sl = tlEl().scrollLeft, z = state.zoom, k = engine.k(), bps = engine.sr / PEAK_BLOCK;
  const x0 = (rec.startPos * z - sl) * dpr;
  const x1 = ((rec.startPos + (rec.liveN / bps) * k) * z - sl) * dpr;
  if (x1 < 0 || x0 > w || x1 <= x0) return;
  const mid = h / 2;
  // la nuova ripresa copre ciò che c'era sotto
  ctx.clearRect(x0, 0, x1 - x0, h);
  ctx.fillStyle = '#ff4d5e22';
  ctx.fillRect(x0, 2 * dpr, x1 - x0, h - 4 * dpr);
  ctx.fillStyle = '#ff4d5e';
  for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
    const b0 = Math.max(0, Math.floor((((sl + x / dpr) / z - rec.startPos) / k) * bps));
    const b1 = Math.max(b0 + 1, Math.floor((((sl + (x + 1) / dpr) / z - rec.startPos) / k) * bps));
    let peak = 0;
    for (let i = b0; i < b1 && i < rec.liveN; i++) if (rec.live[i] > peak) peak = rec.live[i];
    const y = Math.max(dpr * 0.5, peak * (mid - 4 * dpr) * 0.95);
    ctx.fillRect(x, mid - y, 1, y * 2);
  }
}

function cleanupRecording() {
  clearInterval(rec.timer);
  if (input.source && rec.node) { try { input.source.disconnect(rec.node); } catch {} }
  for (const n of [rec.node, rec.sink]) { try { n && n.disconnect(); } catch {} }
  Object.assign(rec, { node: null, sink: null, timer: null });
}

/**
 * Nuova ripresa su una traccia già registrata: l'audio esistente (come appare nella timeline)
 * resta, il tratto appena registrato lo sostituisce. Restituisce l'audio unito e il suo inizio.
 */
async function mergeWithTake(target, l, r, stereo, startPos) {
  setLoader('Unione con la ripresa precedente…', '', null);
  const res = await fetch(sourceUrl(target.song, 'original'));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const old = await decodeToArrays(await res.arrayBuffer());
  const sr = engine.sr, st = stereo || old.r !== old.l;
  let lo = startPos, hi = startPos + l.length / sr;
  for (const c of target.clips) { lo = Math.min(lo, c.start); hi = Math.max(hi, c.start + c.duration); }
  const n = Math.round((hi - lo) * sr);
  const L = new Float32Array(n), R = st ? new Float32Array(n) : L;
  const put = (sl, sr2, from, at, len) => {
    len = Math.min(len, sl.length - from, n - at);
    if (len <= 0 || at < 0 || from < 0) return;
    L.set(sl.subarray(from, from + len), at);
    if (st) R.set(sr2.subarray(from, from + len), at);
  };
  for (const c of target.clips) put(old.l, old.r, Math.round(c.offset * sr), Math.round((c.start - lo) * sr), Math.round(c.duration * sr));
  put(l, r, 0, Math.round((startPos - lo) * sr), l.length);
  return { l: L, r: R, stereo: st, start: lo };
}

async function saveRecording(l, r, stereo, startPos, targetName) {
  const project = state.current;
  const prev = engine.tracks.find((x) => x.name === targetName && isRecTrack(x));
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const name = `Registrazione ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}.${p2(d.getMinutes())}`;
  try {
    if (prev && !isEmptyTrack(prev) && prev.clips.length) ({ l, r, stereo, start: startPos } = await mergeWithTake(prev, l, r, stereo, startPos));
    const file = new File([encodeWav(stereo ? [l, r] : [l], engine.sr)], `${name}.wav`, { type: 'audio/wav' });
    setLoader('Salvataggio della registrazione…', name, null);
    const song = await uploadFile(file);
    await addToCurrentPlaylist(song);
    await refreshSongs();
    if (state.current !== project) return;
    pushUndo('Registra traccia');
    const target = engine.tracks.find((x) => x.name === targetName && isRecTrack(x));
    const t = engine.addTrack({ name: newTrackName(), song: song.id, part: 'original', rec: true, label: target ? target.label : '',
      clips: [{ id: newClipId(), start: +startPos.toFixed(3), offset: 0, duration: l.length / engine.sr }],
      l, r, peaks: computePeaks(l, r) });
    if (target) {
      // la registrazione prende il posto della traccia: stessa posizione, nome, mix e gruppo
      Object.assign(t, { muted: target.muted, solo: target.solo, volume: target.volume });
      engine.tracks.splice(engine.tracks.indexOf(t), 1);
      engine.tracks.splice(engine.tracks.indexOf(target), 0, t);
      for (const g of state.groups || []) g.tracks = g.tracks.map((n) => (n === target.name ? t.name : n));
      engine.removeTrack(target);
    }
    // la traccia resta armata: premendo di nuovo ⏺ si registra un'altra ripresa sulla stessa traccia
    if (state.recTarget === targetName) state.recTarget = t.name;
    engine.updateGains();
    engine.updateLength(true);
    selectTracks([t.name]);
    saveProject();
    buildTracks();
    scrollTrackIntoView(t);
    toast(`Traccia registrata: "${name}"`);
  } finally {
    setLoader(null);
  }
}

/** WAV PCM 16 bit. */
function encodeWav(channels, sr) {
  const nc = channels.length, n = channels[0].length;
  const buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return buf;
}

function updateRecUI() {
  const b = $('#rec');
  b.classList.toggle('on', rec.active);
  b.disabled = rec.busy;
  b.title = rec.active ? 'Ferma la registrazione (R)' : 'Registra una traccia dall\'ingresso audio mentre il progetto suona (R)';
}

function toggleRecording() {
  if (rec.active) stopRecording();
  else startRecording();
}

function setupRecorder() {
  loadRecPrefs();
  $('#rec').addEventListener('click', toggleRecording);
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyR' || e.ctrlKey || e.metaKey || e.altKey || !state.current) return;
    if (e.target.matches('input:not([type=range]):not([type=checkbox]), select, textarea')) return;
    e.preventDefault();
    toggleRecording();
  });
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', refreshInputDevices);
  }
  refreshInputDevices();
  updateRecUI();
}
