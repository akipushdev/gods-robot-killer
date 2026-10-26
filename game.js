'use strict';
// ====================== ВВОД ======================
const keys = new Set(), pressed = new Set(), keyT = {};   // keyT — когда клавишу нажали (мс), чтобы отличать «держать» от «нажать»
const KEYMAP = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'sit', ArrowDown: 'sit',
  Space: 'jump', KeyJ: 'arm', KeyK: 'leg', KeyL: 'kunai', KeyQ: 'rotL', KeyE: 'rotR', KeyR: 'restart', KeyM: 'mute', KeyI: 'help', KeyH: 'hook', KeyY: 'taxi', KeyF: 'dodge', KeyO: 'combos', KeyP: 'plog', KeyN: 'music', KeyZ: 'zoom', KeyG: 'take', KeyT: 'test', KeyU: 'maps', KeyB: 'tal' };
function keyDown(name) { if (!keys.has(name)) { pressed.add(name); keyT[name] = performance.now(); if (name === 'dodge') game.dodgeBuf = 0.4; } keys.add(name); }   // уворот запоминается на треть секунды: нажатие не теряется на паузе удара
function keyUp(name) { keys.delete(name); }
const typing = e => { const t = e.target; return !!t && (t.tagName === 'INPUT' || (t.tagName === 'TEXTAREA' && !t.readOnly)); };   // v242: в поле ввода (название карты) клавиши игре не уходят
addEventListener('keydown', e => { if (typing(e)) return; const n = KEYMAP[e.code]; if (!n) return; e.preventDefault(); if (!e.repeat) keyDown(n); onUserGesture(); });
addEventListener('keyup', e => { const n = KEYMAP[e.code]; if (n) { e.preventDefault(); keyUp(n); } });
addEventListener('blur', () => keys.clear());

// ---- v289: геймпад (Алексей 24.10: «прикрутить геймпад»). Обычная раскладка (Xbox / PlayStation через браузер):
// левый стик и крестовина — идти / вверх / присесть; A (крест) — прыжок; X (квадрат) — удар рукой (J); B (круг) — удар ногой (K); Y (треугольник) — кунай (L);
// LB / RB — повернуть мир (Q / E); LT — крюк (H); RT — уворот (F); нажать правый стик — взять (G); левый стик — такси (Y); Back/Share — осмотр (Z); Start/Options — подсказка (I).
// Кнопки геймпада и клавиатуры не мешают друг другу: отпустил кнопку — действие снимается, только если та же клавиша не зажата на клавиатуре.
// v293 (Алексей: «сделаем поворот камеры на LT и RT, а что там стояло — туда»): LT/RT — поворот мира, LB — крюк, RB — уворот
// v298 (Алексей: «на геймпаде кнопкой уворота пусть станет нажатие правого стика»): R3 (11) — уворот, RB (5) — взять оружие
const PADMAP = { 0: 'jump', 1: 'kunai', 2: 'arm', 3: 'leg', 4: 'hook', 5: 'take', 6: 'rotL', 7: 'rotR', 8: 'zoom', 9: 'help', 10: 'tal', 12: 'up', 13: 'sit', 14: 'left', 15: 'right' };
const PAD = { held: new Set(), kb: new Set(), on: false };
addEventListener('keydown', e => { if (!typing(e)) PAD.lastKbT = performance.now(); const n = KEYMAP[e.code]; if (n && !typing(e)) PAD.kb.add(n); });   // v298: любая клавиша — подсказки снова клавиатурные
addEventListener('mousedown', () => { PAD.lastKbT = performance.now(); });
addEventListener('keyup', e => { const n = KEYMAP[e.code]; if (n) PAD.kb.delete(n); });
addEventListener('blur', () => { PAD.kb.clear(); PAD.held.clear(); });
addEventListener('gamepadconnected', e => { PAD.on = true; try { showCombo('Геймпад подключён: ' + (e.gamepad.id || '').split('(')[0].trim().slice(0, 40), true); } catch (er) {} });
addEventListener('gamepaddisconnected', () => { PAD.on = false; for (const n of PAD.held) if (!PAD.kb.has(n)) keyUp(n); PAD.held.clear(); });
// v289 (Алексей 24.10: «перестала нажиматься кнопка назад, перс бесконтрольно бежит назад»; «мир вращается только в одну сторону, а RB/LB должны в разные»):
// у его геймпада браузер раскладывает кнопки не по обычной схеме. Поэтому: (1) кнопка или ось считаются, только если их уже видели в покое после
// подключения (залипшее с самого начала — не нажатие); оси — от их положения покоя (у некоторых геймпадов курки лежат на −1); (2) «🎮 геймпад»
// (кнопка вверху, появляется, когда геймпад подключён; или зажать Start+Back) — настройка: игра по очереди просит нажать каждое действие и
// запоминает раскладку для этого геймпада (в браузере). Своя раскладка есть — работает она, нет — обычная.
const PAD_ACTS = [['left', 'идти влево'], ['right', 'идти вправо'], ['up', 'вверх (лестница, дверь)'], ['sit', 'вниз / присесть'], ['jump', 'прыжок'], ['arm', 'удар рукой (J)'], ['leg', 'удар ногой (K)'], ['kunai', 'кунай (L)'],
  ['rotL', 'повернуть мир влево (Q) — курок LT'], ['rotR', 'повернуть мир вправо (E) — курок RT'], ['hook', 'крюк (H) — LB'], ['dodge', 'уворот (F) — нажать правый стик'], ['take', 'взять оружие (G) — RB']];
function padStore(id, m) { try { if (m) localStorage.setItem('grkPad:' + id, JSON.stringify(m)); else return JSON.parse(localStorage.getItem('grkPad:' + id) || 'null'); } catch (e) { return null; } }
function padFirst() { if (!navigator.getGamepads) return null; for (const g of navigator.getGamepads()) if (g && g.connected) return g; return null; }
function padWizStart() { const gp = padFirst(); if (!gp) { try { showCombo('Геймпад не найден — подключи и нажми любую кнопку', true); } catch (e) {} return; }
  PAD.wiz = { i: 0, map: {}, base: gp.axes.slice(), wait: 0.4, id: gp.id }; for (const n of [...PAD.held]) if (!PAD.kb.has(n)) keyUp(n); PAD.held.clear(); padWizShow(); }
function padWizShow() { const el = document.getElementById('padWiz'); if (!el) return; const W2 = PAD.wiz; el.hidden = !W2; if (!W2) return;
  document.getElementById('padWizT').textContent = 'Нажми на геймпаде: ' + PAD_ACTS[W2.i][1]; document.getElementById('padWizS').textContent = (W2.i + 1) + ' из ' + PAD_ACTS.length + ' · Esc — пропустить действие'; }
function padWizTick(gp, dt) {
  const W2 = PAD.wiz; if (W2.wait > 0) { W2.wait -= dt; W2.base = gp.axes.slice(); return; }
  let got = null;
  gp.buttons.forEach((b, i) => { if (!got && b && (b.pressed || b.value > 0.6) && !Object.values(W2.map).some(q => q.t === 'b' && q.i === i)) got = { t: 'b', i }; });
  if (!got) gp.axes.forEach((v, i) => { const d = v - (W2.base[i] || 0); if (!got && Math.abs(d) > 0.6) { const q = { t: 'a', i, s: Math.sign(d), base: Math.round((W2.base[i] || 0) * 100) / 100 }; if (!Object.values(W2.map).some(o => o.t === 'a' && o.i === q.i && o.s === q.s)) got = q; } });
  if (got || pressed.has('_skip')) { if (got) W2.map[PAD_ACTS[W2.i][0]] = got; W2.i++; W2.wait = 0.45; pressed.delete('_skip');
    if (W2.i >= PAD_ACTS.length) { W2.map._v293 = 1; W2.map._v298 = 1; W2.map._v303 = 1; W2.map._v306 = 1; padStore(W2.id, W2.map); PAD.custom = { id: W2.id, map: W2.map }; PAD.wiz = null; padWizShow(); try { showCombo('Геймпад настроен и запомнен', true); } catch (e) {} return; } padWizShow(); }
}
addEventListener('keydown', e => { if (PAD.wiz && e.code === 'Escape') { pressed.add('_skip'); e.preventDefault(); } });
let padLastT = 0;
function padPoll() {
  const now = performance.now(), dt = Math.min(0.1, (now - (padLastT || now)) / 1000); padLastT = now;
  const gp = padFirst(), btn = document.getElementById('padBtn'); if (btn) btn.hidden = !gp;
  if (!gp) { if (PAD.held.size) { for (const n of PAD.held) if (!PAD.kb.has(n)) keyUp(n); PAD.held.clear(); } return; }
  if (PAD.wiz) { padWizTick(gp, dt); return; }
  const R = PAD.rest && PAD.rest.id === gp.id + gp.index ? PAD.rest : (PAD.rest = { id: gp.id + gp.index, ax: [], bt: [], base: gp.axes.map(v => Math.abs(v) > 0.9 ? Math.sign(v) : 0) });
  const bOn = i => { const b = gp.buttons[i]; const on = !!b && (b.pressed || b.value > 0.5); if (!on) R.bt[i] = true; return on && !!R.bt[i]; };
  const aV = i => { const v = gp.axes[i] || 0; if (Math.abs(v) < 0.25) R.ax[i] = true; return R.ax[i] ? v : 0; };   // стик: покой — середина
  if (!PAD.custom || PAD.custom.id !== gp.id) { const m = padStore(gp.id);
    if (m && !m._v293) { const sw = (a, c) => { const t = m[a]; if (m[c]) m[a] = m[c]; else delete m[a]; if (t) m[c] = t; else delete m[c]; }; sw('rotL', 'hook'); sw('rotR', 'dodge'); m._v293 = 1; padStore(gp.id, m); }   /* v293: в своей раскладке поворот ↔ крюк/уворот (курки ↔ бамперы), один раз */
    if (m && !m._v298) { const t = m.dodge; if (m.take) m.dodge = m.take; else delete m.dodge; if (t) m.take = t; else delete m.take; m._v298 = 1; padStore(gp.id, m); }   /* v298: уворот ↔ взять (на правый стик) */
    if (m && !m._v306) { const t = m.leg; if (m.kunai) m.leg = m.kunai; else delete m.leg; if (t) m.kunai = t; else delete m.kunai; if (m.dodge && m.dodge.t === 'a' && m.dodge.i === 3) delete m.dodge; m._v306 = 1; m._v303 = 1; padStore(gp.id, m); }   /* v306 (Алексей: «поменяй ногу и кунай; уворот — на кнопку прыжка»): */
    if (m && !m._v303) { if (m.dodge && m.dodge.t === 'b' && m.dodge.i === 11) m.dodge = { t: 'a', i: 3, base: 0, s: -1 }; m._v303 = 1; padStore(gp.id, m); }   /* v303 (Алексей: «уворот — правый стик вверх, а не нажатие»): */
    PAD.custom = m ? { id: gp.id, map: m } : { id: gp.id, map: null }; }
  const want = new Set();
  if (PAD.custom.map) { for (const k in PAD.custom.map) { const q = PAD.custom.map[k]; if (!q || typeof q !== 'object') continue; if (q.t === 'b' ? bOn(q.i) : (((gp.axes[q.i] || 0) - q.base) * q.s > 0.55)) want.add(k); } }
  else { for (const i in PADMAP) if (bOn(+i)) want.add(PADMAP[i]); const ax = aV(0), ay = aV(1), dz = 0.55; if (ax < -dz) want.add('left'); if (ax > dz) want.add('right'); if (ay < -0.65) want.add('up'); if (ay > 0.65) want.add('sit'); }
  if (bOn(8) && bOn(9) && !PAD.combo) { PAD.combo = true; padWizStart(); return; } if (!(bOn(8) && bOn(9))) PAD.combo = false;   // Start+Back — настройка
  if (!game.started && want.has('jump') && !PAD.held.has('jump')) { const b = document.getElementById('startBtn'); if (b && b.offsetParent !== null) b.click(); }   // на заставке A — «Начать»
  { const raw = []; gp.buttons.forEach((b2, i) => { if (b2 && (b2.pressed || b2.value > 0.5)) raw.push('b' + i); }); gp.axes.forEach((v, i) => { if (Math.abs(v - (R.base[i] || 0)) > 0.5) raw.push('a' + i + (v > 0 ? '+' : '-')); });   // v291: журнал — что пришло с геймпада
    const rk = raw.join(','); if (rk !== PAD.rawK) { const nw = raw.filter(x => !(PAD.rawK || '').split(',').includes(x)); PAD.rawK = rk;
      if (nw.length && (PAD.rawN = (PAD.rawN || 0) + 1) <= 200 && typeof plog === 'function') plog('геймпад', nw.join(',') + ' → ' + ([...want].filter(n => !PAD.held.has(n)).join(',') || 'ничего')); } }
  if ((gp.axes[3] || 0) < -0.6) want.add('dodge');   /* v306b (Алексей: «вырвать провод — как было, правый стик вверх»): стик вверх — по-прежнему F */
  // v306: уворот — на кнопке прыжка: когда над героем горит подсказка уворота, нажатие прыжка — уворот (до отпускания кнопки), иначе — прыжок
  if (want.has('jump')) { if (PAD.aDodge || (!PAD.held.has('jump') && game.dodge && !(hero.ride && hero.ride.mode === 'hang'))) { want.delete('jump'); want.add('dodge'); PAD.aDodge = true; } } else PAD.aDodge = false;
  for (const n of want) if (!PAD.held.has(n)) { keyDown(n); PAD.held.add(n); if ((PAD.rawK || '').includes('b') || !/^(left|right|up|sit)$/.test(n)) PAD.lastPad = performance.now(); try { onUserGesture(); } catch (er) {} }
  for (const n of [...PAD.held]) if (!want.has(n)) { PAD.held.delete(n); if (!PAD.kb.has(n)) keyUp(n); }
}
{ const b = document.getElementById('padBtn'); if (b) b.addEventListener('click', padWizStart); else addEventListener('DOMContentLoaded', () => { const b2 = document.getElementById('padBtn'); if (b2) b2.addEventListener('click', padWizStart); }); }

// v291 (Алексей: «повороты с геймпада иногда плохо срабатывают, игра лагает»): браузер не сообщает о нажатиях геймпада сам — их надо опрашивать.
// Раньше опрос шёл раз в кадр: если кадр подвис на 100+ мс, короткое нажатие (нажал-отпустил между кадрами) терялось. Теперь опрос ещё и каждые 8 мс.
setInterval(() => { if (navigator.getGamepads && PAD.on !== false) padPoll(); }, 8);
// ====================== ЗВУК ======================
let actx = null, master = null, musicGain = null, muted = false, musicStarted = false, musicOff = false; try { musicOff = localStorage.getItem('rk_music') === '0'; } catch (e) {}
function toggleMusic() { musicOff = !musicOff; if (musicGain) musicGain.gain.value = musicOff ? 0 : 0.5; try { localStorage.setItem('rk_music', musicOff ? '0' : '1'); } catch (e) {} musicBtnShow(); }
function musicBtnShow() { const b = document.getElementById('musicBtn'); if (b) { b.classList.toggle('off', musicOff); const t = b.querySelector('span'); if (t) t.textContent = musicOff ? 'музыка выкл' : 'музыка'; } }
const buffers = {};
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.connect(actx.destination);
    musicGain = actx.createGain(); musicGain.gain.value = musicOff ? 0 : 0.5; musicGain.connect(master);
    for (const n of D.audio) {
      fetch('audio/' + n + '.mp3').then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(buf => { buffers[n] = buf; if (n === 'music') startMusic(); }).catch(() => {});
    }
  } catch (err) { actx = null; }
}
function startMusic() {
  if (musicStarted || !actx || !buffers.music || !game.started) return;
  musicStarted = true;
  const s = actx.createBufferSource(); s.buffer = buffers.music; s.loop = true; s.connect(musicGain); s.start();
}
let whistleAt = -9;
function whistle() {                    // свист падающей бомбы: тон съезжает вниз чуть больше секунды, в конце громче
  if (!actx || actx.currentTime - whistleAt < 0.25) return; const t = actx.currentTime, dur = 1.25; whistleAt = t;
  const o = actx.createOscillator(), g = actx.createGain(), lfo = actx.createOscillator(), lg = actx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(2300, t); o.frequency.exponentialRampToValueAtTime(520, t + dur);
  lfo.frequency.value = 9; lg.gain.value = 22; lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.25); g.gain.exponentialRampToValueAtTime(0.2, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
}
function cannonSound() {                // выстрел из пушки: глухой удар с падающим тоном и хвост шума
  if (!actx) return; const t = actx.currentTime, n = Math.floor(actx.sampleRate * 0.5), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) { const k = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 3.2); }
  const src = actx.createBufferSource(); src.buffer = buf; const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.4); const g = actx.createGain(); g.gain.setValueAtTime(1.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); src.connect(lp); lp.connect(g); g.connect(master); src.start(t);
  const o = actx.createOscillator(), og = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.32); og.gain.setValueAtTime(1.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.45); o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.47);
  const c = actx.createOscillator(), cg = actx.createGain(); c.type = 'square'; c.frequency.setValueAtTime(900, t); c.frequency.exponentialRampToValueAtTime(120, t + 0.04); cg.gain.setValueAtTime(0.35, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.06); c.connect(cg); cg.connect(master); c.start(t); c.stop(t + 0.07);
}
function kickSound(n, hit) {           // резкий удар ногой: сухой хлопок со свистом; попадание — плотный глухой удар, каждый следующий ниже и громче
  if (!actx) return; const t = actx.currentTime, dur = hit ? 0.11 : 0.07, len = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) { const k = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, hit ? 3 : 1.6) * Math.min(1, i / 24); }
  const src = actx.createBufferSource(); src.buffer = buf; const bp = actx.createBiquadFilter(); bp.type = hit ? 'lowpass' : 'bandpass'; bp.Q.value = hit ? 0.7 : 1.2; bp.frequency.setValueAtTime(hit ? 2600 - 400 * n : 900, t); bp.frequency.exponentialRampToValueAtTime(hit ? 500 : 3600 + 300 * n, t + dur);
  const g = actx.createGain(); g.gain.value = hit ? 0.75 + 0.12 * n : 0.3 + 0.05 * n; src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
  if (!hit) return; const o = actx.createOscillator(), og = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(210 - 30 * n, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.1); og.gain.setValueAtTime(0.5 + 0.12 * n, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.13); o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.15);
}
function knifeSound(hit) {              // нож: взмах — короткий свист; попадание — режущий скрежет по металлу со звоном
  if (!actx) return; const t = actx.currentTime, dur = hit ? 0.2 : 0.1, n = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) { const k = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, hit ? 2.2 : 1.4) * Math.min(1, i / 60); }
  const src = actx.createBufferSource(); src.buffer = buf; const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = hit ? 5 : 1.6; bp.frequency.setValueAtTime(hit ? 5200 : 1700, t); bp.frequency.exponentialRampToValueAtTime(hit ? 2600 : 5200, t + dur);
  const g = actx.createGain(); g.gain.value = hit ? 0.9 : 0.32; src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
  if (!hit) return;
  for (const [f, v, dd] of [[2637, 0.1, 0.22], [3951, 0.07, 0.16], [5274, 0.04, 0.1]]) { const o = actx.createOscillator(), og = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f * (1 + Math.random() * 0.03), t); o.frequency.exponentialRampToValueAtTime(f * 0.97, t + dd); og.gain.setValueAtTime(v, t); og.gain.exponentialRampToValueAtTime(0.0005, t + dd); o.connect(og); og.connect(master); o.start(t); o.stop(t + dd + 0.02); }
  const sc = actx.createOscillator(), sg = actx.createGain(), sf = actx.createBiquadFilter(); sc.type = 'sawtooth'; sc.frequency.setValueAtTime(1300, t); sc.frequency.exponentialRampToValueAtTime(420, t + 0.07); sf.type = 'highpass'; sf.frequency.value = 1800; sg.gain.setValueAtTime(0.16, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.08); sc.connect(sf); sf.connect(sg); sg.connect(master); sc.start(t); sc.stop(t + 0.09);
}
function zapSound(vol = 0.5, dur = 0.3) {   // искрит оборванный провод: частый сухой треск и гул разряда
  if (!actx) return; const t = actx.currentTime, n = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0); let on = 0, left = 0;
  for (let i = 0; i < n; i++) { if (left-- <= 0) { on = Math.random() < 0.55 ? 0.4 + Math.random() * 0.6 : 0; left = 40 + Math.random() * 380; } const k = i / n; d[i] = (Math.random() * 2 - 1) * on * (1 - k * 0.6); }
  const src = actx.createBufferSource(); src.buffer = buf; const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400; const g = actx.createGain(); g.gain.value = vol; src.connect(hp); hp.connect(g); g.connect(master); src.start(t);
  const o = actx.createOscillator(), og = actx.createGain(), of = actx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(96 + Math.random() * 30, t); of.type = 'bandpass'; of.frequency.value = 1500; of.Q.value = 0.8; og.gain.setValueAtTime(vol * 0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(of); of.connect(og); og.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function popSound(vol = 0.9) {          // лопнувший шарик: резкий щелчок-шум и короткий падающий «бум»
  if (!actx) return; const t = actx.currentTime, n = Math.floor(actx.sampleRate * 0.16), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) { const k = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 7) * (i < 40 ? i / 40 : 1); }
  const src = actx.createBufferSource(); src.buffer = buf; const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; const g = actx.createGain(); g.gain.value = vol * 1.6; src.connect(hp); hp.connect(g); g.connect(master); src.start(t);
  const o = actx.createOscillator(), og = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.09); og.gain.setValueAtTime(vol * 0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.13); o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.14);
  const src2 = actx.createBufferSource(); src2.buffer = buf; src2.playbackRate.value = 0.45; const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; const g2 = actx.createGain(); g2.gain.value = vol * 0.5; src2.connect(lp); lp.connect(g2); g2.connect(master); src2.start(t + 0.015);
}
function sfx(name, vol = 1, rate = 1) {
  if (!actx || !buffers[name]) return;
  const s = actx.createBufferSource(); s.buffer = buffers[name]; s.playbackRate.value = rate;
  const g = actx.createGain(); g.gain.value = vol; s.connect(g); g.connect(master); s.start();
}
function onUserGesture() { initAudio(); if (actx && actx.state === 'suspended') actx.resume(); }
// v243: «const rnd…» перенесено в ядро — src/06b_world.js
// v243: «const pick…» перенесено в ядро — src/06b_world.js

// ====================== ГЕРОЙ ======================
// Состояния и переходы повторяют аниматор оригинала (MainCharAC из сборки 0.0.5).
//   lock — движение заблокировано, пока играет клип; loco — можно разворачиваться на ходу.
const ST = {
  Stay: { clip: 'Stay', loop: true, loco: true }, RunSlow: { clip: 'RunSlow', loop: true, loco: true }, RunFast: { clip: 'RunFast', loop: true, loco: true, speed: 2 },
  JumpInRun: { clip: 'JumpInRun', loco: true }, DoubleJump: { clip: 'JumpInRun', loco: true }, Fly: { clip: 'Fly', loop: true, loco: true }, Grounded: { clip: 'Grounded', loco: true },
  Sit: { clip: 'Sit', lock: true, loco: true },
  HandAttack1: { clip: 'HandAttack', n: '1', lock: true }, HandAttack2: { clip: 'HandAttack', n: '2', lock: true }, HandAttack3: { clip: 'HandAttack', n: '3', lock: true },
  LegsAttackUp1: { clip: 'LegsAttackUp', n: '1', lock: true }, LegsAttackUp2: { clip: 'LegsAttackUp', n: '2', lock: true },
  KunaiThrow: { clip: 'KunaiThrow' }, AirThrow: { clip: 'AirThrow' }, HookThrow: { clip: 'KunaiThrow', speed: 1.6 },
  SitAttack1: { clip: 'SitAttack', n: '1', lock: true }, SitAttack2: { clip: 'SitAttack', n: '2', lock: true },
  // комбо
  LegsAttackKunai: { clip: 'LegsAttackKunaiR', lock: true }, LegsAttackUp: { clip: 'LegsAttackUp', lock: true },
  JumpLegsAttack: { clip: 'JumpLegsAttack', lock: true, noJump: true }, JumpLegsAttack2: { clip: 'JumpLegsAttack2', lock: true, levitate: true },
  Kulbit: { clip: 'KulbitBackR', lock: true }, CordRip: { clip: 'CordRip', lock: true }, Take: { clip: 'Take', loop: true, lock: true },
  // нож: удары рукой с ножом на земле и в прыжке; удар ногой в пол — когда стоишь на роботе
  KnifeAttack1: { clip: 'KnifeAttack', n: '1', lock: true }, KnifeAttack2: { clip: 'KnifeAttack', n: '2', lock: true }, KnifeAttack3: { clip: 'KnifeAttack', n: '3', lock: true },
  JumpKnife1: { clip: 'JumpKnife', n: '1', lock: true }, JumpKnife2: { clip: 'JumpKnife', n: '2', lock: true },
  Stomp1: { clip: 'Stomp', n: '1', lock: true }, Stomp2: { clip: 'Stomp', n: '2', lock: true },
  // вилка: три удара током; вилка в гнездо на спине робота и удержание с разрядами
  ForkAttack1: { clip: 'ForkAttack', n: '1', lock: true }, ForkAttack2: { clip: 'ForkAttack', n: '2', lock: true }, ForkAttack3: { clip: 'ForkAttack', n: '3', lock: true },
  ForkPlug: { clip: 'ForkPlug', lock: true }, ForkHold: { clip: 'ForkHold', loop: true, lock: true }, ForkPull: { clip: 'ForkPull', lock: true }, ForkBeam: { clip: 'ForkBeam', loop: true, lock: true }, ForkDash: { clip: 'ForkDash', loop: true, lock: true }, ForkAir: { clip: 'ForkAir', lock: true },
  PromCharge: { clip: 'FireAttack', n: '1', loop: true, lock: true, speed: 0.12 },   // копит огненный шар: кулак отведён назад, дрожит
};
// v243: объект героя (const hero) перенесён в ядро — src/06b_world.js; здесь его поведение
const ghosts = [];
hero.anim.onEvent = (name) => heroEvent(name);
const save = { x: 0, y: 0, z: 0, k: 0, t: 0 };
// Комбо из оригинала: последние 4 нажатия, без ограничения по времени; срабатывает последнее подходящее в списке.
let inputQ = [];
const COMBOS = [
  { name: 'JumpLegsAttack', seq: ['leg', 'leg', 'up'], st: 'JumpLegsAttack' },
  { name: 'JumpLegsAttack2', seq: ['up', 'leg', 'leg', 'leg'], st: 'JumpLegsAttack2' },
  { name: 'LegsAttackKunai', seq: ['sit', 'leg', 'kunai', 'leg'], st: 'LegsAttackKunai' },
  { name: 'LegsAttackUp', seq: ['leg', 'up', 'leg'], st: 'LegsAttackUp' },
  { name: 'Нож, нож, нога', seq: ['arm', 'arm', 'leg'], st: 'LegsAttackUp', knife: true, head: true, tal: 'k2' },
  { name: 'Кунай и два ножа', seq: ['kunai', 'arm', 'arm'], knife: true, tele: true, tal: 'k3' },
  { name: 'Удар с неба', seq: ['jump', 'jump', 'leg'], dive: true },
];
const QUEUE_KEYS = ['up', 'left', 'sit', 'right', 'arm', 'leg', 'kunai', 'jump'];

// Серии ударов: каждое новое нажатие, пока не прошла секунда после прошлого удара, даёт следующий клип серии.
const KNIFE_SERIES = ['KnifeAttack1', 'KnifeAttack2'], AIR_KNIFE = ['JumpKnife1', 'JumpKnife2'], STOMP_SERIES = ['Stomp1', 'Stomp2'];
const onBot = () => !!hero.standOn && !hero.standOn.dead && robots.indexOf(hero.standOn) >= 0;   // герой стоит на живом роботе
const ARM_SERIES = ['HandAttack1', 'HandAttack2', 'HandAttack3'], LEG_SERIES = ['LegsAttackUp1', 'LegsAttackUp2', 'JumpLegsAttack'];
function nextIn(kind, list) {
  const sr = hero.series[kind];
  sr.i = game.time - sr.t < 1.0 ? (sr.i + 1) % list.length : 0; sr.t = game.time + 5;   // +5: пока клип играет, серия не «остывает»
  return list[sr.i];
}
function go(st, o = {}) {
  const def = ST[st], fireHit = hero.prom && /^HandAttack[123]$/.test(st); const [nm, flip] = fireHit ? heroClip(hero.onGround ? 'FireAttack' : 'JumpFire', st === 'HandAttack2' ? '2' : '1') : heroClip(def.clip, def.n || '');   // в Руках Прометея бьёт взмахом, как кинжалом, только взмах огненный
  hero.st = st; hero.hitOK = false;
  hero.anim.play(nm, { loop: !!def.loop, flip, restart: true, speed: (def.speed || 1) * (def.lock && heroWpn() ? heroWpn().spd : 1) });
  if (o.end) { hero.anim.t = hero.anim.clip.len; hero.anim.done = true; }
  if (hero.prom && /^HandAttack[123]$/.test(st)) { const ev = hero.anim.clip.events && hero.anim.clip.events[0]; if (ev) hero.anim.t = Math.max(0, ev[0] - 0.004); }   // огненный кулак бьёт сразу: замаха нет, рука уже вытянута; убирает её по старым кадрам
}
const setTrig = n => { hero.trig[n] = game.time; };
const hasTrig = n => hero.trig[n] !== undefined && game.time - hero.trig[n] < 0.6;
const useTrig = n => { if (hasTrig(n)) { delete hero.trig[n]; return true; } return false; };

function resetHero() {
  Object.assign(hero, { x: (LEVEL.spawn || LEVEL.start).x, y: (LEVEL.spawn || LEVEL.start).y, z: (LEVEL.spawn || LEVEL.start).z, vx: 0, vy: 0, face: 1, state: 'free', trig: {}, hp: heroMaxHP(), armor: 0, invuln: 0, onGround: false, deadT: 0, hang: null, hangCool: 0, boostT: 0, timeWithInput: 0, pushV: 0, airJumps: 1, jumpBuf: 0, ride: null, hitWin: null, kunai: kunaiMax(), standOn: null, onRobotT: 0, hook: null, hookCool: 0 });
  hero.series.arm.t = hero.series.leg.t = -9; kunaiRegen.length = 0;
  hero.burstT = 0; hero.burstDead = false; hero.wetT = 0; hero.washT = 0; hero.rip = null; hero.dash = null; hero.grab = null; hero.tele = null; hero.dive = null; hero.kride = null; hero.forkP = null; hero.beam = null;
  inputQ = []; go('Stay');
  Object.assign(save, { x: hero.x, y: hero.y, z: hero.z, k: 0 });
}
const NEAR_D = 0.9;                   // на сколько могут различаться глубины, чтобы двое считались стоящими рядом
const sameRow = (a, b) => Math.abs(toD(a) - toD(b)) <= NEAR_D;
// Робот доступен, если он в ряду героя или просто виден на экране: как и с кубами, глубина не мешает.
const reachD = (r, d) => !(r.away && !r.dead) && !(Math.abs(r.sh || 0) > 0.25) && (Math.abs(toD(r) - d) <= NEAR_D || !robotHidden(r));
const reach = r => reachD(r, toD(hero));
function floorAhead(dir) {            // есть ли опора на шаг вперёд (чтобы выпад не сносил с края)
  if (Math.abs(hero.y - Math.round(hero.y)) > 0.01) return true;
  return !!floorCube(Math.round(toU(hero) + Math.sign(dir) * 0.4), Math.round(hero.y) - 1, toD(hero), 'any');
}
function heroEvent(name) {
  if (hero.headJob && hero.st === hero.headJob.st) { if (name === 'AnimationEvent_LegsAttackUp1' || name === 'AnimationEvent_JumpLegs2Attack1') headPop(); else if (name === 'AnimationEvent_LegsAttackUp2' || name === 'AnimationEvent_JumpLegs2Attack2') headKick(); }
  if (name === 'ThrowKunai' || name === 'AnimationEvent_LegsAttackKnifeThrow') { if (hero.st === 'HookThrow') launchHook(); else throwKunai(); return; }
  if (/^AnimationEvent_Stomp/.test(name)) {   // удар ногой в пол: достаётся тому, на ком стоим
    const r = hero.standOn; sfx('Jump_4_landfall', 0.5, 1.2); game.shake = Math.max(game.shake, 0.07); hero.sq = -0.14; hero.sqV = 0;
    burst(hero.x, hero.y + 0.03, hero.z, { n: 9, cols: SPARK.concat(DIRT), sp: [1, 3.2], up: 0.8, life: 0.35 });
    if (r && !r.dead && robots.indexOf(r) >= 0) { game.melee = hero.st; damageRobot(r, CFG.hitDamage * 1.5); game.melee = null; hero.hitOK = true; r.sq = 0; r.sqV = 0; r.flashT = 0.12; if (!r.dead) { r.hitT = 0; r.anim.play('RobotAC_Stay', { restart: true }); r.clipT = 0; } r.carryT = Math.max(0, (r.carryT || 0) - 0.6); } return; }
  { const fm = /^AnimationEvent_Fork([123])$/.exec(name); if (fm) { forkHit(+fm[1]); return; } if (name === 'AnimationEvent_ForkPlug') { forkOnPlug(); return; } if (name === 'AnimationEvent_ForkAir') { hero.vy = Math.min(hero.vy, -6.5); hero.vx = hero.face * 2.6; forkHit(4); return; } }
  if (name === 'AnimationEvent_RunSlow') { sfx('RUN_1_13', 0.17, rnd(1.0, 1.3)); return; }
  if (name === 'AnimationEvent_RunFast') { sfx('RUN_1_13', 0.17, 1.3); return; }
  // v303 (Алексей: «чем чаще меняешь удар рука–нога, тем сильнее бьёшь, и чтобы это было видно»): счётчик чередования — удар не тем, что прошлый, и не позже 0.9 с после него
  { const mk = /^AnimationEvent_(HandAttack|LegsAttackUp)/.exec(name); if (mk && !hero.knife && !hero.prom) { const k = mk[1] === 'HandAttack' ? 'arm' : 'leg';
      hero.alt = k !== hero.altK && game.time - (hero.altT || -9) < 0.9 ? Math.min(4, (hero.alt || 0) + 1) : 0; hero.altK = k; hero.altT = game.time;
      if (hero.alt >= 2) { const f = hero.face; for (let i = 0; i < 3 + hero.alt * 3; i++) parts.push({ x: hero.x + f * rnd(0.2, 0.55) * view.r[0], y: hero.y + rnd(0.3, 0.6), z: hero.z + f * rnd(0.2, 0.55) * view.r[1], vx: f * rnd(2, 4 + hero.alt) * view.r[0], vz: f * rnd(2, 4 + hero.alt) * view.r[1], vy: rnd(-0.5, 0.8), g: 0, drag: 5, t: 0, life: rnd(0.12, 0.22), size: Math.random() < 0.4 ? 2 : 1, col: pick(['#ffffff', '#ffd052', '#ff9a3c']) }); } } }
  // каждый удар подаёт героя вперёд: на земле шаг, в воздушной серии — рывок
  const knifeEv = /^AnimationEvent_Knife/.test(name);
  if (hero.prom && /^AnimationEvent_HandAttack/.test(name)) { const f = hero.face; fireUse(1); sfx('RUN_1_13', 0.4, 0.8); knifeSound(false); const hq = heroHands().find(v => v[0] * f > 0) || [f * 0.3, 0.45]; for (let i = 0; i < 40; i++) { const sp = rnd(2.5, 7.5); parts.push({ x: hero.x + (hq[0] + rnd(-0.06, 0.06)) * view.r[0], y: hero.y + hq[1] + rnd(-0.08, 0.08), z: hero.z + (hq[0] + rnd(-0.06, 0.06)) * view.r[1], vx: -f * sp * view.r[0], vz: -f * sp * view.r[1], vy: rnd(-0.6, 1.4), g: -0.6, drag: 2.6, t: 0, life: rnd(0.25, 0.6), size: Math.random() < 0.45 ? 2 : 1, col: pick(['#ffd052', '#ff7014', '#ff7014', '#ff8a1e', '#e8501a']) }); } }   // отдача: искры срываются с кулака и летят назад, за спину героя
  if (knifeEv) { hero.kChain = game.time - (hero.kLast || -9) < 1.15 ? Math.min(5, (hero.kChain || 0) + 1) : 0; hero.kLast = game.time; knifeSound(false);   // чем чаще удары ножом, тем длиннее выпад
    const f = hero.face; for (let i = 0; i < 5 + hero.kChain * 2; i++) parts.push({ x: hero.x + f * rnd(0.1, 0.6) * view.r[0], y: hero.y + rnd(0.25, 0.6), z: hero.z + f * rnd(0.1, 0.6) * view.r[1], vx: f * rnd(2.5, 6) * view.r[0], vz: f * rnd(2.5, 6) * view.r[1], vy: rnd(-0.3, 0.5), g: 0, drag: 5, t: 0, life: rnd(0.12, 0.24), size: Math.random() < 0.3 ? 2 : 1, col: pick(['#ffffff', '#dff6ff', '#8fe8ff']) });
    if (hero.kChain >= 2) { burst(hero.x - f * 0.2 * view.r[0], hero.y + 0.05, hero.z - f * 0.2 * view.r[1], { n: 5, cols: DIRT, dir: -f, sp: [0.8, 2.2], life: 0.3 }); game.shake = Math.max(game.shake, 0.03); } }
  { const m = /^AnimationEvent_JumpLegs2Attack(\d)/.exec(name); hero.lkN = m && !hero.headJob ? +m[1] : 0;   // «велосипед»: каждый следующий удар ногой сильнее, со взмахом и искрами
    if (hero.lkN) { const f = hero.face, n = hero.lkN; kickArcs.push({ x: hero.x + f * 0.12 * view.r[0], y: hero.y + 0.2 + 0.05 * n, z: hero.z + f * 0.12 * view.r[1], dir: f, t: 0, follow: true }); kickSound(n, false);
      for (let i = 0; i < 4 + n * 3; i++) parts.push({ x: hero.x + f * rnd(0.15, 0.5) * view.r[0], y: hero.y + rnd(0.1, 0.4), z: hero.z + f * rnd(0.15, 0.5) * view.r[1], vx: f * rnd(2, 5 + n) * view.r[0], vz: f * rnd(2, 5 + n) * view.r[1], vy: rnd(-0.4, 0.6), g: 0, drag: 5, t: 0, life: rnd(0.12, 0.24), size: Math.random() < 0.3 ? 2 : 1, col: pick(['#ffffff', '#fff4e1', '#ffd27a']) }); } }
  hero.pushV = hero.face * (knifeEv ? 1.4 + 0.95 * hero.kChain : /JumpLegs2/.test(name) ? 2.6 : /JumpLegs/.test(name) ? 1.5 : hero.onGround ? 0.9 : 1.3);
  // удар «открыт» 0.2 с: попадание засчитывается, когда нарисованный замах героя касается нарисованного робота
  hero.hitWin = { t: 0.2, done: new Set() }; checkHits();
}
function robotSprite(r) {             // какой кадр робота сейчас на экране и где его опорная точка
  const flip = r.dir > 0; let name = r.anim.sprite(), ox = 0;
  if (!r.dead && r.atk) return { name, flip: r.atk.flip, ox: 0 };
  if (!r.dead && r.grabT > 0) return { name, flip: false, ox: 0 };   // новые кадры нарисованы лицом к камере, удар и луч — вправо
  if (!r.dead) {
    // куда робот смотрит относительно камеры: 0 — лицом к ней (обычные кадры), дальше — 16 кадров поворота
    const dl = norm180(r.fa - view.angle) + (r.buckT > 0 ? 70 * Math.sin(r.buckT * 42) : 0);   // когда стряхивает — крутит корпусом
    let k = ((Math.round(-dl / 22.5) % 16) + 16) % 16;
    if (k !== 0) { if (flip) k = (16 - k) % 16; name = 'RobotRot_' + k; ox = flip ? 0.03 : -0.03; }
  }
  return { name, flip, ox };
}
function dropStyle(what) {              // слот один: прежняя вещь выпадает у ног, чуть позади, и секунду её не подобрать
  const d = toD(hero), u = toU(hero), back = floorCube(Math.round(u - hero.face * 1.1), Math.round(hero.y) - 1, d, 'any') && !overlapsDepth(u - hero.face * 1.1, hero.y, 0.2, 0.5, d) ? u - hero.face * 1.1 : u, o = { x: 0, y: hero.y + 0.5, z: 0, got: false, ph: rnd(0, 6), cool: 1.4 }; setUD(o, back, d);
  o.stat = (hero.wStats || {})[what]; if (what === 'knife') knifeItem = o; else promItem = o; burst(o.x, o.y, o.z, { n: 8, cols: ['#fff4e1', '#c9d2d8'], sp: [0.6, 2], up: 1, life: 0.4 }); showCombo(what === 'knife' ? 'Нож выпал — руки заняты огнём' : 'Руки Прометея сброшены — в руке нож', true);
}
function drawPixFlame(cx, cy, w, h, seed, glow, down) {   // огонь из квадратов в пиксель героя. Ведёт себя как нарисованное пламя: волна бежит снизу вверх, язык гнётся крюком,
  // сбоку живёт второй язык пониже, в теле открывается просвет, а кончик отрывается и улетает искрой
  const g = S / 100, ph = Math.floor(game.time * 12) * 0.9 + seed, x0 = Math.round(cx / g), yb = Math.round(cy / g) + (down ? -2 : Math.max(3, Math.round(w * 0.3))); if (glow) pixelGlow(cx, cy, 0.5, 0.1, '255,150,50'); const ga0 = ctx.globalAlpha; ctx.globalAlpha = ga0 * 0.84;
  const hookDir = Math.sin(ph * 0.31) > 0 ? 1 : -1, hookAmt = 0.5 + 0.5 * Math.sin(ph * 0.47 + 1), gapK = 0.34 + ((ph * 0.09) % 0.42), gapSide = Math.sin(ph * 0.21 + 2) > 0 ? 1 : -1;
  const tongue = (W2, H2, ox, kHook, layers) => { for (const [col, kw, kh, lift] of layers) { ctx.fillStyle = col; const hh = Math.max(1, Math.round(H2 * kh));
      for (let r = 0; r < hh; r++) { const k = r / hh, prof = k < 0.22 ? 0.3 + 0.7 * Math.sin(k / 0.22 * 1.5708) : Math.pow(1 - (k - 0.22) / 0.78, 1.7), wob = 1 + 0.2 * Math.sin(k * 7.5 - ph * 1.7), hw = Math.max((W2 * kw / 2) * prof * wob, kw === 1 && k < 0.97 ? 0.5 : 0); if (hw < 0.4) continue;
        const c = ox + Math.sin(k * 4.3 - ph * 1.15) * (0.2 + 1.9 * k) + (k > 0.62 ? Math.pow((k - 0.62) / 0.38, 2) * W2 * 0.42 * hookDir * hookAmt * kHook : 0), L = Math.round(c - hw), R2 = Math.round(c + hw), y = (down ? yb + lift + r : yb - lift - r - 1) * g;
        if (kw === 1 && W2 >= 7 && k > gapK && k < gapK + 0.13 && R2 - L >= 4) { const m = Math.round(c + gapSide * hw * 0.3); ctx.fillRect((x0 + L) * g, y, Math.max(1, m - L) * g + 0.5, g + 0.5); ctx.fillRect((x0 + m + 1) * g, y, Math.max(1, R2 - m - 1) * g + 0.5, g + 0.5); }   // просвет
        else ctx.fillRect((x0 + L) * g, y, Math.max(1, R2 - L) * g + 0.5, g + 0.5); } } };
  const FULL = [['#ffd052', 1, 1, 0]], SIDE = [['#ffd052', 1, 1, 0]];
  tongue(w * 0.5, h * (0.5 + 0.12 * Math.sin(ph * 0.8)), -hookDir * w * 0.3, -0.7, SIDE);        // боковой язык пониже, гнётся в другую сторону
  tongue(w, h, 0, 1, FULL);
  const cyc = ((ph * 0.55) % 5 + 5) % 5; if (cyc < 3.2 && !down) { const ty = yb - h - 1 - Math.round(cyc * 2.2), tx = x0 + Math.round(W2c(w, hookDir, hookAmt) + Math.sin(ph + cyc) * 0.8), sz = cyc < 1.2 ? 2 : 1;   // оторвавшийся кончик: поднимается, мельчает, гаснет
    ctx.fillStyle = cyc < 2 ? '#ff7014' : '#e8501a'; ctx.fillRect(tx * g, (ty - sz) * g, sz * g + 0.5, (sz + (cyc < 1.2 ? 1 : 0)) * g + 0.5); if (cyc < 1.2) { ctx.fillStyle = '#ffce46'; ctx.fillRect(tx * g, (ty - 1) * g, g + 0.5, g + 0.5); } }
  ctx.globalAlpha = ga0;
}
const W2c = (w, d, a) => w * 0.42 * d * a;
const FLAME_V = [   // [сдвиг, высота, толщина, наклон, размах волны, крюк] — формы взяты с листа автора: костёр-пирамида, тонкий S-завиток, двойной завиток, малый язычок, широкий низкий
  [[0, 27, 6, 2, 2.2, 1], [-6, 16, 4.6, -4, 1.6, -1], [6, 13, 4, 5, 1.5, 1], [-11, 6, 3, -5, 0, 0], [11, 5, 3, 5, 0, 0]],
  [[0, 24, 4.2, 0, 5.5, 1.5], [-4, 8, 3, -3, 0, -1], [4, 6, 2.6, 4, 0, 1]],
  [[-3, 21, 4, -3, 4, -1.6], [4, 15, 3.6, 5, 3, 1.6], [0, 6, 4.2, 0, 0, 0]],
  [[0, 12, 3.6, 1, 1.6, 1.2], [-3, 6, 2.2, -3, 0, -0.6]],
  [[-5, 12, 4.4, -2, 2, -1.2], [5, 14, 4.4, 2, 2, 1.2], [0, 9, 5, 0, 1, 0], [-11, 5, 2.6, -5, 0, -0.5], [12, 6, 2.6, 5, 0, 0.6]]];
const flameCache = new Map();
function flameFrame(v, fr, sz) {        // один кадр языка: толстая линия вдоль изогнутого «хребта», к кончику сходит на нет и загибается
  const key = v + '|' + fr + '|' + sz; let c = flameCache.get(key); if (c) return c; const Wc = 56, Hc = 44, m = [0.55, 0.78, 1][sz]; c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const x = c.getContext('2d'), grid = new Uint8Array(Wc * Hc), ph = fr * 0.785;
  const pass = (lv, kr, grow, tmax) => { FLAME_V[v].forEach(([ox, h, r0, lean, A, hook], i) => { const hh = h * m * (1 + 0.13 * Math.sin(ph + i * 2.1)), N = Math.ceil(hh * 2.2);
      for (let n = 0; n <= N * tmax; n++) { const t = n / N, tip = t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) : 0, px = Wc / 2 + ox * m + lean * m * t + A * m * Math.sin(t * 5 - ph + i * 1.3) * t + hook * tip * hh * 0.34, py = hh * t - tip * hh * 0.13, rr = Math.max(0, r0 * 1.4 * m * Math.pow(1 - t, 0.62) * (0.8 + 0.2 * Math.min(1, t * 6)) * kr) + grow; if (rr < 0.45) continue;
        for (let yy = Math.floor(py - rr); yy <= py + rr; yy++) for (let xx = Math.floor(px - rr); xx <= px + rr; xx++) { if (yy < 0 || yy >= Hc || xx < 0 || xx >= Wc) continue; if (Math.hypot(xx + 0.5 - px, yy + 0.5 - py) <= rr && grid[yy * Wc + xx] < lv) grid[yy * Wc + xx] = lv; } } }); };
  pass(1, 1, 0.9, 1); pass(2, 1, 0, 1); pass(3, 0.56, 0, 0.72); pass(4, 0.26, 0, 0.4);
  const COL = ['', '#e0402a', '#ff7014', '#ffb03a', '#ffe08a']; for (let yy = 0; yy < Hc; yy++) for (let xx = 0; xx < Wc; xx++) { const g2 = grid[yy * Wc + xx]; if (g2) { x.fillStyle = COL[g2]; x.fillRect(xx, Hc - 1 - yy, 1, 1); } }
  flameCache.set(key, c); return c;
}
function drawCurlFlame(cx, fy, v, sz, seed, flip, al) {
  const c = flameFrame(v, (Math.floor(game.time * 9 + seed * 3)) % 8, sz), g = S / 100, ga0 = ctx.globalAlpha; ctx.globalAlpha = ga0 * (al == null ? 0.92 : al); ctx.save(); ctx.translate(Math.round(cx / g) * g, Math.round(fy / g) * g); if (flip) ctx.scale(-1, 1); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, -c.width / 2 * g, -c.height * g, c.width * g, c.height * g); ctx.restore(); ctx.globalAlpha = ga0;
}
function drawFireball(px, py, dir) {    // шар: клубящаяся голова с завитком внутри и длинный рваный хвост, который вьётся и раздваивается
  const g = S / 100, x0 = Math.round(px / g), y0 = Math.round(py / g), tt = game.time, ph = Math.floor(tt * 14) * 0.8, R = 9, Lt = 40, ga0 = ctx.globalAlpha; ctx.globalAlpha = ga0 * 0.92;
  const col = (c, i, yc, hw) => { if (hw < 0.4) return; const a = Math.round(yc - hw), b2 = Math.round(yc + hw); ctx.fillRect((x0 - dir * i) * g, (y0 + a) * g, g + 0.5, Math.max(1, b2 - a) * g + 0.5); };
  const cen = i => Math.sin(i * 0.26 - ph * 1.3) * (0.6 + i * 0.1), wid = i => (R - 1.5) * Math.pow(1 - i / Lt, 0.75) * (1 + 0.28 * Math.sin(i * 0.75 - ph * 2.1)) + 0.5;
  for (const [c, kw, kl] of [['#e8501a', 1, 1], ['#ff7014', 0.68, 0.86], ['#ffce46', 0.4, 0.66]]) { ctx.fillStyle = c;
    for (let i = R - 3; i < R + Lt * kl; i++) { const q = i - R + 3; col(c, i, cen(q), wid(q / kl) * kw); }                         // хвост
    if (kw > 0.5) for (let i = R + 8; i < R + 26 * kl; i++) { const q = i - R - 8; col(c, i, cen(q + 8) + 3 + q * 0.42 + Math.sin(q * 0.5 - ph) * 0.8, (2.4 - q * 0.09) * kw); }   // нижняя прядь — хвост раздваивается
    if (kw === 1) for (let j = 0; j < 3; j++) { const cyc = ((ph * 0.6 + j * 1.9) % 4 + 4) % 4, i = R + 14 + j * 9 + Math.round(cyc * 3); col(c, i, (j % 2 ? -1 : 1) * (5 + cyc * 1.5), cyc < 2 ? 1.2 : 0.6); col(c, i + 1, (j % 2 ? -1 : 1) * (5 + cyc * 1.5), cyc < 2 ? 1.2 : 0.6); } }   // оторванные клочья
  const rot = tt * 13 * dir;
  for (let yy = -R - 2; yy <= R + 2; yy++) for (let xx = -R - 2; xx <= R + 2; xx++) { const rr = Math.hypot(xx, yy), an = Math.atan2(yy, xx * dir), back = Math.max(0, -Math.cos(an)), edge = R + 1.3 * Math.sin(an * 3 - ph * 1.5) + back * 1.5 * Math.sin(an * 7 + ph); if (rr > edge) continue;
    const sp = ((an + rot) / 6.283 % 1 + 1) % 1, arm = Math.abs(rr - (1.5 + sp * (R - 3.5)));
    ctx.fillStyle = rr > edge - 1.6 ? '#e8501a' : rr > edge - 3 ? '#ff7014' : rr < 1.6 ? '#fff4e1' : arm < 0.75 ? '#ff7014' : arm < 1.5 && rr < R - 4 ? '#fff4e1' : '#ffce46'; ctx.fillRect((x0 + xx) * g, (y0 + yy) * g, g + 0.5, g + 0.5); }
  ctx.globalAlpha = ga0;
}
function heroHandsRaw() {               // где кисти героя в текущем кадре: [вбок от центра, вверх от ступней] в кубах; первая — задняя рука, вторая — передняя
  const nm = hero.anim.sprite(), sp = SP[nm], Hn = D.hands && D.hands[nm]; if (!sp || !Hn || Hn.length < 2) return [[-hero.face * 0.1, 0.24], [hero.face * 0.12, 0.26]];
  const sg = hero.anim.flip ? -1 : 1, P = Hn.map(q => [sg * (q[0] - sp[5]) / sp[7], 0.39 + (yFix[nm] || 0) + ((sp[4] - sp[6]) - q[1]) / sp[7]]); return P[0][0] * hero.face <= P[1][0] * hero.face ? P : [P[1], P[0]];
}
function heroHands() {                  // те же точки, но сглаженные: пламя не дёргается от кадра к кадру, а на ударе успевает за кулаком
  const raw = heroHandsRaw(), H2 = hero.handS, now = game.time, key = hero.face; if (!H2 || H2.key !== key || now - H2.t > 0.25) { hero.handS = { key, t: now, p: raw.map(q => q.slice()) }; return hero.handS.p; }
  if (now !== H2.t) { const dt2 = now - H2.t, fast = /Attack|Knife|Stomp|CordRip|Throw/.test(hero.st) || hero.dash, k = 1 - Math.exp(-dt2 * (fast ? 45 : 16)); for (let i = 0; i < 2; i++) { H2.p[i][0] += (raw[i][0] - H2.p[i][0]) * k; H2.p[i][1] += (raw[i][1] - H2.p[i][1]) * k; } H2.t = now; }
  return H2.p;
}
function promTrail(dt) {                // бежит или летит с горящими руками — за кистями тянется огонь
  if (!hero.prom || hero.state === 'dead' || hero.hideN || hero.inDoor) return; const sp2 = Math.hypot(hero.vx, hero.vy) + (hero.dash ? 9 : 0) + (hero.fistBoost > 0 ? 8 : 0);
  { const hy0 = hero.y + hero.hangPop - (hero.dip || 0); for (const q of heroHands()) if (Math.random() < dt * 9) { const du = q[0] + rnd(-0.07, 0.07); parts.push({ x: hero.x + du * view.r[0], y: hy0 + q[1] + rnd(0.12, 0.42), z: hero.z + du * view.r[1], vx: rnd(-0.25, 0.25) * view.r[0], vz: rnd(-0.25, 0.25) * view.r[1], vy: rnd(0.5, 1.5), g: -0.8, drag: 1.5, t: 0, life: rnd(0.3, 0.65), size: Math.random() < 0.5 ? 2 : 1, col: pick(['#fff6cf', '#ffe07a', '#ffa62e', '#ff6a1e']) }); } }   // от пламени на кулаках всё время отрываются искры
  if (sp2 < 1.2) return;
  const hy = hero.y + hero.hangPop - (hero.dip || 0), n = Math.min(hero.dash || hero.fistBoost > 0 ? 7 : 4, sp2 * dt * 24 + Math.random());
  for (const q of heroHands()) for (let i = 0; i < Math.floor(n); i++) { const k = Math.random(); parts.push({ x: hero.x + (q[0] - hero.vx * dt * k) * view.r[0], y: hy + q[1] + rnd(-0.03, 0.03) - hero.vy * dt * k, z: hero.z + (q[0] - hero.vx * dt * k) * view.r[1], vx: -hero.vx * 0.12 * view.r[0], vz: -hero.vx * 0.12 * view.r[1], vy: rnd(0.2, 0.9), g: -1.2, drag: 2.5, t: 0, life: rnd(0.28, 0.6), size: Math.random() < 0.45 ? 3 : 2, col: pick(['#fff6cf', '#ffe07a', '#ffe07a', '#ffa62e', '#ffa62e', '#ff6a1e']), hpx: true }); }
}
// v243: cshots, fbolts, fwake — перенесено в ядро, src/06b_world.js
function updateCharge(dt) {             // сила копится, пока держишь J; ровно секунда — и шар уходит вперёд
  const can = hero.prom && talOK('p2') && keys.has('arm') && hero.state !== 'dead' && !hero.ride && !hero.hang && !hero.ladder && !hero.hideN && !hero.grab && !hero.rip && !hero.dash && !hero.tele && !hero.dive && !hero.inDoor;
  if (!can) { hero.chg = 0; if (hero.st === 'PromCharge') go(hero.onGround ? 'Stay' : 'Fly'); return; } hero.chg = (hero.chg || 0) + dt; const k = Math.min(1, hero.chg);
  if (hero.chg > 0.2 && hero.chg < 1 && hero.st !== 'PromCharge' && (!ST[hero.st].lock || /^HandAttack/.test(hero.st) && hero.anim.done)) { go('PromCharge'); hero.vx = 0; }   /* копит: встал в стойку */
  if (hero.chg > 0.25) { const hs = heroHands(), q = hs.find(v => v[0] * hero.face > 0) || hs[0], hy = hero.y + hero.hangPop - (hero.dip || 0);   // искры стягиваются к кулаку
    if (Math.random() < dt * 40 * k) { const a = Math.random() * 6.28, rr = 0.45; parts.push({ x: hero.x + (q[0] + Math.cos(a) * rr) * view.r[0], y: hy + q[1] + Math.sin(a) * rr, z: hero.z + (q[0] + Math.cos(a) * rr) * view.r[1], vx: -Math.cos(a) * 2.2 * view.r[0], vz: -Math.cos(a) * 2.2 * view.r[1], vy: -Math.sin(a) * 2.2, g: 0, drag: 0, t: 0, life: 0.2, size: 1, col: pick(['#fff4e1', '#ffce46', '#ff7014']) }); }
    if (!hero.chgS || game.time - hero.chgS > 0.22) { hero.chgS = game.time; sfx('RUN_1_13', 0.12 + 0.2 * k, 0.6 + 1.4 * k); } }
  if (hero.chg >= 1) { hero.chg = -0.35; const hs = heroHands(), q = hs.find(v => v[0] * hero.face > 0) || hs[0], hy = hero.y + hero.hangPop - (hero.dip || 0), d = toD(hero), o = { x: 0, y: hy + q[1], z: 0, dir: hero.face, t: 0, d, tr: [] }; setUD(o, toU(hero) + q[0] + hero.face * 0.15, d); fbolts.push(o);
    if (!ST[hero.st].lock || /^HandAttack|PromCharge/.test(hero.st)) go('HandAttack2'); hero.trig = {}; hero.pushV = -hero.face * 1.2; sfx('RobotDeathB', 0.5, 2.2); zapSound(0.3, 0.15); game.shake = Math.max(game.shake, 0.08); showCombo('Огненный шар', false); fireUse(3);
    burst(o.x, o.y, o.z, { n: 14, cols: ['#fff4e1', '#ffce46', '#ff7014'], dir: hero.face, sp: [1.5, 5], life: 0.3 }); }
}
function surfaceBelow(u, y, d) {       // на что ляжет огонь под этой точкой: верх куба или трубы, не выше самой точки и не ниже трёх кубов
  let best = null; for (let yy = Math.floor(y); yy >= Math.floor(y) - 3; yy--) if (floorCube(Math.round(u), yy, d, 'any')) { if (yy + 1 <= y + 0.15) best = yy + 1; break; }
  if (Math.abs(d - 8) < 1.2) for (const bm of LEVEL.beams) { const a = bm[0], c2 = bm[1], da = a[0] * view.n[0] + a[2] * view.n[1], dc = c2[0] * view.n[0] + c2[2] * view.n[1]; if (da < 7 || dc < 7) continue;
    const ua = a[0] * view.r[0] + a[2] * view.r[1], uc = c2[0] * view.r[0] + c2[2] * view.r[1], top = a[1] + 0.13; if (u < Math.min(ua, uc) - 0.2 || u > Math.max(ua, uc) + 0.2 || top > y + 0.15 || top < y - 3) continue; if (best == null || top > best) best = top; }
  return best;
}
function trailFire(x, fy, z, k) {          // след шара и рывка: вал пламени, вперемешку обычные костерки у самого пола, позади — пара маленьких
  const mk = (dx, dy, sc, o) => fires.push(Object.assign({ x: x + dx * view.r[0], y: fy + dy, z: z + dx * view.r[1], life: rnd(3.5, 6), smk: 0, delay: rnd(0.08, 0.2), prom: true, fl: [{ dx: 0, dy: 0, sc, flip: Math.random() < 0.5, ph: rnd(0, 9), sp: 1, hot: false }] }, o || {}));
  // источник огня — сам шар (или герой в рывке): рядом с ним пламя крупное и его много, чем дальше позади — тем мельче и реже
  const pd = k.len || 0; mk(0, -0.07, 1, { src: k, pd }); if (Math.random() < 0.5) mk(rnd(-0.22, 0.22), -0.07, 1, { src: k, pd, thin: 2 }); if (Math.random() < 0.45) mk(rnd(-0.18, 0.18), -0.07, 1, { plain: true, src: k, pd, thin: Math.random() < 0.6 ? 1 : 0 }); if (Math.random() < 0.25) mk(rnd(-0.2, 0.2), -0.07, 1, { plain: true, back: true, src: k, pd, thin: 1 });
}
function mergeTrailFires() {            // больше двадцати огоньков в одном месте — сливаются в одно большое пламя с плоским дном
  const L = fires.filter(f => f.prom && !f.big && !(f.delay > 0) && f.life > 0.6 && (f.s == null || f.s > 0.5)).map(f => ({ f, u: toU(f), d: Math.round(toD(f)), y: Math.round(f.y * 4) })).sort((a, b) => a.d - b.d || a.y - b.y || a.u - b.u);
  for (let i = 0; i < L.length;) { let j = i; while (j + 1 < L.length && L[j + 1].d === L[i].d && L[j + 1].y === L[i].y && L[j + 1].u - L[i].u <= 1.6) j++;
    if (j - i + 1 > 14) { const G = L.slice(i, j + 1), kill = new Set(G.map(q => q.f)), m = G[Math.floor(G.length / 2)].f, u = (G[0].u + G[G.length - 1].u) / 2, o = { x: 0, y: G[0].f.y, z: 0, life: Math.max(...G.map(q => q.f.life)) + 0.6, smk: 0, delay: 0, prom: true, big: true, src: m.src, pd: m.pd, s: m.s, fl: m.fl }; setUD(o, u, toD(m));
      fires = fires.filter(f => !kill.has(f)); fires.push(o); }
    i = j + 1; }
}
function updateFBolts(dt) {
  for (const f of fires) if (f.prom) { const sr = f.src; if (sr && f.pd != null) f.s = Math.max(0, Math.min(1, 1 - ((sr.len || 0) - f.pd) / Math.max(2.5, sr.len || 0))); else if (f.s == null) f.s = 1; }   // след — клин: у источника (шар, герой в рывке) огонь высокий и густой, к началу пути сходит на нет; пока источник движется, клин едет за ним
  game.mergeT = (game.mergeT || 0) - dt; if (game.mergeT <= 0) { game.mergeT = 0.2; mergeTrailFires(); }
  for (const q of fbolts) { q.t += dt; q.len = (q.len || 0) + 11.5 * dt; const u = toU(q) + q.dir * 11.5 * dt; setUD(q, u, q.d); q.tr.push({ x: q.x, y: q.y, z: q.z, t: game.time }); if (q.tr.length > 16) q.tr.shift();
    if (q.lu == null || Math.abs(u - q.lu) >= (q.gap || 0.5)) { q.gap = rnd(0.32, 0.42); }
    if (q.lu == null || q.lu2 !== q.gap) { q.lu = u; q.lu2 = q.gap; let fy = surfaceBelow(u, q.y, q.d); if (fy != null && q.y - fy > 0.75) fy = null; /* шар летит высоко — на землю под ним огонь не падает */
      if (fy != null) trailFire(q.x, fy, q.z, q); }
    if (Math.random() < dt * 60) parts.push({ x: q.x, y: q.y + rnd(-0.05, 0.05), z: q.z, vx: -q.dir * rnd(0.5, 2) * view.r[0], vz: -q.dir * rnd(0.5, 2) * view.r[1], vy: rnd(-0.3, 0.8), g: -1, drag: 2, t: 0, life: rnd(0.25, 0.5), size: Math.random() < 0.4 ? 3 : 2, col: pick(['#ffce46', '#ff7014', '#e8501a']) });
    let hit = null; for (const r of robots) if (!r.dead && reachD(r, q.d) && Math.abs(toU(r) + (r.sh || 0) - u) < 0.6 && q.y > r.y - 0.4 && q.y < r.y + 1.3) { hit = r; break; }
    const wall = !hit && overlapsDepth(u, q.y - 0.05, 0.08, 0.1, q.d);
    if (hit || wall || q.t > 1.5) { q.gone = true; booms.push({ x: q.x, y: q.y, z: q.z, t: 0 }); burst(q.x, q.y, q.z, { n: 22, cols: ['#fff4e1', '#ffce46', '#ff7014', '#e8501a', '#3a2f36'], sp: [1.5, 5.5], up: 1.4, life: 0.5, size: 2 }); sfx('RobotDeathB', 0.6, 1.5); game.shake = Math.max(game.shake, 0.12);
      if (talHas('p7')) for (const o of robots) if (o !== hit && !o.dead && reachD(o, q.d) && Math.abs(toU(o) + (o.sh || 0) - u) < 2.2 && Math.abs(o.y - q.y + 0.4) < 1.6) promBurn(o);   /* v312: «Огненная волна» */
      if (hit) { const front = shieldFront(hit); if (front) shieldPing(hit); else { promBurn(hit); hit.fireSure = true; booms.push({ x: hit.x, y: hit.y + 0.4, z: hit.z, t: 0 }); booms.push({ x: hit.x + 0.3 * view.r[0], y: hit.y + 0.7, z: hit.z + 0.3 * view.r[1], t: -0.08 }); burst(hit.x, hit.y + 0.4, hit.z, { n: 30, cols: ['#ffce46', '#ff7014', '#fff3c4', '#c0392b', '#3a2f36'], sp: [1.5, 6], life: 0.8, size: 2 }); sfx('RobotDeathD', 0.5, 0.8); game.shake = Math.max(game.shake, 0.22); game.melee = 'HandAttack3'; PLOG.kill = 'огненный шар'; damageRobot(hit, CFG.hitDamage * 6); PLOG.kill = ''; game.melee = null; if (!hit.dead) hit.kv = q.dir * 2.1; fires.push({ x: hit.x, y: hit.y + 0.08, z: hit.z, life: rnd(4.5, 8), smk: 0, delay: 0.3, prom: true, fl: [{ dx: 0, dy: 0, sc: rnd(0.8, 1.1), flip: Math.random() < 0.5, ph: rnd(0, 9), sp: 1, hot: false }] }); } game.hitStop = Math.max(game.hitStop, 0.07); } } }
  if (fbolts.some(q => q.gone)) fbolts = fbolts.filter(q => !q.gone);
  for (const f of fires) if (!(f.delay > 0)) { const fd = toD(f), fu = toU(f); for (const r of robots) if (Math.abs(toD(r) - fd) <= 1.1 && Math.abs(toU(r) + (r.dead ? 0 : r.sh || 0) - fu) < (f.big ? 0.9 : 0.6) && Math.abs(r.y - f.y) < 0.6) r.inFire = game.time; }
  for (const r of robots.slice()) { if (r.lift || r.taxi) continue; const hot = r.burn > 0 || game.time - (r.inFire || -9) < 0.25; if (hot) r.char = Math.min(1, (r.char || 0) + dt / (r.dead ? 6 : 10)); else if (!r.dead && r.char > 0 && r.wet > 0) r.char = Math.max(0, r.char - dt / 6);
    if (hot && r.char > 0.3 && Math.random() < dt * 4) parts.push({ x: r.x + rnd(-0.25, 0.25) * view.r[0], y: r.y + rnd(0.2, 0.7), z: r.z + rnd(-0.25, 0.25) * view.r[1], vx: 0, vz: 0, vy: rnd(0.3, 0.9), g: -0.4, drag: 1, t: 0, life: rnd(0.5, 1.1), size: Math.random() < 0.5 ? 2 : 1, col: pick(['#1c1719', '#2c2c30', '#3a2f36']) });
    if (r.dead && r.char >= 1) {          // обугленные обломки осыпаются: тают сверху вниз, чёрная труха сыплется на пол
      if (!(r.crumb > 0)) { r.crumb = 0.0001; sfx('RobotHit5', 0.3, 0.5); for (const f of fires) if (f.wreck === r) { f.wreck = null; f.life = Math.min(f.life, 2); } }
      r.crumb += dt / 2.2; const top = r.y + 0.62 * (1 - r.crumb), n = Math.floor(dt * 70 + Math.random());
      for (let i = 0; i < n; i++) { const du = rnd(-0.42, 0.42); parts.push({ x: r.x + du * view.r[0], y: top + rnd(-0.03, 0.03), z: r.z + du * view.r[1], vx: rnd(-0.15, 0.15) * view.r[0], vz: rnd(-0.15, 0.15) * view.r[1], vy: rnd(-0.2, 0.1), g: 3.2, drag: 0.6, t: 0, life: Math.max(0.15, Math.sqrt(2 * Math.max(0.02, top - r.y) / 3.2) + rnd(0.05, 0.3)), size: Math.random() < 0.5 ? 2 : 1, col: pick(['#1c1719', '#1c1719', '#2c2c30', '#3a2f36']) }); }
      if (r.crumb >= 1) { robots = robots.filter(o => o !== r); for (const k of kunais) if (k.in === r) { k.in = null; k.state = 'fly'; k.drop = true; k.vy = 0; k.t = 1; k.fx = 0; } if (hero.standOn === r) hero.standOn = null;
        burst(r.x, r.y + 0.05, r.z, { n: 12, cols: ['#1c1719', '#2c2c30', '#3a2f36'], sp: [0.2, 0.9], up: 0.3, g: 0, drag: 3, life: 0.9, size: 2 }); } } }
  for (const f of fires) if (f.prom && !(f.delay > 0) && !f.hid) { const fd = toD(f), fu = toU(f); if (Math.random() < dt * (f.big ? 14 : 3.5)) parts.push({ x: f.x + rnd(-0.2, 0.2) * (f.big ? 3.2 : 1) * view.r[0], y: f.y + rnd(0.1, f.big ? 0.9 : 0.35), z: f.z + rnd(-0.15, 0.15) * view.r[1], vx: rnd(-0.2, 0.2) * view.r[0], vz: rnd(-0.2, 0.2) * view.r[1], vy: rnd(0.5, 1.6), g: -0.8, drag: 1.5, t: 0, life: rnd(0.35, 0.8), size: Math.random() < 0.4 ? 2 : 1, col: pick(['#ff7014', '#ff7014', '#ff8a1e', '#e8501a']) }); if (f.plain) continue; for (const r of robots) if (!r.dead && !(r.burn > 0) && reachD(r, fd) && Math.abs(toU(r) + (r.sh || 0) - fu) < (f.big ? 0.85 : 0.45) && Math.abs(r.y - f.y) < 0.5) promBurn(r); }   // огонь героя поджигает роботов
}
function counterKunai(r) {              // контрбросок: кунай сам находит голову робота, от которого только что увернулся
  hero.kunai--; kunaiRegen.push(CFG.kunaiRegen); updateHUD(); cshots.push({ x: hero.x, y: hero.y + 0.42, z: hero.z, r, t: 0, a: 0, fire: !!hero.prom && talOK('p4') }); knifeSound(false); sfx('RUN_1_13', 0.5, 2.4); showCombo('Контрбросок', false); hero.face = Math.sign(toU(r) + (r.sh || 0) - toU(hero)) || hero.face;
}
function updateCShots(dt) {
  for (const q of cshots) { const r = q.r; q.t += dt; if (r.dead || robots.indexOf(r) < 0 || q.t > 1.2) { q.gone = true; continue; }
    const tx = r.x + (r.sh || 0) * view.r[0], tz = r.z + (r.sh || 0) * view.r[1], ty = r.y + 0.7, dx = tx - q.x, dy = ty - q.y, dz = tz - q.z, d = Math.hypot(dx, dy, dz), st = 24 * dt; q.a = Math.atan2(-dy, dx * view.r[0] + dz * view.r[1]);
    (q.tr || (q.tr = [])).push({ x: q.x, y: q.y, z: q.z, t: game.time }); if (q.tr.length > 14) q.tr.shift(); if (q.fire) fireSpit(q, dt);
    if (d <= st + 0.12) { q.gone = true; if (q.fire) promBurn(r); PLOG.kill = 'кунай'; damageRobot(r, CFG.kunaiDamage * 4, true); PLOG.kill = ''; if (!r.dead) { r.stun = Math.max(r.stun || 0, 1.1); r.atk = null; r.flashT = 0.2; }
      popups.push({ x: r.x, y: r.y + 1.15, z: r.z, text: 'В голову!', t: 0 }); burst(tx, ty, tz, { n: 16, cols: SPARK.concat(['#ffffff', '#c9d2d8']), sp: [1.5, 5.5], up: 1.6, life: 0.4 }); knifeSound(true); game.hitStop = Math.max(game.hitStop, 0.08); game.shake = Math.max(game.shake, 0.1); }
    else { q.x += dx / d * st; q.y += dy / d * st; q.z += dz / d * st; } }
  if (cshots.some(q => q.gone)) cshots = cshots.filter(q => !q.gone);
}
function promBurn(r) {                  // огненный кулак: робот загорается и горит шесть секунд
  if (r.dead || shieldFront(r)) return; const hx = r.x + (r.sh || 0) * view.r[0], hz = r.z + (r.sh || 0) * view.r[1]; if (!(r.burn > 0)) { r.burnTick = 0; sfx('RUN_1_13', 0.4, 0.45); popups.push({ x: r.x, y: r.y + 1.15, z: r.z, text: 'Горит!', t: 0 }); } r.burn = talHas('p6') ? 9 : 6;   /* v312: «Долгое пламя» */
  burst(hx, r.y + 0.45, hz, { n: 12, cols: ['#fff4e1', '#ffce46', '#ff7014', '#e8501a'], sp: [1, 3.6], up: 1.8, g: 2, life: 0.5 });
}
function checkHits() {
  const w = hero.hitWin; if (!w) return;
  const hu = toU(hero), hb = spriteBox(hero.anim.sprite(), hu, hero.y + 0.39, hero.anim.flip); if (!hb) return;
  // у героя берём только то, что впереди корпуса: руку, ногу, оружие
  const kst = /^(KnifeAttack|JumpKnife)/.test(hero.st);   // удар ножом — с разворота: дотягивается на фиксированное расстояние перед героем
  const fl = kst ? (hero.face > 0 ? hu + 0.05 : hu - 0.78) : hero.face > 0 ? hu + 0.1 : hb[0], fr = kst ? (hero.face > 0 ? hu + 0.78 : hu - 0.05) : hero.face > 0 ? hb[1] : hu - 0.1;
  if (fr <= fl) return;
  if (boss) bossCheckHits(w, fl, fr, hb);
  if (tutor) tutorCheckHits(w, fl, fr, hb);
  for (const r of robots) {
    if (r.dead || w.done.has(r) || !reach(r)) continue;
    const rs = robotSprite(r), rb = spriteBox(rs.name, toU(r) + rs.ox, r.y + 0.39, rs.flip); if (!rb) continue;
    const m = 0.04;                   // кадры должны зайти друг на друга хотя бы на 4 сотых куба
    if (fl < rb[1] - m && fr > rb[0] + m && hb[2] < rb[3] - m && hb[3] > rb[2] + m) { w.done.add(r); game.melee = hero.st; const kn = hero.knife && /^(HandAttack|SitAttack|KnifeAttack|JumpKnife)/.test(hero.st); if (hero.prom && /^(HandAttack|SitAttack|KnifeAttack|JumpKnife)/.test(hero.st)) { promBurn(r); const aw = hero.face, qx = r.x + (r.sh || 0) * view.r[0] - aw * 0.22 * view.r[0], qz = r.z + (r.sh || 0) * view.r[1] - aw * 0.22 * view.r[1];   // отдача: искры веером назад, как от куная, только сильнее
        burst(qx, r.y + 0.45, qz, { n: 30, cols: ['#fff6cf', '#ffd052', '#ffd052', '#ff7014', '#ff7014', '#e8501a'], dir: -aw, sp: [2, 8], up: 1.6, life: 0.45, size: 2 }); burst(qx, r.y + 0.45, qz, { n: 10, cols: SPARK.concat(['#ffffff']), dir: -aw, sp: [1.5, 5.5], up: 1.2, life: 0.35 }); game.hitStop = Math.max(game.hitStop, 0.07); game.shake = Math.max(game.shake, 0.09); r.flashT = Math.max(r.flashT || 0, 0.16); if (!r.kv) r.kv = aw * 1.3; }
      const lk = hero.st === 'JumpLegsAttack2' ? hero.lkN || 0 : 0; const al = /^(HandAttack|LegsAttackUp)/.test(hero.st) && !kn && !hero.prom ? (hero.alt || 0) : 0;   /* v303: чередование рука–нога — сильнее */
      if (kn) { hero.knN = game.time - (hero.knAt || -9) < 1.2 ? (hero.knN || 0) + 1 : 1; hero.knAt = game.time; if (hero.knN % 3 === 0 && talHas('k6') && !r.dead) { r.stun = Math.max(r.stun || 0, 0.85); r.atk = null; popups.push({ x: r.x, y: r.y + 1.3, z: r.z, text: 'Подрезан!', t: 0 }); } }   /* v312: «Подрезать» */
      damageRobot(r, CFG.hitDamage * (kn ? 1.8 * (talHas('k4') ? 1.25 : 1) : lk ? [1, 1.2, 1.6, 2.2][lk] : 1) * (1 + 0.3 * al)); game.melee = null; hero.hitOK = true;
      if (al && !r.dead) { const aw = hero.face, qx = r.x + (r.sh || 0) * view.r[0] - aw * 0.22 * view.r[0], qz = r.z + (r.sh || 0) * view.r[1] - aw * 0.22 * view.r[1];
        burst(qx, r.y + 0.5, qz, { n: 6 + al * 6, cols: SPARK.concat(['#ffffff', '#fff4c0', '#ff9a3c']), dir: aw, sp: [2, 4 + al * 1.3], up: 0.6, life: 0.3 + 0.04 * al, size: al >= 3 ? 2 : 1 });
        r.flashT = Math.max(r.flashT || 0, 0.1 + 0.04 * al); r.kv = (r.kv || 0) + aw * (0.6 + 0.5 * al); game.hitStop = Math.max(game.hitStop, 0.04 + 0.025 * al); game.shake = Math.max(game.shake, 0.04 + 0.03 * al);
        sfx(al >= 3 ? 'RobotHit6' : 'RobotHit4', 0.3 + 0.08 * al, 1.4 - 0.1 * al); popups.push({ x: r.x, y: r.y + 1.5, z: r.z, t: 0, text: '×' + (1 + 0.3 * al).toFixed(1).replace('.0', '') }); if (al >= 3 && typeof spawnFx === 'function') spawnFx('FxPuff', qx, r.y + 0.3, qz, { flip: aw < 0, scale: 0.7 }); }
      if (lk && !r.dead && !r.headJob && !r.headless) { const aw = hero.face, qx = r.x - aw * 0.25 * view.r[0], qz = r.z - aw * 0.25 * view.r[1]; r.kv = aw * [0, 1.5, 1.8, 2.15][lk]; r.flashT = Math.max(r.flashT, 0.1 + 0.04 * lk); r.sq = -0.06 * lk; r.sqV = 0;   // отбрасывает понемногу: с края не слетит
        burst(qx, r.y + 0.42, qz, { n: 6 + lk * 5, cols: SPARK.concat(['#ffffff']), dir: aw, sp: [2, 4.5 + lk * 1.2], life: 0.3 }); if (lk === 3) burst(qx, r.y + 0.42, qz, { n: 8, cols: ['#55555c', '#8a8a92', '#2c2c30'], dir: aw, sp: [1, 3.6], up: 1.8, life: 0.6, size: 2 });
        game.hitStop = Math.max(game.hitStop, 0.03 + 0.02 * lk); game.shake = Math.max(game.shake, 0.04 + 0.035 * lk); kickSound(lk, true); sfx(lk === 3 ? 'RobotHit6' : 'RobotHit4', 0.3 + 0.1 * lk, 1.5 - 0.2 * lk); }
      if (kn) { const aw = Math.sign(toU(r) - hu) || 1; const qx = r.x - aw * 0.2 * view.r[0], qz = r.z - aw * 0.2 * view.r[1]; slashes.push({ x: qx, y: r.y + 0.45, z: qz, dir: aw, t: 0 }, { x: qx, y: r.y + 0.3, z: qz, dir: -aw, t: 0 }); knifeSound(true);
        burst(qx, r.y + 0.45, qz, { n: 16, cols: SPARK.concat(['#ffffff', '#fff4e1']), dir: aw, sp: [2.5, 7], life: 0.35 }); burst(qx, r.y + 0.45, qz, { n: 9, cols: ['#55555c', '#8a8a92', '#c9d2d8', '#2c2c30'], dir: aw, sp: [1, 3.6], up: 1.8, life: 0.6, size: 2 });
        game.hitStop = Math.max(game.hitStop, 0.07); game.shake = Math.max(game.shake, 0.08 + 0.015 * (hero.kChain || 0)); r.flashT = Math.max(r.flashT, 0.16); } }
  }
  for (const c of crates) {
    if ((c.broken && (c.tv === undefined || c.gone)) || w.done.has(c) || propHidden(c)) continue; const cu = toU(c);
    if (fl < cu + 0.2 && fr > cu - 0.2 && hb[2] < c.y + 0.44 && hb[3] > c.y) { w.done.add(c); hitCrate(c, hero.face); hero.hitOK = true; }
  }
  if (userHitBox(fl, fr, hb[2], hb[3], hero.face, w.done)) hero.hitOK = true;   // v251: свой предмет «разбивается»
}
const kunaiRegen = [];
// v243: slashes, kickArcs — перенесено в ядро, src/06b_world.js
function throwKunai() {
  if (hero.kunai <= 0) return;
  hero.kunai--; updateHUD();
  // каждый бросок чуть свой: высота руки, сила и угол немного гуляют, дальше кунай летит по дуге
  // v297 (Алексей 25.10: «кунай бьёт на слишком малое расстояние и выглядит бесполезным»): летит быстро и прямо (как метательные ножи в Dead Cells,
  // Katana Zero), сам доводится на робота впереди (до 9 кубов, в конусе), с зажатой W — наискось вверх; падать начинает только в конце пути
  const y0 = hero.y + 0.38, u0 = toU(hero) + hero.face * 0.25, hd = toD(hero), up = keys.has('up'); let vy = up ? CFG.kunaiSpeed * 0.7 : 0, sp = up ? CFG.kunaiSpeed * 0.72 : CFG.kunaiSpeed, aim = null;
  { let best = 1e9; for (const r of robots) { if (r.dead || !reachD(r, hd) || robotHidden(r) || r.taxi) continue; const du = (toU(r) + (r.sh || 0) - u0) * hero.face, dy = r.y + 0.45 - y0; if (du < 0.3 || du > 9) continue;
      const slope = dy / du; if (up ? (slope < 0.3 || slope > 2.2) : Math.abs(slope) > 0.45) continue; const sc = du + Math.abs(dy) * 2; if (sc < best) { best = sc; aim = { du, dy }; } }
    if (aim) { const L = Math.hypot(aim.du, aim.dy); sp = CFG.kunaiSpeed * aim.du / L; vy = CFG.kunaiSpeed * aim.dy / L; } }
  const k = { x: hero.x, y: y0, z: hero.z, dir: hero.face, vy, sp, t: 0, state: 'fly', in: null, du: 0, dy: 0, fx: 0, ang: 0, trailT: 0, anim: new Anim(), aim: !!aim, flat: 0 };
  setUD(k, u0, hd);
  k.fire = !!hero.prom && talOK('p4'); k.elec = !!hero.fork; k.anim.play('KunaiAC_Fly'); kunais.push(k);
  if (hero.kridePend && game.time - hero.kridePend < 0.6 && !hero.knife && hero.state !== 'dead') { hero.kridePend = 0; startKride(k); }
  slashes.push({ x: k.x, y: k.y, z: k.z, dir: hero.face, t: 0 }); knifeSound(false);   // белый росчерк и свист: бросил
}
// ---------- крюк: кунай на верёвке. Попал в робота — тянет робота к герою, попал в блок — тянет героя к блоку.
function fireHook() {                 // сначала замах — тот же бросок, что у куная; крюк вылетает из руки в момент броска
  if (hero.hook || hero.hookCool > 0 || hero.ride || hero.hang || hero.state === 'dead' || hero.st === 'Kulbit' || hero.st === 'HookThrow' || ST[hero.st].lock || hero.hookAir) return;   // в воздухе крюк можно бросить один раз, до приземления
  if (!talNeed('hook')) return;   /* v312: крюк — талант (первый в ветке «Движение») */
  if (!hero.onGround) hero.hookAir = true;
  hero.hookDbl = false;
  hero.hookUp = keys.has('up'); const air = !hero.onGround; go('HookThrow');
  if (air) { const [nm, flip] = heroClip('AirThrow', ''); hero.anim.play(nm, { loop: false, flip, restart: true, speed: 1.3 }); }   // в прыжке — тот же бросок в полёте, что у куная
}
// Верёвка выходит из руки на текущем кадре героя; пока крюк в деле, герой держит руку вытянутой.
function hookHand() {
  const nm = hero.anim.sprite(), hp = hand[nm];
  if (!hp) return { u: toU(hero) + hero.face * 0.24, y: hero.y + 0.42 };
  return { u: toU(hero) + (hero.anim.flip ? -hp[0] : hp[0]), y: hero.y + 0.39 + hp[1] };
}
// Кольцо на стене: крюк цепляется за него с небольшой доводкой и тянет героя; у кольца герой подскакивает и может сразу бросить крюк в следующее.
// v243: «let rings…» перенесено в ядро — src/06b_world.js
// Крюк сам ищет цель в радиусе: сначала робота, нет робота — кольцо, шестерню, ездящую панель или край блока.
// Зажат верх — ищет повыше, низ — пониже, иначе — по взгляду и чуть вверх.
function hookTargets(o, hd) {
  const R = CFG.hookRange + 1.0, out = [], add = (u, y, kind, obj) => { const du = u - o.u, dy = y - o.y, d = Math.hypot(du, dy); if (d > 0.35 && d <= R) out.push({ u, y, du, dy, d, kind, obj }); };
  for (const r of robots) if (!r.dead && reachD(r, hd) && !robotHidden(r) && !r.taxi) add(toU(r) + (r.sh || 0), r.y + 0.45, 'robot', r);
  for (const q of rings) if (!propHidden(q) && (q.user || !farOff(q)) && (!q.user || userLive(q.user, userCard(q.user)))) add(toU(q), q.y, 'ring', q);   /* v251: свой предмет «схватиться» — как кольцо */
  for (const G of gears) { if ((G.deco && G.lift === undefined) || !gearTangible(G, hd, true)) continue; const gu = toU(G), a = Math.atan2(o.y - G.y, o.u - gu), k = G.R - 0.1; add(gu + Math.cos(a) * k, G.y + Math.max(G.R * 0.2, Math.sin(a) * k), 'gear', G); }
  for (const M of movers) { const Nm = FACE_N[M.f % 4], fN = Nm[0] * view.n[0] + Nm[1] * view.n[1]; if (fN < 0.5 || Math.abs(hd - 8) > 1.6) continue; add(toU(M), M.y - 0.2, 'mover', M); }
  const U0 = Math.round(o.u), Y0 = Math.floor(o.y), solid = (U, Y) => { const c = cellAt(U, Y); return !!(c && c.some(q => q.dep >= hd - DEPTH_TOL)); };
  for (let U = U0 - 5; U <= U0 + 5; U++) for (let Y = Y0 - 4; Y <= Y0 + 5; Y++) { if (!solid(U, Y) || cellAt(U, Y + 1)) continue; const sd = Math.sign(U - o.u) || 1; if (cellAt(U - sd, Y)) continue; add(U - sd * 0.3, Y + 0.75, 'edge', null); }   // край блока: сверху пусто и со стороны героя пусто
  return out;
}
function hookClear(o, t) {              // по дороге нет блоков (кроме самой цели)
  const n = Math.ceil(t.d / 0.25); for (let i = 1; i < n - 1; i++) { const u = o.u + t.du * i / n, y = o.y + t.dy * i / n, c = cellAt(Math.round(u), Math.floor(y)); if (c && c.some(q => q.dep >= toD(hero) - DEPTH_TOL)) return false; } return true;
}
function launchHook() {
  const up = hero.hookUp || keys.has('up'), down = keys.has('sit'), o = hookHand(), hd = toD(hero), f = hero.face;
  const D = up ? [f * 0.35, 1] : down ? [f * 0.35, -1] : [f, 0.3], Dn = Math.hypot(D[0], D[1]), dxp = D[0] / Dn, dyp = D[1] / Dn;
  let best = null, bs = -1e9; const T = hookTargets(o, hd);
  // v294 (Алексей: «чтобы хук лучше находил цель и цеплялся, мягче и отзывчивее, чтобы люди кайфовали»): конус шире (почти вся передняя половина),
  // цель чуть дальше дальности броска; в прыжке — охотнее вверх; за спиной не ищет
  for (const pass of ['robot', 'other']) { for (const t of T) { if ((pass === 'robot') !== (t.kind === 'robot')) continue; const c = (t.du * dxp + t.dy * dyp) / t.d; if (c < (pass === 'robot' ? 0.1 : -0.05) || t.du * f < -0.3) continue;
      const sc = c * 1.6 - t.d / CFG.hookRange * 0.7 + (t.kind === 'ring' ? 0.45 : t.kind === 'gear' ? 0.25 : 0) + (!hero.onGround && t.dy > 0.3 ? 0.25 : 0); if (sc > bs && hookClear(o, t)) { bs = sc; best = t; } } if (best) break; }
  let ax = up ? f * 0.7071 : f, ay = up ? 0.7071 : 0, tgt = null, gear = null; { const n = Math.hypot(ax, ay); ax /= n; ay /= n; }
  if (best) { ax = best.du / best.d; ay = best.dy / best.d; if (best.kind === 'ring') tgt = best.obj; if (best.kind === 'gear') { tgt = best.obj; gear = best.obj; } }
  hero.hook = { state: 'fly', u: o.u, y: o.y, dx: ax, dy: ay, len: 0, t: 0, r: null, lastU: 0, still: 0, tgt, gear, maxL: Math.max(CFG.hookRange, best ? best.d + 0.4 : 0), slack: 1, snapT: 0, sp: 0 };   // летит в цель — по дороге ни за что другое не цепляется
  sfx('RUN_1_13', 0.3, 1.9);
}
function hookGearHang(G) {               // крюк у шестерни: хватается за ближний зубец и едет с колесом
  const hu = toU(hero), hy = hero.y + HAND_Y, gu = toU(G); let bi = -1, bd = 1e9; for (let i = 0, N = gearTeethN(G); i < N; i++) { const q = gearTooth(G, i), d = Math.hypot(gu + q.du - hu, G.y + q.dh - hy); if (d < bd) { bd = d; bi = i; } }
  if (bi < 0 || bd > 1.6) return false; const q = gearTooth(G, bi), dir = Math.sign(gu - hu) || hero.face;
  hero.hang = { U: Math.round(gu + q.du), T: G.y + q.dh, dir, gear: G, i: bi, low: q.dh < G.R * 0.05 }; hero.vx = hero.vy = 0; hero.hook = null; hero.hookAir = false; hero.hookCool = 0.25; hero.face = dir; hero.hangPop = 0; go('Take'); sfx('RUN_1_13', 0.3, 0.8); return true;
}
function hookTip(h) { const d = toD(hero); return { x: h.u * view.r[0] + d * view.n[0], y: h.y, z: h.u * view.r[1] + d * view.n[1] }; }
function endHook() { if (hero.hook) hero.hook.state = 'back'; }
function updateHook(dt) {
  const h = hero.hook, hu = toU(hero), hy = hookHand().y, hd = toD(hero); h.t += dt;
  if (h.state === 'fly') {
    for (let i = 0; i < 4 && h.state === 'fly'; i++) {
      const stp = CFG.hookSpeed * dt / 4; h.u += h.dx * stp; h.y += h.dy * stp; h.len += stp;
      for (const r of robots) {
        if (r.dead || !reachD(r, hd)) continue;
        const rs = robotSprite(r), rb = spriteBox(rs.name, toU(r) + rs.ox, r.y + 0.39, rs.flip);
        if (rb && h.u > rb[0] + 0.03 && h.u < rb[1] - 0.03 && h.y > rb[2] && h.y < rb[3]) { h.state = 'latch'; h.kN = 0; h.kT = 0; h.r = r; h.t = 0; sfx('RobotHit2', 0.5, 1.2); if (Math.random() < 0.03) enrage(r);
          { const ru0 = toU(r); if (Math.abs(toD(r) - hd) > DEPTH_TOL && floorCube(Math.round(ru0), r.baseY - 1, hd, 'same') && !overlapsDepth(ru0, r.baseY, r.hw, 0.6, hd)) setUD(r, ru0, hd); } const q = hookTip(h); burst(q.x, q.y, q.z, { n: 8, cols: SPARK, dir: -Math.sign(h.dx), sp: [1.5, 3.5], life: 0.3 }); break; }
      }
      // цепляется за блок на глубине героя или ближе, а за дальний — за его видимый край:
      // когда крюк влетает в клетку, где ближний куб выступает к камере сильнее, чем в предыдущей (ступень, уступ, край стены)
      const ck = Math.round(h.u) * 1000 + Math.floor(h.y), ca = cellAt(Math.round(h.u), Math.floor(h.y)), near = ca ? ca[0].dep : -1e9;
      const fromOpen = h.cell !== undefined && h.cell !== ck && near > h.near + 0.5; if (h.cell !== ck) { h.cell = ck; h.near = near; }
      for (const M of movers) if (h.state === 'fly' && !h.tgt) { const Nm = FACE_N[M.f % 4], fN = Nm[0] * view.n[0] + Nm[1] * view.n[1]; if (fN < -0.3 || (fN > 0.5 && Math.abs(hd - 8) > 1.6)) continue;
        if (Math.abs(h.u - toU(M)) < (fN > 0.5 ? 1.5 : 0.5) && h.y > M.y - 1 && h.y < M.y + 0.03) { h.state = 'pullHero'; h.t = 0; h.mover = M; h.mu = h.u - toU(M); sfx('RobotHit3', 0.4, 1.5); const q = hookTip(h); burst(q.x, q.y, q.z, { n: 8, cols: DIRT, dir: -Math.sign(h.dx), sp: [1, 3], life: 0.4 }); } }   // крюк впился в ездящую панель и едет вместе с ней
      if (h.gear && h.state === 'fly' && Math.hypot(toU(h.gear) - h.u, h.gear.y - h.y) < h.gear.R) { h.state = 'pullHero'; h.t = 0; h.gearL = h.gear; sfx('RobotHit3', 0.5, 1.6); const q = hookTip(h); burst(q.x, q.y, q.z, { n: 8, cols: SPARK, dir: -Math.sign(h.dx), sp: [1, 3], life: 0.3 }); }   /* впился в шестерню */
      for (const q of rings) if (h.state === 'fly' && !propHidden(q) && (q.user || !farOff(q)) && (!q.user || userLive(q.user, userCard(q.user))) && Math.hypot(toU(q) - h.u, q.y - h.y) < 0.3) { h.state = 'pullHero'; h.t = 0; h.ring = q; h.u = toU(q); h.y = q.y; q.t = 0.3; sfx('RobotHit3', 0.5, 1.9); }
      if (h.state === 'fly' && !h.tgt && ca && (fromOpen || ca.some(c => c.dep >= hd - DEPTH_TOL))) { h.state = 'pullHero'; h.t = 0; h.cU = Math.round(h.u); h.cY = Math.floor(h.y); h.u -= h.dx * 0.06; h.y -= h.dy * 0.06; sfx('RobotHit3', 0.4, 1.5); const q = hookTip(h); burst(q.x, q.y, q.z, { n: 10, cols: DIRT, dir: -Math.sign(h.dx), sp: [1, 3], life: 0.5 }); }
      else if (h.len > (h.maxL || CFG.hookRange)) h.state = 'back';
      if (h.state === 'fly' && !h.tgt && !h.mag && i === 0) { let bm = null, bd = 0.85;   // v294: «магнит» — пролетает рядом с кольцом, шестерней или краем блока — доворачивает в него
        for (const t of hookTargets({ u: h.u, y: h.y }, hd)) { if (t.kind === 'robot' || t.d > bd || (t.du * h.dx + t.dy * h.dy) / t.d < 0.2) continue; bd = t.d; bm = t; }
        if (bm) { h.mag = true; h.dx = bm.du / bm.d; h.dy = bm.dy / bm.d; h.maxL = h.len + bm.d + 0.4; if (bm.kind === 'ring') h.tgt = bm.obj; if (bm.kind === 'gear') { h.tgt = bm.obj; h.gear = bm.obj; } } }
    }
    h.slack = Math.max(0.15, h.slack - dt * 2);
  } else if (h.state === 'back') {
    const dx = hu - h.u, dy = hy - h.y, dist = Math.hypot(dx, dy), stp = 30 * dt;
    if (dist <= stp) { hero.hook = null; hero.hookCool = 0.2; return; }
    h.u += dx / dist * stp; h.y += dy / dist * stp;
  } else if (h.state === 'latch') {       // зацепил робота: долю секунды ждёт второго нажатия H
    const r = h.r; if (r.dead || h.t > 2.6 || Math.abs(toU(r) + (r.sh || 0) - hu) > CFG.hookRange + 1.5) { h.state = 'back'; return; }
    h.u = toU(r) + (r.sh || 0); h.y = r.y + 0.45; r.mode = 'wait'; r.t = 0.4; r.alert = 0.3;
    if (hero.hookDbl) { h.state = 'toRobot'; h.t = 0; }             // H нажали дважды — герой сам летит к роботу и виснет на плече
    else { h.state = 'pullRobot'; h.t = 0; }       // одно нажатие — робот едет к герою
  } else if (h.state === 'toRobot') {     // летит к роботу и хватается за плечо
    const r = h.r; if (r.dead) { h.state = 'back'; return; }
    h.u = toU(r) + (r.sh || 0); h.y = r.y + ROBOT_SHOULDER - 0.1; const dx = h.u - hu, dy = h.y - hy, dist = Math.hypot(dx, dy);
    h.still = Math.abs(hu - (h.lastU || 0)) + Math.abs(hero.y - (h.lastY || 0)) < 0.004 ? (h.still || 0) + dt : 0; h.lastU = hu; h.lastY = hero.y;
    if (dist < 0.7 || (h.still > 0.1 && dist < 1.3)) { hero.hook = null; hero.hookCool = 0.3; hero.vx = hero.vy = 0; hero.ride = { r, mode: 'hang' }; hero.rideU = null; go('Take'); hero.hangPop = hero.y - (r.y + ROBOT_SHOULDER - HANG_Y); sfx('RUN_1_13', 0.3, 0.7); return; }
    if (h.t > 1.4) { h.state = 'back'; return; }
    hero.vx = dx / dist * CFG.hookPull; hero.vy = dy / dist * CFG.hookPull; hero.onGround = false; hero.face = Math.sign(dx) || hero.face;
  } else if (h.state === 'pullRobot') {
    const r = h.r; if (r.dead) { h.state = 'back'; return; }
    if (h.t < 0.6 && pressed.has('hook')) { h.state = 'toRobot'; h.t = 0; return; }   // второе K чуть запоздало — всё равно летим к роботу
    const ru = toU(r), du = hu - ru; h.u = ru; h.y = r.y + 0.45;
    r.mode = 'wait'; r.t = 0.6; r.dir = Math.sign(du) || r.dir; r.alert = 0.4;
    const nu = ru + Math.sign(du) * 7 * dt;
    if (Math.abs(du) < 0.8 || h.t > 1.5 || !robotCanStep(r, nu, toD(r))) { h.state = 'back'; return; }
    setUD(r, nu, toD(r)); r.tx = Math.round(r.x); r.tz = Math.round(r.z);
  } else if (h.state === 'pullHero') {
    if (h.mover) h.u = toU(h.mover) + h.mu;
    if (h.gearL) { const G = h.gearL, dxg = h.u - hu, dyg = h.y - hy; if (Math.hypot(dxg, dyg) < 0.9 || h.t > 1.2) { if (hookGearHang(G)) return; h.state = 'back'; return; } }
    const dx = h.u - hu, dy = h.y - hy, dist = Math.hypot(dx, dy);
    h.still = Math.abs(hu - h.lastU) + Math.abs(hero.y - h.lastY) < 0.004 ? h.still + dt : 0; h.lastU = hu; h.lastY = hero.y;
    if (h.hold) {                       // H не отпущена: герой висит на крюке у стены, пока держишь
      if (!keys.has('hook') || pressed.has('jump') || hero.state === 'dead') { const jp = pressed.has('jump'); h.state = 'back'; hero.vx = 0; hero.vy = jp ? 3.9 : 0.6; if (jp) { hero.jumpUp = true; hero.jumpStart = game.time; } hero.jumpBuf = 0; pressed.delete('jump'); go('Fly'); return; }
      const nu = h.u - h.hold[0], ny = h.y - h.hold[1] - (hy - hero.y); if (!overlapsDepth(nu, ny + 0.03, hero.hw, hero.h - 0.06, hd)) { setUD(hero, nu, hd); hero.y = ny; } hero.vx = 0; hero.vy = 0; hero.onGround = false; h.t = 0; return; }
    if ((dist < 0.45 || h.still > 0.12) && !h.ring && keys.has('hook') && !pressed.has('jump') && dist < 1.6) {
      if (h.cU !== undefined && !h.mover) {   // держим H у блока: герой хватается за ближний край этого блока и висит, как на обычном уступе; верёвка убрана
        const dir = Math.sign(h.dx) || hero.face, T = h.cY + 1, c = floorCube(h.cU, h.cY, hd, 'visible'), dep = c && Math.abs(c.dep - hd) > DEPTH_TOL ? c.dep : hd; let eU = h.cU;
        for (let k = 0; k < 3; k++) { const nb = cellAt(eU - dir, h.cY); if (nb && nb.some(q => Math.abs(q.dep - dep) <= DEPTH_TOL)) eU -= dir; else break; }   // крюк мог впиться в середину или в низ площадки — край ищем со стороны героя
        const nu = eU - dir * 0.5 - dir * (hero.hw + 0.005), ny = T - HANG_Y;
        if (Math.abs(nu - hu) < 1.7 && Math.abs(ny - hero.y) < 1.7 && !overlapsDepth(nu, ny, hero.hw, hero.h, dep) && !heroHiddenAt(nu, ny, dep)) { hero.hangPop = hero.y - ny; setUD(hero, nu, dep); hero.y = ny; hero.vx = hero.vy = 0; hero.jumpUp = false; hero.face = dir; hero.hang = { U: eU, T, dir, hook: true }; hero.hook = null; hero.hookAir = false; hero.hookCool = 0.25; go('Take'); sfx('RUN_1_13', 0.25, 0.8); return; } }
      h.hold = [dx, dy]; hero.vx = hero.vy = 0; sfx('RUN_1_13', 0.25, 0.8); return; }
    if (dist < 0.45 || h.t > 1.4 || h.still > 0.12 || pressed.has('jump')) {   // долетел, упёрся или отпустил прыжком
      const jp = pressed.has('jump'), sp = h.sp || 0, ux = dist > 1e-3 ? dx / dist : 0;   // v294: долетел или прыгнул с верёвки — инерция сохраняется (рывок дальше), прыжок — подброс
      h.state = 'back'; hero.vy = Math.max(hero.vy * 0.3, h.ring && dist < 0.45 ? 3.8 : jp ? 4.4 : dist < 0.45 ? 2.2 : 1.2); hero.vx = h.still > 0.12 ? 0 : ux * sp * (jp ? 0.75 : 0.45); if (jp) { go('Fly'); if (!hero.ropeJ) { hero.ropeJ = true; hero.hookAir = false; hero.hookCool = 0.05; } }   /* v295: прыжок с верёвки — второй прыжок: можно ещё раз бросить крюк (один раз до земли) */ if (h.ring) { hero.hookAir = false; hero.hookCool = 0; hero.airJumps = 1; hero.hook = null; go('Fly'); } hero.jumpBuf = 0; pressed.delete('jump'); return;   // второй прыжок крюк не возвращает
    }
    h.sp = Math.min(CFG.hookPull * 1.1, (h.sp || 2) + 22 * dt * (0.6 + 0.4 * Math.min(1, dist / 2)));   // v295 (Алексей: «ещё мягче и приятнее»): разгон плавнее, у цели — мягче h.slack = 0;   // v294: тянет не рывком с места, а разгоняется (мягче), и в конце быстрее, чем раньше
    hero.vx = dx / dist * h.sp; hero.vy = dy / dist * h.sp; hero.onGround = false; hero.face = Math.sign(dx) || hero.face;
  }
}
const carvedAt = (U, Y, k = 7) => LEVEL.carved.has(ckey(Math.round(U * view.r[0] + k * view.n[0]), Y, Math.round(U * view.r[1] + k * view.n[1])));   // k — глубина стены (у голени стена ближе, v311)
function findNiche(down) {              // выемка рядом: прямо за спиной или в соседней колонке, не выше двух кубов; down — ниже героя (до четырёх). Работает и в воздухе
  const k = Math.round(toD(hero)) - 1; if (hero.y >= LEVEL.pelY || k < 3 || k > 7 || hero.ride || hero.hang || hero.ladder) return null; const air = !hero.onGround, u = toU(hero), U0 = Math.round(u), Y0 = Math.floor(hero.y + 0.2); let best = null, bd = 1e9;
  for (let dy = down ? 1 : 0; dy <= (down ? 4 : air ? 1 : 2); dy++) for (const dU of [0, 1, -1]) { const U = U0 + dU, Y = down ? Y0 - dy : Y0 + dy; if (Y < 1 || !carvedAt(U, Y, k) || carvedAt(U, Y - 1, k) || (down ? hero.y - Y < 0.4 : Y - hero.y > 2.2)) continue;
    if (Math.abs(U - u) > 1.2) continue; const dd = Math.abs(U - u) + dy * 0.8; if (dd < bd) { bd = dd; best = { U, Y, k }; } }
  return best;
}
function dropThrough() {                // S + прыжок: герой проваливается сквозь тонкую площадку, трубу или ездящую панель — просто падает, без скачка
  const u = toU(hero), d = toD(hero), T = Math.round(hero.y), go2 = row => { hero.dropT = 0.7; hero.dropRow = row; hero.vy = -1.2; hero.onGround = false; hero.standOn = null; hero.hangCool = 0.5; return true; };
  if (hero.standOn && movers.includes(hero.standOn)) return go2(-99);
  if (hero.standOn) return false;
  if (Math.abs(hero.y - T) > 0.02) return go2(-99);   // стоит на трубе
  let any = false; for (const U of [Math.round(u - hero.hw), Math.round(u + hero.hw)]) { const c = floorCube(U, T - 1, d, 'any'); if (!c) continue; any = true; if (c.kind === 'core' || c.slab || c.br || (LEVEL.ringTops || []).includes(c.y + 1) || c.y < 2) return false; }
  if (!any || overlapsDepth(u, T - 1 - hero.h - 0.01, hero.hw, hero.h, d)) return false;
  return go2(T - 1);
}
function threatOf(r) {                  // робот прямо сейчас целит в героя? Возвращает, с какого момента атаки гореть подсказке и когда удар
  const A = r.atk; if (!A || A.done || A.dodged || r.dead) return null; const hu = toU(hero), hd = toD(hero), ru = toU(r) + (r.sh || 0), du = hu - ru, near = Math.abs(hd - toD(r)) <= 1.2, dy = Math.abs(hero.y - r.y);
  if (A.type === 'jump') { const L = A.land, big = A.drop || A.mega || A.apex !== undefined;
    if (!(A.mega || A.apex !== undefined) && !(L && Math.abs(toU(L) - hu) < 1.3 && Math.abs(toD(L) - hd) <= 1.2 && Math.abs(L.y - hero.y) < (big ? 1.8 : 1.1))) return null;
    return { from: -9, end: A.mega ? 0.22 + A.k1 * A.dur : 0.22 + (A.dur || 0.62), u: A.drop ? toU(L) : A.mega ? A.x0 * view.r[0] + A.z0 * view.r[1] : ru }; }
  if (A.type === 'punch') return near && du * A.dir > -0.2 && du * A.dir < 1.3 && dy < 0.8 ? { from: -9, end: 0.3, u: ru } : null;
  if (A.type === 'shoot') return near && du * A.dir > 0 && Math.abs(du) < 7.5 && dy < 0.7 ? { from: 0.4, end: 1.0 + Math.abs(du) / 7.5 + (A.twice ? 0.32 : 0), u: ru } : null;
  if (A.type === 'steam') return near && du * A.dir > -0.2 && Math.abs(du) < 1.9 && dy < 0.8 ? { from: -9, end: 0.85, u: ru } : null;
  return null;
}
// v296 (Алексей 25.10: «F позволяет увернуться от любых навыков и атак ботов, но как с комбо: если слишком часто — бот перехватывает и бьёт об землю»):
// увороты за последние 6 с: третий подряд — 25% перехвата, четвёртый — 50%, дальше — 75%. Рядом стоящий робот хватает за шею, дальний — просто попадает.
function dodgeSpam(D) {
  const now = game.time; hero.dodgeHist = (hero.dodgeHist || []).filter(t => now - t < 6); const n = hero.dodgeHist.length; hero.dodgeHist.push(now);
  const p = game.dodgeTest !== undefined ? game.dodgeTest : (talHas('c2') ? [0, 0, 0, 0.25, 0.5, 0.75] : [0, 0, 0.25, 0.5, 0.75, 0.75])[Math.min(5, n)]; if (!(Math.random() < p)) return false;
  plog('перехват', 'уворот слишком часто (' + (n + 1) + ' за 6 с, шанс ' + Math.round(p * 100) + '%)');
  const r = D.r; if (r && !r.dead && robots.includes(r) && canHead(r) && Math.abs(toU(hero) - toU(r) - (r.sh || 0)) < 1.8 && Math.abs(hero.y - r.y) < 1) { r.atk = null; startGrab(r, true); showCombo('Слишком часто уворачиваешься — робот поймал', true); return true; }
  showCombo('Слишком часто уворачиваешься — не успел', true); return true;
}
function doDodge(D, roll) { if (roll && dodgeSpam(D)) { game.dodge = null; game.dodgeBuf = 0; return; } plog('уворот', roll ? 'F' : 'поворот мира');
             // увернулся: эта атака героя уже не заденет; roll — кульбит в сторону от робота
  D.A.dodged = true; game.dodge = null; game.dodgeBuf = 0; const keep = Math.max(0.6, D.tti + 0.5); hero.invuln = Math.max(hero.invuln, keep); hero.dodgeT = keep;
  if (roll) { const dir = Math.sign(toU(hero) - D.u) || -hero.face; if (hero.ride) { hero.ride = null; hero.rideCool = 0.6; } hero.vx = dir * 6.2; hero.vy = 3.1; hero.onGround = false; hero.hang = null; hero.ladder = null; hero.hook = null; hero.face = -dir; go('Kulbit'); }
  if (roll && D.r && !D.r.dead) hero.counter = { r: D.r, t: 0.9 };
  if (roll && talHas('c4')) hero.counterBuff = game.time + 1.5;   /* v301: талант «Контрудар» */   // окно для контрброска
  popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, text: 'Увернулся!', t: 0, heal: true }); sfx('RUN_1_13', 0.5, 1.8); game.hitStop = Math.max(game.hitStop, 0.05); game.quietT = 0;
}
function updateDodge(dt) {              // подсказка «F» горит с той секунды, как робот решил напасть, и до самого удара: нажал — кульбит в сторону, урона нет
  game.dodge = null; if (hero.dodgeT > 0) hero.dodgeT -= dt; const want = game.dodgeBuf > 0; if (want) game.dodgeBuf -= dt;
  if (hero.state === 'dead' || hero.inDoor || hero.hideN || hero.burstT > 0 || hero.st === 'Kulbit' || hero.rip || hero.ride) return;   // на роботе F — это «вырвать шнур», не уворот
  let best = null;
  for (const r of robots) { const T = threatOf(r); if (!T) continue; const A = r.atk; if (A.t < T.from || A.t >= T.end) continue; if (A.seenT === undefined) A.seenT = A.t;
    const tti = T.end - A.t; if (!best || tti < best.tti) best = { r, A, tti, u: T.u, span: Math.max(0.2, T.end - A.seenT) }; }
  { const at = armThreat(); if (at && (!best || at.tti < best.tti)) best = at; }
  { const bt = bossThreat(); if (bt && (!best || bt.tti < best.tti)) best = bt; }
  { const tt = turretThreat(); if (tt && (!best || tt.tti < best.tti)) best = tt; }
  if (!best) return; game.dodge = best; if (want) doDodge(best, true);
}
// v243: function exitGuide — перенесено в ядро, src/13c_units.js
// v243: function waterGuide — перенесено в ядро, src/13c_units.js
// v243: function drawGuide — перенесено в ядро, src/13c_units.js
const KEYGLYPH = { W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'], H: ['X..X', 'X..X', 'XXXX', 'X..X', 'X..X', 'X..X'], L: ['X...', 'X...', 'X...', 'X...', 'X...', 'XXXX'], F: ['XXXX', 'X...', 'XXX.', 'X...', 'X...', 'X...'], E: ['XXXX', 'X...', 'XXX.', 'X...', 'X...', 'XXXX'], Q: ['.XX.', 'X..X', 'X..X', 'X.XX', 'X..X', '.XXX'], W: ['X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'], G: ['.XXX', 'X...', 'X...', 'X.XX', 'X..X', '.XXX'] };
// v289 (Алексей 24.10: «должна быть какая-то кнопка для F, и чтобы именно она светилась, если играешь геймпадом»): играешь геймпадом
// (последнее нажатие — с него) — вместо клавиши рисуется кнопка геймпада для того же действия: обычная раскладка — A/B/X/Y (свой цвет),
// LB/RB/LT/RT, ↑; своя раскладка (настройка «🎮») — номер кнопки, которую выбрал
const KEY_ACT = { F: 'dodge', W: 'up', H: 'hook', L: 'kunai', E: 'rotR', Q: 'rotL', G: 'take', J: 'arm', K: 'leg' };
const PAD_STD = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', '◁', '▷', 'L3', 'R3', '↑', '↓', '←', '→'], PAD_COL = { A: '#4f9a3c', B: '#b8402e', X: '#3f6fb8', Y: '#c9a22c' };
function padLabel(act) {
  if (typeof PAD === 'undefined' || !PAD.lastPad || (PAD.lastKbT || 0) > PAD.lastPad) return null; const gp = typeof padFirst === 'function' ? padFirst() : null; if (!gp) return null;
  const cm = PAD.custom && PAD.custom.id === gp.id && PAD.custom.map; if (cm) { const q = cm[act]; if (!q) return act === 'dodge' && cm.jump ? padLabel('jump') : null; return q.t === 'b' ? (gp.mapping === 'standard' ? PAD_STD[q.i] || String(q.i + 1) : String(q.i + 1)) : (act === 'up' ? '↑' : act === 'sit' ? '↓' : 'ось ' + (q.i + 1)); }
  if (act === 'dodge') return 'A';   /* v306: уворот — кнопка прыжка */
  for (const i in PADMAP) if (PADMAP[i] === act) return PAD_STD[i]; return null;
}
function drawPadcap(cx, top, g, lab, urgent) {   // кнопка геймпада: круг (A/B/X/Y и цифры) или плашка (LB/RB/LT/RT); нажимается в такт, как клавиша
  const down = (game.time * (urgent ? 5 : 2.4)) % 1 < 0.4, t = down ? g * 1.5 : 0, wide = lab.length > 1 && !/^\d+$/.test(lab), w = wide ? 13 : 10, h = wide ? 8 : 10, col = PAD_COL[lab] || '#5d5550';
  const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(cx + x * g), Math.round(top + y * g), Math.round(ww * g), Math.round(hh * g)); };
  R(-w / 2 - 1, 1.5, w + 2, h + 1, '#120d10');
  if (wide) { R(-w / 2, t / g, w, h, '#1a1416'); R(-w / 2 + 1, t / g + 1, w - 2, h - 2, col); R(-w / 2 + 1, t / g + 1, w - 2, 1, '#9a9088'); }
  else { R(-3, t / g, 6, 10, '#1a1416'); R(-5, t / g + 2, 10, 6, '#1a1416'); R(-4, t / g + 1, 8, 8, '#1a1416'); R(-3, t / g + 1, 6, 8, col); R(-4, t / g + 2, 8, 6, col); R(-2, t / g + 1, 4, 1, '#f6ecd2'); }
  if (urgent && !down) { ctx.fillStyle = 'rgba(255,220,150,0.18)'; ctx.fillRect(Math.round(cx - (w / 2 + 2) * g), Math.round(top - g), Math.round((w + 4) * g), Math.round((h + 3) * g)); }
  ctx.fillStyle = '#f6ecd2'; ctx.font = 'bold ' + Math.round(g * (wide ? 4.5 : 5.5)) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, Math.round(cx), Math.round(top + t + (h / 2 + 0.5) * g)); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}
function drawKeycap(cx, top, g, ch, urgent) {
  { const lab = KEY_ACT[ch] ? padLabel(KEY_ACT[ch]) : null; if (lab) { drawPadcap(cx, top, g, lab, urgent); return; } }   // клавиша-подсказка: тёмное основание, выпуклая шапка, кремовая буква; шапка ритмично уходит вниз — «жми»
  const down = (game.time * (urgent ? 5 : 2.4)) % 1 < 0.4, dy = down ? g * 2 : 0, R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(cx + x * g), Math.round(top + y * g), Math.round(w * g), Math.round(h * g)); };
  R(-5, 3, 10, 9, '#120d10'); R(-6, 4, 12, 7, '#120d10');                                   // основание с тенью
  R(-5, 4, 10, 7, '#2e2826'); R(-5, 10, 10, 1, '#1f1a19');
  const t = dy / g; R(-4, t, 8, 9, '#1a1416'); R(-5, t + 1, 10, 7, '#1a1416');                 // шапка: обводка
  R(-4, t + 1, 8, 7, '#5d5550'); R(-4, t + 1, 8, 1, '#9a9088'); R(-4, t + 2, 1, 5, '#7b716a'); R(3, t + 2, 1, 6, '#463f3b'); R(-3, t + 2, 6, 5, urgent && !down ? '#7d736b' : '#6c635d');
  if (!down) { R(-4, 8, 8, 2, '#3a3330'); R(-4, 8, 8, 1, '#4a423e'); }                        // передняя кромка видна, пока клавиша не нажата
  const G = KEYGLYPH[ch] || KEYGLYPH.F, gw = G[0].length; for (let r = 0; r < G.length; r++) for (let c = 0; c < gw; c++) if (G[r][c] === 'X') { ctx.fillStyle = '#f6ecd2'; ctx.fillRect(Math.round(cx + (c - gw / 2) * g), Math.round(top + (t + 1.6 + r * 0.9) * g), Math.ceil(g), Math.ceil(g * 0.9)); }
}
// v243: function drawCastBar — перенесено в ядро, src/13c_units.js
// v243: function drawDodge — перенесено в ядро, src/13c_units.js
// Журнал игры: что происходило за сессию — смерти и их причины, урон, приёмы, перехваты, время по ярусам. Открывается по P, текст копируется и вставляется в чат.
const PLOG = { ver: GRK_VER, started: new Date().toISOString(), ev: [], n: {}, hs: [], tier: 0, why: '', prev: null };
function plog(k, c) { try { const e = [+game.time.toFixed(1), k, c === undefined ? '' : String(c), Math.round(hero.y), view.k, game.level || 1, hero.hp + (hero.armor ? '+' + hero.armor : '')]; PLOG.ev.push(e); if (PLOG.ev.length > 500) PLOG.ev.shift(); const key = k + (c === undefined ? '' : ':' + c); PLOG.n[key] = (PLOG.n[key] || 0) + 1; } catch (e) {} }
function plogCause() {                  // от чего сейчас досталось: смотрим, кто рядом и что делает
  const hu = toU(hero); let best = null, bd = 3.2;
  for (const r of robots) { if (r.dead || !r.atk) continue; const d = Math.hypot(toU(r) + (r.sh || 0) - hu, r.y - hero.y); if (d < bd) { bd = d; best = r; } }
  if (best) { const a = best.atk; return 'робот: ' + ({ punch: 'кулак', jump: a.mega ? 'выстрел собой снизу' : a.drop ? 'падение сверху' : 'прыжок', shoot: 'выстрел', steam: 'пар', ram: 'таран' }[a.type] || a.type) + (best.rage > 0 ? ' (в ярости)' : best.hunter ? ' (охотник)' : ''); }
  for (const b of booms) if (b.t < 0.3 && Math.hypot(toU(b) - hu, b.y - hero.y) < 2.4) return 'взрыв';
  for (const r of robots) if (!r.dead && Math.hypot(toU(r) + (r.sh || 0) - hu, r.y - hero.y) < 1.1) return 'робот: столкновение';
  return 'другое';
}
function plogTick(dt) {
  PLOG.acc = (PLOG.acc || 0) + dt; if (game.started) PLOG.play = (PLOG.play || 0) + dt; if (hero.state !== 'dead') { const tops = LEVEL.ringTops || [13, 23], t = hero.y >= (LEVEL.pelY || 32) - 0.5 ? 3 : hero.y >= tops[1] - 0.1 ? 2 : hero.y >= tops[0] - 0.1 ? 1 : 0; if (t > PLOG.tier) { PLOG.tier = t; plog('ярус', ['', 'второй ярус', 'третий ярус', 'таз'][t]); } }
  if (hero.onGround && hero.state !== 'dead') PLOG.lastG = Math.round(hero.x) + ',' + Math.round(hero.y) + ',' + Math.round(hero.z) + ' ' + ['Ю', 'В', 'С', 'З'][view.k];
  supWatch(dt);
  if (hero.burn > 0 && hero.state !== 'dead') { if (!PLOG.burnAt) PLOG.burnAt = game.time; } else if (PLOG.burnAt) { const d = game.time - PLOG.burnAt; PLOG.burnAt = 0; if (hero.state !== 'dead') plog('огонь', 'горел ' + d.toFixed(1) + ' с, ' + (d < 5.7 ? 'потушил' : 'догорел сам')); }
  if (PLOG.acc >= 20) { PLOG.acc = 0; if (hero.state !== 'dead') PLOG.hs.push([Math.round(game.time), Math.round(hero.y), view.k, hero.hp, Math.round(game.fpsN ? game.fpsN / game.fpsT : 0), Math.round(game.fpsWorst || 0), Math.round(game.jsWorst || 0)]); game.fpsN = 0; game.fpsT = 0; game.fpsWorst = 0; game.jsWorst = 0; if (PLOG.hs.length > 240) PLOG.hs.shift(); plogSave(); }
}
// журнал копится между играми: каждая открытая игра — своя сессия, хранятся последние двадцать
let PLOG_HIST = []; try { PLOG_HIST = JSON.parse(localStorage.getItem('rk_plog_hist') || '[]') || []; const q = JSON.parse(localStorage.getItem('rk_plog') || 'null'); if (q && q.ev && !PLOG_HIST.some(h => h.started === q.started)) PLOG_HIST.push(q); localStorage.removeItem('rk_plog'); } catch (e) { PLOG_HIST = []; }
PLOG_HIST = PLOG_HIST.filter(h => h && h.ev && (h.ev.length > 1 || (h.play || 0) > 5)).slice(-19);
function plogSave() { try { const cur = { ver: PLOG.ver, started: PLOG.started, play: Math.round(PLOG.play || 0), ev: PLOG.ev.slice(-300), n: PLOG.n, hs: PLOG.hs.slice(-120) }; localStorage.setItem('rk_plog_hist', JSON.stringify(PLOG_HIST.concat([cur]).slice(-20))); } catch (e) {} }
addEventListener('pagehide', plogSave); addEventListener('beforeunload', plogSave); document.addEventListener('visibilitychange', () => { if (document.hidden) plogSave(); });
function plogText() {
  const SIDE = ['Ю', 'В', 'С', 'З'], out = [], one = (P, title) => { const n = P.n || {}, grp = pre => Object.keys(n).filter(k => k.indexOf(pre + ':') === 0 || k === pre).sort((a, b) => n[b] - n[a]).map(k => (k.slice(pre.length + 1) || 'всего') + ' ×' + n[k]).join(', ') || '—';
    const last = P.play != null ? P.play : P.ev.length ? P.ev[P.ev.length - 1][0] : 0; out.push('== ' + title + ' · ' + P.ver + ' · начало ' + P.started + ' · сыграно ' + Math.floor(last / 60) + ' мин ' + Math.round(last % 60) + ' с');
    out.push('Смерти: ' + grp('смерть')); out.push('Урон: ' + grp('урон')); out.push('Броня сбита: ' + grp('броня-')); out.push('Комбо: ' + grp('комбо')); out.push('Приём прошёл: ' + grp('приём')); out.push('Перехваты: ' + grp('перехват'));
    out.push('Роботы убиты: ' + grp('убит')); out.push('Головы: ' + grp('голова')); out.push('Увороты: ' + grp('уворот')); out.push('Огонь: ' + grp('огонь')); out.push('Щит отбил: ' + (n['щит'] || 0)); out.push('Подобрано: ' + grp('взял')); out.push('Двери: ' + grp('дверь')); out.push('Повороты мира: ' + (n['поворот'] || 0));
    out.push('Ярусы и финиш: ' + (P.ev.filter(e => e[1] === 'ярус' || e[1] === 'финиш' || e[1] === 'уровень').map(e => e[2] + (e[2] ? ' ' : '') + e[1] + ' на ' + Math.floor(e[0] / 60) + ':' + String(Math.round(e[0] % 60)).padStart(2, '0')).join('; ') || '—'));
    out.push('Смерти подробно (время · причина · высота · сторона): ' + (P.ev.filter(e => e[1] === 'смерть').map(e => Math.floor(e[0] / 60) + ':' + String(Math.round(e[0] % 60)).padStart(2, '0') + ' ' + e[2] + ' y' + e[3] + ' ' + SIDE[e[4]]).join('; ') || '—'));
    out.push('Высота каждые 20 с (время:высота/жизни): ' + (P.hs || []).map(h => h[0] + ':' + h[1] + '/' + h[3]).join(' '));
    out.push('Кадров в секунду каждые 20 с (среднее/худший кадр мс(из них расчёт игры мс)): ' + ((P.hs || []).filter(h => h[4]).map(h => h[4] + '/' + h[5] + (h[6] !== undefined ? '(' + h[6] + ')' : '')).join(' ') || '—') + ' · экран ' + (typeof screen !== 'undefined' ? screen.width + 'x' + screen.height + ' x' + (window.devicePixelRatio || 1) : '?'));
    out.push('События (время|что|подробность|высота|сторона|уровень|жизни+броня):'); for (const e of P.ev.slice(-(P.cut || 260))) out.push(e[0] + '|' + e[1] + '|' + e[2] + '|' + e[3] + '|' + SIDE[e[4]] + '|' + e[5] + '|' + e[6]); };
  const all = PLOG_HIST.concat([{ n: PLOG.n, ev: PLOG.ev, play: PLOG.play || 0 }]), sum = (pre) => all.reduce((t, h) => t + Object.keys(h.n || {}).filter(k => k === pre || k.indexOf(pre + ':') === 0).reduce((a, k) => a + h.n[k], 0), 0), tot = all.reduce((t, h) => t + (h.play || 0), 0);
  out.push('== Всего за ' + all.length + ' сесс. · сыграно ' + Math.floor(tot / 60) + ' мин · смертей ' + sum('смерть') + ' · роботов убито ' + sum('убит') + ' · комбо ' + sum('комбо') + ' · уровней пройдено ' + all.reduce((t, h) => t + (h.ev || []).filter(e => e[1] === 'финиш').length, 0)); out.push('');
  one(PLOG, 'Эта сессия'); for (let i = PLOG_HIST.length - 1, k = 1; i >= 0; i--, k++) { const P = PLOG_HIST[i]; out.push(''); one(Object.assign({}, P, { cut: k <= 3 ? 200 : 60 }), 'Сессия −' + k); }
  return out.join('\n');
}
function togglePlog() { const el = $('plog'); if (!el) return; el.hidden = !el.hidden; const b = $('plogBtn'); if (b) b.classList.toggle('act', !el.hidden); if (!el.hidden) { $('plogText').value = plogText(); $('plogMsg').textContent = ''; } }
{ const b = document.getElementById('plogBtn'); if (b) b.addEventListener('click', togglePlog);
  const c = document.getElementById('plogCopy'); if (c) c.addEventListener('click', () => { const ta = $('plogText'), msg = $('plogMsg'); ta.value = plogText(); ta.focus(); ta.select(); const done = ok => { msg.textContent = ok ? 'Скопировано — вставьте в чат' : 'Текст выделен — нажмите Ctrl+C'; };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(() => done(true), () => { let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} done(ok); }); else { let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} done(ok); } } catch (e) { done(false); } });
  const x = document.getElementById('plogClear'); if (x) x.addEventListener('click', () => { PLOG.ev = []; PLOG.n = {}; PLOG.hs = []; PLOG.play = 0; PLOG_HIST = []; PLOG.started = new Date().toISOString(); try { localStorage.removeItem('rk_plog'); localStorage.removeItem('rk_plog_hist'); } catch (e) {} $('plogText').value = plogText(); $('plogMsg').textContent = 'Журнал очищен'; }); }
function hurtHero(fromU, why) {
  if (hero.invuln > 0 || hero.state === 'dead' || hero.burstT > 0) return;
  if (hero.hideN) { hero.hideN = false; hero.hideJ = null; setUD(hero, toU(hero), 8); }
  game.quietT = 0;
  hero.kride = null; hero.beam = null; if (hero.forkP) { if (hero.forkP.r) hero.forkP.r.forked = false; hero.forkP = null; } PLOG.why = why || plogCause(); loseHP(); hero.hurtAt = game.time; hero.invuln = 1.2; hero.hang = null; hero.ladder = null; updateHUD();
  const away = Math.sign(toU(hero) - fromU) || -hero.face;
  hero.vx = away * 1.8; hero.vy = 3.2; hero.onGround = false; hero.face = -away;
  go('Kulbit');
  sfx(pick(['RobotHit2', 'RobotHit3']), 0.7, 1.3); sfx('RobotHit5', 0.45, 0.75);
  burst(hero.x, hero.y + 0.35, hero.z, { n: 16, cols: ['#e0702e', '#fff4e1', '#c0392b', '#ffb326'], sp: [1.2, 4], life: 0.5, dir: away });   // от героя отлетают осколки
  burst(hero.x, hero.y + 0.35, hero.z, { n: 6, cols: ['#fff4e1', '#e0702e'], sp: [0.6, 2], life: 0.35 }); game.shake = Math.max(game.shake, 0.06);
  if (hero.hp <= 0) killHero();
  updateHUD();
}
function loseHP() {                     // урон: сначала слетает кусочек брони, жизни не трогаем
  if (hero.armor > 0) { plog('броня-', PLOG.why || 'другое'); hero.armor--; sfx('RobotHit3', 0.6, 1.8); sfx('RobotHit5', 0.3, 2.2); burst(hero.x, hero.y + 0.4, hero.z, { n: 12, cols: ['#e6f0f8', '#aebccc', '#5d6b7a'], sp: [1, 3.5], up: 1.2, life: 0.5 }); popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, t: 0, text: 'Броня −1' }); updateHUD(); return false; }
  plog('урон', PLOG.why || 'другое'); hero.hp--;
  if (hero.hp <= 0 && talHas('s4') && !game.windUsed) { game.windUsed = true; hero.hp = 1; hero.invuln = Math.max(hero.invuln || 0, 2); popups.push({ x: hero.x, y: hero.y + 1.1, z: hero.z, t: 0, text: 'Второе дыхание!', heal: true }); sfx('RobotHit5', 0.6, 1.8); plog('талант', 'второе дыхание'); }   /* v301 */
  return true;
}
function dropArmor(r) {                 // из каждого второго робота выпадает кусочек брони
  if (Math.random() >= (game.armorTest !== undefined ? game.armorTest : 0.5)) return; hearts.push({ x: r.x + (r.sh || 0) * view.r[0], y: r.y + 0.5, z: r.z + (r.sh || 0) * view.r[1], got: false, ph: rnd(0, 6), born: 0, armor: true });
}
const onGateLift = () => !!(hero.standOn && hero.standOn.gateN);
function killHero() { if (hero.state !== 'dead' && testSaveFromDeath()) return; if (hero.state !== 'dead') { plog('смерть', hero.y < -7 ? 'упал в пропасть, последняя опора ' + (PLOG.lastG || '?') : hero.burstT > 0 ? 'лопнул от воды' : PLOG.why || 'другое'); plogSave(); } hero.state = 'dead'; hero.deadT = 0; hero.hp = 0; hero.hang = null; hero.ride = null; hero.ladder = null; updateHUD(); }
function respawn() {       // после гибели — всегда с самого низа; подобранные ключи и нож остаются при герое
  Object.assign(save, { x: (LEVEL.spawn || LEVEL.start).x, y: (LEVEL.spawn || LEVEL.start).y, z: (LEVEL.spawn || LEVEL.start).z, k: 0 }); /* ключи и нож после гибели остаются у героя */
  setView(save.k); game.deathT = 0; resize(); hero.burstT = 0; hero.burstDead = false; hero.wetT = 0; hero.washT = 0; hero.rip = null; hero.dash = null; hero.grab = null; hero.tele = null; hero.dive = null; hero.kride = null; hero.forkP = null; hero.beam = null;
  hero.burn = 0;
  Object.assign(hero, { x: save.x, y: save.y + 0.05, z: save.z, vx: 0, vy: 0, state: 'free', trig: {}, hp: heroMaxHP(), armor: 0, invuln: 1.5, onGround: false, hang: null, ride: null, ladder: null, ladPL: null, standOn: null, arm: null, armSv: 0, frontT: 0, wasRide: false });   /* v280: ничего не тянется из прошлой жизни (рука, лестница, опора) */
  inputQ = []; go('Stay'); if (hero.y < 12) game.calmT = CALM_AFTER_EXIT;   // v230: после гибели у подножия тоже передышка
  cam.x = hero.x; cam.y = hero.y + 1.2; cam.z = hero.z;
  updateHUD();
}

// Зацеп за край: рука на высоте 0.72 над ступнями и на 0.2 впереди.
const HAND_Y = 0.72, HANG_Y = 0.57;   // HAND_Y — на какой высоте рука ловит край в падении; HANG_Y — насколько ступни ниже края, когда герой уже висит
function tryHang() {
  // v300 (Алексей: «чтобы реалистичнее цеплялся за углы»): руки ловят край и на подъёме у верхней точки (не только в падении), чуть ниже края
  // (рука тянется вверх) и чуть дальше вбок (рука тянется к углу)
  if (hero.onGround || hero.vy >= 1.3 || hero.hangCool > 0 || !(hero.st === 'Fly' || hero.st === 'JumpInRun' || hero.st === 'DoubleJump' || hero.st === 'HookThrow')) return;
  const dir = hero.face, u = toU(hero), d = toD(hero), handY = hero.y + HAND_Y, T = Math.round(handY + 0.1);
  for (const bm of (game.noPipeHang ? [] : LEVEL.beams.concat(armBeams))) {   /* v278: armBeams — трубы на руках */   // горизонтальная труба: руки на трубе — повис под ней; вдоль трубы можно перебирать руками, прыжок — залезть наверх
    const a = bm[0], c2 = bm[1], da = a[0] * view.n[0] + a[2] * view.n[1], dc = c2[0] * view.n[0] + c2[2] * view.n[1]; if (bm.armP ? !armVisible() : (da < 7 || dc < 7 || Math.abs(da - dc) > 0.3)) continue;
    const ua = a[0] * view.r[0] + a[2] * view.r[1], uc = c2[0] * view.r[0] + c2[2] * view.r[1], top = a[1] + 0.13, lo = Math.min(ua, uc) + 0.1, hi = Math.max(ua, uc) - 0.1;
    if (u < lo || u > hi || Math.abs(handY - top) > 0.16) continue; const bd = bm.armP ? d : da < 8.6 ? 8 : Math.round(da - 0.3), ny = top - 0.65;   // кадры лазания: ладони чуть выше, чем у виса на краю
    if (overlapsDepth(u, ny, hero.hw, hero.h, bd)) continue;
    if (!keys.has('up')) { let fl = false; for (let yy = Math.floor(hero.y) - 1; yy >= Math.max(-1, Math.floor(hero.y) - 7) && !fl; yy--) if (floorCube(Math.round(u), yy, d, 'any')) fl = true; if (fl) { hero.pipeHintT = game.time; continue; } }   // над опорой хватается, только если держишь вверх; над пустотой — сам
    hero.hangPop = hero.y - ny; setUD(hero, u, bd); hero.y = ny; hero.vx = 0; hero.vy = 0; hero.jumpUp = false;
    hero.hang = { U: Math.round(u), T: top, dir, pipe: { lo, hi, d: bd } }; hero.hook = null; hero.hookAir = false; go('Take'); return; }
  for (const g of LEVEL.grips || []) {   // v265: ухват — рукой в прыжке/падении: висит как на трубе, прыжок — вверх, вниз — отпустить
    if (gripFace(g) < 0.5 || propHidden(g)) continue; const gu = toU(g), gy = gripHand(g), du = (gu - u) * dir;
    if (du < -0.15 || du > hero.hw + 0.45 || Math.abs(handY - gy) > 0.3) continue; const gd = toD(g) + 0.49, ny = gy - 0.65;
    if (overlapsDepth(gu, ny, hero.hw, hero.h, gd)) continue;
    hero.hangPop = hero.y - ny; setUD(hero, gu, gd); hero.y = ny; hero.vx = 0; hero.vy = 0; hero.jumpUp = false; g.lit = 1;
    hero.hang = { U: Math.round(gu), T: gy, dir, pipe: { lo: gu, hi: gu, d: gd }, grip: g }; hero.hook = null; hero.hookAir = false; go('Take'); sfx('RUN_1_13', 0.25, 1.4); return; }
  const tw = talHas('m1') ? 0.18 : 0;   /* v301: талант «Цепкие руки» */
  if (handY < T - 0.3 - tw || handY > T + 0.15) return;
  const U = Math.round(u + dir * (hero.hw + 0.3 + tw));
  if (U === Math.round(u - dir * 0.2)) return;
  const edge = U - dir * 0.5, gap = (edge - (u + dir * hero.hw)) * dir;
  if (gap > 0.32 + tw) return;
  const c = floorCube(U, T - 1, d, 'visible'); if (!c) return;
  const beside = cellAt(U - dir, T - 1); if (beside && beside[0].dep >= c.dep - DEPTH_TOL) return;   // рядом на той же глубине или ближе стоит куб — края на экране нет, цепляться не за что
  if (gap < (Math.abs(c.dep - d) <= DEPTH_TOL ? -0.1 : -0.45)) return;   // платформа на другой глубине стеной не служит — ловим край шире
  if (floorCube(Math.round(u), T - 1, d, 'visible')) return;               // под нами такая же опора — не край
  const nu = edge - dir * (hero.hw + 0.005), ny = T - HANG_Y;
  if (overlapsDepth(nu, ny, hero.hw, hero.h, c.dep) || heroHiddenAt(nu, ny, c.dep)) return;
  hero.hangPop = hero.y - ny;
  setUD(hero, nu, c.dep); hero.y = ny; hero.vx = 0; hero.vy = 0; hero.jumpUp = false;
  hero.hang = { U, T, dir }; hero.hook = null; hero.hookAir = false; go('Take');
}
// Робот — твёрдое тело: по его спине можно ходить, а если в падении схватиться за край — герой повиснет сзади и робот потащит его.
const ROBOT_TOP = 0.74, ROBOT_SHOULDER = 0.64;
// v243: heroHiddenAt — перенесено в ядро, src/06b_world.js
// верх робота по его рисунку: посередине голова, по бокам плечи ниже
const robotTopAt = du => ROBOT_SHOULDER + (ROBOT_TOP - ROBOT_SHOULDER) * Math.max(0, Math.min(1, (0.15 - Math.abs(du)) / 0.07));
// v296 (Алексей: «боты становятся прозрачными и исчезают до того, как зашли за угол»): за кубом прятался, если край тела (±0.3) хоть чуть заходил
// за ближний куб — и таял в открытом месте. Теперь — только когда за кубами всё тело (оба края и середина); пока частично — его закрывают сами кубы (порядок рисования).
// v298 (Алексей: «всё ещё исчезает, а не заходит за угол, и бежит на месте»): уходящий вглубь (уступ торцом) рисуется со сдвигом вбок — к стене,
// за край которой он «заходит» (`ash`), а кубы, что ближе него, вырезают его из картинки (`robotClip`) — он скрывается за углом, а не тает.
const robotOcc = r => { const u = toU(r) + (r.sh || 0) + (r.ash || 0), d = toD(r) + DEPTH_TOL; for (const du of [-0.3, 0, 0.3]) if (!eachBodyCell(u + du, r.y, 0, 0.7, a => a[0].dep > d)) return false; return true; };
const robotHidden = r => r.armP ? !armVisible() : (r.away && !r.dead && (r.ashS ? toD(r) < (r.ashF ?? 0) - 1.6 : Math.abs(toD(r) - (r.awayD ?? -99)) > 0.4)) || (r.loop && !r.dead && !r.atk && !(r.hide < 1) && Math.abs(r.hx * view.n[0] + r.hz * view.n[1]) > 0.5 && toD(r) < Math.abs(toU(r)) - 2.4) || robotOcc(r);   /* v311: за углом прячет стена (robotOcc); запасное — глубже 2.4 от ребра */   // v230: обходчик у подножия прячется, только уйдя за угол на 1.6 (раньше — в миг поворота, стоя на краю на виду)
function tryMount() {
  // v300 (Алексей: «зацепиться за плечо бота очень тяжело попасть — продумай удобнее»): было — только в падении, руки ровно на уровне плеча и в узкой
  // полоске сбоку (0.3–0.72 от середины). Теперь — и у верхней точки прыжка, руки в пределах −0.35…+0.3 от плеча, сбоку или сзади до 0.9 от середины
  if (hero.onGround || hero.vy >= 1.5 || !(hero.airT > 0.12) || hero.rideCool > 0 || !(hero.st === 'Fly' || hero.st === 'JumpInRun' || hero.st === 'DoubleJump' || hero.st === 'HookThrow')) return;
  const u = toU(hero), prevY = hero.y - hero.vy / 120;      // где ступни были тик назад: чтобы не проскочить на большой скорости
  for (const r of robots) {
    // сесть можно на любого робота, которого видно: герой переходит на его ряд, как при приземлении на куб
    if (r.dead || !reach(r)) continue;
    const du = u - toU(r), top = r.y + ROBOT_SHOULDER;
    const back = du * (r.face || r.dir || 1) < 0;   /* v303 (Алексей: «слишком легко цепляется за плечо, сам по себе — только в прыжке за спину или в падении»): только со спины */
    if (back && Math.abs(du) >= 0.22 && Math.abs(du) < 0.9 && !(r.taxi || r.lift || r.onCloud) && Math.abs(toD(r) - toD(hero)) <= 1.2 && hero.y + HAND_Y <= top + 0.3 && Math.max(prevY, hero.y) + HAND_Y >= top - 0.35) { hero.ride = { r, mode: 'hang' }; hero.rideU = null; go('Take'); hero.hangPop = hero.y - (r.y + ROBOT_SHOULDER - HANG_Y); }
    if (hero.ride) { hero.hook = null; hero.vx = hero.vy = 0; hero.jumpUp = false; hero.boostT = 0; hero.pushV = 0; placeRider(); sfx('RUN_1_13', 0.3, 0.7); return; }
  }
}
function placeRider() {
  const rd = hero.ride, r = rd.r, ru = toU(r), d = toD(r);
  if (rd.mode === 'sit') { setUD(hero, ru + rd.off, d); hero.y = r.y + ROBOT_TOP; }
  else {                              // висит всегда сзади: с той стороны, откуда робот уходит; держится за край того кадра, что сейчас на экране
    const side = -r.dir, rs = robotSprite(r), rb = spriteBox(rs.name, ru + rs.ox, r.y + 0.39, rs.flip);
    const edge = rb ? (side < 0 ? rb[0] : rb[1]) : ru + side * 0.36, want = edge - ru + side * 0.1;
    hero.rideU = hero.rideU === null ? want : hero.rideU + (want - hero.rideU) * 0.2;
    setUD(hero, ru + hero.rideU, d); hero.y = r.y + ROBOT_SHOULDER - HANG_Y;
    if (hero.face !== r.dir) { hero.face = r.dir; const [nm, flip] = heroClip('Take'); hero.anim.play(nm, { loop: true, flip }); }
  }
}
// Вырвать шнур: герой висит на плече робота — три быстрых F. Он тянется к шнуру на голове робота, выдёргивает его (робот гибнет сразу) и отпрыгивает со шнуром в руке
const ripSide = r => Math.sign(toU(hero) - toU(r)) || -r.dir;
const ripHead = r => [r.x + (r.sh || 0) * view.r[0], r.y - (r.dip || 0) + 0.8, r.z + (r.sh || 0) * view.r[1]];
let zaps = [];
function fSparks(r, n) {                // при каждом F из гнезда шнура сыплется горсть искр: взлетают и падают
  const [hx, hy, hz] = ripHead(r); for (let i = 0; i < n; i++) parts.push({ x: hx + rnd(-0.06, 0.06) * view.r[0], y: hy + rnd(-0.03, 0.05), z: hz + rnd(-0.06, 0.06) * view.r[1], vx: rnd(-1.8, 1.8) * view.r[0], vz: rnd(-1.8, 1.8) * view.r[1], vy: rnd(0.6, 3), g: 11, drag: 0, t: 0, life: rnd(0.35, 0.7), size: Math.random() < 0.25 ? 2 : 1, col: pick(['#ffffff', '#fff3a0', '#ffb04a', '#8fe8ff']) });
}
// v243: arcs — перенесено в ядро, src/06b_world.js
function shock(r, big) {                // разряд от головы робота: дуги-«когти» в стороны и в пол; большой — ещё и по всем мокрым рядом
  const [hx, hy, hz] = ripHead(r); arcs.push({ x: hx, y: hy, z: hz, base: r.y - (r.dip || 0), t: 0, life: big ? 0.75 : 0.3, n: big ? 4 : 2, span: big ? 1.7 : 0.9, seed: Math.random() * 99 }); zapSound(big ? 0.9 : 0.45, big ? 0.6 : 0.25); game.shake = Math.max(game.shake, big ? 0.2 : 0.06);
  if (!big) return; popups.push({ x: r.x, y: r.y + 1.35, z: r.z, text: 'Замыкание!', t: 0 }); plog('комбо', 'Замыкание'); const ru = toU(r);
  for (const o of robots) { if (o === r || o.dead || !(o.wet > 0) || Math.abs(o.y - r.y) > 1.2 || Math.abs(toU(o) - ru) > 4.5 || Math.abs(toD(o) - toD(r)) > 1.2) continue;   // мокрые роботы рядом получают удар током
    const oh = ripHead(o); arcs.push({ x: oh[0], y: oh[1], z: oh[2], base: o.y - (o.dip || 0), t: 0, life: 0.6, n: 3, span: 1.1, seed: Math.random() * 99 }); arcs.push({ x: (hx + oh[0]) / 2, y: r.y + 0.1, z: (hz + oh[2]) / 2, base: r.y - 0.05, t: 0, life: 0.5, n: 2, span: Math.abs(toU(o) - ru) / 2 + 0.2, seed: Math.random() * 99, low: true });
    o.stun = Math.max(o.stun || 0, 1.6); o.atk = null; o.flashT = 0.3; PLOG.kill = 'ток'; damageRobot(o, CFG.hitDamage * 4, true); PLOG.kill = ''; }
}
// v243: function drawArcs — перенесено в ядро, src/13c_units.js
function ripStage(r, n) {               // первое и второе F: герой уже тянется к шнуру и берётся за него, робот искрит
  hero.anim.play('MainCharAC_CordRip' + (ripSide(r) > 0 ? 'A' : 'B') + n, { loop: false, restart: true, flip: false }); r.stun = Math.max(r.stun || 0, 1.0); r.atk = null; r.buckT = 0;
  const [hx, hy, hz] = ripHead(r); burst(hx, hy, hz, { n: 3 + n * 2, cols: SPARK.concat(['#ffffff', '#8fe8ff']), sp: [1.2, 4], up: 2, life: 0.4 }); fSparks(r, 4 + n); if (r.wet > 0) shock(r, false); zapSound(0.3 + n * 0.1, 0.22); game.shake = Math.max(game.shake, 0.04 * n);
}
function startRip() {
  const r = hero.ride.r, side = ripSide(r); hero.rip = { r, side, t: 0, killed: false, left: false, x: hero.x, y: hero.y, z: hero.z }; hero.ripN = 0; r.stun = Math.max(r.stun || 0, 0.6); r.atk = null; r.buckT = 0;
  go('CordRip'); hero.anim.play('MainCharAC_CordRip' + (side > 0 ? 'A' : 'B') + '3', { loop: false, restart: true, flip: false }); hero.invuln = Math.max(hero.invuln, 1.2); hero.hook = null; zapSound(0.6, 0.35);
}
function updateRip(dt) {
  const R = hero.rip, r = R.r; R.t += dt; hero.anim.update(dt); hero.x = R.x; hero.y = R.y; hero.z = R.z; hero.vx = 0; hero.vy = 0;   // до прыжка висит там же, где схватился
  if (!R.killed && R.t >= 0.05) { R.killed = true; game.shake = Math.max(game.shake, 0.2); game.hitStop = Math.max(game.hitStop, 0.07); sfx('RobotHit5', 0.7, 0.7); knifeSound(true); zapSound(0.8, 0.5);
    const [hx, hy, hz] = ripHead(r); burst(hx, hy, hz, { n: 18, cols: SPARK.concat(['#ffffff', '#ffffff', '#ff5a3a', '#8fe8ff', '#8fe8ff']), sp: [1.5, 7], up: 2.6, life: 0.6 }); burst(hx, hy + 0.05, hz, { n: 6, cols: ['#ffffff', '#fff3a0'], sp: [3, 9], up: 3.4, life: 0.3 }); burst(hx, hy - 0.1, hz, { n: 8, cols: ['#2c2c30', '#55555c'], sp: [1, 3], up: 1.6, life: 0.6, size: 2 });
    zaps.push({ r, t: 1.1, s: 0.12 }); if (r.wet > 0) shock(r, true);
    if (!r.dead && robots.indexOf(r) >= 0) { r.rage = 0; r.stun = 0; r.headJob = false; r.headless = false; r.hp = 0; damageRobot(r, 1, true); popups.push({ x: r.x, y: r.y + 1.1, z: r.z, text: 'Шнур вырван!', t: 0 }); } }
  if (R.t >= 0.17) { hero.rip = null; hero.ride = null; hero.rideCool = 0.9; hero.hangCool = 0.5; hero.vx = R.side * 5.6; hero.vy = 3.6; hero.onGround = false; hero.airJumps = 1; hero.face = -R.side; hero.invuln = Math.max(hero.invuln, 1.8); hero.dodgeT = Math.max(hero.dodgeT || 0, 1.8); go('Kulbit'); }   // оттолкнулся от робота — кульбит, как при отскоке
}
function updateZaps(dt) {               // из оборванного гнезда ещё секунду сыплются искры
  for (const z of zaps) { z.t -= dt; z.s -= dt; const r = z.r, [hx, hy, hz] = ripHead(r);
    if (Math.random() < dt * 22) parts.push({ x: hx, y: hy, z: hz, vx: rnd(-3.5, 3.5) * view.r[0], vz: rnd(-3.5, 3.5) * view.r[1], vy: rnd(1, 5), g: 12, drag: 0, t: 0, life: rnd(0.2, 0.5), size: 1, col: pick(['#ffffff', '#fff3a0', '#8fe8ff', '#ffb04a']) });
    if (z.s <= 0) { z.s = rnd(0.16, 0.3); zapSound(0.3 * Math.max(0.3, z.t), 0.18); } }
  zaps = zaps.filter(z => z.t > 0);
}
// Выпад с ножом: герой проносится вперёд на четыре с лишним куба двумя ударами, за ним синий шлейф глаз и светлый — от клинка.
// Роботов на пути он проходит насквозь и сносит им головы
const canHead = r => !shieldFront(r) && canHead0(r), canHead0 = r => !(r.dead || r.headless || r.headJob || r.hunter || r.lift || r.onCloud || r.taxi || (r.rage > 0));
// Выпад не всегда проходит: изредка робот перехватывает героя за шею, поднимает и бьёт об пол
// Приёмы, которые убивают сразу, приедаются: чем чаще подряд один и тот же, тем вернее робот его раскусит и перехватит героя.
// Каждый другой приём сбивает счёт остальных; со временем счёт тоже остывает
const fatigue = { dash: 0, jjk: 0, tele: 0, rip: 0, plug: 0, beam: 0, fhook: 0, kride: 0 }, FAT_NAME = { dash: 'выпад', jjk: 'нож-нож-нога', tele: 'кунай и два ножа', rip: 'шнур', plug: 'вилка в гнездо', beam: 'поток тока', fhook: 'вилка и крюк', kride: 'кунай, рука, нога' }; let fatT = 0;
function comboCounter(kind, r, onCatch) {        // true — робот перехватил, приём не прошёл
  if (!canHead(r) || hero.state === 'dead') return false;
  const n = fatigue[kind]; let p = [0.06, 0.3, 0.55, 0.8][Math.min(3, n)]; if (game.grabTest !== undefined) p = game.grabTest ? 1 : 0;
  fatigue[kind] = Math.min(3, n + 1);   // другой приём счёт не сбивает: остывает только со временем, шаг в 35 секунд
  if (Math.random() >= p) { plog('приём', FAT_NAME[kind] + ' (повтор ' + n + ', шанс перехвата ' + Math.round(p * 100) + '%)'); return false; } plog('перехват', FAT_NAME[kind] + ' (повтор ' + n + ', шанс ' + Math.round(p * 100) + '%)'); if (onCatch) onCatch(r, n >= 2); else startGrab(r, n >= 2); return true;
}

// v298: вырезать из картинки робота клетки, где ближний куб стоит перед ним — частично зашедший за угол робот виден только до края стены
function robotClip(r, b) { if (view.rotating || r.dead || r.y > 900) return false; const cu = cam.x * b.r[0] + cam.z * b.r[1], u = toU(r) + (r.sh || 0) + (r.ash || 0), d = toD(r) + DEPTH_TOL, R = [];
  for (let U = Math.round(u - 0.75); U <= Math.round(u + 0.75); U++) for (let Y = Math.floor(r.y) - 1; Y <= Math.floor(r.y + 1.3); Y++) { const a = cellAt(U, Y); if (a && a[0].dep > d) R.push([Math.round(W / 2 + (U - 0.5 - cu) * S), Math.round(H / 2 - (Y + 1 - cam.y) * S), Math.ceil(S) + 1]); }
  if (!R.length) return false; ctx.save(); ctx.beginPath(); ctx.rect(-10, -10, W + 20, H + 20); for (const q of R) ctx.rect(q[0], q[1], q[2], q[2]); ctx.clip('evenodd'); return true; }

// v311 (Алексей: «невидимая платформа» — герой стоит в воздухе): если герой полсекунды стоит, а под ногами нет ни видимого куба, ни предмета-опоры,
// пишем в журнал (P) точку, сторону, глубину и что рядом — чтобы найти, на чём он стоял
function supWatch(dt) { if (!hero.onGround || hero.state === 'dead' || hero.hideN || hero.ride || hero.hang || hero.ladder || hero.inDoor || hero.y > 900) { PLOG.supT = 0; return; }
  if (hero.standOn || (typeof heroBeam === 'function' && heroBeam()) || (typeof slabHit === 'function' && slabHit(toU(hero), hero.y - 0.1, hero.hw, 0.08, toD(hero)))) { PLOG.supT = 0; return; } const u = toU(hero), d = toD(hero), Y = Math.round(hero.y);
  if ([u - hero.hw, u, u + hero.hw].some(q => floorCube(Math.round(q), Y - 1, d, 'any'))) { PLOG.supT = 0; return; }
  PLOG.supT = (PLOG.supT || 0) + dt; if (PLOG.supT < 0.5 || game.time - (PLOG.supAt || -99) < 5) return; PLOG.supAt = game.time;
  const near = []; for (const c of cubes.values()) if (Math.abs(c.y - (hero.y - 1)) < 1.1 && Math.hypot(c.x - hero.x, c.z - hero.z) < 1.6) near.push(c.x + ',' + c.y + ',' + c.z + ':' + (c.kind || '') + (c.rec ? 'r' : '') + '@' + (c.x * view.n[0] + c.z * view.n[1]));
  plog('невидимая опора', 'у=' + hero.y.toFixed(2) + ' u=' + u.toFixed(2) + ' глуб=' + d.toFixed(2) + ' xz=' + hero.x.toFixed(2) + ',' + hero.z.toFixed(2) + ' кубы: ' + near.slice(0, 6).join(' ')); }
function startGrab(r, tired) {
  const ru = toU(r) + (r.sh || 0), side = Math.sign(toU(hero) - ru) || -hero.face; hero.dash = null; hero.tele = null; hero.rip = null; hero.ride = null; hero.hang = null; hero.headJob = null; hero.pend = null; hero.hook = null; hero.ripN = 0;
  // v298 (Алексей: «бросил об землю, но рядом не было тайла — ударил об невидимый тайл, а должен был улететь вниз»): бьёт о пол с той стороны, где пол есть;
  // нигде нет — после удара герой падает вниз (G.air)
  const fl = sd => !!floorCube(Math.round(ru + sd * 0.68), Math.round(r.baseY !== undefined ? r.baseY : r.y) - 1, toD(r), 'any'); let sd2 = side; if (!fl(sd2) && fl(-sd2)) sd2 = -sd2;
  hero.grab = { r, side: sd2, t: 0, hit: false, y0: hero.y, u0: toU(hero), jit: 0, air: !fl(sd2) }; hero.vx = 0; hero.vy = 0; hero.hitWin = null; hero.invuln = Math.max(hero.invuln, 0.6); hero.onGround = false;
  r.stun = 1.2; r.atk = null; r.aggro = 0; r.headJob = false; r.grabT = 1.2; r.dir = -1; r.face = sd2; r.fa = view.k * 90; r.anim.play('RobotAC_Punch' + (sd2 > 0 ? 'L1' : 'R1'), { loop: false, restart: true }); r.clipT = 1.2;
  go('Fly'); hero.face = -sd2; popups.push({ x: r.x, y: r.y + 1.15, z: r.z, text: 'Перехватил!', t: 0 }); sfx('RobotHit2', 0.6, 0.6); sfx('RobotHit4', 0.4, 0.5); game.hitStop = Math.max(game.hitStop, 0.08); game.shake = Math.max(game.shake, 0.06);
  showCombo(tired ? 'Робот раскусил приём — смени комбо' : 'Робот схватил за шею', true);
}
function updateGrab(dt) {               // поймал на вытянутую руку — держит за шею, герой болтает ногами — замах — впечатывает в пол — герой лежит и откатывается
  const G = hero.grab, r = G.r; G.t += dt; hero.anim.update(dt * (G.t < 0.5 ? 2.2 : 0));
  if (r.dead || robots.indexOf(r) < 0) { hero.grab = null; hero.lean = 0; go('Fly'); return; }
  const T1 = 0.1, T2 = 0.5, T3 = 0.62, T4 = 0.9, ru = toU(r) + (r.sh || 0), S1 = G.side, pc = 'RobotAC_Punch' + (S1 > 0 ? 'L1' : 'R1'), hold = S1 > 0 ? 0.15 : 0.2; r.grabT = 0.3; if (r.anim.name !== pc) r.anim.play(pc, { loop: false, restart: true }); if (hero.st !== 'Fly') go('Fly'); r.stun = Math.max(r.stun, 0.3);
  let u, y, rot;
  if (G.t < T1) { const k = G.t / T1; u = G.u0 + (ru + S1 * 0.46 - G.u0) * k; y = G.y0 + (r.y + 0.2 - G.y0) * k; rot = -S1 * 0.2 * k; r.anim.t = hold; }
  else if (G.t < T2) { const k = (G.t - T1) / (T2 - T1); G.jit -= dt; if (G.jit <= 0) { G.jit = 0.11; G.jx = rnd(-0.012, 0.012); G.jy = rnd(-0.01, 0.014); if (Math.random() < 0.6) sfx('RUN_1_13', 0.12, 2.2); }
    u = ru + S1 * 0.46 + (G.jx || 0); y = r.y + 0.2 + 0.05 * k + (G.jy || 0); rot = -S1 * (0.2 + 0.12 * Math.sin(G.t * 26)); r.anim.t = hold; if (k > 0.8) { r.anim.t = 0.06; u -= S1 * 0.08 * (k - 0.8) / 0.2; y += 0.12 * (k - 0.8) / 0.2; } }   // под конец — короткий замах
  else if (G.t < T3) { const k = (G.t - T2) / (T3 - T2), e = k * k; u = ru + S1 * (0.38 + 0.3 * e); y = r.y + 0.37 * (1 - e); rot = S1 * (-0.2 + 1.7 * e); r.anim.t = hold; }
  else { const k = (G.t - T3) / (T4 - T3); u = ru + S1 * 0.68; y = r.y + 0.1 * Math.max(0, Math.sin(Math.PI * Math.min(1, k * 2.5))) * (k < 0.4 ? 1 : 0); rot = S1 * 1.5; r.anim.t = S1 > 0 ? 0.3 : 0.47; }
  if (talHas('c3') && !G.hit && G.t < T3) { if (pressed.has('dodge')) { pressed.delete('dodge'); G.esc = (G.esc || 0) + 1; sfx('RUN_1_13', 0.3, 1.8); } if (G.esc >= 3) { hero.grab = null; hero.lean = 0; r.grabT = 0; r.stun = 1.0; hero.invuln = 1; hero.vx = S1 * 3.4; hero.vy = 3; hero.onGround = false; hero.face = -S1; go('Kulbit'); popups.push({ x: hero.x, y: hero.y + 1, z: hero.z, t: 0, text: 'Вырвался!', heal: true }); plog('талант', 'вырвался'); return; } }   /* v301: талант «Вырваться» */
  setUD(hero, u, toD(r)); hero.y = Math.max(r.y, y); hero.vx = 0; hero.vy = 0; hero.lean = rot; hero.invuln = Math.max(hero.invuln, 0.05);
  if (!G.hit && G.t >= T3) { G.hit = true; hero.sq = -0.35; hero.sqV = 0; game.shake = Math.max(game.shake, 0.26); game.hitStop = Math.max(game.hitStop, 0.1); sfx('RobotHit6', 0.9, 0.6); sfx('RobotHit5', 0.6, 0.6); r.sq = -0.12; r.sqV = 0;
    burst(hero.x, r.y + 0.05, hero.z, { n: 18, cols: DIRT, sp: [1, 4.5], up: 1.3, life: 0.5 }); burst(hero.x, r.y + 0.1, hero.z, { n: 12, cols: SMOKE, sp: [0.3, 1.5], up: 0.8, g: 0, drag: 2.5, life: 0.7, size: 2 });
    game.quietT = 0; PLOG.why = 'перехват: об пол'; loseHP(); updateHUD();
    if (hero.hp <= 0) { hero.grab = null; hero.lean = 0; r.grabT = 0; killHero(); return; } }
  if (G.air && G.hit && G.t >= T3 + 0.05) { hero.grab = null; hero.lean = 0; r.grabT = 0; r.stun = 0.5; r.atkCool = Math.max(r.atkCool || 0, 1.2); hero.invuln = 1.0; hero.vx = S1 * 3.2; hero.vy = -2; hero.onGround = false; hero.face = -S1; go('Fly'); return; }   // пола нет — швырнул вниз
  if (G.t >= T4) { hero.grab = null; hero.lean = 0; r.grabT = 0; r.stun = 0.5; r.atkCool = Math.max(r.atkCool || 0, 1.2); hero.y = r.y; hero.invuln = 1.3; hero.vx = S1 * 2.2; hero.vy = 2.8; hero.onGround = false; hero.face = -S1; go('Kulbit'); }
}
// Кунай и два ножа: герой исчезает и возникает за спиной робота, в которого метил кунай; два взмаха — и голова с плеч
function teleTarget() {
  const hu = toU(hero); let best = null, bd = 9;
  for (const k of kunais) if (k.in && !k.in.dead && canHead0(k.in) && reach(k.in)) { const d = Math.abs(toU(k.in) - hu); if (d < bd) { bd = d; best = k.in; } }
  if (best) return best; bd = 7.5;
  for (const o of robots) { if (!canHead0(o) || !reach(o) || robotHidden(o) || o.y - hero.y > 0.75 || hero.y - o.y > (hero.onGround ? 0.75 : 3.2)) continue; const du = (toU(o) + (o.sh || 0) - hu) * hero.face; if (du > 0.2 && du < bd) { bd = du; best = o; } }
  return best;
}
function startTele(r) {
  const hu = toU(hero), ru = toU(r) + (r.sh || 0), d = toD(r), s = Math.sign(ru - hu) || hero.face, ok = u => !!floorCube(Math.round(u), Math.round(r.y) - 1, d, 'any') && !overlapsDepth(u, r.y, hero.hw, hero.h, d);
  const side = ok(ru + s * 0.55) ? s : -s, nu = ru + side * 0.55, ox = hero.x, oy = hero.y, oz = hero.z;
  burst(ox, oy + 0.3, oz, { n: 14, cols: ['#8fe8ff', '#dff6ff', '#ffffff', '#3fc1d6'], sp: [0.5, 2.5], up: 0.6, g: 0, drag: 3, life: 0.35 });
  setUD(hero, nu, d); hero.y = r.y; hero.vx = 0; hero.vy = 0; hero.onGround = true; hero.face = -side; hero.hook = null; hero.hitWin = null; hero.hideN = false; hero.invuln = Math.max(hero.invuln, 0.9); hero.passT = 0.9;
  if (Math.abs(oy - hero.y) < 0.8 && toD({ x: ox, z: oz }) === d) { dashTrail.push({ x: ox, y: oy, z: oz, t: 0, dir: s }); dashTrail.push({ x: hero.x, y: hero.y, z: hero.z, t: 0, dir: s }); }
  burst(hero.x, hero.y + 0.3, hero.z, { n: 14, cols: ['#8fe8ff', '#dff6ff', '#ffffff'], sp: [0.5, 2.5], up: 0.6, g: 0, drag: 3, life: 0.35 });
  if (comboCounter('tele', r)) return;
  r.stun = Math.max(r.stun || 0, 1.0); r.atk = null; r.aggro = 0; hero.tele = { r, t: 0, second: false, cut: false }; go('KnifeAttack1'); knifeSound(false); sfx('RUN_1_13', 0.5, 2.2); game.hitStop = Math.max(game.hitStop, 0.04); cam.x += 0;
}
function knifeSparks(r, n) { const hx = r.x + (r.sh || 0) * view.r[0], hz = r.z + (r.sh || 0) * view.r[1]; burst(hx, r.y + 0.66, hz, { n, cols: SPARK.concat(['#ffffff', '#fff3a0', '#8fe8ff']), sp: [1.5, 6.5], up: 2.4, life: 0.5 }); }
function updateTele(dt) {
  const T = hero.tele, r = T.r; T.t += dt; hero.anim.update(dt * 1.15); hero.vx = 0; hero.noGrav = false; moveBody(hero, dt); hero.invuln = Math.max(hero.invuln, 0.3);
  if (T.t >= 0.06 && !T.s1) { T.s1 = true; if (!r.dead) knifeSparks(r, 16); }
  if (!T.second && T.t >= 0.2) { T.second = true; go('KnifeAttack2'); knifeSound(false); }
  if (!T.cut && T.t >= 0.27) { T.cut = true; if (!r.dead && robots.indexOf(r) >= 0) { knifeSparks(r, 34); zapSound(0.5, 0.3); if (!decapitate(r, hero.face)) { game.melee = 'KnifeAttack2'; damageRobot(r, CFG.hitDamage * 3); game.melee = null; } } }
  if (T.t >= 0.5) { hero.tele = null; go(hero.onGround ? 'Stay' : 'Fly'); }
}
// v243: diveTrail — перенесено в ядро, src/06b_world.js
function startDive() {
  hero.dive = { t: 0, dir: hero.face, hit: new Set() }; hero.hook = null; hero.hitWin = null; hero.jumpUp = false; go('Stomp1'); hero.anim.update(0.08); sfx('RUN_1_13', 0.5, 0.5); knifeSound(false);
}
function diveFoot() { return { x: hero.x + hero.dive.dir * 0.1 * view.r[0], y: hero.y + 0.04, z: hero.z + hero.dive.dir * 0.1 * view.r[1], t: 0 }; }
function updateDive(dt) {
  const D = hero.dive; D.t += dt; if (hero.anim.t < 0.12) hero.anim.update(dt); hero.invuln = Math.max(hero.invuln, 0.2); hero.face = D.dir;
  hero.vx = D.dir * 5.2; hero.vy = -12.5; hero.noGrav = true; hero.lean = D.dir * 0.35; moveBody(hero, dt); hero.noGrav = false; diveTrail.push(diveFoot());
  const hu = toU(hero);
  for (const r of robots) { if (r.dead || D.hit.has(r) || !reach(r) || Math.abs(toU(r) + (r.sh || 0) - hu) > 0.5 || hero.y > r.y + ROBOT_TOP + 0.1 || hero.y < r.y + 0.15) continue;
    D.hit.add(r); game.melee = 'Stomp1'; damageRobot(r, CFG.hitDamage * 3.5); game.melee = null; r.sq = -0.35; r.sqV = 0; r.stun = Math.max(r.stun || 0, 0.7); game.shake = Math.max(game.shake, 0.18); game.hitStop = Math.max(game.hitStop, 0.08); sfx('RobotHit6', 0.9, 0.8);
    burst(hero.x, hero.y, hero.z, { n: 20, cols: SPARK.concat(['#ffffff']), sp: [1.5, 5.5], up: 2, life: 0.4 }); popups.push({ x: r.x, y: r.y + 1.15, z: r.z, text: 'С неба!', t: 0 });
    hero.dive = null; hero.lean = 0; hero.vy = 6.2; hero.vx = D.dir * 1.8; hero.airJumps = 1; hero.onGround = false; go('DoubleJump'); return; }
  if (hero.onGround || D.t > 1.6 || hero.vx === 0) { const g = hero.onGround; hero.dive = null; hero.lean = 0; hero.vx = 0;
    if (g) { hero.sq = -0.25; hero.sqV = 0; game.shake = Math.max(game.shake, 0.12); sfx('RobotHit3', 0.6, 0.6); burst(hero.x, hero.y + 0.05, hero.z, { n: 16, cols: DIRT, sp: [1.2, 4.2], up: 1.3, life: 0.5 }); burst(hero.x, hero.y + 0.08, hero.z, { n: 10, cols: SMOKE, sp: [0.4, 1.6], up: 0.6, g: 0, drag: 2.5, life: 0.6, size: 2 });
      for (const r of robots) if (!r.dead && reach(r) && Math.abs(r.y - hero.y) < 0.4 && Math.abs(toU(r) + (r.sh || 0) - hu) < 1.1) { game.melee = 'Stomp1'; damageRobot(r, CFG.hitDamage * 1.5); game.melee = null; r.kv = Math.sign(toU(r) - hu) * 4; }
      go('Grounded'); } else go('Fly'); }
}
function decapitate(r, dir) {
  if (!canHead(r)) return false; plog('голова', hero.dash ? 'выпад' : hero.tele ? 'кунай и два ножа' : 'нож');
  r.headless = true; r.headJob = false; r.atk = null; r.charge = 0; r.stun = 1.5; r.aggro = 0; r.foe = null; r.sq = -0.2; r.sqV = 0; const d = toD(r), u = toU(r) + (r.sh || 0);
  const h = { x: r.x, y: r.y + 0.7, z: r.z, x0: r.x, y0: r.y + 0.7, z0: r.z, state: 'fall', t: 0, ang: 0, spin: dir * 16, src: r, vu: dir * rnd(2.4, 4.2), vy: rnd(3.2, 4.6), rx: view.r[0], rz: view.r[1], d }; setUD(h, u, d); heads.push(h);
  popups.push({ x: r.x, y: r.y + 1.15, z: r.z, text: 'Голову с плеч!', t: 0 }); game.hitStop = Math.max(game.hitStop, 0.06); game.shake = Math.max(game.shake, 0.1); sfx('RobotHit4', 0.8, 0.8); sfx('RobotDeathB', 0.4, 1.6); knifeSound(true);
  burst(r.x, r.y + 0.68, r.z, { n: 18, cols: SPARK.concat(['#2c2c30', '#55555c', '#8fe8ff']), sp: [1.2, 4.5], up: 2.2, life: 0.45 }); slashes.push({ x: r.x, y: r.y + 0.6, z: r.z, dir, t: 0 }); return true;
}
// v243: dashTrail, firstGrab — перенесено в ядро, src/06b_world.js
function startDash(dir) {
  { const w = heroWpnKey(), need = { knife: 'k1', fork: 'f1', prom: 'p1' }[w]; if (w && !talOK(need)) { hero.dashMask = { knife: hero.knife, fork: hero.fork, prom: hero.prom }; hero.knife = hero.fork = hero.prom = false; } }   /* v312: рывок с оружием — талант; без него простой рывок рукой (оружие вернётся по окончании) */
  hero.dash = { t: 0, dir, hit: new Set(), second: false }; hero.face = dir; hero.sprint = false; hero.dblT = -9; hero.dashCD = 1.3; go(hero.knife ? 'KnifeAttack1' : hero.fork ? 'ForkDash' : hero.prom ? 'RunFast' : 'HandAttack1'); hero.dash.fire = !hero.knife && !!hero.prom; if (hero.dash.fire) { sfx('RobotDeathB', 0.45, 2); sfx('RUN_1_13', 0.5, 0.6); } hero.invuln = Math.max(hero.invuln, 0.7); hero.passT = 0.8; hero.hook = null; hero.hitWin = null; knifeSound(false); showCombo(hero.knife ? 'Выпад' : 'Рывок', false);
}
function updateDash(dt) {
  const D = hero.dash; D.t += dt; hero.anim.update(dt * 1.2); hero.invuln = Math.max(hero.invuln, 0.25); hero.passT = Math.max(hero.passT || 0, 0.3);
  if (!D.fire && !hero.fork && !D.second && D.t >= 0.21) { D.second = true; go(hero.knife ? 'KnifeAttack2' : 'HandAttack2'); knifeSound(false); }
  const dur = D.fire ? 0.3 : 0.44, sp = D.fire ? 11 * (1 - 0.25 * Math.min(1, D.t / dur)) : (hero.knife ? 8.75 : hero.fork ? 9.6 : 4.4) * (1 - 0.5 * Math.min(1, D.t / 0.44)), edge = hero.onGround && !floorAhead(D.dir);
  hero.vx = edge ? 0 : D.dir * sp; if (hero.vy > 0) hero.vy = 0; hero.noGrav = !!D.air; if (D.air) hero.vy = 0; moveBody(hero, dt); hero.noGrav = false; const stuck = hero.vx === 0;
  dashTrail.push({ x: hero.x, y: hero.y, z: hero.z, t: 0, dir: D.dir, fist: !hero.knife, fire: !!hero.prom, fork: !!hero.fork });
  if (D.fire) { const u0 = toU(hero); if (D.us == null) D.us = u0; D.len = Math.abs(u0 - D.us); if (D.lu == null || Math.abs(u0 - D.lu) >= 0.38) { D.lu = u0; const d0 = toD(hero); const fy = hero.onGround ? hero.y : null; /* рывок в воздухе огня на земле не оставляет */ if (fy != null) trailFire(hero.x, fy, hero.z, D); } fireSpit({ x: hero.x, y: hero.y + 0.35, z: hero.z }, dt * 2); }
  if (Math.random() < dt * 70) parts.push({ x: hero.x - D.dir * rnd(0, 0.4) * view.r[0], y: hero.y + rnd(0.2, 0.6), z: hero.z - D.dir * rnd(0, 0.4) * view.r[1], a: hero.knife ? 1 : 0.5, vx: -D.dir * rnd(0.5, 2) * view.r[0], vz: -D.dir * rnd(0.5, 2) * view.r[1], vy: rnd(-0.2, 0.4), g: 0, drag: 4, t: 0, life: rnd(0.15, 0.3), size: 1, col: pick(D.fire ? ['#ffe08a', '#ffb430', '#ff7014'] : hero.fork ? ['#ffffff', '#ffffff', '#dfe6ea'] : ['#8fe8ff', '#dff6ff', '#ffffff', '#3fc1d6']) });
  const hu = toU(hero); for (const r of robots) { if (r.dead || D.hit.has(r) || !reach(r) || r.y - hero.y > 0.75 || hero.y - r.y > (D.air ? 1.0 : 0.75) || Math.abs(toU(r) + (r.sh || 0) - hu) > (hero.fork ? 1.1 : 0.6)) continue; D.hit.add(r); if (hero.fork) { zapBolt(beamTip(), robotPt(r), 0.14, 0.45); zapRobot(r, 3); zapSound(0.5, 0.25); r.stun = Math.max(r.stun || 0, 0.9); r.shockT = Math.max(r.shockT || 0, 0.9); }   /* рывок с вилкой сквозь робота — шок длиннее */ if (!hero.knife) { if (hero.prom) { promBurn(r); hero.fistBoost = 0.6; const bx = hero.x - D.dir * 0.3 * view.r[0], bz = hero.z - D.dir * 0.3 * view.r[1]; burst(bx, hero.y + 0.35, bz, { n: 26, cols: ['#fff4e1', '#ffce46', '#ff7014', '#e8501a'], dir: -D.dir, sp: [1.5, 6], up: 1.4, g: 1, life: 0.55, size: 2 }); game.shake = Math.max(game.shake, 0.1); } game.melee = 'HandAttack2'; damageRobot(r, CFG.hitDamage * 1.5); game.melee = null; continue; }   // без ножа рывок только бьёт и проносит мимо
    if (!D.rolled && canHead(r)) { D.rolled = true; if (comboCounter('dash', r)) return; } if (!decapitate(r, D.dir)) { game.melee = 'KnifeAttack2'; damageRobot(r, CFG.hitDamage * 2.2); game.melee = null; } }
  if (D.t >= dur || stuck) { hero.dash = null; hero.vx = stuck ? 0 : D.dir * 1.6; go(hero.onGround ? 'Stay' : 'Fly'); }
}
// v243: function drawDiveTrail — перенесено в ядро, src/13c_units.js
// v243: function drawDashTrail — перенесено в ядро, src/13c_units.js
function updateRide(dt) {
  const rd = hero.ride, r = rd.r;
  if (r.dead || robots.indexOf(r) < 0) { hero.ride = null; hero.rideCool = 0.2; go('Fly'); return; }
  placeRider();
  if (rd.mode === 'hang' && hero.fork && keys.has('dodge') && !r.taxi && !r.dead && talOK('f4')) {   // с вилкой: зажал F на спине робота — спрыгивает и втыкает вилку ему в спину (три коротких F — по-прежнему вырвать кабель)
    hero.fRideHold = (hero.fRideHold || 0) + dt;
    if (hero.fRideHold > 0.32) { hero.fRideHold = 0; hero.ripN = 0; hero.ride = null; hero.rideCool = 0.6; hero.y = r.y; hero.vy = 0; hero.onGround = true; hero.hangPop = 0; startForkPlug(r); return; } }
  else hero.fRideHold = 0;
  if (rd.mode === 'hang' && pressed.has('dodge') && !r.taxi && !talNeed('rip')) { pressed.delete('dodge'); game.dodgeBuf = 0; }   /* v312: шнур — только с талантом */
  if (rd.mode === 'hang' && pressed.has('dodge') && !r.taxi) { hero.ripN = game.time - (hero.ripT || -9) < 0.9 ? (hero.ripN || 0) + 1 : 1; hero.ripT = game.time; game.dodgeBuf = 0; pressed.delete('dodge');
    if (hero.ripN >= 3) { if (comboCounter('rip', r)) { hero.rideCool = 0.9; return; } startRip(); return; } popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, text: 'F ' + hero.ripN + '/3', t: 0.35 }); ripStage(r, hero.ripN); }
  if (hero.ripN > 0 && game.time - hero.ripT >= 0.9) { hero.ripN = 0; hero.face = 0; }   // не дожал — снова просто висит
  if (pressed.has('jump')) {            // спрыгнуть: обычный прыжок вверх, второй прыжок снова доступен
    hero.ride = null; hero.rideCool = 0.45; hero.airJumps = 1; hero.vy = 3.4; hero.jumpUp = true; hero.jumpStart = game.time; go('JumpInRun');
  } else if (rd.mode === 'hang' && pressed.has('sit')) { hero.ride = null; hero.rideCool = 0.45; go('Fly'); }
  hero.anim.update(dt);
}
function updateHang(dt, ax) {
  const hg = hero.hang;
  if (pressed.has('jump') || (!hg.pipe && !hg.hook && pressed.has('up'))) {   /* v309 (Алексей: «прыгал сверху — перс завис»): с края подтягивается и по «вверх», не только прыжком */            // подтянуться: прыжок вверх и шаг на платформу
    hero.hang = null; hero.airJumps = 1; hero.vy = hg.pipe ? 4.6 : 3.4; hero.jumpUp = true; hero.jumpStart = game.time; hero.boostT = hg.pipe ? 0 : 0.6; if (hg.pipe) hero.vx = 0; hero.boostDir = hg.dir; hero.boostY = hg.T; hero.hangCool = 0.5; go('JumpInRun');
  } else if (pressed.has('sit') || (ax === -hg.dir && !hg.pipe) || (hg.hook && !keys.has('hook'))) { hero.hang = null; hero.hangCool = 0.45; go('Fly'); }   // вис на крюке держится, пока зажата H
  else if (hg.pipe) { const P = hg.pipe;   // на трубе — кадры лазания, как на лестнице: перебирает руками вдоль трубы, замер — висит на двух руках
    if (ax) { const nu = Math.max(P.lo, Math.min(P.hi, toU(hero) + ax * 1.6 * dt)); if (!overlapsDepth(nu, hero.y, hero.hw, hero.h, P.d)) setUD(hero, nu, P.d); hg.dir = ax; hg.mt = (hg.mt || 0) + dt; hg.idle = 0; }
    else hg.idle = (hg.idle || 0) + dt;
    hero.face = 1; hero.hangPop *= 0.8;
    if (hg.idle > 0.3 && CL.HeroClimbIdle) { hero.anim.play('HeroClimbIdle', { loop: true }); hero.anim.update(dt); }
    else if (CL.HeroClimb) { hero.anim.play('HeroClimb', { loop: true }); const ln = CL.HeroClimb.len; hero.anim.t = (((hg.mt || 0) * 1.25) % ln + ln) % ln; }
    return; }
  hero.anim.update(dt);
}

// v279 (Алексей 20.10: «когда падаешь с робота — попадаешь в темноту»): верхом на роботе у героя глубина робота — робот бывает за кубами
// (обходит ногу, на дальней стороне). Слез, сбросило, робот погиб — 1.5 с герой держится перед кубами, которые его закрывают.
function heroToFront() { if (!heroHiddenAt(toU(hero), hero.y, toD(hero))) return; const u = toU(hero); let md = -1e9;
  for (let U = Math.round(u - hero.hw) - 1; U <= Math.round(u + hero.hw) + 1; U++) for (let Y = Math.floor(hero.y) - 2; Y <= Math.floor(hero.y + hero.h) + 1; Y++) { const a = cellAt(U, Y); if (a && a.length && a[0].dep > md) md = a[0].dep; }
  if (md > -1e8) setUD(hero, u, md + 1); }
function updateHero(dt) {
  if (hero.dashMask && !hero.dash) { Object.assign(hero, hero.dashMask); hero.dashMask = null; }
  if (hero.frontT > 0) { hero.frontT -= dt; if (!hero.ride && !hero.ladder && hero.state !== 'dead' && heroHiddenAt(toU(hero), hero.y, toD(hero))) { hero.hang = null; heroToFront(); } }
  if (hero.ride) hero.wasRide = true; else if (hero.wasRide) { hero.wasRide = false; hero.frontT = 1.5; }   /* любой конец езды на роботе */
  // пружина сжатия-растяжения и наклон корпуса: спрайт тянется на толчке, приседает на приземлении, клонится в сторону бега
  hero.sqV += (-hero.sq * 260 - hero.sqV * 17) * dt; hero.sq += hero.sqV * dt;
  { const run = hero.onGround ? (Math.abs(hero.vx) > 3 ? 0.07 : 0) : 0.022 * Math.min(4.5, Math.abs(hero.vx)), tgt = hero.ride || hero.hang ? 0 : Math.sign(hero.vx) * run;
    hero.lean += (tgt - hero.lean) * Math.min(1, dt * 10); hero.hangPop *= Math.exp(-dt * 16); }
  if (hero.passT > 0) hero.passT -= dt; if (hero.sneakT > 0) hero.sneakT -= dt;
  if (hero.dropT > 0) { hero.dropT -= dt; if (hero.dropRow > -90 ? hero.y + hero.h < hero.dropRow : hero.dropT < 0.4) hero.dropT = 0; }
  hero.invuln = Math.max(0, hero.invuln - dt); hero.hangCool = Math.max(0, hero.hangCool - dt); hero.ladderCool = Math.max(0, (hero.ladderCool || 0) - dt);
  if (hero.burstT > 0 && hero.state !== 'dead') {   // раздулся от воды и лопается: кадры автора, потом лужица
    const t0 = hero.burstT; hero.burstT += dt; hero.vx = 0; hero.noGrav = false; moveBody(hero, dt); hero.anim.update(dt);
    hero.sq = 0.035 * Math.sin(hero.burstT * (9 + hero.burstT * 14)) * Math.min(1, hero.burstT / 0.5) * (hero.burstT < 1.5 ? 1 : 0); hero.sqV = 0; hero.lean = 0;   // раздуваясь, дрожит всё чаще
    if (Math.random() < dt * (6 + hero.burstT * 22)) parts.push({ x: hero.x + rnd(-0.25, 0.25) * view.r[0], y: hero.y + rnd(0.1, 0.7), z: hero.z + rnd(-0.25, 0.25) * view.r[1], vx: rnd(-1, 1) * view.r[0], vz: rnd(-1, 1) * view.r[1], vy: rnd(0.3, 1.8), g: 7, drag: 0, t: 0, life: rnd(0.25, 0.5), size: 1, col: pick(['#bfeaf2', '#5fc3dc', '#eefcff']) });
    if (t0 < 1.5 && hero.burstT >= 1.5) { popSound(1); sfx('RUN_1_13', 0.5, 0.5); game.shake = Math.max(game.shake, 0.12);
      burst(hero.x, hero.y + 0.4, hero.z, { n: 40, cols: ['#bfeaf2', '#5fc3dc', '#eefcff', '#3f8fd0'], sp: [1.5, 5.5], g: 8, life: 0.8, size: 2 }); burst(hero.x, hero.y + 0.4, hero.z, { n: 10, cols: ['#e0702e', '#b5522a'], sp: [1.5, 4], life: 0.7 }); }
    if (hero.burstT >= 1.64) { booms.push({ x: hero.x, y: hero.y + 0.35, z: hero.z, t: 0 }); killHero(); hero.deadT = 1; }   // вместо лужицы — взрыв, без огня
    return;
  }
  if (hero.state === 'dead') { hero.deadT += dt; hero.vx = 0; hero.noGrav = false; moveBody(hero, dt); hero.anim.update(dt); return; }
  if (hero.crashT > 0) hero.crashT -= dt;
  const ax = hero.crashT > 0 ? 0 : (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);   /* после аварии миг лежит оглушённый */
  // двойное нажатие в сторону — сразу бег, пока держишь; долгий шаг по-прежнему тоже переходит в бег
  for (const dn of ['left', 'right']) if (pressed.has(dn)) { const sd = dn === 'right' ? 1 : -1; hero.sprint = hero.tapDir === sd && game.time - hero.tapT < 0.3; if (hero.sprint) hero.dblT = game.time; hero.tapDir = sd; hero.tapT = game.time; }
  if (ax === 0 || ax !== hero.tapDir) hero.sprint = false;
  hero.rideCool = Math.max(0, hero.rideCool - dt);
  if (hero.rip) { updateRip(dt); return; }
  if (hero.rotSafe > 0 && !view.rotating) hero.rotSafe -= dt; if (hero.dashCD > 0) hero.dashCD -= dt; if (hero.promOrb > 0) hero.promOrb -= dt; if (hero.rocketT > 0) { hero.rocketT -= dt; const hy2 = hero.y + hero.hangPop - (hero.dip || 0), nn = Math.floor(dt * 90 + Math.random()); for (const q of heroHands()) for (let i = 0; i < nn; i++) parts.push({ x: hero.x + (q[0] + rnd(-0.04, 0.04)) * view.r[0], y: hy2 + q[1] - rnd(0.05, 0.3), z: hero.z + (q[0] + rnd(-0.04, 0.04)) * view.r[1], vx: rnd(-0.5, 0.5) * view.r[0], vz: rnd(-0.5, 0.5) * view.r[1], vy: -rnd(3, 6.5), g: -2, drag: 3, t: 0, life: rnd(0.25, 0.5), size: Math.random() < 0.5 ? 3 : 2, col: pick(['#fff4e1', '#ffce46', '#ffce46', '#ff7014', '#e8501a', '#3a2f36']) }); } if (hero.fistBoost > 0) hero.fistBoost -= dt;
  if (hero.counter) { const C = hero.counter; C.t -= dt; if (C.t <= 0 || C.r.dead || robots.indexOf(C.r) < 0 || hero.state === 'dead') hero.counter = null; else if (pressed.has('kunai') && hero.kunai > 0) { pressed.delete('kunai'); delete hero.trig.kunai; hero.counter = null; counterKunai(C.r); } }
  if (hero.dash) { updateDash(dt); return; }
  if (hero.grab) { updateGrab(dt); return; }
  if (hero.tele) { updateTele(dt); return; }
  if (hero.dive) { updateDive(dt); return; }
  if (hero.kride) { updateKride(dt); return; }
  if (hero.forkP) { updateForkPlug(dt); return; }
  if (hero.beam) { updateForkBeam(dt); return; }
  hero.armHeld = hero.fork && keys.has('arm') && hero.beamKey !== keyT.arm ? (performance.now() - (keyT.arm || 0)) / 1000 : 0;   /* вилка: держишь J (одно нажатие, без перерыва) — поток тока */
  if (hero.armHeld > 0.34 && talOK('f3') && (hero.fCharge || 0) > 0.02 && !hero.ride && !hero.hang && !hero.ladder && !hero.hideN && !hero.dash && !hero.kride && hero.st !== 'Kulbit') { hero.beam = { t: 0, snd: 0, dmgT: 0 }; hero.armHeld = 0; hero.beamKey = keyT.arm; go('ForkBeam'); inputQ = []; hero.trig = {}; showCombo('Поток тока', false); return; }
  if (hero.ride) { updateRide(dt); return; }
  if (hero.hang && !hero.hang.pipe && !hero.hang.finger) { for (const k of ['arm', 'leg', 'kunai']) if (pressed.has(k)) { pressed.delete(k); hangAttack(k); } hangAtkTick(dt); }   /* в висе можно бить */
  if (hero.hang) { if (hero.hang.finger) updateFingerHang(dt, ax); else if (hero.hang.gear) updateGearHang(dt, ax); else updateHang(dt, ax); return; }
  if (tryFingerGrab() || tryGearGrab()) return;
  if (hero.ladder) { updateLadder(dt, ax); return; }
  if (hero.hideN) {                     // в выемке: его не видят; выйти — снова W + прыжок
    hero.vx = 0; hero.vy = 0; hero.lean = 0; const J = hero.hideJ;
    if (!J && pressed.has('dodge')) { pressed.delete('dodge'); game.dodgeBuf = 0; const hu0 = toU(hero); let tg = null, bd = 0.95;
      for (const o of robots) { if (o.dead || o.taxi || o.lift || o.onCloud || o.away || toD(o) < toD(hero) + 0.3 || toD(o) > toD(hero) + 2.4 || Math.abs(o.y - hero.y) > 0.6) continue; const d0 = Math.abs(toU(o) + (o.sh || 0) - hu0); if (d0 < bd) { bd = d0; tg = o; } }
      if (tg && !talNeed('rip')) tg = null;   /* v312 */
      if (tg) { hero.ripN = game.time - (hero.ripT || -9) < 0.9 ? (hero.ripN || 0) + 1 : 1; hero.ripT = game.time; popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, text: 'F ' + hero.ripN + '/3', t: 0.35 }); sfx('RUN_1_13', 0.25, 1.6 + hero.ripN * 0.3); fSparks(tg, 3 + hero.ripN); zapSound(0.2 + hero.ripN * 0.08, 0.16);
        if (hero.ripN >= 3) { hero.hideN = false; hero.hideJ = null; hero.passT = 0; hero.ride = { r: tg, mode: 'hang' }; hero.rideU = null; hero.hangPop = 0; hero.face = tg.dir; tg.stun = Math.max(tg.stun || 0, 0.6); placeRider(); hero.rideU = toU(hero) - toU(tg); startRip(); showCombo('Из тени', false); return; } } }
    if (J) { J.t += dt; const p = Math.min(1, J.t / J.dur), e2 = p * p * (3 - 2 * p), uu = J.u0 + (J.u1 - J.u0) * e2, dd = J.d0 + (J.d1 - J.d0) * e2; setUD(hero, uu, dd); hero.y = J.y0 + (J.y1 - J.y0) * p + 4 * J.h * p * (1 - p); hero.anim.update(dt);   // впрыгивает дугой
      if (p >= 1) { hero.hideJ = null; hero.sq = -0.14; go('Stay'); for (const r of robots) if (!r.hunter && !(r.rage > 0)) r.aggro = 0; showCombo('Спрятался', true); } return; }
    { const Y = Math.round(hero.y), u = toU(hero), NK = hero.nK || 7; let nu = u;                 // по нише можно ходить — до её стенок
      if (ax) { hero.face = ax; nu = u + ax * 1.7 * dt; const eU = Math.round(nu + ax * hero.hw); if (!carvedAt(eU, Y, NK) || carvedAt(eU, Y - 1, NK)) nu = u; }
      setUD(hero, nu, NK); hero.y = Y; const want = ax && nu !== u ? 'RunSlow' : 'Stay'; if (hero.st !== want) go(want); hero.anim.update(dt);
      if (pressed.has('jump') && !overlapsDepth(nu, Y, hero.hw, hero.h, NK + 1)) { const dn = keys.has('sit'); hero.hideN = false; hero.passT = 3; hero.sneakT = 3; showCombo('Из тени: три секунды вас не видят — зайдите за спину и F', true); setUD(hero, nu, NK + 1); hero.onGround = false; hero.standOn = null; hero.sq = -0.12; sfx('RUN_1_13', 0.3, 1.4);
        if (dn) { hero.vy = -1.5; hero.dropT = 0.25; hero.dropRow = -99; go('Fly'); }                                   // S + прыжок — выпрыгнуть вниз
        else { hero.vy = CFG.jumpImpulse; hero.jumpUp = true; hero.jumpStart = game.time; hero.airJumps = 1; go('JumpInRun'); } }   // прыжок (и с W) — выпрыгнуть вверх: на площадку или трубу над нишей
      /* держать S (без прыжка) — тихо шагнуть из ниши вперёд, на дорожку: роботы проходят сквозь, можно зайти им за спину */
      hero.nOutT = keys.has('sit') && !keys.has('jump') && !pressed.has('jump') ? (hero.nOutT || 0) + dt : 0;
      if (hero.hideN && hero.nOutT > 0.18 && !overlapsDepth(nu, Y, hero.hw, hero.h, NK + 1) && floorCube(Math.round(nu), Y - 1, NK + 1, 'same')) { hero.nOutT = 0; hero.hideN = false; hero.passT = 3; hero.sneakT = 3; setUD(hero, nu, NK + 1); hero.y = Y; hero.vy = 0; hero.onGround = true; hero.standOn = null; hero.sq = -0.1; go('Stay'); sfx('RUN_1_13', 0.25, 1.5); showCombo('Тихо вышел: три секунды вас не видят — за спину и F', true); }
      pressed.delete('jump'); pressed.delete('up'); } return; }
  if (keys.has('up') && pressed.has('jump') && !ST[hero.st].lock) { const nc = findNiche(); if (nc) { hero.hideN = true; hero.nK = nc.k; hero.hook = null; hero.vx = 0; hero.onGround = false; hero.standOn = null; hero.face = Math.sign(nc.U - toU(hero)) || hero.face;
      hero.hideJ = { t: 0, dur: 0.24 + 0.09 * (nc.Y - hero.y), u0: toU(hero), u1: nc.U, d0: toD(hero), d1: nc.k, y0: hero.y, y1: nc.Y, h: 0.35 + 0.12 * (nc.Y - hero.y) }; go('JumpInRun'); sfx('RUN_1_13', 0.3, 0.6); pressed.delete('jump'); pressed.delete('up'); return; } }
  // комбо «прыжок из приседа»: присел, подержал полсекунды (пятки греются) — прыжок выше и дальше, как с места в жизни
  if (keys.has('sit') && hero.onGround && hero.st === 'Sit') { hero.sitT = (hero.sitT || 0) + dt; if (hero.sitT > 0.35 && Math.random() < dt * 22) parts.push({ x: hero.x + rnd(-0.25, 0.25) * view.r[0], y: hero.y + 0.04, z: hero.z + rnd(-0.25, 0.25) * view.r[1], vx: 0, vz: 0, vy: rnd(0.3, 0.9), g: -1, drag: 2, t: 0, life: rnd(0.2, 0.4), size: 1, col: pick(['#fff4e1', '#ffce46', '#c9b79c']) }); } else if (!keys.has('sit')) { if ((hero.sitT || 0) > 0.35 && hero.onGround) hero.sjWin = 0.22; hero.sitT = 0; }   /* отпустил присед — ещё миг можно прыгнуть с силой */
  if (hero.sjWin > 0) hero.sjWin -= dt;
  if (pressed.has('jump') && hero.onGround && ((keys.has('sit') && (hero.sitT || 0) > 0.35) || hero.sjWin > 0)) { hero.sjWin = 0; const dir = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    hero.vy = CFG.jumpImpulse * 1.25; hero.onGround = false; hero.coyote = 0; hero.jumpUp = true; hero.jumpStart = game.time; hero.jumpBuf = 0; hero.sitT = 0; pressed.delete('jump');
    hero.superJ = dir ? 0.75 : 0; hero.superDir = dir || hero.face; if (dir) hero.face = dir; go('JumpInRun'); hero.sq = 0.2; hero.sqV = 5;
    spawnFx('FxPuff', hero.x, hero.y, hero.z, { flip: hero.face > 0, scale: 1.4 }); burst(hero.x, hero.y + 0.05, hero.z, { n: 14, cols: DIRT, sp: [1, 3.5], up: 0.8, life: 0.45, size: 2 }); sfx('Jump_4_landfall', 0.35, 1.4);
    showCombo('Прыжок из приседа', false); return; }
  if (keys.has('sit') && pressed.has('jump') && (!ST[hero.st].lock || hero.st === 'Sit')) { const nc = findNiche(true); if (nc) { hero.hideN = true; hero.nK = nc.k; hero.hook = null; hero.vx = 0; hero.onGround = false; hero.standOn = null; hero.face = Math.sign(nc.U - toU(hero)) || hero.face;
      hero.hideJ = { t: 0, dur: 0.3 + 0.06 * (hero.y - nc.Y), u0: toU(hero), u1: nc.U, d0: toD(hero), d1: nc.k, y0: hero.y, y1: nc.Y, h: 0.3 }; go('Fly'); sfx('RUN_1_13', 0.3, 0.6); pressed.delete('jump'); return; } }
  if (keys.has('sit') && pressed.has('jump') && hero.onGround && dropThrough()) { pressed.delete('jump'); hero.jumpBuf = 0; go('Fly'); return; }
  if (hero.fork && talOK('f4') && pressed.has('dodge') && !game.dodge && !hero.ride && hero.onGround && !ST[hero.st].lock) { const tg = forkPlugTarget(); if (tg) { pressed.delete('dodge'); game.dodgeBuf = 0; startForkPlug(tg); return; } }   /* с вилкой: нажал F за спиной робота — воткнул */
  if (pressed.has('dodge') && hero.onGround && !game.dodge && !hero.ride && !ST[hero.st].lock && !(hero.rideCool > 0)) { const hu0 = toU(hero); let tg = null, bd = 0.85;
    for (const o of robots) { if (o.dead || o.taxi || o.lift || o.onCloud || !reach(o) || robotHidden(o) || Math.abs(o.y - hero.y) > 0.3 || o.atk) continue; const dd = hu0 - toU(o) - (o.sh || 0); if (Math.sign(dd) !== -o.dir || Math.abs(dd) > bd) continue; bd = Math.abs(dd); tg = o; }   // только со спины
    if (tg) { pressed.delete('dodge'); game.dodgeBuf = 0; hero.ride = { r: tg, mode: 'hang' }; hero.rideU = null; go('Take'); hero.hangPop = hero.y - (tg.y + ROBOT_SHOULDER - HANG_Y); hero.hook = null; hero.vx = hero.vy = 0; hero.onGround = false; hero.ripN = 0; placeRider(); sfx('RUN_1_13', 0.3, 0.7); fSparks(tg, 3); return; } }
  if (pressed.has('leg') && !hero.ride && !hero.hideN && !hero.hang && !hero.ladder && hero.st !== 'Kulbit') { let nm = null;   // направление + нога: то же, что длинные комбо, но одной связкой
    if (!hero.onGround && keys.has('sit') && !ST[hero.st].lock) { startDive(); nm = 'Удар с неба'; }
    else if (hero.onGround && keys.has('up') && !ST[hero.st].lock && !onBot()) { go('LegsAttackUp'); nm = 'Ногами вверх'; }
    else if (!hero.onGround && keys.has('up') && !ST[hero.st].lock) { go('JumpLegsAttack'); nm = 'Ногами в прыжке'; }
    else if (hero.onGround && hero.st === 'Sit' && !onBot()) { go('LegsAttackKunai'); nm = 'Подсечка с кунаем'; }
    if (nm) { pressed.delete('leg'); delete hero.trig.leg; inputQ = []; showCombo(nm); } }
  if (pressed.has('arm') && !hero.knife && !hero.kride && inputQ[inputQ.length - 1] === 'kunai' && !hero.ride && !hero.hang && !hero.ladder && !hero.hideN && hero.st !== 'Kulbit') {   /* кунай, рука — схватиться за летящий кунай */
    const k = kunais[kunais.length - 1]; if (k && k.state === 'fly' && !k.drop && k.t < 0.45) { pressed.delete('arm'); inputQ.push('arm'); startKride(k); return; }
    if (hero.st === 'KunaiThrow' && !hero.anim.done) { pressed.delete('arm'); inputQ.push('arm'); hero.kridePend = game.time; } }   /* кунай ещё в руке — схватится, как только бросит */
  for (const kname of QUEUE_KEYS) if (pressed.has(kname)) {
    inputQ.push(kname); if (inputQ.length > 4) inputQ.shift();
    let found = null, needT = null;
    for (const cb of COMBOS) { const L = cb.seq.length; if (inputQ.length >= L && (!cb.knife || hero.knife) && (!cb.dive || (!hero.onGround && !hero.ride && !hero.hang && !hero.ladder && !hero.hideN)) && cb.seq.every((s, i) => inputQ[inputQ.length - L + i] === s)) { if (cb.tal && !talOK(cb.tal)) needT = cb.tal; else found = cb; } }
    if (!found && needT) talNeed(needT);   /* v312: приём оружия — талант */
    if (found && found.tele) { const tg = hero.st !== 'Kulbit' && !onBot() ? teleTarget() : null; if (tg) { startTele(tg); inputQ = []; hero.trig = {}; pressed.delete('arm'); showCombo(found.name); } }
    else if (found && found.dive) { if (hero.st !== 'Kulbit') { startDive(); inputQ = []; hero.trig = {}; pressed.delete('leg'); showCombo(found.name); } }
    else if (found && found.knife && hero.st !== 'Kulbit' && !onBot()) { hero.pend = { cb: found, t: game.time }; inputQ = []; pressed.delete('leg'); delete hero.trig.leg; if (hero.st === 'KnifeAttack1' || hero.st === 'JumpKnife1') setTrig('arm'); }
    else if (found && hero.st !== 'Kulbit' && !onBot()) { go(found.st); hero.headNext = found.head ? game.time : -9; inputQ = []; hero.trig = {}; pressed.delete('arm'); pressed.delete('leg'); pressed.delete('kunai'); showCombo(found.name); }
  }
  if (hero.pend) { const P = hero.pend, k2 = (hero.st === 'KnifeAttack2' || hero.st === 'JumpKnife2') && (hero.anim.done || hero.anim.t >= 0.17), free = ['Stay', 'RunSlow', 'RunFast', 'Grounded', 'Fly', 'JumpInRun', 'DoubleJump'].indexOf(hero.st) >= 0;
    if (game.time - P.t > 1.3 || hero.ride || hero.hang || hero.ladder) hero.pend = null;
    else if (k2 || free) { hero.pend = null; hero.trig = {}; pressed.delete('arm'); pressed.delete('leg'); showCombo(P.cb.name);
      // робот перед героем: первая нога сразу сшибает голову, вторая футболит её в другого робота или в сторону — без повторного замаха
      let tg = null, bd = 0.8; const hu = toU(hero); if (P.cb.head && !hero.headJob) for (const o of robots) { if (o.dead || o.headless || o.headJob || o.hunter || o.lift || o.onCloud || o.taxi || o.rage > 0 || shieldFront(o) || !reach(o) || o.y - hero.y > 0.6 || hero.y - o.y > (hero.onGround ? 0.6 : 1.1)) continue; const du = (toU(o) + (o.sh || 0) - hu) * hero.face; if (du > -0.25 && du < bd) { bd = du; tg = o; } }
      if (tg && comboCounter('jjk', tg)) { /* перехватил */ }
      else if (tg) { const st2 = hero.onGround ? 'LegsAttackUp' : 'JumpLegsAttack2'; startHeadRip(tg); hero.headJob.pending = false; hero.headJob.st = st2; go(st2); }
      else { go(hero.onGround ? P.cb.st : 'JumpLegsAttack2'); hero.headNext = P.cb.head ? game.time : -9; } } }
  if (pressed.has('arm')) setTrig('arm');
  if (pressed.has('leg')) setTrig('leg');
  if (pressed.has('kunai') && hero.kunai <= 0 && !hero.counter && recallKunais()) pressed.delete('kunai');   // v297: пусто — позвать кунаи обратно
  if (pressed.has('kunai')) setTrig('kunai');
  hero.hookCool = Math.max(0, hero.hookCool - dt * (dcHas('hook') ? 0.35 : 1));
  if (pressed.has('up') && !pinLadderNear() && useDoor()) { pressed.delete('up'); return; }   /* v258: лестница «руками» под рукой — главнее двери рядом */
  if (keys.has('up') && grabLadder()) return;
  if (pressed.has('sit') && hero.onGround && grabLadder(true)) return;
  if (pressed.has('hook')) { if (hero.st === 'HookThrow' || (hero.hook && (hero.hook.state === 'fly' || hero.hook.state === 'latch'))) hero.hookDbl = true; else { fireHook(); if (hero.st !== 'HookThrow' && !hero.hook) hero.hookBuf = 0.3; } }
  else if (hero.hookBuf > 0) { hero.hookBuf -= dt; if (!hero.hook && !(hero.hookCool > 0) && hero.st !== 'HookThrow') { hero.hookBuf = 0; fireHook(); } }   // v295: нажал крюк чуть раньше, чем можно (крюк ещё возвращается) — бросок не теряется   // второе быстрое H — «лечу к роботу сам»
  if (hero.hook) updateHook(dt);
  const pulled = !!(hero.hook && (hero.hook.state === 'pullHero' || hero.hook.state === 'toRobot'));
  const freshJump = pressed.has('jump');
  if (freshJump) hero.jumpBuf = CFG.jumpBuffer;
  const def = ST[hero.st], sitHeld = keys.has('sit') && hero.onGround;
  if (hero.st === 'ForkAir') { hero.lean = hero.face * 0.45; hero.forkLean = true; } else if (hero.forkLean) { hero.forkLean = false; hero.lean = 0; }   /* удар вилкой в прыжке: наклонён к земле */
  if (hero.onGround) { hero.gU = Math.round(toU(hero)); hero.gY = hero.y; hero.gD = toD(hero); hero.hookAir = false; hero.ropeJ = false; hero.coyote = CFG.coyote; hero.airJumps = 1; hero.airT = 0; } else { hero.coyote = Math.max(0, hero.coyote - dt); hero.airT += dt; }
  hero.pushV *= Math.exp(-dt * 8); if (Math.abs(hero.pushV) < 0.05) hero.pushV = 0;

  // движение
  if (hero.st === 'Kulbit' || pulled) { /* летим по инерции или за крюком */ }
  else if (hero.st === 'HookThrow' && hero.onGround) { hero.vx = 0; hero.timeWithInput = 0; }   // бросает крюк стоя на месте
  else if (def.lock) {
    hero.timeWithInput = 0;
    if (hero.onGround || def.levitate) hero.vx = hero.pushV && (!hero.onGround || floorAhead(hero.pushV)) ? hero.pushV : 0;   // выпад вперёд на ударе
    else hero.vx = Math.abs(hero.pushV) > Math.abs(hero.vx) ? hero.pushV : hero.vx * (1 - Math.min(1, dt * 1.2));               // в воздухе удар не останавливает полёт
  } else {
    if (ax !== 0) { hero.timeWithInput += dt; if (hero.sprint) hero.timeWithInput = Math.max(hero.timeWithInput, CFG.fastDelay + CFG.accelTime * 0.7); if (def.loco) hero.face = ax; } else hero.timeWithInput = 0;
    /* разгон: добежал до полной скорости и бежит дальше в ту же сторону — скорость растёт ещё (до +75% за 2.5 с); остановился или развернулся — сброс */
    const full = hero.timeWithInput >= CFG.fastDelay + CFG.accelTime;
    if (ax === 0 || ax !== hero.momDir) { hero.mom = hero.onGround || ax !== 0 ? 0 : hero.mom || 0; hero.momDir = ax; }
    else if (full && hero.onGround && hero.dip <= 0.15 && !hero.wallHit) hero.mom = Math.min(1, (hero.mom || 0) + dt / 2.2);
    if (hero.onGround && (hero.mom || 0) > 0.2 && Math.random() < dt * 40 * hero.mom) parts.push({ x: hero.x - ax * 0.15 * view.r[0], y: hero.y + 0.03, z: hero.z - ax * 0.15 * view.r[1], vx: -ax * rnd(0.5, 2.5) * view.r[0], vz: -ax * rnd(0.5, 2.5) * view.r[1], vy: rnd(0.3, 1.4), g: -2, drag: 2, t: 0, life: rnd(0.2, 0.45), size: hero.mom > 0.8 ? 2 : 1, col: hero.mom > 0.85 && Math.random() < 0.3 ? pick(['#ffd052', '#fff4e1']) : pick(['#9c8a78', '#6f5f56', '#c9b79c']) });   // пыль из-под ног; на пределе — искры
    if ((hero.mom || 0) > 0.85 && !hero.momSaid) { hero.momSaid = true; popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, text: 'Разгон!', t: 0 }); } if ((hero.mom || 0) < 0.3) hero.momSaid = false;
    hero.vx = ax * (hero.dip > 0.15 && hero.onGround ? 0.55 : 1) * (CFG.moveSlow + (CFG.moveFast - CFG.moveSlow) * Math.max(0, Math.min(1, (hero.timeWithInput - CFG.fastDelay) / CFG.accelTime))) * (1 + 0.75 * (hero.mom || 0)) * (dcHas('fasthero') ? 1.45 : 1);
    if (hero.wallKick > 0) { hero.wallKick -= dt; hero.vx = hero.face * 3.6; }   /* только что оттолкнулся от стены — летит от неё, кнопки не мешают */
    else if (!hero.onGround && hero.items && hero.items.spider && ax !== 0 && hero.vy < -2.2 && wallSide() === ax) hero.vy = -2.2;   /* прижался к стене — скользит медленно */
  }
  if (hero.boostT > 0) {                // после подтягивания сам шагает на платформу
    hero.boostT -= dt;
    if (ax === -hero.boostDir || hero.onGround) hero.boostT = 0;
    else if (hero.y > hero.boostY - 0.06 && ax === 0) hero.vx = hero.boostDir * 1.6;
  }
  // прыжок и второй прыжок в воздухе
  if (hero.jumpBuf > 0 && !def.noJump && !dcHas('nojump') && (hero.st !== 'Kulbit' || game.time - (hero.wallKickAt || -9) > 0.3) && !pulled) {
    if ((hero.onGround || hero.coyote > 0) && hero.vy <= 0.01) {
      hero.vy = CFG.jumpImpulseG; hero.jumpG = true; hero.onGround = false; hero.coyote = 0; hero.jumpUp = true; hero.jumpStart = game.time; hero.jumpBuf = 0;   // v299: прыжок с земли — резкий и низкий
      spawnFx('FxPuff', hero.x, hero.y, hero.z, { flip: hero.face > 0, scale: 1.1 }); hero.sqV = 3.2;
    } else if (freshJump && !hero.onGround && hero.items && hero.items.spider && wallSide() && ax === wallSide() && hero.airT > 0.18 && game.time - (hero.wallKickAt || -9) > 0.45) {   /* сапоги паука: толчок — только прижавшись к стене (держишь к ней) и не чаще раза в полсекунды */
      const s = wallSide(); hero.jumpG = false; hero.vy = CFG.jumpImpulse * 0.95; hero.vx = -s * 3.6; hero.face = -s; hero.wallKick = 0.22; hero.jumpUp = true; hero.jumpStart = game.time; hero.jumpBuf = 0; hero.airJumps = Math.max(hero.airJumps, hero.items.hermes ? 1 : 0);
      hero.wallKickAt = game.time; go('Kulbit'); spawnFx('FxPuff', hero.x + s * 0.25 * view.r[0], hero.y + 0.4, hero.z + s * 0.25 * view.r[1], { flip: s < 0, scale: 0.9 }); sfx('RUN_1_13', 0.35, 1.5);
    } else if (freshJump && !hero.onGround && hero.airJumps > 0 && hero.items && hero.items.hermes) {
      hero.airJumps--; hero.jumpG = false; hero.hookAir = false; /* v295 (Алексей: «после второго прыжка можно второй хук») */ const pj = hero.prom && talOK('p3'); hero.vy = CFG.doubleJump * (pj ? 1.38 : 1); hero.rocketT = pj ? 0.38 : 0;   /* v312: «Реактивный прыжок» */ hero.jumpUp = true; hero.jumpStart = game.time; hero.jumpBuf = 0; hero.boostT = 0;
      if (ax !== 0) hero.face = ax;
      go('DoubleJump'); sfx('RUN_1_13', 0.25, 1.6); hero.sq = -0.12; hero.sqV = 4.5; if (hero.prom && talOK('p3')) { sfx('RobotDeathB', 0.35, 2.4); sfx('RUN_1_13', 0.5, 0.7); game.shake = Math.max(game.shake, 0.05); }
      spawnFx('FxRing', hero.x, hero.y - 0.16, hero.z, { scale: 0.75, speed: 1.3 }); burst(hero.x, hero.y, hero.z, { n: 6, cols: SMOKE, sp: [0.4, 1.2], up: -0.8, g: 0, drag: 4, life: 0.35 });
    }
  }
  if (hero.superJ > 0) { hero.superJ -= dt; if (hero.onGround && hero.vy <= 0) hero.superJ = 0; else hero.vx = hero.superDir * Math.max(hero.vx * hero.superDir, 7.4); }   /* прыжок из приседа летит далеко */
  hero.jumpBuf = Math.max(0, hero.jumpBuf - dt);
  if (hero.jumpUp && (!keys.has('jump') || game.time - hero.jumpStart > (hero.jumpG ? CFG.jumpHoldTimeG + (talHas('m4') ? 0.07 : 0) : CFG.jumpHoldTime))) hero.jumpUp = false;
  if (hero.jumpUp) hero.vy += (hero.jumpG ? CFG.jumpHoldAccelG : CFG.jumpHoldAccel) * dt;
  // зависание в воздушном комбо: гравитация выключена до 85% клипа
  hero.noGrav = pulled || (!!ST[hero.st].levitate && hero.anim.t < 0.85 * hero.anim.clip.len);
  if (hero.noGrav && !pulled) hero.vy = 0;
  if (pulled) hero.jumpUp = false;

  const airBefore = hero.airT, vyBefore = hero.vy;
  hero.wallHit = 0; const uMom = toU(hero), vMom = hero.vx; moveBody(hero, dt);
  if (hero.wallHit && (hero.mom || 0) > 0.55 && hero.onGround && !def.lock && hero.st !== 'Kulbit' && !pulled) {   /* врезался в стену на разгоне: кульбит назад, а на предельной скорости — разбился */
    const dir = hero.wallHit, m = hero.mom; hero.mom = 0; hero.timeWithInput = 0; hero.onGround = false; hero.face = dir; go('Kulbit');
    burst(hero.x + dir * 0.25 * view.r[0], hero.y + 0.4, hero.z + dir * 0.25 * view.r[1], { n: 10 + Math.round(20 * m), cols: DIRT, sp: [1, 3 + 3 * m], life: 0.5, dir: -dir });
    if (m > 0.97) { hero.vx = -dir * 4.5; hero.vy = 5.5; hero.crashT = 1.1; game.shake = Math.max(game.shake, 0.22); sfx('RobotHit5', 0.8, 0.6); sfx(pick(['RobotHit2', 'RobotHit3']), 0.7, 0.9);
      burst(hero.x, hero.y + 0.4, hero.z, { n: 30, cols: ['#e0702e', '#fff4e1', '#c0392b', '#ffb326', '#3a2f36'], sp: [1.5, 6], up: 2, life: 0.8, dir: -dir });
      if (!(hero.invuln > 0)) { PLOG.why = 'разбился о стену'; loseHP(); hero.hurtAt = game.time; hero.invuln = 1.2; updateHUD(); if (hero.hp <= 0) killHero(); } showCombo('Разбился на полном ходу!', true); }
    else { hero.vx = -dir * (2 + 1.5 * m); hero.vy = 3.5 + 1.5 * m; game.shake = Math.max(game.shake, 0.08); sfx('RobotHit5', 0.5, 1.3); showCombo('Кульбит от стены', false); } }
  if (hero.onGround && ax !== 0 && Math.abs(vMom) > 1 && (Math.abs(toU(hero) - uMom) < Math.abs(vMom) * dt * 0.5 || hero.vx === 0) && !hero.standOn) { if (hero.mom > 0.05) hero.momLost = { m: hero.mom, t: game.time }; hero.mom = 0; }   /* упёрся (в робота, ящик) — разгон пропал */
  // на живом роботе долго не устоишь: через несколько секунд он стряхивает героя
  if (hero.standOn && !hero.standOn.dead && hero.onGround) {
    hero.onRobotT += dt;
    if (hero.onRobotT >= CFG.buckAfter) {
      const r = hero.standOn; r.buckT = 0.6; r.mode = 'wait'; r.t = 0.8; hero.onRobotT = 0; hero.standOn = null;
      const side = Math.random() < 0.5 ? -1 : 1; hero.vx = side * 2.2; hero.vy = 3.8; hero.onGround = false; hero.face = -side; go('Kulbit'); sfx('RobotHit5', 0.6, 0.8); 
    }
  } else hero.onRobotT = 0;
  tryMount();
  if (hero.ride) return;
  tryHang();
  if (hero.hang) return;

  // робот на том же уровне и рядом на экране: если под героем есть пол на его ряду, герой переходит на этот ряд
  if (hero.onGround && Math.abs(hero.y - Math.round(hero.y)) < 0.01) {
    hero.levelY = hero.y;
    const hu = toU(hero), hd = toD(hero);
    for (const r of robots) {
      if (r.dead || Math.abs(r.baseY - hero.y) > 0.01 || Math.abs(toU(r) - hu) > 1.3 || Math.abs(toD(r) - hd) <= DEPTH_TOL || Math.abs(toD(r) - hd) > 2.5 || robotHidden(r)) continue;   /* только на соседний ряд: на дальний край ступни не перебрасывает */
      const rd = toD(r);
      if (floorCube(Math.round(hu), Math.round(hero.y) - 1, rd, 'same') && !overlapsDepth(hu, hero.y, hero.hw, hero.h, rd) && !heroHiddenAt(hu, hero.y, rd)) { setUD(hero, hu, rd); break; }
    }
  }
  // сохранение точки возврата
  if (hero.onGround && hero.st !== 'Kulbit' && floorCube(Math.round(toU(hero)), Math.round(hero.y) - 1, toD(hero), 'same')) { save.t += dt; if (save.t > 0.4) { save.t = 0; Object.assign(save, { x: hero.x, y: hero.y, z: hero.z, k: view.k }); } }
  if (hero.y < -7) { killHero(); hero.deadT = 0.6; return; }

  // анимация и переходы; пока крюк летит или тянет, герой замирает на кадре с вытянутой рукой
  { const hp = hand[hero.anim.sprite()]; if (!(hero.st === 'HookThrow' && hero.hook && hp && Math.abs(hp[0]) > 0.3)) hero.anim.update(dt); }
  if (hero.hitWin) { checkHits(); if (hero.hitWin) { hero.hitWin.t -= dt; if (hero.hitWin.t <= 0) hero.hitWin = null; } }   /* v296: удар мог кончиться перехватом */
  const g = hero.onGround, moving = ax !== 0, done = hero.anim.done, fast = hero.timeWithInput > CFG.fastDelay;
  const attackFromGround = () => {
    const ob = onBot();
    if (hasTrig('arm') && !ob && !(hero.dashCD > 0) && game.time - (hero.dblT || -9) < 0.55) { useTrig('arm'); startDash(hero.tapDir); return true; }   // дважды в сторону и нож — длинный выпад                 // на роботе рукой его не достать: только ногой в пол
    if (hasTrig('arm')) { useTrig('arm'); if (!ob) { go(nextIn('arm', armSeries(true))); return true; } }
    if (useTrig('leg')) { go(nextIn('leg', ob ? STOMP_SERIES : LEG_SERIES)); return true; }
    if (hasTrig('kunai')) { useTrig('kunai'); if (hero.kunai > 0) { go('KunaiThrow'); return true; } sfx('RUN_1_13', 0.2, 2.2); }
    if (sitHeld) { go('Sit'); return true; }
    return false;
  };
  const land = () => {                  // приземление: после настоящего полёта — кадры приземления и звук, после подскока сразу стойка или бег
    if (airBefore > 0.3) {
      go('Grounded'); sfx('Jump_4_landfall', 0.5, rnd(0.95, 1.05)); hero.sq = vyBefore < -6 ? -0.26 : -0.15; hero.sqV = 0;
      if (vyBefore < -6) {              // упал с высоты: кольцо пыли, комья из-под ног, лёгкий толчок
        spawnFx('FxLand', hero.x, hero.y - 0.03, hero.z, { scale: 0.8 }); burst(hero.x, hero.y + 0.05, hero.z, { n: 12, cols: DIRT, sp: [1, 3.2], life: 0.55 }); game.shake = Math.max(game.shake, 0.05);
      } else spawnFx('FxPuff', hero.x, hero.y, hero.z, { flip: hero.face > 0, scale: 0.9 });
    } else go(moving ? 'RunSlow' : 'Stay');
  };
  const attackInAir = () => {
    if (useTrig('leg')) { go('JumpLegsAttack2'); plog('комбо', 'Велосипед'); return true; }
    if (hasTrig('arm') && !(hero.dashCD > 0) && game.time - (hero.dblT || -9) < 0.55) { useTrig('arm'); startDash(hero.tapDir); hero.dash.air = true; hero.vy = 0; return true; }   // дважды в сторону и нож — выпад и в воздухе
    if (useTrig('arm')) { go(nextIn('arm', armSeries(false))); return true; }   // с ножом в прыжке — те же два удара автора с разворота
    if (hasTrig('kunai')) { useTrig('kunai'); if (hero.kunai > 0) { go('AirThrow'); return true; } }
    return false;
  };
  switch (hero.st) {
    case 'Stay': if (!g) go('JumpInRun'); else if (!attackFromGround() && moving) go('RunSlow'); break;
    case 'RunSlow': if (!g) go('JumpInRun'); else if (attackFromGround()) break; else if (!moving) go('Stay'); else if (fast) go('RunFast'); break;
    case 'RunFast': if (!g) go('JumpInRun'); else if (attackFromGround()) break; else if (!moving) go('Stay'); break;
    case 'JumpInRun': case 'DoubleJump': if (g) land(); else if (attackInAir()) break; else if (done) go('Fly'); break;
    case 'Fly': if (g) land(); else attackInAir(); break;
    case 'Grounded': if (!g) go('JumpInRun'); else if (attackFromGround()) break; else if (moving) go('RunSlow'); else if (done) go('Stay'); break;
    case 'Sit': if (!sitHeld) go('Stay'); else if (useTrig('arm') && !onBot()) go('SitAttack1'); break;
    case 'HandAttack1': case 'HandAttack2': case 'HandAttack3': case 'LegsAttackUp1': case 'LegsAttackUp2': case 'JumpLegsAttack':
    case 'KnifeAttack1': case 'KnifeAttack2': case 'KnifeAttack3': case 'JumpKnife1': case 'JumpKnife2': case 'Stomp1': case 'Stomp2':
      // v303 (Алексей: «рука–нога: резко жмёшь другой удар — пауза короче, удар резче»): после попадания рукой можно сразу бить ногой и наоборот —
      // хвост клипа обрывается, у нового удара замах укорочен (как отмена в файтингах и в Dead Cells); тот же удар — играет целиком
      if (!done && g && /^(HandAttack[123]|LegsAttackUp[12])$/.test(hero.st) && !onBot()) { const kind = /^Hand/.test(hero.st) ? 'arm' : 'leg', oth = kind === 'arm' ? 'leg' : 'arm', ev = hero.anim.clip && hero.anim.clip.events && hero.anim.clip.events[0];
        if (ev && hero.anim.t >= ev[0] + 0.03 && hasTrig(oth)) { hero.series[kind].t = game.time; useTrig(oth); go(nextIn(oth, oth === 'arm' ? armSeries(true) : LEG_SERIES)); hero.altCut = true;
          const e2 = hero.anim.clip && hero.anim.clip.events && hero.anim.clip.events[0]; if (e2 && /^(HandAttack|LegsAttackUp)/.test(hero.st)) hero.anim.t = Math.max(hero.anim.t, e2[0] * 0.5); break; } }
      if (done || (hero.st === 'KnifeAttack1' && hero.anim.t >= 0.27 && hasTrig('arm') && g) || (hero.st === 'JumpKnife1' && hero.anim.t >= 0.25 && hasTrig('arm') && !g)) {   // серия продолжается следующим клипом, если кнопку нажали ещё раз; второй удар ножом идёт сразу за первым, без возврата в стойку
        const kind = /^(Hand|Knife|JumpKnife)/.test(hero.st) ? 'arm' : 'leg', ob = onBot();
        hero.series[kind].t = game.time;
        if (kind === 'arm' && ob) { useTrig('arm'); go('Stay'); }
        else if (useTrig(kind) && (g || kind === 'arm')) go(nextIn(kind, kind === 'arm' ? armSeries(g) : ob ? STOMP_SERIES : LEG_SERIES)); else go(g ? 'Stay' : 'Fly');
      } break;
    case 'Take': if (!hero.hang && !hero.ride && !hero.ladder && !hero.grab) go(g ? 'Stay' : 'Fly'); break;   /* v309 (Алексей: «прыгал сверху — перс завис»): хват отпущен, а поза осталась — выходим из неё */
    case 'SitAttack1': if (done) { if (useTrig('arm')) go('SitAttack2'); else go('Sit', { end: true }); } break;
    case 'SitAttack2': if (done) { if (useTrig('arm')) go('SitAttack1'); else go('Sit', { end: true }); } break;
    case 'AirThrow': if (g) land(); else if (done) go('Fly'); break;
    case 'JumpLegsAttack2': case 'Kulbit': if (done) { if (g) land(); else go('Fly'); } break;
    default: if (done) go(g ? 'Stay' : 'Fly');
  }
  // разворот на ходу: тот же клип для другой стороны
  const d2 = ST[hero.st];
  if (d2.loco && hero.st !== 'Sit') { const [nm, flip] = heroClip(d2.clip, d2.n || ''); if (nm !== hero.anim.name || flip !== hero.anim.flip) hero.anim.play(nm, { loop: !!d2.loop, flip, speed: d2.speed || 1 }); }
}

// Связка «кунай, рука, нога»: бросил кунай, на «руку» герой хватается за него и летит следом вытянув руку, «нога» — пинок в того, в кого кунай попал.
function startKride(k) {
  hero.kride = { k, t: 0, dir: k.dir, end: 0, r: null }; hero.hook = null; hero.hitWin = null; hero.dash = null; hero.vx = hero.vy = 0; hero.onGround = false; hero.standOn = null; hero.face = k.dir;
  go('HandAttack1'); const ev = hero.anim.clip.events && hero.anim.clip.events[0]; hero.anim.t = ev ? ev[0] : hero.anim.clip.len * 0.45;
  sfx('RUN_1_13', 0.5, 1.8); knifeSound(false); showCombo('Кунай, рука…', true);
}
function kickFromRide(r) {
  const K = hero.kride, dir = K.dir; hero.kride = null; go('JumpLegsAttack'); hero.vx = dir * 1.2; hero.vy = 2.2; hero.onGround = false; showCombo('Кунай, рука, нога');
  const hu = toU(hero); let tg = r && !r.dead ? r : null;
  if (!tg) for (const o of robots) { if (o.dead || !reach(o) || robotHidden(o) || Math.abs(o.y - hero.y) > 1.1) continue; const du = (toU(o) + (o.sh || 0) - hu) * dir; if (du > -0.2 && du < 1.3) { tg = o; break; } }
  kickSound(2, true); game.shake = Math.max(game.shake, 0.12); game.hitStop = Math.max(game.hitStop || 0, 0.06);
  if (tg && comboCounter('kride', tg)) return;
  if (tg) { tg.kv = dir * 11; tg.hitT = 0.35; tg.flashT = 0.15; tg.sq = -0.22; tg.sqV = 0; tg.atk = null; tg.stun = Math.max(tg.stun || 0, 0.8); tg.aggro = 9;
    burst(tg.x, tg.y + 0.4, tg.z, { n: 26, cols: SPARK.concat(['#ffffff', '#fff3a0']), sp: [2, 6.5], up: 1.6, life: 0.5, dir });
    game.melee = 'JumpLegsAttack'; damageRobot(tg, CFG.hitDamage * 2.5); game.melee = null; }
}
function updateKride(dt) {
  const K = hero.kride, k = K.k; K.t += dt; hero.invuln = Math.max(hero.invuln, 0.2);
  if (pressed.has('leg')) { pressed.delete('leg'); inputQ = []; kickFromRide(K.r || (k.in && !k.in.dead ? k.in : null)); return; }
  if (K.end > 0) {                      // кунай остановился: герой по инерции долетает и пару мгновений ждёт «ногу»
    K.end -= dt; hero.vy -= CFG.gravity * 0.5 * dt; hero.vx *= Math.exp(-dt * 6); moveBody(hero, dt);
    if (K.end <= 0) { hero.kride = null; go(hero.onGround ? 'Stay' : 'Fly'); } return; }
  const stop = k.state !== 'fly' || k.drop || K.t > 0.75;
  if (!stop) k.vy = Math.max(k.vy, 0);   /* с героем на хвосте кунай летит ровно */
  const tu = toU(k) - K.dir * 0.32, td = toD(k); let ty = null;
  for (const yy of [k.y - 0.36, hero.y, Math.ceil(k.y - 0.36)]) if (!overlapsDepth(tu, yy, hero.hw, hero.h, td)) { ty = yy; break; }
  if (!stop && ty !== null) { setUD(hero, tu, td); hero.y = ty; hero.vx = K.dir * k.sp; hero.vy = 0;
    if (Math.random() < dt * 40) parts.push({ x: hero.x - K.dir * 0.15 * view.r[0], y: hero.y + rnd(0.1, 0.6), z: hero.z - K.dir * 0.15 * view.r[1], vx: -K.dir * rnd(0.5, 2) * view.r[0], vz: -K.dir * rnd(0.5, 2) * view.r[1], vy: 0, g: 0, drag: 3, t: 0, life: 0.25, size: 1, col: '#fff4e1', a: 0.6 });
    return; }
  K.r = k.in && !k.in.dead ? k.in : null; K.end = 0.9; hero.vx = K.dir * 2.5; hero.vy = 1.2;
  if (K.r) { const ru = toU(K.r) + (K.r.sh || 0), nu = ru - K.dir * (K.r.hw + hero.hw + 0.08); if (!overlapsDepth(nu, hero.y, hero.hw, hero.h, toD(hero))) setUD(hero, nu, toD(hero)); hero.vx = 0; K.r.stun = Math.max(K.r.stun || 0, 0.7); popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, text: 'L — нога!', t: 0.2 }); }
}

function pinLadderNear() { const hu = toU(hero); return LEVEL.climbs.some(c => c.pin && !c.pipe && Math.abs(ladderU(c) - hu) < 0.45 && hero.y >= c.y0 - 0.3 && hero.y < c.y1 - 0.1); }
// Обломки роботов: по ним можно идти без прыжка, если ступень не выше роста героя.
const STEP_UP = 0.57;
const RBOX = { hw: 0.3, h: ROBOT_TOP };
const bodyBox = c => c.dead ? c.box : RBOX;
function corpseTop(u, yFeet, depth) {   // верх обломков под точкой (для роботов, идущих по обломкам)
  let best = null;
  for (const c of robots) {
    if (!c.box || Math.abs(u - toU(c)) > c.box.hw + 0.02) continue;
    if (depth !== undefined && Math.abs(toD(c) - depth) > NEAR_D) continue;
    const top = c.y + c.box.h;
    if (top <= yFeet + STEP_UP + 0.001 && (best === null || top > best)) best = top;
  }
  return best;
}
// Обломки — как кубы в FEZ: если их видно, они твёрдые, на какой бы глубине ни лежали. Живой робот твёрд только в своём ряду.
const bodyNear = (c, d) => c.dead ? !robotHidden(c) : reachD(c, d);
function heroSupport(u, yFeet, depth) { // на что герой может встать: обломки, живой робот своего ряда или пол лифта
  let best = null;
  for (const M of movers) { if (hero.dropT > 0) break; const Nm = FACE_N[M.f % 4], fN = Nm[0] * view.n[0] + Nm[1] * view.n[1]; if (fN < -0.3 || (fN > 0.5 && Math.abs(depth - 8) > 1.1) || Math.abs(u - toU(M)) > (fN > 0.5 ? 1.5 : 0.5) + 0.08) continue; if (M.y <= yFeet + 0.14 && (!best || M.y > best.top)) best = { top: M.y, r: M }; }   // ездящая панель
  for (const c of sky) { if (!c.front || !c.solid) continue; const bx = cloudBox(c); if (!bx) continue; const top = bx.y + bx.h * 0.55; if (Math.abs(u - bx.u) < bx.w * 0.4 && top <= yFeet + 0.14 && (!best || top > best.top)) best = { top, r: c }; }   // плотное облако держит
  for (const L of lifts) { const Nl = FACE_N[L.f]; if (Nl[0] * view.n[0] + Nl[1] * view.n[1] < -0.3 || Math.abs(u - toU(L)) > 0.62 + 0.1) continue;   // видна — значит на неё можно встать, с любой стороны кроме дальней
    if (L.y <= yFeet + STEP_UP + 0.02 && (!best || L.y > best.top)) best = { top: L.y, r: L };
    const rt = L.y + 1.28; if (Math.abs(u - toU(L)) < 0.66 && rt <= yFeet + 0.12 && (!best || rt > best.top)) best = { top: rt, r: L }; }   // на крыше люльки тоже можно ехать
  for (const c of robots) {
    const bx = bodyBox(c); if (!bx) continue; const du = u - toU(c);
    if (Math.abs(du) > bx.hw + 0.03 || !bodyNear(c, depth)) continue;
    const top = c.y + (c.dead ? bx.h : robotTopAt(du));
    if (top <= yFeet + STEP_UP + 0.001 && (!best || top > best.top)) best = { top, r: c };
  }
  best = armSupport(u, yFeet, best); best = stairSupport(u, yFeet, best); best = walkSupport(u, yFeet, best); best = gearSupport(u, yFeet, best); best = pistonSupport(u, yFeet, best);
  best = crateSupport(u, yFeet, depth, best); best = userSupport(u, yFeet, depth, best); best = bossSupport(u, yFeet, depth, best);   // v223: на ящик и на колбу мозга можно встать
  return best;
}

// Физика тела в текущей проекции. Правила как в FEZ: глубины «нет», но тело помнит свою.
// Стены и потолки — только кубы на глубине тела. Встать можно на куб своей глубины или на любой, чей верх виден игроку.
function slabHit(u, y, hw, h, d) {
  return eachBodyCell(u, y, hw, h, a => { const c = a[0]; return c.kind !== 'core' && !c.rec && !c.br && !c.br2 && c.y < 900 && Math.abs(c.dep - d) > DEPTH_TOL && c.dep > d - 2.6; });
}
function moveBody(e, dt) {
  let u = toU(e), d = toD(e);
  const wasGround = e.onGround;
  e.embedded = overlapsAny(u, e.y, e.hw, e.h);
  // если тело оказалось внутри куба своей глубины (приземление на край, поворот) — выталкиваем в ближайшую свободную сторону
  let inside = overlapsDepth(u, e.y, e.hw, e.h, d);
  const dropping = e === hero && hero.dropT > 0;   // проваливается сквозь площадку: её не замечаем
  if (inside && !dropping) {
    const outL = Math.round(u + e.hw) - 0.5 - e.hw - 0.002, outR = Math.round(u - e.hw) + 0.5 + e.hw + 0.002;
    const opts = [outL, outR].filter(v => Math.abs(v - u) < 0.6 && !overlapsDepth(v, e.y, e.hw, e.h, d)).sort((p, q) => Math.abs(p - u) - Math.abs(q - u));
    if (opts.length) { u = opts[0]; inside = false; }
  }
  // за куб, который ближе к камере, зайти можно: героя просто не будет видно, пока не выйдет или не повернёт мир
  const hidden = (uu, yy, dd) => eachBodyCell(uu, yy, e.hw, e.h, a => a[0].dep > dd + DEPTH_TOL);
  if (e.vx !== 0) {
    let nu = u + e.vx * dt; const sg = Math.sign(e.vx);
    // на земле герой переходит на тот куб, что виден под ногами впереди, — перекрытие считаем уже для его глубины
    let dAhead = d;
    if (wasGround && Math.abs(e.y - Math.round(e.y)) < 0.01) { const fc = floorCube(Math.round(nu + sg * e.hw), Math.round(e.y) - 1, d, 'any'); if (fc) dAhead = fc.dep; }
    if (e === hero && !inside && d < 7.5 && overlapsDepth(nu, e.y, e.hw, e.h, dAhead)) { for (const dd of [8, 9]) if (!overlapsDepth(nu, e.y, e.hw, e.h, dd)) { d = dAhead = dd; break; } }   // впереди стена на его глубине, а ближняя дорожка свободна — он на ней
    const slabIn = e === hero && !dropping && slabHit(u, e.y, e.hw, e.h, d);
    { const up = Math.ceil(e.y - 1e-6) - e.y;   // с трубы или ступеньки на край куба чуть выше ног (до 0.45) — шагает сам, не упирается
      if (e === hero && wasGround && !inside && !dropping && up > 0.005 && up <= 0.45 && overlapsDepth(nu, e.y, e.hw, e.h, dAhead) && !overlapsDepth(nu, e.y + up + 0.001, e.hw, e.h, dAhead) && !overlapsDepth(u, e.y + up + 0.001, e.hw, e.h, d)) { e.y = Math.ceil(e.y - 1e-6); if (e.vy < 0) e.vy = 0; } }
    if (!inside && (overlapsDepth(nu, e.y, e.hw, e.h, dAhead) || (e === hero && !dropping && !slabIn && slabHit(nu, e.y + 0.02, e.hw, e.h - 0.04, d)))) {
      const lead = Math.round(nu + sg * e.hw);
      nu = lead - sg * (0.5 + e.hw + 0.001); if ((nu - u) * sg < 0) nu = u; e.vx = 0; e.wallHit = sg;
    } else if (dAhead !== d && Math.round(nu + sg * e.hw) !== Math.round(u + sg * e.hw)) d = dAhead;   // шагнул на куб другой глубины — теперь он на ней
    for (const c of robots) {            // робот и слишком высокая груда обломков — стена
      if (e === hero && hero.passT > 0 && !c.dead) continue;   // только что вышел из ниши — не застревает в роботе, стоящем перед ней
      const bx = bodyBox(c); if (!bx || !bodyNear(c, d)) continue; const top = c.y + bx.h;
      if (top <= e.y + STEP_UP + 0.001 || e.y + e.h <= c.y) continue;
      const cu = toU(c), sum = e.hw + bx.hw;
      if (Math.abs(u - cu) >= sum - 0.002 && Math.abs(nu - cu) < sum && (cu - u) * sg > 0) { nu = cu - sg * sum; e.vx = 0; }
    }
    u = nu;
  }
  if (e === hero && e.jumpG && (e.vy > CFG.jumpImpulseG + 0.3 || e.onGround || e.hang || e.ladder || e.hook || e.ride)) e.jumpG = false;   // v299: что-то другое подбросило или прыжок кончился
  if (!e.noGrav) e.vy -= CFG.gravity * (e === hero && e.vy < 0 ? 1.8 : e === hero && e.jumpG ? CFG.jumpRiseG : 1) * dt;   // падает герой быстрее, чем взлетает: прыжок короче и тяжелее
  if (e.vy < -14) e.vy = -14;
  let ny = e.y + e.vy * dt;
  if (e.vy > 0) {
    if (!inside && (overlapsDepth(u, ny, e.hw, e.h, d) || (e === hero && !dropping && !slabHit(u, e.y, e.hw, e.h, d) && slabHit(u, ny, e.hw, e.h, d)))) { ny = Math.floor(ny + e.h) - e.h - 0.001; if (ny < e.y) ny = e.y; e.vy = 0; e.jumpUp = false; }
    e.onGround = false;
  } else {
    const T = Math.floor(e.y + 1e-6);
    let landed = false;
    if (ny <= T && !(dropping && (T - 1 === hero.dropRow || inside))) {
      const fw = 0.08, mode = 'any';
      const cols = [Math.round(u), Math.round(u - fw), Math.round(u + fw)];
      let fc = null;
      for (const U of cols.concat(Math.round(u - e.hw), Math.round(u + e.hw))) { fc = floorCube(U, T - 1, d, 'same'); if (fc) break; }   // сначала опора своей глубины, хоть краем
      if (!fc) for (const U of cols) { fc = floorCube(U, T - 1, d, mode); if (fc) break; }   // уступы той стороны, что видна ребром, не лестница: туда надо повернуть мир
      if (fc) { ny = T; e.vy = 0; d = fc.dep; landed = true; }
    }
    const sp = heroSupport(u, e.y, d), prevStand = e.standOn; let standOn = null;
    if (sp && sp.top > ny) {
      if (e.y >= sp.top - 0.03 || (prevStand === sp.r && wasGround) || (e === hero && wasGround && sp.top - e.y < 0.35 && (LEVEL.stairs || []).includes(sp.r))) {   /* v291: на первую ступень марша — шагом */ ny = sp.top; e.vy = 0; landed = true; standOn = sp.r; }   // стоим, приземляемся сверху или идём с плеча на голову
      else if ((wasGround || landed) && sp.r.dead) { ny = Math.min(sp.top, e.y + 4 * dt); e.vy = 0; landed = true; }   // заходим на обломки с земли
    } else if (sp && !landed && wasGround && ((prevStand === sp.r && sp.top > e.y - 0.14) || (e === hero && (LEVEL.stairs || []).includes(sp.r) && sp.top > e.y - 0.6))) { ny = sp.top;   /* v287: с площадки — на марш вниз, без падения */ e.vy = 0; landed = true; standOn = sp.r; }   // с головы на плечо — без падения
    if (standOn && standOn.dead && !standOn.lift) {      // встал на обломки другого ряда — перешёл на их ряд
      const rd = toD(standOn); if (Math.abs(rd - d) > DEPTH_TOL && !overlapsDepth(u, ny, e.hw, e.h, rd) && !hidden(u, ny, rd)) d = rd;
    }
    if (!landed && !wasGround) for (const r of robots) {   // падение на спину робота из другого ряда: герой переходит на его ряд
      if (r.dead || Math.abs(toD(r) - d) <= NEAR_D || robotHidden(r)) continue;
      const top = r.y + robotTopAt(u - toU(r));
      if (Math.abs(u - toU(r)) < 0.3 && e.y >= top - 0.03 && ny <= top && !hidden(u, top, toD(r))) { ny = top; e.vy = 0; landed = true; standOn = r; d = toD(r); break; }
    }
    if (e === hero && !landed && e.vy <= 0 && !dropping) {   // верх трубы на ближней стороне ноги — узкая опора: встать на неё можно только сверху
      for (const bm of LEVEL.beams) {
        const a = bm[0], c2 = bm[1], da = a[0] * view.n[0] + a[2] * view.n[1], dc = c2[0] * view.n[0] + c2[2] * view.n[1];
        if (da < 7 || dc < 7 || Math.abs(da - dc) > 0.05) {   // труба видна с торца (мир повернули, стоя на ней): держит, пока герой над самой трубой
          const top = a[1] + 0.13; if (e.y < top - 0.03 || ny > top) continue; const hx = u * view.r[0] + d * view.n[0], hz = u * view.r[1] + d * view.n[1], dx = c2[0] - a[0], dz = c2[2] - a[2], L2 = dx * dx + dz * dz || 1, s = Math.max(0, Math.min(1, ((hx - a[0]) * dx + (hz - a[2]) * dz) / L2));
          if (Math.hypot(hx - a[0] - dx * s, hz - a[2] - dz * s) > 0.5) continue; ny = top; e.vy = 0; landed = true; break; }
        const ua = a[0] * view.r[0] + a[2] * view.r[1], uc = c2[0] * view.r[0] + c2[2] * view.r[1], top = a[1] + 0.13;
        if (u < Math.min(ua, uc) - 0.2 || u > Math.max(ua, uc) + 0.2 || e.y < top - 0.03 || ny > top) continue;
        const bd = da < 8.6 ? 8 : Math.round(da - 0.3); if (overlapsDepth(u, top, e.hw, e.h, bd)) continue;
        ny = top; e.vy = 0; landed = true; d = bd; break;
      }
    }
    if (e === hero && standOn && standOn !== prevStand && lifts.includes(standOn) && standOn.f !== view.k && !view.rotating && hero.state !== 'dead') {
      const L = standOn, dk = (L.f - view.k + 4) % 4; d = toD(L); hero.vx = 0; hero.hook = null;
      view.rotating = true; view.from = view.angle; view.dir = dk === 3 ? -1 : 1; view.to = view.angle + (dk === 3 ? -90 : dk * 90); view.fast = dk === 2; }
    e.standOn = standOn;
    e.onGround = landed;
  }
  if (e === hero && !hero.hideN && !dropping && e.y < 900) {   // зашёл за куб, который ближе к камере, — не прячем героя: он выходит перед этим кубом
    const VW = 0.27, hid = dd => eachBodyCell(u, ny, VW, e.h - 0.05, a => a[0].dep > dd + DEPTH_TOL);   // по ширине рисунка (руки, плащ, огонь), а не узкого тела
    if (hid(d)) { let md = -1e9; eachBodyCell(u, ny, VW, e.h - 0.05, a => { if (a[0].dep > d + DEPTH_TOL) md = Math.max(md, a[0].dep); return false; });
      for (let dd = md + 1; dd <= md + 3; dd++) if (!overlapsDepth(u, ny, e.hw, e.h, dd) && !hid(dd)) { if (e.onGround && !(Math.abs(ny - Math.round(ny)) < 0.01 && floorCube(Math.round(u), Math.round(ny) - 1, dd, 'same'))) break; d = dd; break; } } }   /* стоит (на трубе, на краю): вперёд, где пола нет, не переносим — иначе падает */
  e.y = ny; setUD(e, u, d);
}

// ====================== ВИЛКА (электрическое оружие) ======================
// J — серия из трёх ударов с разрядом; держать J — поток тока (заряд ~3,3 с). В начале 3 заряда, копить можно до 12.
// F за спиной робота — вилка в гнездо: робот застыл, его трясёт током. Втыкание даёт +1 заряд. Продержал 5 с — робот обесточен и умирает стоя.
// Пока вилка воткнута, H — крюк цепляет робота за спиной героя и тащит его в пойманного: оба взрываются, герой отпрыгивает вверх.
const FORK_SERIES = ['ForkAttack1', 'ForkAttack2', 'ForkAttack3'], FORK_MAX = 3, FORK_CAP = 12, FORK_DRAIN = 0.3, FORK_SUCK = 2.3, FORK_KILL = 2.3;   // в начале 3 заряда, выкачивая роботов — до 12
// v243: «let forkItem…» перенесено в ядро — src/06b_world.js
const armSeries = (ground) => hero.fork ? (ground ? FORK_SERIES : talOK('f2') ? ['ForkAir'] : ARM_SERIES) : hero.knife ? (ground ? KNIFE_SERIES : AIR_KNIFE) : ARM_SERIES;
function forkTip(k = 0.62) { return { x: hero.x + hero.face * k * view.r[0], y: hero.y + 0.31, z: hero.z + hero.face * k * view.r[1] }; }
const atU = (o, du, y) => ({ x: o.x + du * view.r[0], y, z: o.z + du * view.r[1] });
const robotPt = r => atU(r, (r.sh || 0) + rnd(-0.3, 0.3), r.y + rnd(0.08, 0.75));
// молния: картинки автора (6 вариантов, лист tex/Bolt.png), белые, в пиксель. Растягиваем от точки до точки, концы молнии ложатся точно в эти точки;
// кадры меняются как у огня — каждую двадцатую долю секунды другой вариант, иногда отражённый
const BOLT_E = [[31, 34.5], [48.5, 49], [43, 42.5], [48.5, 50], [43, 42.5], [49, 45]];
function zapBolt(a, b, life = 0.1, th = 0.32, spr = false) { fBolts.push({ a, b, t: 0, life, th, w: th > 0.4 ? 4 : 3, spr, fr: Math.floor(Math.random() * 6), fl: Math.random() < 0.5 }); }
function zapRobot(r, n = 2) { for (let i = 0; i < n; i++) zapBolt(robotPt(r), robotPt(r), rnd(0.08, 0.16), 0.3); }
function updateZapBolts(dt) { for (const q of fBolts) q.t += dt; fBolts = fBolts.filter(q => q.t < q.life); }
function drawBoltSpr(x0, y0, x1, y1, fr, fl, th, al) {
  const im = img.Bolt; if (!im || !im.width) return; const len = Math.hypot(x1 - x0, y1 - y0); if (len < 3) return;
  const e = BOLT_E[fr], k = th * S / 64 * (fl ? -1 : 1);
  ctx.save(); ctx.globalAlpha = al; ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(x0), Math.round(y0)); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  ctx.transform(len / 256, (e[0] - e[1]) * k / 256, 0, k, 0, -e[0] * k); ctx.drawImage(im, 0, fr * 64, 256, 64, 0, 0, 256, 64); ctx.restore();
}
function drawFBolts(b) {
  const P = p => [W / 2 + relU(p, b) * S, H / 2 - (p.y - cam.y) * S];
  const line = (x0, y0, x1, y1, w, col) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / w)); ctx.fillStyle = col; for (let i = 0; i <= n; i++) { const t = i / n; ctx.fillRect(Math.round(x0 + (x1 - x0) * t - w / 2), Math.round(y0 + (y1 - y0) * t - w / 2), w, w); } };
  for (const q of fBolts) { const [x0, y0] = P(q.a), [x1, y1] = P(q.b);
    if (q.spr) { drawBoltSpr(x0, y0, x1, y1, (q.fr + Math.floor(q.t / 0.05)) % 6, q.fl !== (Math.floor(q.t / 0.1) % 2 === 1), q.th, 1); continue; }   // поток тока — молния с картинки автора
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 2) continue;   // удары и искры по роботу — тонкая белая ломаная в пиксель, как на кадрах вилки
    const w = q.w || 3, nx = -(y1 - y0) / L, ny = (x1 - x0) / L, n = Math.max(3, Math.round(L / 13)), j = Math.min(19, L * 0.22), pts = [[x0, y0]];
    for (let i = 1; i < n; i++) { const t = i / n, o = rnd(-j, j); pts.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]); } pts.push([x1, y1]);
    for (let i = 0; i < pts.length - 1; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, '#ffffff');
    if (L > 24) { const k = 1 + Math.floor(Math.random() * (pts.length - 2)), [bx, by] = pts[k], ang = Math.atan2(y1 - y0, x1 - x0) + rnd(-1.2, 1.2), bl = rnd(0.25, 0.45) * L;
      const mx = bx + Math.cos(ang) * bl * 0.5 + nx * rnd(-7, 7), my = by + Math.sin(ang) * bl * 0.5 + ny * rnd(-7, 7); line(bx, by, mx, my, w - 1, '#ffffff'); line(mx, my, mx + Math.cos(ang) * bl * 0.5, my + Math.sin(ang) * bl * 0.5, w - 1, '#ffffff'); }
    ctx.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(x1 + rnd(-12, 12)), Math.round(y1 + rnd(-12, 12)), 3, 3);
    if (Math.random() < 0.4) { ctx.fillStyle = '#bff0ff'; const p = pick(pts); ctx.fillRect(Math.round(p[0]), Math.round(p[1]), 3, 3); } }
  forkPrompt(b); pipeHint(b);
}
function pipeHint(b) {                    // рядом труба, а под ногами опора: подсказка «W — схватиться за трубу»
  if (hero.hang || hero.state === 'dead' || game.time - (hero.pipeHintT || -9) > 0.6) return; const g = Math.max(3, Math.round(S * 0.04));
  drawKeycap(Math.round(W / 2 + relU(hero, b) * S), Math.round(H / 2 - (hero.y + 1.25 - cam.y) * S) - g * 9, g, 'W', true);
}
// подсказка: за спиной робота с вилкой в руках — клавиша F с искоркой; держать F — воткнуть
function forkPrompt(b) {
  if (!hero.fork || hero.beam || hero.state === 'dead') return; const P = hero.forkP; if (P && (!P.plugged || P.pulling)) return; if (!P && !hero.onGround) return; const tg = P ? P.r : forkPlugTarget(); if (!tg) return;
  const g = Math.max(3, Math.round(S * 0.05)), px = Math.round(W / 2 + (relU(tg, b) + (tg.sh || 0)) * S), py = Math.round(H / 2 - (tg.y + 1.35 - cam.y) * S);
  drawKeycap(px, py - g * 9, g, 'F', true); ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) { const t = (game.time * 3 + i * 0.37) % 1, a = i * 1.05 + game.time; ctx.fillRect(Math.round(px + Math.cos(a) * g * 6 * (0.6 + t * 0.5)), Math.round(py - g * 5 + Math.sin(a) * g * 5), g, g); }   // искорки вокруг клавиши
  if (P && P.plugged && !P.pulling) { const ht = forkHookTarget(P.r); if (ht) { const hx = Math.round(W / 2 + (relU(ht, b) + (ht.sh || 0)) * S), hy = Math.round(H / 2 - (ht.y + 1.35 - cam.y) * S); drawKeycap(hx, hy - g * 9, g, 'H', true); } }   // за спиной другой робот — H: крюк
  const k = P ? Math.min(1, P.held / FORK_KILL) : 0;   /* держишь F — полоска: сколько осталось до полного обесточивания */ if (k > 0) { ctx.fillStyle = '#1a0f14'; ctx.fillRect(px - g * 5, py + g, g * 10, g * 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(px - g * 5, py + g, Math.round(g * 10 * k), g * 2); }
}
// обесточенный робот: стоит почерневший, по нему изредка пробегает ток; ударишь — рухнет, иногда взрывается
function toppleDrained(r, dir) {
  if (r.fell) return; r.fell = true; r.kind = nextDeath(); r.box = null; r.dir = dir || r.dir; r.anim.play(DEATH_CLIP[r.kind], { loop: false, restart: true }); r.anim.speed = 1;
  zapRobot(r, 3); sfx('RobotDeath' + (r.kind === 'C' ? 'A' : r.kind), 0.6); sfx('RobotHit5', 0.5, 0.7); r.noFire = true;
  if (Math.random() < 0.15) { booms.push({ x: r.x, y: r.y + 0.4, z: r.z, t: 0 }); booms.push({ x: r.x + 0.25 * view.r[0], y: r.y + 0.6, z: r.z + 0.25 * view.r[1], t: 0 }); burst(r.x, r.y + 0.4, r.z, { n: 30, cols: ['#ffce46', '#ff7014', '#fff3c4', '#c0392b', '#3a2f36'], sp: [1.5, 6], life: 0.8, size: 2 }); game.shake = Math.max(game.shake, 0.25); sfx('RobotDeathB', 0.9, 0.8);
    const ru = toU(r); if (hero.state !== 'dead' && Math.abs(toD(hero) - toD(r)) <= 1.1 && Math.abs(toU(hero) - ru) < 1.4 && Math.abs(hero.y - r.y) < 1.4) hurtHero(ru, 'взрыв обесточенного робота');
    for (const o of robots) if (o !== r && !o.dead && Math.hypot(o.x - r.x, o.z - r.z) < 1.5 && Math.abs(o.y - r.y) < 1.2) robotHurtRobot(o, 25, Math.sign(toU(o) - ru) || 1); }
}
function updateDrained(dt) {
  const atk = hero.dash || hero.kride || (ST[hero.st] && ST[hero.st].lock && /Attack|Stomp|Knife|Fork/.test(hero.st) && hero.anim.t > 0.08);
  for (const r of robots) { if (!r.drained || r.fell || !r.dead) continue;
    if (atk && Math.abs(r.y - hero.y) < 0.8 && reach(r)) { const du = (toU(r) - toU(hero)) * hero.face; if (du > -0.15 && du < 0.95) { toppleDrained(r, hero.face); continue; } }   /* любой удар роняет обесточенного */ r.zapT = (r.zapT === undefined ? rnd(1.5, 2.5) : r.zapT) - dt;
    if (r.zapT <= 0) { r.zapT = rnd(1.5, 2.8); if (!robotHidden(r)) { zapRobot(r, 2); fSparks(r, 3); if (robotOnScreen(r)) zapSound(0.15, 0.1); } } }
}
function forkHit(n) {                     // удар серии: колет на длину вилки, разряд бьёт в робота
  const f = hero.face, hu = toU(hero), reachU = n === 3 ? 1.55 : 1.35, air = n === 4; let hit = 0;
  for (const c of crates) if (!(c.broken && (c.tv === undefined || c.gone)) && !propHidden(c) && Math.abs(c.y - hero.y) < (air ? 1.6 : 0.8)) { const du = (toU(c) - hu) * f; if (du > -0.2 && du < reachU) { hitCrate(c, f); hitCrate(c, f); zapBolt(beamTip(), { x: c.x, y: c.y + 0.3, z: c.z }, 0.1, 0.3); } }   // ящики вилка тоже разбивает
  for (const [o, rt] of USERRT) { if (rt.broken || !(rt.hp > 0)) continue; const B = userBox(o); if (!userLive(o, B.C) || Math.abs(B.y0 + B.h / 2 - hero.y - 0.4) > (air ? 1.6 : 0.8) + B.h / 2) continue; const du = (B.u - hu) * f; if (du > -0.2 - B.w / 2 && du < reachU + B.w / 2) { userHit(o, f); userHit(o, f); } }   // v251: и свои предметы
  if (boss) bossCheckHits({ done: new Set() }, f > 0 ? hu : hu - reachU, f > 0 ? hu + reachU : hu, [0, 0, hero.y - (air ? 1 : 0.2), hero.y + 0.9]);   // мозг и его узлы
  if (tutor) tutorCheckHits({ done: new Set() }, f > 0 ? hu : hu - reachU, f > 0 ? hu + reachU : hu, [0, 0, hero.y - (air ? 1 : 0.2), hero.y + 0.9]);
  if (inWater()) waterShock();
  zapSound(n === 3 ? 0.55 : 0.35, n === 3 ? 0.3 : 0.18); knifeSound(false);
  for (const r of robots) { if (r.dead) { if (r.drained && !r.fell && Math.abs(r.y - hero.y) < 0.8) { const du = (toU(r) - hu) * f; if (du > -0.1 && du < reachU) toppleDrained(r, f); } continue; }
    if (!reach(r) || robotHidden(r) || (air ? (r.y - hero.y > 0.6 || hero.y - r.y > 3.2) : Math.abs(r.y - hero.y) > 0.8)) continue; const du = (toU(r) + (r.sh || 0) - hu) * f; if (du < -0.3 || du > (air ? 1.9 : reachU)) continue;
    if (shieldFront(r)) { shieldPing(r); continue; }
    hit++; game.melee = air ? 'ForkAir' : 'ForkAttack' + n; damageRobot(r, CFG.hitDamage * (n === 3 ? 1.6 : air ? 1.4 : 1.1)); game.melee = null;
    if (!r.dead) { r.kv = f * (n === 3 ? 7 : 1.5); r.stun = Math.max(r.stun || 0, n === 3 ? 0.7 : 0.25); r.flashT = 0.12; r.shockT = Math.max(r.shockT || 0, n === 3 ? 0.55 : 0.35); }   /* удар вилкой — доля секунды шока */
    zapBolt(forkTip(0.55), robotPt(r), 0.12, 0.3); zapRobot(r, n === 3 ? 3 : 2);
    burst(r.x, r.y + 0.45, r.z, { n: 10, cols: ['#ffffff', '#ffffff', '#bff0ff'], sp: [1.5, 5], up: 1, life: 0.3, dir: f, size: 1 }); }
  if (hit) { hero.hitOK = true; game.hitStop = Math.max(game.hitStop || 0, n === 3 ? 0.07 : 0.04); game.shake = Math.max(game.shake, n === 3 ? 0.1 : 0.05); }
  if (!air) hero.pushV = f * (n === 3 ? 2.2 : 1.2); else hero.vy = Math.min(hero.vy, hit ? -6 : -4);   /* удар вилкой в прыжке тянет вниз, к земле, а не подбрасывает */
}
// ---- поток тока: держать J. Заряды тратятся непрерывно, 3 заряда ~ 10 с
function beamTip() { return { x: hero.x + hero.face * 0.94 * view.r[0], y: hero.y + 0.22, z: hero.z + hero.face * 0.94 * view.r[1] }; }   // кончик вилки в кадре прямой стойки
function endBeam() { const B = hero.beam; if (B && B.q) B.q.life = 0; if (B && B.links) for (const q of B.links) q.life = 0; hero.beam = null; }
function updateForkBeam(dt) {
  const B = hero.beam; B.t += dt; hero.vx = 0; hero.anim.update(dt); moveBody(hero, dt);
  hero.fCharge = Math.max(0, (hero.fCharge || 0) - FORK_DRAIN * (talHas('f6') ? 0.67 : 1) * dt); updateHUD();   /* v312: «Ёмкость» */
  if (!keys.has('arm') || hero.fCharge <= 0 || hero.state === 'dead') { endBeam(); go(hero.onGround ? 'Stay' : 'Fly'); if (hero.fCharge <= 0) popups.push({ x: hero.x, y: hero.y + 1, z: hero.z, text: 'заряд кончился', t: 0 }); return; }
  const f = hero.face, hu = toU(hero), tip = beamTip(); let tg = null, bd = 4.6;
  for (const r of robots) { if (r.dead || !reach(r) || robotHidden(r) || Math.abs(r.y - hero.y) > 0.8) continue; const du = (toU(r) + (r.sh || 0) - hu) * f; if (du > 0 && du < bd) { bd = du; tg = r; } }
  if (tg && !B.cc) { B.cc = true; if (comboCounter('beam', tg, beamGrounded)) return; }
  let end; if (tg) { B.pt = B.tg === tg && B.pt ? B.pt : { du: rnd(-0.12, 0.12), dy: rnd(0.3, 0.55) }; B.tg = tg; end = atU(tg, (tg.sh || 0) - f * 0.15 + B.pt.du, tg.y + B.pt.dy); }
  else { B.tg = null; let L = 0.4; while (L < 4.6 && !overlapsDepth(toU(tip) + f * L, tip.y - 0.05, 0.05, 0.1, toD(hero))) L += 0.2; end = { x: tip.x + f * L * view.r[0], y: tip.y, z: tip.z + f * L * view.r[1] }; }
  if (!B.q || B.q.life <= 0) { B.q = { a: tip, b: end, t: 0, life: 1e9, th: 0.5, fr: 0, fl: false, spr: true }; fBolts.push(B.q); }   // один поток, кадры меняются сами
  B.q.a = tip; B.q.b = end;
  // цепь: от пойманного поток перескакивает на соседей, каждый следующий получает на 30% меньше; дальше третьего — только искрит
  const chain = []; if (tg) { let last = tg; const used = new Set([tg]); for (let i = 0; i < 5; i++) { let nx = null, nd = talHas('f7') ? 4 : 2.6;   /* v312: «Цепная молния» */ for (const o of robots) { if (o.dead || used.has(o) || !reach(o) || robotHidden(o) || Math.abs(o.y - last.y) > 1.2) continue; const d = Math.abs(toU(o) - toU(last)); if (d < nd) { nd = d; nx = o; } } if (!nx) break; used.add(nx); chain.push([last, nx]); last = nx; } }
  B.links = B.links || []; while (B.links.length < chain.length) { const q = { a: tip, b: end, t: 0, life: 1e9, th: 0.36, fr: Math.floor(Math.random() * 6), fl: Math.random() < 0.5, spr: true }; B.links.push(q); fBolts.push(q); }
  B.links.forEach((q, i) => { if (i < chain.length) { q.a = atU(chain[i][0], chain[i][0].sh || 0, chain[i][0].y + 0.45); q.b = atU(chain[i][1], chain[i][1].sh || 0, chain[i][1].y + 0.45); q.th = 0.36; } else q.th = 0; });
  B.snd -= dt; if (B.snd <= 0) { B.snd = 0.14; zapSound(0.3, 0.16); }
  if (pressed.has('hook')) { pressed.delete('hook'); if (talNeed('f5')) forkHookPull(tg); }
  if (tg) { B.dmgT -= dt; tg.stun = Math.max(tg.stun || 0, 0.25); tg.atk = null; tg.flashT = Math.random() < 0.5 ? 0.05 : 0; tg.sq = rnd(-0.05, 0.03); tg.sqV = 0; if (Math.random() < dt * 14) zapRobot(tg, 1);
    if (B.dmgT <= 0) { B.dmgT = 0.2; game.melee = 'ForkBeam'; damageRobot(tg, CFG.hitDamage * 0.8, false); if (!tg.dead) { tg.hitT = 0; tg.kv = f * 0.6; }
      chain.forEach(([, o], i) => { o.stun = Math.max(o.stun || 0, 0.4); o.atk = null; o.flashT = 0.05; zapRobot(o, 1); if (i < (talHas('f7') ? 5 : 3) && !o.dead) { damageRobot(o, CFG.hitDamage * 0.8 * Math.pow(talHas('f7') ? 0.92 : 0.7, i + 1), false); if (!o.dead) o.hitT = 0; }
        if (!o.dead && Math.random() < 0.008) { PLOG.kill = 'поток тока: перегрузка'; o.why = 'поток тока: перегрузка'; game.safeBlast = true; rageBlast(o); game.safeBlast = false; PLOG.kill = null; showCombo('Перегрузка — робот в цепи взорвался!', false); } });   // изредка кто-то в цепи не выдерживает и взрывается
      game.melee = null; if (inWater()) waterShock(); } }
}function beamGrounded(r) {                // робот привык к потоку — заземлился, ток уходит обратно в героя
  endBeam(); go(hero.onGround ? 'Stay' : 'Fly'); zapBolt(robotPt(r), { x: hero.x, y: hero.y + 0.4, z: hero.z }, 0.25, 0.4); zapSound(0.8, 0.4);
  popups.push({ x: r.x, y: r.y + 1.15, z: r.z, text: 'Заземлился!', t: 0 }); showCombo('Робот заземлился — поток бьёт в тебя. Смени приём', true);
  r.stun = 0; r.aggro = 9; if (!(hero.invuln > 0)) hurtHero(toU(r), 'поток тока вернулся'); }
function forkPlugTarget() {               // робот спиной к герою, вплотную (вилка длинная — можно чуть дальше, чем руками)
  const hu0 = toU(hero); let tg = null, bd = 1.9;
  for (const o of robots) { if (o.dead || o.taxi || o.lift || o.onCloud || !reach(o) || robotHidden(o) || Math.abs(o.y - hero.y) > 0.3 || o.atk) continue;
    const dd = hu0 - toU(o) - (o.sh || 0); if (Math.sign(dd) !== -o.dir || Math.abs(dd) > bd) continue; bd = Math.abs(dd); tg = o; }
  return tg;
}
function startForkPlug(r) {
  if (comboCounter('plug', r)) return;   // приелось — робот разворачивается и хватает
  const ru = toU(r) + (r.sh || 0), side = Math.sign(toU(hero) - ru) || -r.dir;
  hero.face = -side; hero.vx = hero.vy = 0; hero.hook = null; hero.hitWin = null; hero.dash = null; hero.beam = null;
  const nu = ru + side * 0.72; if (!overlapsDepth(nu, hero.y, hero.hw, hero.h, toD(hero))) setUD(hero, nu, toD(hero));
  hero.forkP = { r, t: 0, zapT: 0, plugged: false, held: 0 }; r.stun = Math.max(r.stun || 0, 1.5); r.atk = null; r.charge = 0; r.aggro = 0; r.kv = 0;
  go('ForkPlug'); sfx('RUN_1_13', 0.4, 0.8); showCombo('Вилка в гнездо', false);
}
function forkRelease(jump) {
  const P = hero.forkP; if (!P) return; hero.forkP = null; if (P.r && !P.r.dead) { P.r.stun = Math.max(P.r.stun || 0, 1.0); P.r.forked = false; }
  if (jump) { hero.vy = CFG.jumpImpulse * 0.9; hero.vx = -hero.face * 1.5; hero.onGround = false; go('JumpInRun'); } else go('Stay');
}
function powerDownSound() {               // звук обесточивания: гул падает вниз и глохнет
  if (!actx || muted) return; const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(38, t + 1.1); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  o.connect(g); g.connect(master || actx.destination); o.start(t); o.stop(t + 1.25);
}
function forkDrain(r) {                   // держал вилку 5 секунд: робот обесточен
  hero.forkP = null; go('Stay'); powerDownSound(); zapRobot(r, 4); fSparks(r, 10); r.forked = false;
  const v = Math.random(); PLOG.kill = 'вилка: обесточен';
  if (v < 0.1) { r.why = 'вилка: обесточен'; game.safeBlast = true; rageBlast(r); game.safeBlast = false; PLOG.kill = null; showCombo('Обесточен — и взорвался', false); return; }
  r.forceKind = 'S'; r.char = 0.55; r.noFire = true; damageRobot(r, r.hp + 1, true); PLOG.kill = null; r.drained = true; r.zapT = 0.6; zapRobot(r, 5);
  if (v < 0.2) { r.burn = 6; showCombo('Обесточен — загорелся', false); } else showCombo('Обесточен', false);
}
function updateForkPlug(dt) {
  const P = hero.forkP, r = P.r; P.t += dt; hero.vx = 0; hero.anim.update(dt); moveBody(hero, dt); hero.invuln = Math.max(hero.invuln, 0.1);
  if (!r || r.dead || robots.indexOf(r) < 0 || hero.state === 'dead') { forkRelease(false); return; }
  if (hero.st === 'ForkPlug' && hero.anim.done) go('ForkHold');
  if (!P.plugged) return;
  if (P.pulling) { r.stun = Math.max(r.stun || 0, 0.5); return; }   /* крюк уже летит: доигрывает анимацию */
  if (!keys.has('dodge')) { forkRelease(false); return; }   /* отпустил F — выдернул; сколько успел выкачать, то и осталось */
  P.held += dt; hero.fCharge = Math.min(FORK_CAP, (hero.fCharge || 0) + FORK_SUCK * dt); if (Math.random() < dt * 3) updateHUD(); r.stun = Math.max(r.stun || 0, 0.5); r.atk = null; r.aggro = 0; r.forked = true; r.mode = 'wait';
  P.zapT -= dt; if (P.zapT <= 0) { P.zapT = rnd(0.1, 0.25); zapRobot(r, 1 + (Math.random() < 0.4 ? 1 : 0)); if (Math.random() < 0.5) zapBolt(forkTip(0.5), robotPt(r), 0.08, 1); fSparks(r, 2); r.flashT = 0.05; r.sq = rnd(-0.05, 0.03); r.sqV = 0; zapSound(0.22, 0.1);
    r.hp = Math.max(1, r.hp - 1); }
  if (P.held >= FORK_KILL) { forkDrain(r); return; }
  if (pressed.has('hook')) { pressed.delete('hook'); if (talNeed('f5')) forkHookPull(r); return; }
  if (pressed.has('jump')) { pressed.delete('jump'); forkRelease(true); return; }
  if (pressed.has('arm')) { pressed.delete('arm'); forkRelease(false); return; }
  const ax = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0); if (ax && ax !== hero.face) forkRelease(false);
}
function forkOnPlug() {                   // момент втыкания: большой разряд и +1 заряд
  const P = hero.forkP; if (!P || !P.r || P.r.dead) return; P.plugged = true; const r = P.r;
  zapBolt(forkTip(0.5), robotPt(r), 0.16); zapRobot(r, 4); fSparks(r, 14); zapSound(0.8, 0.45); game.shake = Math.max(game.shake, 0.1); game.hitStop = Math.max(game.hitStop || 0, 0.06);
  r.flashT = 0.2; r.sq = -0.15; r.sqV = 0; hero.fCharge = Math.min(FORK_CAP, (hero.fCharge || 0) + 0.5); updateHUD();
  popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, text: 'держи F — выкачать', t: 0 });
}
function forkHookTarget(r) {              // кого крюк достанет за спиной героя (как в forkHookPull)
  const hu = toU(hero), f = hero.face, y0 = r ? r.y : hero.y; let best = null, bd = 7;
  for (const o of robots) { if (o === r || o.dead || o.taxi || o.lift || o.onCloud || !reach(o) || robotHidden(o) || Math.abs(o.y - y0) > 1.5) continue; const du = (toU(o) + (o.sh || 0) - hu) * f; if (du > -0.3) continue; if (-du < bd) { bd = -du; best = o; } }
  return best;
}
function forkHookPull(r) {                // крюк летит назад — к роботу за спиной героя — и тащит его вперёд: в пойманного (или в того, кто на пути)
  const hu = toU(hero), f = hero.face, y0 = r ? r.y : hero.y; let best = null, bd = 7;
  for (const o of robots) { if (o === r || o.dead || o.taxi || o.lift || o.onCloud || !reach(o) || robotHidden(o) || Math.abs(o.y - y0) > 1.5) continue; const du = (toU(o) + (o.sh || 0) - hu) * f; if (du > -0.3) continue; if (-du < bd) { bd = -du; best = o; } }
  if (!best) { popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, text: 'за спиной никого', t: 0 }); sfx('RUN_1_13', 0.3, 0.5); return; }
  if (comboCounter('fhook', best, o => { o.stun = 0; o.aggro = 9; popups.push({ x: o.x, y: o.y + 1.15, z: o.z, text: 'Сорвался с крюка!', t: 0 }); showCombo('Робот раскусил приём — смени комбо', true); sfx('RobotHit4', 0.5, 0.6); })) return;
  best.stun = 2; best.atk = null; best.aggro = 0; best.kv = 0; sfx('RUN_1_13', 0.5, 1.6); knifeSound(false);
  if (hero.forkP) { go('ForkPull'); hero.forkP.pulling = true; }
  const du = r ? null : hu + f * 0.9;   // без цели: тащит к себе под ноги и дальше вперёд
  forkPulls.push({ o: best, r, t: 0, hook: 0, u0: toU(best), y0: best.y, d0: toD(best), tu: du, f }); showCombo('Вилка и крюк', false);
}function forkBlast(o, r) {                 // столкнулись: оба взрываются, героя взрыв не трогает
  hero.invuln = Math.max(hero.invuln, 1.3); hero.ride = null; game.hitStop = Math.max(game.hitStop || 0, 0.1); game.shake = Math.max(game.shake, 0.35);
  PLOG.kill = 'вилка и крюк'; o.why = r.why = 'вилка и крюк'; game.safeBlast = true; rageBlast(o); if (!r.dead) rageBlast(r); game.safeBlast = false; PLOG.kill = null; showCombo('Короткое замыкание!', false);
}
function updateForkPulls(dt) {
  updateZapBolts(dt); updateDrained(dt);
  for (const F of forkPulls) { F.t += dt; const o = F.o, r = F.r;
    if (o.dead || (r && r.dead)) { F.done = true; continue; }
    if (F.t < 0.22) { F.hook = F.t / 0.22; continue; }   // крюк летит
    if (!F.hop) { F.hop = true; hero.invuln = Math.max(hero.invuln, 1.3); if (hero.forkP) hero.forkP = null; if (hero.beam) { endBeam(); } hero.vy = CFG.jumpImpulse * 1.2; hero.vx = 0; hero.onGround = false; go('JumpInRun'); }   // герой подпрыгивает: робот пролетает под ним
    const ru = r ? toU(r) + (r.sh || 0) : F.tu, side = Math.sign(F.u0 - ru) || -F.f, tu = r ? ru + side * 0.55 : ru, k = Math.min(1, (F.t - 0.22) / 0.35), e = k * k;
    const cu = F.u0 + (tu - F.u0) * e; setUD(o, cu, F.d0 + ((r ? toD(r) : F.d0) - F.d0) * e); o.y = F.y0 + ((r ? r.y : F.y0) - F.y0) * e; o.tx = Math.round(o.x); o.tz = Math.round(o.z); o.stun = 1; o.tilt = -side * 0.4 * k;
    // кто попался на пути — в того и врезается
    for (const q of robots) { if (q === o || q === r || q.dead || q.taxi || q.lift || !reach(q) || robotHidden(q) || Math.abs(q.y - o.y) > 0.8) continue; const qu = toU(q) + (q.sh || 0); if ((qu - F.u0) * (tu - qu) > 0 && Math.abs(qu - cu) < 0.6) { F.done = true; go('Kulbit'); forkBlast(o, q); break; } }
    if (F.done) continue;
    if (k >= 1) { F.done = true; o.y = o.baseY = F.y0; if (r) { if (hero.vy < 3) hero.vy = 4; go('Kulbit'); forkBlast(o, r); } else { o.stun = 1.5; zapRobot(o, 3); } } }
  forkPulls = forkPulls.filter(F => !F.done);
}function drawForkPulls(b) {               // цепь крюка: от героя до притягиваемого робота
  for (const F of forkPulls) { const o = F.o, k = F.t < 0.22 ? F.hook : 1;
    const x0 = W / 2 + relU(hero, b) * S - hero.face * 0.1 * S, y0 = H / 2 - (hero.y + 0.42 - cam.y) * S, x1 = W / 2 + (relU(o, b) + (o.sh || 0)) * S, y1 = H / 2 - (o.y + 0.5 - cam.y) * S;
    const xe = x0 + (x1 - x0) * k, ye = y0 + (y1 - y0) * k, n = Math.max(2, Math.round(Math.hypot(xe - x0, ye - y0) / 6));
    for (let i = 0; i <= n; i++) { const t = i / n, x = Math.round(x0 + (xe - x0) * t), y = Math.round(y0 + (ye - y0) * t + Math.sin(t * Math.PI) * 6 * (1 - k)); ctx.fillStyle = i % 2 ? '#8f9ca5' : '#2a2226'; ctx.fillRect(x - 2, y - 2, 4, 4); }
    ctx.fillStyle = '#dfe6ea'; ctx.fillRect(Math.round(xe) - 4, Math.round(ye) - 4, 8, 8); }
}
function dropFork() {                     // слот оружия один: вилка падает у ног
  const d = toD(hero), u = toU(hero), o = { x: 0, y: hero.y + 0.45, z: 0, got: false, ph: rnd(0, 6), cool: 1.4, stat: (hero.wStats || {}).fork }; setUD(o, u - hero.face * 0.9, d);
  if (!floorCube(Math.round(u - hero.face * 0.9), Math.round(hero.y) - 1, d, 'any')) setUD(o, u, d); forkItem = o; hero.fork = false; if (hero.forkP) forkRelease(false);
}
function updateForkItem(dt) {
  const o = forkItem; if (!o) return; if (o.cool > 0) o.cool -= dt;
  if (!o.got && !(o.cool > 0) && hero.state !== 'dead' && !propHidden(o) && Math.abs(toU(o) - toU(hero)) < 0.45 && o.y > hero.y - 0.3 && o.y < hero.y + 0.95 && takeWeapon(o)) {
    o.got = true; if (hero.knife) { hero.knife = false; dropStyle('knife'); } if (hero.prom) { hero.prom = false; dropStyle('prom'); } hero.fork = true;
    (hero.wStats || (hero.wStats = {})).fork = o.stat || rollStat(); if (o.stat && !o.shown) { o.shown = true; popups.push({ x: o.x, y: o.y + 0.8, z: o.z, text: o.stat.txt, t: 0 }); }
    plog('взял', 'Вилка'); if (hero.fCharge === undefined) hero.fCharge = FORK_MAX; sfx('RUN_1_13', 0.5, 1.4); zapSound(0.3, 0.2); showCombo('Вилка: J — три удара, держать J — поток тока, F за спиной робота — вилка в гнездо', true); updateHUD(); }
}

// вилка в воде: бьёт током самого героя и всех, кто в этой же воде (лужа, бассейн, под струёй)
const inWater = () => puddles.some(p => p.in) || (hero.wetDrip || 0) > 2.3;
function waterShock() {
  if (talHas('f8')) return;   /* v312: «Изоляция» */
  if (game.time - (hero.shockAt || -9) < 0.8) return; hero.shockAt = game.time;
  zapBolt({ x: hero.x, y: hero.y + 0.9, z: hero.z }, { x: hero.x, y: hero.y, z: hero.z }, 0.2, 0.3); zapSound(0.7, 0.4);
  if (!(hero.invuln > 0)) { hurtHero(toU(hero) - hero.face, 'удар током в воде'); }
  const pd = puddles.find(p => p.in);
  for (const r of robots) { if (r.dead) continue; const inSame = (r.wet > 0) || (pd && Math.abs(r.x - pd.x) + Math.abs(r.z - pd.z) < 2.2 && Math.abs(r.y - pd.y) < 0.6);
    if (!inSame) continue; zapRobot(r, 3); r.stun = Math.max(r.stun || 0, 1.2); r.atk = null; game.melee = 'вода и ток'; damageRobot(r, CFG.hitDamage * 1.5, true); game.melee = null; }
}
// держать F за спиной робота — воткнуть вилку
function updatePlugHold(dt) {
  if (!hero.fork || !talOK('f4') || hero.forkP || hero.beam || !hero.onGround || ST[hero.st].lock) { hero.plugHold = null; return false; }
  if (!pressed.has('dodge')) return false;   /* нажал F — сразу втыкает; дальше держит F, чтобы выкачать ток */
  const tg = forkPlugTarget(); if (!tg) return false; pressed.delete('dodge'); game.dodgeBuf = 0; startForkPlug(tg); return true;
}
// ====================== УДАРЫ В ВИСЕ ======================
// Висишь на уступе или на зубце шестерни — J бьёт рукой, K ногой, L кидает кунай. Робот рядом (сверху на уступе, сбоку или снизу) получает удар;
// три удара подряд без паузы — комбо «С уступа»: сильный удар, робота отбрасывает.
function hangAttack(kind) {
  const hg = hero.hang; if (!hg || hg.pipe || hero.state === 'dead' || (hg.atkT || 0) > 0.12) return false;
  if (kind === 'kunai') { if (hero.kunai > 0 && typeof throwKunai === 'function') { throwKunai(); hg.atkT = 0.3; return true; } return false; }
  hero.hangN = game.time - (hero.hangAtkAt || -9) < 0.9 ? (hero.hangN || 0) + 1 : 1; hero.hangAtkAt = game.time; const big = hero.hangN >= 3;
  hg.atkT = kind === 'leg' ? 0.38 : 0.28; hg.atkSt = hero.st; go(kind === 'leg' ? 'JumpLegsAttack2' : 'HandAttack' + (1 + (hero.hangN - 1) % 3)); hero.anim.t = 0;
  sfx(kind === 'leg' ? 'RobotHit6' : 'RobotHit3', 0.35, 1.2); const hu = toU(hero); let hit = 0;
  for (const r of robots) { if (r.dead || !reach(r) || robotHidden(r) || r.lift || r.taxi) continue; const du = toU(r) + (r.sh || 0) - hu, dy = r.y - hero.y;
    if (Math.abs(du) > (kind === 'leg' ? 1.25 : 1.0) || dy < -1.3 || dy > 1.7) continue;
    if (shieldFront(r)) { shieldPing(r); continue; } hit++; const f = Math.sign(du) || hero.face;
    game.melee = big ? 'HangCombo' : kind === 'leg' ? 'HangKick' : 'HangPunch'; damageRobot(r, CFG.hitDamage * (big ? 2.2 : kind === 'leg' ? 1.2 : 0.9)); game.melee = null;
    if (!r.dead) { r.kv = f * (big ? 7 : 2); r.stun = Math.max(r.stun || 0, big ? 0.9 : 0.35); r.flashT = 0.12; if (hero.fork) r.shockT = Math.max(r.shockT || 0, 0.35); }
    burst(r.x, r.y + 0.5, r.z, { n: big ? 16 : 8, cols: SPARK.concat(['#ffffff']), sp: [1.5, 4.5], up: 1, life: 0.3, dir: f, size: 2 }); }
  if (hit) { game.hitStop = Math.max(game.hitStop || 0, big ? 0.08 : 0.04); game.shake = Math.max(game.shake, big ? 0.12 : 0.05);
    if (big) { popups.push({ x: hero.x, y: hero.y + 1.2, z: hero.z, text: 'С уступа!', t: 0 }); showCombo('Комбо: С уступа', false); plog('комбо', 'С уступа'); hero.hangN = 0; } }
  return true;
}
function hangAtkTick(dt) {             // после удара в висе — снова кадры виса
  const hg = hero.hang; if (!hg || !(hg.atkT > 0)) return; hg.atkT -= dt; if (hg.atkT <= 0) { hg.atkT = 0; go('Take'); }
}
// ====================== РОБОТЫ ======================
// v243: «let robots…» перенесено в ядро — src/06b_world.js
// Обломки после смерти остаются на карте: размеры по последнему кадру каждой анимации смерти.
const CORPSE = { S: { hw: 0.3, h: 0.72 }, A: { hw: 0.33, h: 0.48 }, B: { hw: 0.35, h: 0.48 }, D: { hw: 0.46, h: 0.3 }, C: { hw: 0.36, h: 0.45 } };
const DEATH_CLIP = { S: 'RobotAC_Stay', A: 'RobotAC_DeathA', B: 'RobotAC_DeathB', D: 'RobotAC_DeathD', C: 'RobotAC_Died' };
let deathBag = [], lastDeath = '';
function nextDeath() {            // все четыре смерти по кругу в случайном порядке, без двух одинаковых подряд
  if (!deathBag.length) { deathBag = ['A', 'B', 'C', 'D'].sort(() => Math.random() - 0.5); if (deathBag[deathBag.length - 1] === lastDeath) deathBag.reverse(); }
  return lastDeath = deathBag.pop();
}
const norm180 = a => ((a + 180) % 360 + 360) % 360 - 180;
// v243: popups, puffs — перенесено в ядро, src/06b_world.js
const angOf = (dx, dz) => Math.atan2(dx, dz) * 180 / Math.PI;   // угол направления в мире; 0 — на юг, туда же, куда смотрит камера с юга
// клетка, по которой робот может идти: есть куб под ногами и нет куба на его месте
const robotFloor = (cx, cz, y) => hasCube(cx, y - 1, cz) && !hasCube(cx, y, cz);
function spawnRobots() {
  jets = []; bolts = []; robots = LEVEL.robots.map(makeRobot); keyBots = robots.filter(r => r.key);
  { const tops = LEVEL.ringTops || [13, 23]; for (const r of robots) if (!r.loop && botH(r) >= 0 && r.y >= tops[0] - 0.1 && Math.abs(r.x) <= 8 && Math.abs(r.z) <= 8 && Math.random() < (r.y >= tops[1] - 0.1 ? 0.3 : 0.2)) r.shield = true; }   // щитоносцы: со второго яруса
  for (const r of robots) r.anim.play('RobotAC_Run');
}
// v296 (Алексей 25.10: «чем выше, тем боты немного сложнее, быстрее и с большим количеством навыков»). Высота робота: снаружи — его y,
// в комнатах — высота комплекса снаружи (alt), в стартовой комнате — особая: там робот вялый, без щита и навыков.
function botH(r) { if (r.y > 2400) { const c = complexAt(r.y), s = LEVEL.spawn || LEVEL.start; if (c && s && complexAt(s.y) === c) return -1; return c ? Math.max(0, c.alt || 0) : 2; } if (r.y > 900) return LEVEL.pelY || 32; return Math.max(0, r.y); }
// act — как охотно нападает (было tier: 0.55..1.5); spd — скорость (+1.5% за каждый куб высоты); rip — ответный удар, когда его бьют;
// dodge — уворот от удара героя; grab — перехват удара (за шею и об пол); kick — перехват, когда герой стоит на нём и бьёт ногой; cd — навыки чаще
function botDiff(r) { const L = (game.level || 1) - 1, h = botH(r);
  if (h < 0) return { start: true, act: 0.42, spd: 1, rip: 0, dodge: 0, grab: 0, kick: 0, cd: 0.8, rng: 0 };
  const k = dcHas('height') ? Math.min(54, h * 1.6) : Math.min(36, h);   /* v303 (Алексей: «высоко, а робот редко бьёт, редко перехватывает, не бьёт паром и снарядами, не прыгает»; «со второго уровня после колена — отъезжает назад, увернувшись»): всё круче растёт с высотой */
  return { act: (0.46 + 0.06 * Math.max(0, k - 2)) * Math.pow(1.12, L), spd: (1 + 0.015 * k) * Math.pow(1.03, L) * (dcHas('fastbots') ? 1.5 : 1), rip: Math.min(0.55, 0.06 + 0.014 * k + 0.03 * L), dodge: Math.min(0.4, 0.02 + 0.005 * k + (L >= 1 && h > (LEVEL.shinTop || 10) ? 0.14 + 0.03 * L : 0)), grab: Math.min(0.3, 0.015 + 0.007 * k + 0.015 * L), rng: Math.min(1, k / 26), kick: Math.min(0.6, 0.06 + 0.011 * k + 0.03 * L), cd: 1 + 0.02 * k + 0.1 * L }; }
const LVK = () => Math.pow(1.15, (game.level || 1) - 1), tier = r => botDiff(r).act, tierOld = r => LVK() * (r.y < 13 && r.y > -20 ? 0.55 + 0.45 * Math.max(0, r.y) / 13 : 1 + 0.5 * Math.min(1, Math.max(0, r.y) / 38));   // v230: на первом ярусе роботы вялые — новичок осваивается; выше — злее
function makeRobot(p) {
  return ({ x: p.x, y: p.y, z: p.z, baseY: p.y, hw: 0.28, hp: Math.round(CFG.robotHP * LVK() * (1 + 0.01 * Math.max(0, Math.min(36, botH(p)))) * ((typeof dcHas === 'function' && dcHas('tough')) ? 2 : 1)), shield: (typeof dcHas === 'function' && dcHas('shield')),   /* v296: выше — крепче, +1% за куб */ dir: 1, anim: new Anim(),
    mode: 'walk', t: rnd(3, 8), dead: false, box: null, hitT: 0, flashT: 0, coolT: 0, clipT: 0, turnWait: 0, alert: 0,
    hx: p.h[0], hz: p.h[1], tx: p.x, tz: p.z, hadWall: true, fa: 0, R: p.R, F: p.F, loop: !!p.loop, ccw: !!p.ccw, hide: 1, sh: 0, key: !!p.key });
}
// Робот идёт от клетки к клетке и держится края по правую руку: дошёл до угла — поворачивает и уходит на другую сторону титана.
// Робот на боковой и дальней стороне рисуется сдвинутым к стене (корпусу или башне): на экране он подходит к её углу и заходит за него.
// R — на каком расстоянии от середины идёт его дорожка, F — где край стены. Чем глубже робот ушёл, тем ближе к стене он нарисован.
// Робот-обходчик на боковой и дальней стороне рисуется сдвинутым к стене ноги: на экране он подходит к её углу и заходит за него.
function robotShift(r) {
  if (r.dead || !r.loop) return 0;
  const U = toU(r), g = toD(r), aU = Math.abs(U);
  /* v311 (Алексей: «боты за угол не заходят — бегут и исчезают»): за угол — это за ребро стены. Пока робот впереди грани стены (|u| − 1), он стоит на месте;
     как только ушёл глубже грани — съезжает вбок за её ребро (на клетку за 0.7 куба глубины), и стена закрывает его постепенно (robotClip), целиком — robotOcc */
  const lim = Math.abs(r.hx * view.n[0] + r.hz * view.n[1]) > 0.5 && g < aU - 0.5 ? aU - Math.max(0, Math.min(1, (aU - 0.9 - g) / 0.7)) : 99;
  const L = lim + (r.R + 1 - Math.min(lim, r.R + 1)) * (1 - r.hide);   // пока везёт героя — идёт на виду
  return Math.max(-L, Math.min(L, U)) - U;
}
function robotNext(r) {
  const cx = r.tx, cz = r.tz, free = d => robotFloor(cx + d[0], cz + d[1], r.baseY);
  const hd = r.ccw ? -1 : 1, F = [r.hx, r.hz], R = [-r.hz * hd, r.hx * hd], L = [r.hz * hd, -r.hx * hd], B = [-r.hx, -r.hz];   // ccw — обходит ногу в обратную сторону
  // обходчик держится края по правую руку и на углу поворачивает; остальные ходят туда-сюда по своему уступу
  const nh = r.loop ? (free(R) && r.hadWall ? R : free(F) ? F : free(L) ? L : free(R) ? R : free(B) ? B : null) : (free(F) ? F : free(B) ? B : null);
  if (!nh) { r.mode = 'wait'; r.t = 2; return; }
  r.hx = nh[0]; r.hz = nh[1]; r.hadWall = !free([-nh[1] * hd, nh[0] * hd]); r.tx = cx + nh[0]; r.tz = cz + nh[1];
}
function coolRobot(r) {                 // вода остудила: ярость сходит, робот снова обычный и не взрывается
  r.rage = 0; r.hunter = false; r.aggro = 0; r.atk = null; r.charge = 0; r.atkCool = 1.5; r.mode = 'wait'; r.t = 1.2; r.flashT = 0.25; sfx('RUN_1_13', 0.6, 0.45); showCombo('Остыл', true);
  burst(r.x, r.y + 0.5, r.z, { n: 22, cols: SMOKE.concat(['#eefcff', '#bfeaf2']), sp: [0.4, 1.8], up: 1.6, g: 0, drag: 2, life: 0.9, size: 2 });
}
function enrage(r) {                    // взбесился: 10 секунд неуязвим, гонится за героем и бьёт, потом взрывается
  if (r.dead || r.rage > 0) return;
  r.rage = 10; r.loop = false; r.atk = null; r.charge = 0; r.foe = null; r.hitT = 0; r.atkCool = 0.4; r.burn = 0; r.flashT = 0.3;
  popups.push({ x: r.x, y: r.y + 1.1, z: r.z, text: 'Взбешён!', t: 0 }); sfx('RobotDeathD', 0.6, 1.7); game.shake = Math.max(game.shake, 0.08);
  burst(r.x, r.y + 0.4, r.z, { n: 14, cols: ['#ff3a1a', '#ff7014', '#c0392b'], sp: [1, 3.5], life: 0.5 });
}
function rageBlast(r) { r.why = 'взорвался сам';
  r.rage = 0; booms.push({ x: r.x, y: r.y + 0.4, z: r.z, t: 0 }); booms.push({ x: r.x + 0.25 * view.r[0], y: r.y + 0.6, z: r.z + 0.25 * view.r[1], t: 0 }); booms.push({ x: r.x - 0.25 * view.r[0], y: r.y + 0.2, z: r.z - 0.25 * view.r[1], t: 0 });
  burst(r.x, r.y + 0.4, r.z, { n: 30, cols: ['#ffce46', '#ff7014', '#fff3c4', '#c0392b', '#3a2f36'], sp: [1.5, 6], life: 0.8, size: 2 }); game.shake = Math.max(game.shake, 0.25); sfx('RobotDeathB', 0.9, 0.8); sfx('RobotDeathD', 0.6, 0.6);
  const ru = toU(r) + (r.sh || 0);
  if (!game.safeBlast && hero.state !== 'dead' && !hero.inDoor && Math.abs(toD(hero) - toD(r)) <= 1.1 && Math.abs(toU(hero) - ru) < 1.4 && Math.abs(hero.y - r.y) < 1.4) { if (hero.ride && hero.ride.r === r) hero.ride = null; hurtHero(ru); igniteHero(); }
  for (const o of robots) if (o !== r && !o.dead && Math.hypot(o.x - r.x, o.z - r.z) < 1.5 && Math.abs(o.y - r.y) < 1.2) robotHurtRobot(o, 25, Math.sign(toU(o) - ru) || 1);
  r.hp = 0; damageRobot(r, 1, true);
}
// ---------- голова с плеч. Завершающий удар серии или удар в спину с шансом срывает роботу голову: герой одной ногой сносит её,
// второй — отправляет в ближайшего робота. Голова в полёте вертится; безголовый корпус искрит, шатается и взрывается
const FINISHERS = new Set(['HandAttack3', 'LegsAttackUp2', 'JumpLegsAttack', 'JumpLegsAttack2', 'LegsAttackKunai', 'LegsAttackUp']);
// v243: «let heads…» перенесено в ядро — src/06b_world.js
function headSprite() {
  if (headCv) return headCv; const src = cut.RobotStay_0; if (!src) return null;
  headCv = document.createElement('canvas'); headCv.width = 25; headCv.height = 11; headCv.getContext('2d').drawImage(src, 35, 4, 25, 11, 0, 0, 25, 11); return headCv;
}
function startHeadRip(r) {
  hero.headNext = -9;
  r.headJob = true; r.atk = null; r.charge = 0; r.stun = 2.6; r.aggro = 0; r.foe = null; hero.headJob = { r, head: null, st: hero.onGround ? 'LegsAttackUp' : 'JumpLegsAttack2' };   // в воздухе — серия ногами с зависанием: герой не падает, пока не добьёт
  hero.face = Math.sign(toU(r) + (r.sh || 0) - toU(hero)) || hero.face; hero.vx = 0; hero.invuln = Math.max(hero.invuln, 1.3); hero.headJob.pending = true;   // сам удар запускается на следующем шаге: сейчас мы внутри события текущей анимации
  game.hitStop = Math.max(game.hitStop, 0.07); r.flashT = 0.2; sfx('RobotHit5', 0.6, 1.4);
}
function headTarget(src) {              // в кого полетит голова: ближайший робот, сначала из тех, кто перед героем и примерно на его высоте
  const hu = toU(hero); let best = null, bd = 11;
  for (const o of robots) { if (o === src || o.dead || o.headless || !reach(o) || robotHidden(o)) continue; const ddu = toU(o) + (o.sh || 0) - hu, dd = Math.hypot(ddu, o.y - hero.y) + (ddu * hero.face < 0 ? 4 : 0) + Math.abs(o.y - hero.y) * 0.8; if (dd < bd) { bd = dd; best = o; } }
  return best;
}
function headPop() { plog('голова', 'нога');
                    // первая нога: голова слетает с плеч и взлетает перед героем
  const J = hero.headJob, r = J.r; if (r.dead || robots.indexOf(r) < 0) { hero.headJob = null; return; }
  r.headless = true; r.headJob = false; r.stun = 2.2; r.sq = -0.2; r.sqV = 0;
  { const tg = headTarget(r), f2 = tg ? Math.sign(toU(tg) + (tg.sh || 0) - toU(hero)) || hero.face : hero.face; if (f2 !== hero.face) { hero.face = f2; hero.anim.flip = !hero.anim.flip; hero.lk = null; } }
  J.head = { x: r.x, y: r.y + 0.7, z: r.z, x0: r.x, y0: r.y + 0.7, z0: r.z, state: 'pop', t: 0, ang: 0, spin: -hero.face * 9, src: r }; heads.push(J.head);
  popups.push({ x: r.x, y: r.y + 1.15, z: r.z, text: 'Голову с плеч!', t: 0 }); game.hitStop = Math.max(game.hitStop, 0.09); game.shake = Math.max(game.shake, 0.1); sfx('RobotHit4', 0.8, 0.8); sfx('RobotDeathB', 0.4, 1.6);
  burst(r.x, r.y + 0.68, r.z, { n: 16, cols: SPARK.concat(['#2c2c30', '#55555c']), sp: [1.2, 4], up: 2.2, life: 0.45 });
}
function headKick() {                   // вторая нога: голова летит в ближайшего робота, а если никого нет — просто вперёд
  const J = hero.headJob; hero.headJob = null; const h = J && J.head; if (!h || h.state !== 'pop') return;
  const d = toD(hero), u0 = toU(h), best = headTarget(h.src);
  if (!best || Math.hypot(toU(best) + (best.sh || 0) - toU(hero), best.y - hero.y) > 5) { h.state = 'fall'; h.t = 0; h.vu = hero.face * 3.2; h.vy = 1.2; h.rx = view.r[0]; h.rz = view.r[1]; h.d = d; h.spin = hero.face * 14; setUD(h, u0, d); sfx('RobotHit1', 0.6, 1.3); return; }   // бить не в кого
  let du = hero.face, dy = 0.12; if (best) { du = toU(best) + (best.sh || 0) - u0; dy = best.y + 0.42 - h.y; }
  if (Math.abs(dy) > Math.abs(du) * 0.75) dy = Math.sign(dy) * Math.abs(du) * 0.75;                        // круче 37° нога не бьёт — иначе удар и полёт головы не сходятся
  { const f2 = Math.sign(du) || hero.face; if (f2 !== hero.face) { hero.face = f2; hero.anim.flip = !hero.anim.flip; } }   // цель за спиной — герой разворачивается к ней этим же ударом
  const n = Math.hypot(du, dy) || 1;
  h.state = 'fly'; h.t = 0; h.vu = du / n * 12; h.vy = dy / n * 12; h.rx = view.r[0]; h.rz = view.r[1]; h.d = d; h.spin = (du >= 0 ? 1 : -1) * 26; h.tgt = best; h.trail = 0;
  setUD(h, u0, d); game.hitStop = Math.max(game.hitStop, 0.06); sfx('RobotHit1', 0.8, 1.5); sfx('RUN_1_13', 0.5, 2.2); burst(h.x, h.y, h.z, { n: 8, cols: SPARK, dir: Math.sign(du), sp: [1.5, 4], life: 0.25 });
}
function updateLiuKang(dt) {
  if (hero.st !== 'JumpLegsAttack2' || hero.state === 'dead' || view.rotating) { hero.lk = null; return; }
  const hu = toU(hero), d = toD(hero);
  if (!hero.lk || hero.lk.dead || robots.indexOf(hero.lk) < 0) { let best = null, bd = 1e9;
    for (const o of robots) { if (o.dead || o.headless || !reach(o) || robotHidden(o)) continue; const du = toU(o) + (o.sh || 0) - hu, dy = o.y - hero.y; if (du * hero.face < -0.2 || Math.abs(du) > 1.5 || dy > 0.9 || dy < -1.1) continue; const sc = Math.abs(du) + Math.abs(dy) * 0.7;   // только тот, кто уже почти под ногой
      if (sc < bd) { bd = sc; best = o; } }
    hero.lk = best; }
  const o = hero.lk; if (!o) return;
  const wantU = toU(o) + (o.sh || 0) - hero.face * 0.4, wantY = o.y + 0.1, mu = Math.max(-2.6 * dt, Math.min(2.6 * dt, (wantU - hu) * 6 * dt)), my = Math.max(-2.2 * dt, Math.min(2.2 * dt, (wantY - hero.y) * 6 * dt));   // подтягивает плавно: чем ближе, тем медленнее
  if (!overlapsDepth(hu + mu, hero.y + 0.03, hero.hw, hero.h - 0.06, d)) setUD(hero, hu + mu, d); if (!overlapsDepth(toU(hero), hero.y + my + 0.03, hero.hw, hero.h - 0.06, d)) hero.y += my;
  hero.vx = 0; hero.vy = 0; if (!o.headJob && !o.headless && !(o.rage > 0)) { o.mode = 'wait'; o.t = Math.max(o.t || 0, 0.25); }   // робот под градом ударов не уходит
}
function updateHeads(dt) {
  updateLiuKang(dt);
  if (hero.headJob && hero.headJob.pending) { hero.headJob.pending = false; hero.headJob.st = hero.onGround ? 'LegsAttackUp' : 'JumpLegsAttack2'; go(hero.headJob.st); }
  else if (hero.headJob && hero.st !== hero.headJob.st) hero.headJob = null;      // героя сбили — удара второй ногой не будет
  for (const h of heads) { h.t += dt; h.ang += h.spin * dt;
    if (h.state === 'pop') { const k = Math.min(1, h.t / 0.42), tx = hero.x + hero.face * 0.36 * view.r[0], tz = hero.z + hero.face * 0.36 * view.r[1], ty = hero.y + 0.42;
      h.x = h.x0 + (tx - h.x0) * k; h.z = h.z0 + (tz - h.z0) * k; h.y = h.y0 + (ty - h.y0) * k + 0.75 * Math.sin(Math.PI * Math.min(1, h.t / 0.5)) * (1 - 0.35 * k);
      if (h.t > 0.75) { h.state = 'fall'; h.vu = 0; h.vy = 0; h.rx = view.r[0]; h.rz = view.r[1]; h.t = 0; } }
    else if (h.state === 'fly') { h.x += h.rx * h.vu * dt; h.z += h.rz * h.vu * dt; h.y += h.vy * dt; h.trail -= dt;
      if (h.trail <= 0) { h.trail = 0.03; burst(h.x, h.y, h.z, { n: 1, cols: ['#ff7014', '#ffce46', '#fff4e1'], sp: [0.1, 0.6], g: 1, life: 0.3 }); }
      const u = toU(h); let hit = null;
      for (const o of robots) if (o !== h.src && !o.dead && !o.headless && reach(o) && Math.abs(u - toU(o) - (o.sh || 0)) < 0.34 && h.y > o.y + 0.05 && h.y < o.y + 0.8) { hit = o; break; }
      if (hit) { const dir = Math.sign(h.vu) || 1; PLOG.kill = 'головой робота'; damageRobot(hit, CFG.hitDamage * 5, true); PLOG.kill = ''; if (!hit.dead) { hit.kv = dir * 7; hit.aggro = 9; }
        popups.push({ x: hit.x, y: hit.y + 1.1, z: hit.z, text: 'Головой!', t: 0 }); game.hitStop = Math.max(game.hitStop, 0.1); game.shake = Math.max(game.shake, 0.14); sfx('RobotHit6', 0.9, 0.7); sfx('RobotDeathB', 0.5, 1.3);
        burst(h.x, h.y, h.z, { n: 18, cols: SPARK.concat(['#2c2c30', '#8a8a92']), sp: [1.5, 5], life: 0.4 }); h.state = 'fall'; h.t = 0; h.vu = -dir * 2.2; h.vy = 3.4; }
      else if (h.t > 0.05 && overlapsDepth(u, h.y, 0.08, 0.08, h.d)) { burst(h.x, h.y, h.z, { n: 10, cols: SPARK, sp: [1, 3.5], life: 0.3 }); sfx('RobotHit3', 0.6, 1.2); h.state = 'fall'; h.t = 0; h.vu = -Math.sign(h.vu) * 2; h.vy = 2.6; }
      else if (h.t > 1.1) { h.state = 'fall'; h.t = 0; h.vu *= 0.35; } }
    else if (h.state === 'rest') { if (h.t > 2.5) h.gone = true; }
    else { h.vy -= 16 * dt; const ny = h.y + h.vy * dt, dd = h.d === undefined ? toD(h) : h.d, u = toU(h);
      if (h.vy < 0 && overlapsDepth(u, ny - 0.06, 0.08, 0.08, dd)) { if (h.vy < -3) { h.vy = -h.vy * 0.35; h.vu *= 0.5; h.spin *= 0.5; sfx('RobotHit3', 0.3, 1.6); } else { h.state = 'rest'; h.t = 0; h.spin = 0; h.ang = Math.round(h.ang / Math.PI) * Math.PI; h.y = Math.floor(ny - 0.06) + 1 + 0.055; } }   // упала на пол: подпрыгнула и легла
      else { h.y = ny; if (!overlapsDepth(u + h.vu * dt, h.y, 0.08, 0.08, dd)) { h.x += h.rx * h.vu * dt; h.z += h.rz * h.vu * dt; } else h.vu = -h.vu * 0.4; }
      if (h.t > 6 || h.y < -3) h.gone = true; }
  }
  if (heads.some(h => h.gone)) heads = heads.filter(h => !h.gone);
}
function drawHead(h, b) {
  const cv = headSprite(); if (!cv) return; const k = S / 100, px = W / 2 + relU(h, b) * S, py = H / 2 - (h.y - cam.y) * S;
  ctx.save(); ctx.translate(Math.round(px), Math.round(py)); ctx.rotate(h.ang); ctx.imageSmoothingEnabled = false; ctx.drawImage(cv, -12.5 * k, -5.5 * k, 25 * k, 11 * k); ctx.restore(); ctx.imageSmoothingEnabled = true;
}
function headlessBoom(r) { plog('убит', 'без головы');
              // безголовый корпус недолго шатается и взрывается
  dropArmor(r);
  robots = robots.filter(o => o !== r); for (const k of kunais) if (k.in === r) { k.in = null; k.state = 'fly'; k.drop = true; k.vy = 0; k.t = 1; k.fx = 0; }
  if (hero.ride && hero.ride.r === r) { hero.ride = null; go('Fly'); } if (hero.standOn === r) hero.standOn = null;
  booms.push({ x: r.x, y: r.y + 0.35, z: r.z, t: 0 }); sfx('RobotDeathB', 0.8, 1.1); sfx('RobotDeathD', 0.5, 0.9); game.shake = Math.max(game.shake, 0.14);
  burst(r.x, r.y + 0.3, r.z, { n: 26, cols: ['#2c2c30', '#55555c', '#8a8a92', '#ff7014', '#ffce46'], sp: [1.5, 5.5], up: 2.4, life: 0.9, size: 2 }); updateHUD();
}
const shieldFront = r => { if (!r.shield || r.dead || r.headless || r.stun > 0) return false; if (hero.tele || hero.rip || hero.dive || hero.y > r.y + 0.5) return false; const side = Math.sign(toU(hero) - toU(r) - (r.sh || 0)), f = r.atk ? r.face : r.dir; return side !== 0 && side === f; };
function shieldPing(r) { const f = r.atk ? r.face : r.dir, x = r.x + (r.sh || 0) * view.r[0] + f * 0.36 * view.r[0], z = r.z + (r.sh || 0) * view.r[1] + f * 0.36 * view.r[1]; r.shT = 0.38; burst(x, r.y + 0.42, z, { n: 9, cols: ['#ffffff', '#c4e2ff', '#8fb4d8'], dir: f, sp: [1.5, 4.5], life: 0.3 }); sfx('RobotHit3', 0.6, 2.3); knifeSound(true);
  if (!(r.shMsg > game.time)) { r.shMsg = game.time + 1.5; popups.push({ x: r.x, y: r.y + 1.15, z: r.z, text: 'Щит!', t: 0 }); PLOG.n['щит'] = (PLOG.n['щит'] || 0) + 1; } }
function damageRobot(r, dmg, noAggro) { r.hitAt = game.time; if (game.melee) { const w = heroWpn(); if (w) dmg *= w.dmg; if (hero.prom && r.burn > 0 && talHas('p5')) dmg *= 1.33; }   /* v312: «Жар» */ if (hero.sneakT > 0 && !noAggro) { hero.sneakT = 0; hero.passT = Math.min(hero.passT || 0, 0.3); }
  if (r.dead) return;
  if (!noAggro && shieldFront(r) && hero.knife && talHas('k5') && game.melee && /^(Knife|JumpKnife|HandAttack|SitAttack)/.test(game.melee)) { r.shCut = (r.shCut || 0) + 1; if (r.shCut >= 2) { r.shield = false; r.shCut = 0; shieldPing(r); popups.push({ x: r.x, y: r.y + 1.3, z: r.z, text: 'Щит вскрыт!', t: 0 }); sfx('RobotHit6', 0.5, 1.3); } }   /* v312: «Вскрыть щит» */
  if (!noAggro && shieldFront(r)) { shieldPing(r); r.aggro = Math.max(r.aggro || 0, 3); return; }   // щит спереди: бить сзади, сверху, телепортом или рвать шнур
  game.quietT = 0;
  if (r.headJob || r.headless) { r.flashT = 0.06; return; }
  if (game.melee && !noAggro && botReact(r)) return;   // v296: робот ответил на удар — перехватил, увернулся (удар не прошёл)
  if (r.rage > 0 && !r.hunter) { r.flashT = 0.06; sfx('RobotHit3', 0.3, 1.9); const q0 = Math.sign(toU(r) - toU(hero)) || 1; burst(r.x - q0 * 0.2 * view.r[0], r.y + 0.4, r.z - q0 * 0.2 * view.r[1], { n: 4, cols: ['#fff4e1', '#ff7014'], sp: [1, 2.5], life: 0.25 }); return; }   // взбешённого не пробить
  if (!noAggro && !r.hunter && !hero.tele && Math.random() < Math.min(0.07, 0.025 + 0.005 * ((game.level || 1) - 1)) * (dcHas('rage') ? 3 : 1)) { enrage(r); return; }
  // робот ещё не повернулся к герою после поворота мира: удар сбоку вдвое сильнее, в спину — втрое
  const ay = Math.abs(norm180(r.fa - view.k * 90)); let mult = ay > 135 ? CFG.critBack : ay > 45 ? CFG.critSide : 1;
  const behind = !noAggro && mult === 1 && !r.atk && (toU(hero) - toU(r) - (r.sh || 0)) * (r.face || r.dir) < 0;   // герой бьёт в спину идущему роботу
  if (behind) mult = 2;
  if (!noAggro && game.melee && hero.counterBuff > game.time) { mult *= 2; hero.counterBuff = 0; popups.push({ x: r.x, y: r.y + 1.2, z: r.z, text: 'Контрудар ×2', t: 0 }); }   /* v301 */
  const legTest = game.headMode && game.melee && game.melee.indexOf('Legs') >= 0 && ++game.legHits % 2 === 0;   // проверочный режим (Y): каждый второй удар ногой
  if (game.melee && game.melee.indexOf('Legs') >= 0 && !noAggro && !r.hunter && !hero.headJob && !r.lift && !r.onCloud && !r.taxi && (legTest || (game.time - (hero.headNext || -9) < 1.0 && Math.abs(toU(r) + (r.sh || 0) - toU(hero)) < 0.85) || ((mult > 1 || FINISHERS.has(game.melee)) && Math.random() < (CFG.headChance || 0.15)))) { startHeadRip(r); return; }
  if (mult > 1) { popups.push({ x: r.x, y: r.y + 1.0, z: r.z, text: (ay > 135 || behind ? 'В спину ×' : 'Сбоку ×') + mult, t: 0 }); r.flashT = 0.2; } else r.flashT = 0.09;
  if (game.melee === 'JumpLegsAttack2') { const aw = Math.sign(toU(r) - toU(hero)) || 1, q = at(r, -aw * 0.2); r.flashT = 0.16; game.hitStop = Math.max(game.hitStop, 0.06); game.shake = Math.max(game.shake, 0.09);
    burst(q.x, r.y + 0.45, q.z, { n: 18, cols: SPARK.concat(['#fff4e1', '#ffffff']), dir: aw, sp: [2, 6.5], life: 0.38 }); burst(q.x, r.y + 0.45, q.z, { n: 8, cols: ['#2c2c30', '#8a8a92', '#55555c'], dir: aw, sp: [1, 3.5], up: 1.6, life: 0.6, size: 2 });
    }
  if (!noAggro) { r.aggro = 9; r.atkCool = Math.min(r.atkCool || 0, 0.5); r.foe = null; }   // ударили — разворачивается и нападает всерьёз
  r.hp -= dmg * mult * (noAggro ? 1 : CFG.heroDmg || 1.3); r.sq = mult > 1 ? -0.2 : -0.13; r.sqV = 0;
  game.hitStop = Math.max(game.hitStop, mult > 1 ? 0.09 : 0.045); game.shake = Math.max(game.shake, mult > 1 ? 0.1 : 0.045);
  const away = Math.sign(toU(r) - toU(hero)) || 1; if (!noAggro) { r.face = -away; r.dir = -away; }   // получил удар — теперь смотрит на героя
  { const q = at(r, -away * 0.18);     // искры и дымок в точке удара
    
    burst(q.x, r.y + 0.42, q.z, { n: mult > 1 ? 12 : 6, cols: SPARK, dir: -away, sp: [1.5, 4], life: 0.3 }); }
  if (r.hp <= 0) {
    plog('убит', hero.rip ? 'шнур' : game.melee || PLOG.kill || r.why || (r.burn > 0 ? 'огонь' : r.drop || r.sfall ? 'упал' : 'другое')); r.dead = true; if (hero.rip || game.melee || PLOG.kill) dropArmor(r); if (!r.bomb && !r.ram && !r.taxi && Math.random() < (game.cogTest !== undefined ? game.cogTest : dcHas('cogs') ? 0.3 : 0.6)) spawnCog(r.x + (r.sh || 0) * view.r[0], r.y + 0.6, r.z + (r.sh || 0) * view.r[1]);   /* v301: шестерёнка из бота */ r.fade = 1; r.kind = r.forceKind || nextDeath(); r.dir = Math.random() < 0.5 ? 1 : -1;
    for (const k of kunais) if (k.in === r) { k.in = null; k.state = 'fly'; k.drop = true; k.vy = 0; k.t = 1; k.fx = 0; }   // кунаи, торчавшие в роботе, падают на землю вместе с ним   // обломки ложатся то в одну, то в другую сторону
    r.anim.play(DEATH_CLIP[r.kind], { loop: false, restart: true }); if (r.kind !== 'S') sfx('RobotDeath' + (r.kind === 'C' ? pick(['A', 'B', 'D']) : r.kind), 0.8);
  } else {
    r.hitT = CL.RobotAC_TakeHit.len; r.alert = 0.5;   // получил удар — на миг замирает лицом к камере
    r.anim.play('RobotAC_TakeHit', { loop: false, restart: true }); sfx('RobotHit' + (1 + Math.floor(Math.random() * 6)), 0.7, rnd(0.95, 1.05));
  }
}
// v296 (Алексей 25.10: «чем выше, тем чаще отвечают ударом, чаще уворачиваются, чаще перехватывают твои удары; стоишь на роботе и бьёшь
// ногой — шанс, что он перехватит рукой и ударит об землю»). Кидается раз на удар героя (не чаще раза в 0.7 с на робота).
function botReact(r) {
  if (r.dead || ((r.rage > 0 || r.hunter) && !r.fierce) || r.lift || r.onCloud || r.taxi || r.headJob || r.headless || r.bossMin || r.atk || r.stun > 0 || hero.grab || hero.state === 'dead' || game.grabTest !== undefined) return false;
  if (game.time < (r.reactT || 0)) return false; r.reactT = game.time + (r.fierce ? 0.45 : 0.7); let D = botDiff(r); if (D.start && !r.fierce) return false;
  if (r.fierce) D = Object.assign({}, D, { grab: r.clone ? 0 : Math.max(D.grab, 0.22), dodge: Math.max(D.dodge, 0.3), rip: Math.max(D.rip, 0.5), kick: r.clone ? 0 : Math.max(D.kick, 0.4) });   /* клон не хватает за шею — это приём робота */   /* v312: злые с камеры и клон — перехватывают, уворачиваются, отвечают */
  const hu = toU(hero), ru = toU(r) + (r.sh || 0), toH = Math.sign(hu - ru) || 1, sees = (r.face || r.dir) * toH > 0 || hero.standOn === r;
  const F = game.reactForce;   // для проверок: 'grab' | 'dodge' | 'rip' | 'kick' | 'none'
  if (hero.standOn === r && /Legs|Stomp/.test(game.melee) && canHead0(r) && (F ? F === 'kick' : Math.random() < D.kick)) { plog('перехват', 'стоял на роботе, удар ногой (шанс ' + Math.round(D.kick * 100) + '%)'); startGrab(r, false); showCombo('Робот сдёрнул с себя — бьёт об землю', true); return true; }
  if (!sees || hero.standOn === r || hero.ride) return false;
  const q = F ? (F === 'grab' ? 0 : F === 'dodge' ? D.grab : 1) : Math.random();
  if (q < D.grab && canHead(r)) { plog('перехват', 'удар (шанс ' + Math.round(D.grab * 100) + '%)'); startGrab(r, false); return true; }
  if (q < D.grab + D.dodge) { const L2 = robotLanding(r, ru - toH * 1.6, r.y);   // отскок назад
    if (L2 && Math.abs(L2.y - r.y) < 1.1) { robotStartAtk(r, 'jump', -toH, L2); if (r.atk) { r.atk.evade = true; r.atk.t = Math.max(r.atk.t, 0.2); }   /* отскок — сразу, без долгого приседа */ r.face = r.dir = toH; popups.push({ x: r.x, y: r.y + 1.1, z: r.z, text: 'Увернулся', t: 0 }); sfx('RUN_1_13', 0.4, 1.3); plog('робот', 'увернулся'); r.ripT = 0.55; return true; } }
  if (F ? F === 'rip' : Math.random() < D.rip) r.ripT = 0.2;   // удар прошёл, но робот сразу бьёт в ответ
  return false;
}
function robotCanStep(r, nu, d) {
  const lead = Math.round(nu + Math.sign(nu - toU(r)) * r.hw);
  if (!floorCube(lead, r.baseY - 1, d, 'same')) return false;
  if (overlapsDepth(nu, r.baseY, r.hw, 0.6, d)) return false;
  for (const c of robots) if (c.box && c !== r && Math.abs(toD(c) - d) <= DEPTH_TOL) {   // слишком высокая груда — стена и для роботов
    const top = c.y + c.box.h; if (top <= r.y + STEP_UP || r.y + 0.6 <= c.y) continue;
    const cu = toU(c), sum = r.hw * 0.6 + c.box.hw;
    if (Math.abs(nu - cu) < sum && Math.abs(nu - cu) < Math.abs(toU(r) - cu)) return false;
  }
  return true;
}
function robotAnim(r, name) {   // не дёргаем клип чаще, чем раз в 0.35 с: кадры бега и стойки нарисованы с разным сдвигом
  if (r.anim.name === name) { r.clipT = 0.35; return; }
  if (r.clipT > 0 && /Run|Stay/.test(r.anim.name) && !(name === 'RobotAC_Run' && r.anim.name !== 'RobotAC_Run')) return;   /* v303: в бег — сразу (иначе шёл в позе стойки — «плывёт»); из бега в стойку — не чаще 0.35 с */
  r.anim.play(name); r.clipT = 0.35;
}
// Атаки роботов: вблизи бьёт кулаком, если герой над ним — подпрыгивает, издали стреляет огненным лучом (поджигает) или выпускает пар (обжигает и сносит)
// v243: «let jets…» перенесено в ядро — src/06b_world.js
function robotLineLen(r, dir, max) {   // докуда долетит луч: до первого куба на его дорожке
  const u0 = toU(r) + (r.sh || 0), d = toD(r); let L = 0.2;
  while (L < max && !overlapsDepth(u0 + dir * (L + 0.2), r.y + 0.3, 0.04, 0.12, d)) L += 0.2;
  return L;
}
function robotLanding(r, wantU, wantY, big) {   // куда робот может перепрыгнуть: клетка на его же дорожке, до трёх кубов в сторону, на куб выше или до пяти ниже
  const cx = Math.round(r.x), cz = Math.round(r.z), ax = Math.abs(r.hx) > 0.5 ? [1, 0] : [0, 1]; let best = null;
  const out = ax[0] ? [0, Math.sign(cz)] : [Math.sign(cx), 0];   // вниз можно спрыгнуть и на внешнюю дорожку — со стены на ступню
  for (let o = big ? -1 : 0; o <= 1; o++) for (let k = -3; k <= 3; k++) { if (!k && !o) continue; const x = cx + ax[0] * k + out[0] * o, z = cz + ax[1] * k + out[1] * o;   // взбешённый прыгает выше и на соседнюю дорожку в обе стороны
    for (let ty = r.baseY + (big ? 3 : o ? -1 : 1); ty >= r.baseY - 5; ty--) {
      if (!hasCube(x, ty - 1, z) || hasCube(x, ty, z) || hasCube(x, ty + 1, z)) continue;
      if (robots.some(o => o !== r && Math.abs(o.x - x) < 0.8 && Math.abs(o.z - z) < 0.8 && Math.abs(o.y - ty) < 1)) break;
      const u = x * view.r[0] + z * view.r[1], sc = Math.abs(u - wantU) + Math.abs(ty - wantY) * 1.5;
      if (!best || sc < best.sc) best = { x, z, y: ty, sc }; break; } }
  return best;
}
const robotOnScreen = r => Math.abs((r.x - cam.x) * view.r[0] + (r.z - cam.z) * view.r[1] + (r.sh || 0)) < W / S / 2 + 0.3 && Math.abs(r.y + 0.4 - cam.y) < H / S / 2 + 0.3 && !robotHidden(r);
// Финал: игрок слишком долго возится — со всех сторон падают охотники в ярости. На ноге их не больше пяти; перебил пятерых — падают следующие
function spawnHunter(plain) {
  const cand = [];
  for (const c of cubes.values()) { if (c.kind === 'core' || !c.top || hasCube(c.x, c.y + 2, c.z) || Math.max(Math.abs(c.x), Math.abs(c.z)) < 8) continue;
    const dx = Math.abs(c.x - hero.x), dz = Math.abs(c.z - hero.z), dy = c.y + 1 - hero.y; if (dx > 7 || dz > 7 || dy > 3 || dy < -6 || (!plain && dx + dz < 1.5)) continue;
    if (c.x * view.n[0] + c.z * view.n[1] < 7.5) continue;                      // только на видимой стороне: падают на глазах
    if (robots.some(o => !o.dead && Math.abs(o.x - c.x) < 0.8 && Math.abs(o.z - c.z) < 0.8 && Math.abs(o.y - c.y - 1) < 1)) continue; cand.push(c); }
  if (!cand.length) return false;
  const c = plain ? cand.reduce((m, q) => Math.abs(q.x - hero.x) + Math.abs(q.z - hero.z) + Math.abs(q.y + 1 - hero.y) < Math.abs(m.x - hero.x) + Math.abs(m.z - hero.z) + Math.abs(m.y + 1 - hero.y) ? q : m) : pick(cand), top = c.y + 1, r = makeRobot({ x: c.x, y: top, z: c.z, h: Math.abs(c.x) >= Math.abs(c.z) ? [0, 1] : [1, 0], R: 9, F: 7.5 });
  if (plain) { r.aggro = 9; r.face = Math.sign(toU(hero) - toU(r)) || 1; } else { r.hunter = true; r.rage = 1e9; r.hp = Math.round(r.hp * 0.6); }
  r.y = top + 10; r.fa = view.k * 90;
  r.atk = { type: 'jump', t: -0.75, dir: 1, flip: false, y0: top + 10, x0: c.x, z0: c.z, land: { x: c.x, z: c.z, y: top }, done: false, drop: true }; whistle();
  r.anim.play('RobotAC_Jump', { loop: false, restart: true }); r.anim.t = 0.33; robots.push(r); return true;
}
function bombDrop(fast) {                   // робот-бомба: свист и тень заранее, падает туда, куда герой идёт, и взрывается
  const hu = toU(hero), d = toD(hero), fy = Math.floor(hero.y + 0.1) + (fast && !hero.onGround ? 2 : 0), lead = hero.vx * 0.9;   // v299: лезет — бомба на край над ним
  for (const du of [lead, lead + rnd(-1.2, 1.2), 0, hero.face, -hero.face]) { const U = Math.round(hu + du); for (let Y = fy; Y >= fy - 4; Y--) { if (!floorCube(U, Y, d, 'same') || overlapsDepth(U, Y + 1.05, 0.28, 3, d)) continue;
      const x = U * view.r[0] + d * view.n[0], z = U * view.r[1] + d * view.n[1], top = Y + 1, r = makeRobot({ x, y: top + 11, z, h: [1, 0], R: 9, F: 7.5 }); r.bomb = true; r.hunter = true; r.hp = 30; r.fa = view.angle; r.mode = 'wait'; r.t = 9;
      r.atk = { type: 'jump', t: fast ? -0.35 : -0.9, dir: 1, flip: false, y0: top + (fast ? 7 : 11), x0: x, z0: z, land: { x, z, y: top }, done: false, drop: true }; if (fast) r.y = top + 7; r.anim.play('RobotAC_Jump', { loop: false, restart: true }); robots.push(r); whistle(); return true; } }
  return false;
}
function megaJump() {
  if (hero.y < 9 || hero.ride || hero.state === 'dead') return false;
  const low = robots.filter(r => !r.dead && !r.atk && !r.lift && !r.onCloud && !r.taxi && !r.headless && !r.headJob && !(r.stun > 0) && !r.drop && r.y < hero.y - 7); if (low.length < 2) return false;
  const hu = toU(hero), d = toD(hero), fy = Math.floor(hero.y + 0.1); let land = null;
  for (const du of [0, hero.face, -hero.face]) { const U = Math.round(hu + du); for (let Y = fy; Y >= fy - 3 && !land; Y--) if (floorCube(U, Y, d, 'same') && !overlapsDepth(U, Y + 1.05, 0.28, 0.7, d)) land = { x: U * view.r[0] + d * view.n[0], z: U * view.r[1] + d * view.n[1], y: Y + 1 }; if (land) break; }
  if (!land) return false;
  // им выстрелили из пушки: вылетает из-под нижнего края экрана наискось и по прямой бьёт в героя, потом отлетает и падает рядом
  const r = low[Math.floor(Math.random() * low.length)], y0 = cam.y - H / S / 2 - 1.5, sd = Math.sign(toU(r) - hu) || (Math.random() < 0.5 ? -1 : 1), u0 = hu + sd * rnd(3, 6);
  r.loop = false; r.sh = 0; r.hide = 1; r.fa = view.angle; r.kv = 0; r.x = r.tx = u0 * view.r[0] + d * view.n[0]; r.z = r.tz = u0 * view.r[1] + d * view.n[1]; r.y = r.baseY = y0; r.foe = null;
  robotStartAtk(r, 'jump', -sd, land); const A = r.atk, tgt = { x: hero.x, y: hero.y + 0.15, z: hero.z }, fly = Math.max(0.22, Math.min(0.5, Math.hypot(hu - u0, tgt.y - y0) / 26));
  A.mega = true; A.tgt = tgt; A.k1 = fly / (fly + 0.55); A.dur = fly + 0.55; A.t = -0.28; A.x0 = r.x; A.z0 = r.z; A.y0 = y0; r.aggro = 9;
  cannonSound(); game.shake = Math.max(game.shake, 0.1); popups.push({ x: hero.x, y: hero.y + 1.2, z: hero.z, text: 'Снизу!', t: 0 }); return true;
}
function updateFinale(dt) {
  if (hero.state === 'dead' || game.finishT > 0) return;
  if (hero.hideN || onGateLift() || offLeg()) { game.quietT = 0; game.levelT = (game.levelT || 0) + dt; return; }   // пока герой в укрытии, сверху и снизу никто не прилетает
  game.dropT = (game.dropT === undefined ? rnd(60, 100) : game.dropT) - dt;       // время от времени на героя сверху прыгает ещё один робот
  if (game.dropT <= 0 && !game.finale && !view.rotating && !hero.inDoor) { game.dropT = rnd(75, 140) * (dcHas('hunters') ? 0.33 : 1); if (robots.filter(r => !r.dead).length < 22 && spawnHunter(true)) showCombo('Сверху!', true); }
  game.quietT = (game.quietT || 0) + dt; if (game.quietAt === undefined) game.quietAt = rnd(30, 45);
  if (game.quietT > game.quietAt && !game.barrage && !view.rotating && !hero.inDoor && !game.finale && hero.state !== 'dead') { game.barrage = { n: 3 + Math.floor(Math.random() * 2), t: 0 }; game.quietT = 0; game.quietAt = rnd(30, 45) * (dcHas('bombs') ? 0.5 : 1); showCombo('Бомбёжка!', true); }
  if (game.barrage) { const B = game.barrage; B.t -= dt; if (B.t <= 0 && !view.rotating) { B.t = 0.85; B.n--; bombDrop(); if (B.n <= 0) game.barrage = null; } }
  trespassTick(dt);
  game.megaT = (game.megaT === undefined ? rnd(35, 55) : game.megaT) - dt;
  if (game.megaT <= 0 && !view.rotating && !hero.inDoor) { game.megaT = megaJump() ? rnd(35, 60) : 6; }
  game.levelT = (game.levelT || 0) + dt;
  if (!game.finale && game.levelT >= finaleAfter()) { game.finale = true; game.finaleT = 0; game.waveQ = 5; game.waveT = 1.2; sfx('RobotDeathD', 0.9, 0.5); game.shake = Math.max(game.shake, 0.2); }
  if (!game.finale) return;
  game.finaleT += dt;
  robots = robots.filter(r => !(r.hunter && r.dead && r.goneT > 5));           // обломки охотников со временем исчезают, чтобы не завалить ногу
  const alive = robots.filter(r => r.hunter && !r.dead).length;
  if (alive === 0 && game.waveQ <= 0) { game.waveQ = 5; game.waveT = 1.5; }
  if (game.waveQ > 0 && alive < 5 && !view.rotating) { game.waveT -= dt; if (game.waveT <= 0) { game.waveT = 0.45; if (spawnHunter()) game.waveQ--; } }
}
function rageLanding(r) {               // взбешённый: любая площадка в радиусе восьми кубов, с которой ближе всего до героя, хоть за углом ноги
  let best = null; const cur = Math.abs(hero.x - r.x) + Math.abs(hero.z - r.z) + Math.abs(hero.y - r.y) * 1.5;
  for (const c of cubes.values()) { if (c.kind === 'core' || !c.top || Math.abs(c.x - r.x) > 8 || Math.abs(c.z - r.z) > 8 || c.y + 1 - r.y > 5 || c.y + 1 - r.y < -10 || hasCube(c.x, c.y + 2, c.z)) continue;
    if (Math.max(Math.abs(c.x), Math.abs(c.z)) < 8) continue;
    const sc = Math.abs(hero.x - c.x) + Math.abs(hero.z - c.z) + Math.abs(hero.y - c.y - 1) * 1.5 + (Math.abs(hero.x - c.x) + Math.abs(hero.z - c.z) < 0.5 ? 0.6 : 0);
    if (sc < cur - 0.8 && (!best || sc < best.sc) && !robots.some(o => o !== r && !o.dead && Math.abs(o.x - c.x) < 0.8 && Math.abs(o.z - c.z) < 0.8 && Math.abs(o.y - c.y - 1) < 1)) best = { x: c.x, z: c.z, y: c.y + 1, sc }; }
  return best;
}
function robotPickAttack(r) {         // робот в основном просто ходит; нападает изредка и только если видит героя перед собой, а не за спиной
  r.atkCool = 0.8; r.shootCool = r.shootCool === undefined ? rnd(4, 9) : r.shootCool; r.hopCool = r.hopCool === undefined ? rnd(8, 22) : r.hopCool;
  const ru = toU(r) + (r.sh || 0), face = r.face || r.dir; let type = null, land = null, dir = face, shove = false;
  const seen = hero.state !== 'dead' && !hero.inDoor && hero.standOn !== r && !(hero.ride && hero.ride.r === r) && !robotHidden(r) && !hero.hideN && !(hero.sneakT > 0) && !onGateLift() && !(game.calmT > 0) && Math.abs(toD(hero) - toD(r)) <= 1.1;
  // герой едет на другом роботе: целью становится тот робот — попадание сбивает героя; разозлённый робот нападает охотно и не только лицом
  let car = hero.ride ? hero.ride.r : hero.standOn; if (!car || car === r || car.dead || robots.indexOf(car) < 0) car = null;
  const DF = botDiff(r), angry = r.aggro > 0, TR = DF.act, VIS = Math.min(1.8, Math.max(0.7, TR)), e = (angry ? 4 : car ? 3 : 1) * TR; if (angry || car) r.atkCool = 0.9;
  r.atkCool /= DF.cd;   // v296: выше — реже стоит без дела
  const hu = car ? toU(car) + (car.sh || 0) : toU(hero), du = hu - ru, ad = Math.abs(du), dy = (car ? car.y : hero.y) - r.y, near = Math.abs(toD(hero) - toD(r)) <= NEAR_D, level = near && Math.abs(dy) < 0.5;
  r.ramCool = Math.max(0, (r.ramCool || 0) - 0.8);
  if (!DF.start && seen && !car && !hero.ride && (hero.ladder || (!hero.onGround && !hero.hang && hero.vy > -2)) && ad < 3.2 && dy > 0.6 && dy < 3.6 && r.ramCool <= 0 && !view.rotating && Math.random() < 0.4) {
    const d2 = du >= 0 ? 1 : -1, hd = toD(hero), HU = Math.round(toU(hero)); let L2 = null;
    for (let Y = Math.floor(hero.y); Y >= Math.floor(hero.y) - 6 && !L2; Y--) if (floorCube(HU, Y, hd, 'same')) L2 = { x: HU * view.r[0] + hd * view.n[0], z: HU * view.r[1] + hd * view.n[1], y: Y + 1, sc: 0 };
    if (L2 && !overlapsDepth(HU, L2.y + 0.05, 0.28, 0.7, hd)) { r.ramCool = 6 / DF.cd; const res = robotStartAtk(r, 'jump', d2, L2); r.atk.apex = hero.y + 0.25; popups.push({ x: r.x, y: r.y + 1.1, z: r.z, text: 'Таран!', t: 0 }); return res; } }
  r.leapCool = Math.max(0, (r.leapCool || 0) - 0.8);
  if (!DF.start && seen && !car && hero.onGround && !hero.standOn && du * face > 0 && ad < 5.5 && dy > -4.5 && dy < 3.2 && r.leapCool <= 0 && !view.rotating) {
    let apart = Math.abs(dy) >= 0.5 || !near;           // другая площадка: выше, ниже или через провал
    if (!apart) for (let U = Math.round(Math.min(ru, hu)); U <= Math.round(Math.max(ru, hu)); U++) if (!floorCube(U, Math.round(r.baseY) - 1, toD(r), 'same')) { apart = true; break; }
    if (apart) { const d2 = du >= 0 ? 1 : -1, L2 = robotLanding(r, hu - d2 * 0.6, hero.y, true);
      if (L2 && L2.sc < ad + Math.abs(dy) * 1.5 - 0.4) { r.leapCool = 3 / DF.cd; return robotStartAtk(r, 'jump', d2, L2); } }
  }
  if (seen && (du * face > 0 || Math.random() < 0.1 * (TR - 1)) && ad < 5.5 * VIS && dy > -4.5 && dy < 2.2) {
    dir = du >= 0 ? 1 : -1; const roll = Math.random() / e;
    if (ad < 0.85 && level) { if (roll < 0.55 + 0.25 * DF.rng) { const v = DF.start ? 1 : angry ? Math.random() : Math.random() * (1.6 - 0.75 * DF.rng); if (v < 0.2) type = 'steam'; else if (v < 0.34 && r.shootCool <= 0) { type = 'shoot'; r.shootCool = rnd(3, 5); } else { type = 'punch'; shove = v < 0.56; } } }   /* v303: выше и без злости — тоже пар и выстрел вплотную */
    else if (DF.start) { /* v296: робот стартовой комнаты — только кулак */ }
    else if (!car && roll < 0.1 + 0.18 * DF.rng && (!level || ad > 1.2)) { land = robotLanding(r, hu - dir * 0.6, hero.y); if (land && land.sc < ad + Math.abs(dy) * 1.5 - 0.6) type = 'jump'; else land = null; }
    else if (roll < 0.2 + 0.15 * DF.rng && level && ad < 1.9 + DF.rng) type = 'steam';
    else if (roll < 0.32 + 0.25 * DF.rng && r.shootCool <= 0 && ad > 1.5 && Math.abs(dy) < 0.55 && near && robotLineLen(r, dir, ad) >= ad - 0.25) { type = 'shoot'; r.shootCool = (e > 1 ? rnd(3, 5) : rnd(8, 13) * (1 - 0.5 * DF.rng)) / DF.cd; }
  }
  if (!type && r.hopCool <= 0 && !view.rotating && !DF.start) {   // сам по себе изредка перепрыгивает на другую площадку
    r.hopCool = rnd(9, 24); land = robotLanding(r, ru + rnd(-3, 3), r.y + rnd(-4, 1.5));
    if (land && (land.y !== r.baseY || Math.abs(land.x - r.x) + Math.abs(land.z - r.z) > 1.5)) type = 'jump'; else land = null;
  }
  if (!type) return false;
  const res = robotStartAtk(r, type, dir, land); if (shove && r.atk) r.atk.shove = true; return res;
}
function robotStartAtk(r, type, dir, land) {
  if (type === 'jump') dir = Math.sign((land.x - r.x) * view.r[0] + (land.z - r.z) * view.r[1]) || dir;
  // кадры прыжка нарисованы как ходьба (без зеркала — влево), кадры удара, выстрела и пара — действием вправо; на всё действие робот повёрнут в одну сторону
  // ряд выстрела/пара развёрнут вправо и бьёт вправо; первый удар — корпус как при ходьбе влево, бьёт вправо; удар второй рукой и прыжок — как ходьба
  let clip = { punch: 'RobotAC_Punch', jump: 'RobotAC_Jump', shoot: 'RobotAC_Shoot', steam: 'RobotAC_Vent' }[type], flip = dir < 0;
  if (type === 'jump') flip = dir > 0;
  if (type === 'punch') { r.punchN = r.punchN === undefined ? 0 : r.punchN + 1; flip = false; clip = 'RobotAC_Punch' + (dir > 0 ? 'R' : 'L') + (r.punchN % 2 ? '2' : '1'); }   // бокс кадрами автора без зеркала: для взгляда вправо и влево свои первый и второй удар
  r.dir = type === 'punch' ? -1 : dir; r.face = dir;
  r.atk = { type, t: 0, dir, flip, y0: r.y, x0: r.x, z0: r.z, land, done: false };
  if (type === 'punch' && !r.bossMin) { const D = botDiff(r), k = Math.min(1, Math.max(0, (D.act - 0.42) / 1.4)); r.atk.t = -(0.38 - 0.18 * k) * (r.rage > 0 ? 0.6 : 1) * (talHas('c1') ? 1.35 : 1); r.atk.wind = true; }   // v298 (Алексей: «F должна срабатывать раньше — не успеваешь увернуться от обычных атак»): замах перед ударом — внизу 0.38 с, наверху 0.2 с
  if (type === 'jump') { r.atk.dur = Math.max(0.6, Math.min(1.15, 0.48 + 0.075 * (Math.hypot(land.x - r.x, land.z - r.z) + Math.abs(land.y - r.y)))); }
  if (Math.abs(toU(r) - toU(hero)) < 9 && Math.abs(r.y - hero.y) < 6) game.quietT = 0;
  r.anim.play(clip, { loop: false, restart: true });
  if (type === 'shoot') sfx('RobotHit2', 0.3, 0.5);
  return true;
}
// v243: «let bolts…» перенесено в ядро — src/06b_world.js
function robotAttack(r, dt) {
  const a = r.atk, t0 = a.t; a.t += dt; if (a.wind) { if (a.t < 0) { r.anim.t = 0; r.charge = 0.2; } else if (t0 < 0) r.charge = 0; }   /* замах: робот замер в начале удара и краснеет */
  const t = a.t, ru = toU(r) + (r.sh || 0), hu = toU(hero), ok = hero.state !== 'dead' && !hero.inDoor && !a.dodged && Math.abs(toD(hero) - toD(r)) <= NEAR_D;
  const cross = at => t0 < at && t >= at; let cool = rnd(2.5, 5);
  if (a.type === 'punch') {
    cool = r.punchN % 2 ? rnd(1.2, 2.2) : rnd(0.12, 0.3);   // двойка: за ударом одной рукой сразу идёт удар другой
    if (cross(0.26)) { sfx('RobotHit5', 0.4, 0.8); if (ok && (hu - ru) * a.dir > -0.1 && (hu - ru) * a.dir < 0.95 && Math.abs(hero.y - r.y) < 0.6) { if (a.shove && !(hero.invuln > 0) && hero.state !== 'dead') { hero.vx = a.dir * 5.5; hero.vy = 2.8; hero.onGround = false; hero.hang = null; hero.ride = null; hero.face = -a.dir; go('Kulbit'); hero.invuln = 0.5; popups.push({ x: hero.x, y: hero.y + 0.9, z: hero.z, text: 'Оттолкнул!', t: 0 }); game.shake = Math.max(game.shake, 0.06); } else hurtHero(ru); }
      for (const o of robots) if (o !== r && !o.dead && Math.abs(toD(o) - toD(r)) <= NEAR_D && (toU(o) - ru) * a.dir > 0 && (toU(o) - ru) * a.dir < 1.0 && Math.abs(o.y - r.y) < 0.6) robotHurtRobot(o, CFG.hitDamage, a.dir); }
  } else if (a.type === 'throw') {
    cool = rnd(1, 2);
    if (cross(0.26)) { sfx('RobotHit5', 0.5, 0.8); if (hero.ride && hero.ride.r === r) { hero.ride = null; hero.rideCool = 0.9; hero.vx = a.dir * 3.4; hero.vy = 3.8; hero.onGround = false; hero.face = -a.dir; go('Kulbit'); game.shake = Math.max(game.shake, 0.06);
      burst(hero.x, hero.y + 0.35, hero.z, { n: 10, cols: ['#fff4e1', '#e0702e', '#c9b79c'], sp: [1, 3.2], life: 0.4, dir: a.dir }); showCombo('Робот стряхнул!', true); } }
  } else if (a.type === 'jump') {
    const p = (t - 0.22) / (a.dur || 0.62), L = a.land; cool = rnd(1.5, 3);
    if (cross(0.22)) { burst(r.x, r.y + 0.05, r.z, { n: 8, cols: DIRT, sp: [0.6, 2], life: 0.4 }); sfx('Jump_4_landfall', 0.3, 1.3); }
    if (p > 0 && p < 1) {                 // летит дугой с места на место: через провал, на куб выше или вниз
      let h = 0.9 + Math.max(0, L.y - a.y0) * 0.7 + Math.hypot(L.x - a.x0, L.z - a.z0) * 0.12; if (a.apex !== undefined) h = Math.max(h, a.apex - (a.y0 + L.y) / 2);   // таран: вершина дуги — на высоте героя
      if (a.mega) { const T = a.tgt, k = a.k1; r.sh = 0;             // пушечный выстрел: по прямой в героя, удар, отскок и падение рядом
        if (p < k) { const q = p / k; r.x = a.x0 + (T.x - a.x0) * q; r.z = a.z0 + (T.z - a.z0) * q; r.y = a.y0 + (T.y - a.y0) * q; if (Math.random() < dt * 90) parts.push({ x: r.x, y: r.y + 0.3, z: r.z, vx: rnd(-0.4, 0.4) * view.r[0], vz: rnd(-0.4, 0.4) * view.r[1], vy: rnd(-0.2, 0.6), g: 0, drag: 2, t: 0, life: rnd(0.3, 0.6), size: 2, col: pick(['#55555c', '#8a8a92', '#ff7014', '#ffce46']) }); }
        else { if (!a.hitDone) { a.hitDone = true; game.shake = Math.max(game.shake, 0.16); sfx('RobotHit5', 0.7, 0.6); burst(T.x, T.y + 0.3, T.z, { n: 18, cols: SPARK.concat(['#fff4e1']), sp: [2, 6], life: 0.4 });
            if (ok && hero.standOn !== r && Math.abs(hu - toU(T)) < 1.0 && Math.abs(hero.y - T.y) < 1.2) { const kd = Math.sign(T.x * view.r[0] + T.z * view.r[1] - (a.x0 * view.r[0] + a.z0 * view.r[1])) || 1, was = hero.hp; hurtHero(toU(T) - kd * 0.3); if (hero.hp < was && hero.state !== 'dead') { hero.vx = kd * 5.5; hero.vy = 3.4; hero.onGround = false; } } }
          const q = (p - k) / (1 - k); r.x = T.x + (L.x - T.x) * q; r.z = T.z + (L.z - T.z) * q; r.y = T.y + (L.y - T.y) * q + 4 * 0.7 * q * (1 - q); } }
      else { r.x = a.x0 + (L.x - a.x0) * p; r.z = a.z0 + (L.z - a.z0) * p; r.y = a.y0 + (L.y - a.y0) * p + 4 * h * p * (1 - p); r.sh = a.apex !== undefined ? 0 : robotShift(r); }
      if (ok && hero.standOn !== r && Math.abs(hu - ru) < r.hw + hero.hw && hero.y < r.y + ROBOT_TOP && hero.y + hero.h > r.y) hurtHero(ru);
    } else if (p >= 1 && !a.done) {       // грохнулся: пыль, встряска и удар по тем, кто стоит рядом
      a.done = true; r.x = r.tx = L.x; r.z = r.tz = L.z; r.y = r.baseY = L.y; if (r.bomb) { r.atk = null; rageBlast(r); robots = robots.filter(o => o !== r); return; } r.sq = -0.14; r.sqV = 0; r.mode = 'wait'; r.t = 0.3; game.shake = Math.max(game.shake, 0.07); sfx('Jump_4_landfall', 0.5, 0.7);
      burst(r.x, r.y + 0.05, r.z, { n: 16, cols: DIRT, sp: [1, 3.4], life: 0.55 }); burst(r.x, r.y + 0.1, r.z, { n: 8, cols: SMOKE, sp: [0.4, 1.4], up: 0.6, g: 0, drag: 3, life: 0.6, size: 2 });
      if (ok && hero.onGround && hero.standOn !== r && Math.abs(hu - toU(r)) < 1.0 && Math.abs(hero.y - r.y) < 0.3) hurtHero(toU(r));
    }
  } else if (a.type === 'shoot') {        // секунду заряжается и краснеет, потом один снаряд
    r.charge = t < 1.0 ? t : 0;
    if (cross(1.0)) a.twice = Math.random() < 0.3;
    if (cross(1.0) || (a.twice && cross(1.32))) { sfx('RobotDeathB', 0.35, 1.9); r.sq = -0.08; bolts.push({ x: r.x + view.r[0] * ((r.sh || 0) + a.dir * 0.3), y: r.y + 0.36, z: r.z + view.r[1] * ((r.sh || 0) + a.dir * 0.3), dx: view.r[0] * a.dir, dz: view.r[1] * a.dir, t: 0, owner: r, pow: r.rage > 0 ? 60 : CFG.kunaiDamage }); }
  } else if (a.type === 'steam') {
    if (cross(0.3)) { jets.push({ robot: r, dir: a.dir, x: r.x, y: r.y + 0.36, z: r.z, dx: view.r[0] * a.dir, dz: view.r[1] * a.dir, t: 0, var: Math.floor(rnd(0, 6)) }); sfx('RUN_1_13', 0.3, 0.45); }
  }
  if (t >= Math.max(r.anim.clip.len, a.type === 'jump' ? 0.22 + (a.dur || 0.62) + 0.1 : 0) + (a.type === 'steam' ? 0.5 : 0)) { if (a.type === 'jump' && !a.done) { r.x = r.tx = a.land.x; r.z = r.tz = a.land.z; r.y = r.baseY = a.land.y; } r.atk = null; r.charge = 0; r.atkCool = r.rage > 0 ? Math.min(0.12, cool * 0.6) : cool; r.anim.play('RobotAC_Stay', { restart: true }); r.clipT = 0; }
}
function robotHurtRobot(o, dmg, dir) {   // робот попал по роботу: урон, искры, отдача
  if (o.rage > 0 && !o.hunter) return;
  o.hp -= dmg; o.flashT = 0.12; o.sq = -0.13; o.sqV = 0; o.hitT = 0.25; o.face = -dir; sfx(pick(['RobotHit2', 'RobotHit3', 'RobotHit5']), 0.4, 1);
  burst(o.x, o.y + 0.4, o.z, { n: 8, cols: ['#fff4e1', '#ffb326', '#c9b79c'], sp: [1, 3], life: 0.35 });
  if (o.hp <= 0) damageRobot(o, 1, true);
  if (hero.state !== 'dead' && (hero.standOn === o || (hero.ride && hero.ride.r === o))) {   // героя сбивает с робота, по которому попали
    const inv = hero.invuln > 0, away = -dir; hero.ride = null; hero.rideCool = 0.7; hero.standOn = null; hurtHero(toU(hero) + dir * 0.3);
    if (inv) { hero.vx = dir * 1.8; hero.vy = 3.2; hero.onGround = false; go('Kulbit'); } }
}
function updateBolts(dt) {              // снаряд робота: летит по прямой, о куб разбивается, героя поджигает
  for (const q of bolts) {
    q.t += dt; q.x += q.dx * 7.5 * dt; q.z += q.dz * 7.5 * dt;
    const u = toU(q), d = toD(q);
    if (Math.random() < dt * 30) parts.push({ x: q.x - q.dx * 0.2, y: q.y + rnd(-0.05, 0.05), z: q.z - q.dz * 0.2, vx: -q.dx * rnd(0, 1), vz: -q.dz * rnd(0, 1), vy: rnd(-0.3, 0.6), g: 1, drag: 2, t: 0, life: rnd(0.15, 0.35), size: 1, col: pick(['#ffce46', '#ff7014', '#e8501a']) });
    const hit = hero.state !== 'dead' && !hero.inDoor && Math.abs(toD(hero) - d) <= NEAR_D && Math.abs(toU(hero) - u) < hero.hw + 0.14 && hero.y < q.y + 0.14 && hero.y + hero.h > q.y - 0.14;
    if (hit) igniteHero();
    let rh = null; for (const o of robots) if (o !== q.owner && !o.dead && Math.abs(toD(o) - d) <= 1.1 && Math.abs(toU(o) + (o.sh || 0) - u) < o.hw + 0.16 && o.y < q.y + 0.2 && o.y + ROBOT_TOP > q.y - 0.1) rh = o;
    if (rh) { rh.burn = 6; rh.burnTick = 0; robotHurtRobot(rh, q.pow || CFG.kunaiDamage, Math.sign(q.dx * view.r[0] + q.dz * view.r[1]) || 1); }   // снаряд поджигает и робота
    if (hit || rh || q.t > 1.1 || overlapsDepth(u, q.y - 0.05, 0.05, 0.1, d)) { q.dead = true; burst(q.x, q.y, q.z, { n: 10, cols: ['#ffce46', '#ff7014', '#fff3c4', '#e8501a'], sp: [0.8, 3], life: 0.4 }); booms.push({ x: q.x, y: q.y, z: q.z, t: 0.2 }); }
  }
  bolts = bolts.filter(q => !q.dead);
}
function drawBolt(q, b) {               // одна огненная «стрела» со светлой сердцевиной
  const dir = Math.sign(q.dx * b.r[0] + q.dz * b.r[1]) || 1, g = Math.max(2, Math.round(S * 0.026)), px = Math.round(W / 2 + relU(q, b) * S), py = Math.round(H / 2 - (q.y - cam.y) * S), PR = [1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1];
  pixelGlow(px, py, 0.5, 0.12);
  for (let i = 0; i < 14; i++) { const h = PR[i], x = px + dir * (i - 9) * g - (dir < 0 ? g : 0), fl = (i + Math.floor(game.time * 30)) % 5 === 0 && i < 4;
    if (fl) continue;
    ctx.fillStyle = '#e8501a'; ctx.fillRect(x, py - h * g - (g >> 1), g, (2 * h + 1) * g);
    if (h >= 2) { ctx.fillStyle = '#ffa23a'; ctx.fillRect(x, py - (h - 1) * g - (g >> 1), g, (2 * h - 1) * g); }
    if (h >= 3) { ctx.fillStyle = '#fff6d0'; ctx.fillRect(x, py - (h - 2) * g - (g >> 1), g, (2 * h - 3) * g); } }
}
// Огненный луч: набирается из одинаковых «стрел», которые бегут от робота, — стыкуется на любую длину
function drawBeam(px, py, dir, len, t) {
  const g = Math.max(2, Math.round(S * 0.026)), n = Math.max(3, Math.floor(len * S / g)), sc = Math.floor(t * 46), PR = [3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1, 0];
  pixelGlow(px + dir * 0.3 * S, py, 0.55, 0.11); pixelGlow(px + dir * len * S, py, 0.45, 0.1);
  for (let i = 0; i < n; i++) {
    let h = PR[(((i - sc) % 14) + 14) % 14]; if (i < 3) h = Math.min(3, Math.max(h, 1) + (i === 0 ? 1 : 0)); if (i > n - 4) h = Math.min(h, n - 1 - i);
    const x = dir > 0 ? px + i * g : px - (i + 1) * g, y = Math.round(py);
    if (h <= 0) { ctx.fillStyle = '#ffa23a'; ctx.fillRect(x, y - (g >> 1), g, g); continue; }
    ctx.fillStyle = '#e8501a'; ctx.fillRect(x, y - h * g - (g >> 1), g, (2 * h + 1) * g);
    if (h >= 2) { ctx.fillStyle = '#ffa23a'; ctx.fillRect(x, y - (h - 1) * g - (g >> 1), g, (2 * h - 1) * g); }
    if (h >= 3) { ctx.fillStyle = '#fff6d0'; ctx.fillRect(x, y - (h - 2) * g - (g >> 1), g, (2 * h - 3) * g); }
  }
}

// v296 (Алексей 25.10: «пытаешься сбоку перейти от территории жёлтого ключа к территории синего не через дверь, а сбоку — пускай сверху на тебя
// падает взрывающийся бот, если увернулся — ещё один»). Снаружи выше кольца перегородки, а её дверь ещё заперта — значит, обошёл сбоку.
const gateOpen = n => doors.some(d => d.gate === n && !d.locked);
// v300 (Алексей: «бот должен будто уже лететь и в момент прыжка протаранивать тебя, мешая пролезть вверх; и почему-то потом падающие боты атакуют,
// когда ты уже на платформе»): охрана только на попытке перелезть — в прыжке, на краю или на лестнице у кольца (от 2.2 ниже до 1.2 выше его верха),
// не у двери перегородки. Робот-таран уже летит сбоку из-за края экрана прямо в героя, сшибает с края вниз и падает сам. Встал на кольцо — охраны нет.
function trespassTick(dt) {
  const tops = LEVEL.ringTops || [13, 23]; if (game.tresCool > 0) game.tresCool -= dt;
  if (hero.state === 'dead' || hero.inDoor || inRoom() || hero.ride || hero.y > 900 || view.rotating || game.fromEditor || hero.grab) return;
  if (hero.onGround && !hero.hang && !hero.ladder) game.tresGY = hero.y;   /* v302: где стоял в последний раз — бомбы только тому, кто лезет на кольцо СНИЗУ; стоит на локации — не трогаем */
  const nearGate = g => { const G = (LEVEL.gates || []).find(q => q.n === g + 1); if (!G) return true; const d = doors.find(o => o.gate === g + 1 && Math.abs(o.y - G.y) < 1.5); return d ? Math.hypot(d.x - hero.x, d.z - hero.z) < 2.6 && Math.abs(d.y - hero.y) < 2.5 : false; };
  let zone = -1; for (let g = 0; g < tops.length; g++) { if (!LEVEL.gates || !LEVEL.gates.some(q => q.n === g + 1) || gateOpen(g + 1)) continue;
    if (hero.y > tops[g] - 0.7 && hero.y < tops[g] + 1.2 && !hero.onGround && ((hero.airT > 0.12 && hero.vy > -1) || hero.hang || hero.ladder) && (game.tresGY ?? -99) < tops[g] - 0.5 && !nearGate(g)) zone = g; }
  if (zone < 0) { if (hero.onGround) game.tresIn = false; return; }
  if (!game.tresIn) { game.tresIn = true; game.tresCool = 0; plog('обход', 'перегородка ' + (GATE_COL[zone + 1] ? GATE_COL[zone + 1][6] : zone + 1) + ' — бомба сверху'); showCombo('Без ключа не пролезешь!', true); }
  if (game.tresCool <= 0 && launchRam()) game.tresCool = 1.0;
}
// v302 (Алексей: «роботы налетают как мухи, а должны как бомбы сваливаться именно в момент пересечения воздушной границы без ключа; если ты на локации — вообще не трогать»):
// бомба падает сверху из-за края экрана прямо на героя (по горизонтали чуть доводится), при касании взрывается и сшибает вниз; мимо — взрывается об уступ
// или улетает вниз. Обычным роботом не становится никогда. Герой уже стоит на кольце — бомба безвредна.
function launchRam() {
  const hu = toU(hero), d = toD(hero), y0 = Math.max(hero.y + 4, cam.y + H / S / 2 + 0.8), u0 = hu + hero.vx * 0.12;
  const r = makeRobot({ x: u0 * view.r[0] + d * view.n[0], y: y0, z: u0 * view.r[1] + d * view.n[1], h: [1, 0], R: 9, F: 7.5 }); r.hunter = true; r.fa = view.k * 90; r.hp = 40; r.baseY = y0;
  r.ram = { vy: -15, t: 0, y0 }; r.face = r.dir = hero.face || 1; r.anim.play('RobotAC_Jump', { loop: false, restart: true }); r.anim.t = 0.33; robots.push(r); whistle(); return true;
}
function ramBoom(r, hurt) {
  booms.push({ x: r.x, y: r.y + 0.4, z: r.z, t: 0 }); booms.push({ x: r.x + 0.25 * view.r[0], y: r.y + 0.6, z: r.z + 0.25 * view.r[1], t: 0 });
  burst(r.x, r.y + 0.4, r.z, { n: 26, cols: ['#ffce46', '#ff7014', '#fff3c4', '#c0392b', '#3a2f36'], sp: [1.5, 6], life: 0.7, size: 2 }); game.shake = Math.max(game.shake, hurt ? 0.22 : 0.12); sfx('RobotDeathB', 0.8, 0.8);
  robots = robots.filter(o => o !== r); r.dead = true;
}
function ramTick(r, dt) {
  const R = r.ram; R.t += dt; R.vy -= 22 * dt; const du = toU(hero) - toU(r), mu = Math.max(-4, Math.min(4, du * 6)) * dt;   // по горизонтали — немного за героем
  setUD(r, toU(r) + mu, toD(hero)); r.y += R.vy * dt; r.baseY = r.y; r.anim.t = 0.33;
  if (Math.random() < dt * 30) parts.push({ x: r.x, y: r.y + 1.0, z: r.z, vx: 0, vz: 0, vy: 1.5, g: 0, drag: 2, t: 0, life: 0.3, size: 2, col: pick(['#fff4e1', '#ffce46', '#ff7014']) });
  const safe = hero.onGround && !(hero.hang || hero.ladder) && hero.y > R.y0 - 6 && (LEVEL.ringTops || []).some(t => hero.y > t - 0.4 && hero.y < t + 2);   // стоит на кольце — уже на локации
  const hit = hero.state !== 'dead' && !safe && Math.abs(toU(r) - toU(hero)) < 0.65 && r.y < hero.y + 1.0 && r.y > hero.y - 0.6;
  if (hit) { const dir = Math.sign(toU(hero) - toU(r)) || -(hero.face || 1); hero.hang = null; hero.ladder = null; hero.hook = null; hero.hangCool = 0.6; hero.vx = dir * 2.5; hero.vy = -6; hero.onGround = false; go('Fly');
    if (!(hero.invuln > 0)) { PLOG.why = 'бомба у перегородки'; loseHP(); updateHUD(); hero.invuln = 0.8; if (hero.hp <= 0) killHero(); }
    game.hitStop = Math.max(game.hitStop, 0.07); popups.push({ x: hero.x, y: hero.y + 1.1, z: hero.z, text: 'Без ключа!', t: 0 }); ramBoom(r, true); return; }
  const fy = Math.floor(r.y + 0.001); if (R.vy < 0 && r.y < hero.y - 0.6 && floorCube(Math.round(toU(r)), fy - 1, toD(r), 'any') && r.y - fy < 0.3) { r.y = fy; ramBoom(r, false); return; }   // мимо — об уступ
  if (r.y < R.y0 - 22 || r.y < -4) { robots = robots.filter(o => o !== r); r.dead = true; }
}
// v243: glowCache — перенесено в ядро, src/06b_world.js
// v243: function pixelGlow — перенесено в ядро, src/13c_units.js
// Лампочка на проводе: маятник. Качается сама понемногу, а когда нога титана встаёт на землю — её встряхивает и она подпрыгивает на проводе
function updateLamps(dt) {
  for (const L of LEVEL.lamps) {
    const held = hero.ladder && hero.ladder.lamp === L, acc = -(22 / L.len) * Math.sin(L.th) - (held ? 0.7 : 0.55) * L.om + (held ? 0 : 0.5 * Math.sin(game.time * 0.9 + L.ph));   // под весом героя качание постепенно затухает
    L.om += acc * dt; L.th += L.om * dt; L.bv += (-L.bob * 160 - L.bv * 7) * dt; L.bob += L.bv * dt;
  }
}
// v243: function drawLamp — перенесено в ядро, src/13c_units.js
// Редкая удача: вместо того чтобы стряхнуть героя с плеча, робот прыжками по уступам пути довозит его до балкона у выхода
function botAtkOk(r) {
  if (r.foe || r.bossMin || r.fierce) return true;   /* v312: боты тревоги и клон не ждут очереди */
  if (game.time < (game.nextBotAtk || 0)) return false;
  const busy = robots.filter(o => o !== r && !o.dead && o.atk && !o.atk.done && !o.foe).length; return busy < (game.finale ? 2 : 1);
}
function botAtkStarted() { const hurt = game.time - (hero.hurtAt === undefined ? -9 : hero.hurtAt) < 2.5; game.nextBotAtk = game.time + (game.finale ? rnd(0.4, 0.9) : rnd(0.9, 1.7)) + (hurt ? 1.4 : 0); }
const heroMomHit = () => Math.max(hero.mom || 0, hero.momLost && game.time - hero.momLost.t < 0.15 ? hero.momLost.m : 0);   // разгон в миг удара (упёрся — разгон уже сброшен, но удар считается)
function startTaxi(r) {
  if (r.dead || r.taxi || r.onCloud || r.lift) return false;
  const lane = (f, t) => [[t, 8], [8, -t], [-t, -8], [-8, t]][f % 4], up = LEVEL.path.filter(q => q.top > r.y + 0.5), pts = [];
  up.forEach((q, i) => { if (i === 0 || q.a !== -8) { const c = lane(q.f, Math.round((q.a + q.b) / 2)); pts.push({ x: c[0], y: q.top, z: c[1], f: q.f % 4 }); } });
  pts.push({ x: 8, y: 33, z: -10, f: 1 });
  r.taxi = { pts, i: 0, rest: 0.4 }; r.atk = null; r.loop = false; r.fa = view.angle; r.rage = 0; r.hunter = false; r.aggro = 0; r.sh = 0; r.burn = 0;
  showCombo('Робот везёт тебя к выходу!', true); sfx('RobotHit5', 0.6, 1.8); return true;
}
function updateTaxi(r, dt) {            // каждый перелёт — обычный прыжок робота со своей анимацией: присел, дуга, приземлился, передышка
  const T = r.taxi; hero.invuln = Math.max(hero.invuln, 0.5); hero.burn = 0; hero.wetT = 0; hero.washT = 0; r.burn = 0; r.sh = 0; r.hide = 1;
  const riding = hero.ride && hero.ride.r === r && hero.state !== 'dead';
  if (r.atk) { robotAttack(r, dt); if (r.atk) return; r.fa = view.angle; T.i++; T.rest = 0.35;            // приземлился
    if (riding && T.i >= T.pts.length) { r.taxi = null; r.mode = 'wait'; r.t = 3; r.atkCool = 4; hero.ride = null; hero.rideCool = 1; hero.vx = 0; hero.vy = 1.5; go('Fly'); showCombo('Приехали. Лифт к двери — рядом', true); return; } }
  if (!riding || T.i >= T.pts.length) { r.taxi = null; r.mode = 'wait'; r.t = 1; r.atkCool = 3; return; }   // герой спрыгнул — поездка окончена
  r.fa = view.angle; robotAnim(r, 'RobotAC_Stay'); const wp = T.pts[T.i];
  if (view.k !== wp.f) { if (!view.rotating) { const dk = (wp.f - view.k + 4) % 4; view.rotating = true; view.from = view.angle; view.dir = dk === 3 ? -1 : 1; view.to = view.angle + (dk === 3 ? -90 : dk * 90); view.fast = dk === 2; } return; }
  if (T.rest > 0) { T.rest -= dt; return; }
  const du = (wp.x - r.x) * view.r[0] + (wp.z - r.z) * view.r[1]; robotStartAtk(r, 'jump', Math.sign(du) || r.dir, { x: wp.x, z: wp.z, y: wp.y });
}
/* идёт по уступу вглубь (уступ виден торцом): его не видно — считается каждый кадр и сразу после поворота мира, без мигания */
function robotAwayCalc(r) {
  const carry0 = hero.standOn === r || (hero.ride && hero.ride.r === r);
  r.depthWalk = Math.abs(r.hx * view.n[0] + r.hz * view.n[1]) > 0.5;
  r.away = !r.loop && !r.dead && r.depthWalk && !carry0 && !r.foe && !(r.aggro > 0) && !r.atk && !r.headless && !(r.stun > 0) && !(r.burn > 0) && !r.kv && !r.drop && !r.taxi && !r.lift && !r.onCloud;
}
function updateRobots(dt) {
  const hu = toU(hero); if (hero.bumpT > 0) hero.bumpT -= dt;
  for (const r of robots) {
    if (r.ram) { ramTick(r, dt); continue; }   /* v300: робот-таран у перегородки */
    if (r.flyUp) { r.y += (4 + r.flyUp * 14) * dt; r.baseY = r.y; r.flyUp += dt; if (Math.random() < dt * 40) parts.push({ x: r.x + rnd(-0.2, 0.2), y: r.y - 0.05, z: r.z, vx: 0, vz: 0, vy: -rnd(3, 6), g: -2, drag: 3, t: 0, life: rnd(0.25, 0.45), size: 3, col: pick(['#fff4e1', '#ffce46', '#ff7014', '#3a2f36']) }); continue; }   // уносит героя к мозгу
    if (!r.dead && !r.atk && !r.taxi && !r.lift && !r.onCloud && !r.drop && !r.flyUp && Math.abs(r.y - hero.y) > 24) continue;   // далеко по высоте (другой ярус, другая комната) — спит, не тратит кадр
    const wasAway = r.away;
    const wasDW = r.depthWalk; robotAwayCalc(r); if (r.away && !wasAway) { r.awayD = toD(r); const u0 = Math.round(toU(r)), d0 = toD(r), Y = Math.floor(r.y);   /* v299: стена рядом — тело ноги вдоль пути вглубь (ближний куб клетки сбоку стоит не дальше чем 2.5 позади) */
      const col = U => { let F = null; for (const yy of [Y, Y + 1]) { const a = cellAt(U, yy); if (a && a[0].dep > d0 - 2.5) F = Math.max(F ?? -99, a[0].dep); } return F; }, R = col(u0 + 1), L = col(u0 - 1);
      r.ashS = R !== null && (L === null || R >= L) ? 1 : L !== null ? -1 : 0; r.ashF = r.ashS > 0 ? R : r.ashS < 0 ? L : null; }   /* в какую сторону «заходить за угол» и где передняя грань той стены */
    { const want = r.away && r.ashS ? r.ashS * Math.min(1.0, Math.max(0, (r.ashF + 0.1 - toD(r)) * 1.6)) : 0; r.ash = (r.ash || 0) + Math.max(-dt * 3, Math.min(dt * 3, want - (r.ash || 0))); if (Math.abs(r.ash) < 1e-3) r.ash = 0; }
    if (!r.atk && r.charge > 0 && !(r.rage > 0)) r.charge = 0;   /* v298: атаку сбили — красный замах гаснет */
    if (r.ripT > 0 && (r.ripT -= dt) <= 0 && !r.dead && !(r.stun > 0) && !r.atk && hero.state !== 'dead' && !hero.grab && Math.abs(hero.y - r.y) < 0.8 && Math.abs(toU(hero) - toU(r) - (r.sh || 0)) < 1.4) {   // v296: ответный удар
      const d2 = Math.sign(toU(hero) - toU(r) - (r.sh || 0)) || 1; r.face = r.dir = d2; r.hitT = 0; r.fa = view.k * 90; robotStartAtk(r, 'punch', d2); popups.push({ x: r.x, y: r.y + 1.1, z: r.z, text: 'Ответ!', t: 0 }); } if (r.depthWalk && !wasDW) r.turnD = toD(r);   /* v296: где повернул вглубь — отсюда виден ещё 0.8 куба */
    { const want = r.dead || !robotHidden(r) ? 1 : 0; r.vis = r.vis === undefined ? want : r.vis + Math.max(-dt * 5, Math.min(dt * 5, want - r.vis)); }   /* появляется и пропадает за пятую долю секунды */
    if (r.shT > 0) r.shT -= dt;
    if (r.shockT > 0) { r.shockT -= dt; if (!r.dead) { r.stun = Math.max(r.stun || 0, r.shockT); r.atk = null; } r.shockZ = (r.shockZ || 0) - dt;   /* шок: стоит как вкопанный, по нему бегают разряды */
      if (r.shockZ <= 0 && !robotHidden(r)) { r.shockZ = 0.06; zapRobot(r, 1); if (Math.random() < 0.5) burst(r.x, r.y + rnd(0.2, 0.9), r.z, { n: 2, cols: ['#ffffff', '#8fe8ff', '#bff0ff'], sp: [1, 3], up: 0.5, life: 0.2, size: 1 }); } }
    r.sqV = (r.sqV || 0) + (-(r.sq || 0) * 200 - (r.sqV || 0) * 14) * dt; r.sq = (r.sq || 0) + r.sqV * dt;
    if (r.wet > 0) { r.wet -= dt; if (!r.dead && !robotHidden(r) && Math.random() < dt * 8) parts.push({ x: r.x + rnd(-0.3, 0.3) * view.r[0] + (r.sh || 0) * view.r[0], y: r.y + rnd(0.15, 0.7), z: r.z + rnd(-0.3, 0.3) * view.r[1] + (r.sh || 0) * view.r[1], vx: 0, vz: 0, vy: -0.3, g: 9, drag: 0, t: 0, life: rnd(0.3, 0.5), size: 1, col: pick(['#bfeaf2', '#5fc3dc', '#eefcff']) }); }
    else if (r.soak > 0) r.soak = Math.max(0, r.soak - dt * 0.4);       // обсыхает — снова разгоняется; ржавый остаётся медленным навсегда
    r.anim.update(dt * (r.rust ? 0.6 : 1)); r.flashT = Math.max(0, r.flashT - dt); r.clipT = Math.max(0, r.clipT - dt); r.buckT = Math.max(0, (r.buckT || 0) - dt);
    if (r.taxi) { updateTaxi(r, dt); continue; }
    if (!r.dead && r.stun > 0) { r.stun -= dt; r.atk = null; r.kv = 0; if (!(r.grabT > 0)) robotAnim(r, 'RobotAC_Stay'); r.fa = view.angle;
      if (r.headless) { r.sh = (r.sh || 0) * 0.9; if (Math.random() < dt * 22) burst(r.x + rnd(-0.08, 0.08) * view.r[0], r.y + 0.66, r.z + rnd(-0.08, 0.08) * view.r[1], { n: 1, cols: ['#ffce46', '#ff7014', '#fff4e1'], sp: [0.8, 2.6], up: 2.2, life: 0.35 }); r.sq = 0.03 * Math.sin(game.time * 31); }
      if (!r.lift && !r.onCloud && (!r.headJob || r.headless)) { let fy = -40; for (let y = Math.floor(r.y + 0.3); y >= 0; y--) if (hasCube(Math.round(r.x), y - 1, Math.round(r.z))) { fy = y; break; }   // оглушили или снесли голову в воздухе — сначала падает
        if (!r.sfall && r.y > fy + 0.25 && !robots.some(c => c.box && c !== r && c.y < r.y && Math.abs(c.x - r.x) < 0.9 && Math.abs(c.z - r.z) < 0.9)) { r.sfall = true; r.svy = 0; }
        if (r.sfall) { r.svy -= 22 * dt; r.y = Math.max(fy, r.y + r.svy * dt); r.baseY = r.y; r.sh = 0; if (r.y <= fy + 0.001) { r.sfall = false; r.sq = -0.2; r.sqV = 0; burst(r.x, r.y + 0.1, r.z, { n: 12, cols: DIRT, sp: [1, 3.2], life: 0.5 }); game.shake = Math.max(game.shake, 0.06); sfx('Jump_4_landfall', 0.5, 0.6); r.stun = Math.max(r.stun, 0.35); }
          else if (r.y < -8) { r.stun = 0; r.sfall = false; if (r.headless) { headlessBoom(r); continue; } } else r.stun = Math.max(r.stun, 0.05); } }
      if (r.stun <= 0) { r.headJob = false; if (r.headless) { if (Math.random() < 1) headlessBoom(r); else { r.headless = false; r.noHead = true; r.forceKind = 'A'; r.diedAt = game.time; r.hp = 0; r.rage = 0; damageRobot(r, 1, true); } } } continue; }   // половина безголовых взрывается, половина падает трупом без головы
    if (r.onCloud && !r.dead) {            // десант на облаке: стоят на нём, подбираются к герою и бьют; сошёл герой с облака — падают
      const oc = r.onCloud, bx = cloudBox(oc.c); if (!bx || !oc.c.raid) { r.onCloud = null; r.hp = 0; r.rage = 0; damageRobot(r, 1, true); r.fallY = -40; r.fvy = 0; continue; }
      const top = bx.y + bx.h * 0.55, want = Math.max(-bx.w * 0.4, Math.min(bx.w * 0.4, toU(hero) - bx.u - Math.sign(toU(hero) - bx.u - oc.off) * 0.5)); oc.off += Math.max(-1.4 * dt, Math.min(1.4 * dt, want - oc.off));
      const uu = bx.u + oc.off, dd = toD(hero); r.x = r.tx = uu * view.r[0] + dd * view.n[0]; r.z = r.tz = uu * view.r[1] + dd * view.n[1]; r.sh = 0; r.hide = 1;
      if (r.dropT > 0) { r.dropT -= dt; r.y = top + 9 * Math.max(0, r.dropT) / 0.5 * (r.dropT > 0.5 ? 0 : 1) + (r.dropT > 0.5 ? 30 : 0); r.baseY = top; if (r.dropT <= 0) { r.y = top; r.sq = -0.14; burst(r.x, r.y, r.z, { n: 10, cols: ['#eefcff', '#d8e4ea'], sp: [0.6, 2.4], life: 0.5 }); } robotAnim(r, 'RobotAC_Stay'); continue; }
      if (!r.atk) r.y = r.baseY = top;
    }
    if (r.lift && !r.dead) { r.y = r.baseY = r.lift.y; r.x = r.tx = r.lift.x; r.z = r.tz = r.lift.z; r.sh = 0; r.hide = 1; robotAnim(r, 'RobotAC_Stay'); if (r.lift.broken) r.lift = null; continue; }   // едет в люльке
    if (r.dead) {
      if (r.fallY === undefined) { let fy = -40; for (let y = Math.floor(r.y + 0.3); y >= 0; y--) if (hasCube(Math.round(r.x), y - 1, Math.round(r.z))) { fy = y; break; } r.fallY = r.y > fy + 0.6 || (r.y > fy + 0.04 && !robots.some(c => c.box && c !== r && c.y < r.y && Math.abs(c.x - r.x) < 0.9 && Math.abs(c.z - r.z) < 0.9)) ? fy : r.y; r.fvy = 0; r.x += (Math.round(r.x) - r.x) * 0.5; r.z += (Math.round(r.z) - r.z) * 0.5; }
      if (r.y > r.fallY + 0.001) { r.fvy -= 22 * dt; r.y = Math.max(r.fallY, r.y + r.fvy * dt); if (r.y <= r.fallY + 0.001) { burst(r.x, r.y + 0.1, r.z, { n: 14, cols: DIRT, sp: [1, 3.4], life: 0.5 }); game.shake = Math.max(game.shake, 0.06); sfx('Jump_4_landfall', 0.5, 0.6); } }   // убили в прыжке — обломки падают, а не висят
      if (r.hunter && r.box) { r.goneT = (r.goneT || 0) + dt; }
      if (!r.box && r.anim.done) {      // рухнул: дым и обломки в стороны
        r.box = CORPSE[r.kind]; if (!r.noFire && (!game.firstFire || r.fireSure || Math.random() < 0.5)) { game.firstFire = true; booms.push({ x: r.x, y: r.y + 0.3, z: r.z, t: 0 }); sfx('RobotDeathB', 0.5, 1.5); game.shake = Math.max(game.shake, 0.08); fires.push({ x: r.x, y: r.y + 0.08, z: r.z, life: rnd(12, 18), smk: 0, delay: 0.72, wreck: r, big: true, fl: [{ dx: 0, dy: 0, sc: rnd(0.95, 1.1), flip: Math.random() < 0.5, ph: rnd(0, 9), sp: 1, hot: false }] }); }   // иногда обломки загораются
        burst(r.x, r.y + 0.2, r.z, { n: 14, cols: DIRT, sp: [1, 3.5], life: 0.6 }); burst(r.x, r.y + 0.15, r.z, { n: 12, cols: SMOKE, sp: [0.3, 1.3], up: 0.9, g: 0, drag: 2.5, life: 0.8, size: 2 }); game.shake = Math.max(game.shake, 0.05);
      }
      continue;
    }
    // роботы тоже ходят по обломкам товарищей: плавно поднимаются и спускаются
    const ct = corpseTop(toU(r), r.y, toD(r)), targetY = ct !== null && ct > r.baseY ? ct : r.baseY;
    r.y += Math.max(-4 * dt, Math.min(4 * dt, targetY - r.y));
    // куда повёрнут корпус: в обходе — лицом наружу, к краю; встревожен (мир повернули рядом с ним, получил удар) — лицом к камере
    let want = null; r._moved = false;
    if (r.turnWait > 0) r.turnWait -= dt;
    else {
      if (r.alert > 0) r.alert -= dt;
      const g = r.hx * view.n[0] + r.hz * view.n[1];
      r.depthWalk = Math.abs(g) > 0.5;
      if (r.depthWalk && !view.rotating && hero.state !== 'dead' && (hero.standOn === r || (hero.ride && hero.ride.r === r))) {   // везёт героя за угол — мир поворачивается следом
        const d1 = viewAfter(1, r.x, r.z, r.y).d, d2 = viewAfter(-1, r.x, r.z, r.y).d; startRotate(d1 >= d2 ? 1 : -1); }   // его дорожка сейчас уходит вглубь экрана: на экране он стоял бы на месте, поэтому просто стоит
      want = view.k * 90;
    }
    let turning = false;
    if (want !== null) { const dl = norm180(want - r.fa), stp = CFG.robotTurnSpeed * dt; turning = Math.abs(dl) > stp; r.fa = turning ? r.fa + Math.sign(dl) * stp : want; }
    { const carry = hero.standOn === r || (hero.ride && hero.ride.r === r);
      if (carry && !r.wasCarry && hero.standOn === r && !r.rage && !r.hunter && Math.random() < 0.07) { r.wasCarry = true; popups.push({ x: r.x, y: r.y + 1.1, z: r.z, text: 'Мина!', t: 0 }); rageBlast(r); continue; }   // запрыгнул на робота — изредка он тут же взрывается
      r.wasCarry = carry;
      if (carry && !r.rage) { r.carryT = (r.carryT || 0) + dt; if (r.fuse > 0) { r.fuse -= dt; r.flashT = Math.max(r.flashT, Math.sin(game.time * 40) > 0 ? 0.05 : 0); if (r.fuse <= 0) { rageBlast(r); continue; } }
        else if (r.carryT > 3 && Math.random() < dt * 0.07) { r.fuse = 0.9; sfx('RobotDeathD', 0.5, 2); popups.push({ x: r.x, y: r.y + 1.1, z: r.z, text: 'Сейчас рванёт!', t: 0 }); } }   // долго стоишь или висишь на роботе — он может взорваться
      else if (!carry) { r.carryT = 0; if (r.fuse > 0) r.fuse = 0; }
      if (carry) r.hide = Math.max(0, r.hide - 3 * dt); else if (r.hide < 1) { const h0 = r.hide; r.hide = 1; const far = Math.abs(robotShift(r)) > 0.05; r.hide = far ? h0 : 1; } r.fade = 1; { const tg = robotShift(r), run = /Run/.test(r.anim.name), mx = (run ? 4 : 0.5) * dt; r.sh = (r.sh || 0) + Math.max(-mx, Math.min(mx, tg - (r.sh || 0))); }   /* v303 (Алексей: «ударил робота — он плывёт в сторону»): сдвиг к стене меняется плавно и почти не меняется, пока робот стоит */ if (r.loop && r.depthWalk) r.mode = 'walk'; }
    if (r.dead) { r.kv = 0; }
    if (r.drop && !r.dead) {               // слетел с края после тарана: падает; есть куда — встаёт помятый, нет — разбивается
      const dp = r.drop; dp.vy -= 20 * dt; r.y += dp.vy * dt; setUD(r, toU(r) + dp.vu * dt, toD(r)); dp.vu *= Math.exp(-dt * 3); r.sh = 0; r.atk = null; if (r.anim.name !== 'RobotAC_TakeHit') r.anim.play('RobotAC_TakeHit', { loop: false, restart: true }); r.clipT = 0.35;   /* v302 (Алексей: «после удара робот просто полетел вбок»): падает в позе удара, не стоя, и вбок его несёт меньше */
      const cx = Math.round(r.x), cz = Math.round(r.z), fy = Math.floor(r.y + 0.001);
      const vis = dp.vy < 0 && r.y - fy < 0.4 && floorCube(Math.round(toU(r)), fy - 1, toD(r), 'any');   // садится и на видимый уступ другой глубины
      if (dp.vy < 0 && ((hasCube(cx, fy - 1, cz) && !hasCube(cx, fy, cz)) || vis) && r.y - fy < 0.4) { if (vis && !hasCube(cx, fy - 1, cz)) { setUD(r, toU(r), vis.dep); r.x = Math.round(r.x); r.z = Math.round(r.z); r.tx = r.x; r.tz = r.z; } else { r.x = r.tx = cx; r.z = r.tz = cz; } r.y = r.baseY = fy; r.drop = null; r.kv = 0; r.sq = -0.2; r.sqV = 0; game.shake = Math.max(game.shake, 0.08); sfx('Jump_4_landfall', 0.6, 0.6); burst(r.x, r.y + 0.05, r.z, { n: 16, cols: DIRT, sp: [1, 3.4], life: 0.55 }); const fell = dp.y0 - fy; r.hp -= 12 * fell; r.flashT = 0.15; if (r.hp <= 0) damageRobot(r, 1, true); else { r.hitT = 0.5; r.aggro = 0; } }
      else if (r.y < -6 || r.y < dp.y0 - 14) { r.drop = null; r.hp = 0; damageRobot(r, 1, true); r.fallY = -40; r.fvy = dp.vy; }
      continue; }
    /* отброс тяжёлого робота: от удара его чуть подбрасывает и наклоняет, он приземляется с пылью и со скрежетом проезжает по полу, пока трение не остановит; в стену — врезается */
    if (r.kv && !r.dead) {
      if (!r._kn) { r._kn = true; if (Math.abs(r.kv) > 2.5) { r.kvy = Math.min(4, 1.2 + Math.abs(r.kv) * 0.3); r.kh = 0.001; r.kv *= 0.5; } r.anim.play('RobotAC_TakeHit', { loop: false, restart: true }); r.clipT = 0.35; }   /* v296 (Алексей: «бьёшь бота, особенно разъярённого — без анимации просто летит в сторону»): раньше смену клипа глушила защита от дёрганья бега — и его несло в позе бега */ /* тяжёлый: от сильного удара подлетает над полом, от слабого только пошатнётся */
      if (r.kh > 0) { r.kvy -= 26 * dt; r.kh += r.kvy * dt; if (r.kh <= 0) { r.kh = 0; if (r.kvy < -1) { r.sq = -0.18; r.sqV = 0; burst(r.x, r.y + 0.04, r.z, { n: 10, cols: DIRT, sp: [0.8, 2.6], up: 0.6, life: 0.45 }); sfx('Jump_4_landfall', 0.45, 0.7); } r.kvy = 0; } }
      const nu = toU(r) + r.kv * dt, d0 = toD(r);
      if (robotCanStep(r, nu, d0)) { setUD(r, nu, d0); r.tx = Math.round(r.x); r.tz = Math.round(r.z); }
      else if (Math.abs(r.kv) > 2.2 && !overlapsDepth(nu, r.baseY, r.hw, 0.6, d0) && !r.hunter && !(r.rage > 0)) { r.drop = { vy: 1.5, vu: r.kv * 0.35, y0: r.y }; r.kv = 0; r._kn = false; r.kh = 0; showCombo('Сброшен!', true); sfx('RobotHit3', 0.5, 0.7); continue; }   // впереди край — улетает вниз
      else { const sp = Math.abs(r.kv), sg = Math.sign(r.kv);
        if (sp > 3) { r.flashT = 0.1; r.sq = -0.22; r.sqV = 0; r.tiltV = (r.tiltV || 0) - sg * 6; game.shake = Math.max(game.shake, 0.05 + sp * 0.01); sfx('RobotHit5', 0.5, 0.8); burst(r.x + sg * 0.3 * view.r[0], r.y + 0.4, r.z + sg * 0.3 * view.r[1], { n: 8 + Math.round(sp * 2), cols: SPARK.concat(DIRT), sp: [1, 4], up: 1, life: 0.4, dir: -sg });
          r.hp -= Math.round(sp * 1.5); if (r.hp <= 0) { r.kv = 0; damageRobot(r, 1, true); continue; } }   // врезался в стену
        r.kv = -r.kv * 0.15; }
      r.hitT = Math.max(r.hitT || 0, 0.05);   /* пока его несёт — не дерётся и не ходит */
      if (!(r.kh > 0)) { const f = 70 * dt;   /* v303: kh мог быть не задан — тогда трения не было и робот плыл вбок бесконечно */ r.kv = Math.abs(r.kv) <= f ? 0 : r.kv - Math.sign(r.kv) * f;   // трение по полу
        if (Math.abs(r.kv) > 1.5 && Math.random() < dt * 30) parts.push({ x: r.x - Math.sign(r.kv) * 0.2 * view.r[0], y: r.y + 0.03, z: r.z - Math.sign(r.kv) * 0.2 * view.r[1], vx: -Math.sign(r.kv) * rnd(0.5, 2) * view.r[0], vz: -Math.sign(r.kv) * rnd(0.5, 2) * view.r[1], vy: rnd(0.3, 1.2), g: -4, drag: 2, t: 0, life: rnd(0.2, 0.4), size: 1, col: pick(['#fff4e1', '#ffd052', '#9c8a78', '#6f5f56']) }); }
      if (Math.abs(r.kv) < 0.3 && !(r.kh > 0)) { r.kv = 0; r._kn = false; } }
    { const tg = r.kv && !r.dead ? Math.sign(r.kv) * Math.min(0.32, Math.abs(r.kv) * 0.035) * (r.kh > 0 ? -0.6 : 1) : 0;   // на скольжении корпус клонится по ходу, в воздухе — назад
      r.tiltV = (r.tiltV || 0) + ((tg - (r.tilt || 0)) * 90 - (r.tiltV || 0) * 11) * dt; r.tilt = (r.tilt || 0) + r.tiltV * dt; if (r.dead) { r.tilt = 0; r.tiltV = 0; } }
    if (!r.dead && !r.lift && !r.onCloud && hero.state !== 'dead' && hero.onGround && !hero.dash && !(hero.passT > 0) && !(hero.bumpT > 0) && heroMomHit() > 0.45 && hero.standOn !== r && reach(r) && Math.abs(hero.y - r.y) < 0.4) { const du = toU(r) + (r.sh || 0) - toU(hero);
      if (du * hero.face > 0 && Math.abs(du) < r.hw + hero.hw + 0.14) { const dir = hero.face; hero.bumpT = 0.8; sfx('RobotHit5', 0.6, 1.1); game.shake = Math.max(game.shake, 0.07); burst(hero.x + dir * 0.2 * view.r[0], hero.y + 0.35, hero.z + dir * 0.2 * view.r[1], { n: 8, cols: SPARK, sp: [1, 3], life: 0.3 });
        const m = heroMomHit(); hero.mom = m * 0.4; hero.momLost = null;
        if (m < 0.6 && Math.random() < 0.6 - m) { hero.vx = -dir * 2.6; hero.vy = 3; hero.onGround = false; hero.face = dir; go('Kulbit'); }                 // отлетел сам
        else { r.kv = dir * 6 * (1 + 0.6 * m); if (m > 0.5) { r.hp -= Math.round(20 * m); r.sq = -0.25; game.shake = Math.max(game.shake, 0.1 + 0.1 * m); if (r.hp <= 0) { damageRobot(r, 1, true); continue; } } r.hitT = 0.3; r.flashT = 0.12; r.sq = -0.16; r.sqV = 0; r.atk = null; r.face = -dir; r.dir = -dir; r.aggro = 9; r.atkCool = 0.4; r.foe = null; hero.vx *= 0.3; } r.aggro = 9; r.atkCool = Math.min(r.atkCool || 0, 0.6); } }                    // отлетел робот
    if (r.hitT > 0 && r.hunter) r.hitT = Math.min(r.hitT, 0.12);
    if (r.hitT > 0) { r.hitT -= dt; if (r.atk) { if (r.atk.type === 'jump' && !r.atk.done && r.atk.t > 0.22) { const L = r.atk.land; r.x = r.tx = L.x; r.z = r.tz = L.z; r.y = r.baseY = L.y; } r.atk = null; r.charge = 0; r.atkCool = 1.2; } continue; }
    if (r.burn > 0) { r.burn -= dt; r.burnTick = (r.burnTick || 0) + dt; embers(r.x, r.y, r.z, dt, 7); flecks(r.x, r.y, r.z, dt, 10);
      if (r.burnTick >= 1.5 && !(r.rage > 0)) { r.burnTick = 0; r.hp -= 8; r.flashT = 0.1; if (r.hp <= 0) { damageRobot(r, 1, true); continue; } } }
    r.atkCool = Math.max(0, (r.atkCool === undefined ? rnd(1, 3) : r.atkCool) - dt); if (r.shootCool > 0) r.shootCool -= dt; if (r.hopCool > 0) r.hopCool -= dt;
    if (r.rage > 0) { if (!r.hunter) r.rage -= dt; if (r.shootCool > 0) r.shootCool -= dt; if (r.atkCool > 0) r.atkCool -= dt * (r.bossMin ? 1.4 : r.fierce ? 1.1 : 0.67); if (r.rage <= 0) { rageBlast(r); continue; } if (!r.clone && Math.random() < dt * 14) parts.push({ x: r.x + rnd(-0.3, 0.3) * view.r[0], y: r.y + rnd(0.1, 0.8), z: r.z + rnd(-0.3, 0.3) * view.r[1], vx: 0, vz: 0, vy: rnd(0.5, 1.4), g: -0.3, drag: 1, t: 0, life: rnd(0.3, 0.6), size: 1, col: pick(['#ff3a1a', '#ff7014', '#c0392b']) }); }
    if (r.atk) { robotAttack(r, dt); continue; }
    if (r.rage > 0) {                     // гонится за героем: рядом — бьёт без передышки, иначе идёт к нему или прыгает на его площадку
      const ru = toU(r) + (r.sh || 0), hu = toU(hero), du = hu - ru, ad = Math.abs(du), dy = hero.y - r.y, dir = du >= 0 ? 1 : -1, live = hero.state !== 'dead' && !hero.inDoor && !hero.hideN && Math.abs(toD(hero) - toD(r)) <= 1.1;
      r.face = dir; r.dir = dir; r.hide = 1; let acted = false;
      const facing = !view.rotating && Math.abs(norm180(r.fa - view.k * 90)) < 1, close = live && ad < 0.85 && Math.abs(dy) < 0.5;
      if (close && facing) { if (r.atkCool <= 0 && botAtkOk(r)) { if (r.clone) { robotStartAtk(r, 'punch', dir, null); if (r.atk) { r.cl = ((r.cl || 0) + 1) % 5; r.atk.cl = ['HandAttack1', 'HandAttack2', 'HandAttack3', 'LegsAttackUp1', 'LegsAttackUp2'][r.cl]; } r.atkCool = rnd(0.3, 0.6); }   /* v313: клон бьёт сериями, как герой */
        else if (r.fierce) { const v = Math.random(); if (v < 0.18) robotStartAtk(r, 'steam', dir, null); else if (v < 0.3 && !(r.shootCool > 0)) { robotStartAtk(r, 'shoot', dir, null); r.shootCool = rnd(2, 3); if (r.atk) r.atk.twice = true; } else { robotStartAtk(r, 'punch', dir, null); if (r.atk && Math.random() < 0.45) r.atk.shove = true; } r.atkCool = rnd(0.35, 0.7); }   /* v312 (Алексей: «злые боты с камеры не бьют агрессивно, не используют все навыки»): пар, двойной выстрел, удар с отбросом */
        else robotStartAtk(r, Math.random() < 0.2 ? 'steam' : 'punch', dir, null); botAtkStarted(); } acted = true; }
      else if (hero.state !== 'dead' && !hero.inDoor && !view.rotating && r.atkCool <= 0 && !r.onCloud && botAtkOk(r)) {
        if (live && facing && !r.clone && !(r.shootCool > 0) && ad > 1.4 && ad < 7 && Math.abs(dy) < 0.55 && Math.abs(toD(hero) - toD(r)) <= NEAR_D && Math.random() < 0.5 && robotLineLen(r, dir, ad) >= ad - 0.25) { robotStartAtk(r, 'shoot', dir, null); r.shootCool = rnd(3, 4.4); botAtkStarted(); acted = true; }   // в ярости стреляет часто
        else if (!live || Math.abs(dy) > 0.4 || ad > 1.5) { const land = rageLanding(r); if (land) { robotStartAtk(r, 'jump', dir, land); botAtkStarted(); r.hx = Math.abs(land.x) >= Math.abs(land.z) ? 0 : 1; r.hz = r.hx ? 0 : 1; acted = true; } else r.atkCool = 0.25; }   // длинный прыжок к герою, хоть на другую сторону ноги
      }
      if (!acted && live && facing && ad > 0.6 && !r.onCloud) { const nu = toU(r) + dir * 2.55 * (r.bossMin ? 1.7 : r.clone ? 1.6 : r.fierce ? 1.25 : 1) * botDiff(r).spd * dt, d0 = toD(r); if (robotCanStep(r, nu, d0)) { setUD(r, nu, d0); r.tx = Math.round(r.x); r.tz = Math.round(r.z); robotAnim(r, 'RobotAC_Run'); acted = true; } }
      if (!acted || (r.atk === null && ad <= 0.6)) robotAnim(r, 'RobotAC_Stay');
      continue;
    }
    if (hero.ride && hero.ride.r === r && hero.ride.mode === 'hang' && !view.rotating) {   // герой висит за спиной: время от времени робот с шансом 20% бьёт назад и вышвыривает его
      r.throwT = (r.throwT === undefined ? 1.2 : r.throwT) - dt;
      if (r.throwT <= 0) { r.throwT = 1.2; if (Math.random() < 0.2) { if (Math.random() < (CFG.taxiChance || 0.005) && startTaxi(r)) continue; const side = -r.dir; r.atk = { type: 'throw', t: 0, dir: side, flip: side < 0, y0: r.y, x0: r.x, z0: r.z, land: null, done: false }; r.anim.play('RobotAC_Punch', { loop: false, restart: true }); continue; } }
    } else r.throwT = 1.2;
    if (r.aggro > 0) { r.aggro -= dt; const hd = toU(hero) - toU(r) - (r.sh || 0); if (hero.state === 'dead' || hero.hideN || Math.abs(hd) > 7) r.aggro = 0; else if (Math.abs(hd) > 0.2 && !(hero.ride && hero.ride.r === r)) { const want = hd > 0 ? 1 : -1; const heard = game.time - (r.hitAt || -9) < 1.2 || (!(hero.sneakT > 0) && Math.abs(hd) < 2.5 && (Math.abs(hero.vx) > 3 || (ST[hero.st] && ST[hero.st].lock))); if (want === r.face) r.turnPend = 0; else if (!heard) { r.turnPend = 0; r.aggro -= dt; } else { r.turnPend = (r.turnPend || 0) + dt; if (r.turnPend >= (r.rage > 0 || r.hunter ? 0.35 : 0.7)) { r.turnPend = 0; r.face = want; r.dir = want; r.sq = -0.1; r.sqV = 0; r.atkCool = Math.max(r.atkCool || 0, 0.35); } } } }   /* тяжёлый: герой зашёл за спину — разворачивается не сразу, а через миг, и после разворота ещё чуть медлит с ударом */   // герой висит на нём самом — не вертится за ним: иначе дёргался туда-сюда каждый кадр
    if (r.meetT > 0) r.meetT -= dt;
    if (r.foe) {                          // сцепился с другим роботом: стоят и месят друг друга кулаками и паром, пока один не развалится
      const o = r.foe, du = toU(o) + (o.sh || 0) - toU(r) - (r.sh || 0);
      if (o.dead || Math.abs(o.y - r.y) > 0.6 || Math.hypot(o.x - r.x, o.z - r.z) > 1.7 || !robotOnScreen(r)) { r.foe = null; r.meetT = 2; }
      else { r.face = Math.abs(du) > 0.12 ? (du > 0 ? 1 : -1) : (robots.indexOf(r) < robots.indexOf(o) ? 1 : -1); r.dir = r.face; robotAnim(r, 'RobotAC_Stay');
        if (r.atkCool <= 0 && !turning && !view.rotating) { r.atkCool = 0.3; robotStartAtk(r, Math.random() < 0.72 ? 'punch' : 'steam', r.face, null); }
        continue; }
    }
    if (!r.clone && r.atkCool <= 0 && !turning && !(r.buckT > 0) && !view.rotating && r.turnWait <= 0 && Math.abs(norm180(r.fa - view.k * 90)) < 1 && (!(r.depthWalk && !r.loop && wasAway) || r.aggro > 0) && botAtkOk(r) && robotPickAttack(r)) { if (r.atk) botAtkStarted(); continue; }
    if (r.turnWait > 0 || r.alert > 0 || turning || r.buckT > 0 || r.aggro > 0) { robotAnim(r, 'RobotAC_Stay'); continue; }
    if (r.coolT > 0) { r.coolT -= dt; robotAnim(r, 'RobotAC_Stay'); continue; }
    r.t -= dt;
    if (r.depthWalk && !r.loop) { if (hero.standOn === r || (hero.ride && hero.ride.r === r) || r.headless || r.stun > 0 || r.burn > 0 || r.foe) { robotAnim(r, 'RobotAC_Stay'); continue; } r.away = true; }
    if (r.loop) r.mode = 'walk';
    if (r.t <= 0) { if (r.mode === 'walk') { r.mode = 'wait'; r.t = rnd(0.4, 0.9); } else { r.mode = 'walk'; r.t = rnd(6, 12); } }
    let moved = false;
    if (r.mode === 'walk') {
      let dx = r.tx - r.x, dz = r.tz - r.z, dist = Math.hypot(dx, dz);
      if (dist < 0.01) { r.x = r.tx; r.z = r.tz; const ph = r.hx * 2 + r.hz; robotNext(r); if (ph !== r.hx * 2 + r.hz) { robotAnim(r, 'RobotAC_Stay'); continue; } dx = r.tx - r.x; dz = r.tz - r.z; dist = Math.hypot(dx, dz); }
      if (dist >= 0.01 && r.mode === 'walk') {
        const stp = Math.min(dist, (r.loop && r.depthWalk ? (toD(r) > Math.abs(toU(r)) - 1.7 ? 1.3 : 3.5) : 0.75 * Math.min(2.2, LVK()) * botDiff(r).spd * (r.away ? 1.8 : 1)) * (r.rust ? 0.45 : 1) * (1 - 0.6 * Math.min(1, (r.soak || 0) / 5)) * dt),   // за стеной, где его не видно, обходчик идёт быстро
         
           nx = r.x + dx / dist * stp, nz = r.z + dz / dist * stp;
        const u = toU(r), dU = (nx - r.x) * view.r[0] + (nz - r.z) * view.r[1], sg = Math.sign(dU);
        let ok = true;
        // навстречу другой робот: чаще разворачивается и уходит, иногда бьёт — и начинается драка
        for (const o of robots) { if (o === r || o.dead || o.atk && o.atk.type === 'jump' || Math.abs(o.y - r.y) > 0.5) continue;
          // впереди по ходу, на своей или соседней дорожке; для обходчиков — ещё и по тому, как они стоят на экране (один мог зайти за угол)
          const ex = o.x - r.x, ez = o.z - r.z, al = (ex * dx + ez * dz) / dist, pp = Math.abs(ex * dz - ez * dx) / dist;
          const su = toU(o) + (o.sh || 0) - toU(r) - (r.sh || 0), scr = Math.abs(su) < 0.62 && su * dU > 0 && Math.abs(toD(o) - toD(r)) < 2.6 && Math.abs(dU) > 1e-5;
          const real = al > 0 && al <= 0.72 && pp <= 1.1;
          if ((!real && !scr) || !robotOnScreen(r) || !robotOnScreen(o)) continue;   // сталкиваются только на глазах у игрока; за кадром расходятся насквозь
          ok = false;
          if (!(r.meetT > 0) && !r.foe && !o.foe) { r.meetT = 3;
            if (!real || Math.abs(su) < 0.3 || Math.random() < 0.7) { r.tx = Math.round(r.x - r.hx * 0.5); r.tz = Math.round(r.z - r.hz * 0.5); r.hx = -r.hx; r.hz = -r.hz; r.hadWall = true; r.ccw = !r.ccw; game.meets = (game.meets || 0) + 1; }
            else { r.foe = o; o.foe = r; r.atkCool = 0; o.atkCool = 0.5; o.meetT = 3; game.fights = (game.fights || 0) + 1; } }
          break; }
        // робот — твёрдое тело: идущий вбок робот толкает героя перед собой, а если тому некуда деться — ждёт
        if (sg !== 0 && hero.state !== 'dead' && !hero.ride && !hero.hang && !hero.hideN && !(hero.passT > 0) && hero.standOn !== r && reach(r) && hero.y < r.y + ROBOT_TOP - 0.03 && hero.y + hero.h > r.y) {
          const hu2 = toU(hero), sum = r.hw + 0.02 + hero.hw, nu = u + dU;
          if (Math.abs(nu - hu2) < sum && (hu2 - u) * sg > 0) {
            const pu = nu + sg * sum;
            if (!overlapsDepth(pu, hero.y, hero.hw, hero.h, toD(hero))) setUD(hero, pu, toD(hero)); else ok = false;
          }
        }
        if (ok) {
          const du0 = toU(r) + r.sh; r.x = nx; r.z = nz; moved = true; r.sh = robotShift(r);
          const dv = toU(r) + r.sh - du0; if (Math.abs(dv) > 1e-5) { r.dir = Math.sign(dv); r.face = r.dir; }   // смотрит туда, куда идёт на экране
          if (hero.standOn === r && hero.onGround && !hero.ride) {   // везёт героя на себе, в том числе вглубь и из глубины
            const cu = toU(hero) + dU, cd = toD(r); if (!overlapsDepth(cu, hero.y, hero.hw, hero.h, cd)) setUD(hero, cu, cd);
          }
        }
      }
    }
    r._moved = moved; robotAnim(r, moved ? 'RobotAC_Run' : 'RobotAC_Stay');
  }
}
function fireSpit(o, dt) { const n = Math.floor(dt * 150 + Math.random()); for (let i = 0; i < n; i++) parts.push({ x: o.x + rnd(-0.05, 0.05) * view.r[0], y: o.y + rnd(-0.05, 0.05), z: o.z + rnd(-0.05, 0.05) * view.r[1], vx: 0, vz: 0, vy: rnd(0.3, 1.3), g: -1.5, drag: 2, t: 0, life: rnd(0.25, 0.55), size: Math.random() < 0.5 ? 3 : 2, col: pick(['#fff6cf', '#ffe07a', '#ffa62e', '#ffa62e', '#ff6a1e']) }); }
function drawRibbon(tr, b, life, fire) {       // след от брошенного клинка: белая лента, у острия толстая, к хвосту сходит на нет; по краю холодная кайма
  if (!tr || tr.length < 2) return; const g = Math.max(2, Math.round(S * 0.026)), now = game.time;
  for (const pass of [0, 1]) for (let i = 1; i < tr.length; i++) { const p = tr[i - 1], q = tr[i], k = 1 - (now - q.t) / life; if (k <= 0) continue; const th = Math.max(1, Math.round((fire ? 5 : 3) * k)) + (pass ? 0 : 2);
    const x0 = W / 2 + relU(p, b) * S, y0 = H / 2 - (p.y - cam.y) * S, x1 = W / 2 + relU(q, b) * S, y1 = H / 2 - (q.y - cam.y) * S, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / g)); if (Math.hypot(x1 - x0, y1 - y0) > S * 2) continue;
    ctx.fillStyle = pass ? (fire ? (k > 0.6 ? '#fff4e1' : '#ffce46') : '#ffffff') : fire ? 'rgba(255,112,20,' + (0.75 * k).toFixed(2) + ')' : 'rgba(143,232,255,' + (0.5 * k).toFixed(2) + ')'; for (let j = 0; j <= n; j++) ctx.fillRect(Math.round((x0 + (x1 - x0) * j / n) / g) * g, Math.round((y0 + (y1 - y0) * j / n) / g) * g - Math.floor(th / 2) * Math.round(g / 2), g, Math.max(1, Math.round(th * g / 2))); }
}
function stickKunai(k, r) { if (r && !r.dead && k.fire) promBurn(r); if (r && !r.dead) { const dir = k.dir || 1; game.hitStop = Math.max(game.hitStop, 0.06); game.shake = Math.max(game.shake, 0.07); knifeSound(true); r.flashT = Math.max(r.flashT || 0, 0.16); r.sq = -0.1; r.sqV = 0; if (!r.kv) r.kv = dir * 1.3;   // воткнулся: звон, искры веером назад, робота дёргает
    burst(k.x, k.y, k.z, { n: 14, cols: SPARK.concat(['#ffffff', '#c9d2d8']), dir: -dir, sp: [1.5, 5.5], up: 1.2, life: 0.35 }); slashes.push({ x: k.x - dir * 0.5 * view.r[0], y: k.y, z: k.z - dir * 0.5 * view.r[1], dir, t: 0.06 }); }
  k.state = 'stuck'; k.t = 0; k.fx = 0.5; k.in = r || null; k.fxAnim = new Anim(); k.fxAnim.play('KunaiAC_Hit', { loop: false, restart: true }); sfx('RobotHit3', 0.35, 1.7);
  if (r) burst(k.x, k.y, k.z, { n: 6, cols: SPARK, dir: -k.dir, sp: [1.5, 3.5], life: 0.3 });
  else { burst(k.x, k.y, k.z, { n: 8, cols: DIRT, dir: k.flat ? 0 : -k.dir, sp: [1, 2.8], life: 0.5 }); if (k.fire) { const fy = k.flat ? k.y - 0.05 : surfaceBelow(toU(k), k.y, toD(k)); if (fy != null && k.y - fy < 1.2) { fires.push({ x: k.x, y: fy, z: k.z, life: rnd(3.5, 5), smk: 0, delay: 0.05, enemy: true, fl: [{ dx: 0, dy: 0, sc: 0.9, flip: Math.random() < 0.5, ph: rnd(0, 9), sp: 1, hot: false }] });   /* огонь робота — в стиле пламени героя */ burst(k.x, fy + 0.1, k.z, { n: 10, cols: ['#ffd052', '#ff7014', '#e8501a'], sp: [0.8, 2.6], up: 1.6, life: 0.45 }); } } } }
function updateKunais(dt) {
  for (let i = kunaiRegen.length - 1; i >= 0; i--) { kunaiRegen[i] -= dt; if (kunaiRegen[i] <= 0) { kunaiRegen.splice(i, 1); hero.kunai = Math.min(kunaiMax(), hero.kunai + 1); updateHUD(); } }
  const hu = toU(hero), hd = toD(hero);
  for (const k of kunais) {
    k.t += dt; if (k.fx > 0) { k.fx -= dt; k.fxAnim.update(dt); }
    if (k.state === 'fly') {
      k.anim.update(dt);
      const d = toD(k), u = toU(k) + (k.drop ? 0 : k.dir * k.sp * dt); k.vy -= (k.drop ? 9 : k.ret ? 0 : k.t < 0.5 ? 0 : 6) * dt;   // v297: полсекунды (≈8 кубов) прямо, потом вниз
      if (!k.drop) { (k.tr || (k.tr = [])).push({ x: k.x, y: k.y, z: k.z, t: game.time }); if (k.tr.length > 14) k.tr.shift(); if (k.fire) fireSpit(k, dt);
        for (const f of fires) { if (f.delay > 0 || (k.fed && k.fed.has(f)) || Math.abs(f.x - k.x) + Math.abs(f.z - k.z) > 0.45 || k.y < f.y - 0.2 || k.y > f.y + 1.0) continue; (k.fed || (k.fed = new Set())).add(f); f.life += 1.5; if (f.prom) { f.s = Math.min(1, (f.s == null ? 0.4 : f.s) + 0.35); f.src = null; if (f.life0) f.life0 += 1.5; } else for (const q of f.fl) q.sc = Math.min(1.6, q.sc * 1.2); burst(f.x, f.y + 0.3, f.z, { n: 9, cols: ['#ffd052', '#ff7014', '#e8501a'], sp: [0.8, 2.8], up: 1.8, life: 0.45 }); }
        k.ang = Math.atan2(k.vy, k.sp);
        k.trailT -= dt;
        if (k.trailT <= 0) {            // след из полупрозрачных пикселей и редкий блик
          k.trailT = 0.014; parts.push({ x: k.x, y: k.y + rnd(-0.012, 0.012), z: k.z, vx: 0, vz: 0, vy: 0, g: 0, drag: 0, t: 0, life: 0.26, size: 1, col: '#fff4e1', a: 0.75 });
          if (Math.random() < 0.3) parts.push({ x: k.x + rnd(-0.05, 0.05) * view.r[0], y: k.y + rnd(-0.05, 0.05), z: k.z + rnd(-0.05, 0.05) * view.r[1], vx: 0, vz: 0, vy: rnd(-0.3, 0.3), g: 0, drag: 0, t: 0, life: 0.16, size: 1, col: '#bff0f0', a: 1, glint: true });
        }
      }
      if (k.ret) { const dx = hu - toU(k), dy = hero.y + 0.45 - k.y, L = Math.hypot(dx, dy); if (L < 0.5 || hero.state === 'dead') { k.state = 'lost'; hero.kunai = Math.min(kunaiMax(), hero.kunai + 1); updateHUD(); sfx('RUN_1_13', 0.35, 2.0); continue; }
        k.dir = Math.sign(dx) || 1; k.sp = Math.abs(dx) / L * 19; k.vy = dy / L * 19; if (k.t > 2.5) { k.state = 'lost'; hero.kunai = Math.min(kunaiMax(), hero.kunai + 1); updateHUD(); continue; } }
      const y = k.y + k.vy * dt, T = Math.floor(k.y + 1e-6);
      let hitR = null;
      for (const r of robots) {
        if (r.dead || !reachD(r, d)) continue;
        const rs = robotSprite(r), rb = spriteBox(rs.name, toU(r) + rs.ox, r.y + 0.39, rs.flip);
        if (rb && u > rb[0] + 0.05 && u < rb[1] - 0.05 && y > rb[2] && y < rb[3]) { hitR = r; break; }
      }
      const a = cellAt(Math.round(u), Math.floor(y));
      for (const c of crates) if (!(c.broken && (c.tv === undefined || c.gone)) && !propHidden(c) && Math.abs(u - toU(c)) < 0.22 && y > c.y && y < c.y + 0.44) { hitCrate(c, k.dir); hitCrate(c, k.dir); }
      if (userHitAt(u, y, k.dir)) { /* v251: кунай бьёт свой предмет */ }
      if (hitR && k.ret && (k.hitSet || (k.hitSet = new Set())).has(hitR)) hitR = null;
      if (k.ret) { if (hitR) { k.hitSet.add(hitR); PLOG.kill = 'кунай'; damageRobot(hitR, CFG.kunaiDamage * 0.6); PLOG.kill = ''; burst(k.x, k.y, k.z, { n: 8, cols: SPARK, sp: [1.5, 4], life: 0.3 }); knifeSound(true); } setUD(k, u, d); k.y = y; continue; }   /* v297: возврат — сквозь стены, по пути режет роботов */
      if (hitR) { if (k.elec) { zapRobot(hitR, 3); zapSound(0.4, 0.2); hitR.stun = Math.max(hitR.stun || 0, 0.9); hitR.atk = null; hitR.flashT = 0.1; }   /* с вилкой кунай бьёт током */
        PLOG.kill = 'кунай'; const back = (toU(hero) - toU(hitR)) * (hitR.face || hitR.dir) < 0; damageRobot(hitR, CFG.kunaiDamage * (k.ret ? 0.6 : 1)); PLOG.kill = '';
        if (!hitR.dead && !(hitR.rage > 0) && !hitR.bossMin) { if (hitR.atk && hitR.atk.type !== 'jump' && !hitR.atk.done) { hitR.atk = null; hitR.charge = 0; popups.push({ x: hitR.x, y: hitR.y + 1.1, z: hitR.z, text: 'Сбил атаку!', t: 0 }); } hitR.hitT = Math.max(hitR.hitT || 0, back ? 0.6 : 0.3); hitR.kv = (hitR.kv || 0) + k.dir * 1.6; }   /* v297: кунай сбивает замах (пар, выстрел, удар) и пошатывает */ k.du = Math.max(-0.22, Math.min(0.22, u - toU(hitR) + rnd(-0.06, 0.06))); k.dy = y - hitR.y + rnd(-0.04, 0.04); setUD(k, u, d); k.y = y; if (hitR.dead) { k.drop = true; k.vy = 0; k.t = 1; } else stickKunai(k, hitR); }
      else if (a && a.some(c => c.dep >= d - DEPTH_TOL)) { setUD(k, u - k.dir * 0.08, d); k.y = y; stickKunai(k); }          // воткнулся в стену
      else if (k.vy < 0 && y <= T && floorCube(Math.round(u), T - 1, d, 'any')) { const fc = floorCube(Math.round(u), T - 1, d, 'any'); setUD(k, u, fc.dep); k.y = T + 0.05; k.flat = true; stickKunai(k); }   // упал на поверхность
      else if (k.t > 3 || y < -8) { k.state = 'lost'; kunaiRegen.push(CFG.kunaiRegen); }                                      // улетел за карту
      else { setUD(k, u, d); k.y = y; }
    } else if (k.state === 'stuck') {
      if (k.in) { setUD(k, toU(k.in) + k.du, toD(k.in)); k.y = k.in.y + k.dy; }     // торчит в роботе и ездит вместе с ним
      // герой наступил или дотронулся — забрал
      if (k.t > 0.35 && hero.state !== 'dead' && Math.abs(toU(k) - hu) < (k.in ? 0.62 : 0.4) && k.y > hero.y - 0.35 && k.y < hero.y + 0.95 && Math.abs(toD(k) - hd) <= 1.6) {
        k.state = 'lost'; hero.kunai = Math.min(kunaiMax(), hero.kunai + 1); updateHUD(); sfx('RUN_1_13', 0.35, 2.0);
      }
    }
  }
  kunais = kunais.filter(k => k.state !== 'lost');
}


// v297: кунаев не осталось — L зовёт обратно все воткнутые (как копьё в Hades): летят к руке сквозь стены и режут роботов по пути
function recallKunais() { let n = 0; for (const k of kunais) if (k.state === 'stuck' || (k.state === 'fly' && k.drop)) { if (k.in && !k.in.dead) { const r = k.in; PLOG.kill = 'кунай'; damageRobot(r, CFG.kunaiDamage * 0.5, true); PLOG.kill = ''; r.flashT = 0.12; } k.state = 'fly'; k.ret = true; k.in = null; k.drop = false; k.flat = false; k.t = 0; k.hitSet = new Set(); n++; }
  if (n) { sfx('RUN_1_13', 0.5, 1.4); knifeSound(false); popups.push({ x: hero.x, y: hero.y + 1.1, z: hero.z, text: 'Кунаи — ко мне!', t: 0, heal: true }); } return n; }
// ====================== ТЕСТ-РЕЖИМ И СПОКОЙНОЕ НАЧАЛО (v230) ======================
// Алексей 13.10: «для теста сделаем кнопку с годмодом, всеми предметами и случайным оружием из трёх». Клавиша T или кнопка «тест».
// Бессмертие: урон не проходит, давка и пропасть не убивают (из пропасти — назад к старту). Предметы (сапоги) и оружие выдаются заново
// после рестарта и новой карты, пока режим включён.
// Спокойное начало: после выхода из туннеля (и после гибели) роботы game.calmT секунд не замечают героя — «атаковать сразу из выхода не будут».
const TEST_WPN = ['knife', 'fork', 'prom'], CALM_AFTER_EXIT = 8;
function testGiveWeapon() {
  const w = pick(TEST_WPN), st = hero.wStats || (hero.wStats = {});
  hero.knife = hero.prom = hero.fork = false;
  if (w === 'knife') { hero.knife = true; st.knife = st.knife || rollStat(); if (knifeItem) knifeItem.got = true; }
  else if (w === 'prom') { hero.prom = true; hero.promOrb = 4; st.prom = st.prom || rollStat(); if (promItem) promItem.got = true; }
  else { hero.fork = true; if (hero.fCharge === undefined) hero.fCharge = FORK_MAX; st.fork = st.fork || rollStat(); if (forkItem) forkItem.got = true; }
  return ITEM_DEFS[w].name;
}
function testGive(say) {
  hero.items = hero.items || {}; for (const k of ['spider', 'hermes']) if (!hero.items[k]) hero.items[k] = 1;
  updateItemsBar(); const wn = hero.knife || hero.prom || hero.fork ? null : testGiveWeapon(); updateHUD();
  if (say) showCombo('Тест: бессмертие, сапоги Гермеса и паука' + (wn ? ', оружие: ' + wn : ''), true);
}
function testToggle() {
  game.god = !game.god; plog('тест', game.god ? 'включён' : 'выключен');
  if (game.god) { if (hero.knife || hero.prom || hero.fork) hero.knife = hero.prom = hero.fork = false; testGive(true); if (typeof TAL !== 'undefined' && !game.godCogs) { game.godCogs = true; TAL.bank += 40; if (typeof talSave === 'function') talSave(); updateHUD(); } }   /* v313: таланты в тесте — покупать, на это 40 шестерёнок (раз за забег) */ else { hero.invuln = 0; showCombo('Тест выключен', true); }
  testBtnShow();
}
function testBtnShow() { const b = document.getElementById('testBtn'); if (b) b.classList.toggle('on', !!game.god); }
function testTick(dt) {
  if (game.calmT > 0) game.calmT -= dt;
  if (!game.god || hero.state === 'dead') return;
  hero.invuln = Math.max(hero.invuln || 0, 0.3); if (hero.hp < heroMaxHP()) { hero.hp = heroMaxHP(); updateHUD(); }
  if (!hero.items || !hero.items.hermes || !(hero.knife || hero.prom || hero.fork)) testGive(false);   // после рестарта и новой карты
}
function testSaveFromDeath() {   // вызывается из killHero: в тест-режиме смерти нет
  if (!game.god) return false; hero.hp = heroMaxHP();
  // v280 (Алексей 21.10: «снова после падения с руки возрождаешься в темноте»): упал в пропасть в тест-режиме — переносит в начало,
  // но вид оставался прежним (например, с востока, откуда видны руки), а начальная комната видна только со своей стороны — вокруг темнота.
  // Теперь — как при обычном возрождении: вид на начальную сторону, камера сразу у героя, герой не «на руке».
  if (hero.y < -6) { const S = LEVEL.spawn || LEVEL.start; hero.arm = null; hero.armSv = 0; Object.assign(hero, { x: S.x, y: S.y + 0.05, z: S.z, vx: 0, vy: 0, hang: null, ride: null, ladder: null, onGround: false, standOn: null, frontT: 0 });
    if (view.k !== 0) setView(0); cam.x = hero.x; cam.y = hero.y + 1.2; cam.z = hero.z; cam.gy = null; }
  else { hero.vy = 4; hero.onGround = false; }
  return true;
}
// ====================== ИНТЕРФЕЙС ======================
const $ = id => document.getElementById(id);
function toggleCombos() { const el = $('combos'); if (!el) return; el.hidden = !el.hidden; const b = $('combosBtn'); if (b) b.classList.toggle('act', !el.hidden); }
{ const b = document.getElementById('combosBtn'); if (b) b.addEventListener('click', toggleCombos); }
{ const b = document.getElementById('testBtn'); if (b) b.addEventListener('click', () => { testToggle(); canvas.focus(); }); }   // v230: тест-режим
{ const b = document.getElementById('musicBtn'); if (b) { b.addEventListener('click', () => { toggleMusic(); canvas.focus(); }); musicBtnShow(); } }
function updateHUD() {
  updateItemsBar();
  const el = $('hp'); let s = '';
  if (game.hpSeen !== undefined && hero.hp < game.hpSeen && hero.hp >= 0) { game.hurtT = 0.7; el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, t: 0, hp: true, text: '−1 ♥' }); }
  game.hpSeen = hero.hp;
  s += '<img class="hudbar" alt="" src="tex/ui/hp' + Math.max(0, Math.min(5, hero.hp)) + '.png">'; if (hero.hp > 5) s += '<em>+' + (hero.hp - 5) + '</em>';   // полоска жизней автора
  for (let i = 0; i < (hero.armor || 0); i++) s += '<i class="arm"></i>';
  if (el._h !== s) { el._h = s; el.innerHTML = s; }
  { const kn = Math.max(0, Math.min(3, hero.kunai)), ke = $('kunai'); if (ke._n !== kn) { ke._n = kn; ke.innerHTML = '<img class="hudbar" alt="" src="tex/ui/kun' + kn + '.png">'; } }
  { const el = $('fch'); if (el) { let h = ''; if (hero.fork) { const fc = Math.max(0, Math.floor((hero.fCharge || 0) + 0.001)); h = '<img class="hudbar" alt="" src="tex/ui/ele' + Math.min(5, fc) + '.png">' + (fc > 5 ? '<em>+' + (fc - 5) + '</em>' : ''); }   /* заряды вилки — полоска электричества автора */ if (el._h !== h) { el._h = h; el.innerHTML = h; el.hidden = !h; } } }
  $('side').textContent = ['Юг', 'Восток', 'Север', 'Запад'][view.k];
  $('alt').textContent = heroAlt() + ' / ' + LEVEL.towerTop;
  $('bots').textContent = robots.filter(r => !r.dead).length;
  $('bits').textContent = bitsGot + ' / ' + bitsTotal; if ($('cogs')) $('cogs').textContent = TAL.bank; if (typeof talHudSync === 'function') talHudSync();
  { const K = (c1, c2, c3) => '<svg viewBox="0 0 7 11" shape-rendering="crispEdges"><path fill="' + c1 + '" d="M1 0h5v1h1v4h-1v1h-1v5h-3v-5h-1v-1h-1v-4h1z"/><path fill="' + c2 + '" d="M2 1h3v1h1v2h-1v1h-1v5h-1v-5h-1v-1h-1v-2h1z"/><path fill="' + c1 + '" d="M3 2h1v2h-1z"/><path fill="' + c2 + '" d="M4 7h2v1h-2zM4 9h2v1h-2z"/><path fill="' + c3 + '" d="M2 1h1v1h-1z"/></svg>';
    let h = ''; if (hero.keys > 0) h += '<i data-k="k">' + K('#1d5a50', '#7fd1b0', '#bff0f0') + (hero.keys > 1 ? '<em>×' + hero.keys + '</em>' : '') + '</i>';
    for (const n of [1, 2]) if (hero.gk && hero.gk[n]) h += '<i data-k="g' + n + '">' + K(GATE_COL[n][0], GATE_COL[n][1], GATE_COL[n][2]) + '</i>'; if (hero.redKey) h += '<i data-k="r">' + K('#6a1410', '#e0402a', '#ffb09a') + '</i>';
    if (hero.prom) h += '<i data-k="p"><svg viewBox="0 0 7 11" shape-rendering="crispEdges"><path fill="#ff7014" d="M1 2h1v-2h1v2h1v-1h1v2h1v2h-6v-2z"/><path fill="#ffce46" d="M2 3h3v2h-3z"/><path fill="#2a2226" d="M0 5h7v5h-1v1h-5v-1h-1z"/><path fill="#c98a5e" d="M1 6h5v3h-5z"/><path fill="#e8b58a" d="M1 6h5v1h-5z"/></svg></i>';
    if (hero.knife) h += '<i data-k="n"><svg viewBox="0 0 7 11" shape-rendering="crispEdges"><path fill="#2a2226" d="M2 0h2v1h1v6h1v1h-1v3h-3v-3h-1v-1h1z"/><path fill="#cfd9de" d="M3 1h1v6h-1z"/><path fill="#8f9ca5" d="M2 2h1v5h-1z"/><path fill="#6b4a3a" d="M2 8h2v2h-2z"/></svg></i>';
    const el2 = $('keys'); if (el2._h !== h) { const had = new Set((el2._k || [])); el2._h = h; el2.innerHTML = h; el2.hidden = !h; const now = []; for (const c of el2.children) { now.push(c.dataset.k); if (!had.has(c.dataset.k)) c.classList.add('pop'); } el2._k = now; } } if ($('lvl')) $('lvl').textContent = game.level || 1; if ($('alarm')) { const left = Math.max(0, CFG.finaleAfter - (game.levelT || 0)); $('alarm').textContent = game.finale ? 'ОБЛАВА' : Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'); }
}
let comboT = 0;
function showCombo(name, plain) { if (!plain) plog('комбо', name); const el = $('combo'); el.textContent = plain ? name : 'Комбо: ' + name; el.classList.add('show'); comboT = plain ? 1.6 : 1.2; }

// ====================== ПАНЕЛЬ «КАРТЫ» (v242, шаг 1б) ======================
// Карты хранятся и файлом у себя (Ctrl+S / Ctrl+O, перетащить), и в общем хранилище рядом с игрой:
// файл карты — вложение игры (assets), список — документы maps/<id> (db): name, seed, by, author, at, asset, kb.
// Читать список могут все, у кого есть ссылка; сохранять и удалять — владелец и редакторы (правило db и assets).
// Вне claude.ai (локальные тесты, сохранённая страница) window.claude нет — панель показывает только файлы.
const MAPS = { db: null, assets: null, user: null, dl: null, list: [], unsub: null, ready: false, canWrite: false, names: {} };
const capUse = n => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(n).catch(() => null) : Promise.resolve(null);
function mapsMsg(t) { const m = $('mapsMsg'); if (m) m.textContent = t || ''; }
function mapsInit() {
  if (MAPS.ready) return; MAPS.ready = true;
  capUse('downloads').then(d => { MAPS.dl = d; });
  Promise.all([capUse('db'), capUse('assets'), capUse('user')]).then(async ([db, assets, user]) => {
    MAPS.db = db; MAPS.assets = assets; MAPS.user = user;
    if (!db) { mapsRender(); return; }
    MAPS.canWrite = !!assets && (user ? !!(await user.canEdit().catch(() => false)) : true);
    MAPS.unsub = db.collection('maps').orderBy('at', 'desc').limit(200).onSnapshot(s => { MAPS.list = s.docs.map(d => Object.assign({ id: d.id }, d.data())); mapsNames(); mapsRender(); }, e => { MAPS.list = []; mapsMsg('Общий список недоступен (' + e.code + ')'); mapsRender(); });
    mapsRender(); });
}
async function mapsNames() {   // имена авторов — по id, каждый раз заново (имена не храним)
  if (!MAPS.user || !MAPS.user.profiles) return; const ids = [...new Set(MAPS.list.map(m => m.author).filter(Boolean))]; if (!ids.length) return;
  try { const ps = await MAPS.user.profiles(ids); for (const id of ids) MAPS.names[id] = (ps[id] && ps[id].name) || ''; mapsRender(); } catch (e) {}
}
function mapsRender() {
  const el = $('mapsList'); if (!el) return; el.textContent = '';
  const shared = $('mapsShared'); if (shared) shared.hidden = !MAPS.db;
  const sv = $('mapsSaveRow'); if (sv) sv.hidden = !(MAPS.db && MAPS.canWrite);
  const cur = $('mapsCur'); if (cur) cur.textContent = 'Сейчас: ' + (game.mapFileName ? '«' + game.mapFileName + '»' : 'карта ' + LEVEL.seed) + (game.mapFileText ? ' (из файла)' : '');
  if (!MAPS.db) { const p = document.createElement('p'); p.textContent = 'Общий список карт работает на странице игры в claude.ai. Здесь — только файлы.'; el.appendChild(p); return; }
  if (!MAPS.list.length) { const p = document.createElement('p'); p.textContent = 'В общих пока нет ни одной карты.'; el.appendChild(p); return; }
  for (const m of MAPS.list) {
    const row = document.createElement('div'); row.className = 'mrow';
    const t = document.createElement('span'); t.className = 'mname'; t.textContent = m.name || ('Карта ' + m.seed);
    const i = document.createElement('span'); i.className = 'minfo'; const who = MAPS.names[m.author]; const d = m.at ? new Date(m.at) : null;
    i.textContent = 'карта ' + m.seed + (who ? ' · ' + who : '') + (d ? ' · ' + d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');
    const o = document.createElement('button'); o.type = 'button'; o.textContent = 'Играть'; o.addEventListener('click', () => mapsOpen(m));
    row.append(t, i, o);
    if (MAPS.canWrite) { const x = document.createElement('button'); x.type = 'button'; x.textContent = 'Удалить'; x.addEventListener('click', () => mapsDelete(m, x)); row.append(x); }
    el.appendChild(row); }
}
async function mapsSaveShared() {
  if (!MAPS.db || !MAPS.assets || !game.mapText) return; const inp = $('mapsName'), name = (inp.value || '').trim().slice(0, 80) || ('Карта ' + LEVEL.seed), b = $('mapsSave');
  b.disabled = true; mapsMsg('Сохраняю…');
  try {
    const m = JSON.parse(game.mapText); m.name = name; const text = mapPretty(JSON.stringify(m));
    const up = await MAPS.assets.upload(new Blob([text], { type: 'application/json' }), { type: 'application/json' });
    const author = MAPS.user && MAPS.user.id ? await MAPS.user.id().catch(() => null) : null;
    await MAPS.db.collection('maps').doc().set({ name, seed: LEVEL.seed, by: GRK_VER, author: author || null, at: new Date().toISOString(), asset: up.id, kb: Math.round(text.length / 1024) });
    inp.value = ''; mapsMsg('Сохранено в общие: «' + name + '»');
  } catch (e) { mapsMsg('Не сохранилось: ' + (e && (e.code || e.message) || e)); }
  b.disabled = false;
}
async function mapsOpen(m) {
  mapsMsg('Загружаю «' + (m.name || m.seed) + '»…');
  try { const r = await fetch('/_blob/' + m.asset); if (!r.ok) throw new Error('файл карты не найден (' + r.status + ')'); const t = await r.text();
    game.mapFileName = m.name || ''; mapOpenText(t, m.name); mapsMsg('Играем «' + (m.name || m.seed) + '»'); mapsRender();
  } catch (e) { mapsMsg('Не открылось: ' + (e && (e.code || e.message) || e)); }
}
async function mapsDelete(m, btn) {
  if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = 'Точно?'; setTimeout(() => { btn.dataset.sure = ''; btn.textContent = 'Удалить'; }, 3000); return; }
  btn.disabled = true;
  try { await MAPS.db.collection('maps').doc(m.id).delete(); try { await MAPS.assets.delete(m.asset); } catch (e) {} mapsMsg('Удалено: «' + (m.name || m.seed) + '»'); }
  catch (e) { mapsMsg('Не удалилось: ' + (e && (e.code || e.message) || e)); btn.disabled = false; }
}
function toggleMaps() {
  const el = $('maps'); if (!el) return; el.hidden = !el.hidden; const b = $('mapsBtn'); if (b) b.classList.toggle('act', !el.hidden);
  if (!el.hidden) { mapsInit(); mapsMsg(''); mapsRender(); }
}
{ const b = document.getElementById('mapsBtn'); if (b) b.addEventListener('click', toggleMaps);
  const s = document.getElementById('mapsSave'); if (s) s.addEventListener('click', mapsSaveShared);
  const f = document.getElementById('mapsFileSave'); if (f) f.addEventListener('click', () => mapDownload());
  const o = document.getElementById('mapsFileOpen'); if (o) o.addEventListener('click', () => mapPickFile());
  const n = document.getElementById('mapsName'); if (n) n.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mapsSaveShared(); } }); }
// ---------- v244: связь с редактором (editor.html) ----------
// Редактор кладёт карту в sessionStorage 'grk_test' и открывает игру: игра играет её сразу (без экрана «Начать»),
// в верхней строке — «◀ редактор» (вернуть эту карту в редактор через 'grk_edit'). Если хранилище браузера недоступно —
// редактор передаёт карту из общих ссылкой index.html#map=<файл>.
function edStoreS(key, val) { try { if (val === undefined) return sessionStorage.getItem(key); if (val === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, val); return true; } catch (e) { return val === undefined ? null : false; } }
{ const t = edStoreS('grk_test'); let h = null; if (t) { edStoreS('grk_test', null); try { h = JSON.parse(t); } catch (e) {} }
  if (h && h.text) { try { const m = JSON.parse(h.text); if (m && m.grk === MAP_VER) { game.mapFileText = JSON.stringify(m); game.mapFileName = h.name || ''; game.fromEditor = { asset: h.asset || null }; game.autoStart = true; } } catch (e) {} }
  const hm = /[#&]map=(\w{8,64})/.exec(location.hash || ''); if (!game.fromEditor && hm) { game.fromEditor = { asset: hm[1] }; game.autoStart = true;
    fetch('/_blob/' + hm[1]).then(r => r.ok ? r.text() : Promise.reject(new Error(String(r.status)))).then(tx => { const go2 = () => { if (!game.mapText) { setTimeout(go2, 200); return; } mapOpenText(tx, 'из редактора'); }; go2(); }).catch(e => showCombo('Карта из редактора не загрузилась: ' + e.message, true)); }
  const b = document.getElementById('edBackBtn'); if (b) { b.hidden = !game.fromEditor; b.addEventListener('click', toEditor); }
  const o = document.getElementById('mapsEditor'); if (o) o.addEventListener('click', toEditor);
  const se = document.getElementById('startEdBtn'); if (se) se.addEventListener('click', toEditor); }   /* v253: с первого экрана — сразу в редактор (с картой, что загружена) */
function toEditor() {   // текущую карту — в редактор
  const ok = game.mapText && edStoreS('grk_edit', JSON.stringify({ text: game.mapText, name: game.mapFileName || '', asset: game.fromEditor && game.fromEditor.asset || null }));
  if (!ok && game.mapText) showCombo('Браузер не дал передать карту — редактор откроет свою последнюю', true);
  location.href = 'editor.html';
}
// v250: карточки своих предметов из общей библиотеки (db 'lib') — игра рисует копии по свежей карточке (USERLIB, ядро 13d_userprops.js)
frameFromDocs([]);   /* v259: кадры из этого браузера сразу */
capUse('db').then(db => { if (!db) return; db.collection('lib').limit(2000).onSnapshot(s => { frameFromDocs(s.docs.map(d => d.data())); for (const k of Object.keys(USERLIB)) delete USERLIB[k]; for (const d of s.docs) { const v = d.data(); if (v.kind !== 'part' && v.kind !== 'frame' && v.kind !== 'sprite' && v.kind !== 'clip') USERLIB[d.id] = v; } USERLOOK.clear(); }, () => {}); });
// ====================== ТАЛАНТЫ ГЕРОЯ И ОРУЖИЯ (v301, v312) ======================
// Алексей 25.10: «чтобы шестерёнки не были зря, добавь самое первое дерево талантов, которое касается самого перса».
// Алексей 26.10 (v312): «немного переделаем таланты и добавим таланты оружию; иконку в стиле интерфейса, у оружия — своя; в основных — талант
// выдирать шнур (без него недоступно), крюк тоже талант в начале; у оружия все комбо — таланты, плюс предложи ещё».
// Шестерёнки и таланты живут до конца забега (новая игра — с нуля). B или значок-шестерёнка — дерево героя; значок оружия (появляется, когда
// оружие в руках) — дерево этого оружия; в окне Q / E (курки) — вкладки. Игра на паузе. Ветки по порядку: следующий — после предыдущего.
// Без таланта приём не работает: над героем подсказка «нужен талант …». Тест-режим (T) таланты не открывает — даёт шестерёнки, чтобы купить.
const g9 = s => s.split('|');   // значок 9×9: строки через |
const TAL_TREES = {
  hero: { name: 'Герой', ico: 'tal', branches: [
    { name: 'Движение', col: '#f2c35a', items: [
      { id: 'hook', cost: 1, name: 'Крюк', desc: 'H — бросить крюк: зацепиться за уступ, притянуть робота, H H — подлететь к нему',
        ico: g9('....XXX..|...X...X.|...X...X.|....X..X.|.......X.|......X..|.....X...|....X....|XXXX.....') },
      { id: 'm1', cost: 3, name: 'Цепкие руки', desc: 'Край уступа ловится шире: рука тянется выше и дальше вбок',
        ico: g9('..X.X.X..|..X.X.X..|.XXXXXX..|.XXXXXX.X|.XXXXXXXX|..XXXXXX.|..XXXXX..|...XXX...|...XXX...') },
      { id: 'm2', cost: 6, name: 'Двойной прыжок', desc: 'Второй прыжок в воздухе — всегда, без Сапог Гермеса',
        ico: g9('....X....|...XXX...|..XXXXX..|....X....|...XXX...|..XXXXX..|....X....|....X....|..XXXXX..') },
      { id: 'm3', cost: 10, name: 'Толчок от стены', desc: 'Прижался к стене в прыжке — Пробел отталкивает вверх и в сторону, без Сапог паука',
        ico: g9('X........|X...X....|X..XX....|X.XXXXXX.|X..XX....|X...X....|X........|X........|X........') },
      { id: 'm4', cost: 15, name: 'Пружина', desc: 'Прыжок с земли, если держать, выше на четверть куба',
        ico: g9('.XXXXXXX.|....X....|..XXXXX..|..X...X..|..XXXXX..|..X...X..|..XXXXX..|....X....|.XXXXXXX.') }] },
    { name: 'Выживание', col: '#e6504a', items: [
      { id: 's1', cost: 3, name: 'Крепкое сердце', desc: '+1 жизнь в начале и после гибели',
        ico: g9('.XX...XX.|XXXX.XXXX|XXXXXXXXX|XXXXXXXXX|.XXXXXXX.|..XXXXX..|...XXX...|....X....|.........') },
      { id: 's2', cost: 6, name: 'Пятая пластина', desc: 'Носить можно пять пластин брони, а не четыре',
        ico: g9('XXXXXXXXX|X.......X|X.XXXXX.X|X.XXXXX.X|X.XXXXX.X|.X.XXX.X.|..X.X.X..|...XXX...|....X....') },
      { id: 's3', cost: 10, name: 'Щедрые осколки', desc: 'Жизнь — за каждые 8 осколков, а не за 10',
        ico: g9('....X....|...XXX...|..XX.XX..|.XX...XX.|XX..X..XX|.XX...XX.|..XX.XX..|...XXX...|....X....') },
      { id: 's4', cost: 15, name: 'Второе дыхание', desc: 'Раз за уровень смертельный удар оставляет 1 жизнь и 2 секунды неуязвимости',
        ico: g9('....X....|....X....|..XXXXX..|....X....|....X....|.XX...XX.|XXXX.XXXX|.XXXXXXX.|...XXX...') }] },
    { name: 'Бой', col: '#7fd8ff', items: [
      { id: 'rip', cost: 2, name: 'Вырвать шнур', desc: 'Висишь на плече робота (или вышел из тени) — F F F: выдрать ему шнур из спины',
        ico: g9('X........|.X.......|..X..XXX.|...XX...X|....X...X|...X.X.X.|..X...X..|.X.......|X........') },
      { id: 'c1', cost: 3, name: 'Чутьё', desc: 'Замах робота перед ударом заметнее и дольше — F успеваешь нажать',
        ico: g9('.........|..XXXXX..|.X.....X.|X..XXX..X|X..X.X..X|X..XXX..X|.X.....X.|..XXXXX..|.........') },
      { id: 'c2', cost: 6, name: 'Хладнокровие', desc: 'За частые увороты робот ловит только с четвёртого за 6 секунд, а не с третьего',
        ico: g9('X...X...X|.X..X..X.|..X.X.X..|...XXX...|XXXXXXXXX|...XXX...|..X.X.X..|.X..X..X.|X...X...X') },
      { id: 'c3', cost: 10, name: 'Вырваться', desc: 'Робот схватил за шею — жми F три раза быстро, пока не ударил: вырвешься',
        ico: g9('XX.....XX|X.X...X.X|.X.X.X.X.|..X...X..|.........|..X...X..|.X.X.X.X.|X.X...X.X|XX.....XX') },
      { id: 'c4', cost: 15, name: 'Контрудар', desc: 'После уворота F следующий удар в течение 1.5 секунды — вдвое сильнее',
        ico: g9('X.......X|.X.....X.|..X...X..|...X.X...|....X....|...X.X...|..X...X..|XX.....XX|XX.....XX') }] }] },
  knife: { name: 'Нож', ico: 'tal_knife', branches: [
    { name: 'Приёмы', col: '#e8e0c8', items: [
      { id: 'k1', cost: 2, name: 'Выпад клинком', desc: '→ → J с ножом: длинный выпад двумя ударами (без таланта — простой рывок)',
        ico: g9('.........|.........|X.....X..|XX.....X.|XXXXXXXXX|XX.....X.|X.....X..|.........|.........') },
      { id: 'k2', cost: 4, name: 'Нож, нож, нога', desc: 'J J K вплотную: два удара ножом и удар ногой в голову',
        ico: g9('......X..|.....X...|....X....|XXXX.....|...X..XX.|...X.XXXX|..X..XXXX|..X...XX.|.........') },
      { id: 'k3', cost: 7, name: 'Кунай и два ножа', desc: 'L J J: бросил кунай — герой переносится к нему и бьёт ножом дважды',
        ico: g9('X.......X|.X.....X.|..X...X..|.........|....X....|...XXX...|....X....|...X.X...|..X...X..') }] },
    { name: 'Клинок', col: '#9fd0e0', items: [
      { id: 'k4', cost: 3, name: 'Заточка', desc: 'Нож бьёт на четверть сильнее',
        ico: g9('........X|.......XX|......XX.|.....XX..|....XX...|...XX....|..XX.....|.X.......|X........') },
      { id: 'k5', cost: 6, name: 'Вскрыть щит', desc: 'Два удара ножом в щит — и щит сломан',
        ico: g9('.XXXXXXX.|XX..X..XX|X...X...X|X..X....X|X...X...X|.X..X..X.|..X.X.X..|...XXX...|....X....') },
      { id: 'k6', cost: 9, name: 'Подрезать', desc: 'Каждый третий удар ножом подряд оглушает робота почти на секунду',
        ico: g9('X...X...X|.X..X..X.|..X.X.X..|.........|XXX...XXX|.........|..X.X.X..|.X..X..X.|X...X...X') }] }] },
  fork: { name: 'Вилка', ico: 'tal_fork', branches: [
    { name: 'Приёмы', col: '#8fe8ff', items: [
      { id: 'f1', cost: 2, name: 'Разрядный рывок', desc: '→ → J с вилкой: рывок сквозь робота, он в шоке почти секунду',
        ico: g9('.....X...|....XX...|XXXXXXX..|....XX...|.....X...|..X......|.XX......|XXXXXXX..|.XX......') },
      { id: 'f2', cost: 3, name: 'Удар сверху', desc: 'J в прыжке — удар вилкой вниз',
        ico: g9('.X.X.X...|.X.X.X...|.XXXXX...|...X.....|...X.....|...X.....|.X.X.X...|..XXX....|...X.....') },
      { id: 'f3', cost: 5, name: 'Поток тока', desc: 'Держать J — поток тока из вилки, перескакивает на соседей',
        ico: g9('X........|.X..X....|..XX.X...|.....X..X|......XX.|.....X...|....X.X..|...X...X.|.........') },
      { id: 'f4', cost: 8, name: 'Вилка в гнездо', desc: 'F за спиной робота: вилка в гнездо, держать F — выкачивать ток, 5 секунд — робот обесточен',
        ico: g9('XXXXXXXXX|X.......X|X..X.X..X|X..X.X..X|X.......X|X..XXX..X|X...X...X|X...X...X|XXXXXXXXX') },
      { id: 'f5', cost: 11, name: 'Тяга', desc: 'Вилка в гнезде или идёт поток — H: крюк тащит робота из-за спины в этого',
        ico: g9('XX.......|X.X......|X..X.....|.X..X....|..X..XXXX|...X....X|....XXXXX|.........|.........') }] },
    { name: 'Ток', col: '#c4f4ff', items: [
      { id: 'f6', cost: 3, name: 'Ёмкость', desc: 'Поток тока тратит заряд на треть медленнее',
        ico: g9('..XXXXX..|.XX...XX.|.X.....X.|.X.XXX.X.|.X.....X.|.X.XXX.X.|.X.....X.|.X.XXX.X.|.XXXXXXX.') },
      { id: 'f7', cost: 6, name: 'Цепная молния', desc: 'Поток перескакивает дальше и почти не слабеет от робота к роботу',
        ico: g9('X.....X..|.X...X.X.|..X.X...X|...X.....|.........|....X...X|...X.X.X.|..X...X..|.X.......') },
      { id: 'f8', cost: 9, name: 'Изоляция', desc: 'Удар током в воде больше не бьёт тебя самого',
        ico: g9('...XXX...|..X...X..|.X.....X.|.X.XXX.X.|XX.X.X.XX|X..XXX..X|X.......X|.X.....X.|..XXXXX..') }] }] },
  prom: { name: 'Руки Прометея', ico: 'tal_prom', branches: [
    { name: 'Приёмы', col: '#ff9a3a', items: [
      { id: 'p1', cost: 2, name: 'Огненный рывок', desc: '→ → J: летишь огненным шаром вдвое дальше, на полу остаётся огонь',
        ico: g9('.....XX..|...XXXXX.|XXXXXXXXX|...XXXXX.|.....XX..|.........|X.X.X.X..|.........|.........') },
      { id: 'p2', cost: 4, name: 'Огненный шар', desc: 'Держать J секунду — вперёд уходит огненный шар, робот взрывается',
        ico: g9('...X.X...|..X.X.X..|.X.XXX.X.|..XXXXX..|.XXXXXXX.|..XXXXX..|.X.XXX.X.|..X.X.X..|...X.X...') },
      { id: 'p3', cost: 7, name: 'Реактивный прыжок', desc: 'Второй прыжок выше — из рук бьют огненные струи вниз',
        ico: g9('....X....|...XXX...|..XXXXX..|....X....|....X....|..X.X.X..|..X...X..|.X.X.X.X.|X.X...X.X') },
      { id: 'p4', cost: 9, name: 'Огненные кунаи', desc: 'Кунаи с Руками Прометея горят и поджигают робота',
        ico: g9('.X.X.....|X.X.X....|.XXX.....|..XXX....|...XXX...|....XXX..|.....XX..|......XX.|.......XX') }] },
    { name: 'Пламя', col: '#ffce46', items: [
      { id: 'p5', cost: 3, name: 'Жар', desc: 'Горящий робот получает от тебя на треть больше урона',
        ico: g9('....X....|...XX....|...XXX.X.|..XXXXXX.|.XXX.XXX.|.XX...XX.|.XX...XX.|..XX.XX..|...XXX...') },
      { id: 'p6', cost: 6, name: 'Долгое пламя', desc: 'Робот горит 9 секунд, а не 6',
        ico: g9('..XXXXX..|.X..X..X.|X...X...X|X...X...X|X...XXX.X|X.......X|.X.....X.|..XXXXX..|.........') },
      { id: 'p7', cost: 9, name: 'Огненная волна', desc: 'Огненный шар при взрыве поджигает всех роботов рядом',
        ico: g9('.........|X.......X|.X.XXX.X.|..X...X..|.X..X..X.|..X...X..|.X.XXX.X.|X.......X|.........') }] }] },
};
const TAL = { bank: 0, own: new Set(), open: false, tab: 'hero', sel: [0, 0], msg: '', msgT: 0 };
(function talLoad() { try { const d = JSON.parse(localStorage.getItem('grkTal') || 'null'); if (d) { TAL.bank = d.bank | 0; TAL.own = new Set(d.own || []); } } catch (e) {} })();
function talReset() { TAL.bank = 0; TAL.own.clear(); talSave(); if (typeof game !== 'undefined') game.godCogs = false; if (typeof dcReset === 'function') dcReset(); if (typeof updateHUD === 'function') try { updateHUD(); } catch (e) {} }   // v309: новая игра (запуск, R) — шестерёнки и таланты с нуля
function talSave() { try { localStorage.setItem('grkTal', JSON.stringify({ bank: TAL.bank, own: [...TAL.own] })); } catch (e) {} }
function talHas(id) { return TAL.own.has(id); }
// приём доступен: талант взят или проверка (window.__allTal). v313 (Алексей: «комбо сразу доступны, когда берёшь оружие»): тест-режим больше не открывает таланты — он даёт 40 шестерёнок
const talOK = id => TAL.own.has(id) || !!(typeof window !== 'undefined' && window.__allTal);
const talItem = id => { for (const k in TAL_TREES) for (const b of TAL_TREES[k].branches) for (const it of b.items) if (it.id === id) return it; return null; };
function talNeed(id) {   // для приёма нужен талант: есть — true; нет — подсказка над героем (не чаще раза в 1.5 с) и false
  if (talOK(id)) return true; const it = talItem(id);
  if (game.talNeedId !== id || !(game.time - (game.talNeedT || -9) < 1.5)) { game.talNeedT = game.time; game.talNeedId = id; popups.push({ x: hero.x, y: hero.y + 1.3, z: hero.z, text: 'Нужен талант «' + (it ? it.name : id) + '» — ⚙ B', t: 0 }); sfx('RUN_1_13', 0.25, 0.6); }
  return false; }
function talAdd(n) { TAL.bank += n; talSave(); }
const heroMaxHP = () => dcHas('twolives') ? 2 : CFG.heroHP + (talHas('s1') ? 1 : 0);
function talApplyItems() { hero.items = hero.items || {}; if (talHas('m2')) hero.items.hermes = 1; if (talHas('m3')) hero.items.spider = 1; if (typeof updateItemsBar === 'function') updateItemsBar(); }
const heroWpnKey = () => hero.knife ? 'knife' : hero.fork ? 'fork' : hero.prom ? 'prom' : null;
function talTabs() { const w = heroWpnKey(); return w ? ['hero', w] : ['hero']; }
const talBr = () => TAL_TREES[TAL.tab].branches;
function talState(b, t) { const br = talBr()[b], it = br.items[t]; if (talHas(it.id)) return 'own'; if (t > 0 && !talHas(br.items[t - 1].id)) return 'locked'; return TAL.bank >= it.cost ? 'buy' : 'poor'; }
function talBuy(b, t) { const it = talBr()[b].items[t], st = talState(b, t);
  if (st === 'own') { TAL.msg = 'Уже есть'; } else if (st === 'locked') { TAL.msg = 'Сначала — предыдущий талант этой ветки'; } else if (st === 'poor') { TAL.msg = 'Не хватает шестерёнок: нужно ' + it.cost; }
  else { TAL.bank -= it.cost; TAL.own.add(it.id); talSave(); TAL.msg = 'Взято: ' + it.name; sfx('RobotHit5', 0.5, 1.6); sfx('RUN_1_13', 0.5, 2.2); if (it.id === 'm2' || it.id === 'm3') talApplyItems(); if (it.id === 's1') { hero.hp++; } updateHUD(); }
  TAL.msgT = 2; }
function talSetTab(tab) { if (!TAL_TREES[tab]) tab = 'hero'; TAL.tab = tab; const B = talBr(); TAL.sel[0] = Math.min(TAL.sel[0], B.length - 1); TAL.sel[1] = Math.min(TAL.sel[1], B[TAL.sel[0]].items.length - 1); TAL.msg = ''; }
function talToggle(on, tab) { TAL.open = on === undefined ? !TAL.open : on; game.talOpen = TAL.open; const c = talCanvas(); c.hidden = !TAL.open; if (TAL.open) { TAL.sel = [0, 0]; talSetTab(tab && talTabs().includes(tab) ? tab : 'hero'); talDraw(); } }
function talCanvas() { let c = document.getElementById('talCv'); if (c) return c;
  c = document.createElement('canvas'); c.id = 'talCv'; c.hidden = true; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:40;image-rendering:pixelated;cursor:pointer';
  (document.getElementById('stage') || document.body).appendChild(c);
  c.addEventListener('click', e => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * c.width, y = (e.clientY - r.top) / r.height * c.height;
    const tb = (TAL.tabBoxes || []).find(q => x >= q[0] && x <= q[0] + q[2] && y >= q[1] && y <= q[1] + q[3]); if (tb) { talSetTab(tb[4]); talDraw(); return; }
    const hit = (TAL.boxes || []).find(q => x >= q[0] && x <= q[0] + q[2] && y >= q[1] && y <= q[1] + q[2]);
    if (hit) { if (TAL.sel[0] === hit[3] && TAL.sel[1] === hit[4]) talBuy(hit[3], hit[4]); else TAL.sel = [hit[3], hit[4]]; talDraw(); } else if (y < c.height * 0.1 && x > c.width * 0.85) talToggle(false); });
  return c; }
function talTick() {   // пауза: стрелки/стик — выбор, J или A — взять, Q / E (курки) — вкладка, B (клавиша) / K / Esc — закрыть
  const B = talBr(), tabs = talTabs();
  if (pressed.has('rotL') || pressed.has('rotR')) { const i = Math.max(0, tabs.indexOf(TAL.tab)); talSetTab(tabs[(i + (pressed.has('rotR') ? 1 : tabs.length - 1)) % tabs.length]); }
  else { if (pressed.has('left')) TAL.sel[0] = (TAL.sel[0] + B.length - 1) % B.length; if (pressed.has('right')) TAL.sel[0] = (TAL.sel[0] + 1) % B.length;
    const n = talBr()[TAL.sel[0]].items.length; TAL.sel[1] = Math.min(TAL.sel[1], n - 1);
    if (pressed.has('up')) TAL.sel[1] = Math.max(0, TAL.sel[1] - 1); if (pressed.has('sit')) TAL.sel[1] = Math.min(n - 1, TAL.sel[1] + 1);
    if (pressed.has('arm') || pressed.has('jump')) talBuy(TAL.sel[0], TAL.sel[1]); }
  if (pressed.has('tal') || pressed.has('leg') || pressed.has('_esc')) { talToggle(false); return; }
  if (TAL.msgT > 0) TAL.msgT -= 1 / 60; talDraw();
}
addEventListener('keydown', e => { if (TAL.open && (e.code === 'Escape' || e.code === 'Enter')) { pressed.add(e.code === 'Enter' ? 'arm' : '_esc'); e.preventDefault(); } });
const talImg = {}; function talIcon(n) { if (!talImg[n]) { const im = new Image(); im.onload = () => { if (TAL.open) talDraw(); }; im.src = 'tex/ui/' + n + '.png?v=' + GRK_VER; talImg[n] = im; } return talImg[n]; }
function talDraw() {
  const c = talCanvas(), cw = c.clientWidth || innerWidth, ch = c.clientHeight || innerHeight, P = Math.max(2, Math.floor(Math.min(cw / 200, ch / 140)));
  if (c.width !== Math.round(cw / P) * P || c.height !== Math.round(ch / P) * P) { c.width = Math.round(cw / P) * P; c.height = Math.round(ch / P) * P; }
  const x = c.getContext('2d'), Wc = c.width, Hc = c.height, G = '#e0a040', GD = '#7a5428', GB = '#ffe08a', BG = '#16121c', T = TAL_TREES[TAL.tab], BR = T.branches;
  x.imageSmoothingEnabled = false; x.fillStyle = 'rgba(14,10,18,0.94)'; x.fillRect(0, 0, Wc, Hc);
  const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(Math.round(a), Math.round(b), Math.round(w), Math.round(h)); };
  // рамка с уголками
  const m = P * 6; R(m, m, Wc - 2 * m, P, G); R(m, Hc - m - P, Wc - 2 * m, P, G); R(m, m, P, Hc - 2 * m, G); R(Wc - m - P, m, P, Hc - 2 * m, G);
  for (const [cx, cy] of [[m, m], [Wc - m, m], [m, Hc - m], [Wc - m, Hc - m]]) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) R(cx + (cx > Wc / 2 ? -1 - i : i) * P, cy + (cy > Hc / 2 ? -1 - j : j) * P, P, P, '#b4723a');
  for (let i = 0; i < 40; i++) { const sx = ((i * 9301 + 49297) % 233280) / 233280 * Wc, sy = ((i * 4973 + 1013) % 233280) / 233280 * Hc; R(sx, sy, P, P, i % 3 ? '#4a3420' : '#8a6030'); }
  const font = (sz, col) => { x.font = Math.round(sz) + 'px "Russo One", "PT Mono", monospace'; x.fillStyle = col; x.textBaseline = 'middle'; };
  font(P * 6, G); x.textAlign = 'right'; x.fillText('⚙ ' + TAL.bank, Wc - m - P * 8, m + P * 10); x.textAlign = 'left'; font(P * 4, '#8a7050'); x.fillText('B — закрыть', m + P * 6, m + P * 10);
  // вкладки: герой и оружие в руках (значок-плашка + название)
  const tabs = talTabs(); TAL.tabBoxes = []; { const tw = P * 50, gap = P * 4, tx0 = Wc / 2 - (tabs.length * tw + (tabs.length - 1) * gap) / 2, ty = m + P * 4, th = P * 13;
    tabs.forEach((k, i) => { const on = k === TAL.tab, tx = tx0 + i * (tw + gap); R(tx, ty, tw, th, on ? '#2a1e14' : BG); const fc = on ? GB : GD; R(tx, ty, tw, P, fc); R(tx, ty + th - P, tw, P, fc); R(tx, ty, P, th, fc); R(tx + tw - P, ty, P, th, fc);
      const im = talIcon(TAL_TREES[k].ico); if (im.complete && im.width) x.drawImage(im, Math.round(tx + P * 2), Math.round(ty + P * 1.5), Math.round(P * 10.3), Math.round(P * 10)); font(P * 4.4, on ? GB : '#8a7050'); x.textAlign = 'left'; x.fillText(TAL_TREES[k].name, tx + P * 14, ty + th / 2 + P * 0.5);
      TAL.tabBoxes.push([tx, ty, tw, th, k]); });
    if (tabs.length > 1) { font(P * 3.4, '#8a7050'); x.textAlign = 'center'; x.fillText('Q / E — вкладки', Wc / 2, ty + th + P * 4); } }
  // корень — значок вкладки
  const rootC = P * 12, top = m + P * 30 + rootC / 2, ly0 = top + rootC / 2 + P * 4, maxT = Math.max(...BR.map(b => b.items.length)), avail = Hc - ly0 - m - P * 46, cell = Math.max(P * 8, Math.min(P * 18, Math.floor(avail / (maxT * 1.3) / P) * P)), rootX = Wc / 2, gapX = Math.min(Wc * 0.27, P * 64), y0 = ly0 + P * 12 + cell / 2, gapY = cell * 1.3;
  { const im = talIcon(T.ico); if (im.complete && im.width) x.drawImage(im, Math.round(rootX - rootC * 0.52), Math.round(top - rootC / 2), Math.round(rootC * 1.04), Math.round(rootC)); }
  const icon = (ico, cx, cy, col) => { const u = Math.max(1, Math.floor(cell / 13)); for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) if (ico[j][i] === 'X') R(cx - 4.5 * u + i * u, cy - 4.5 * u + j * u, u, u, col); };
  TAL.boxes = []; const nb = BR.length;
  for (let b = 0; b < nb; b++) { const bx = rootX + (b - (nb - 1) / 2) * gapX, br = BR[b], ly = ly0;
    R(rootX - P / 2, top + rootC / 2, P, P * 4, G); R(Math.min(rootX, bx), ly, Math.abs(bx - rootX) + P, P, G); R(bx - P / 2, ly, P, P * 2, G); R(bx - P / 2, ly + P * 8, P, y0 - cell / 2 - ly - P * 8, G);
    font(P * 4.4, br.col); x.textAlign = 'center'; x.fillText(br.name, bx, ly + P * 5);
    for (let t = 0; t < br.items.length; t++) { const cy = y0 + t * gapY, st = talState(b, t), it = br.items[t], sel = TAL.sel[0] === b && TAL.sel[1] === t;
      if (t < br.items.length - 1) R(bx - P / 2, cy + cell / 2, P, gapY - cell, st === 'own' ? G : GD);
      const fr = st === 'own' ? GB : st === 'buy' ? G : st === 'poor' ? '#a06a30' : '#4a3a2a';
      R(bx - cell / 2, cy - cell / 2, cell, cell, BG); R(bx - cell / 2, cy - cell / 2, cell, P, fr); R(bx - cell / 2, cy + cell / 2 - P, cell, P, fr); R(bx - cell / 2, cy - cell / 2, P, cell, fr); R(bx + cell / 2 - P, cy - cell / 2, P, cell, fr);
      for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) R(bx + ox * cell / 2 - P, cy + oy * cell / 2 - P, P * 2, P * 2, fr);   // заклёпки по углам
      if (st === 'locked') { font(cell * 0.6, '#5a4a3a'); x.textAlign = 'center'; x.fillText('?', bx, cy + P); }
      else icon(it.ico, bx, cy, st === 'own' ? br.col : st === 'buy' ? GB : '#8a6a48');
      if (st !== 'own') { font(P * 4, st === 'buy' ? GB : '#7a6040'); x.textAlign = 'left'; x.fillText('⚙' + it.cost, bx + cell / 2 + P * 2, cy + cell / 2 - P * 3); }
      if (sel) { const s2 = cell + P * 4; R(bx - s2 / 2, cy - s2 / 2, s2, P, '#ffffff'); R(bx - s2 / 2, cy + s2 / 2 - P, s2, P, '#ffffff'); R(bx - s2 / 2, cy - s2 / 2, P, s2, '#ffffff'); R(bx + s2 / 2 - P, cy - s2 / 2, P, s2, '#ffffff'); }
      TAL.boxes.push([bx - cell / 2, cy - cell / 2, cell, b, t]); } }
  // описание выбранного
  const it = BR[TAL.sel[0]].items[TAL.sel[1]], st = talState(TAL.sel[0], TAL.sel[1]), by = Hc - m - P * 22;
  R(m + P * 6, by - P * 4, Wc - 2 * m - P * 12, P, GD);
  font(P * 6, GB); x.textAlign = 'left'; x.fillText((st === 'locked' ? '? ' : '') + it.name + (st === 'own' ? '  ✓' : '  ⚙' + it.cost), m + P * 8, by + P * 3);
  font(P * 4.2, '#d8c8a8'); x.fillText(it.desc, m + P * 8, by + P * 11);
  font(P * 3.6, '#8a7050'); x.textAlign = 'right'; x.fillText(TAL.msgT > 0 && TAL.msg ? TAL.msg : 'стрелки — выбрать · J / A / клик — взять · шестерёнки — из экранов и роботов', Wc - m - P * 8, by + P * 18);
}
// значки в полоске интерфейса: шестерёнка (таланты героя) и, когда оружие в руках, — значок оружия с меткой (его таланты)
function talHudSync() { const el = document.getElementById('talWpn'); if (!el) return; const w = heroWpnKey(); if (el._w !== w) { el._w = w; el.hidden = !w; if (w) el.querySelector('img').src = 'tex/ui/' + TAL_TREES[w].ico + '.png?v=' + GRK_VER; el.title = w ? 'Таланты: ' + TAL_TREES[w].name : ''; } }
{ const b = () => { const el = document.getElementById('talBtn'); if (el) el.addEventListener('click', () => { if (game.started && hero.state !== 'dead') talToggle(); });
    const ew = document.getElementById('talWpn'); if (ew) ew.addEventListener('click', () => { if (game.started && hero.state !== 'dead') talToggle(true, heroWpnKey()); }); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', b); else b(); }
// ====================== КАРТЫ СМЕРТИ: выбор после гибели, отравление, удар током, клон, темнота ======================
// v310. Герой погиб → на экране три карты из тех, что ещё не взяты; выбираешь одну — и только потом возрождаешься.
function dcOffer() { const left = DC_CARDS.filter(c => !DC.own.has(c.id) && (c.id !== 'nojump' || talOK('hook')));   /* v312: без крюка «без прыжков» не выпадает */ for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
  DC.offer = left.slice(0, 3).map(c => c.id); DC.sel = Math.min(1, DC.offer.length - 1); return DC.offer.length > 0; }
function dcOpen() { if (!dcOffer()) return false; DC.open = true; game.dcOpen = true; const c = dcCanvas(); c.hidden = false; dcDraw(); sfx('RobotDeathD', 0.4, 0.6); return true; }
function dcTake(i) { const id = DC.offer[i]; if (!id) return; DC.own.add(id); DC.open = false; game.dcOpen = false; dcCanvas().hidden = true; plog('карта смерти', dcCard(id).name);
  dcApplyLevel(); if (hero.ladder && !(LEVEL.ladders || []).includes(hero.ladder)) hero.ladder = null; if (id === 'clone') game.cloneT = 1; if (id === 'cams' && typeof cams !== 'undefined') { const old = cams; placeCams(); spawnCams(); cams = cams.map(n => old.find(o => o.x === n.x && o.y === n.y && o.z === n.z) || n); for (const c of cams) c.len = CAM_LEN * 1.45; plog('камеры', 'стало ' + cams.length + ' (было ' + old.length + ')'); }   /* v312 (Алексей: «карта — камер больше не стало»): новые камеры сразу, а не со следующего уровня */
  respawn(); showCombo('Карта смерти: ' + dcCard(id).name, true); updateHUD(); }
function dcCanvas() { let c = document.getElementById('dcCv'); if (c) return c;
  c = document.createElement('canvas'); c.id = 'dcCv'; c.hidden = true; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:41;image-rendering:pixelated;cursor:pointer';
  (document.getElementById('stage') || document.body).appendChild(c);
  c.addEventListener('click', e => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * c.width, y = (e.clientY - r.top) / r.height * c.height; const i = (DC.boxes || []).findIndex(q => x >= q[0] && x <= q[0] + q[2] && y >= q[1] && y <= q[1] + q[3]);
    if (i >= 0) { if (DC.sel === i) dcTake(i); else { DC.sel = i; dcDraw(); } } });
  return c; }
function dcTick() { if (pressed.has('left')) DC.sel = (DC.sel + DC.offer.length - 1) % DC.offer.length; if (pressed.has('right')) DC.sel = (DC.sel + 1) % DC.offer.length;
  if (pressed.has('arm') || pressed.has('jump')) { dcTake(DC.sel); return; } dcDraw(); }
function dcDraw() {
  const c = dcCanvas(), cw = c.clientWidth || innerWidth, ch = c.clientHeight || innerHeight, P = Math.max(2, Math.floor(Math.min(cw / 200, ch / 130)));
  if (c.width !== Math.round(cw / P) * P || c.height !== Math.round(ch / P) * P) { c.width = Math.round(cw / P) * P; c.height = Math.round(ch / P) * P; }
  const x = c.getContext('2d'), Wc = c.width, Hc = c.height, BG = '#2e2438'; x.imageSmoothingEnabled = false; x.fillStyle = 'rgba(20,14,26,0.95)'; x.fillRect(0, 0, Wc, Hc);
  const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(Math.round(a), Math.round(b), Math.round(w), Math.round(h)); };
  const font = (sz, col) => { x.font = Math.round(sz) + 'px "Russo One", "PT Mono", monospace'; x.fillStyle = col; x.textBaseline = 'middle'; x.textAlign = 'center'; };
  for (let i = 0; i < 50; i++) { const sx = ((i * 9301 + 49297) % 233280) / 233280 * Wc, sy = ((i * 4973 + 1013) % 233280) / 233280 * Hc; R(sx, sy, P, P, i % 4 ? '#3a2e46' : '#5a4a6a'); }   // звёзды фона
  font(P * 8, '#e8d8f0'); x.fillText('КАРТА СМЕРТИ', Wc / 2, P * 12); font(P * 4.4, '#9a88aa'); x.fillText('выбери, что в игре станет хуже — до конца забега', Wc / 2, P * 20);
  const n = DC.offer.length, cwd = Math.min(Math.floor((Wc - P * 24) / 3), P * 64), chh = Math.min(Hc - P * 46, Math.round(cwd * 1.55)), gap = P * 8, x0 = Wc / 2 - (n * cwd + (n - 1) * gap) / 2, y0 = P * 28; DC.boxes = [];
  DC.offer.forEach((id, i) => { const cd = dcCard(id), cx = x0 + i * (cwd + gap), sel = DC.sel === i, lift = sel ? -P * 3 : 0, cy = y0 + lift, col = cd.col;
    R(cx, cy, cwd, chh, BG);   // тонкая рамка с отступом и уголками, как на картах-примерах
    const m = P * 3; R(cx + m, cy + m, cwd - 2 * m, P, col); R(cx + m, cy + chh - m - P, cwd - 2 * m, P, col); R(cx + m, cy + m, P, chh - 2 * m, col); R(cx + cwd - m - P, cy + m, P, chh - 2 * m, col);
    for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const px = ax ? cx + cwd - m - P * 3 : cx + m, py = ay ? cy + chh - m - P * 3 : cy + m; R(px, py, P * 3, P, col); R(px + (ax ? P * 2 : 0), py - (ay ? P * 2 : 0) + (ay ? P * 2 : 0), P, P * 3, col); }
    R(cx + cwd / 2 - P * 6, cy + m - P * 2, P * 12, P, col); R(cx + cwd / 2 - P, cy + m - P * 4, P * 2, P * 2, col);   // знак сверху
    const u = Math.max(P, Math.floor(cwd * 0.5 / 9 / P) * P), icx = cx + cwd / 2, icy = cy + chh * 0.4;   // значок
    for (let j = 0; j < 9; j++) for (let k = 0; k < 9; k++) if (cd.ico[j][k] === 'X') R(icx - 4.5 * u + k * u, icy - 4.5 * u + j * u, u, u, j < 3 ? '#e8e0f0' : col);
    for (let s = 0; s < 8; s++) { const a = s / 8 * 6.283 + i, rr = cwd * 0.36; R(icx + Math.cos(a) * rr, icy + Math.sin(a) * rr * 1.2, P, P, s % 2 ? col : '#5a4a6a'); }   // точки вокруг значка
    font(P * 4.6, '#f0e6f6'); x.fillText(cd.name, cx + cwd / 2, cy + chh * 0.72);
    font(P * 3.4, '#b8a8c8'); const words = cd.desc.split(' '), lines = []; let ln = ''; for (const w2 of words) { const t = ln ? ln + ' ' + w2 : w2; if (x.measureText(t).width > cwd - P * 12) { lines.push(ln); ln = w2; } else ln = t; } if (ln) lines.push(ln);
    lines.forEach((l, k) => x.fillText(l, cx + cwd / 2, cy + chh * 0.8 + k * P * 5));
    if (sel) { const s2 = P * 2; R(cx - s2, cy - s2, cwd + 2 * s2, P, '#ffffff'); R(cx - s2, cy + chh + s2 - P, cwd + 2 * s2, P, '#ffffff'); R(cx - s2, cy - s2, P, chh + 2 * s2, '#ffffff'); R(cx + cwd + s2 - P, cy - s2, P, chh + 2 * s2, '#ffffff'); }
    DC.boxes.push([cx, cy, cwd, chh]); });
  font(P * 3.6, '#7a6a8a'); x.fillText('стрелки — выбрать · J / A / клик — взять' + (DC.own.size ? ' · уже взято: ' + DC.own.size : ''), Wc / 2, Hc - P * 8);
}
// ---- отравление и удар током по герою
function heroPoison(t) { if (!(hero.poisonT > 0)) { showCombo('Отравлен!', true); plog('урон', 'отравление'); } hero.poisonT = Math.max(hero.poisonT || 0, t); }
function heroShock(t) { hero.crashT = Math.max(hero.crashT || 0, t); hero.shockT = Math.max(hero.shockT || 0, t); hero.vx = 0; burst(hero.x, hero.y + 0.5, hero.z, { n: 14, cols: ['#ffffff', '#8fe8ff', '#bff0ff'], sp: [1, 3.5], up: 1, life: 0.35 }); sfx('RobotHit5', 0.35, 1.9); }
function updateDC(dt) {
  if (hero.state === 'dead') return;
  if (hero.shockT > 0) { hero.shockT -= dt; if (Math.random() < dt * 25) parts.push({ x: hero.x + rnd(-0.2, 0.2) * view.r[0], y: hero.y + rnd(0.1, 0.9), z: hero.z + rnd(-0.2, 0.2) * view.r[1], vx: 0, vz: 0, vy: rnd(-0.5, 0.5), g: 0, drag: 3, t: 0, life: 0.15, size: 1, col: pick(['#ffffff', '#8fe8ff']) }); }
  if (hero.poisonT > 0) { hero.poisonT -= dt; hero.poisonAcc = (hero.poisonAcc || 0) + dt; if (Math.random() < dt * 6) parts.push({ x: hero.x + rnd(-0.2, 0.2) * view.r[0], y: hero.y + rnd(0.4, 0.9), z: hero.z, vx: 0, vz: 0, vy: rnd(0.4, 1), g: 0, drag: 1, t: 0, life: 0.6, size: 2, col: pick(['#8adc5a', '#5aa83a', '#c8f08a']) });
    if (hero.poisonAcc >= 2.5) { hero.poisonAcc = 0; if (!(hero.invuln > 0)) { PLOG.why = 'отравление'; loseHP(); updateHUD(); popups.push({ x: hero.x, y: hero.y + 1.1, z: hero.z, text: '-1 ☠', t: 0 }); if (hero.hp <= 0) killHero(); } } }
  else hero.poisonAcc = 0;
  { const wd = hero.wetDrip || 0; if (dcHas('poison') && wd > (hero.wdPrev || 0) + 0.001) heroPoison(6); hero.wdPrev = wd; }   /* v311 (Алексей: «любая вода отравлена — и из гидранта, и из бассейна»): любая вода, от которой герой намок */
  if (dcHas('clone')) cloneTick(dt);
}
// ---- клон: тёмный двойник героя. v313 (Алексей: «делает атаки робота, а не героя; слишком активно преследует — пусть просто бегает по карте,
// а то сразу находит; умирает — пусть просто исчезает»): появляется далеко (6–16 кубов по высоте), бродит по уступам и перепрыгивает;
// гонится, только когда герой рядом и на виду (до 5.5 кубов, своя глубина), и бьёт как герой — рукой и ногой сериями; погиб — исчезает дымом
function cloneTick(dt) {
  for (const r of robots) if (r.clone && r.dead) { burst(r.x, r.y + 0.5, r.z, { n: 26, cols: ['#2a1a2e', '#4a2a4e', '#120a14', '#ff3a2a'], sp: [0.6, 2.4], up: 1.2, g: 0, drag: 2.5, life: 0.7, size: 2 }); sfx('RUN_1_13', 0.4, 0.5); r.gone = true; }
  if (robots.some(r => r.gone)) robots = robots.filter(r => !r.gone);
  const cl = robots.find(r => r.clone && !r.dead); game.cloneT = (game.cloneT === undefined ? 8 : game.cloneT) - dt;
  if (!cl) { if (game.cloneT <= 0 && !hero.inDoor && !view.rotating && hero.y < 900) { game.cloneT = 25; cloneSpawn(); } return; }
  cl.hunter = true; cl.fierce = true;
  const near = hero.state !== 'dead' && !hero.inDoor && !hero.hideN && Math.abs(toD(cl) - toD(hero)) <= 1.1 && Math.abs(cl.y - hero.y) < 2.2 && Math.abs(toU(cl) - toU(hero)) < 5.5 && Math.abs(norm180(cl.fa - view.k * 90)) < 1;
  if (near) { cl.rage = 1e9; cl.aggro = 9; cl.seenT = game.time; }
  else if (game.time - (cl.seenT || -99) > 2.5) { cl.rage = 0; cl.aggro = 0;
    cl.roamT = (cl.roamT === undefined ? 2 : cl.roamT) - dt;   // бродит: иногда перепрыгивает на соседний уступ
    if (cl.roamT <= 0 && !cl.atk && !view.rotating) { cl.roamT = rnd(2.5, 5); const land = robotLanding(cl, toU(cl) + rnd(-4, 4), cl.y + rnd(-2.5, 2.5)); if (land && (Math.abs(land.y - cl.y) > 0.5 || Math.abs(land.x - cl.x) + Math.abs(land.z - cl.z) > 1.5)) robotStartAtk(cl, 'jump', Math.sign((land.x - cl.x) * view.r[0] + (land.z - cl.z) * view.r[1]) || 1, land); else { cl.mode = 'walk'; cl.t = rnd(3, 6); } } }
  const lost = Math.abs(cl.y - hero.y) > 22;   // совсем отстал (герой ушёл далеко вверх) — через время появится снова, но не рядом
  if (lost && game.cloneT <= 0 && !cl.atk && !view.rotating && !hero.inDoor) { game.cloneT = 20; robots = robots.filter(r => r !== cl); cloneSpawn(); }
}
function cloneSpawn() {   // далеко от героя: на уступе пути 6–16 кубов выше или ниже, лучше — на другой стороне
  const H0 = hero.y, cand = []; for (const c of cubes.values()) { if (c.kind === 'core' || !c.top || c.y > 900 || hasCube(c.x, c.y + 1, c.z) || hasCube(c.x, c.y + 2, c.z) || Math.max(Math.abs(c.x), Math.abs(c.z)) < 8) continue; const dy = Math.abs(c.y + 1 - H0); if (dy < 6 || dy > 16) continue; cand.push(c); }
  if (!cand.length) return; const c = pick(cand), top = c.y + 1, r = makeRobot({ x: c.x, y: top, z: c.z, h: Math.abs(c.x) >= Math.abs(c.z) ? [0, 1] : [1, 0], R: 9, F: 7.5 });
  r.fa = view.k * 90; r.hunter = true; r.clone = true; r.fierce = true; r.hp = Math.round(r.hp * 0.8); r.canim = new Anim(); r.roamT = 1; robots.push(r);
  showCombo('Где-то на титане появился твой клон', true); plog('клон', 'появился на высоте ' + top); }
function drawClone(r, b) { // двойник рисуется кадрами героя: бег, прыжок, удар — тёмный, с красными глазами
  const A = r.atk, k = A && A.type !== 'jump' ? (A.cl || 'HandAttack1') : null, base = A ? (A.type === 'jump' ? 'JumpInRun' : k.replace(/\d$/, '')) : /Run/.test(r.anim.name) ? 'RunFast' : 'Stay', n = k ? k.slice(-1) : '';
  let nm = 'MainCharAC_' + base + 'R' + n; if (!CL[nm]) nm = 'MainCharAC_' + base + n; if (!CL[nm]) nm = 'MainCharAC_' + base + 'L' + n; if (!CL[nm]) nm = 'MainCharAC_StayR';   /* v313: удары героя — рукой и ногой */ if (r.canim.name !== nm) r.canim.play(nm, { loop: true }); r.canim.update(1 / 60);
  const flip = (r.face || r.dir || 1) < 0, ru = relU(r, b) + (r.sh || 0);
  drawSprite(r.canim.sprite(), ru, r.y + 0.39, flip, undefined, 0.78, '30,6,20');
  pixelGlow(Math.round(W / 2 + (ru + (flip ? -0.08 : 0.08)) * S), Math.round(H / 2 - (r.y + 0.62 - cam.y) * S), 0.14, 0.2, '255,40,30'); }
// ---- темнота и подсветка героя (отрава — зелёная, ток — голубая)
function pushDC(actors, b, relD) {
  if (hero.state !== 'dead' && (hero.poisonT > 0 || hero.shockT > 0)) actors.push({ _d: relD(hero) + 0.63, draw: () => { const X = Math.round(W / 2 + relU(hero, b) * S), Y = Math.round(H / 2 - (hero.y + 0.45 - cam.y) * S);
    if (hero.poisonT > 0) pixelGlow(X, Y, 0.45, 0.1 + 0.04 * Math.sin(game.time * 6), '120,220,80'); if (hero.shockT > 0 && Math.sin(game.time * 60) > 0) pixelGlow(X, Y, 0.5, 0.2, '140,230,255'); } });
  if (dcHas('dark')) actors.push({ _d: 1e7, draw: () => { const X = W / 2 + relU(hero, b) * S, Y = H / 2 - (hero.y + 0.5 - cam.y) * S, g = ctx.createRadialGradient(X, Y, S * 0.9, X, Y, S * 3.6);   /* v311 (Алексей: «недостаточно темно»): круг меньше, за ним — почти чёрное */
    g.addColorStop(0, 'rgba(3,2,6,0)'); g.addColorStop(0.45, 'rgba(3,2,6,0.7)'); g.addColorStop(1, 'rgba(3,2,6,0.985)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } });
}
const kunaiMax = () => Math.max(1, CFG.kunaiMax - (dcHas('kunai') ? 1 : 0));
const finaleAfter = () => CFG.finaleAfter * (dcHas('raid') ? 0.6 : 1);
// ====================== ЦИКЛ ======================
// v243: const game (общее состояние: время, шаг титана, тряска…) перенесён в ядро — src/06b_world.js
function stompFar() {                  // встала другая нога: гул и встряска слабее, по лампам пробегает дрожь
  game.shake = Math.max(game.shake, 0.1); sfx('Jump_4_landfall', 0.55, 0.26); sfx('RobotDeathD', 0.2, 0.32);
  for (const L of LEVEL.lamps) { L.om += (Math.random() < 0.5 ? -1 : 1) * rnd(0.6, 1.2) / Math.sqrt(L.len); }
  const V = game.gv; for (let i = 0; i < 24; i++) { const u = rnd(-10, 10); burst(V.x + u * view.r[0] * -1 + 9.7 * view.n[0] * -1, soleBase() + 1.4, V.z - u * view.r[1] - 9.7 * view.n[1], { n: 4, cols: i % 2 ? SMOKE : ['#5b3a29', '#3d2d23', '#7a5a3a'], sp: [1, 4], up: 2.4, g: 6, drag: 0.8, life: 1.2, size: 2 }); }
}
function stomp() {                     // нога встала на землю
  game.shake = Math.max(game.shake, 0.22); sfx('Jump_4_landfall', 0.9, 0.3); sfx('RobotDeathD', 0.35, 0.4);
  if (hero.onGround && hero.state !== 'dead') hero.sq = -0.16;
  for (const r of robots) if (!r.dead) { r.sq = -0.1; r.sqV = 0; }
  game.sink = 1.0; game.sinkV = 0; game.sinkT = 1.1; game.treeHit = 1; game.leafBurst = true;   // деревья под ступнёй вздрагивают, с них летит листва
  for (const L of LEVEL.lamps) { L.om += (Math.random() < 0.5 ? -1 : 1) * rnd(1.6, 2.8) / Math.sqrt(L.len); L.bv -= rnd(0.9, 1.5); }   // лампы встряхивает
  const SOIL = ['#5b3a29', '#3d2d23', '#7a5a3a', '#4a3324'], MOSSC = ['#7a8840', '#6d7a3a', '#5e5a30', '#56632f'];
  for (let i = 0; i < 46; i++) {        // из-под ступни по всему краю летят комья земли и клочья мха — во все стороны, а не одной линией
    const side = Math.floor(Math.random() * 4), a = rnd(-10.5, 10.5), e = 9.7 + rnd(-0.3, 1.2), k = i % 3, P = [[a, e], [e, a], [a, -e], [-e, a]][side], N = [[0, 1], [1, 0], [0, -1], [-1, 0]][side];
    const cols = k === 0 ? SOIL : k === 1 ? MOSSC : SMOKE;
    for (let m = 0, n = k === 2 ? 3 : 6; m < n; m++) { const sp = rnd(1.5, 6.5), an = rnd(0, Math.PI * 2), out = rnd(0.2, 1);
      parts.push({ x: P[0] + rnd(-0.3, 0.3), y: soleBase() + 1.5 + rnd(-0.1, 0.3), z: P[1] + rnd(-0.3, 0.3), vx: (Math.cos(an) * 0.7 + N[0] * out) * sp, vz: (Math.sin(an) * 0.7 + N[1] * out) * sp, vy: rnd(0.5, 1) * (k === 2 ? 1.2 : 3.4) + rnd(0, 2), g: k === 2 ? 3 : 8, drag: k === 2 ? 1.5 : 0.5, t: 0, life: (k === 2 ? 1.1 : 1.5) * rnd(0.7, 1.1), size: i % 4 === 0 ? 3 : 2, col: cols[Math.floor(Math.random() * cols.length)] }); }
  }
}
// v243: soleChunks — перенесено в ядро, src/06b_world.js
// v243: FOOT_HALF — перенесено в ядро, src/06b_world.js
// v243: function soleBase — перенесено в ядро, src/13c_units.js
function chunkSprite() {                 // кусок: сверху ровный (прилип к подошве), снизу рваный, с потёками; тёмная земля, зелень мха, редкие светлые крошки
  const w = Math.floor(rnd(8, 22)), h0 = Math.floor(rnd(4, 10)), c = document.createElement('canvas'); c.width = w; c.height = h0 + 8; const x = c.getContext('2d');
  const SOIL = ['#22170f', '#2e2016', '#3a281d', '#1a120c'], GRN = ['#16261a', '#1f3523', '#2a4a2e', '#33583a'], LITE = ['#41703f', '#5a4632'];
  let hh = h0 * 0.6; for (let cx = 0; cx < w; cx++) { const edge = cx === 0 || cx === w - 1; hh = Math.max(1, Math.min(h0 + 6, hh + rnd(-1.5, 1.7))); let H = Math.round(edge ? Math.min(hh, h0 * 0.5) : hh); if (!edge && Math.random() < 0.15) H += Math.floor(rnd(1, 4));   // потёк
    const green = Math.random() < 0.45; for (let cy = 0; cy < H; cy++) { const r = Math.random(); x.fillStyle = r < 0.06 ? LITE[Math.floor(Math.random() * 2)] : (green ? (r < 0.7 ? GRN : SOIL) : (r < 0.75 ? SOIL : GRN))[Math.floor(Math.random() * 4)]; x.fillRect(cx, cy, 1, 1); } }
  return c;
}
function soleClumps() {                 // нога оторвалась: под подошвой со стороны камеры повисли куски
  const y0 = soleBase(), R = view.r, N = view.n, n = Math.floor(rnd(9, 14));
  for (let i = 0; i < n; i++) { const u = -FOOT_HALF + 0.4 + (i + rnd(0.1, 0.9)) * (2 * FOOT_HALF - 0.8) / n, d = FOOT_HALF + 0.02;
    soleChunks.push({ x: u * R[0] + d * N[0], z: u * R[1] + d * N[1], y: y0, vy: 0, hold: rnd(0.4, 3.4), spr: chunkSprite(), t: 0 }); }
}
function updateSoleChunks(dt) {
  if (!soleChunks.length) return; const y0 = soleBase();
  for (const c of soleChunks) { c.t += dt; if (c.hold > 0) { c.hold -= dt; if (c.hold <= 0) { c.vy = rnd(-0.3, 0); for (let k = 0; k < 4; k++) parts.push({ x: c.x, y: y0 - 0.05, z: c.z, vx: rnd(-0.5, 0.5) * view.r[0], vz: rnd(-0.5, 0.5) * view.r[1], vy: rnd(-1, 0), g: 10, drag: 0.5, t: 0, life: 0.9, size: 1, col: pick(['#22170f', '#1f3523', '#2a4a2e']) }); } continue; }
    c.vy -= 14 * dt; c.y += c.vy * dt; }
  soleChunks = soleChunks.filter(c => c.y > y0 - 14 && c.t < 9);
}
// v243: function drawSole — перенесено в ядро, src/13c_units.js
const memC = document.createElement('canvas');
function memorySnap() {                 // R: последний кадр остаётся бледным следом в белой вспышке — будто всё это вспомнилось
  try { memC.width = Math.round(W / 4); memC.height = Math.round(H / 4); const x = memC.getContext('2d'); x.filter = 'grayscale(0.85) blur(1.5px)'; x.drawImage(canvas, 0, 0, memC.width, memC.height); } catch (e) { memC.width = 0; }
  game.flashT = 1.5; sfx('RobotHit5', 0.35, 0.45); sfx('RUN_1_13', 0.3, 0.4);
}
function drawMemory() {
  const k = Math.max(0, game.flashT / 1.5); if (k <= 0) return;
  const e = k * k * (3 - 2 * k);
  ctx.fillStyle = 'rgba(255,250,240,' + Math.min(1, e * 1.25).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
  if (memC.width) { const z = 1 + 0.25 * (1 - k), w = W * z, h = H * z; ctx.globalAlpha = Math.min(1, 2.2 * e * (1 - e)); ctx.imageSmoothingEnabled = true; ctx.drawImage(memC, (W - w) / 2, (H - h) / 2, w, h); ctx.globalAlpha = 1; }   // прежний кадр всплывает поверх белого и тает
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(255,236,200,0)'); g.addColorStop(1, 'rgba(255,214,150,' + (0.5 * k).toFixed(3) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function restart() {
  game.levelT = 0; game.finale = false; game.waveQ = 0; game.dropT = undefined; game.megaT = undefined; game.quietT = 0; game.barrage = null; game.nearMsg = false; game.guideOn = false;
  game.bossTaxi = null; loadLevel();   /* v241: уровень всегда из файла карты (01c_mapfile.js) */
  setView(0); cloudAnomaly(); fireHeat = 0; volley = null; wBlobs = []; for (const k in fatigue) fatigue[k] = 0; spawnRobots(); spawnProps(); dcApplyLevel(); resetHero(); heads = []; hero.headJob = null; kunais = []; popups.length = 0; fxs.length = 0; parts.length = 0;
  cam.x = hero.x; cam.y = hero.y + 1.2; cam.z = hero.z; game.finishT = 0; $('banner').hidden = true; updateHUD(); PLOG.tier = 0; game.windUsed = false; plog('уровень', 'старт ' + (game.level || 1) + ', карта ' + LEVEL.seed);
}
function tick(dt) {
  game.shake = Math.max(0, game.shake - dt * 0.6);
  if (game.hitStop > 0) { game.hitStop -= dt; return; }   // короткая пауза на попадании, нажатия не теряются
  if (pressed.has('restart')) { memorySnap(); game.mapFileText = null; game.mapFileName = ''; if (typeof talReset === 'function') talReset(); restart(); }   /* v309 (Алексей: «таланты не сбрасываются при перезапуске»): новая игра — с нуля */   // R — новый расклад: открытый файл карты закрывается
  if (!game.nearMsg && hero.state !== 'dead' && hero.onGround && hero.y >= LEVEL.pelY - 1.5 && !inRoom()) { game.nearMsg = true; game.guideOn = true; showCombo(hero.redKey ? 'Рядом вход в таз — иди по стрелке' : 'Выход рядом, но нужен красный ключ — стрелка ведёт к нему', true); }
  if (pressed.has('taxi')) { const rr = hero.ride ? hero.ride.r : hero.standOn && robots.includes(hero.standOn) && !hero.standOn.dead ? hero.standOn : null; const dd = !rr && doorAt(); if (dd && (dd.locked || (dd.exit && !hero.redKey))) { if (game.time - (game.yTap || -9) < 0.45) { game.yTap = -9; dd.locked = false; if (dd.to !== undefined && doors[dd.to]) doors[dd.to].locked = false; if (dd.exit) hero.redKey = true; sfx('RobotHit5', 0.6, 1.5); showCombo('Проверка: дверь открыта без ключа', true); updateHUD(); } else game.yTap = game.time; }   /* проверка: дважды Y у запертой двери — открыть */
    else if (rr) { if (!view.rotating) startBossTaxi(rr); } else { game.headMode = !game.headMode; game.legHits = 0; showCombo(game.headMode ? 'Проверка: каждый второй удар ногой срывает голову' : 'Проверка голов выключена', true); } }   // проверочная кнопка: робот, на плече которого висишь, везёт к выходу
  if (game.dcOpen) { dcTick(); pressed.clear(); return; }   /* v310: карта смерти — пауза до выбора */
  if (hero.state === 'dead' && game.deathT > 1.2 && (pressed.has('jump') || pressed.has('up'))) { if (game.noDC || !dcOpen()) respawn(); pressed.clear(); return; }
  if (pressed.has('music')) toggleMusic();
  if (pressed.has('test')) testToggle();   // v230: тест-режим
  if (pressed.has('mute')) { muted = !muted; if (master) master.gain.value = muted ? 0 : 1; $('mute').textContent = muted ? 'звук выкл' : 'звук вкл'; }
  if (pressed.has('help')) $('help').hidden = !$('help').hidden;
  if (pressed.has('combos')) toggleCombos();
  if (pressed.has('plog')) togglePlog();
  if (pressed.has('maps')) toggleMaps();   // v242: панель «Карты»
  if (pressed.has('zoom') && game.finishT <= 0 && hero.state !== 'dead' && !view.rotating) { game.zoom = !game.zoom; inspectToggle(game.zoom); }
  if (pressed.has('tal') && !game.talOpen && game.started && hero.state !== 'dead') { talToggle(true); pressed.clear(); return; }   /* v301: таланты (пауза) */
  if (game.talOpen) { talTick(); pressed.clear(); return; }
  if (game.zoom) { inspectTick(dt); pressed.clear(); return; }   /* осмотр титана: пауза */
  if (game.finishT > 0) {               // уровень пройден: затемнение и возврат в начало
    game.finishT -= dt; if (game.finishT <= 0) { game.level = (game.level || 1) + 1; restart(); showCombo('Уровень ' + game.level + ': роботы быстрее и крепче на 15%', true); }   // пройдено — новая нога, роботы сильнее
  } else {
    if (pressed.has('rotR')) { view.queue = 1; view.queueT = 0.45; } else if (pressed.has('rotL')) { view.queue = -1; view.queueT = 0.45; }   /* нажатие во время поворота запоминается и выполняется после короткой паузы */
    if (view.cool > 0 && !view.rotating) view.cool -= dt;
    if (!view.rotating && view.queue && !(view.cool > 0)) { const q = view.queue; startRotate(q);   // v291 (Алексей: «повороты с геймпада иногда плохо срабатывают»): нельзя прямо сейчас (зацепился за край,
      if (view.rotating) { view.queue = 0; plog('поворот', q > 0 ? 'вправо' : 'влево'); } else if ((view.queueT -= dt) <= 0) { view.queue = 0; plog('поворот', 'не сработал: ' + (rotWhyNot() || '?')); } }   // на лестнице…) — нажатие ждёт ещё полсекунды, не пропадает
    if (view.rotating) updateRotate(dt);
    else {
      game.time += dt;
      updateDodge(dt); updateHero(dt); updateRobots(dt); updateKunais(dt); updateProps(dt); updateDC(dt);
      if (hero.state !== 'dead' && hero.z * game.gSide > CFG.legGap / 2 && hero.y < LEVEL.pelY - 0.6) {   // герой перелетел середину между ногами (под тазом): теперь он на второй ноге
        const V = game.gv, turn = o => { o.x = V.x - o.x; o.y -= V.y; o.z = V.z - o.z; };   // вторая нога развёрнута на пол-оборота, вид поворачивается вместе с ней — на экране ничего не дёргается
        turn(hero); turn(cam); if (cam.gy !== null) cam.gy -= V.y; for (const q of parts) turn(q);
        game.stepT += CFG.stepTime / 2; game.gFlip = -(game.gFlip || 1); game.gv = { x: V.x, y: -V.y, z: V.z }; hero.hook = null; hero.gY = -99; setView(view.k + 2);
        showCombo('Другая нога!', true); sfx('RobotHit5', 0.4, 1.2);
      }
    }
  }
  pressed.clear();
  if (game.treeHit > 0) game.treeHit = Math.max(0, game.treeHit - dt * 1.4);
  { const tg = game.sinkT || 0; game.sinkV = (game.sinkV || 0) + (-((game.sink || 0) - tg) * 6 - (game.sinkV || 0) * 5) * dt; game.sink = (game.sink || 0) + game.sinkV * dt; }   /* после удара ступня оседает и остаётся увязшей в почве, пока стоит; без отскока вверх */
  for (const q of popups) q.t += dt; while (popups.length && popups[0].t > 0.9) popups.shift();
  updateFx(dt);
  const k = 1 - Math.exp(-dt * 5);
  if (hero.state === 'dead') { const kd = 1 - Math.exp(-dt * 1.4); cam.x += (0 - cam.x) * kd; cam.z += (0 - cam.z) * kd; cam.y += (19 - cam.y) * kd; }   // камера уходит к середине ноги
  else {
    // камера как в современных платформерах: смотрит вперёд по ходу (чем быстрее бег, тем дальше), по высоте держится уровня опоры,
    // а не скачет с каждым прыжком; догоняет только если герой ушёл высоко или падает
    const sp = Math.abs(hero.vx), mv = sp > 0.5 && !hero.ladder && !hero.hang && !hero.inDoor;
    const want = view.rotating ? 0 : mv ? Math.sign(hero.vx) * (0.7 + 1.5 * Math.min(1, sp / CFG.moveFast)) : hero.face * 0.45;
    cam.la += (want - cam.la) * (1 - Math.exp(-dt * (mv ? 2.2 : 1.1)));
    const HW = heroWorld();   // v280: в куске руки — где герой на самом деле
    const held = hero.onGround || hero.ladder || hero.hang || hero.ride || hero.inDoor;
    if (cam.gy === null || held || HW.y < cam.gy) cam.gy = HW.y; else if (HW.y > cam.gy + 1.5) cam.gy = HW.y - 1.5;
    const fall = !held && hero.vy < -4 ? -0.9 : 0, ky = 1 - Math.exp(-dt * (fall || HW.y < cam.y - 2.2 ? 9 : 4.2)), kx = 1 - Math.exp(-dt * 6);
    cam.x += (HW.x + cam.la * view.r[0] - cam.x) * kx; cam.z += (HW.z + cam.la * view.r[1] - cam.z) * kx; cam.y += (cam.gy + 1.3 + fall - cam.y) * ky;
  }
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) $('combo').classList.remove('show'); }
  game.hudT -= dt; if (game.hudT <= 0) { game.hudT = 0.2; updateHUD(); }
}
let last = 0, acc = 0;
const STEP = 1 / 120;
function frame(ts) {
  if (typeof padPoll === 'function') padPoll();   /* v289: геймпад (03_input.js) */
  const raw = (ts - last) / 1000 || 0, dt = Math.min(0.05, raw); last = ts; if (game.started && raw > 0 && raw < 2) { game.fpsN = (game.fpsN || 0) + 1; game.fpsT = (game.fpsT || 0) + raw; game.fpsWorst = Math.max(game.fpsWorst || 0, raw * 1000); }   // для журнала: сколько кадров в секунду у игрока на самом деле
  if (hero.state === 'dead' && game.started) { game.deathT = (game.deathT || 0) + dt; if (!view.rotating) view.angle += 24 * dt; }   // мир бесконечно кружится
  else if (game.deathT) { game.deathT = 0; S = S0; }
  if (game.started) {
    // Походка тяжёлого титана на прямых ногах-столбах. Цикл — два шага. Каждая нога 60% цикла стоит, 40% — в шаге:
    // плавно отрывается, проносится вперёд и тяжело опускается (быстрее, чем поднималась). Обе ноги в одном цикле, со сдвигом в полцикла,
    // между шагами — миг на обеих ногах. Корпус переваливается на опорную ногу и чуть приседает на ударе; лес идёт ровно, на шаге своей ноги — быстрее.
    const bb = basis(view.angle), T = CFG.stepTime, p0 = (game.stepT % T) / T; game.stepT += dt; const p = (game.stepT % T) / T;
    const ss = v => v * v * (3 - 2 * v), D = CFG.stride || 5, SW = 0.4;
    const foot = q => { q -= Math.floor(q); return q < SW ? -D / 2 + D * ss(q / SW) : D / 2 - D * (q - SW) / (1 - SW); };   // где стопа относительно корпуса, вдоль хода
    const lift = q => { q -= Math.floor(q); if (q >= SW) return 0; const s2 = q / SW, sk = s2 < 0.58 ? 0.5 * s2 / 0.58 : 0.5 + 0.5 * Math.pow((s2 - 0.58) / 0.42, 1.35); return Math.pow(Math.sin(Math.PI * sk), 0.9); };
    const qA = p - 0.5, qB = p, lA = lift(qA), lB = lift(qB); game.gait = { fA: foot(qA), fB: foot(qB), lA, lB };
    game.spring = game.spring || { y: 0, v: 0 }; const Sp = game.spring; Sp.v += (-Sp.y * 40 - Sp.v * 13) * dt; Sp.y += Sp.v * dt;   // корпус пружинит после удара
    game.lift = lA * CFG.stepLift + Sp.y;   // земля уходит вниз, пока наша нога в шаге; корпус покачивается вверх-вниз дважды за цикл
    game.gv = { x: (game.gFlip || 1) * (foot(qB) - foot(qA)), y: (lB - lA) * CFG.stepLift, z: game.gSide * CFG.legGap };
    const dA = (foot(qA + dt / T) - foot(qA)) / dt;   // скорость нашей стопы относительно корпуса
    const v = 0.6 * D / T + 0.4 * Math.max(0, dA);   /* титан идёт без остановок: лес едет всегда, на шаге нашей ноги — быстрее */   // ход: наполовину ровный, наполовину — когда наша нога летит вперёд
    game.scroll += (game.gFlip || 1) * v * (bb.r[0] + 0.5 * bb.n[0]) * dt;
    game.sway = 0.55 * Math.cos((p - 0.2) * 6.2832);   // переваливается на опорную ногу (видно спереди и сзади)
    game.bob = 0;
    const qa0 = ((p0 - 0.5) % 1 + 1) % 1, qa1 = ((p - 0.5) % 1 + 1) % 1;
    if (qa0 > 0.5 && qa1 < 0.05) { sfx('RobotDeathD', 0.2, 0.35); soleClumps(); game.sinkT = 0; }                      // наша нога отрывается от земли
    if (qa0 < SW && qa1 >= SW) { stomp(); Sp.v -= 3.4; }                               // наша нога встала
    if (p0 < SW && p >= SW) { stompFar(); Sp.v -= 1.2; }                               // встала другая нога
    if (p0 > 0.5 && p < 0.05) sfx('RobotDeathD', 0.12, 0.3);
  }
  cloudT += dt; if (game.flashT > 0) game.flashT -= dt; if (game.hurtT > 0) game.hurtT -= dt;
  if (game.started) { acc += dt; let n = 0; while (acc >= STEP && n < 8) { tick(STEP); acc -= STEP; n++; } if (n === 8) acc = 0; }
  render(); if (typeof gearWork === 'function') gearWork();
  if (game.fadeT > 0) { game.fadeT -= dt; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, game.fadeT / 0.35).toFixed(3) + ')'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); }
  if (game.roomMsgT > 0) game.roomMsgT -= dt;
  requestAnimationFrame(frame);
}

// сенсорные кнопки
document.querySelectorAll('[data-key]').forEach(el => {
  const n = el.dataset.key;
  const down = e => { e.preventDefault(); onUserGesture(); keyDown(n); el.classList.add('down'); };
  const up = e => { e.preventDefault(); keyUp(n); el.classList.remove('down'); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
});
function begin() {
  if (game.started) return;
  onUserGesture(); game.started = true; $('start').hidden = true; startMusic(); canvas.focus();
}
$('startBtn').addEventListener('click', begin);
$('exitBtn').addEventListener('click', () => { try { window.close(); } catch (e) {} setTimeout(() => { $('exitMsg').hidden = false; }, 200); });
addEventListener('keydown', e => { if (!game.started && (e.code === 'Enter' || e.code === 'Space')) begin(); });

resize();
loadImages().then(() => {
  cutSprites(); fixKicks(); buildClouds(); if (typeof talReset === 'function') talReset(); restart(); resize();
  $('startBtn').disabled = false;
  if (game.autoStart) begin();   // v244: карта из редактора («Тест») — сразу в игру
  requestAnimationFrame(frame);
});
window.__game = { cubes, PLOG, heroBeam, lampHeld, get faces() { return faces; }, get keyItems() { return keyItems; }, zcam, get traps() { return traps; }, CH, soleClumps, dbgCell: (U, Y) => (cellAt(U, Y) || []).map(c => [c.x, c.y, c.z, c.dep, c.kind]), openGateLift, get armsAll() { return arms; }, get gearsAll() { return gears; }, get heads() { return heads; }, get arms() { return arms; }, setS(v) { S = v; }, sky, cloudSpr, enrage, spawnHunter, hero, view, cam, game, CFG, LEVEL, cubes, keyDown, keyUp, begin, restart, get robots() { return robots; }, get kunais() { return kunais; }, get waters() { return waters; }, get fires() { return fires; }, get pistons() { return pistons; }, punish: () => ({ heat: fireHeat, volley: !!volley, blobs: wBlobs.length, wet: hero.promWet || 0 }), fatigue, setHeat(v) { fireHeat = v; }, get bits() { return bits; }, get crates() { return crates; }, get vents() { return vents; }, get lifts() { return lifts; }, get movers() { return movers; }, get gears() { return gears; }, gearFrame, get boss() { return boss; }, get tutor() { return tutor; }, get turrets() { return turrets; }, get k2walls() { return k2walls; }, gearTangible, gearTopVisible, gearTop, gearFace, heroSupport, get k2rails() { return k2rails; }, get tShots() { return tShots; }, bossStart, armGrips, get doors() { return doors; }, useDoor, fxs, parts, spawnFx, toU, overlapsDepth, hasCube, toD, cellAt, setView, robotHidden, robotOnScreen, damageRobot, go, cloudBox, fatigue, hurt: hurtHero, heroHands, mapSave, mapLoad, mapPretty, mapOpenText, buildLevel, loadLevel, get mapText() { return game.mapText; } };

// v291: журнал — сколько из худшего кадра заняла сама игра (если мало — тормозит видеокарта или браузер, а не расчёты)
{ const inner = frame; frame = function (ts) { const t0 = performance.now(); inner(ts); if (game.started) game.jsWorst = Math.max(game.jsWorst || 0, performance.now() - t0); }; }
