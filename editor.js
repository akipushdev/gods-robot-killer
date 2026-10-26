'use strict';
// ====================== РЕДАКТОР (шаг 3 нового этапа, v244) ======================
// Отдельная страница dist/editor.html: грузит data.js + core.js (ядро, общее с игрой) + editor.js (этот код). Игру не грузит.
// Взгляд — как «осмотр титана» ядра (zcam, 15b_inspect.js): колесо — ближе/дальше к курсору, тянуть — вертеть и вверх-вниз,
// правой кнопкой или с Shift — сдвигать; Q/E — четверть оборота. Издалека render сам рисует упрощённого титана (drawLOD).
// Карта: новая (случайная / по номеру), файл (открыть / сохранить), общие карты (db + assets, как панель «Карты» в игре).
// «Тест» — передаёт карту игре (sessionStorage 'grk_test') и открывает index.html; игра возвращает её кнопкой «Редактор» ('grk_edit').
const ED = { map: null, name: '', asset: null, k: 0, db: null, assets: null, user: null, canWrite: false, list: [], names: {}, last: 0, ready: false, dirty: false };
const edEl = id => document.getElementById(id);
const ED_SIDES = ['Юг', 'Восток', 'Север', 'Запад'];
const ED_SPOTS = [['Весь титан', null], ['Ступня', 0], ['Голень', 6], ['Бедро', 20], ['Таз', 33], ['Грудь', 55], ['Кабина', 70]];
function edStore(kind, key, val) { try { const s = kind === 's' ? sessionStorage : localStorage; if (val === undefined) return s.getItem(key); if (val === null) s.removeItem(key); else s.setItem(key, val); return true; } catch (e) { return val === undefined ? null : false; } }
// v261: свои окна вместо prompt/confirm — на странице в claude.ai системные окна браузера заблокированы (кнопки «молча» ничего не делали).
// edAsk(текст, {input: 'по умолчанию' | undefined, buttons: [[ключ, надпись, главная?]], cancel: 'Отмена' | false}) → Promise {ok, value, btn}
// Enter — главная кнопка, Esc — отмена. Для автотестов: window.__ask = ответ (или список ответов) — окно не показывается.
function edAsk(text, o = {}) {
  const auto = window.__ask; if (auto !== undefined) { const v = Array.isArray(auto) ? auto.shift() : auto; if (!Array.isArray(auto) || !auto.length) window.__ask = undefined;
    const r = v === false || v === null ? { ok: false, value: null, btn: null } : { ok: true, value: typeof v === 'string' ? v : (o.input !== undefined ? String(o.input) : null), btn: typeof v === 'object' && v && v.btn ? v.btn : (o.buttons ? o.buttons[0][0] : 'ok') };
    if (v && typeof v === 'object' && v.value !== undefined) r.value = v.value; return Promise.resolve(r); }
  return new Promise(res => {
    const box = edEl('edAsk'), inp = edEl('edAskIn'), row = edEl('edAskBtns'); edEl('edAskText').textContent = text; inp.hidden = o.input === undefined; inp.value = o.input !== undefined ? o.input : '';
    row.innerHTML = ''; const done = r => { box.hidden = true; removeEventListener('keydown', key, true); res(r); };
    const btns = o.buttons || [['ok', 'OK', true]]; let main = null;
    if (o.cancel !== false) { const c = document.createElement('button'); c.type = 'button'; c.textContent = o.cancel || 'Отмена'; c.addEventListener('click', () => done({ ok: false, value: null, btn: null })); row.append(c); }
    for (const [k, label, prim] of btns) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (prim || btns.length === 1) { b.className = 'go'; main = k; } b.addEventListener('click', () => done({ ok: true, value: inp.hidden ? null : inp.value, btn: k })); row.append(b); }
    if (!main) main = btns[0][0];
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done({ ok: false, value: null, btn: null }); } else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); done({ ok: true, value: inp.hidden ? null : inp.value, btn: main }); } };
    addEventListener('keydown', key, true); box.hidden = false; setTimeout(() => { if (!inp.hidden) { inp.focus(); inp.select(); } else row.lastChild && row.lastChild.focus(); }, 0);
  });
}
const edSure = (text, yes) => edAsk(text, { buttons: [['yes', yes || 'Да', true]] }).then(r => r.ok);
function edMsg(t, long) { const m = edEl('edMsg'); m.textContent = t || ''; m.classList.toggle('show', !!t); clearTimeout(edMsg.t); if (t) edMsg.t = setTimeout(() => m.classList.remove('show'), long ? 6000 : 3000); }
function edOpenText(text, name, asset) {   // любая карта в редактор — через тот же mapLoad, что и в игре
  try { const m = JSON.parse(text); if (!m || m.grk !== MAP_VER) throw new Error('это не файл карты');
    mapLoad(text); epRefs(m); ED.map = JSON.stringify(m); ED.name = name || m.name || ('Карта ' + m.gen.seed); ED.asset = asset || null; game.mapText = ED.map;
    edAfterLoad(); edStore('l', 'grk_editor_last', ED.map); EP.undo = []; EP.redo = []; EP.sel = null; EP.hover = null; ED.dirty = false; edDirty(); epIndex(); return true;
  } catch (e) { edMsg('Не открылось: ' + e.message, true); return false; }
}
function edGenerate(seed) {   // новая карта генератором ядра, сразу через файл — как в игре
  LEVEL.forceSeed = seed === undefined || seed === null ? null : seed; buildLevel(true); const t = JSON.stringify(mapSave()); LEVEL.forceSeed = null;
  edOpenText(t, 'Карта ' + LEVEL.seed, null);
}
function edAfterLoad() {
  cloudAnomaly(); spawnProps();
  const st = LEVEL.start || { x: 0, y: 2, z: 9 }; hero.x = st.x; hero.y = st.y; hero.z = st.z; hero.vx = hero.vy = 0; hero.onGround = true;
  edLook(null); edRooms(); edTitle();
}
function edTitle() { edEl('edName').textContent = ED.name || '—'; edEl('edSeed').textContent = LEVEL.seed !== undefined ? 'карта ' + LEVEL.seed : ''; document.title = (ED.name ? ED.name + ' — ' : '') + 'Редактор GRK'; }
function edLook(y, room) {   // куда смотреть: весь титан, высота на ноге или комната
  if (room) { Object.assign(zcam, { x: (room.x0 + room.x1) / 2, y: (room.y0 + room.y1) / 2, z: ROOM_Z || 8, ang: 0, s: Math.max(S0 * 0.5, Math.min(S0, W / ((room.x1 - room.x0) + 3))) }); view.angle = 0; setView(0); ED.k = 0; return; }
  if (y === null) { Object.assign(zcam, { x: 0, y: 38, z: 0, s: Math.max(S0 * 0.06, H / 95) }); return; }
  Object.assign(zcam, { x: 0, y, z: 0, s: S0 * 0.7 });
}
function edRooms() {
  const box = edEl('edSpots'); box.textContent = '';
  const add = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); box.appendChild(b); };
  for (const [n, y] of ED_SPOTS) add(n, () => edLook(y));
  const rooms = (LEVEL.complexes || []).filter(c => c.name); if (rooms.length) { const h = document.createElement('div'); h.className = 'edh'; h.textContent = 'Комнаты'; box.appendChild(h); }
  const seen = {}; for (const c of rooms) { seen[c.name] = (seen[c.name] || 0) + 1; add(c.name + (seen[c.name] > 1 ? ' ' + seen[c.name] : ''), () => edLook(0, c), 'room'); }
}
function edTurn(d) { ED.k = (((Math.round(zcam.ang / 90) + d) % 4) + 4) % 4; zcam.ang = Math.round(zcam.ang / 90) * 90 + d * 90; }
function edScale() {   // какой масштаб сейчас — по зуму (как в Worms: далеко — титан, ближе — кубы, вплотную — пропсы)
  const k = S / S0; return k < (game.lodAt || 0.45) ? 0 : k < 0.8 ? 1 : 2;
}
function edFrame(ts) {
  const dt = Math.min(0.05, (ts - ED.last) / 1000 || 0); ED.last = ts; game.time += dt;
  if (Math.abs(zcam.ang - view.angle) > 0.01) view.angle += (zcam.ang - view.angle) * Math.min(1, dt * 8);
  const k = ((Math.round(view.angle / 90) % 4) + 4) % 4; if (Math.abs(view.angle - zcam.ang) < 0.5 && view.k !== k && Math.abs(view.angle - Math.round(view.angle / 90) * 90) < 0.5) { const a = zcam.ang; setView(k); view.angle = a; }
  if (zcam.y > 2500 && zcam.s < S0 * 0.25) zcam.s = S0 * 0.25;   /* в комнатах — всегда подробно: издалека ядро рисует только упрощённого титана снаружи */
  ecamTick(dt); ecamCompassTick();
  cam.x = zcam.x; cam.y = zcam.y; cam.z = zcam.z; cam.gy = zcam.y;
  try { render(); } catch (e) { if (!ED.err) { ED.err = 1; edMsg('Ошибка отрисовки: ' + e.message, true); console.error(e); } }
  try { if (EP.mode !== 'titan') edDrawRobots(); } catch (e) { if (!ED.err3) { ED.err3 = 1; console.error(e); } }
  try { if (EP.mode === 'props') eciDraw(); } catch (e) { if (!ED.err4) { ED.err4 = 1; console.error(e); } }   /* v286: значки предметов над ящиками */   /* v270: роботы видны сразу */
  try { epDraw(); ecDraw(); } catch (e) { if (!ED.err2) { ED.err2 = 1; console.error(e); } }
  edEl('edSide').textContent = ED_SIDES[k]; edEl('edAlt').textContent = Math.round(zcam.y < 2500 ? zcam.y : zcam.y - Math.floor(zcam.y / 1000) * 1000); edEl('edZoom').textContent = Math.round(S / S0 * 100) + '%';
  requestAnimationFrame(edFrame);
}
// ---------- файлы и общие карты ----------
async function edSaveFile() {
  if (!ED.map) return; const text = mapPretty(ED.map), name = 'grk-' + (LEVEL.seed !== undefined ? LEVEL.seed : 'map') + '.grk.json';
  let dl = null; try { dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null; } catch (e) {}
  if (dl) { try { await dl.save({ filename: name, data: new Blob([text], { type: 'application/json' }) }); edMsg('Сохранено в файл'); ED.dirty = false; edDirty(); } catch (e) { edMsg(e && e.code === 'declined' ? 'Сохранение отменено' : 'Не сохранилось: ' + (e && (e.code || e.message))); } return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); edMsg('Сохранено в файл'); ED.dirty = false; edDirty();
}
function edPickFile() { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,.grk.json,application/json'; i.onchange = () => edReadFile(i.files[0]); i.click(); }
function edReadFile(f) { if (!f) return; if (/^image\//.test(f.type)) { eiOpen(f); return; }   /* картинка — в залив библиотеки */
  const r = new FileReader(); r.onload = () => { if (edOpenText(String(r.result), f.name.replace(/\.grk\.json$|\.json$/i, ''))) edMsg('Открыто: ' + f.name); }; r.readAsText(f); }
const edUse = n => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(n).catch(() => null) : Promise.resolve(null);
function edSharedInit() {
  Promise.all([edUse('db'), edUse('assets'), edUse('user')]).then(async ([db, assets, user]) => {
    ED.db = db; ED.assets = assets; ED.user = user; eiLibInit(); etlSub(); if (!db) { edSharedRender(); return; }
    ED.canWrite = !!assets && (user ? !!(await user.canEdit().catch(() => false)) : true);
    db.collection('maps').orderBy('at', 'desc').limit(200).onSnapshot(s => { ED.list = s.docs.map(d => Object.assign({ id: d.id }, d.data())); edNames(); edSharedRender(); }, e => { ED.list = []; edSharedRender('Общий список недоступен (' + e.code + ')'); });
    edSharedRender(); });
}
async function edNames() { if (!ED.user || !ED.user.profiles) return; const ids = [...new Set(ED.list.map(m => m.author).filter(Boolean))]; if (!ids.length) return; try { const ps = await ED.user.profiles(ids); for (const id of ids) ED.names[id] = (ps[id] && ps[id].name) || ''; edSharedRender(); } catch (e) {} }
function edSharedRender(note) {
  const el = edEl('edList'); el.textContent = ''; edEl('edShareSave').hidden = !(ED.db && ED.canWrite);
  const p = t => { const q = document.createElement('p'); q.textContent = t; el.appendChild(q); };
  if (note) p(note);
  if (!ED.db) { p('Общие карты работают на странице в claude.ai. Здесь — только файлы.'); return; }
  if (!ED.list.length) { p('В общих пока нет ни одной карты.'); return; }
  for (const m of ED.list) { const row = document.createElement('div'); row.className = 'mrow';
    const t = document.createElement('span'); t.className = 'mname'; t.textContent = m.name || ('Карта ' + m.seed);
    const i = document.createElement('span'); i.className = 'minfo'; const who = ED.names[m.author], d = m.at ? new Date(m.at) : null;
    i.textContent = 'карта ' + m.seed + (who ? ' · ' + who : '') + (d ? ' · ' + d.toLocaleDateString('ru-RU') : '');
    const o = document.createElement('button'); o.type = 'button'; o.textContent = 'Открыть'; o.addEventListener('click', () => edOpenShared(m)); row.append(t, i, o); el.appendChild(row); }
}
async function edOpenShared(m) {
  edMsg('Загружаю «' + (m.name || m.seed) + '»…');
  try { const r = await fetch('/_blob/' + m.asset); if (!r.ok) throw new Error('файл карты не найден (' + r.status + ')'); if (edOpenText(await r.text(), m.name, m.asset)) { edMsg('Открыто: «' + (m.name || m.seed) + '»'); edPanel(false); } }
  catch (e) { edMsg('Не открылось: ' + e.message, true); }
}
async function edSaveShared() {
  if (!ED.db || !ED.assets || !ED.map) return; const inp = edEl('edShareName'), name = (inp.value || '').trim().slice(0, 80) || ED.name || ('Карта ' + LEVEL.seed), b = edEl('edShareBtn');
  b.disabled = true; edMsg('Сохраняю…');
  try { const m = JSON.parse(ED.map); m.name = name; const text = mapPretty(JSON.stringify(m));
    const up = await ED.assets.upload(new Blob([text], { type: 'application/json' }), { type: 'application/json' });
    const author = ED.user && ED.user.id ? await ED.user.id().catch(() => null) : null;
    await ED.db.collection('maps').doc().set({ name, seed: LEVEL.seed, by: GRK_VER, author: author || null, at: new Date().toISOString(), asset: up.id, kb: Math.round(text.length / 1024) });
    ED.name = name; ED.asset = up.id; edTitle(); inp.value = ''; edMsg('Сохранено в общие: «' + name + '»'); ED.dirty = false; edDirty();
  } catch (e) { edMsg('Не сохранилось: ' + (e && (e.code || e.message) || e), true); }
  b.disabled = false;
}
function edPanel(on) { const p = edEl('edShared'); p.hidden = on === undefined ? !p.hidden : !on; edEl('edSharedBtn').classList.toggle('act', !p.hidden); }
// ---------- тест в игре ----------
function edTest() {
  if (!ED.map) return;
  const ok = edStore('s', 'grk_test', JSON.stringify({ text: ED.map, name: ED.name, asset: ED.asset }));
  if (ok) { location.href = 'index.html'; return; }
  if (ED.asset) { location.href = 'index.html#map=' + ED.asset; return; }
  edMsg('Браузер не даёт передать карту игре. Сохраните её в общие — тогда «Тест» сработает.', true);
}
// ---------- запуск ----------
function edBoot() {
  game.zoom = true; game.lodAt = 0.2; zcam.on = true; game.started = false; resize(); epInit(); ecamInit(); eiInit(); epaintInit(); elootInit(); ecdInit(); eldInit(); epiInit(); egrInit(); ewgInit(); edrInit(); eddInit(); ekeyInit(); erchInit(); eciInit();   /* предметы видны до отдаления «полтитана», дальше — упрощённый титан */
  const sure = async () => !ED.dirty || await edSure('Правки этой карты не сохранены в файл или в общие. Открыть другую?', 'Открыть');
  edEl('edNew').addEventListener('click', async () => { if (!await sure()) return; edGenerate(null); edMsg('Новая карта ' + LEVEL.seed); });
  edEl('edBySeed').addEventListener('click', async () => { if (!await sure()) return; const r = await edAsk('Номер карты:', { input: LEVEL.seed !== undefined ? String(LEVEL.seed) : '', buttons: [['ok', 'Открыть', true]] }); if (!r.ok) return; const n = Math.floor(Number(r.value)); if (!isFinite(n) || String(r.value).trim() === '') { edMsg('Нужен номер — целое число'); return; } edGenerate(n); edMsg('Карта ' + n); });
  edEl('edOpen').addEventListener('click', edPickFile); edEl('edSave').addEventListener('click', edSaveFile);
  edEl('edSharedBtn').addEventListener('click', () => edPanel()); edEl('edShareBtn').addEventListener('click', edSaveShared);
  edEl('edShareName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); edSaveShared(); } });
  edEl('edTest').addEventListener('click', edTest); edEl('edGame').addEventListener('click', () => { location.href = 'index.html'; });
  edEl('edTurnL').addEventListener('click', () => edTurn(-1)); edEl('edTurnR').addEventListener('click', () => edTurn(1));
  addEventListener('keydown', e => { const t = e.target; if (edModal()) return; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.code === 'KeyQ') edTurn(-1); else if (e.code === 'KeyE') edTurn(1); else if (e.code === 'Home') edLook(null);
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); edSaveFile(); } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') { e.preventDefault(); edPickFile(); }
    else if (e.code === 'F5' && !e.ctrlKey) { e.preventDefault(); edTest(); }
  });
  addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  addEventListener('drop', e => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); edReadFile(e.dataTransfer.files[0]); });
  const fitPanels = () => { const t = edEl('edTop').offsetHeight + 12, bt = edEl('edBottom').offsetHeight + 12; for (const id of ['edSpots', 'edLib', 'edCubes', 'edTitan', 'edShared']) { const el = edEl(id); el.style.top = t + 'px'; el.style.maxHeight = 'calc(100% - ' + (t + bt) + 'px)'; } edEl('edMsg').style.top = (t + 4) + 'px'; };   /* панели — под верхней строкой, какой бы высоты она ни стала */
  addEventListener('resize', () => { resize(); fitPanels(); }); fitPanels(); setTimeout(fitPanels, 300);
  loadImages().then(() => {
    cutSprites(); fixKicks(); buildClouds(); frameFromDocs([]);   /* v259: перерисованные кадры из этого браузера */
    // какую карту открыть: из игры («Редактор») → из теста по ссылке → последняя в редакторе → новая случайная
    let h = null; const back = edStore('s', 'grk_edit'); if (back) { edStore('s', 'grk_edit', null); try { h = JSON.parse(back); } catch (e) {} }
    if (h && h.text && edOpenText(h.text, h.name, h.asset)) edMsg('Карта из игры: ' + (ED.name || ''));
    else { const last = edStore('l', 'grk_editor_last'); if (!(last && edOpenText(last))) edGenerate(null); }
    edEl('edLoading').hidden = true; edSharedInit(); ED.ready = true; requestAnimationFrame(edFrame);
    setTimeout(() => edMsg('Камера — WASD или стрелки, Q/E — поворот, колесо — ближе. Кликни по ящику или лампе — выбрать, тяни — двигать.', true), 600);
  });
}
// ====================== РЕДАКТОР: КАМЕРА (v248, просьба Алексея: «передвижение камеры клавишами героя») ======================
// A/D или ←/→ — вдоль стороны, W/S или ↑/↓ — вверх-вниз, Shift — быстрее; Q/E — поворот на сторону (как в игре).
// Тянуть левой кнопкой пустое место — двигать камеру (свободного кручения мышью больше нет — от него вид вставал криво).
// Правая кнопка / Shift — тоже двигать (как в осмотре ядра), колесо — ближе/дальше к курсору.
const ECAM = { keys: new Set(), pan: null };
function ecamPanBy(du, dy) { const b = epBasis(); zcam.x += du * b.r[0]; zcam.z += du * b.r[1]; zcam.y += dy; }
function ecamTick(dt) {
  if (!ECAM.keys.size) return; const K = ECAM.keys, sp = (K.has('ShiftLeft') || K.has('ShiftRight') ? 3 : 1) * 9 * Math.max(0.6, Math.min(4, S0 / S)) * dt;
  let du = 0, dy = 0; if (K.has('KeyA') || K.has('ArrowLeft')) du -= sp; if (K.has('KeyD') || K.has('ArrowRight')) du += sp; if (K.has('KeyW') || K.has('ArrowUp')) dy += sp; if (K.has('KeyS') || K.has('ArrowDown')) dy -= sp;
  if (du || dy) ecamPanBy(du, dy);
}
function ecamInit() {
  const MOVE = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ShiftLeft', 'ShiftRight'];
  addEventListener('keydown', e => { const t = e.target; if (edModal()) return; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (MOVE.includes(e.code)) { ECAM.keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); } });
  addEventListener('keyup', e => ECAM.keys.delete(e.code)); addEventListener('blur', () => ECAM.keys.clear());
  ecamCompass();   /* поворот — раньше перетаскивания камеры */
  // тянуть пустое место левой кнопкой — двигать камеру (слушатель ставится после инструментов: предмет/куб они забирают себе раньше)
  canvas.addEventListener('mousedown', e => { if (e.button !== 0 || e.shiftKey) return; e.stopImmediatePropagation(); e.preventDefault(); ECAM.pan = { x: e.clientX, y: e.clientY }; canvas.style.cursor = 'grabbing'; }, true);
  addEventListener('mousemove', e => { const P = ECAM.pan; if (!P) return; const r = canvas.getBoundingClientRect(), k = canvas.width / r.width; ecamPanBy(-(e.clientX - P.x) * k / S, (e.clientY - P.y) * k / S); P.x = e.clientX; P.y = e.clientY; });
  addEventListener('mouseup', () => { if (ECAM.pan) { ECAM.pan = null; canvas.style.cursor = EP.mode === 'cubes' ? 'crosshair' : ''; } });
}
// v248 (Алексей: «ворочать самого робота удобнее»): компас сторон — клик по стороне поворачивает к ней кратчайшим путём;
// средняя кнопка мыши (колёсико) или Alt + тянуть вбок — поворот за мышью, отпустил — на ближайшую сторону (v253).
function ecamTurnTo(k) { const cur = Math.round(zcam.ang / 90); let d = (((k - cur) % 4) + 4) % 4; if (d === 3) d = -1; zcam.ang = (cur + d) * 90; }
function ecamCompass() {
  const box = document.getElementById('edCompass'); if (!box) return;
  box.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => ecamTurnTo(+b.dataset.k)));
  canvas.addEventListener('mousedown', e => { if (!(e.button === 1 || (e.button === 0 && e.altKey && EP.mode !== 'props'))) return; e.stopImmediatePropagation(); e.preventDefault(); ECAM.turn = { x: e.clientX, a0: zcam.ang }; canvas.style.cursor = 'ew-resize'; }, true);
  // v253 (Алексей: «нажатием на колёсико вертеть титана»): держишь колёсико и ведёшь вбок — титан плавно крутится за мышью; отпустил — встаёт на ближайшую сторону
  addEventListener('mousemove', e => { const T = ECAM.turn; if (!T) return; zcam.ang = T.a0 + (e.clientX - T.x) * 0.4; view.angle = zcam.ang; });
  addEventListener('mouseup', () => { if (!ECAM.turn) return; ECAM.turn = null; canvas.style.cursor = ''; const k = Math.round(zcam.ang / 90); zcam.ang = k * 90; ED.k = ((k % 4) + 4) % 4; });
}
function ecamCompassTick() { const box = document.getElementById('edCompass'); if (!box) return; const k = ((Math.round(zcam.ang / 90) % 4) + 4) % 4; box.querySelectorAll('button[data-k]').forEach(b => b.classList.toggle('act', +b.dataset.k === k)); }
// ====================== РЕДАКТОР: ИНСТРУМЕНТ «ПРОПСЫ» (v245) ======================
// Правка идёт по файлу карты (m.props), затем карта собирается заново тем же mapLoad, что и в игре, — что видно в редакторе,
// то и будет в игре. Наведение — подсветка; тянуть предмет — двигать; пустое место — вертеть, как раньше; библиотека — ставить.
// Delete — удалить, Ctrl+D — копия, Ctrl+Z / Ctrl+Y — отмена / возврат, Esc — снять выбор. Изменённое помечается by:'hand', pin:true.
// Шестерни, ключи — только двигать (на них ссылаются поршни и двери по номеру/цвету). Двери, трубы, лестницы, лифты — позже.
const PK = {   // раздел библиотеки → как выглядит рамка и как ставится; floor — встаёт на пол; del — можно удалять
  'hang/lamp':    { sec: 'Висячие', name: 'Лампа', w: 0.55, h: b => (b.len || 1.2) + 0.35, top: true, del: true },
  'plat/crate':   { sec: 'Платформы', name: 'Ящик', w: 0.95, h: 0.95, floor: true, del: true },
  'plat/walkway': { sec: 'Платформы', name: 'Переход', w: q => Math.abs(num(q.t1) - num(q.t0)) || 3, h: 1.4, floor: true, del: true, walkway: true },   /* v288: 22_stairs.js */
  'unit/shard':   { sec: 'Предметы', name: 'Осколок', w: 0.45, h: 0.45, mid: true, floor: true, del: true },
  'unit/heart':   { sec: 'Предметы', name: 'Сердечко', w: 0.5, h: 0.5, mid: true, floor: true, del: true },
  'unit/door':    { sec: 'Двери', name: 'Дверь', w: 0.9, h: 1.25, floor: true, del: true, door: true },   /* v276: 19_doors.js */
  'unit/key':     { sec: 'Предметы', name: 'Ключ', keyc: true, w: 0.55, h: 0.55, mid: true, floor: true, del: false, tpl: q => !q.crate && !q.tkey },
  'unit/robot':   { sec: 'Персонажи', name: 'Робот', w: 0.9, h: 1.15, floor: true, del: true, marker: true, tpl: q => !q.key },
  'danger/fire':  { sec: 'Опасности', name: 'Огонь', w: 0.85, h: 0.9, floor: true, del: true },
  'danger/steam': { sec: 'Опасности', name: 'Пар', w: 0.7, h: 0.7, mid: true, del: true },
  'danger/trap':  { sec: 'Опасности', name: 'Электроловушка', w: 0.95, h: 0.4, floor: true, del: true, trap: true },
  'mech/gear':    { sec: 'Механизмы', name: 'Шестерня', w: b => 2 * (b.R || 1), h: b => 2 * (b.R || 1), mid: true, del: false, gearSpin: true, off: 1, tpl: q => !q.deco && q.lift === undefined && !q.pist && !q.pair && !q.bridge && !q.soft },
  'mech/wallGear': { sec: 'Механизмы', name: 'Шестерня в стене', w: 2.4, h: 2.4, mid: true, del: true, wgear: true, gearSpin: true },   /* v269: 13g_wgears.js, editor/16_wgears.js */
  'mech/vent':    { sec: 'Механизмы', name: 'Вентиль', w: 0.7, h: 0.7, mid: true, del: true },
  'deco/decor':   { sec: 'Декор', name: 'Декор', w: 0.8, h: 0.8, mid: true, del: true },
  'deco/puddle':  { sec: 'Декор', name: 'Лужа', w: 1, h: 0.25, floor: true, del: true },
  'hang/grip':    { sec: 'Ухваты', name: 'Ухват', w: q => gripBox(q).w, h: q => gripBox(q).h, mid: true, del: true, wallOff: true, grip: true },   /* v265: 13f_grips.js */
  'climb/pipe':   { sec: 'Лазание', name: 'Труба', w: 0.3, h: 0.3, mid: true, del: true, pipe: true },   /* v254: 13_pipes.js */
  'climb/stairs': { sec: 'Лазание', name: 'Ступени', w: q => Math.abs(num(q.t1) - num(q.t0)) || 3, h: q => Math.abs(num(q.y1) - num(q.y0)) || 2, floor: true, del: true, stairs: true },   /* v287: 22_stairs.js */
  'climb/ladder': { sec: 'Лазание', name: 'Лестница', w: 0.7, h: q => q.y1 !== undefined ? num(q.y1) - num(q.y0) : 3, floor: true, del: true, ladder: true },   /* v252: 12_ladders.js */
};
const PK_SECS = ['Двери', 'Ухваты', 'Висячие', 'Платформы', 'Лазание', 'Механизмы', 'Опасности', 'Декор', 'Персонажи', 'Предметы'];
const EP = { mode: 'look', m: null, items: [], hover: null, sel: null, drag: null, place: null, undo: [], redo: [], over: null, octx: null, mouse: null };
const num = v => v === '-0' ? -0 : +v;
const pkv = (v, q) => typeof v === 'function' ? v(q) : v;
// ---------- мир ↔ экран (тот же расчёт, что в render: холст W×H, куб = S точек, камера в центре) ----------
function epCanvasPos(e) { const cv = canvas, r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
function epBasis() { const b = basis(view.angle); return { r: [Math.round(b.r[0]), Math.round(b.r[1])], n: [Math.round(b.n[0]), Math.round(b.n[1])] }; }
function epToScreen(x, y, z) { const ar = earmScreen(+x, +y, +z); if (ar) return ar; const b = epBasis(); const u = (x - cam.x) * b.r[0] + (z - cam.z) * b.r[1]; return [W / 2 + u * S, H / 2 - (y - cam.y) * S]; }
function epUD(x, z) { const b = epBasis(); return { u: (x - cam.x) * b.r[0] + (z - cam.z) * b.r[1], d: (x - cam.x) * b.n[0] + (z - cam.z) * b.n[1] }; }
function epXZ(u, d) { const b = epBasis(); return { x: cam.x + u * b.r[0] + d * b.n[0], z: cam.z + u * b.r[1] + d * b.n[1] }; }
const epCube = (x, y, z) => hasCube(Math.round(x), Math.floor(y), Math.round(z));
function epFrontD(u, y) { for (let d = 40; d >= -40; d--) { const p = epXZ(u, d); if (epCube(p.x, y, p.z)) return d; } return null; }   // первый куб на луче от камеры
function epFloor(x, y, z) { for (let yy = Math.floor(y); yy > Math.floor(y) - 40; yy--) if (hasCube(Math.round(x), yy, Math.round(z))) return yy + 1; return null; }
function epHidden(x, y, z) { const a = epUD(x, z); for (let d = Math.floor(a.d) + 1; d <= a.d + 40; d++) { const p = epXZ(a.u, d); if (epCube(p.x, y + 0.2, p.z)) return true; } return false; }
const epLod = () => S0 * (game.lodAt || 0.45);   // ближе этого ядро рисует всё подробно (в редакторе порог 0.2 — видно полтитана)
const epTurning = () => Math.abs(view.angle - Math.round(view.angle / 90) * 90) > 0.5 || Math.abs(zcam.ang - view.angle) > 0.5;
// ---------- файл карты ↔ уровень ----------
// mapLoad кладёт предметы файла в списки LEVEL по порядку; spawnProps потом может их поправить (лампы без опоры перевешиваются).
// Поэтому рамка и выбор — по объекту уровня (где нарисовано), а правка — в запись файла с тем же номером.
const EP_KEY = {}; for (const k in MAP_LIB) EP_KEY[MAP_LIB[k]] = k;
function epLoad(text) { mapLoad(text); epRefs(text); spawnProps(); }
function epRefs(text) {
  const m = typeof text === 'string' ? JSON.parse(text) : text, cnt = {}; EP.refs = {};
  m.props.forEach((q, i) => { if (q.one) return; const key = EP_KEY[q.lib]; if (!key) return; const j = cnt[key] = (cnt[key] || 0) + 1; const o = (LEVEL[key] || [])[j - 1]; if (o && typeof o === 'object' && !Array.isArray(o)) EP.refs[i] = o; });
}
// ---------- файл карты: какие предметы можно трогать ----------
function epIndex() {   // по текущему файлу: список предметов с местом
  EP.m = JSON.parse(ED.map); EP.items = [];
  EP.m.props.forEach((q, i) => { if (q.gone) return; let k = PK[q.lib]; if (!k && typeof q.lib === 'string' && q.lib.startsWith('user/')) k = { sec: 'Мои', name: 'Предмет', w: q2 => q2.cw || 1, h: q2 => (q2.cw || 1) * (q2.ratio || 1), top: q.sec === 'hang', mid: q.sec === 'wall', floor: q.sec === 'stand', del: true };   /* предмет из картинки, которого нет в библиотеке */
    if (k && q.arm) { const o = EP.refs && EP.refs[i]; if (!o) return; let x, y, z; if (k.ladder) { const c = lanePosR(o.f, o.t, o.r || 0.001); x = c[0]; z = c[1]; y = num(o.y0); } else if (k.pipe) { x = o.pts[0][0]; y = o.pts[0][1]; z = o.pts[0][2]; } else { x = o.x; y = o.y; z = o.z; }
      if (y < -9000) return; EP.items.push({ i, q, k, o, x, y, z }); return; }   /* v278: на руке — где он сейчас (рука в покое) */
    if (k && k.pipe) { if (q.shinClimb || !epiFacing(q)) return; const a = epiAnchor(epiPts(q)); EP.items.push({ i, q, k, o: null, x: a.x, y: a.y, z: a.z }); return; }   /* v254: труба — ломаная, видна, если на нашей стороне */
    if (k && k.ladder && q.t !== undefined) { const c = eldXZ(q); EP.items.push({ i, q, k, o: null, x: c.x, y: num(q.y0), z: c.z }); return; }   /* v252: у лестницы место — сторона и полоса */
    if (k && k.walkway) { if (((num(q.f) % 4) + 4) % 4 !== view.k) return; const a = ewkAnchor(q); EP.items.push({ i, q, k, o: null, x: a.x, y: a.y, z: a.z }); return; }
    if (k && k.stairs) { if (((num(q.f) % 4) + 4) % 4 !== view.k) return; const a = estAnchor(q); EP.items.push({ i, q, k, o: null, x: a.x, y: a.y, z: a.z }); return; }   /* v287: ступени — видны со своей стороны */
    if (!k || q.one || q.x === undefined || q.y === undefined || q.z === undefined) return;
    const o = EP.refs && EP.refs[i]; if (o && (o.gone || (EP_KEY[q.lib] === 'lamps' && !LEVEL.lamps.includes(o)))) return;   /* лампу без опоры игра убрала — её не видно */
    const src = o && o.x !== undefined ? o : q; EP.items.push({ i, q, k, o, x: num(src.x), y: num(src.y), z: num(src.z) }); });
  epLibCounts(); epSelInfo();
}
function epBox(it, x, y, z) {   // рамка предмета на экране: [x0, y0, x1, y1]
  if (it.k.stairs || it.k.walkway) { const b = it.k.walkway ? ewkBox(it) : estBox(it); if (x === undefined) return b; const [ax, ay] = epToScreen(it.x, it.y, it.z), [bx, by] = epToScreen(x, y, z); return [b[0] + bx - ax, b[1] + by - ay, b[2] + bx - ax, b[3] + by - ay]; }
  if (it.k.pipe) { const b = epiBox(it); if (x === undefined) return b; const [ax, ay] = epToScreen(it.x, it.y, it.z), [bx, by] = epToScreen(x, y, z); return [b[0] + bx - ax, b[1] + by - ay, b[2] + bx - ax, b[3] + by - ay]; }
  const k = it.k, w = pkv(k.w, it.q), h = pkv(k.h, it.q), [sx, sy] = epToScreen(x === undefined ? it.x : x, y === undefined ? it.y : y, z === undefined ? it.z : z);
  const top = k.top ? sy : k.mid ? sy - h * S / 2 : sy - h * S; return [sx - w * S / 2, top, sx + w * S / 2, top + h * S];
}
function epPick(px, py) {
  if (S < epLod() || epTurning()) return null; let best = null, bd = 1e9;
  for (const it of EP.items) { const [x0, y0, x1, y1] = epBox(it); const pad = 6; if (px < x0 - pad || px > x1 + pad || py < y0 - pad || py > y1 + pad) continue;
    if (epHidden(it.x, it.k.top ? it.y - 0.5 : it.y, it.z)) continue;
    if (it.k.pipe) { const dd = epiDist(it, px, py); if (dd > Math.max(9, S * 0.16)) continue; if (dd - 6 < bd) { bd = dd - 6; best = it; } continue; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dd = Math.hypot(px - cx, py - cy) + (EP.sel && EP.sel.i === it.i ? -4 : 0); if (dd < bd) { bd = dd; best = it; } }
  return best;
}
// ---------- правка: файл → карта заново ----------
function epCommit(m, msg) {
  const text = JSON.stringify(m); EP.undo.push(ED.map); if (EP.undo.length > 40) EP.undo.shift(); EP.redo = [];
  epApply(text); if (msg) edMsg(msg);
}
function epApply(text) {
  try { epLoad(text); ED.map = text; game.mapText = text; edStore('l', 'grk_editor_last', text); ED.dirty = true; edDirty(); }
  catch (e) { edMsg('Не получилось: ' + e.message, true); console.error(e); try { epLoad(ED.map); } catch (e2) {} }
  EP.hover = null; const si = EP.sel && EP.sel.i; epIndex(); EP.sel = si !== undefined && si !== null ? EP.items.find(t => t.i === si) || null : null; epSelInfo();
}
function epUndo() { if (!EP.undo.length) { edMsg('Отменять нечего'); return; } EP.redo.push(ED.map); const t = EP.undo.pop(); epApply(t); edMsg('Отменено'); }
function epRedo() { if (!EP.redo.length) { edMsg('Возвращать нечего'); return; } EP.undo.push(ED.map); const t = EP.redo.pop(); epApply(t); edMsg('Возвращено'); }
const r2 = v => Math.round(v * 100) / 100;
function epMark(q) { q.by = 'hand'; q.pin = true; return q; }
function epTop(x, y, z) {   // верх уступа/пола в столбце (x, z) не выше y+0.6 и не ниже y-3: куб, над которым пусто
  const X = Math.round(x), Z = Math.round(z); for (let yy = Math.floor(y + 0.6); yy >= Math.floor(y) - 3; yy--) if (hasCube(X, yy - 1, Z) && !hasCube(X, yy, Z) && !hasCube(X, yy + 1, Z)) return yy; return null;
}
function epSnap(k, q, x, y, z, ref) {   // напольное — на верх уступа под точкой: сначала там же, потом на клетку к стене, потом от стены
  if (!k.floor) return { x: r2(x), y: r2(y), z: r2(z) };
  const a = epUD(x, z), off = ref && ref.y !== undefined ? Math.max(0, Math.min(0.6, Math.round((ref.y - Math.round(ref.y)) * 100) / 100)) : 0;
  for (const dd of [0, -1, 1]) { const p = epXZ(a.u, Math.round(a.d) + dd), t = epTop(p.x, y, p.z); if (t !== null) return { x: r2(p.x), y: r2(t + off), z: r2(p.z) }; }
  return null;
}
function epMoveTo(it, x, y, z) {
  if (it.k.stairs) { estMove(it, x, y, z); return; }   /* v287 */
  if (it.k.walkway) { ewkMove(it, x, y, z); return; }   /* v288 */
  if (it.k.pipe && !it.q.arm) { epiMove(it, x, y, z); return; }
  const m = JSON.parse(ED.map), q = m.props[it.i];
const p = epSnap(it.k, q, x, y, z, it); if (!p) { edMsg('Под этим местом нет пола'); return; }
  if (it.k.ladder) { const old = JSON.parse(JSON.stringify(q)), h = num(q.y1) - num(q.y0); eldSet(q, p.x, p.z, view.k); q.y0 = p.y; q.y1 = r2(p.y + h); epMark(q); eldSync(m, q, old); epCommit(m, 'Лестница — передвинута'); return; }
  if (it.k.door) { const pt = epToScreen(x, y + 0.5, z), t = eddAt(pt[0], pt[1]); if (!t) { edMsg('Дверь ставится на уступ у стены', true); return; } Object.assign(q, t); epMark(q); epCommit(m, 'Дверь — передвинута'); return; }   /* v276 */
  if (it.k.trap) { const pt = epToScreen(x, y, z), t = edrTrapAt(pt[0], pt[1]); if (!t) { edMsg('Ловушка ставится у пола, потолка или боковины стены', true); return; } delete q.ax; delete q.az; delete q.dir; Object.assign(q, t); epMark(q); epCommit(m, 'Ловушка — передвинута'); return; }   /* v271 */
  if (it.k.wgear) { const pt = epToScreen(x, y, z), n = edrWGearAt(pt[0], pt[1]); if (!n) { edMsg('Здесь нет ребра стены, пола или потолка — шестерня не встанет', true); return; } q.x = r2(n.x); q.y = n.y; q.z = r2(n.z); delete q.w; delete q.wHand; epMark(q); epCommit(m, 'Шестерня в стене — передвинута'); return; }   /* v270 */
  if (!it.k.floor && !it.k.ladder && !it.k.top) { const a = epUD(p.x, p.z), w = pkv(it.k.w, q) || 1, h = pkv(it.k.h, q) || 1, yc = it.k.top ? p.y - h / 2 : it.k.mid ? p.y : p.y + h / 2; let dcb = -1e9;   /* v272: перетащили — тоже перед кубами под ним */
    for (let du = -w / 2; du <= w / 2 + 1e-6; du += 0.25) for (let dy = -h / 2; dy <= h / 2 + 1e-6; dy += 0.25) { const d2 = epFrontD(a.u + du, yc + dy); if (d2 !== null && d2 > dcb) dcb = d2; }
    if (dcb > -1e8 && a.d < dcb + 0.85) { const p2 = epXZ(a.u, dcb + 1); p.x = r2(p2.x); p.z = r2(p2.z); } }
  q.x = p.x; q.y = p.y; q.z = p.z; epMark(q); epCommit(m, it.k.name + ' — передвинут' + (it.k.name.endsWith('а') ? 'а' : ''));
}
function epDelete() {
  const it = EP.sel; if (!it) return; if (!it.k.del) { edMsg(it.k.name + ' пока нельзя удалять — на него ссылаются другие предметы. Можно двигать.', true); return; }
  if (it.k.pipe) { epiDelete(it); return; }
  if (it.k.door) { const m = JSON.parse(ED.map); eddUnlink(m, eddNum(m, it.i)); m.props[it.i].gone = true; m.props[it.i].sealed = true; EP.sel = null; epCommit(m, 'Дверь удалена (её пара теперь закрыта)'); return; }   /* v276: номера дверей не сдвигаем */
  const m = JSON.parse(ED.map), q0 = m.props[it.i]; if (it.k.ladder) eldRemove(m, q0); m.props.splice(m.props.indexOf(q0), 1); EP.sel = null; epCommit(m, it.k.name + ' — удалён' + (it.k.name.endsWith('а') ? 'а' : ''));
}
function epDuplicate() {
  const it = EP.sel; if (!it) return; if (it.k.walkway) { edMsg('Переход: копию не делаю — поставь новый из библиотеки (кликом по площадке)'); return; } if (it.k.stairs) { edMsg('Ступени: копию не делаю — поставь новые из библиотеки (кликом по площадке)'); return; } if (!it.k.del) { edMsg(it.k.name + ' пока нельзя копировать', true); return; }
  if (it.k.pipe) { epiDup(it); return; }
  const a = epUD(it.x, it.z), p0 = epXZ(a.u + 1, a.d), p = epSnap(it.k, it.q, p0.x, it.y, p0.z, it); if (!p) { edMsg('Рядом нет пола — копия не встала'); return; }
  const m = JSON.parse(ED.map), q = JSON.parse(JSON.stringify(m.props[it.i]));
  if (it.k.ladder) { const h = num(q.y1) - num(q.y0); eldSet(q, p.x, p.z, view.k); q.y0 = p.y; q.y1 = r2(p.y + h); epMark(q); m.props.splice(it.i + 1, 0, q); eldSync(m, q, null); EP.sel = { i: it.i + 1 }; epCommit(m, 'Копия: лестница'); return; }
  q.x = p.x; q.y = p.y; q.z = p.z; if (it.k.wgear && !q.wHand) delete q.w; epMark(q); m.props.splice(it.i + 1, 0, q);
  EP.sel = { i: it.i + 1 }; epCommit(m, 'Копия: ' + it.k.name.toLowerCase());
}
// v271 (Алексей 20.10: «пусть его будет видно, пока ставишь; ставит только один тип, а должно генерировать новые»):
// сборка предмета под курсором отдельно от постановки — тот же предмет рисуется призраком под мышью (18_ghost.js) и ставится по клику;
// вид у каждого нового — свой (epVary), после постановки следующий — снова новый.
function epMapObj() { if (EP.mObjSrc !== ED.map) { EP.mObj = JSON.parse(ED.map); EP.mObjSrc = ED.map; } return EP.mObj; }   // разобранный файл карты — один раз на правку (призрак строится каждый кадр)
function epBuildAt(px, py) {   // → { q, m, tplIt, k } или { msg } (ладдер — { ladder, ... })
  const lib = EP.place, k = PK[lib]; const u = (px - W / 2) / S, y = cam.y - (py - H / 2) / S;
  { const ar = earmBuild(lib, k, px, py); if (ar) return ar; }
  if (k.stairs) return estBuild(px, py);
  if (k.walkway) return ewkBuild(px, py);   /* v288: переход */   /* v287: ступени от края площадки до соседней */   /* v280: над рукой — ставим в кусок руки (20_armprops.js) */
  if (k.wgear) { const n = edrWGearAt(px, py); if (!n) return { msg: 'Шестерня в стене встаёт на ребро: кликни у края стены, пола или потолка (рядом с пустотой)' };
    const q = epVary(lib, { lib, x: r2(n.x), y: n.y, z: r2(n.z), f: view.k, k: EWG.k }); return { q, k, w: n.w }; }
  if (k.door) { const t = eddAt(px, py); if (!t) return { msg: 'Дверь ставится на уступ, вплотную к стене — наведи на пол у стены' };
    return { q: epVary(lib, Object.assign({ lib }, t, { spr: 'door0', sprL: 'door2', sealed: true })), k }; }   /* v276 */
  if (k.trap) { const t = edrTrapAt(px, py); if (!t) return { msg: 'Ловушка ставится у пола, потолка или боковины стены — наведи ближе к ним' };
    return { q: epVary(lib, Object.assign({ lib }, t, { ph: 0 })), k }; }   /* v271: откуда бьёт — по месту */
  let dc = epFrontD(u, y); if (dc === null && (k.floor || k.ladder)) dc = epFrontD(u, y - 0.7);   /* v280: над уступом без стены за ним (уступы рук торчат вбок) — по самому уступу */
  if (dc === null) return { msg: 'Ставить можно на стену титана — здесь пусто' };
  const m = epMapObj(); let tpl = null, tplIt = null;
  for (const it of EP.items) if (it.q.lib === lib && (!k.tpl || k.tpl(it.q))) { if (!tplIt || Math.abs(it.y - y) < Math.abs(tplIt.y - y)) tplIt = it; }
  if (tplIt) tpl = JSON.parse(JSON.stringify(m.props[tplIt.i]));
  else if (k.user) { tpl = { lib }; for (const kk of USER_CARD_KEYS) if (k.user[kk] !== undefined) tpl[kk] = k.user[kk]; Object.assign(tpl, { x: 0, y: 0, z: 0, f: view.k }); }   /* свой предмет: всё нужное для рисования — в самой записи */
  else if (k.grip) tpl = { lib, x: 0, y: 0, z: 0, f: view.k, k: EGR.k, flip: false };
  else tpl = { lib, x: 0, y: 0, z: 0 };
  // отступ от стены — как у образца (лампа висит перед стеной, ящик стоит на дорожке)
  let off = 1; if (k.wallOff) off = 0.52; else if (k.off) off = k.off; else if (tplIt && !k.floor) { const a = epUD(tplIt.x, tplIt.z), wd = epFrontD(a.u, tplIt.y + (k.top ? -0.6 : 0.3)); if (wd !== null) off = Math.max(0.5, Math.min(2, Math.round((a.d - wd) * 100) / 100)); }
  let dcb = dc; if (!k.floor && !k.top) { const w = (pkv(k.w, tpl) || 1) + 1, h = (pkv(k.h, tpl) || 1) + 0.5, yc = k.top ? y - h / 2 : k.mid ? y : y + h / 2;   /* v272: перед всеми кубами под предметом — иначе большая шестерня уходит за текстуру уступа рядом */
    for (let du = -w / 2; du <= w / 2 + 1e-6; du += 0.25) for (let dy = -h / 2; dy <= h / 2 + 1e-6; dy += 0.25) { const d2 = epFrontD(u + du, yc + dy); if (d2 !== null && d2 > dcb) dcb = d2; } }
  const uu = k.floor ? Math.round(u) : Math.round(u * 2) / 2, p0 = epXZ(uu, dcb + off); const p = epSnap(k, tpl, p0.x, y, p0.z, tplIt); if (!p) return { msg: 'Здесь нет уступа или пола — ' + k.name.toLowerCase() + ' не встанет' };
  if (k.ladder) return { ladder: true, tpl, p, m, k };
  Object.assign(tpl, p); if ('f' in tpl) tpl.f = view.k; delete tpl.by; delete tpl.pin;
  if ('gone' in tpl) tpl.gone = false; if ('got' in tpl) tpl.got = false;
  return { q: epVary(lib, tpl), m, k };
}
// у каждого нового — свой вид: ухват, декор, ящик, лампа, корпус шестерни… (выбор держится, пока предмет не поставлен — призрак = то, что встанет)
const EP_DECOR = { IND: ['stub0', 'stub1', 'stub2', 'stub3', 'arch0', 'arch1', 'arch2', 'arch3'], WOOD: ['branch0', 'branch1', 'branch2', 'branch3'] };
function epVarN(lib, q) {   // сколько видов у раздела (чтобы новый не повторял только что поставленный)
  if (lib === 'hang/grip') return GRIPS.length; if (lib === 'mech/wallGear') return WGEAR.h.length;
  if (lib === 'unit/door') return typeof DOORS2 !== 'undefined' ? Math.max(1, DOORS2.filter(d => d.set === 'moss' && d.kind === 'rect').length) : 5;
  if (lib === 'deco/decor') return EP_DECOR.WOOD.includes(q.spr) ? EP_DECOR.WOOD.length : EP_DECOR.IND.length;
  if (lib === 'plat/crate') return typeof CRATES2 !== 'undefined' ? CRATES2.filter(c => c.kind !== 'barrel').length : 6; return 0; }
function epVary(lib, q) {
  if (!EP.var || EP.var.lib !== lib) { const R = Math.random, V = { lib }, n = epVarN(lib, q), last = (EP.lastV || {})[lib];
    for (let t = 0; t < 12; t++) { V.k = Math.floor(R() * 1000); if (!n || last === undefined || V.k % n !== last % n) break; }   // v275: не тот же вид, что только что поставлен
    V.flip = R() < 0.5; V.f1 = R(); V.f2 = R(); EP.var = V; }
  const V = EP.var;
  if (lib === 'hang/grip') { q.k = V.k % GRIPS.length; q.flip = V.flip; }
  else if (lib === 'deco/decor') { const L = EP_DECOR.WOOD.includes(q.spr) ? EP_DECOR.WOOD : EP_DECOR.IND; q.spr = L[V.k % L.length]; q.flip = V.flip; }
  else if (lib === 'plat/crate') q.pv = V.k;
  else if (lib === 'hang/lamp') { q.len = Math.round((1 + V.f1 * 1.2) * 10) / 10; q.ph = Math.round(V.f2 * 600) / 100; }
  else if (lib === 'mech/wallGear') q.k = V.k % WGEAR.h.length;
  else if (lib === 'unit/door') { q.v = V.k % 64; q.flip = V.flip; }
  else if (lib === 'mech/gear') { q.rust = V.flip ? 1 : 0; if (q.drive !== undefined) q.drive = Math.sign(num(q.drive) || 1) * Math.round((0.7 + V.f1 * 0.6) * 100) / 100; }
  else if (lib === 'danger/steam' || lib === 'danger/trap') q.ph = Math.round(V.f1 * 300) / 100;
  return q;
}
function epPlaceAt(px, py) {   // поставить предмет из библиотеки туда, куда кликнули
  const lib = EP.place, k = PK[lib]; if (k.pipe) { if (!earmPipe(px, py)) epiPlace(px, py); return; }
  const r = epBuildAt(px, py); if (r.msg) { edMsg(r.msg, !!k.wgear); return; }
  if (r.armed && k.ladder) { const m = JSON.parse(ED.map), q = JSON.parse(JSON.stringify(r.q)); epMark(q); m.props.push(q); EP.sel = { i: m.props.length - 1 }; EP.var = null; epCommit(m, 'Поставлена: лестница на руку'); return; }   /* лаз — сам, с рукой */
  if (r.ladder) { const { tpl, p } = r, m = JSON.parse(ED.map), h = tpl.y1 !== undefined ? num(tpl.y1) - num(tpl.y0) : 3; for (const kk of ['x', 'y', 'z', 'hatch', 'by', 'pin']) delete tpl[kk]; eldSet(tpl, p.x, p.z, view.k); tpl.y0 = p.y; tpl.y1 = r2(p.y + h); epMark(tpl); m.props.push(tpl); eldSync(m, tpl, null); EP.sel = { i: m.props.length - 2 }; epCommit(m, 'Поставлена: лестница'); EP.var = null; return; }
  const m = JSON.parse(ED.map), q = JSON.parse(JSON.stringify(r.q)); epMark(q); m.props.push(q); EP.sel = { i: m.props.length - 1 }; if (EP.var) { EP.lastV = EP.lastV || {}; EP.lastV[lib] = EP.var.k; } EP.var = null;   // следующий — новый вид
  epCommit(m, 'Поставлен' + (k.name.endsWith('а') ? 'а' : '') + ': ' + k.name.toLowerCase() + ' · клик — ещё (каждый раз новый вид), Esc или правая кнопка — хватит');
}
// ---------- мышь ----------
function epMouse() {
  const cv = canvas;
  cv.addEventListener('contextmenu', e => { if (EP.mode === 'props' && EP.place) { e.preventDefault(); epPlaceStop(); edMsg('Хватит ставить'); } });
  cv.addEventListener('mousedown', e => {
    if (EP.mode !== 'props' || e.button !== 0 || e.shiftKey) return; const [px, py] = epCanvasPos(e);
    if (S < epLod() && !EP.place) { if (!EP.farTold || Date.now() - EP.farTold > 8000) { EP.farTold = Date.now(); edMsg('Издалека виден весь титан. Приблизь колесом мыши чуть ближе — тогда предметы видно и можно брать.', true); } return; }
    if (EP.place) { e.stopImmediatePropagation(); e.preventDefault(); if (S < epLod()) { edMsg('Приблизьте — ставить можно вблизи'); return; } if (epTurning()) return; epPlaceAt(px, py); return; }   /* v275: ставить дальше — пока не Esc, правая кнопка или снова кнопка в списке; каждый раз новый вид */
    if (EDD.link !== null) { const it2 = epPick(px, py); e.stopImmediatePropagation(); e.preventDefault(); eddLinkClick(it2); return; }   /* v276: «Связать с дверью…» — клик по второй */
    const it = epPick(px, py);
    if (it) { e.stopImmediatePropagation(); e.preventDefault(); EP.sel = it; epSelInfo(); EP.drag = { it, px, py, moved: false, x: it.x, y: it.y, z: it.z }; }
    else if (EP.sel) { EP.sel = null; epSelInfo(); }
  }, true);
  addEventListener('mousemove', e => {
    if (EP.mode !== 'props') return; const [px, py] = epCanvasPos(e); EP.mouse = [px, py];
    const D = EP.drag; if (D) { const dx = (px - D.px) / S, dy = (py - D.py) / S; if (Math.hypot(px - D.px, py - D.py) > 4) D.moved = true;
      const a = epUD(D.it.x, D.it.z), st = D.it.k.floor ? 1 : 0.1, nu = Math.round((a.u + dx) / st) * st, p = epXZ(nu, a.d); const s = epSnap(D.it.k, D.it.q, p.x, D.it.y - dy, p.z, D.it); D.to = s; return; }
    if (e.target === canvas) EP.hover = epPick(px, py); else EP.hover = null;
    if (!EP.place) canvas.style.cursor = EP.hover ? 'move' : '';
  });
  addEventListener('mouseup', () => { if ((EP.mode === 'props' || EP.mode === 'cubes' || EP.mode === 'titan') && !EP.drag && !ECAM.turn) zcam.ang = Math.round(zcam.ang / 90) * 90; });   /* в правке вид встаёт ровно на сторону */
  addEventListener('mouseup', () => { const D = EP.drag; if (!D) return; EP.drag = null; if (D.moved && D.to) epMoveTo(D.it, D.to.x, D.to.y, D.to.z); else if (D.moved) edMsg('Под этим местом нет пола'); });
}
// ---------- рисование поверх (рамки, призрак, роботы-метки) ----------
function epDraw() {
  const o = EP.octx; if (!o) return; const cv = EP.over; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; } o.clearRect(0, 0, W, H);
  if (EP.mode === 'titan') { etDraw(); return; }   /* v255: 50_titan.js */
  if (EP.mode !== 'props' || S < epLod()) return;
  const lw = Math.max(2, Math.round(S * 0.03));
  const rect = (b, col, fill, dash) => { o.save(); o.lineWidth = lw; o.strokeStyle = col; if (dash) o.setLineDash([lw * 3, lw * 2]); if (fill) { o.fillStyle = fill; o.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); } o.strokeRect(Math.round(b[0]) + 0.5, Math.round(b[1]) + 0.5, Math.round(b[2] - b[0]), Math.round(b[3] - b[1])); o.restore(); };
  const label = (b, t, col) => { o.save(); o.font = Math.max(12, Math.round(S * 0.16)) + 'px "PT Mono", monospace'; const w = o.measureText(t).width + 10, h = Math.max(16, Math.round(S * 0.22)); o.fillStyle = 'rgba(6,18,26,0.85)'; o.fillRect(b[0], b[1] - h - 2, w, h); o.fillStyle = col; o.textBaseline = 'middle'; o.fillText(t, b[0] + 5, b[1] - h / 2 - 2); o.restore(); };
  if (!epTurning()) for (const it of EP.items) if (it.k.marker && !epHidden(it.x, it.y + 0.5, it.z)) { const b = epBox(it); rect(b, 'rgba(224,112,46,0.9)', 'rgba(224,112,46,0.18)', true); label(b, 'робот', '#e0702e'); }
  if (EP.hover && EP.hover !== EP.sel && !EP.drag) { const b = epBox(EP.hover); rect(b, 'rgba(54,138,142,0.95)'); label(b, EP.hover.k.name, '#9fd8db'); }
  if (EP.sel && EP.sel.k) { const b = epBox(EP.sel); rect(b, '#e0702e', 'rgba(224,112,46,0.12)'); label(b, EP.sel.k.name + (EP.sel.q.pin ? ' · руками' : ''), '#ffb37a'); }
  estDraw(o);   /* v253: квадратики растягивания (14_stretch.js) */
  if (EP.drag && EP.drag.moved) { const t = EP.drag.to; if (t) { const b = epBox(EP.drag.it, t.x, t.y, t.z); rect(b, '#e6f2f4', 'rgba(230,242,244,0.15)', true); } }
  if (EP.place && EP.mouse && !epTurning()) { const [px, py] = EP.mouse, k = PK[EP.place];   /* v271: призрак — тот самый предмет, что встанет по клику */
    let r = null; if (!k.pipe && !k.ladder) { const key = EP.place + '|' + Math.round(px) + '|' + Math.round(py) + '|' + (EP.var ? EP.var.k : '') + '|' + ED.map.length; if (EP.gk === key) r = EP.gr; else { try { r = epBuildAt(px, py); } catch (e) { r = null; } EP.gk = key; EP.gr = r; } }
    if (r && r.q) { const it = { k, q: r.q, x: num(r.q.x), y: num(r.q.y), z: num(r.q.z) }; const drawn = edGhostDraw(o, r); const bx = epBox(it); if (!drawn) rect(bx, '#e6f2f4', 'rgba(230,242,244,0.12)', true); label(bx, 'поставить: ' + k.name.toLowerCase(), '#e6f2f4'); }
    else if (r && r.msg) { const w = pkv(k.w, {}) * S, h = pkv(k.h, {}) * S, bx = [px - w / 2, py - h / 2, px + w / 2, py + h / 2]; rect(bx, '#e05a4a', 'rgba(224,90,74,0.12)', true); label(bx, r.msg, '#ff9a8a'); }
    else { const w = pkv(k.w, {}) * S, h = pkv(k.h, {}) * S; rect([px - w / 2, py - h / 2, px + w / 2, py + h / 2], '#e6f2f4', 'rgba(230,242,244,0.12)', true); label([px - w / 2, py - h / 2], 'поставить: ' + k.name.toLowerCase(), '#e6f2f4'); } }
}
// ---------- библиотека и сведения о выбранном ----------
function epLib() {
  const box = edEl('edLibList'); box.textContent = '';
  for (const sec of PK_SECS) { const libs = Object.keys(PK).filter(l => PK[l].sec === sec); if (!libs.length) continue;
    const h = document.createElement('div'); h.className = 'edh'; h.textContent = sec; box.appendChild(h);
    for (const l of libs) { const b = document.createElement('button'); b.type = 'button'; b.dataset.lib = l; const n = document.createElement('span'); n.textContent = PK[l].name; const c = document.createElement('em'); c.className = 'cnt'; b.append(n, c);
      b.addEventListener('click', () => { if (EP.place === l) epPlaceStop(); else epPlaceStart(l); });
      if (l.startsWith('user/')) { const row = document.createElement('div'); row.className = 'urow'; const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'ued'; ed.title = 'Карточка: вид, размер, свечение, дорисовать'; ed.textContent = '✎'; ed.addEventListener('click', () => ecdOpen(l.slice(5))); row.append(b, ed); box.appendChild(row); } else box.appendChild(b); } }
  epLibCounts();
}
function epLibCounts() { const cnt = {}; for (const it of EP.items) cnt[it.q.lib] = (cnt[it.q.lib] || 0) + 1; document.querySelectorAll('#edLibList button[data-lib]').forEach(b => { b.querySelector('.cnt').textContent = cnt[b.dataset.lib] || ''; b.classList.toggle('act', EP.place === b.dataset.lib); }); }
function epPlaceStart(l) { EP.place = l; EP.sel = null; epSelInfo(); epLibCounts(); canvas.style.cursor = 'crosshair'; edMsg('Кликните по стене или уступу — поставить: ' + PK[l].name.toLowerCase() + ' (Esc — отмена)'); }
function epPlaceStop() { EP.place = null; epLibCounts(); canvas.style.cursor = ''; }
function epSelInfo() {
  const el = edEl('edSel'); if (!el) return; const it = EP.sel && EP.sel.k ? EP.sel : null; el.hidden = !it; if (!it) { ecpInfo(); eldInfo(); elootCrateInfo(); epiInfo(); egrInfo(); ewgInfo(); edrInfo(); eddInfo(); ekeyInfo(); return; }
  edEl('edSelName').textContent = it.k.name + (it.q.pin ? ' · поставлено руками' : '');
  edEl('edSelPos').textContent = 'x ' + r2(it.x) + ' · высота ' + r2(it.y) + ' · z ' + r2(it.z);
  edEl('edSelDel').disabled = !it.k.del; edEl('edSelDup').disabled = !it.k.del; ecpInfo(); eldInfo(); elootCrateInfo(); epiInfo(); egrInfo(); ewgInfo(); edrInfo(); eddInfo(); ekeyInfo();
}
function epTool(t) {   // нижние вкладки: «Пропсы» и «Кубы» готовы, «Титан» и «Отделка» — честно «скоро»
  eunShowTab(t === 'units'); if (t === 'units') { EP.mode = 'units'; document.querySelectorAll('#edTools button').forEach(b => b.classList.toggle('act', b.dataset.tool === t)); edEl('edLib').hidden = true; edEl('edCubes').hidden = true; edEl('edTitan').hidden = true; edEl('edHint').textContent = 'B карандаш · E ластик · G заливка · I пипетка · [ ] размер · ← → кадр · пробел — играть · Ctrl+Z'; edMsg('Юниты: слева анимация, внизу кадры — рисуй прямо в кадре. «Сохранить» — и игра возьмёт.', true); return; }
  if (t !== 'props' && t !== 'cubes' && t !== 'titan') { edMsg({ titan: 'Титан — позже: силуэт, части тела, ярусы.', finish: 'Отделка — позже: мох, ржавчина, ползунки.' }[t] || 'Скоро', true); return; }
  EP.mode = t; EP.sel = null; EP.hover = null; EC.hover = null; epPlaceStop(); epSelInfo(); canvas.style.cursor = t === 'cubes' ? 'crosshair' : '';
  document.querySelectorAll('#edTools button').forEach(b => b.classList.toggle('act', b.dataset.tool === t));
  edEl('edLib').hidden = t !== 'props'; edEl('edCubes').hidden = t !== 'cubes'; edEl('edTitan').hidden = t !== 'titan'; ET.place = null; ET.ghost = null; ET.hover = null; etShowSize(); etInfo();
  edEl('edHint').textContent = t === 'titan' ? 'деталь справа → клик по стене или в воздух · клик по детали — выбрать, тянуть — двигать · Delete · Ctrl+D — копия · Esc · колёсико — поворот' : t === 'cubes' ? 'клик/вести — ставить или убирать · 1/2 — ставить/убирать · [ ] — глубина · WASD — камера · Q/E или зажать колёсико — поворот · Ctrl+Z'
    : 'WASD — камера · Q/E или зажать колёсико — поворот · колесо — ближе/дальше · тянуть предмет — двигать · квадратик на конце или Alt+тянуть — длиннее/короче · Delete · Ctrl+Z';
  edMsg(t === 'titan' ? 'Титан: собирай из деталей. Справа выбери деталь и размер, клик — поставить. Клик по детали — выбрать, тяни — двигать.' : t === 'cubes' ? 'Кубы: белый куб — куда встанет. Клик — поставить, можно и в воздух. Камера — WASD, поворот — Q/E.' : 'Пропсы: кликни по предмету — выбрать, тяни — двигать. Справа — библиотека.', true);
}
function edDirty() { const d = edEl('edDirty'); if (d) d.hidden = !ED.dirty; }
function epInit() {
  EP.over = edEl('edOver'); EP.octx = EP.over.getContext('2d'); estMouse(); epMouse(); epLib();
  EP.mode = 'props'; document.querySelectorAll('#edTools button').forEach(b => b.addEventListener('click', () => epTool(b.dataset.tool))); ecUI(); etInit(); eunInit();
  edEl('edSelDel').addEventListener('click', epDelete); edEl('edSelDup').addEventListener('click', epDuplicate);
  edEl('edUndo').addEventListener('click', epUndo); edEl('edRedo').addEventListener('click', epRedo);
  addEventListener('keydown', e => { const t = e.target; if (edModal()) return; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) epRedo(); else epUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); epRedo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') { e.preventDefault(); epDuplicate(); }
    else if (e.code === 'Delete' || e.code === 'Backspace') { if (EP.sel) { e.preventDefault(); epDelete(); } }
    else if (e.code === 'Escape') { if (EDD.link !== null) { EDD.link = null; edMsg('Связывание отменено'); } else if (EP.place) epPlaceStop(); else { EP.sel = null; epSelInfo(); } }
  });
}
// ====================== РЕДАКТОР: ЛЕСТНИЦЫ В «ПРОПСАХ» (v252) ======================
// Лестница в файле карты — запись climb/ladder {f (сторона), t (вдоль стороны), r (от середины, 8 — дорожка перед стеной ноги), y0, y1}.
// По ней лезет не она сама, а «лаз» — запись climb/climb {x, z, y0, y1, d}, которую генератор делает из каждой лестницы.
// Поэтому редактор правит их парой: двигает/удаляет лестницу — двигает/удаляет и её лаз; новая лестница — новый лаз.
// В «Выбрано» у лестницы: выше / ниже (по полкуба) и «До уступа» — дотянуть верх до ближайшего уступа рядом (куда с лестницы можно сойти).
function eldXZ(q) { const c = lanePosR(num(q.f), num(q.t), q.r !== undefined ? num(q.r) : 8); return { x: c[0], z: c[1] }; }
function eldSet(q, x, z, f) {   // обратно: точка (x, z) на стороне f → t, r
  f = ((f % 4) + 4) % 4; const T = [[x, z], [-z, x], [-x, -z], [z, -x]][f]; q.f = f; q.t = r2(T[0]); q.r = r2(T[1]);
}
function eldClimbIdx(m, q) {   // лаз этой лестницы: не труба, не провод, те же x, z и верх
  const c = eldXZ(q), y1 = num(q.y1);
  return m.props.findIndex(p => p.lib === 'climb/climb' && !p.pipe && !p.wire && !p.$ref && Math.abs(num(p.x) - c.x) < 1e-6 && Math.abs(num(p.z) - c.z) < 1e-6 && Math.abs(num(p.y1) - y1) < 1e-6);
}
function eldClimbOf(q) { const c = eldXZ(q); return { lib: 'climb/climb', x: c.x, z: c.z, y0: num(q.y0), y1: num(q.y1), d: q.r !== undefined ? num(q.r) : 8, by: 'hand', pin: true }; }
function eldSync(m, q, old) {   // после правки лестницы q (old — какой была): лаз — вслед
  const i = old ? eldClimbIdx(m, old) : -1, c = eldClimbOf(q);
  if (i >= 0) Object.assign(m.props[i], c); else m.props.push(c);
}
function eldRemove(m, q) { const i = eldClimbIdx(m, q); if (i >= 0) m.props.splice(i, 1); }
function eldWallTop(q, from) {   // ближайший уступ над низом: рядом с лестницей (в её полосе — сама клетка или соседняя вдоль стены) куб, над ним пусто — туда и сойти
  const c = eldXZ(q), f = num(q.f) % 4, R = [[1, 0], [0, -1], [-1, 0], [0, 1]][f];
  for (let y = Math.floor(from) + 1; y < Math.floor(from) + 16; y++) for (const s of [0, -1, 1]) { const x = Math.round(c.x + R[0] * s), z = Math.round(c.z + R[1] * s); if (hasCube(x, y - 1, z) && !hasCube(x, y, z) && !hasCube(x, y + 1, z)) return y; }
  return null;
}
function eldEdit(fn, msg) {
  const it = EP.sel; if (!it || !it.k || !it.k.ladder) return; const m = JSON.parse(ED.map), q = m.props[it.i], old = JSON.parse(JSON.stringify(q));
  if (fn(q) === false) return; q.y1 = r2(Math.max(num(q.y0) + 1, num(q.y1))); epMark(q); eldSync(m, q, old); epCommit(m, msg);
}
function eldInfo() {
  const it = EP.sel, row = edEl('edSelLadder'); if (!row) return; const L = !!(it && it.k && it.k.ladder); row.hidden = !L; if (!L) return;
  edEl('eldH').textContent = r2(num(it.q.y1) - num(it.q.y0)) + ' куба';
}
function eldInit() {
  edEl('eldUp').addEventListener('click', () => eldEdit(q => { q.y1 = num(q.y1) + 0.5; }, 'Лестница выше'));
  edEl('eldDown').addEventListener('click', () => eldEdit(q => { if (num(q.y1) - num(q.y0) <= 1) { edMsg('Короче не бывает — 1 куб'); return false; } q.y1 = num(q.y1) - 0.5; }, 'Лестница ниже'));
  edEl('eldTop').addEventListener('click', () => eldEdit(q => { const t = eldWallTop(q, num(q.y0) + 0.5); if (t === null) { edMsg('Над лестницей нет края стены'); return false; } q.y1 = t; }, 'Лестница — до уступа'));
}
// ====================== РЕДАКТОР: ТРУБЫ В «ПРОПСАХ» (v254) ======================
// Труба в файле — climb/pipe {pts: [[x, y, z], …], out (вода), deco (не лезть), ph}. Ломаная: обычно «из стены — вдоль стены — в стену».
// По вертикальным кускам лезут, по горизонтальным висят, из «водяной» течёт вода — всё это игра достраивает сама при запуске по точкам трубы.
// В редакторе: выбрать (клик рядом с трубой), тянуть — двигать целиком, квадратики на концах — длиннее/короче вдоль своего куска (14_stretch.js),
// «Копия», «Удалить», поставить из библиотеки (прямая вверх на 3 куба), в «Выбрано»: «Лезть», «Вода».
// Правка трубы помечает её pin и запоминает, куда она смотрит (n — сторона): по ней можно лезть у любой стены, лицом к нам.
// Общие точки (мостки ссылаются на точки труб по номеру) перед правкой разворачиваются в копии (epDeref) — номера труб могут сдвинуться.
const P3n = p => [num(p[0]), num(p[1]), num(p[2])];
function epiPts(q) { return q.pts.map(P3n); }
function epiView(P) { return P.map(p => { const a = epUD(p[0], p[2]); return { u: a.u, d: a.d, y: p[1] }; }); }
function epiFacing(q) {   // труба на нашей стороне: её конец «из стены» (первый кусок; нет — последний, у водяной — носик) смотрит к нам
  if (!Array.isArray(q.pts) || q.pts.length < 2 || q.pts.some(p => !Array.isArray(p))) return false; const P = epiPts(q), n = P.length - 1, b = epBasis();
  const st = (a, c) => { const dx = c[0] - a[0], dz = c[2] - a[2], L = Math.hypot(dx, dz); return Math.abs(c[1] - a[1]) < 1e-3 && L > 0.05 && L < 0.8 ? (dx * b.n[0] + dz * b.n[1]) / L : null; };
  let v = st(P[0], P[1]); if (v === null) { v = st(P[n], P[n - 1]); if (v !== null && q.out) v = -v; }
  return v !== null && v > 0.9;
}
function epiAnchor(P) { const n = P.length; return { x: P.reduce((s, p) => s + p[0], 0) / n, y: P.reduce((s, p) => s + p[1], 0) / n, z: P.reduce((s, p) => s + p[2], 0) / n }; }
function epiDist(it, px, py) {   // расстояние от точки экрана до ломаной трубы (в точках экрана)
  const P = epiPts(it.q).map(p => epToScreen(p[0], p[1], p[2])); let best = 1e9;
  for (let i = 0; i + 1 < P.length; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy)); }
  return best;
}
function epiBox(it) { const P = epiPts(it.q).map(p => epToScreen(p[0], p[1], p[2])), g = Math.max(8, S * 0.3); return [Math.min(...P.map(p => p[0])) - g, Math.min(...P.map(p => p[1])) - g, Math.max(...P.map(p => p[0])) + g, Math.max(...P.map(p => p[1])) + g]; }
// концы: с конца — группа точек с теми же u, y (заглушки в стену, носик воды), дальше — первая точка, где сдвиг по экрану: вдоль этого куска и тянем
function epiEnds(it) {
  const P = epiPts(it.q), V = epiView(P), same = (a, b) => Math.abs(a.u - b.u) < 1e-3 && Math.abs(a.y - b.y) < 1e-3, out = [];
  for (const [key, st, dir] of [['a', 0, 1], ['b', P.length - 1, -1]]) { let j = st; while (V[j + dir] && same(V[j], V[j + dir])) j += dir; const k = j + dir; if (!V[k]) continue;
    const axis = Math.abs(V[k].y - V[j].y) > 1e-3 ? 'y' : 'u'; out.push({ key, x: P[j][0], y: P[j][1], z: P[j][2], axis, grp: dir > 0 ? [st, j] : [j, st], inner: V[k], at: V[j] }); }
  return out;
}
function epiSnapEnd(it, e, u, y) {   // новый конец вдоль своего куска, не ближе полкуба к соседней точке
  if (e.axis === 'y') { let v = Math.round(y * 10) / 10; const s = Math.sign(e.at.y - e.inner.y) || 1; if ((v - e.inner.y) * s < 0.5) v = e.inner.y + 0.5 * s; return { u: e.at.u, y: v }; }
  let v = Math.round(u * 10) / 10; const s = Math.sign(e.at.u - e.inner.u) || 1; if ((v - e.inner.u) * s < 0.5) v = e.inner.u + 0.5 * s; return { u: v, y: e.at.y };
}
function epiApplyEnd(it, e, to) {
  const m = JSON.parse(ED.map); epDeref(m, 'pipes.'); const q = m.props[it.i], P = epiPts(q), du = to.u - e.at.u, dy = to.y - e.at.y, b = epBasis();
  for (let i = e.grp[0]; i <= e.grp[1]; i++) P[i] = [r2(P[i][0] + du * b.r[0]), r2(P[i][1] + dy), r2(P[i][2] + du * b.r[1])];
  q.pts = P; epiMark(m, q); epCommit(m, 'Труба: ' + (e.axis === 'y' ? 'по высоте' : 'вдоль стены') + ' — ' + r2(Math.abs(e.axis === 'y' ? to.y - e.inner.y : to.u - e.inner.u)) + ' куба');
}
function epiMark(m, q) { delete q.vpts; const b = epBasis(); q.n = [b.n[0], b.n[1]]; epMark(q); if (m.titan && m.titan.pipesFixed !== undefined && m.titan.pipesFixed !== null) m.titan.pipesFixed = null; }
function epiMove(it, x, y, z) {   // целиком: сдвиг на разницу якоря
  const m = JSON.parse(ED.map); epDeref(m, 'pipes.'); const q = m.props[it.i], b = epBasis(), a0 = epUD(it.x, it.z), a1 = epUD(x, z), du = Math.round((a1.u - a0.u) * 2) / 2, dy = Math.round((y - it.y) * 10) / 10;
  if (!du && !dy) return; q.pts = epiPts(q).map(p => [r2(p[0] + du * b.r[0]), r2(p[1] + dy), r2(p[2] + du * b.r[1])]); epiMark(m, q); epCommit(m, 'Труба — передвинута');
}
function epiNew(u, y, dc, tpl) {   // прямая вверх на 3 куба, из стены и в стену; тип (вода/лезть) — как у образца
  const y0 = Math.round(y) - 1 + 0.4, y1 = y0 + 3, din = dc + 0.4, dout = dc + 0.95, P = (yy, d) => { const p = epXZ(u, d); return [r2(p.x), r2(yy), r2(p.z)]; };
  const q = { lib: 'climb/pipe', pts: [P(y0, din), P(y0, dout), P(y1, dout), P(y1, din)] }; if (tpl && tpl.deco) q.deco = true; return q;
}
function epiPlace(px, py) {
  const u = Math.round((px - W / 2) / S), y = cam.y - (py - H / 2) / S, dc = epFrontD(u, y); if (dc === null) { edMsg('Ставить можно на стену титана — здесь пусто'); return; }
  const m = JSON.parse(ED.map), q = epiNew(u, y, dc); epiMark(m, q); m.props.push(q); EP.sel = { i: m.props.length - 1 }; epCommit(m, 'Поставлена: труба (тяни за квадратики — длиннее)');
}
function epiDup(it) {
  const m = JSON.parse(ED.map); epDeref(m, 'pipes.'); const q = JSON.parse(JSON.stringify(m.props[it.i])), b = epBasis(); q.pts = epiPts(q).map(p => [r2(p[0] + b.r[0]), p[1], r2(p[2] + b.r[1])]); delete q.ph;
  epiMark(m, q); m.props.splice(it.i + 1, 0, q); EP.sel = { i: it.i + 1 }; epCommit(m, 'Копия: труба');
}
function epiDelete(it) { const m = JSON.parse(ED.map); epDeref(m, 'pipes.'); m.props.splice(it.i, 1); if (m.titan && m.titan.pipesFixed) m.titan.pipesFixed = null; EP.sel = null; epCommit(m, 'Труба — удалена'); }
function epiWater(it) {   // вода: последний конец — носик к нам (как у генератора, +0.35 от трубы); выключить — снова в стену
  const m = JSON.parse(ED.map); epDeref(m, 'pipes.'); const q = m.props[it.i], P = epiPts(q), V = epiView(P), n = P.length - 1, b = epBasis();
  if (n < 1 || Math.abs(V[n].u - V[n - 1].u) > 1e-3 || Math.abs(V[n].y - V[n - 1].y) > 1e-3) { edMsg('У этой трубы конец не у стены — воду не включить', true); return; }
  const dd = q.out ? (V[n - 1].d - 0.55) - V[n].d : (V[n - 1].d + 0.35) - V[n].d; P[n] = [r2(P[n][0] + dd * b.n[0]), P[n][1], r2(P[n][2] + dd * b.n[1])]; q.pts = P;
  if (q.out) { delete q.out; } else { q.out = true; q.ph = q.ph || 0; delete q.deco; } epiMark(m, q); epCommit(m, q.out ? 'Труба: из неё течёт вода' : 'Труба: без воды');
}
function epiClimb(it) { const m = JSON.parse(ED.map), q = m.props[it.i]; if (q.deco) delete q.deco; else q.deco = true; epiMark(m, q); epCommit(m, q.deco ? 'Труба: только для красоты — не лезть' : 'Труба: по ней можно лезть'); }
function epiInfo() {
  const it = EP.sel, row = edEl('edSelPipe'); if (!row) return; const P = !!(it && it.k && it.k.pipe); row.hidden = !P; if (!P) return;
  edEl('epiClimb').classList.toggle('act', !it.q.deco); edEl('epiWater').classList.toggle('act', !!it.q.out);
}
function epiInit() { edEl('epiClimb').addEventListener('click', () => EP.sel && epiClimb(EP.sel)); edEl('epiWater').addEventListener('click', () => EP.sel && epiWater(EP.sel)); }
// общие объекты по пути «список.номер.…» → копии (для списков с префиксом), чтобы удаление/вставка не сбили номера
function epDeref(m, prefix) {
  const lists = {}; for (const q of m.props) { const key = EP_KEY[q.lib]; if (key) (lists[key] = lists[key] || []).push(q); }
  const val = q => ('v' in q && Object.keys(q).length === 2) ? q.v : q;
  const get = path => { const s = path.split('.'); let o = lists[s[0]] && lists[s[0]][+s[1]]; if (!o) return null; o = val(o); for (let i = 2; i < s.length && o; i++) { o = o[s[i]]; if (o && o.$ref) o = get(o.$ref); } return o === undefined ? null : o; };
  const res = r => { const v = get(r); return v === null ? null : JSON.parse(JSON.stringify(v)); };
  const fix = v => { if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const x = v[i]; if (x && x.$ref && x.$ref.startsWith(prefix)) v[i] = res(x.$ref); else fix(x); } }
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) { const x = v[k]; if (x && x.$ref && x.$ref.startsWith(prefix)) v[k] = res(x.$ref); else fix(x); } };
  for (const q of m.props) fix(q); fix(m.titan);
}
// ====================== РЕДАКТОР: РАСТЯГИВАТЬ (v253–v254, просьба Алексея) ======================
// Лестница, лампа, труба — у них нет одной картинки: рисунок повторяется по длине. У выбранной такой штуки на концах —
// квадратики: тянуть за квадратик — длиннее/короче. Или Alt + тянуть саму штуку — тянется ближний конец. Тянется от места захвата.
// Лестница — по полкуба (верх и низ, лаз вслед — 12_ladders.js), лампа — шнур (низ), по 0.1, от 0.4 до 8;
// труба — каждый конец вдоль своего куска (вверх-вниз или вбок), по 0.1, не короче полкуба (13_pipes.js).
const EST = { drag: null };
function estEnds(it) {   // [{key, x, y, z, axis}] — где квадратики
  if (!it || !it.k) return []; const q = it.q;
  if (it.k.ladder) return [{ key: 'top', x: it.x, y: num(q.y1), z: it.z, axis: 'y' }, { key: 'bot', x: it.x, y: num(q.y0), z: it.z, axis: 'y' }];
  if (q.lib === 'hang/lamp') return [{ key: 'bot', x: it.x, y: it.y - (it.o && it.o.len !== undefined ? it.o.len : num(q.len) || 1.2) - 0.35, z: it.z, axis: 'y' }];
  if (it.k.pipe) return epiEnds(it);
  if (it.k.stairs || it.k.walkway) { const f = num(q.f) % 4, r = num(q.r) || 8, A = lanePosR(f, num(q.t0), r), B = lanePosR(f, num(q.t1), r), ya = it.k.walkway ? num(q.y) : num(q.y0), yb = it.k.walkway ? num(q.y) : num(q.y1);   /* v289: концы марша/перехода */
    return [{ key: 'a', x: A[0], y: ya, z: A[1], axis: it.k.walkway ? 'u' : 'uy' }, { key: 'b', x: B[0], y: yb, z: B[1], axis: it.k.walkway ? 'u' : 'uy' }]; }
  return [];
}
const estAt = e => ({ u: epUD(e.x, e.z).u, y: e.y });
function estTo(D, mu, my) {
  const it = D.it, e = D.e, u = mu + D.off.u, y = my + D.off.y;
  if (it.k.pipe) return epiSnapEnd(it, e, u, y);
  if (it.k.stairs || it.k.walkway) { const o = estEnds(it).find(q => q.key !== D.key), O = estAt(o); let uu = Math.round((u - 0.5) ) + 0.5, yy = it.k.walkway ? O.y : Math.round(y);
    uu = Math.round((u + 0.5)) - 0.5; if (Math.abs(uu - O.u) < 1) uu = O.u + (uu >= O.u ? 1 : -1); if (!it.k.walkway && Math.abs(yy - O.y) > Math.abs(uu - O.u)) yy = O.y + Math.sign(yy - O.y) * Math.floor(Math.abs(uu - O.u)); if (!it.k.walkway) { const b = epBasis(), cu = cam.x * b.r[0] + cam.z * b.r[1], d = Math.sign(O.u - uu) || 1;   // v290 (Алексей: «встаёт спереди от платформы — должна идти от угла куба до угла куба верхней платформы»): конец на площадке — съезжает к её краю
      for (let g = 0; g < 12 && Math.abs(uu + d - O.u) >= 1 && estStand(Math.round(uu + cu + d * 0.5), yy); g++) uu += d; }
    return { u: uu, y: yy }; }   // не круче 45°
  if (it.k.ladder) { let v = Math.round(y * 2) / 2; v = D.key === 'top' ? Math.max(num(it.q.y0) + 1, v) : Math.min(num(it.q.y1) - 1, v); return { u: D.at.u, y: v }; }
  const len = Math.max(0.4, Math.min(8, Math.round((it.y - y - 0.35) * 10) / 10)); return { u: D.at.u, y: it.y - len - 0.35 };
}
function estLen(D) {
  const it = D.it, t = D.to; if (it.k.stairs || it.k.walkway) { const O = estAt(estEnds(it).find(q => q.key !== D.key)); return r2(Math.abs(t.u - O.u)) + (it.k.stairs ? ' × ' + r2(Math.abs(t.y - O.y)) : ''); } if (it.k.pipe) return r2(Math.abs(D.e.axis === 'y' ? t.y - D.e.inner.y : t.u - D.e.inner.u));
  if (it.k.ladder) return r2(D.key === 'top' ? t.y - num(it.q.y0) : num(it.q.y1) - t.y); return r2(it.y - t.y - 0.35);
}
function estApply(D) {
  const it = D.it, t = D.to;
  if (it.k.pipe) { epiApplyEnd(it, D.e, t); return; }
  const m = JSON.parse(ED.map), q = m.props[it.i];
  if (it.k.stairs || it.k.walkway) { const b = epBasis(), t = t0u => r2(t0u + cam.x * b.r[0] + cam.z * b.r[1]); if (D.key === 'a') { q.t0 = t(D.to.u); if (it.k.stairs) q.y0 = D.to.y; } else { q.t1 = t(D.to.u); if (it.k.stairs) q.y1 = D.to.y; }
    if (it.k.stairs) { const ld = stairPickLand(Object.assign({}, q, { t0: num(q.t0), t1: num(q.t1), y0: num(q.y0), y1: num(q.y1), r: num(q.r) || 8 }), estBlk(num(q.r) || 8)); if (ld) q.land = ld; }   // v290: площадка там, где ступеням не мешают кубы
    epMark(q); epCommit(m, it.k.stairs ? 'Ступени: ' + r2(Math.abs(num(q.t1) - num(q.t0))) + ' вбок, ' + r2(Math.abs(num(q.y1) - num(q.y0))) + ' вверх' : 'Переход: ' + r2(Math.abs(num(q.t1) - num(q.t0))) + ' куба'); return; }
  if (it.k.ladder) { const old = JSON.parse(JSON.stringify(q)); if (D.key === 'top') q.y1 = t.y; else q.y0 = t.y; epMark(q); eldSync(m, q, old); epCommit(m, 'Лестница: ' + r2(num(q.y1) - num(q.y0)) + ' куба'); return; }
  q.len = r2(it.y - t.y - 0.35); q.y = r2(it.y); epMark(q); epCommit(m, 'Лампа: шнур ' + q.len);
}
const estScr = a => [W / 2 + a.u * S, H / 2 - (a.y - cam.y) * S];
function estHandleAt(px, py) {   // квадратик под мышью у выбранного
  const it = EP.sel; if (!it || !it.k) return null; const r = Math.max(10, S * 0.14);
  for (const e of estEnds(it)) { const [sx, sy] = estScr(estAt(e)); if (Math.abs(px - sx) < r && Math.abs(py - sy) < r) return e; }
  return null;
}
function estMouse() {
  canvas.addEventListener('mousedown', e => {
    if (EP.mode !== 'props' || e.button !== 0 || EP.place || S < epLod() || epTurning()) return; const [px, py] = epCanvasPos(e), mu = (px - W / 2) / S, my = cam.y - (py - H / 2) / S;
    let end = estHandleAt(px, py), it = EP.sel;
    if (!end && e.altKey) { const p = epPick(px, py); const ends = estEnds(p); if (ends.length) { it = p; EP.sel = p; epSelInfo(); end = ends.reduce((a, b) => { const A = estAt(a), B = estAt(b); return Math.hypot(B.u - mu, B.y - my) < Math.hypot(A.u - mu, A.y - my) ? b : a; }); } }
    if (!end) return; e.stopImmediatePropagation(); e.preventDefault(); const at = estAt(end); EST.drag = { it, key: end.key, e: end, at, off: { u: at.u - mu, y: at.y - my }, to: null };
  }, true);
  addEventListener('mousemove', e => { const D = EST.drag; if (!D) return; const [px, py] = epCanvasPos(e); D.to = estTo(D, (px - W / 2) / S, cam.y - (py - H / 2) / S); canvas.style.cursor = D.e.axis === 'u' ? 'ew-resize' : 'ns-resize'; });
  addEventListener('mouseup', () => { const D = EST.drag; if (!D) return; EST.drag = null; canvas.style.cursor = ''; if (D.to && (Math.abs(D.to.y - D.at.y) > 1e-6 || Math.abs(D.to.u - D.at.u) > 1e-6)) estApply(D); });
}
function estDraw(o) {
  const D = EST.drag, it = D ? D.it : EP.sel; const ends = estEnds(it); if (!ends.length || epTurning()) return;
  const g = Math.max(5, Math.round(S * 0.07)), lw = Math.max(2, Math.round(S * 0.03));
  for (const e of ends) { const on = D && D.key === e.key, a = on && D.to ? D.to : estAt(e), [sx, sy] = estScr(a);
    if (on && D.to) { const [ox, oy] = estScr(D.at); o.save(); o.strokeStyle = '#e6f2f4'; o.lineWidth = lw; o.setLineDash([lw * 3, lw * 2]); o.beginPath(); o.moveTo(ox, oy); o.lineTo(sx, sy); o.stroke(); o.restore(); }
    o.fillStyle = '#1a0f14'; o.fillRect(Math.round(sx - g - 2), Math.round(sy - g - 2), 2 * g + 4, 2 * g + 4); o.fillStyle = '#e0702e'; o.fillRect(Math.round(sx - g), Math.round(sy - g), 2 * g, 2 * g);
    o.fillStyle = '#fff4e1'; if (e.axis === 'u') o.fillRect(Math.round(sx - 1), Math.round(sy - g / 2), 2, g); else if (e.axis === 'uy') { o.fillRect(Math.round(sx - 1), Math.round(sy - g / 2), 2, g); o.fillRect(Math.round(sx - g / 2), Math.round(sy - 1), g, 2); } else o.fillRect(Math.round(sx - g / 2), Math.round(sy - 1), g, 2); }
  if (D && D.to) { const [sx, sy] = estScr(D.to); o.save(); o.font = Math.max(12, Math.round(S * 0.15)) + 'px "PT Mono", monospace'; const t = (it.k.ladder ? 'высота ' : it.k.pipe ? 'кусок ' : it.k.stairs ? 'ступени ' : it.k.walkway ? 'переход ' : 'шнур ') + estLen(D);
    const w = o.measureText(t).width + 10; o.fillStyle = 'rgba(6,18,26,0.88)'; o.fillRect(sx + g + 6, sy - 10, w, 20); o.fillStyle = '#ffb37a'; o.textBaseline = 'middle'; o.fillText(t, sx + g + 11, sy); o.restore(); }
}
// ====================== РЕДАКТОР: УХВАТЫ (v265) ======================
// «Ухваты» в библиотеке «Пропсов»: поставить на стену (как свои картинки на стену), тянуть, копия, удалить. В «Выбрано» у ухвата —
// вид (◀ ▶ — листать 72 картинки, кнопка — открыть все), ↔ отразить. Новый ставится тем видом, что выбран последним.
const EGR = { k: 0 };
function egrEdit(fn, msg) { const it = EP.sel; if (!it || !it.k || !it.k.grip) return; const m = JSON.parse(ED.map), q = m.props[it.i]; fn(q); EGR.k = q.k; epMark(q); epCommit(m, msg); }
function egrInfo() {
  const it = EP.sel, row = edEl('edSelGrip'); if (!row) return; const G = !!(it && it.k && it.k.grip); row.hidden = !G; if (!G) { edEl('egrAll').hidden = true; return; }
  edEl('egrN').textContent = ((it.q.k | 0) + 1) + ' из ' + GRIPS.length; const c = edEl('egrPv'), r = GRIPS[it.q.k | 0], I = gripImg(); if (!I) return;
  const s = Math.max(1, Math.floor(Math.min(56 / r[2], 56 / r[3]))); c.width = r[2] * s; c.height = r[3] * s; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(I, r[0], r[1], r[2], r[3], 0, 0, c.width, c.height);
}
function egrAllShow() {
  const box = edEl('egrAll'), I = gripImg(); box.innerHTML = ''; if (!I) return;
  GRIPS.forEach((r, i) => { const b = document.createElement('button'); b.type = 'button'; b.title = 'вид ' + (i + 1); const c = document.createElement('canvas'), s = Math.max(1, Math.floor(Math.min(32 / r[2], 32 / r[3]))); c.width = r[2] * s; c.height = r[3] * s; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(I, r[0], r[1], r[2], r[3], 0, 0, c.width, c.height); b.append(c);
    b.addEventListener('click', () => egrEdit(q => { q.k = i; }, 'Ухват: вид ' + (i + 1))); box.append(b); });
}
function egrInit() {
  edEl('egrPrev').addEventListener('click', () => egrEdit(q => { q.k = ((q.k | 0) - 1 + GRIPS.length) % GRIPS.length; }, 'Ухват: другой вид'));
  edEl('egrNext').addEventListener('click', () => egrEdit(q => { q.k = ((q.k | 0) + 1) % GRIPS.length; }, 'Ухват: другой вид'));
  edEl('egrFlip').addEventListener('click', () => egrEdit(q => { q.flip = !q.flip; }, 'Ухват отражён'));
  edEl('egrMore').addEventListener('click', () => { const b = edEl('egrAll'); b.hidden = !b.hidden; if (!b.hidden) egrAllShow(); });
}
// ====================== РЕДАКТОР: ШЕСТЕРНИ В СТЕНЕ (v269) ======================
// «Шестерня в стене» в «Механизмах» библиотеки «Пропсов»: поставить у ребра стены, пола или потолка — сама прилипает к ближайшему
// ребру и сама решает, откуда торчит (13g_wgears.js, wgPrep). В «Выбрано»: корпус ◀ ▶ (15 видов), «Откуда торчит» — авто / стена справа /
// слева / пол / потолок (выбранное руками остаётся как есть). Новая ставится тем корпусом, что выбран последним.
const EWG = { k: 0 }, EWG_SIDES = [[null, 'авто'], ['r', 'из стены справа'], ['l', 'из стены слева'], ['d', 'из пола'], ['u', 'из потолка']];
function ewgEdit(fn, msg) { const it = EP.sel; if (!it || !it.k || !it.k.wgear) return; const m = JSON.parse(ED.map), q = m.props[it.i]; fn(q); EWG.k = q.k | 0; epMark(q); epCommit(m, msg); }
function ewgInfo() {
  const it = EP.sel, row = edEl('edSelWGear'); if (!row) return; const G = !!(it && it.k && it.k.wgear); row.hidden = !G; if (!G) return;
  edEl('ewgN').textContent = ((it.q.k | 0) + 1) + ' из ' + WGEAR.h.length; const sd = EWG_SIDES.find(s => s[0] === (it.q.wHand ? it.q.w : null)) || EWG_SIDES[0];
  edEl('ewgSide').textContent = 'Откуда: ' + sd[1] + (sd[0] ? '' : it.o && it.o.w ? ' (' + EWG_SIDES.find(s => s[0] === it.o.w)[1] + ')' : '');
  const c = edEl('ewgPv'), r = WGEAR.h[it.q.k | 0], I = wgImg(); if (!I || !r) return; const s = Math.max(1, Math.floor(Math.min(56 / r[2], 56 / r[3])));
  c.width = r[2] * s; c.height = r[3] * s; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height); x.drawImage(I, r[0], r[1], r[2], r[3], 0, 0, c.width, c.height);
}
function ewgInit() {
  const n = WGEAR.h.length;
  edEl('ewgPrev').addEventListener('click', () => ewgEdit(q => { q.k = ((q.k | 0) - 1 + n) % n; }, 'Шестерня: другой корпус'));
  edEl('ewgNext').addEventListener('click', () => ewgEdit(q => { q.k = ((q.k | 0) + 1) % n; }, 'Шестерня: другой корпус'));
  edEl('ewgSide').addEventListener('click', () => ewgEdit(q => { const i = EWG_SIDES.findIndex(s => s[0] === (q.wHand ? q.w : null)), nx = EWG_SIDES[(i + 1) % EWG_SIDES.length];
    if (nx[0]) { q.w = nx[0]; q.wHand = true; } else { delete q.w; delete q.wHand; } }, 'Шестерня: откуда торчит'));
}
// ====================== РЕДАКТОР: ВИДНО СРАЗУ, НАПРАВЛЕНИЯ (v270) ======================
// Алексей 20.10: «многие объекты не появляются визуально, роботов сразу не видно, менять направление ловушек нельзя, направление
// вращения шестерёнок тоже; шестерню на стену — пишет „тут пусто“». Здесь: роботы рисуются стоя (в редакторе игра не идёт — своих
// роботов нет, только записи); в «Выбрано» у ловушки — откуда бьёт (пол / потолок / стена → / стена ←), у шестерни и шестерни в стене —
// куда крутится (↻ / ↺). Шестерня в стене ставится кликом у края стены, пола или потолка — сама прилипает к ближайшему ребру.
const EDR = { anim: null };
function edDrawRobots() {   // роботы карты — стоят на своих местах (кадр «стоит»), как увидит игрок до начала
  if (typeof Anim === 'undefined' || S < epLod() || !LEVEL.robots) return;
  if (!EDR.anim) { EDR.anim = new Anim(); EDR.anim.play('RobotAC_Stay'); } const nm = EDR.anim.sprite(); if (!nm || !SP[nm]) return;
  const b = epBasis(); ctx.imageSmoothingEnabled = false;
  for (const r of LEVEL.robots) { if (r.y > 2500 !== cam.y > 2500) continue; const u = (r.x - cam.x) * b.r[0] + (r.z - cam.z) * b.r[1], d = r.x * b.n[0] + r.z * b.n[1];
    if (Math.abs(u) > W / S / 2 + 1 || Math.abs(r.y - cam.y) > H / S / 2 + 2 || d < 6.5 && Math.abs(u + cam.x * b.r[0] + cam.z * b.r[1]) >= 7.3 || epHidden(r.x, r.y + 0.5, r.z)) continue;
    drawSprite(nm, u, r.y + 0.39, (r.h && (r.h[0] * b.r[0] + r.h[1] * b.r[1]) < 0) || false); }
}
// ---------- ловушка: откуда бьёт ----------
const EDR_TRAP = [['floor', 0, 'из пола'], ['ceil', 0, 'с потолка'], ['wall', 1, 'из стены →'], ['wall', -1, 'из стены ←']];
function edrEdit(test, fn, msg) { const it = EP.sel; if (!it || !it.k || !test(it.k)) return; const m = JSON.parse(ED.map), q = m.props[it.i]; fn(q, it); epMark(q); epCommit(m, msg); }
function edrTrapSet(i) { const [kind, dir, nm] = EDR_TRAP[i]; edrEdit(k => k.trap, (q, it) => { const x = num(q.x), y = num(q.y), z = num(q.z), f = q.f !== undefined ? num(q.f) % 4 : view.k, R = SKIN_R[f];
    if (kind === 'floor') { let yy = null; for (let t = Math.ceil(y); t > y - 6; t--) if (hasCube(Math.round(x), t - 1, Math.round(z)) && !hasCube(Math.round(x), t, Math.round(z))) { yy = t; break; } if (yy !== null) q.y = yy; }
    else if (kind === 'ceil') { let yy = null; for (let t = Math.floor(y); t < y + 6; t++) if (hasCube(Math.round(x), t, Math.round(z)) && !hasCube(Math.round(x), t - 1, Math.round(z))) { yy = t; break; } if (yy !== null) q.y = yy; }
    else { q.ax = R[0]; q.az = R[1]; q.dir = dir; if (q.kind !== 'wall') q.y = Math.floor(y) + 0.5; }
    q.kind = kind; q.f = f; }, 'Ловушка: ' + nm); }
// ---------- шестерня: куда крутится ----------
function edrGearSpin(sg) { edrEdit(k => k.gearSpin, (q, it) => { if (it.k.wgear) q.dir = sg; else { const v = Math.abs(num(q.drive) || 0.9); q.drive = sg * v; } }, 'Шестерня: крутится ' + (sg > 0 ? 'по часовой' : 'против часовой')); }
function edrInfo() {
  const it = EP.sel, tr = edEl('edSelTrap'), gs = edEl('edSelSpin'); if (!tr || !gs) return; const T = !!(it && it.k && it.k.trap), G = !!(it && it.k && it.k.gearSpin); tr.hidden = !T; gs.hidden = !G;
  if (T) { const q = it.q; EDR_TRAP.forEach((t, i) => edEl('edrT' + i).classList.toggle('act', q.kind === t[0] && (t[0] !== 'wall' || Math.sign(num(q.dir) || 1) === t[1]))); }
  if (G) { const q = it.q, s = it.k.wgear ? (num(q.dir) || 0) : Math.sign(num(q.drive) || 0); edEl('edrCw').classList.toggle('act', s > 0); edEl('edrCcw').classList.toggle('act', s < 0);
    edEl('edrSizeRow').hidden = !!it.k.wgear; EDR_R.forEach((r, i) => edEl('edrR' + i).classList.toggle('act', Math.abs((num(q.R) || 1) - r) < 0.01)); }
}
const EDR_R = [0.75, 1.2, 3.4, 5.2];   // v278: размеры колёс — как у колёс на стенах и как шарниры локтя и плеча руки
function edrGearSize(i) { edrEdit(k => k.gearSpin && !k.wgear, q => { q.R = EDR_R[i]; }, 'Шестерня: ' + ['малая', 'большая', 'огромная', 'гигантская'][i]); }
function edrInit() { EDR_R.forEach((r, i) => edEl('edrR' + i).addEventListener('click', () => edrGearSize(i))); EDR_TRAP.forEach((t, i) => edEl('edrT' + i).addEventListener('click', () => edrTrapSet(i))); edEl('edrCw').addEventListener('click', () => edrGearSpin(1)); edEl('edrCcw').addEventListener('click', () => edrGearSpin(-1)); }
// ---------- шестерня в стене: клик у края — к ближайшему ребру ----------
function edrWGearAt(px, py) {   // → {x, y, z} или null
  const b = epBasis(), u = (px - W / 2) / S + cam.x * b.r[0] + cam.z * b.r[1], y = cam.y - (py - H / 2) / S; return wgNearest(view.k, u, y, 2.5);
}
// ====================== РЕДАКТОР: ПРИЗРАК ПОД МЫШЬЮ, ЛОВУШКА ПО МЕСТУ (v271) ======================
// Алексей 20.10: «когда ставишь предмет — пусть его будет видно, пока ставишь, а не только пост фактум»; «электроловушку не ясно как ставить;
// положение ловушки (стена, пол, потолок)». Пока выбран предмет из библиотеки, под мышью рисуется тот самый предмет (полупрозрачный), который
// встанет по клику — с тем же видом (epVary). Куда нельзя — красная рамка и почему. Ловушка встаёт по месту: у пола — из пола, у потолка —
// с потолка, у боковины стены — из стены (бьёт в пустоту); потом в «Выбрано» можно переключить.
function edGhostObj(q, w) {   // запись → объект, который понимают рисовалки игры
  const lib = q.lib, o = Object.assign({}, q); for (const k of ['x', 'y', 'z', 'f', 'k', 'R', 'drive', 'len', 'th', 'ph', 'pv', 'dir', 'dx', 'dz']) if (o[k] !== undefined) o[k] = num(o[k]);
  if (lib === 'plat/crate') return Object.assign(o, { hp: 2, shake: 0, key: false });
  if (lib === 'unit/shard' || lib === 'unit/heart') return Object.assign(o, { ph: 0, born: 9, got: false });
  if (lib === 'unit/key') return Object.assign(o, { ph: 0, got: false, red: !!q.red, gate: q.gate || 0 });
  if (lib === 'hang/lamp') return Object.assign({ th: 0, om: 0, bob: 0, bv: 0, ph: 0, len: 1.4, f: view.k }, o);
  if (lib === 'mech/gear') return Object.assign({ ang: 0, om: 0, R: 1 }, o);
  if (lib === 'mech/wallGear') return { x: o.x, y: o.y, z: o.z, f: o.f, R: WGEAR.R, rust: false, wg: q, w: w || 'r', ang: game.time * 0.5 };
  if (lib === 'mech/vent') return Object.assign(o, { t: 0, cool: 0 });
  if (lib === 'danger/trap') return Object.assign({ hit: 0 }, o);
  return o;
}
function edGhostDraw(o2, r) {   // v280: призрак на руке — повёрнутым вместе с куском руки
  const q = r.q, y = num(q.y !== undefined ? q.y : q.y0 !== undefined ? q.y0 : 0);
  if (!EARM.inPk && typeof armPk === 'function' && armPk(y) && armWAt(y)) { const keep = ctx; let ok = false; ctx = o2; try { armWWith(armWAt(y), basis(view.angle), () => { EARM.inPk = true; try { ok = edGhostDraw0(o2, r); } finally { EARM.inPk = false; } }, false); } finally { ctx = keep; } return ok; }
  return edGhostDraw0(o2, r);
}
function edGhostDraw0(o2, r) {   // нарисовать призрак на холсте поверх (o2 — его контекст)
  const q = r.q, lib = q.lib, b = basis(view.angle), keep = ctx; ctx = o2; ctx.save(); ctx.globalAlpha = 0.75; let ok = true;
  try { const o = edGhostObj(q, r.w);
    if (lib === 'hang/grip') drawGrip(o, b); else if (lib === 'deco/decor') drawDecor(o, b); else if (lib === 'hang/lamp') { drawLamp(o, b, false); drawLamp(o, b, true); }
    else if (lib === 'plat/crate') drawCrate(o, b); else if (lib === 'unit/shard') drawBit(o, b); else if (lib === 'unit/heart') drawHeart(o, b); else if (lib === 'unit/key') drawKey(o, b);
    else if (lib === 'danger/fire') drawFire([{ dx: 0, dy: 0, sc: 1, flip: false, ph: 0, sp: 1, hot: false }], relU(o, b), o.y + 0.08, 1);
    else if (lib === 'danger/steam') { o.on = true; drawSteam(o, b); } else if (lib === 'danger/trap') { o.fr = 4; drawTrap(o, b); }
    else if (lib === 'unit/door') drawDoorAt(o, b); else if (lib === 'climb/stairs') drawStairs(o, b); else if (lib === 'plat/walkway') drawWalkway(o, b);
    else if (lib === 'mech/gear' || lib === 'mech/wallGear') drawGear(o, b); else if (lib === 'mech/vent') drawVent(o, b); else if (lib === 'deco/puddle') drawPuddle(o, b, true);
    else if (lib === 'unit/robot') { if (!EDR.anim) { EDR.anim = new Anim(); EDR.anim.play('RobotAC_Stay'); } drawSprite(EDR.anim.sprite(), relU(o, b), o.y + 0.39, false); }
    else if (lib.startsWith('user/') && typeof drawUserProp === 'function') drawUserProp(o, b); else ok = false; }
  catch (e) { ok = false; } ctx.restore(); ctx = keep; ctx.globalAlpha = 1; return ok;
}
// ---------- ловушка по месту: ближайшие пол / потолок / боковина стены у клика ----------
function edrTrapAt(px, py) {
  const f = view.k, R = SKIN_R[f], N = SKIN_N[f], F = wgFront(f), b = epBasis(), u = (px - W / 2) / S + cam.x * b.r[0] + cam.z * b.r[1], y = cam.y - (py - H / 2) / S, U = Math.round(u), c = [];
  const solid = (uu, yy) => F(uu, yy), air = (uu, yy, D) => F(uu, yy) <= D - 1;
  for (let yy = Math.floor(y + 0.5); yy >= Math.floor(y) - 2; yy--) { const D = solid(U, yy - 1); if (D > -50 && air(U, yy, D) && air(U, yy + 1, D)) { c.push({ kind: 'floor', u: U, y: yy, D, s: Math.abs(y - yy) }); break; } }
  for (let yy = Math.ceil(y - 0.5); yy <= Math.ceil(y) + 2; yy++) { const D = solid(U, yy); if (D > -50 && air(U, yy - 1, D) && air(U, yy - 2, D)) { c.push({ kind: 'ceil', u: U, y: yy, D, s: Math.abs(yy - y) }); break; } }
  const Y = Math.floor(y); for (const sd of [1, -1]) for (let t = 0; t <= 2; t++) { const cell = Math.round(u) + sd * t, nb = cell + sd, D = solid(nb, Y);
    if (D > -50 && air(cell, Y, D)) { c.push({ kind: 'wall', u: cell + sd * 0.5, y: Y + 0.5, D, dir: -sd, s: Math.abs(cell + sd * 0.5 - u) }); break; } }
  if (!c.length) return null; c.sort((a, b2) => a.s - b2.s); const t = c[0], d = t.D + 0.02;
  const q = { kind: t.kind, x: r2(t.u * R[0] + d * N[0]), y: t.y, z: r2(t.u * R[1] + d * N[1]), f };
  if (t.kind === 'wall') { q.ax = R[0]; q.az = R[1]; q.dir = t.dir; } return q;
}
// ====================== РЕДАКТОР: ДВЕРИ (v276) ======================
// Алексей 20.10: «добавить в редактор двери и разработать систему: генерирует ли дверь комнату, есть ли проход к двери и к какой двери,
// настройки — какой ключ нужен и нужен ли». Как устроено (то же, что у генератора): у каждой двери есть «куда» — номер второй двери (to).
// Войти можно, только если у двери есть пара; вошёл — вышел из второй двери (мир сам повернётся к её стороне). Варианты «куда»:
//   • в новую комнату — внутри титана строится комната (маленькая / средняя / большая; с роботами, ящиками, лампами, как у генератора),
//     в ней своя дверь обратно;
//   • к другой двери — «Связать с дверью…», потом клик по второй двери (на любой стороне и высоте; так делаются проходы сквозь ногу);
//   • никуда — дверь закрыта (нарисована, но не открывается).
// Ключ: нет / любой (обычный ключ, их считает счётчик) / жёлтый / синий. Открыл одну дверь пары — открыта и вторая.
// Дверь ставится на уступ, вплотную к стене; каждый раз новый вид. Удалить — дверь исчезает (номера других не сдвигаются), её пара закрывается.
const EDD = { link: null };
const eddDoors = m => { const a = []; m.props.forEach((q, i) => { if (q.lib === 'unit/door' && !q.one) a.push(i); }); return a; };   // номер двери → номер записи
function eddNum(m, pi) { return eddDoors(m).indexOf(pi); }
function eddAt(px, py) {   // дверь на уступе под курсором: { x, y, z, f } или null
  const f = view.k, R = SKIN_R[f], N = SKIN_N[f], F = wgFront(f), b = epBasis(), u = (px - W / 2) / S + cam.x * b.r[0] + cam.z * b.r[1], y = cam.y - (py - H / 2) / S, U = Math.round(u);
  for (let yy = Math.floor(y + 0.5); yy >= Math.floor(y) - 3; yy--) { const D = F(U, yy - 1); if (D < -50) continue; if (F(U, yy) > D - 1 || F(U, yy + 1) > D - 1) continue;
    if (F(U, yy) < -50 && F(U, yy + 1) < -50) return null;   // за дверью пусто — не на что её повесить
    return { x: U * R[0] + D * N[0], y: yy, z: U * R[1] + D * N[1], f }; }
  return null;
}
function eddUnlink(m, a) { const D = eddDoors(m), q = m.props[D[a]]; if (!q) return; const o = q.to !== undefined ? num(q.to) : -1; if (o >= 0 && D[o] !== undefined) { const p = m.props[D[o]]; if (num(p.to) === a) { delete p.to; p.sealed = true; } } delete q.to; }
function eddLink(m, a, b) { const D = eddDoors(m); eddUnlink(m, a); eddUnlink(m, b); const A = m.props[D[a]], B = m.props[D[b]]; A.to = b; B.to = a; delete A.sealed; delete B.sealed;
  for (const k of ['locked', 'gate']) { if (A[k] !== undefined) B[k] = A[k]; else delete B[k]; } epMark(A); epMark(B); }
function eddSel() { const it = EP.sel; return it && it.k && it.k.door ? it : null; }
function eddRoom(size) {   // за выбранной дверью — новая комната внутри титана
  const it = eddSel(); if (!it) return; const m0 = JSON.parse(ED.map), a = eddNum(m0, it.i); if (a < 0) return;
  const R = Math.random, T = { R, ri: (lo, hi) => lo + Math.floor(R() * (hi - lo + 1)), chance: p => R() < p };
  const OPT = { s: { cols: 1, rows: 1, name: 'Тайник', bots: 0, loot: true, wMin: 5, wMax: 6 }, m: { cols: 2, rows: 1, name: 'Кладовая', bots: 1, loot: true, wMin: 5, wMax: 7 }, l: { cols: 3, rows: 2, name: 'Комната', bots: 2 } }[size];
  try {
    mapLoad(ED.map); const nl = LEVEL.ladders.length, nw = (LEVEL.wireClimbs || []).length, d = LEVEL.doors[a];
    const C = makeComplex(T, Object.assign({ alt: Math.round(d.y), entry: R() < 0.5 ? 'bl' : 'br' }, OPT));
    for (const L of LEVEL.ladders.slice(nl)) { const r = L.r || 8, c = [[L.t, r], [r, -L.t], [-L.t, -r], [-r, L.t]][L.f % 4]; LEVEL.climbs.push({ x: c[0], z: c[1], y0: L.y0, y1: L.y1, d: r }); }   // как в buildLevel: по лестницам лазают
    for (const w of (LEVEL.wireClimbs || []).slice(nw)) LEVEL.climbs.push(w);
    const old = d.to; if (old !== undefined && LEVEL.doors[old] && LEVEL.doors[old].to === a) { delete LEVEL.doors[old].to; LEVEL.doors[old].sealed = true; }
    d.to = C.inD; delete d.sealed; const In = LEVEL.doors[C.inD]; In.to = a; if (d.locked) In.locked = d.locked; if (d.gate) In.gate = d.gate; d.by = 'hand'; d.pin = true;
    const m = mapSave(); EP.sel = { i: eddDoors(m)[a] }; epCommit(m, 'За дверью — новая комната: «' + C.name + '». «Показать, куда ведёт» — посмотреть');
  } catch (e) { console.error(e); edMsg('Комнату построить не вышло: ' + e.message, true); try { epLoad(ED.map); } catch (e2) {} }
}
function eddClose() { const it = eddSel(); if (!it) return; const m = JSON.parse(ED.map), a = eddNum(m, it.i); eddUnlink(m, a); m.props[it.i].sealed = true; epMark(m.props[it.i]); EP.sel = { i: it.i }; epCommit(m, 'Дверь закрыта — никуда не ведёт'); }
function eddKey(kind) { const it = eddSel(); if (!it) return; const m = JSON.parse(ED.map), D = eddDoors(m), a = eddNum(m, it.i), q = m.props[it.i], o = q.to !== undefined ? m.props[D[num(q.to)]] : null;
  for (const p of [q, o]) { if (!p) continue; delete p.locked; delete p.gate; delete p.tkey; if (kind !== 'none') p.locked = true; if (kind === 'y') p.gate = 1; if (kind === 'b') p.gate = 2; epMark(p); }
  EP.sel = { i: it.i }; epCommit(m, 'Дверь: ' + { none: 'без ключа', any: 'нужен любой ключ', y: 'нужен жёлтый ключ', b: 'нужен синий ключ' }[kind]); }
function eddLinkStart() { const it = eddSel(); if (!it) return; EDD.link = it.i; edMsg('Кликни по второй двери (любая сторона, можно повернуть титан). Esc — отмена', true); }
function eddLinkClick(it) {   // из epMouse: выбрана вторая дверь
  const a0 = EDD.link; EDD.link = null; if (!it || !it.k.door || it.i === a0) { edMsg('Связать не вышло — нужна другая дверь', true); return false; }
  const m = JSON.parse(ED.map), a = eddNum(m, a0), b = eddNum(m, it.i); eddLink(m, a, b); EP.sel = { i: it.i }; epCommit(m, 'Двери связаны: вошёл в одну — вышел из другой'); return true; }
function eddShow() {   // камера — ко второй двери
  const it = eddSel(); if (!it) return; const m = JSON.parse(ED.map), D = eddDoors(m), q = m.props[it.i]; if (q.to === undefined) { edMsg('Эта дверь никуда не ведёт'); return; }
  const p = m.props[D[num(q.to)]]; if (!p) return; const f = num(p.f) || 0; zcam.ang = Math.round(view.angle / 360) * 360 + f * 90; zcam.x = num(p.x); zcam.y = num(p.y) + 1; zcam.z = num(p.z);
  setTimeout(() => { epIndex(); const t = EP.items.find(x => x.i === D[num(q.to)]); if (t) { EP.sel = t; epSelInfo(); } }, 500); }
function eddInfo() {
  const it = eddSel(), row = edEl('edSelDoor'); if (!row) return; row.hidden = !it; if (!it) return;
  const m = EP.m || JSON.parse(ED.map), D = eddDoors(m), q = it.q, to = q.to !== undefined ? m.props[D[num(q.to)]] : null;
  let where = 'никуда — закрыта'; if (to) { const ry = num(to.y); if (ry > 2500) { const C = (LEVEL.complexes || []).find(c => ry >= c.y0 && ry <= c.y1); where = 'в комнату «' + (C ? C.name : 'комната') + '»'; }
    else where = 'к двери: сторона ' + ED_SIDES[num(to.f) % 4] + ', высота ' + Math.round(ry); }
  edEl('eddWhere').textContent = 'Ведёт: ' + where;
  const kk = q.locked ? (q.gate == 1 ? 'y' : q.gate == 2 ? 'b' : 'any') : 'none'; for (const k of ['none', 'any', 'y', 'b']) edEl('eddK_' + k).classList.toggle('act', kk === k);
  const keys = m.props.filter(p => p.lib === 'unit/key'), cnt = { any: keys.filter(p => !p.gate && !p.red).length, y: keys.filter(p => p.gate == 1).length, b: keys.filter(p => p.gate == 2).length };
  edEl('eddKeyNote').textContent = kk === 'none' ? '' : cnt[kk] ? 'ключей такого цвета на карте: ' + cnt[kk] : '⚠ такого ключа на карте нет — поставь «Ключ» и выбери ему цвет';
  edEl('eddKeyNote').classList.toggle('warn', kk !== 'none' && !cnt[kk]);
  erchInfo();   /* v285: можно ли дойти (21_reach.js) */
}
function eddInit() {
  edEl('eddRoomS').addEventListener('click', () => eddRoom('s')); edEl('eddRoomM').addEventListener('click', () => eddRoom('m')); edEl('eddRoomL').addEventListener('click', () => eddRoom('l'));
  edEl('eddLink').addEventListener('click', eddLinkStart); edEl('eddClose').addEventListener('click', eddClose); edEl('eddShow').addEventListener('click', eddShow);
  for (const k of ['none', 'any', 'y', 'b']) edEl('eddK_' + k).addEventListener('click', () => eddKey(k));
}
// ---------- ключ: цвет ----------
function ekeyInfo() { const it = EP.sel, row = edEl('edSelKey'); if (!row) return; const K = !!(it && it.k && it.k.keyc); row.hidden = !K; if (!K) return; const g = num(it.q.gate) || 0; edEl('ekK_any').classList.toggle('act', !g); edEl('ekK_y').classList.toggle('act', g === 1); edEl('ekK_b').classList.toggle('act', g === 2); }
function ekeySet(g) { const it = EP.sel; if (!it || !it.k || !it.k.keyc) return; const m = JSON.parse(ED.map), q = m.props[it.i]; delete q.crate; delete q.red; if (g) q.gate = g; else delete q.gate; epMark(q); EP.sel = { i: it.i }; epCommit(m, 'Ключ: ' + (g === 1 ? 'жёлтый' : g === 2 ? 'синий' : 'обычный')); }
function ekeyInit() { edEl('ekK_any').addEventListener('click', () => ekeySet(0)); edEl('ekK_y').addEventListener('click', () => ekeySet(1)); edEl('ekK_b').addEventListener('click', () => ekeySet(2)); }
// ====================== РЕДАКТОР: ПРЕДМЕТЫ НА РУКАХ (v280) ======================
// Руки теперь как ноги (13i_armworld.js): каждый кусок руки — свои кубы. Смотришь с востока или запада, наводишь на руку — редактор
// работает «внутри куска»: всё ставится на его кубы теми же правилами, что и на ноге (лестница на уступ, ухват на стену, шестерня в ребро,
// дверь у стены, ящик на пол…), и в игре стоит на руке и качается вместе с ней. Призрак и рамки рисуются повёрнутыми, как кусок.
const EARM = { inPk: false };
function earmPk(px, py) {   // курсор над куском руки → { w, F, p (точка в куске) } или null
  if (EARM.inPk || typeof armW === 'undefined' || !armW.length || !(view.k === 1 || view.k === 3)) return null;
  const r1 = view.r[1], zw = cam.z + (px - W / 2) / S * r1, yw = cam.y - (py - H / 2) / S; let best = null, bs = -0.2;
  for (const w of armW) { const F = armWFrame(w), p = armWW2P(w, zw, yw, F), s = armWScore(w, p); if (s > bs) { bs = s; best = { w, F, p }; } }
  return best;
}
// fn(px, py) — как обычно, но камера и точка — внутри куска руки; не над рукой — undefined
function earmCall(px, py, fn) { const a = earmPk(px, py); if (!a) return undefined; const r1 = view.r[1], cp = armWW2P(a.w, cam.z, cam.y, a.F), cy = cam.y, cz = cam.z;
  const qx = W / 2 + r1 * (a.p.z - cp.z) * S, qy = H / 2 - (a.p.y - cp.y) * S; cam.y = cp.y; cam.z = cp.z; EARM.inPk = true;
  try { return fn(qx, qy); } finally { cam.y = cy; cam.z = cz; EARM.inPk = false; } }
function earmBuild(lib, k, px, py) { const r = earmCall(px, py, (x2, y2) => epBuildAt(x2, y2)); return r === undefined ? null : r; }
function earmPipe(px, py) { return earmCall(px, py, (x2, y2) => { epiPlace(x2, y2); return true; }) === true; }
// точка куска руки → экран (для рамок, призрака, выбора); не руки — null
function earmScreen(x, y, z) { if (EARM.inPk || typeof armPk !== 'function' || !armPk(y)) return null; const w = armWAt(y); if (!w || !(view.k === 1 || view.k === 3)) return [-1e4, -1e4];
  const c = armWP2W(w, z, y); return [W / 2 + (c.z - cam.z) * view.r[1] * S, H / 2 - (c.y - cam.y) * S]; }
function earmMove() { return false; }
function earmAt() { return null; }
// ====================== РЕДАКТОР: ИНСТРУМЕНТ «КУБЫ» (v247) ======================
// Как в Townscaper: клик по стене или уступу — перед ним вырастает куб; «Убирать» — клик по кубу убирает его.
// Вести мышью с зажатой кнопкой — ставить/убирать полосой (применяется, когда отпустишь). Вид граней, края, мох, плитки
// подбирает ядро само (buildFaces), как в игре. Материал: «Уступ» (ledge — платформа мелкой плиткой) или «Стена» (core — тело).
// Правка — в файле карты (blocks.runs, теми же mapChain/mapUnchain, что и запись карты), дальше как у пропсов: mapLoad, отмена Ctrl+Z.
// В «Кубах» левая кнопка строит; камера — WASD/стрелки, правая кнопка; поворот — Q/E; колесо — зум (05_camera.js).
const EC = { brush: 'add', mat: 'ledge', hover: null, paint: null, off: 0, lastD: null, lastK: -1 };
// v248: куда ставить. Над титаном — перед стеной под курсором (+ отступ EC.off, кнопки «ближе/дальше», клавиши [ ]);
// в воздухе — на том же слое глубины, где ставили последний раз (EC.lastD), — так можно ставить и в воздух.
// Возвращает {x, y, z, add, air (ни к чему не прилегает), on (куб, к которому прилепится), d (слой)}.
const EC_N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function ecTarget(px, py) {
  if (S < epLod() || epTurning()) return null; if (EC.lastK !== view.k) { EC.lastK = view.k; EC.lastD = null; }
  const u = (px - W / 2) / S, yy = cam.y - (py - H / 2) / S, y = Math.floor(yy), d0 = epFrontD(u, y + 0.5);
  if (EC.brush === 'del') { if (d0 === null) return null; const c = epXZ(u, d0); return { x: Math.round(c.x), y, z: Math.round(c.z), add: false }; }
  let d, on = null;
  if (d0 !== null) { d = d0 + 1 + EC.off; const c = epXZ(u, d0); on = { x: Math.round(c.x), y, z: Math.round(c.z) }; }
  else { if (EC.lastD === null) { const f = epFrontD(0, Math.floor(cam.y) + 0.5); EC.lastD = f === null ? 8 : f + 1; } d = EC.lastD; }
  const p = epXZ(u, d), x = Math.round(p.x), z = Math.round(p.z);
  if (hasCube(x, y, z) || Math.abs(x) > 60 || Math.abs(z) > 60) return null;
  const air = !EC_N6.some(([a, b2, c2]) => hasCube(x + a, y + b2, z + c2));
  return { x, y, z, add: true, air, on: EC.off === 0 ? on : null, d };
}
const ecKey = t => t.x + ',' + t.y + ',' + t.z;
function ecCommit(list) {
  if (!list.length) return; const m = JSON.parse(ED.map), cells = [];
  mapUnchain(m.blocks.runs, (x, y, z, mm) => cells.push({ x, y, z, m: mm }), true);
  let n = 0;
  if (list[0].add) { const have = new Set(cells.map(ecKey)); for (const t of list) if (!have.has(ecKey(t))) { cells.push({ x: t.x, y: t.y, z: t.z, m: EC.mat }); have.add(ecKey(t)); n++; } }
  else { const del = new Set(list.map(ecKey)); const before = cells.length; for (let i = cells.length - 1; i >= 0; i--) if (del.has(ecKey(cells[i]))) cells.splice(i, 1); n = before - cells.length; }
  if (!n) return;
  m.blocks.runs = mapChain(cells, c => c.m);
  epCommit(m, (list[0].add ? 'Поставлено кубов: ' : 'Убрано кубов: ') + n);
}
function ecMouse() {
  const cv = canvas;
  cv.addEventListener('mousedown', e => {
    if (EP.mode !== 'cubes' || e.button !== 0 || e.shiftKey || e.altKey) return;   /* Alt + тянуть — поворот (05_camera.js) */ e.stopImmediatePropagation(); e.preventDefault();
    if (S < epLod()) { edMsg('Приблизь колесом мыши — кубы ставятся вблизи', true); return; } if (epTurning()) return;
    const [px, py] = epCanvasPos(e), t = ecTarget(px, py); if (t && t.add) EC.lastD = t.d; EC.paint = { list: t ? [t] : [], keys: new Set(t ? [ecKey(t)] : []), d: t && t.d };
  }, true);
  addEventListener('mousemove', e => {
    if (EP.mode !== 'cubes') return; const [px, py] = epCanvasPos(e); EP.mouse = [px, py];
    const t = e.target === canvas ? ecTarget(px, py) : null; EC.hover = t;
    if (EC.paint && t && !EC.paint.keys.has(ecKey(t)) && (!t.add || EC.paint.d === undefined || EC.paint.d === null || t.d === EC.paint.d)) { EC.paint.keys.add(ecKey(t)); EC.paint.list.push(t); }   /* полосой — в одном слое */
  });
  addEventListener('mouseup', () => { const P = EC.paint; if (!P) return; EC.paint = null; ecCommit(P.list); });
}
function ecDraw() {
  const o = EP.octx; if (!o || EP.mode !== 'cubes' || S < epLod() || epTurning()) return;
  const lw = Math.max(2, Math.round(S * 0.035)), Si = Math.round(S);
  const rectOf = t => { const [sx, sy] = epToScreen(t.x, t.y, t.z); return [Math.round(sx - S / 2), Math.round(sy - S)]; };
  const cell = (t, col, fill, w) => { const [x0, y0] = rectOf(t); o.save(); o.lineWidth = w || lw; o.strokeStyle = col; o.fillStyle = fill; o.fillRect(x0, y0, Si, Si); o.strokeRect(x0 + 0.5, y0 + 0.5, Si, Si); o.restore(); };
  const tag = (t, txt, col) => { const [x0, y0] = rectOf(t); o.save(); o.font = Math.max(12, Math.round(S * 0.15)) + 'px "PT Mono", monospace'; const w = o.measureText(txt).width + 10, h = Math.max(16, Math.round(S * 0.2)); o.fillStyle = 'rgba(6,18,26,0.88)'; o.fillRect(x0, y0 - h - 3, w, h); o.fillStyle = col; o.textBaseline = 'middle'; o.fillText(txt, x0 + 5, y0 - h / 2 - 3); o.restore(); };
  const add = EC.brush === 'add', H0 = EC.hover;
  if (add && H0) {   // сетка слоя вокруг курсора: туда встанет куб
    o.save(); o.strokeStyle = 'rgba(230,242,244,0.22)'; o.lineWidth = 1; const [cx, cy] = rectOf(H0);
    for (let i = -3; i <= 4; i++) { o.beginPath(); o.moveTo(cx + i * Si + 0.5, cy - 3 * Si); o.lineTo(cx + i * Si + 0.5, cy + 4 * Si); o.stroke(); o.beginPath(); o.moveTo(cx - 3 * Si, cy + i * Si + 0.5); o.lineTo(cx + 4 * Si, cy + i * Si + 0.5); o.stroke(); }
    o.restore();
  }
  const col = add ? '#e0702e' : '#ff4a3a', fill = add ? 'rgba(224,112,46,0.30)' : 'rgba(255,60,40,0.30)';
  if (EC.paint) for (const t of EC.paint.list) cell(t, col, fill);
  if (H0 && !(EC.paint && EC.paint.keys.has(ecKey(H0)))) {
    if (add) { cell(H0, '#ffffff', 'rgba(255,255,255,0.22)', lw + 1); tag(H0, (EC.mat === 'core' ? 'стена' : 'уступ') + (H0.air ? ' · в воздухе' : EC.off ? ' · +' + EC.off + ' от стены' : ' · вплотную'), H0.air ? '#ffce46' : '#e6f2f4'); }
    else { cell(H0, '#ff6a5a', 'rgba(255,60,40,0.25)', lw + 1); const [x0, y0] = rectOf(H0); o.save(); o.strokeStyle = '#ff6a5a'; o.lineWidth = lw + 1; o.beginPath(); o.moveTo(x0 + Si * 0.2, y0 + Si * 0.2); o.lineTo(x0 + Si * 0.8, y0 + Si * 0.8); o.moveTo(x0 + Si * 0.8, y0 + Si * 0.2); o.lineTo(x0 + Si * 0.2, y0 + Si * 0.8); o.stroke(); o.restore(); tag(H0, 'убрать', '#ff9a8a'); }
  }
}
function ecUI() {
  const set = () => { document.querySelectorAll('#edCubes [data-brush]').forEach(b => b.classList.toggle('act', b.dataset.brush === EC.brush)); document.querySelectorAll('#edCubes [data-mat]').forEach(b => { b.classList.toggle('act', b.dataset.mat === EC.mat); b.disabled = EC.brush !== 'add'; }); };
  document.querySelectorAll('#edCubes [data-brush]').forEach(b => b.addEventListener('click', () => { EC.brush = b.dataset.brush; set(); }));
  document.querySelectorAll('#edCubes [data-mat]').forEach(b => b.addEventListener('click', () => { EC.mat = b.dataset.mat; set(); }));
  const offShow = () => { edEl('edCubesOff').textContent = EC.off ? '+' + EC.off + ' от стены' : 'вплотную к стене'; };
  const offBy = d => { EC.off = Math.max(0, Math.min(12, EC.off + d)); offShow(); };
  edEl('edCubesNear').addEventListener('click', () => offBy(-1)); edEl('edCubesFar').addEventListener('click', () => offBy(1)); offShow();
  edEl('edCubesUndo').addEventListener('click', epUndo); edEl('edCubesRedo').addEventListener('click', epRedo);
  addEventListener('keydown', e => { const t = e.target; if (edModal() || EP.mode !== 'cubes' || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
    if (e.code === 'Digit1') { EC.brush = 'add'; set(); } else if (e.code === 'Digit2') { EC.brush = 'del'; set(); } else if (e.code === 'BracketLeft') offBy(-1); else if (e.code === 'BracketRight') offBy(1); });
  set(); ecMouse();
}
// ====================== РЕДАКТОР: МОЖНО ЛИ ДОЙТИ ДО ДВЕРИ (v285) ======================
// Алексей 20.10 (двери): «есть ли проход к двери». Проверка «на глаз», как ходит герой: от старта по всем четырём сторонам —
// по видимым верхам кубов (с каждой стороны своя картинка, как в игре), прыжок вверх до двух кубов и вбок до трёх, спрыгнуть — куда угодно ниже,
// лестницы, трубы, цепи люлек; поворот мира — стоя на кубе; вошёл в дверь — вышел из её пары. Не считает: роботов-такси, облака, колёса,
// крюк, ключи (считаем, что ключ найдётся), руки титана. Значит, «не дойти» — подсказка проверить место, а не приговор.
const ERCH = { src: null, res: null, i: -1 };
const erchKey = (U, y) => (U + 2048) * 8192 + (y + 64);
function erchCompute() {
  if (ERCH.src === ED.map && ERCH.res) return ERCH.res;
  const m = JSON.parse(ED.map), D = eddDoors(m), V = [], pk = y => y >= 900 && y < 2400;
  for (let k = 0; k < 4; k++) { const b = basis(k * 90), r = [Math.round(b.r[0]), Math.round(b.r[1])], n = [Math.round(b.n[0]), Math.round(b.n[1])], front = new Map();
    for (const c of cubes.values()) { if (pk(c.y)) continue; const U = c.x * r[0] + c.z * r[1], d = c.x * n[0] + c.z * n[1], key = erchKey(U, c.y), f = front.get(key); if (!f || d > f.d) front.set(key, { c, d }); }
    const stand = new Set(); for (const [key, f] of front) if (f.c.top && !f.c.rec && !f.c.cons) stand.add(key + 1);   // стоят на верхе: высота ног = y + 1
    const cl = []; for (const L of (LEVEL.climbs || []).concat(typeof dynClimbs !== 'undefined' ? dynClimbs : [])) { if (!L || pk(L.y0)) continue; const U = L.x * r[0] + L.z * r[1], dd = L.x * n[0] + L.z * n[1];
      if (L.y0 > 2500 || L.chain || L.lamp || dd >= (L.pin && L.d !== undefined ? L.d - 0.5 : 7) - 0.01) cl.push({ U, y0: L.y0, y1: L.y1 }); }
    V.push({ r, n, front, stand, cl }); }
  const dr = D.map((pi, j) => { const q = m.props[pi]; if (!q || q.gone) return null; const f = ((num(q.f) || 0) % 4 + 4) % 4, x = num(q.x), y = num(q.y), z = num(q.z); return { j, f, U: Math.round(x * V[f].r[0] + z * V[f].r[1]), y: Math.round(y), to: q.to !== undefined && !q.sealed ? num(q.to) : -1, arm: pk(y) }; });
  const seen = new Set(), Q = [], got = new Set();
  const push = (k, U, y) => { const kk = erchKey(U, y); if (!V[k].stand.has(kk)) return false; const s = k * 1e9 + kk; if (seen.has(s)) return true; seen.add(s); Q.push([k, U, y]); return true; };
  const reach = d => { got.add(d.j); const p = d.to >= 0 ? dr[d.to] : null; if (p && !got.has(p.j)) { got.add(p.j); near(p.f, p.U, p.y); } };
  const near = (k, U, y) => { for (const dy of [0, 1, -1, 2, -2]) for (const du of [0, -1, 1]) if (push(k, U + du, y + dy)) return; };
  const S0 = LEVEL.spawn || LEVEL.start; if (S0) near(0, Math.round(S0.x * V[0].r[0] + S0.z * V[0].r[1]), Math.round(S0.y));
  while (Q.length) { const [k, U, y] = Q.pop(), v = V[k];
    for (let du = -3; du <= 3; du++) for (let yy = y + 2; yy >= y - 40; yy--) if (v.stand.has(erchKey(U + du, yy))) { push(k, U + du, yy); if (yy <= y) break; }   // прыжок, шаг, спрыгнуть
    for (const L of v.cl) if (!L.used && Math.abs(L.U - U) <= 1.5 && y >= L.y0 - 1.6 && y <= L.y1 + 0.6) { L.used = true;
      for (let yy = Math.floor(L.y0) - 1; yy <= Math.ceil(L.y1) + 1; yy++) for (let du = -2; du <= 2; du++) push(k, Math.round(L.U) + du, yy);
      for (const d of dr) if (d && d.f === k && !got.has(d.j) && Math.abs(d.U - L.U) <= 1.5 && d.y <= L.y1 + 1 && d.y >= L.y0 - 1) reach(d); }   // люк над лестницей
    const f = v.front.get(erchKey(U, y - 1)); if (f && y < 2500) for (const k2 of [(k + 1) % 4, (k + 3) % 4]) { const v2 = V[k2]; push(k2, f.c.x * v2.r[0] + f.c.z * v2.r[1], y); }   // поворот мира
    for (const d of dr) { if (!d || d.f !== k || got.has(d.j) || Math.abs(d.U - U) > 1.5 || Math.abs(d.y - y) > 1) continue; reach(d); } }
  ERCH.src = ED.map; ERCH.res = { got, dr }; return ERCH.res;
}
function erchDoor(j) { const R = erchCompute(), d = R.dr[j]; if (!d) return null; return d.arm ? 'arm' : R.got.has(j); }
function erchInfo() {   // строчка в «Выбрано» у двери
  const it = eddSel(), el = edEl('eddReach'); if (!el) return; if (!it) { el.textContent = ''; return; }
  let r = null; try { const m = JSON.parse(ED.map); r = erchDoor(eddNum(m, it.i)); } catch (e) { r = null; }
  el.textContent = r === 'arm' ? 'дойти: на руке титана — не проверяю' : r ? 'дойти: ✓ от старта можно дойти' : r === false ? '⚠ похоже, от старта сюда не дойти — проверь (прыжок выше двух кубов не считается)' : '';
  el.classList.toggle('warn', r === false);
}
function erchAll() {   // кнопка «Проверить все двери»: сколько недостижимых, камера — к следующей
  const R = erchCompute(), bad = R.dr.filter(d => d && !d.arm && !R.got.has(d.j));
  if (!bad.length) { edMsg('Все двери: от старта можно дойти до каждой ✓'); return; }
  ERCH.i = (ERCH.i + 1) % bad.length; const d = bad[ERCH.i], m = JSON.parse(ED.map), pi = eddDoors(m)[d.j], p = m.props[pi];
  zcam.ang = Math.round(view.angle / 360) * 360 + d.f * 90; zcam.x = num(p.x); zcam.y = num(p.y) + 1; zcam.z = num(p.z);
  edMsg('Похоже, не дойти: ' + bad.length + ' ' + (bad.length === 1 ? 'дверь' : bad.length < 5 ? 'двери' : 'дверей') + ' · показана ' + (ERCH.i + 1) + '-я (ещё раз — следующая)', true);
  setTimeout(() => { epIndex(); const t = EP.items.find(x => x.i === pi); if (t) { EP.sel = t; epSelInfo(); } }, 500);
}
function erchInit() { const b = edEl('eddReachAll'); if (b) b.addEventListener('click', erchAll); }
// ====================== РЕДАКТОР: СТУПЕНИ (v287) ======================
// Алексей 24.10: «новый вид пропсов — ступенчатые лестницы, по диагонали от платформы до платформы». «Лазание» → «Ступени»:
// кликни по площадке (у края, откуда идти) — марш сам находит соседнюю площадку на этой стороне (выше или ниже на 1–4 куба, вбок на 2–6)
// и встаёт от края до края. Тянуть — двигать целиком. Видно с той стороны, на которой поставлен.
function estStand(U, Y) { const a = cellAt(U, Y - 1); if (!a || !a.length || !a[0].top) return null; const b = cellAt(U, Y), c = cellAt(U, Y + 1);
  if ((b && b.length && b[0].dep >= a[0].dep - 0.5) || (c && c.length && c[0].dep >= a[0].dep - 0.5)) return null; return a[0]; }   // верх виден и над ним место для героя
function estBuild(px, py) {
  const b = epBasis(), u = (px - W / 2) / S + cam.x * b.r[0] + cam.z * b.r[1], y = cam.y - (py - H / 2) / S, U0 = Math.round(u); let Y0 = null;
  for (let yy = Math.round(y) + 1; yy >= Math.round(y) - 4; yy--) if (estStand(U0, yy)) { Y0 = yy; break; }
  if (Y0 === null) return { msg: 'Ступени: кликни по площадке, от края которой идти' };
  const dirs = [1, -1].sort((p, q) => { const e = d => { let U = U0; while (estStand(U + d, Y0) && Math.abs(U - U0) < 30) U += d; return Math.abs(U - u); }; return e(p) - e(q); });
  for (const d of dirs) { let Ue = U0; while (estStand(Ue + d, Y0) && Math.abs(Ue - U0) < 30) Ue += d;
    for (let k = 2; k <= 7; k++) { const Ut = Ue + d * k; let best = null;
      for (let dy = 1; dy <= 4; dy++) for (const s of [1, -1]) { const Yt = Y0 + s * dy; if (best || !estStand(Ut, Yt) || estStand(Ut - d, Yt)) continue; if (k - 1 >= Math.max(1, dy)) best = { Ut, Yt }; }   // v290: только край площадки (не середина) и не круче 45°
      if (best) { const c = estStand(Ue, Y0), r = Math.max(1, Math.round(c.dep)), t0 = Ue + d * 0.5, t1 = best.Ut - d * 0.5;
        const q = { lib: 'climb/stairs', f: view.k, t0, y0: Y0, t1, y1: best.Yt, r }, ld = stairPickLand(q, estBlk(r)); if (!ld) continue; q.land = ld; return { q, k: PK['climb/stairs'] }; } } }
  { const d = dirs[0]; let Ue = U0; while (estStand(Ue + d, Y0) && Math.abs(Ue - U0) < 30) Ue += d; const c = estStand(Ue, Y0), r = Math.max(1, Math.round(c.dep));   // v289: второй площадки нет — марш вверх на 3 и вбок на 4 (дальше тянуть за квадратик на конце)
    return { q: { lib: 'climb/stairs', f: view.k, t0: Ue + d * 0.5, y0: Y0, t1: Ue + d * 3.5, y1: Y0 + 3, r }, k: PK['climb/stairs'] }; }
}
// v290: куб на пути марша (по картинке этой стороны: клетка U, высота y, на глубине марша или ближе)
const estCamU = () => { const b = epBasis(); return cam.x * b.r[0] + cam.z * b.r[1]; };
const estBlk = r => (t, y) => { const a = cellAt(Math.round(t), y); return !!(a && a.length && a[0].dep >= r - 0.5); };
function estAnchor(q) { const r = num(q.r) || 8, lo = num(q.y0) <= num(q.y1), t = lo ? num(q.t0) : num(q.t1), c = lanePosR(num(q.f) % 4, t, r); return { x: c[0], y: Math.min(num(q.y0), num(q.y1)), z: c[1] }; }
function estBox(it) { const q = it.q, r = num(q.r) || 8, a = lanePosR(num(q.f) % 4, num(q.t0), r), c = lanePosR(num(q.f) % 4, num(q.t1), r), A = epToScreen(a[0], num(q.y0), a[1]), B = epToScreen(c[0], num(q.y1), c[1]);
  return [Math.min(A[0], B[0]), Math.min(A[1], B[1]) - S * 0.3, Math.max(A[0], B[0]), Math.max(A[1], B[1]) + S * 0.4]; }
function estMove(it, x, y, z) {   // перетащили: марш целиком на столько же
  const m = JSON.parse(ED.map), q = m.props[it.i], b = epBasis(), du = Math.round((x - it.x) * b.r[0] + (z - it.z) * b.r[1]), dy = Math.round(y - it.y);
  if (!du && !dy) return; q.t0 = num(q.t0) + du; q.t1 = num(q.t1) + du; q.y0 = num(q.y0) + dy; q.y1 = num(q.y1) + dy; epMark(q); epCommit(m, 'Ступени — передвинуты');
}
// ---- v288: «Платформы» → «Переход»: клик по площадке у края — мостик до площадки на той же высоте (вбок 2–6); нет её — балкон в 3 клетки
function ewkBuild(px, py) {
  const b = epBasis(), u = (px - W / 2) / S + cam.x * b.r[0] + cam.z * b.r[1], y = cam.y - (py - H / 2) / S, U0 = Math.round(u); let Y0 = null;
  for (let yy = Math.round(y) + 1; yy >= Math.round(y) - 4; yy--) if (estStand(U0, yy)) { Y0 = yy; break; }
  if (Y0 === null) return { msg: 'Переход: кликни по площадке, от края которой идти' };
  const edge = d => { let U = U0; while (estStand(U + d, Y0) && Math.abs(U - U0) < 30) U += d; return U; }, dirs = [1, -1].sort((p, q) => Math.abs(edge(p) - u) - Math.abs(edge(q) - u));
  const D0 = estStand(U0, Y0).dep, air = (U, Y) => { for (let yy = Y - 1; yy <= Y + 1; yy++) { const a = cellAt(U, yy); if (a && a.length && a[0].dep >= D0 - 0.6) return false; } return true; };   // пусто на глубине площадки (стена за ней — не помеха)
  const mk = (Ue, d, U2) => { const c = estStand(Ue, Y0), r = Math.max(1, Math.round(c.dep)); return { q: { lib: 'plat/walkway', f: view.k, t0: Ue + d * 0.5, t1: U2 + d * 0.5, y: Y0, r }, k: PK['plat/walkway'] }; };
  for (const d of dirs) { const Ue = edge(d); for (let k = 3; k <= 7; k++) { if (!air(Ue + d * (k - 1), Y0)) break; if (estStand(Ue + d * k, Y0)) return mk(Ue, d, Ue + d * (k - 1)); } }
  for (const d of dirs) { const Ue = edge(d); if ([1, 2, 3].every(k => air(Ue + d * k, Y0))) return mk(Ue, d, Ue + d * 3); }   // балкон
  return { msg: 'Переход: у края площадки нет места — впереди стена' };
}
function ewkAnchor(q) { const r = num(q.r) || 8, c = lanePosR(num(q.f) % 4, Math.min(num(q.t0), num(q.t1)), r); return { x: c[0], y: num(q.y), z: c[1] }; }
function ewkBox(it) { const q = it.q, r = num(q.r) || 8, a = lanePosR(num(q.f) % 4, num(q.t0), r), c = lanePosR(num(q.f) % 4, num(q.t1), r), A = epToScreen(a[0], num(q.y), a[1]), B = epToScreen(c[0], num(q.y), c[1]);
  return [Math.min(A[0], B[0]), A[1] - S * 0.7, Math.max(A[0], B[0]), A[1] + S * 0.9]; }
function ewkMove(it, x, y, z) { const m = JSON.parse(ED.map), q = m.props[it.i], b = epBasis(), du = Math.round((x - it.x) * b.r[0] + (z - it.z) * b.r[1]), dy = Math.round(y - it.y);
  if (!du && !dy) return; q.t0 = num(q.t0) + du; q.t1 = num(q.t1) + du; q.y = num(q.y) + dy; epMark(q); epCommit(m, 'Переход — передвинут'); }
// ====================== РЕДАКТОР: ЗАЛИВ КАРТИНКИ В БИБЛИОТЕКУ (v249) ======================
// Залил картинку → редактор чистит её так же, как скрипты tools/*_build.py чистили листы Алексея (вариант «B»: чисто, цвета листа):
//  1) фон: прозрачность картинки, иначе — цвет рамки картинки, заливкой от краёв (ползунок «фон»);
//  2) родной пиксель: по краям цветов ищется шаг сетки (картинка «пиксель-арт», увеличенная в k раз) — или ползунок;
//  3) уменьшение до родного пикселя: цвет точки — среднее только закрытых точек (фон не подмешивается), без полупрозрачности;
//  4) силуэт без зазубрин, без белой каймы у края, без одиночных крошек; до N цветов без дизеринга (median cut);
//  5) «на стену» — по умолчанию в палитру стен игры (legwall3: серо-лиловые тона ранг к рангу + мох, ржавчина, бирюза), иначе ложные ниши.
// Готовый предмет: общая библиотека (db 'lib/<id>' + вложение PNG) или, без общего хранилища, — картинкой прямо в файле карты.
const EI = { src: null, out: null, lib: [], wallPal: null, opts: { tol: 40, k: 0, cw: 1, colors: 24, pal: true, sec: 'wall', name: '' } };
const EI_SECS = { wall: 'На стену', hang: 'Висячее', stand: 'На пол' };
// ---------- обработка ----------
function eiProcess(src, o) {
  const W0 = src.width, H0 = src.height, d = src.data, N0 = W0 * H0, mask = new Uint8Array(N0);
  const at = i => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]], dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const border = []; for (let x = 0; x < W0; x++) border.push(x, (H0 - 1) * W0 + x); for (let y = 0; y < H0; y++) border.push(y * W0, y * W0 + W0 - 1);
  const alphaBg = border.filter(i => d[i * 4 + 3] < 200).length > border.length * 0.3;
  if (alphaBg) for (let i = 0; i < N0; i++) mask[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  else {   // фон — самый частый цвет рамки, заливкой от краёв
    const cnt = new Map(); for (const i of border) { const c = at(i), k = (c[0] >> 4) + ',' + (c[1] >> 4) + ',' + (c[2] >> 4); cnt.set(k, (cnt.get(k) || 0) + 1); }
    let bk = null, bn = -1; for (const [k, n] of cnt) if (n > bn) { bn = n; bk = k; } const bg = [0, 0, 0]; let bc = 0;
    for (const i of border) { const c = at(i); if ((c[0] >> 4) + ',' + (c[1] >> 4) + ',' + (c[2] >> 4) === bk) { bg[0] += c[0]; bg[1] += c[1]; bg[2] += c[2]; bc++; } } bg[0] /= bc; bg[1] /= bc; bg[2] /= bc;
    mask.fill(1); const st = []; for (const i of border) if (dist(at(i), bg) <= o.tol * 3) { mask[i] = 0; st.push(i); }
    while (st.length) { const i = st.pop(), x = i % W0, y = (i / W0) | 0; for (const j of [x > 0 ? i - 1 : -1, x < W0 - 1 ? i + 1 : -1, y > 0 ? i - W0 : -1, y < H0 - 1 ? i + W0 : -1]) if (j >= 0 && mask[j] && dist(at(j), bg) <= o.tol * 3) { mask[j] = 0; st.push(j); } }
    for (let i = 0; i < N0; i++) if (d[i * 4 + 3] < 128) mask[i] = 0;
  }
  // родной пиксель: края цветов вдоль строк и столбцов → шаг сетки и сдвиг
  let k = o.k, ox = 0, oy = 0;
  { const bx = [], by = [], step = Math.max(1, Math.floor(Math.min(W0, H0) / 300));
    for (let y = 0; y < H0; y += step) for (let x = 1; x < W0; x++) { const i = y * W0 + x; if (mask[i] !== mask[i - 1] || (mask[i] && dist(at(i), at(i - 1)) > 40)) bx.push(x); }
    for (let x = 0; x < W0; x += step) for (let y = 1; y < H0; y++) { const i = y * W0 + x; if (mask[i] !== mask[i - W0] || (mask[i] && dist(at(i), at(i - W0)) > 40)) by.push(y); }
    const phase = (arr, kk) => { const h = new Array(kk).fill(0); for (const v of arr) h[v % kk]++; let m = 0; for (let q = 1; q < kk; q++) if (h[q] > h[m]) m = q; return { m, p: arr.length ? h[m] / arr.length : 0 }; };
    if (!k) { k = 1; for (let kk = 32; kk >= 2; kk--) { const a = phase(bx, kk), b2 = phase(by, kk); if (a.p >= 0.55 && b2.p >= 0.55) { k = kk; break; } } }
    if (k > 1) { ox = phase(bx, k).m; oy = phase(by, k).m; } }
  // уменьшение: клетка k×k — цвет только из закрытых точек, закрыта, если закрыто больше половины
  const x0 = ox ? ox - k : 0, y0 = oy ? oy - k : 0; let w = Math.ceil((W0 - x0) / k), h = Math.ceil((H0 - y0) / k);
  let al = new Uint8Array(w * h); const col = new Float32Array(w * h * 3);
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) { let n = 0, tot = 0, r = 0, g = 0, b = 0;
    for (let yy = y0 + cy * k; yy < y0 + cy * k + k; yy++) for (let xx = x0 + cx * k; xx < x0 + cx * k + k; xx++) { if (xx < 0 || yy < 0 || xx >= W0 || yy >= H0) continue; tot++; const i = yy * W0 + xx; if (!mask[i]) continue; n++; r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; }
    const j = cy * w + cx; if (n && n * 2 > tot) { al[j] = 1; col[j * 3] = r / n; col[j * 3 + 1] = g / n; col[j * 3 + 2] = b / n; } }
  const nb = (a, x, y) => (x > 0 && a[y * w + x - 1]) + (x < w - 1 && a[y * w + x + 1]) + (y > 0 && a[(y - 1) * w + x]) + (y < h - 1 && a[(y + 1) * w + x]);
  for (let pass = 0; pass < 2; pass++) { const a2 = al.slice(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = nb(al, x, y), j = y * w + x; a2[j] = al[j] ? (n >= 2 ? 1 : 0) : (n >= 3 && col[j * 3] + col[j * 3 + 1] + col[j * 3 + 2] > 0 ? 1 : 0); } al = a2; }   // силуэт без зазубрин
  for (let pass = 0; pass < 2; pass++) { const a2 = al.slice(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = y * w + x; if (!al[j] || nb(al, x, y) === 4) continue;
    const r = col[j * 3], g = col[j * 3 + 1], b = col[j * 3 + 2]; if (Math.min(r, g, b) > 205 && Math.max(r, g, b) - Math.min(r, g, b) < 26) a2[j] = 0; } al = a2; }   // белая кайма у края
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (al[y * w + x] && !nb(al, x, y)) al[y * w + x] = 0;   // одиночные крошки
  { // обрезать по нарисованному (поле вокруг предмета не нужно)
    let mnx = w, mny = h, mxx = -1, mxy = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (al[y * w + x]) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
    if (mxx >= 0 && (mnx > 0 || mny > 0 || mxx < w - 1 || mxy < h - 1)) { const nw = mxx - mnx + 1, nh = mxy - mny + 1, a2 = new Uint8Array(nw * nh), c2 = new Float32Array(nw * nh * 3);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const j = (y + mny) * w + x + mnx, t = y * nw + x; a2[t] = al[j]; c2[t * 3] = col[j * 3]; c2[t * 3 + 1] = col[j * 3 + 1]; c2[t * 3 + 2] = col[j * 3 + 2]; }
      al = a2; col.set(c2.subarray(0, 0)); w = nw; h = nh; EI._col = c2; } else EI._col = null; }
  const colv = EI._col || col;
  // до N цветов: median cut по закрытым точкам
  const px = []; for (let j = 0; j < w * h; j++) if (al[j]) px.push(j);
  let boxes = [px]; while (boxes.length < o.colors) { let bi = -1, br = -1, bc = 0;
    boxes.forEach((bx2, i) => { if (bx2.length < 2) return; for (let c = 0; c < 3; c++) { let mn = 1e9, mx = -1e9; for (const j of bx2) { const v = colv[j * 3 + c]; if (v < mn) mn = v; if (v > mx) mx = v; } if (mx - mn > br) { br = mx - mn; bi = i; bc = c; } } });
    if (bi < 0 || br < 6) break; const bx2 = boxes[bi].slice().sort((a, b) => colv[a * 3 + bc] - colv[b * 3 + bc]), mid = bx2.length >> 1; boxes.splice(bi, 1, bx2.slice(0, mid), bx2.slice(mid)); }
  const out = new Uint8ClampedArray(w * h * 4);
  for (const bx2 of boxes) { if (!bx2.length) continue; let r = 0, g = 0, b = 0; for (const j of bx2) { r += colv[j * 3]; g += colv[j * 3 + 1]; b += colv[j * 3 + 2]; } r /= bx2.length; g /= bx2.length; b /= bx2.length;
    for (const j of bx2) { out[j * 4] = r; out[j * 4 + 1] = g; out[j * 4 + 2] = b; out[j * 4 + 3] = 255; } }
  if (o.pal && o.sec === 'wall') eiWallPal(out, w, h);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
  let semi = 0, white = 0, cols = new Set(); for (let j = 0; j < w * h; j++) { const a = out[j * 4 + 3]; if (a > 0 && a < 255) semi++; if (a && Math.min(out[j * 4], out[j * 4 + 1], out[j * 4 + 2]) > 225) white++; if (a) cols.add(out[j * 4] + ',' + out[j * 4 + 1] + ',' + out[j * 4 + 2]); }
  return { cv, w, h, k, ox, oy, semi, white, colors: cols.size, opaque: px.length };
}
function eiWallPal(out, w, h) {   // как в tools/kit2_build.py: тона стены по яркости ранг к рангу; мох, ржавчина, бирюза — в свои тона стены
  if (!EI.wallPal) { const im = img.legwall3; if (!im || !im.width) return; const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const dd = x.getImageData(0, 0, im.width, im.height).data, cnt = new Map();
    for (let i = 0; i < dd.length; i += 4) if (dd[i + 3]) { const k = dd[i] + ',' + dd[i + 1] + ',' + dd[i + 2]; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const all = [...cnt].map(([k, n]) => ({ c: k.split(',').map(Number), n })), L = c => (c[0] + c[1] + c[2]) / 3, ch = c => Math.max(...c) - Math.min(...c);
    const grey = all.filter(e => ch(e.c) < 20).sort((a, b) => L(a.c) - L(b.c)), tot = grey.reduce((s, e) => s + e.n, 0); let acc = 0; const cum = grey.map(e => (acc += e.n) / tot);
    const fam = f => all.filter(e => f(e.c)).map(e => e.c).sort((a, b) => L(a) - L(b));
    EI.wallPal = { grey: grey.map(e => e.c), cum, moss: fam(u => u[1] > u[0] + 5 && u[1] > u[2] + 20), rust: fam(u => u[0] > u[2] + 40), teal: fam(u => u[2] > u[0] + 20) }; }
  const P = EI.wallPal, Ls = []; for (let j = 0; j < w * h; j++) if (out[j * 4 + 3]) Ls.push((out[j * 4] + out[j * 4 + 1] + out[j * 4 + 2]) / 3); Ls.sort((a, b) => a - b);
  const rank = v => { let lo = 0, hi = Ls.length; while (lo < hi) { const m = (lo + hi) >> 1; if (Ls[m] < v) lo = m + 1; else hi = m; } return lo / Math.max(1, Ls.length); };
  for (let j = 0; j < w * h; j++) { if (!out[j * 4 + 3]) continue; const r = out[j * 4], g = out[j * 4 + 1], b = out[j * 4 + 2], L = (r + g + b) / 3, c = Math.max(r, g, b) - Math.min(r, g, b), q = rank(L);
    let gi = P.cum.findIndex(v => v >= q); if (gi < 0) gi = P.grey.length - 1; let t = P.grey[gi];
    const pick = f => f.length ? f[Math.min(f.length - 1, Math.floor(q * f.length))] : null;
    if (g > r + 6 && g > b + 14 && c > 18) t = pick(P.moss) || t; else if (r > g + 34 && r > b + 34) t = pick(P.rust) || t; else if (b > r + 14 && c > 24 && L > 62) t = pick(P.teal) || t;   /* только явно зелёное / рыжее / бирюзовое — серо-розовое идёт в серые тона стены */
    out[j * 4] = t[0]; out[j * 4 + 1] = t[1]; out[j * 4 + 2] = t[2]; }
}
// ---------- окно залива ----------
function eiOpen(file) {
  const dlg = edEl('edImport'); dlg.hidden = false; EI.opts.name = ''; edEl('eiName').value = '';
  if (file) eiLoad(file); else { EI.src = null; eiShow(); }
}
function eiLoad(file) {
  if (!file || !/^image\//.test(file.type)) { edMsg('Нужна картинка (PNG, JPG, WEBP)', true); return; }
  const im = new Image(); im.onload = () => { let w = im.naturalWidth, h = im.naturalHeight; const sc = Math.min(1, 1600 / Math.max(w, h)); w = Math.round(w * sc); h = Math.round(h * sc);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(im, 0, 0, w, h);
    EI.src = x.getImageData(0, 0, w, h); EI.srcCv = c; EI.opts.k = 0; edEl('eiName').value = file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40); eiRun(true); URL.revokeObjectURL(im.src); };
  im.onerror = () => edMsg('Картинка не открылась', true); im.src = URL.createObjectURL(file);
}
function eiRun(auto, sure) {
  if (!EI.src) { eiShow(); return; } const o = EI.opts;
  if (EI.painted && !auto && !sure) { edSure('Ползунки пересчитают картинку заново — дорисованное пропадёт. Продолжить?', 'Пересчитать').then(ok => { if (ok) eiRun(false, true); }); return; } EI.painted = false;
  EI.out = eiProcess(EI.src, o);
  if (auto) { o.k = EI.out.k; o.cw = Math.max(0.5, Math.min(6, Math.round(EI.out.w / 16 * 10) / 10)); edEl('eiK').value = o.k; edEl('eiCw').value = o.cw; }
  eiShow();
}
function eiShow() {
  const o = EI.opts; edEl('eiKv').textContent = o.k ? o.k + ' точек' : 'авто'; edEl('eiTolv').textContent = o.tol; edEl('eiCwv').textContent = o.cw + ' куба'; edEl('eiColv').textContent = o.colors;
  edEl('eiPaint').disabled = !EI.out; edEl('eiPal').checked = o.pal; edEl('eiPalRow').hidden = o.sec !== 'wall'; document.querySelectorAll('#edImport [data-sec]').forEach(b => b.classList.toggle('act', b.dataset.sec === o.sec));
  const a = edEl('eiSrc'), b = edEl('eiOut'), ax = a.getContext('2d'), bx = b.getContext('2d'); ax.clearRect(0, 0, a.width, a.height); bx.clearRect(0, 0, b.width, b.height);
  const chk = (x, c) => { for (let y = 0; y < c.height; y += 12) for (let xx = 0; xx < c.width; xx += 12) { x.fillStyle = (xx / 12 + y / 12) % 2 ? '#1a2a33' : '#13212a'; x.fillRect(xx, y, 12, 12); } };   /* клетка — видно прозрачность */
  chk(ax, a); chk(bx, b); edEl('eiSave').disabled = !EI.out;
  if (!EI.src) { edEl('eiInfo').textContent = 'Перетащите картинку сюда или нажмите «Выбрать картинку».'; return; }
  const sc = Math.min(a.width / EI.srcCv.width, a.height / EI.srcCv.height); ax.imageSmoothingEnabled = false; ax.drawImage(EI.srcCv, (a.width - EI.srcCv.width * sc) / 2, (a.height - EI.srcCv.height * sc) / 2, EI.srcCv.width * sc, EI.srcCv.height * sc);
  const R = EI.out, s2 = Math.max(1, Math.floor(Math.min(b.width / R.w, b.height / R.h))); bx.imageSmoothingEnabled = false; bx.drawImage(R.cv, Math.round((b.width - R.w * s2) / 2), Math.round((b.height - R.h * s2) / 2), R.w * s2, R.h * s2);
  edEl('eiInfo').textContent = 'стало ' + R.w + '×' + R.h + ' точек, родной пиксель ' + R.k + ', цветов ' + R.colors + ', полупрозрачных ' + R.semi + ', белых ' + R.white + (R.opaque < 4 ? ' — почти ничего не осталось: уменьшите «фон»' : '');
}
async function eiSave() {
  const R = EI.out; if (!R) return; const o = EI.opts, name = (edEl('eiName').value || '').trim().slice(0, 40) || 'Предмет';
  const blob = await new Promise(r => R.cv.toBlob(r, 'image/png')); const item = { name, sec: o.sec, cw: o.cw, ratio: Math.round(R.h / R.w * 1000) / 1000, w: R.w, h: R.h, by: GRK_VER, at: new Date().toISOString() };
  edEl('eiSave').disabled = true;
  try {
    if (ED.db && ED.assets) { const up = await ED.assets.upload(blob, { type: 'image/png' }); item.asset = up.id; const ref = ED.db.collection('lib').doc(); await ref.set(item); item.id = ref.id; if (!EI.lib.some(i => i.id === item.id)) EI.lib.push(item); eiLibApply(); edMsg('В библиотеке: «' + name + '» (общая — видна во всех картах). Кликните по стене — поставить.', true); }
    else { item.asset = R.cv.toDataURL('image/png'); item.id = 'loc' + Date.now().toString(36); EI.lib.push(item); eiLibApply(); edMsg('«' + name + '» — в библиотеке этой страницы (общего хранилища здесь нет: картинка сохранится внутри файла карты)', true); }
    edEl('edImport').hidden = true; epPlaceStart('user/' + item.id);
  } catch (e) { edMsg('Не сохранилось: ' + (e && (e.code || e.message) || e), true); }
  edEl('eiSave').disabled = false;
}
// ---------- библиотека: свои предметы рядом с готовыми ----------
function eiLibApply() {   // свои предметы → PK (как ставить и рамка) и в список библиотеки
  for (const l of Object.keys(PK)) if (l.startsWith('user/')) delete PK[l];
  for (const k of Object.keys(USERLIB)) delete USERLIB[k]; for (const it of EI.lib) USERLIB[it.id] = it; USERLOOK.clear();   /* карточки — ядру: копии рисуются по свежей карточке */
  for (const it of EI.lib) { const sec = it.sec in EI_SECS ? it.sec : 'wall';
    PK['user/' + it.id] = { sec: 'Мои: ' + EI_SECS[sec].toLowerCase(), name: it.name, w: q => q.cw || it.cw, h: q => (q.cw || it.cw) * (q.ratio || it.ratio), top: sec === 'hang', mid: sec === 'wall', floor: sec === 'stand', del: true, user: it, wallOff: sec === 'wall' }; EP_KEY['user/' + it.id] = 'userProps'; }
  for (const s of Object.values(EI_SECS)) { const n = 'Мои: ' + s.toLowerCase(); if (!PK_SECS.includes(n)) PK_SECS.unshift(n); }
  epLib(); if (ED.map) epIndex();
}
function eiLibInit() {
  if (ED.db) ED.db.collection('lib').orderBy('at', 'desc').limit(300).onSnapshot(s => { frameFromDocs(s.docs.map(d => d.data())); EI.lib = EI.lib.filter(i => String(i.id).startsWith('loc')).concat(s.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(d => d.kind !== 'part' && d.kind !== 'frame' && d.kind !== 'sprite' && d.kind !== 'clip'));   /* v256: детали титана — в «Титане» (52_titanlib.js) */ eiLibApply(); }, () => {});
  eiLibApply();
}
function eiInit() {
  const dlg = edEl('edImport');
  edEl('edImportBtn').addEventListener('click', () => eiOpen()); edEl('eiCancel').addEventListener('click', () => { dlg.hidden = true; });
  edEl('eiPick').addEventListener('click', () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => eiLoad(i.files[0]); i.click(); });
  edEl('eiSave').addEventListener('click', eiSave);
  edEl('eiPaint').addEventListener('click', () => { if (!EI.out) return; epaintOpen(EI.out.cv, 'Дорисовать: ' + (edEl('eiName').value || 'предмет'), c => { EI.out = Object.assign({}, EI.out, { cv: c, w: c.width, h: c.height }); EI.painted = true; eiShow(); edEl('eiInfo').textContent = 'дорисовано · ' + c.width + '×' + c.height + ' точек'; }); });
  const num = (id, key, f) => edEl(id).addEventListener('input', e => { EI.opts[key] = f(e.target.value); eiRun(false); });
  num('eiTol', 'tol', Number); num('eiK', 'k', v => Math.max(1, Number(v))); num('eiCol', 'colors', Number);
  edEl('eiCw').addEventListener('input', e => { EI.opts.cw = Number(e.target.value); eiShow(); });
  edEl('eiPal').addEventListener('change', e => { EI.opts.pal = e.target.checked; eiRun(false); });
  document.querySelectorAll('#edImport [data-sec]').forEach(b => b.addEventListener('click', () => { EI.opts.sec = b.dataset.sec; EI.opts.pal = b.dataset.sec === 'wall'; eiRun(false); }));
  dlg.addEventListener('dragover', e => e.preventDefault()); dlg.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files[0]) eiLoad(e.dataTransfer.files[0]); });
}
// ====================== РЕДАКТОР: КАРТОЧКА ПРЕДМЕТА И НАСТРОЙКИ КОПИИ (v250, «как в World Editor») ======================
// Карточка (✎ у своего предмета в библиотеке) — для ВСЕХ копий на всех картах: название, куда (на стену / висячее / на пол),
// оттенок, яркость, контраст, насыщенность, размер, свечение (+ цвет), качание; «Дорисовать»; «Сохранить» — обновить везде
// (общая библиотека + все копии в открытой карте; другие карты подхватят карточку из библиотеки при открытии).
// Копия (панель «Выбрано» у своего предмета) — только эта штука на карте: отразить, размер ×, свой оттенок, «разброс».
const ECD = { it: null, img: null, cv: null, newImg: false, look: null };
function ecdOpen(id) {
  const it = EI.lib.find(i => i.id === id); if (!it) { edMsg('Предмета нет в библиотеке', true); return; }
  ECD.it = it; ECD.newImg = false; ECD.cv = null; ECD.look = Object.assign({ hue: 0, bri: 0, con: 0, sat: 0 }, it.look || {});
  ECD.vals = { name: it.name, sec: it.sec || 'wall', cw: it.cw || 1, glow: it.glow || 0, sway: it.sway || 0, glowCol: it.glowCol || '', solid: it.solid || 0, hp: it.hp || 0, grab: it.grab || 0, loot: Object.assign({}, it.loot || {}) };
  const im = new Image(); im.onload = () => { ECD.img = im; ecdShow(); }; im.onerror = () => edMsg('Картинка предмета не загрузилась', true); im.src = String(it.asset).startsWith('data:') ? it.asset : '/_blob/' + it.asset;
  edEl('edCard').hidden = false; ecdShow();
}
function ecdSrc() { return ECD.cv || ECD.img; }
function ecdShow() {
  const v = ECD.vals, L = ECD.look; edEl('ecName').value = v.name; document.querySelectorAll('#edCard [data-sec]').forEach(b => b.classList.toggle('act', b.dataset.sec === v.sec));
  for (const [id, val, txt] of [['ecHue', L.hue, L.hue + '°'], ['ecBri', L.bri, L.bri], ['ecCon', L.con, L.con], ['ecSat', L.sat, L.sat], ['ecCw', v.cw, v.cw + ' куба'], ['ecGlow', v.glow, v.glow ? Math.round(v.glow * 100) + '%' : 'нет'], ['ecSway', v.sway, v.sway ? Math.round(v.sway * 100) + '%' : 'нет']]) { edEl(id).value = val; edEl(id + 'v').textContent = txt; }
  edEl('ecSwayRow').hidden = v.sec !== 'hang';
  edEl('ecLoot').hidden = !v.hp; elootShow('ecL', v.loot);
  edEl('ecSolid').classList.toggle('act', !!v.solid); edEl('ecGrab').classList.toggle('act', !!v.grab); document.querySelectorAll('#edCard [data-hp]').forEach(b => b.classList.toggle('act', Number(b.dataset.hp) === (v.hp || 0)));
  edEl('ecBehav').textContent = [v.solid ? 'на верх можно встать' : '', v.hp ? 'разбивается ' + (v.hp === 1 ? 'с одного удара' : 'с ' + v.hp + ' ударов') : '', v.grab ? 'крюк цепляется за середину' : ''].filter(Boolean).join(' · ') || 'просто украшение — герой проходит сквозь';
  const pv = edEl('ecPrev'), x = pv.getContext('2d'); x.clearRect(0, 0, pv.width, pv.height); for (let y = 0; y < pv.height; y += 12) for (let xx = 0; xx < pv.width; xx += 12) { x.fillStyle = (xx / 12 + y / 12) % 2 ? '#1a2a33' : '#13212a'; x.fillRect(xx, y, 12, 12); }
  const src = ecdSrc(); if (!src) return; const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  const draw = L.hue || L.bri || L.con || L.sat ? ecdRecolor(src, L) : src;
  const s2 = Math.max(1, Math.floor(Math.min((pv.width - 20) / w, (pv.height - 20) / h))); x.imageSmoothingEnabled = false;
  if (v.glow > 0) { const g = x.createRadialGradient(pv.width / 2, pv.height / 2, 4, pv.width / 2, pv.height / 2, Math.max(w, h) * s2 * 0.9); g.addColorStop(0, 'rgba(' + (v.glowCol || '255,190,110') + ',' + (0.35 * v.glow) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, pv.width, pv.height); }
  x.drawImage(draw, Math.round((pv.width - w * s2) / 2), Math.round((pv.height - h * s2) / 2), w * s2, h * s2);
  edEl('ecInfo').textContent = w + '×' + h + ' точек' + (ECD.newImg ? ' · дорисовано, сохраните' : '');
}
function ecdRecolor(src, L) {   // та же перекраска, что в ядре (userRecolor): холст с «src»-ключом, который меняется только после «Дорисовать»
  const c = document.createElement('canvas'); c.width = src.naturalWidth || src.width; c.height = src.naturalHeight || src.height; c.getContext('2d').drawImage(src, 0, 0);
  c.naturalWidth = c.width; c.naturalHeight = c.height; c.src = 'card:' + ECD.it.id + ':' + (ECD.ver || 0); return userRecolor(c, L);
}
async function ecdSave() {
  const it = ECD.it, v = ECD.vals; if (!it) return; const btn = edEl('ecSave'); btn.disabled = true;
  try {
    const card = Object.assign({}, it, { name: (edEl('ecName').value || '').trim().slice(0, 40) || it.name, sec: v.sec, cw: v.cw, look: Object.assign({}, ECD.look), glow: v.glow, sway: v.sec === 'hang' ? v.sway : 0, glowCol: v.glowCol || ecdGlowCol(), solid: v.solid ? 1 : 0, hp: v.hp || 0, grab: v.grab ? 1 : 0, loot: v.hp && elootAny(v.loot) ? Object.assign({}, v.loot) : undefined, at: new Date().toISOString() });
    if (ECD.newImg && ECD.cv) { card.w = ECD.cv.width; card.h = ECD.cv.height; card.ratio = Math.round(card.h / card.w * 1000) / 1000;
      if (ED.db && ED.assets && !String(it.id).startsWith('loc')) { const blob = await new Promise(r => ECD.cv.toBlob(r, 'image/png')); const up = await ED.assets.upload(blob, { type: 'image/png' }); card.asset = up.id; }
      else card.asset = ECD.cv.toDataURL('image/png'); }
    const doc = Object.assign({}, card); delete doc.id; for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
    if (ED.db && !String(it.id).startsWith('loc')) await ED.db.collection('lib').doc(it.id).set(doc);
    Object.assign(it, card); eiLibApply();
    // копии в открытой карте — тоже по новой карточке (файл карты остаётся самодостаточным)
    const m = JSON.parse(ED.map); let n = 0; for (const q of m.props) if (q.lib === 'user/' + it.id) { for (const kk of USER_CARD_KEYS) { if (card[kk] === undefined) delete q[kk]; else q[kk] = card[kk]; } n++; }
    if (n) epCommit(m, 'Карточка «' + card.name + '» сохранена — обновлено копий на карте: ' + n); else edMsg('Карточка «' + card.name + '» сохранена');
    edEl('edCard').hidden = true;
  } catch (e) { edMsg('Не сохранилось: ' + (e && (e.code || e.message) || e), true); }
  btn.disabled = false;
}
function ecdGlowCol() {   // цвет свечения — самый яркий насыщенный цвет картинки
  const src = ecdSrc(); if (!src) return '255,190,110'; const c = document.createElement('canvas'); c.width = src.naturalWidth || src.width; c.height = src.naturalHeight || src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data; let best = null, bs = -1; for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), sc = mx + (mx - mn) * 0.8; if (sc > bs) { bs = sc; best = [d[i], d[i + 1], d[i + 2]]; } }
  return best ? best.join(',') : '255,190,110';
}
async function ecdRemove() {
  const it = ECD.it; if (!it || !await edSure('Убрать «' + it.name + '» из библиотеки? Уже поставленные копии на картах останутся.', 'Убрать')) return;
  try { if (ED.db && !String(it.id).startsWith('loc')) await ED.db.collection('lib').doc(it.id).delete(); EI.lib = EI.lib.filter(i => i !== it); eiLibApply(); edEl('edCard').hidden = true; edMsg('Убрано из библиотеки: «' + it.name + '»'); }
  catch (e) { edMsg('Не убралось: ' + (e && (e.code || e.message) || e), true); }
}
// ---------- копия на карте ----------
function ecpEdit(fn, msg) { const it = EP.sel; if (!it || !String(it.q.lib).startsWith('user/')) return; const m = JSON.parse(ED.map), q = m.props[it.i]; fn(q); epMark(q); epCommit(m, msg); }
function ecpInfo() {
  const it = EP.sel, row = edEl('edSelUser'); if (!row) return; const u = it && it.q && String(it.q.lib).startsWith('user/'); row.hidden = !u; if (!u) return;
  const q = it.q; edEl('ecpScale').textContent = '×' + (q.scale || 1); edEl('ecpTint').textContent = (q.tint || 0) + '°'; edEl('ecpVary').classList.toggle('act', !!q.vary); edEl('ecpFlip').classList.toggle('act', !!q.flip);
}
function ecdInit() {
  edEl('ecSave').addEventListener('click', ecdSave); edEl('ecCancel').addEventListener('click', () => { edEl('edCard').hidden = true; }); edEl('ecRemove').addEventListener('click', ecdRemove);
  edEl('ecPaint').addEventListener('click', () => { const src = ecdSrc(); if (!src) return; const c = document.createElement('canvas'); c.width = src.naturalWidth || src.width; c.height = src.naturalHeight || src.height; c.getContext('2d').drawImage(src, 0, 0);
    epaintOpen(c, 'Дорисовать: ' + ECD.vals.name, nc => { ECD.cv = nc; ECD.newImg = true; ECD.ver = (ECD.ver || 0) + 1; ecdShow(); }); });
  edEl('ecName').addEventListener('input', e => { ECD.vals.name = e.target.value; });
  document.querySelectorAll('#edCard [data-sec]').forEach(b => b.addEventListener('click', () => { ECD.vals.sec = b.dataset.sec; ecdShow(); }));
  for (const [id, key, isLook] of [['ecHue', 'hue', 1], ['ecBri', 'bri', 1], ['ecCon', 'con', 1], ['ecSat', 'sat', 1], ['ecCw', 'cw', 0], ['ecGlow', 'glow', 0], ['ecSway', 'sway', 0]])
    edEl(id).addEventListener('input', e => { const v = Number(e.target.value); if (isLook) ECD.look[key] = v; else ECD.vals[key] = v; ecdShow(); });
  elootBind('ecL', () => ECD.vals.loot, () => ecdShow());
  edEl('ecSolid').addEventListener('click', () => { ECD.vals.solid = ECD.vals.solid ? 0 : 1; ecdShow(); });
  edEl('ecGrab').addEventListener('click', () => { ECD.vals.grab = ECD.vals.grab ? 0 : 1; ecdShow(); });
  document.querySelectorAll('#edCard [data-hp]').forEach(b => b.addEventListener('click', () => { ECD.vals.hp = Number(b.dataset.hp); ecdShow(); }));
  edEl('ecReset').addEventListener('click', () => { ECD.look = { hue: 0, bri: 0, con: 0, sat: 0 }; ecdShow(); });
  edEl('ecpFlip').addEventListener('click', () => ecpEdit(q => { q.flip = !q.flip; }, 'Отражено'));
  edEl('ecpBig').addEventListener('click', () => ecpEdit(q => { q.scale = Math.min(3, Math.round(((q.scale || 1) + 0.1) * 10) / 10); }, 'Крупнее'));
  edEl('ecpSmall').addEventListener('click', () => ecpEdit(q => { q.scale = Math.max(0.3, Math.round(((q.scale || 1) - 0.1) * 10) / 10); }, 'Мельче'));
  edEl('ecpWarm').addEventListener('click', () => ecpEdit(q => { q.tint = ((q.tint || 0) + 15 + 540) % 360 - 180; }, 'Оттенок'));
  edEl('ecpCool').addEventListener('click', () => ecpEdit(q => { q.tint = ((q.tint || 0) - 15 + 540) % 360 - 180; }, 'Оттенок'));
  edEl('ecpVary').addEventListener('click', () => ecpEdit(q => { q.vary = !q.vary; }, 'Разброс'));
  edEl('ecpCard').addEventListener('click', () => { const it = EP.sel; if (it && String(it.q.lib).startsWith('user/')) ecdOpen(it.q.lib.slice(5)); });
}
// ====================== РЕДАКТОР: «ЧТО ВЫПАДАЕТ» (v253) ======================
// У всего, что разбивается: ящик (в «Выбрано», для этой копии) и свой предмет (в карточке, для всех копий).
// Четыре ползунка — шанс в процентах, каждый сам по себе: осколок, сердечко, взрыв, вода. Игра: dropLoot (ядро, 11_propsa).
// Ящик без настройки — как раньше (осколок всегда, иногда сердечко, взрыв или вода); «Как обычно» — убрать настройку.
const ELOOT = [['shard', 'Осколок'], ['heart', 'Сердечко'], ['boom', 'Взрыв'], ['water', 'Вода']];
const elootAny = L => !!L && ELOOT.some(([k]) => (L[k] || 0) > 0);
function elootHTML(pre) { return ELOOT.map(([k, n]) => '<label>' + n + '<input id="' + pre + k + '" type="range" min="0" max="100" step="5" value="0"><b id="' + pre + k + 'v"></b></label>').join(''); }
function elootShow(pre, L) { L = L || {}; for (const [k] of ELOOT) { const v = L[k] || 0; edEl(pre + k).value = v; edEl(pre + k + 'v').textContent = v ? v + '%' : 'нет'; } }
function elootBind(pre, get, after, ev) { for (const [k] of ELOOT) edEl(pre + k).addEventListener(ev || 'input', e => { const L = get(); if (!L) return; L[k] = Number(e.target.value); after(); }); }
// ящик: своя настройка у копии
function elootCrateInfo() {
  const it = EP.sel, row = edEl('edSelLoot'); if (!row) return; const c = !!(it && it.k && it.q.lib === 'plat/crate' && !it.q.key); row.hidden = !c; if (!c) return;
  const L = it.q.loot; edEl('elootNote').textContent = L ? 'своё для этого ящика' : 'как обычно: осколок всегда, иногда сердечко, взрыв или вода';
  elootShow('elC', L || { shard: 100, heart: 7, boom: 9, water: 65 }); edEl('elootReset').disabled = !L;
  eciInfo();   /* v286: предмет в ящике (37_crateitem.js) */
}
function elootInit() {
  edEl('ecLootRows').innerHTML = elootHTML('ecL'); edEl('elootRows').innerHTML = elootHTML('elC');
  for (const [k] of ELOOT) { edEl('elC' + k).addEventListener('input', e => { edEl('elC' + k + 'v').textContent = +e.target.value ? e.target.value + '%' : 'нет'; });
    edEl('elC' + k).addEventListener('change', () => { const it = EP.sel; if (!it || it.q.lib !== 'plat/crate') return; const m = JSON.parse(ED.map), q = m.props[it.i], L = {}; for (const [kk] of ELOOT) L[kk] = Number(edEl('elC' + kk).value); q.loot = L; epMark(q); epCommit(m, 'Ящик: что выпадает — своё'); }); }
  edEl('elootReset').addEventListener('click', () => { const it = EP.sel; if (!it || !it.q.loot) return; const m = JSON.parse(ED.map), q = m.props[it.i]; delete q.loot; epMark(q); epCommit(m, 'Ящик: что выпадает — как обычно'); });
}
// ====================== РЕДАКТОР: ПРЕДМЕТ В ЯЩИКЕ (v286) ======================
// Алексей 24.10: «раскидай все предметы по ящикам, во внутренних комнатах, со случайностью» — генератор кладёт их сам (lootItems, ядро).
// Здесь видно, где что лежит: над ящиком с предметом — его значок; у выбранного ящика — «внутри предмет»: нет / нож / … — переложить.
// Каждый предмет на карте один: положил в этот ящик — из прежнего он пропал.
const ECI = [['', 'нет'], ['knife', 'нож'], ['prom', 'руки Прометея'], ['fork', 'вилка'], ['spider', 'сапоги паука'], ['hermes', 'сапоги Гермеса']];
function eciInfo() {
  const it = EP.sel, row = edEl('eciRow'); if (!row) return; const c = !!(it && it.q && it.q.lib === 'plat/crate' && !it.q.key); if (!c) return;
  const cur = it.q.item || ''; for (const [k] of ECI) { const b = edEl('eci_' + (k || 'none')); if (b) b.classList.toggle('act', cur === k); }
}
function eciSet(kind) {
  const it = EP.sel; if (!it || !it.q || it.q.lib !== 'plat/crate') return; const m = JSON.parse(ED.map), q = m.props[it.i];
  if (kind) for (const p of m.props) if (p.lib === 'plat/crate' && p.item === kind && p !== q) delete p.item;
  if (kind) q.item = kind; else delete q.item; epMark(q);
  epCommit(m, kind ? 'В ящике: ' + ECI.find(e => e[0] === kind)[1] + ' (из прежнего ящика убран)' : 'Ящик: без предмета');
}
function eciDraw() {   // значки предметов над ящиками
  if (typeof itemArt !== 'function' || S < epLod() || !LEVEL.crates) return; ctx.imageSmoothingEnabled = false;
  for (const c of LEVEL.crates) { if (!c.item || !ITEM_DEFS[c.item]) continue; if (c.y > 2500 !== cam.y > 2500) continue; const pt = epToScreen(+c.x, +c.y + 1.25, +c.z);
    if (pt[0] < -40 || pt[0] > W + 40 || pt[1] < -40 || pt[1] > H + 40) continue; itemArt(c.item); const A = itemImg[c.item]; if (!A || !A.im.complete) continue;
    const k = Math.max(2, Math.round(S / 28)), w = A.w * k, h = A.h * k, t = Math.sin(performance.now() / 300) * 2;
    ctx.fillStyle = 'rgba(20,14,24,0.7)'; ctx.fillRect(Math.round(pt[0] - w / 2 - 3), Math.round(pt[1] - h - 3 + t), w + 6, h + 6); ctx.drawImage(A.im, Math.round(pt[0] - w / 2), Math.round(pt[1] - h + t), w, h); }
}
function eciInit() {
  const row = edEl('eciRow'); if (!row) return; row.innerHTML = ECI.map(([k, n]) => '<button id="eci_' + (k || 'none') + '" type="button">' + n + '</button>').join('');
  for (const [k] of ECI) edEl('eci_' + (k || 'none')).addEventListener('click', () => eciSet(k));
}
// ====================== РЕДАКТОР: «ДОРИСОВАТЬ» ПИКСЕЛЯМИ (v250) ======================
// Окно поверх всего: картинка в родных пикселях, крупно, с сеткой. Карандаш (B), ластик (E), пипетка (I), заливка (G);
// отразить ↔, сдвиг стрелками, «Поле +2» (место дорисовать по краям), «Обрезать» (по нарисованному); Ctrl+Z / Ctrl+Y.
// Палитра: цвета самой картинки + тона стены игры + свой цвет. Только целые пиксели, без полупрозрачности.
// epaintOpen(canvas, title, onDone(новый canvas)) — из окна залива и из карточки предмета.
const EPT = { w: 0, h: 0, px: null, undo: [], redo: [], tool: 'pen', col: [128, 112, 120], sc: 8, done: null, drawing: false, last: null };
const edModal = () => !!document.querySelector('#edImport:not([hidden]), #edPaint:not([hidden]), #edCard:not([hidden]), #edUnits:not([hidden]), #eunFrom:not([hidden]), #edAsk:not([hidden])');   /* v259: «Юниты» — свои клавиши */
function epaintOpen(cv, title, done) {
  EPT.w = cv.width; EPT.h = cv.height; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; EPT.px = new Uint8ClampedArray(d);
  for (let i = 3; i < EPT.px.length; i += 4) EPT.px[i] = EPT.px[i] >= 128 ? 255 : 0;
  EPT.undo = []; EPT.redo = []; EPT.done = done; edEl('epTitle').textContent = title || 'Дорисовать'; edEl('edPaint').hidden = false; epaintPal(); epaintSet('pen'); epaintDraw();
}
function epaintSnap() { EPT.undo.push({ w: EPT.w, h: EPT.h, px: EPT.px.slice() }); if (EPT.undo.length > 60) EPT.undo.shift(); EPT.redo = []; }
function epaintUndo() { const u = EPT.undo.pop(); if (!u) return; EPT.redo.push({ w: EPT.w, h: EPT.h, px: EPT.px.slice() }); Object.assign(EPT, u); epaintDraw(); }
function epaintRedo() { const u = EPT.redo.pop(); if (!u) return; EPT.undo.push({ w: EPT.w, h: EPT.h, px: EPT.px.slice() }); Object.assign(EPT, u); epaintDraw(); }
function epaintDraw() {
  const cv = edEl('epCv'), box = edEl('epWrap'), maxW = Math.max(160, box.clientWidth - 8), maxH = Math.max(160, Math.min(460, innerHeight - 260));
  const sc = Math.max(2, Math.floor(Math.min(maxW / EPT.w, maxH / EPT.h, 32))); EPT.sc = sc; cv.width = EPT.w * sc; cv.height = EPT.h * sc; const x = cv.getContext('2d');
  for (let y = 0; y < EPT.h; y++) for (let xx = 0; xx < EPT.w; xx++) { const i = (y * EPT.w + xx) * 4; x.fillStyle = EPT.px[i + 3] ? 'rgb(' + EPT.px[i] + ',' + EPT.px[i + 1] + ',' + EPT.px[i + 2] + ')' : ((xx + y) % 2 ? '#1a2a33' : '#13212a'); x.fillRect(xx * sc, y * sc, sc, sc); }
  if (sc >= 6) { x.strokeStyle = 'rgba(230,242,244,0.10)'; x.lineWidth = 1; x.beginPath(); for (let xx = 0; xx <= EPT.w; xx++) { x.moveTo(xx * sc + 0.5, 0); x.lineTo(xx * sc + 0.5, cv.height); } for (let y = 0; y <= EPT.h; y++) { x.moveTo(0, y * sc + 0.5); x.lineTo(cv.width, y * sc + 0.5); } x.stroke(); }
  edEl('epInfo').textContent = EPT.w + '×' + EPT.h + ' точек'; edEl('epCur').style.background = 'rgb(' + EPT.col.join(',') + ')';
}
function epaintPal() {
  const box = edEl('epPal'); box.textContent = ''; const seen = new Set(), add = (c, t) => { const k = c.join(','); if (seen.has(k)) return; seen.add(k); const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.title = t; b.style.background = 'rgb(' + k + ')'; b.addEventListener('click', () => { EPT.col = c.slice(0, 3); if (EPT.tool === 'erase' || EPT.tool === 'pick') epaintSet('pen'); epaintDraw(); }); box.appendChild(b); };
  const cnt = new Map(); for (let i = 0; i < EPT.px.length; i += 4) if (EPT.px[i + 3]) { const k = EPT.px[i] + ',' + EPT.px[i + 1] + ',' + EPT.px[i + 2]; cnt.set(k, (cnt.get(k) || 0) + 1); }
  [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 40).map(e => e[0].split(',').map(Number)).sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])).forEach(c => add(c, 'цвет картинки'));
  const sep = document.createElement('span'); sep.className = 'sep'; box.appendChild(sep);
  const T = eiWallTones(); for (const c of T) add(c, 'тон стены игры');
}
function eiWallTones() {   // тона стены (как в eiWallPal): серые + мох + ржавчина + бирюза
  if (!EI.wallPal) { const t = new Uint8ClampedArray(4); t[3] = 255; eiWallPal(t, 1, 1); } const P = EI.wallPal; if (!P) return [];
  const pickN = (a, n) => a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.round(i * (a.length - 1) / (n - 1))]);
  return [...pickN(P.grey, 9), ...pickN(P.moss, 2), ...pickN(P.rust, 2), ...pickN(P.teal, 1)];
}
function epaintSet(t) { EPT.tool = t; document.querySelectorAll('#edPaint [data-tool]').forEach(b => b.classList.toggle('act', b.dataset.tool === t)); edEl('epCv').style.cursor = t === 'pick' ? 'copy' : t === 'fill' ? 'cell' : 'crosshair'; }
function epaintAt(e) { const cv = edEl('epCv'), r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) * cv.width / r.width / EPT.sc), y = Math.floor((e.clientY - r.top) * cv.height / r.height / EPT.sc); return x >= 0 && y >= 0 && x < EPT.w && y < EPT.h ? [x, y] : null; }
function epaintPut(x, y) { const i = (y * EPT.w + x) * 4; if (EPT.tool === 'erase') EPT.px[i + 3] = 0; else { EPT.px[i] = EPT.col[0]; EPT.px[i + 1] = EPT.col[1]; EPT.px[i + 2] = EPT.col[2]; EPT.px[i + 3] = 255; } }
function epaintLine(a, b) { let [x0, y0] = a; const [x1, y1] = b, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let er = dx + dy; for (;;) { epaintPut(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * er; if (e2 >= dy) { er += dy; x0 += sx; } if (e2 <= dx) { er += dx; y0 += sy; } } }
function epaintFill(x, y) {
  const W2 = EPT.w, H2 = EPT.h, p = EPT.px, i0 = (y * W2 + x) * 4, a0 = p[i0 + 3], c0 = [p[i0], p[i0 + 1], p[i0 + 2]], same = i => a0 ? (p[i + 3] && p[i] === c0[0] && p[i + 1] === c0[1] && p[i + 2] === c0[2]) : !p[i + 3];
  if (a0 && c0[0] === EPT.col[0] && c0[1] === EPT.col[1] && c0[2] === EPT.col[2]) return; const st = [[x, y]], seen = new Uint8Array(W2 * H2);
  while (st.length) { const [cx, cy] = st.pop(), j = cy * W2 + cx; if (seen[j]) continue; seen[j] = 1; if (!same(j * 4)) continue; epaintPut(cx, cy); if (cx > 0) st.push([cx - 1, cy]); if (cx < W2 - 1) st.push([cx + 1, cy]); if (cy > 0) st.push([cx, cy - 1]); if (cy < H2 - 1) st.push([cx, cy + 1]); }
}
function epaintFlip() { epaintSnap(); const W2 = EPT.w, n = new Uint8ClampedArray(EPT.px.length); for (let y = 0; y < EPT.h; y++) for (let x = 0; x < W2; x++) { const s = (y * W2 + x) * 4, d = (y * W2 + (W2 - 1 - x)) * 4; for (let k = 0; k < 4; k++) n[d + k] = EPT.px[s + k]; } EPT.px = n; epaintDraw(); }
function epaintShift(dx, dy) { epaintSnap(); const W2 = EPT.w, H2 = EPT.h, n = new Uint8ClampedArray(EPT.px.length); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const tx = x + dx, ty = y + dy; if (tx < 0 || ty < 0 || tx >= W2 || ty >= H2) continue; const s = (y * W2 + x) * 4, d = (ty * W2 + tx) * 4; for (let k = 0; k < 4; k++) n[d + k] = EPT.px[s + k]; } EPT.px = n; epaintDraw(); }
function epaintResize(x0, y0, w, h) { const n = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = x + x0, sy = y + y0; if (sx < 0 || sy < 0 || sx >= EPT.w || sy >= EPT.h) continue; const s = (sy * EPT.w + sx) * 4, d = (y * w + x) * 4; for (let k = 0; k < 4; k++) n[d + k] = EPT.px[s + k]; } EPT.px = n; EPT.w = w; EPT.h = h; }
function epaintPad() { if (EPT.w > 120 || EPT.h > 120) { edMsg('Больше нельзя — картинка и так крупная'); return; } epaintSnap(); epaintResize(-2, -2, EPT.w + 4, EPT.h + 4); epaintDraw(); }
function epaintCrop() { let mnx = EPT.w, mny = EPT.h, mxx = -1, mxy = -1; for (let y = 0; y < EPT.h; y++) for (let x = 0; x < EPT.w; x++) if (EPT.px[(y * EPT.w + x) * 4 + 3]) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }
  if (mxx < 0) { edMsg('Картинка пустая'); return; } epaintSnap(); epaintResize(mnx, mny, mxx - mnx + 1, mxy - mny + 1); epaintDraw(); }
function epaintFinish(ok) {
  edEl('edPaint').hidden = true; if (!ok || !EPT.done) return; let any = false; for (let i = 3; i < EPT.px.length; i += 4) if (EPT.px[i]) { any = true; break; }
  if (!any) { edMsg('Картинка пустая — ничего не изменено', true); return; }
  const c = document.createElement('canvas'); c.width = EPT.w; c.height = EPT.h; c.getContext('2d').putImageData(new ImageData(EPT.px.slice(), EPT.w, EPT.h), 0, 0); EPT.done(c);
}
function epaintInit() {
  const cv = edEl('epCv');
  cv.addEventListener('mousedown', e => { const p = epaintAt(e); if (!p) return; e.preventDefault();
    if (EPT.tool === 'pick') { const i = (p[1] * EPT.w + p[0]) * 4; if (EPT.px[i + 3]) { EPT.col = [EPT.px[i], EPT.px[i + 1], EPT.px[i + 2]]; epaintSet('pen'); epaintDraw(); } return; }
    epaintSnap(); if (EPT.tool === 'fill') { epaintFill(p[0], p[1]); epaintDraw(); return; } EPT.drawing = true; EPT.last = p; epaintPut(p[0], p[1]); epaintDraw(); });
  addEventListener('mousemove', e => { if (!EPT.drawing) return; const p = epaintAt(e); if (!p) return; epaintLine(EPT.last, p); EPT.last = p; epaintDraw(); });
  addEventListener('mouseup', () => { EPT.drawing = false; });
  document.querySelectorAll('#edPaint [data-tool]').forEach(b => b.addEventListener('click', () => epaintSet(b.dataset.tool)));
  edEl('epFlip').addEventListener('click', epaintFlip); edEl('epPad').addEventListener('click', epaintPad); edEl('epCrop').addEventListener('click', epaintCrop);
  edEl('epUndo').addEventListener('click', epaintUndo); edEl('epRedo').addEventListener('click', epaintRedo);
  edEl('epOwn').addEventListener('input', e => { const v = e.target.value; EPT.col = [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]; if (EPT.tool !== 'fill') epaintSet('pen'); epaintDraw(); });
  edEl('epOk').addEventListener('click', () => epaintFinish(true)); edEl('epCancel').addEventListener('click', () => epaintFinish(false));
  document.querySelectorAll('#edPaint [data-shift]').forEach(b => b.addEventListener('click', () => { const [dx, dy] = b.dataset.shift.split(',').map(Number); epaintShift(dx, dy); }));
  addEventListener('keydown', e => { if (edEl('edPaint').hidden) return; const t = e.target; if (t && t.tagName === 'INPUT' && t.type !== 'color') return;
    const k = e.code; if ((e.ctrlKey || e.metaKey) && k === 'KeyZ') { e.preventDefault(); e.shiftKey ? epaintRedo() : epaintUndo(); } else if ((e.ctrlKey || e.metaKey) && k === 'KeyY') { e.preventDefault(); epaintRedo(); }
    else if (k === 'KeyB') epaintSet('pen'); else if (k === 'KeyE') epaintSet('erase'); else if (k === 'KeyI') epaintSet('pick'); else if (k === 'KeyG') epaintSet('fill');
    else if (k === 'ArrowLeft') { e.preventDefault(); epaintShift(-1, 0); } else if (k === 'ArrowRight') { e.preventDefault(); epaintShift(1, 0); } else if (k === 'ArrowUp') { e.preventDefault(); epaintShift(0, -1); } else if (k === 'ArrowDown') { e.preventDefault(); epaintShift(0, 1); }
    else if (k === 'Escape') epaintFinish(false); else if (k === 'Enter') epaintFinish(true); }, true);
  addEventListener('resize', () => { if (!edEl('edPaint').hidden) epaintDraw(); });
}
// ====================== РЕДАКТОР: «ТИТАН» — КОНСТРУКТОР ИЗ ДЕТАЛЕЙ (v255) ======================
// Алексей 18.10: «я не знаю какие и сколько — должна быть возможность творчества, как в играх по постройке замков, домов и городов».
// Деталь — крупный кусок титана из кубов, живёт как одно целое: столб, блок, корпус (полый), балка, кабина (полая), плита.
// Поставить: выбрать деталь и размер → клик по стене (встаёт перед ней, низом на клик) или в воздух (на слой глубины, как кубы).
// Выбрать: клик по кубу детали. Тянуть — двигать (по кубу, в плоскости экрана; «к нам/от нас» — вглубь), «Копия», «Удалить», Delete.
// Нынешний титан тоже разобран на детали (ступня, голень, бедро, таз, корпус, плечи, кабина) — их можно двигать и удалять.
// Чья деталь куб: первая по списку, в чьей коробке он лежит (кабина и плечи раньше корпуса и т. д.). Двигаются и пропсы внутри коробки.
// Файл карты: раздел "parts" [{id, kind, name, box: [x0, y0, z0, x1, y1, z1], mat, shell, gen}] — появляется при первой правке «Титана»;
// пока его нет, детали нынешнего титана считаются по уровню (etGen). Игре раздел не нужен: кубы — это кубы.
const ET_KINDS = {
  pillar: { name: 'Столб', w: 5, h: 10, d: 5, mat: 'core', tip: 'нога, колонна' },
  block:  { name: 'Блок', w: 9, h: 6, d: 9, mat: 'core', tip: 'бедро, таз, плечо' },
  hull:   { name: 'Корпус', w: 13, h: 10, d: 13, mat: 'core', shell: true, tip: 'полый — внутри можно комнаты' },
  beam:   { name: 'Балка', w: 12, h: 2, d: 2, mat: 'core', tip: 'рука, перемычка' },
  cabin:  { name: 'Кабина', w: 9, h: 5, d: 9, mat: 'core', shell: true, tip: 'голова, полая' },
  slab:   { name: 'Плита', w: 6, h: 1, d: 4, mat: 'ledge', tip: 'площадка, по ней ходят' },
};
const ET = { place: null, size: { w: 5, h: 10, d: 5 }, mat: 'core', sel: null, hover: null, drag: null, ghost: null, lastD: null, lastK: -1 };
function etGen() {   // нынешний титан — деталями (по уровню; порядок = кто главнее)
  const H = (LEVEL.pelY || 32) + 1, SH = LEVEL.shinTop || 10, T = LEVEL.torsoY || [H + 15, H + 37], B0 = T[0], B1 = T[1], P = [];
  const add = (id, name, box) => P.push({ id, kind: 'gen', name, box, gen: true });
  if (LEVEL.newBody) { add('g-cabin', 'Кабина', [-6, B1 + 3, -19, 6, B1 + 8, -5]); add('g-sh1', 'Плечо', [-8, B0 + 6, 13, 8, B1 - 1, 20]); add('g-sh2', 'Плечо', [-8, B0 + 6, -44, 8, B1 - 1, -37]); add('g-torso', 'Корпус', [-13, B0, -38, 13, B1 + 2, 14]); }
  add('g-pelvis', 'Таз', [-8, H - 1, -32, 8, H + 14, -9]); add('g-thigh', 'Бедро', [-8, SH + 1, -8, 8, H + 14, 8]); add('g-shin', 'Голень', [-8, 2, -8, 8, SH, 8]); add('g-foot', 'Ступня', [-8, -4, -8, 8, 1, 8]);
  return P;
}
function etParts(m) { return m && Array.isArray(m.parts) ? m.parts : etGen(); }
const etIn = (b, x, y, z) => x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5];
function etOwner(parts, x, y, z) { for (const p of parts) if (etIn(p.box, x, y, z)) return p; return null; }
function etCells(m) { const cells = []; mapUnchain(m.blocks.runs, (x, y, z, mm) => cells.push({ x, y, z, m: mm }), true); return cells; }
function etShape(box, shell) {   // клетки детали: целиком или стенками в 2 куба (низ и верх — тоже)
  const [x0, y0, z0, x1, y1, z1] = box, out = [];
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (shell && x - x0 >= 2 && x1 - x >= 2 && z - z0 >= 2 && z1 - z >= 2 && y - y0 >= 1 && y1 - y >= 1) continue; out.push([x, y, z]); }
  return out;
}
function etBoxFor(u, y, d, s) {   // коробка детали размера s: по экрану — от клика вправо-влево поровну, низом на y, вглубь от d к нам… от стены
  const b = epBasis(), u0 = Math.round(u) - Math.floor((s.w - 1) / 2), pts = [];
  for (const uu of [u0, u0 + s.w - 1]) for (const dd of [d, d - s.d + 1]) { const p = epXZ(uu, dd); pts.push([Math.round(p.x), Math.round(p.z)]); }
  return [Math.min(...pts.map(p => p[0])), y, Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), y + s.h - 1, Math.max(...pts.map(p => p[1]))];
}
function etTarget(px, py) {   // куда встанет деталь: перед стеной под курсором (дальняя сторона детали — к стене) или в воздухе на слое
  if (S < S0 * 0.08 || epTurning()) return null; if (ET.lastK !== view.k) { ET.lastK = view.k; ET.lastD = null; }
  const u = (px - W / 2) / S, y = Math.floor(cam.y - (py - H / 2) / S), d0 = epFrontD(u, y + 0.5), s = ET.size;
  let dNear; if (d0 !== null) dNear = d0 + s.d; else { if (ET.lastD === null) { const f = epFrontD(0, Math.floor(cam.y) + 0.5); ET.lastD = f === null ? 8 : f + s.d; } dNear = ET.lastD; }
  return { box: etBoxFor(u, y, dNear, s), air: d0 === null, d: dNear };
}
function etPick(px, py) {   // деталь, чей куб под курсором
  if (S < S0 * 0.08 || epTurning()) return null; const u = (px - W / 2) / S, y = Math.floor(cam.y - (py - H / 2) / S), d0 = epFrontD(u, y + 0.5); if (d0 === null) return null;
  const c = epXZ(u, d0); return etOwner(etParts(JSON.parse(ED.map)), Math.round(c.x), y, Math.round(c.z));
}
function etRect(box) {   // коробка на экране: [x0, y0, x1, y1]
  const us = []; for (const x of [box[0], box[3]]) for (const z of [box[2], box[5]]) us.push(epUD(x, z).u);
  return [W / 2 + (Math.min(...us) - 0.5) * S, H / 2 - (box[4] + 1 - cam.y) * S, W / 2 + (Math.max(...us) + 0.5) * S, H / 2 - (box[1] - cam.y) * S];
}
// ---------- правки ----------
function etBegin() { const m = JSON.parse(ED.map); if (!Array.isArray(m.parts)) m.parts = etGen(); return m; }
function etPlace(t) {
  if (String(ET.place).startsWith('lib:')) { etlPlace(t); return; }   /* v256: своя деталь из библиотеки */
  const m = etBegin(), K = ET_KINDS[ET.place], cells = etCells(m), have = new Set(cells.map(c => c.x + ',' + c.y + ',' + c.z)); let n = 0;
  for (const [x, y, z] of etShape(t.box, K.shell)) { const k = x + ',' + y + ',' + z; if (have.has(k) || Math.abs(x) > 80 || Math.abs(z) > 80) continue; cells.push({ x, y, z, m: ET.mat }); have.add(k); n++; }
  if (!n) { edMsg('Здесь уже всё занято кубами'); return; }
  const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e3); m.parts.unshift({ id, kind: ET.place, name: K.name, box: t.box, mat: ET.mat, shell: !!K.shell });   /* новая — главнее старых */
  m.blocks.runs = mapChain(cells, c => c.m); if (t.air) ET.lastD = t.d; ET.sel = id; epCommit(m, 'Поставлено: ' + K.name.toLowerCase() + ' ' + ET.size.w + '×' + ET.size.h + '×' + ET.size.d);
}
function etMoveProps(m, box, dx, dy, dz) {   // пропсы внутри коробки — вместе с деталью
  const B = [box[0] - 1.5, box[1] - 0.5, box[2] - 1.5, box[3] + 1.5, box[4] + 1.5, box[5] + 1.5], inB = (x, y, z) => x >= B[0] && x <= B[3] && y >= B[1] && y <= B[4] && z >= B[2] && z <= B[5];
  epDeref(m, 'pipes.'); let n = 0;
  for (const q of m.props.slice()) {
    if (q.lib === 'climb/ladder' && q.t !== undefined) { const c = eldXZ(q); if (!inB(c.x, num(q.y0), c.z)) continue; const old = JSON.parse(JSON.stringify(q)); eldSet(q, c.x + dx, c.z + dz, num(q.f)); q.y0 = r2(num(q.y0) + dy); q.y1 = r2(num(q.y1) + dy); epMark(q); eldSync(m, q, old); n++; continue; }
    if (q.lib === 'climb/climb') continue;   /* лазы — вслед за лестницами (выше) и трубами (игра сама) */
    if (q.lib === 'climb/pipe' && Array.isArray(q.pts) && q.pts.every(p => Array.isArray(p))) { const P = q.pts.map(P3n); if (!P.every(p => inB(p[0], p[1], p[2]))) continue; q.pts = P.map(p => [r2(p[0] + dx), r2(p[1] + dy), r2(p[2] + dz)]); delete q.vpts; q.pin = true; q.by = 'hand'; if (!q.n) { const b = epBasis(); q.n = [b.n[0], b.n[1]]; } n++; continue; }
    if (q.x === undefined || q.y === undefined || q.z === undefined || q.one || typeof q.x === 'object') continue; const x = num(q.x), y = num(q.y), z = num(q.z); if (!inB(x, y, z)) continue;
    q.x = r2(x + dx); q.y = r2(y + dy); q.z = r2(z + dz); epMark(q); n++; }
  if (m.titan && m.titan.pipesFixed) m.titan.pipesFixed = null; return n;
}
function etMove(id, dx, dy, dz, msg) {
  if (!dx && !dy && !dz) return; const m = etBegin(), p = m.parts.find(q => q.id === id); if (!p) return; const cells = etCells(m), mine = [], rest = [];
  for (const c of cells) (etOwner(m.parts, c.x, c.y, c.z) === p ? mine : rest).push(c);
  const key = c => c.x + ',' + c.y + ',' + c.z, moved = new Set(mine.map(c => (c.x + dx) + ',' + (c.y + dy) + ',' + (c.z + dz)));
  const out = rest.filter(c => !moved.has(key(c))).concat(mine.map(c => ({ x: c.x + dx, y: c.y + dy, z: c.z + dz, m: c.m })));
  const np = etMoveProps(m, p.box, dx, dy, dz); p.box = [p.box[0] + dx, p.box[1] + dy, p.box[2] + dz, p.box[3] + dx, p.box[4] + dy, p.box[5] + dz];
  m.parts.splice(m.parts.indexOf(p), 1); m.parts.unshift(p);   /* передвинутая — главнее: её кубы там, куда встала */
  m.blocks.runs = mapChain(out, c => c.m); ET.sel = id; epCommit(m, (msg || p.name + ' — передвинут' + (p.name.endsWith('а') ? 'а' : '')) + (np ? ' (и пропсов внутри: ' + np + ')' : ''));
}
function etDelete(id) {
  const m = etBegin(), p = m.parts.find(q => q.id === id); if (!p) return; const cells = etCells(m), out = cells.filter(c => etOwner(m.parts, c.x, c.y, c.z) !== p);
  if (p.kind === 'path') { const B = p.box; for (const q of m.props.slice()) if (q.lib === 'climb/ladder' && q.pin && q.t !== undefined) { const c = eldXZ(q); if (c.x >= B[0] - 0.5 && c.x <= B[3] + 0.5 && c.z >= B[2] - 0.5 && c.z <= B[5] + 0.5 && num(q.y0) >= B[1] - 0.5 && num(q.y0) <= B[4] + 1) { eldRemove(m, q); m.props.splice(m.props.indexOf(q), 1); } } }   /* путь — вместе со своими лестницами */
  m.parts.splice(m.parts.indexOf(p), 1); m.blocks.runs = mapChain(out, c => c.m); ET.sel = null; epCommit(m, p.name + ' — удалено (кубов: ' + (cells.length - out.length) + ')');
}
function etCopy(id) {
  const m = etBegin(), p = m.parts.find(q => q.id === id); if (!p) return; const b = epBasis(), us = []; for (const x of [p.box[0], p.box[3]]) for (const z of [p.box[2], p.box[5]]) us.push(epUD(x, z).u);
  const w = Math.round(Math.max(...us) - Math.min(...us)) + 2, dx = w * b.r[0], dz = w * b.r[1], cells = etCells(m), have = new Set(cells.map(c => c.x + ',' + c.y + ',' + c.z)); let n = 0;
  for (const c of cells.filter(c => etOwner(m.parts, c.x, c.y, c.z) === p)) { const k = (c.x + dx) + ',' + c.y + ',' + (c.z + dz); if (have.has(k)) continue; cells.push({ x: c.x + dx, y: c.y, z: c.z + dz, m: c.m }); have.add(k); n++; }
  const id2 = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e3); m.parts.unshift({ id: id2, kind: p.kind, name: p.name, box: [p.box[0] + dx, p.box[1], p.box[2] + dz, p.box[3] + dx, p.box[4], p.box[5] + dz], mat: p.mat, shell: p.shell });
  m.blocks.runs = mapChain(cells, c => c.m); ET.sel = id2; epCommit(m, 'Копия: ' + p.name.toLowerCase() + ' (кубов: ' + n + ') — справа');
}
function etResize(id, axis, dv) {   // своя деталь: размер ±1 — заново по форме (только кубы её формы)
  const m = etBegin(), p = m.parts.find(q => q.id === id); if (!p || p.gen) return; const K = ET_KINDS[p.kind] || {}, b = p.box.slice(), B = epBasis();
  let ax, sg; if (axis === 'h') { ax = 1; sg = 1; } else { const v = axis === 'w' ? B.r : B.n; if (v[0]) { ax = 0; sg = v[0]; } else { ax = 2; sg = v[1]; } }   /* ширина — вправо, глубина — к нам */
  if (b[ax + 3] - b[ax] + 1 + dv < 1 || b[ax + 3] - b[ax] + 1 + dv > 40) return; if (sg > 0) b[ax + 3] += dv; else b[ax] -= dv;
  const cells = etCells(m), keep = cells.filter(c => etOwner(m.parts, c.x, c.y, c.z) !== p), have = new Set(keep.map(c => c.x + ',' + c.y + ',' + c.z));
  for (const [x, y, z] of etShape(b, p.shell)) { const k = x + ',' + y + ',' + z; if (!have.has(k)) { keep.push({ x, y, z, m: p.mat || 'core' }); have.add(k); } }
  p.box = b; m.blocks.runs = mapChain(keep, c => c.m); ET.sel = id; epCommit(m, p.name + ': ' + (b[3] - b[0] + 1) + '×' + (b[4] - b[1] + 1) + '×' + (b[5] - b[2] + 1));
}
// ---------- мышь, рисование, панель ----------
function etMouse() {
  canvas.addEventListener('mousedown', e => {
    if (EP.mode !== 'titan' || e.button !== 0 || e.shiftKey || e.altKey) return; const [px, py] = epCanvasPos(e);
    if (S < S0 * 0.08) { edMsg('Приблизь колесом мыши', true); return; } if (epTurning()) return;
    if (ET.place === 'path') { e.stopImmediatePropagation(); e.preventDefault(); epaClick(px, py); return; }   /* v257: 54_path.js */
    if (ET.place) { e.stopImmediatePropagation(); e.preventDefault(); const t = etTarget(px, py); if (t) { etPlace(t); ET.place = null; ET.ghost = null; canvas.style.cursor = ''; etShowSize(); etInfo(); } return; }   /* поставил — выбрана, можно тянуть; ещё — снова кнопка детали */
    const p = etPick(px, py); if (!p) { if (ET.sel) { ET.sel = null; etInfo(); } return; }
    e.stopImmediatePropagation(); e.preventDefault(); ET.sel = p.id; etInfo(); ET.drag = { id: p.id, px, py, du: 0, dy: 0, box: p.box };
  }, true);
  addEventListener('mousemove', e => {
    if (EP.mode !== 'titan') return; const [px, py] = epCanvasPos(e); EP.mouse = [px, py]; const D = ET.drag;
    if (D) { D.du = Math.round((px - D.px) / S); D.dy = Math.round(-(py - D.py) / S); return; }
    if (e.target !== canvas) { ET.hover = null; ET.ghost = null; return; }
    if (ET.place === 'path') { ET.ghost = null; ET.hover = null; } else if (ET.place) { ET.ghost = etTarget(px, py); ET.hover = null; } else { ET.ghost = null; const p = etPick(px, py); ET.hover = p ? p.id : null; canvas.style.cursor = p ? 'move' : ''; }
  });
  addEventListener('mouseup', () => { const D = ET.drag; if (!D) return; ET.drag = null; const b = epBasis(); if (D.du || D.dy) etMove(D.id, D.du * b.r[0], D.dy, D.du * b.r[1]); });
}
function etDraw() {
  const o = EP.octx; if (!o || EP.mode !== 'titan' || epTurning()) return; const parts = etParts(JSON.parse(ED.map)), lw = Math.max(2, Math.round(S * 0.03));
  const rect = (r, col, fill, dash) => { o.save(); o.lineWidth = lw; o.strokeStyle = col; if (dash) o.setLineDash([lw * 3, lw * 2]); if (fill) { o.fillStyle = fill; o.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); } o.strokeRect(Math.round(r[0]) + 0.5, Math.round(r[1]) + 0.5, Math.round(r[2] - r[0]), Math.round(r[3] - r[1])); o.restore(); };
  const label = (r, t, col) => { o.save(); o.font = Math.max(12, Math.round(Math.min(S, S0) * 0.16)) + 'px "PT Mono", monospace'; const w = o.measureText(t).width + 10, h = 18; o.fillStyle = 'rgba(6,18,26,0.85)'; o.fillRect(r[0], r[1] - h - 2, w, h); o.fillStyle = col; o.textBaseline = 'middle'; o.fillText(t, r[0] + 5, r[1] - h / 2 - 2); o.restore(); };
  const sz = b => (b[3] - b[0] + 1) + '×' + (b[4] - b[1] + 1) + '×' + (b[5] - b[2] + 1);
  for (const p of parts) if (p.id !== ET.sel && p.id !== ET.hover) rect(etRect(p.box), 'rgba(54,138,142,0.35)', null, true);
  const hv = parts.find(p => p.id === ET.hover); if (hv && hv.id !== ET.sel) { const r = etRect(hv.box); rect(r, 'rgba(54,138,142,0.95)', 'rgba(54,138,142,0.10)'); label(r, hv.name + ' ' + sz(hv.box), '#9fd8db'); }
  const sl = parts.find(p => p.id === ET.sel); if (sl) { const r = etRect(sl.box); rect(r, '#e0702e', 'rgba(224,112,46,0.10)'); label(r, sl.name + ' ' + sz(sl.box) + (sl.gen ? '' : ' · своя'), '#ffb37a');
    const D = ET.drag; if (D && (D.du || D.dy)) { const b = epBasis(), bx = sl.box, dx = D.du * b.r[0], dz = D.du * b.r[1]; rect(etRect([bx[0] + dx, bx[1] + D.dy, bx[2] + dz, bx[3] + dx, bx[4] + D.dy, bx[5] + dz]), '#e6f2f4', 'rgba(230,242,244,0.15)', true); } }
  epaDraw(o);
  if (ET.place && ET.ghost) { const r = etRect(ET.ghost.box); rect(r, '#ffffff', 'rgba(255,255,255,0.16)', true); label(r, (ET_KINDS[ET.place] ? ET_KINDS[ET.place].name : ET.lib ? '«' + ET.lib.it.name + '»' : '') + ' ' + ET.size.w + '×' + ET.size.h + '×' + ET.size.d + (ET.ghost.air ? ' · в воздухе' : ''), ET.ghost.air ? '#ffce46' : '#e6f2f4'); }
}
function etInfo() {
  const parts = etParts(JSON.parse(ED.map)), p = parts.find(q => q.id === ET.sel), box = edEl('etSel'); if (!box) return; box.hidden = !p; if (!p) return;
  const b = p.box; edEl('etSelName').textContent = p.name + (p.gen ? ' · из генератора' : ' · своя'); edEl('etSelSize').textContent = (b[3] - b[0] + 1) + '×' + (b[4] - b[1] + 1) + '×' + (b[5] - b[2] + 1) + ' кубов · низ на высоте ' + b[1];
  edEl('etSelSz').hidden = !!p.gen || !ET_KINDS[p.kind];
}
function etShowSize() { const lib = String(ET.place).startsWith('lib:'); for (const a of ['w', 'h', 'd']) edEl('etS' + a).textContent = ET.size[a]; document.querySelectorAll('#edTitan [data-sz]').forEach(b => { b.disabled = lib; }); document.querySelectorAll('#edTitan [data-etlib]').forEach(b => b.classList.toggle('act', ET.place === 'lib:' + b.dataset.etlib)); edEl('etPath').classList.toggle('act', ET.place === 'path' && !EPA.top); edEl('etPathTop').classList.toggle('act', ET.place === 'path' && !!EPA.top); document.querySelectorAll('#edTitan [data-et]').forEach(b => b.classList.toggle('act', b.dataset.et === ET.place)); document.querySelectorAll('#edTitan [data-etmat]').forEach(b => b.classList.toggle('act', b.dataset.etmat === ET.mat)); }
function etInit() {
  document.querySelectorAll('#edTitan [data-et]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.et; if (ET.place === k) { ET.place = null; canvas.style.cursor = ''; } else { ET.place = k; const K = ET_KINDS[k]; ET.size = { w: K.w, h: K.h, d: K.d }; ET.mat = K.mat; ET.sel = null; etInfo(); canvas.style.cursor = 'crosshair'; edMsg(K.name + ': клик по стене — встанет перед ней, клик в пустоту — в воздух. Размер — справа. Ещё одну — снова кнопка детали.'); } etShowSize(); }));
  document.querySelectorAll('#edTitan [data-sz]').forEach(b => b.addEventListener('click', () => { const [a, d] = [b.dataset.sz[0], b.dataset.sz[1] === '+' ? 1 : -1]; ET.size[a] = Math.max(1, Math.min(40, ET.size[a] + d)); etShowSize(); }));
  document.querySelectorAll('#edTitan [data-etmat]').forEach(b => b.addEventListener('click', () => { ET.mat = b.dataset.etmat; etShowSize(); }));
  document.querySelectorAll('#etSel [data-rs]').forEach(b => b.addEventListener('click', () => ET.sel && etResize(ET.sel, b.dataset.rs[0], b.dataset.rs[1] === '+' ? 1 : -1)));
  const pathBtn = top => { if (ET.place === 'path' && EPA.top === top) { ET.place = null; EPA.a = null; canvas.style.cursor = ''; etShowSize(); } else epaStart(top); };
  edEl('etPath').addEventListener('click', () => pathBtn(false)); edEl('etPathTop').addEventListener('click', () => pathBtn(true));
  edEl('etDel').addEventListener('click', () => ET.sel && etDelete(ET.sel)); edEl('etDup').addEventListener('click', () => ET.sel && etCopy(ET.sel));
  edEl('etNear').addEventListener('click', () => { const b = epBasis(); if (ET.sel) etMove(ET.sel, b.n[0], 0, b.n[1], 'Ближе к нам'); });
  edEl('etFar').addEventListener('click', () => { const b = epBasis(); if (ET.sel) etMove(ET.sel, -b.n[0], 0, -b.n[1], 'Дальше от нас'); });
  edEl('etUndo').addEventListener('click', epUndo); edEl('etRedo').addEventListener('click', epRedo);
  addEventListener('keydown', e => { const t = e.target; if (edModal() || EP.mode !== 'titan' || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
    if ((e.code === 'Delete' || e.code === 'Backspace') && ET.sel) { e.preventDefault(); etDelete(ET.sel); }
    else if (e.code === 'Escape') { if (ET.place) { EPA.a = null; ET.place = null; ET.ghost = null; canvas.style.cursor = ''; etShowSize(); } else { ET.sel = null; etInfo(); } }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD' && ET.sel) { e.preventDefault(); etCopy(ET.sel); } });
  etMouse(); etShowSize(); etlInit();
}
// ====================== РЕДАКТОР: «ТИТАН» — СВОИ ДЕТАЛИ В БИБЛИОТЕКЕ, ОТРАЗИТЬ (v256) ======================
// Выбранную деталь (любую, и из нынешнего титана) — «В библиотеку»: её кубы (как стоят сейчас, с материалами) сохраняются под именем,
// и её можно ставить на любой карте — справа, «Мои детали». Ставится лицом к нам, с какой стороны ни смотри (повёрнута по четвертям).
// Хранение: общая библиотека (db 'lib', запись kind:'part', кубы — строкой цепочек mapChain) или, без неё, — в этом браузере.
// «Отразить» — выбранная деталь зеркально слева направо (по экрану), в своей коробке.
const ETL = { list: [] };
function etlLocal(v) { if (v === undefined) { try { return JSON.parse(edStore('l', 'grk_parts') || '[]'); } catch (e) { return []; } } edStore('l', 'grk_parts', JSON.stringify(v)); }
function etlCells(it) { const out = []; mapUnchain(JSON.parse(it.runs), (x, y, z, m) => out.push([x, y, z, m]), true); return out; }
function etlRot(cells, q) {   // поворот вокруг вертикали на q четвертей (как сторона f → f+1: (x, z) → (z, −x)), потом к нулю
  let c = cells.map(a => a.slice()); for (let i = 0; i < ((q % 4) + 4) % 4; i++) c = c.map(([x, y, z, m]) => [z, y, -x, m]);
  const mx = Math.min(...c.map(a => a[0])), mz = Math.min(...c.map(a => a[2])); return c.map(([x, y, z, m]) => [x - mx, y, z - mz, m]);
}
function etlSize(cells) { const b = epBasis(), ex = Math.max(...cells.map(a => a[0])) + 1, ey = Math.max(...cells.map(a => a[1])) + 1, ez = Math.max(...cells.map(a => a[2])) + 1; return { w: b.r[0] ? ex : ez, h: ey, d: b.r[0] ? ez : ex, ex, ez }; }
async function etlSave(id) {
  const m = etBegin(), p = m.parts.find(q => q.id === id); if (!p) return; const mine = etCells(m).filter(c => etOwner(m.parts, c.x, c.y, c.z) === p);
  if (!mine.length) { edMsg('У детали нет кубов', true); return; } if (mine.length > 40000) { edMsg('Слишком большая деталь для библиотеки', true); return; }
  const r = await edAsk('Как назвать деталь?', { input: p.name, buttons: [['ok', 'В библиотеку', true]] }); const name = (r.ok && r.value || '').trim().slice(0, 40); if (!name) return;
  const x0 = Math.min(...mine.map(c => c.x)), y0 = Math.min(...mine.map(c => c.y)), z0 = Math.min(...mine.map(c => c.z));
  const rel = mine.map(c => ({ x: c.x - x0, y: c.y - y0, z: c.z - z0, m: c.m })).sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  const doc = { kind: 'part', name, f: view.k, runs: JSON.stringify(mapChain(rel, c => c.m)), n: rel.length, shell: !!p.shell, at: new Date().toISOString() };
  try { if (ED.db) { await ED.db.collection('lib').doc('part' + Date.now().toString(36) + Math.floor(Math.random() * 1e4)).set(doc); edMsg('В библиотеке: «' + name + '» — справа, «Мои детали»'); }
    else { const L = etlLocal(); L.unshift(Object.assign({ id: 'loc' + Date.now().toString(36) }, doc)); etlLocal(L); etlApply(); edMsg('Сохранено в этом браузере: «' + name + '»'); } }
  catch (e) { edMsg('Не сохранилось: ' + (e && (e.code || e.message) || e), true); }
}
async function etlRemove(id) {
  const it = ETL.list.find(i => i.id === id); if (!it || !await edSure('Убрать «' + it.name + '» из библиотеки? Уже поставленные останутся.', 'Убрать')) return;
  try { if (String(id).startsWith('loc')) { etlLocal(etlLocal().filter(i => i.id !== id)); etlApply(); } else if (ED.db) await ED.db.collection('lib').doc(id).delete(); edMsg('Убрано: «' + it.name + '»'); }
  catch (e) { edMsg('Не убралось: ' + (e && (e.code || e.message) || e), true); }
}
function etlApply(remote) {
  if (remote) ETL.remote = remote; ETL.list = etlLocal().concat(ETL.remote || []);
  const box = edEl('etLib'); if (!box) return; box.innerHTML = '';
  if (!ETL.list.length) { box.innerHTML = '<p class="note">Пока пусто. Выбери деталь на титане → «В библиотеку».</p>'; return; }
  for (const it of ETL.list) { const row = document.createElement('div'); row.className = 'row etl'; const b = document.createElement('button'); b.type = 'button'; b.dataset.etlib = it.id; b.textContent = it.name; b.title = (it.n || '?') + ' кубов';
    b.addEventListener('click', () => etlStart(it.id)); const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = 'убрать из библиотеки'; x.addEventListener('click', () => etlRemove(it.id)); row.append(b, x); box.append(row); }
  etShowSize();
}
function etlStart(id) {
  const it = ETL.list.find(i => i.id === id); if (!it) return; if (ET.place === 'lib:' + id) { ET.place = null; canvas.style.cursor = ''; etShowSize(); return; }
  const cells = etlRot(etlCells(it), view.k - (it.f || 0)), s = etlSize(cells); ET.place = 'lib:' + id; ET.lib = { it, cells, k: view.k }; ET.size = { w: s.w, h: s.h, d: s.d }; ET.sel = null; etInfo(); canvas.style.cursor = 'crosshair';
  edMsg('«' + it.name + '»: клик по стене или в воздух — поставить (лицом к нам).'); etShowSize();
}
function etlPlace(t) {   // кубы детали из библиотеки — в коробку t.box (её угол = угол коробки)
  let L = ET.lib; if (L.k !== view.k) { L = ET.lib = { it: L.it, cells: etlRot(etlCells(L.it), view.k - (L.it.f || 0)), k: view.k }; }
  const m = etBegin(), cells = etCells(m), have = new Set(cells.map(c => c.x + ',' + c.y + ',' + c.z)), b = t.box; let n = 0;
  for (const [x, y, z, mm] of L.cells) { const X = b[0] + x, Y = b[1] + y, Z = b[2] + z, k = X + ',' + Y + ',' + Z; if (have.has(k) || Math.abs(X) > 80 || Math.abs(Z) > 80) continue; cells.push({ x: X, y: Y, z: Z, m: mm }); have.add(k); n++; }
  if (!n) { edMsg('Здесь уже всё занято кубами'); return; } const s = etlSize(L.cells);
  const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e3); m.parts.unshift({ id, kind: 'lib', lib: L.it.id, name: L.it.name, box: [b[0], b[1], b[2], b[0] + s.ex - 1, b[1] + s.h - 1, b[2] + s.ez - 1], shell: !!L.it.shell, own: true });
  m.blocks.runs = mapChain(cells, c => c.m); ET.sel = id; epCommit(m, 'Поставлено: «' + L.it.name + '»');
}
function etMirror(id) {   // зеркально по экрану (вдоль «вправо»), в своей коробке
  const m = etBegin(), p = m.parts.find(q => q.id === id); if (!p) return; const B = epBasis(), ax = B.r[0] ? 'x' : 'z', lo = ax === 'x' ? p.box[0] : p.box[2], hi = ax === 'x' ? p.box[3] : p.box[5];
  const cells = etCells(m), mine = [], rest = []; for (const c of cells) (etOwner(m.parts, c.x, c.y, c.z) === p ? mine : rest).push(c);
  const fl = mine.map(c => ax === 'x' ? { x: lo + hi - c.x, y: c.y, z: c.z, m: c.m } : { x: c.x, y: c.y, z: lo + hi - c.z, m: c.m });
  m.blocks.runs = mapChain(rest.concat(fl), c => c.m); ET.sel = id; epCommit(m, p.name + ' — отражено');
}
function etlInit() {
  edEl('etSave').addEventListener('click', () => ET.sel && etlSave(ET.sel)); edEl('etFlip').addEventListener('click', () => ET.sel && etMirror(ET.sel));
  etlApply([]);
}
function etlSub() { if (ED.db) ED.db.collection('lib').limit(300).onSnapshot(s => etlApply(s.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(d => d.kind === 'part')), () => {}); }   /* когда общее хранилище готово (00_editor.js) */
// ====================== РЕДАКТОР: «ТИТАН» → «ПУТЬ» — ПОДЪЁМ ПО СТЕНЕ (v257) ======================
// Первый кирпич «пути по любой сборке»: Алексей отмечает низ (где герой стоит) и верх (куда надо попасть) на этой стороне —
// редактор строит по стене зигзаг: лестница на 4 куба → уступ в 3 куба (в сторону) → лестница → … → последняя лестница до верха.
// Уступ — кубы «уступ» перед стеной в каждой своей клетке (стена неровная — уступ идёт по ней); лестницы — с лазом, «руками» (у любой стены).
// Весь путь — одна деталь «Путь» (кубы + лестницы внутри коробки): двигается, удаляется, копируется как деталь.
const EPA = { a: null };
function epaStart(top) { ET.place = 'path'; EPA.a = null; EPA.top = !!top; ET.sel = null; etInfo(); canvas.style.cursor = 'crosshair'; edMsg(top ? 'До верха: кликни НИЗ — где герой стоит. Путь пойдёт вверх, пока есть титан.' : 'Путь: кликни НИЗ — где герой стоит (над полом), потом ВЕРХ — куда надо залезть.', true); etShowSize(); }
// v258: «До верха» — верх ищется сам: над колонкой лестницы титана больше нет (виден верх — на него и сходит)
function epaColTop(u, from) { let t = null; for (let y = from; y < from + 160; y++) if (epaWall(u, y) !== null) t = y + 1; return t; }
function epaPoint(px, py) { const u = Math.round((px - W / 2) / S), y = Math.floor(cam.y - (py - H / 2) / S); return { u, y }; }
function epaWall(u, y) { return epFrontD(u, y + 0.5); }
function epaBuild(a, b) {   // a — низ (y — клетка над полом, где ноги), b — верх; b.top — «до верха»: b.y не задан, стоп, когда над лестницей титан кончился
  if (b.top) b = { u: a.u, y: 1e9, top: true };
  if (b.y - a.y < 1) { edMsg('Верх должен быть выше низа', true); return null; }
  // Глубина пролёта D — перед самой выступающей стеной там, где пройдёт герой (лестница, уступ и 2 клетки над ними), и не ближе к стене,
  // чем прошлый пролёт: стена, что ближе к нам, чем герой, его не пустит (FEZ: что ближе — твёрдое). Уступ — полка от стены до D.
  const STEP = 4, LW = 3, dir0 = Math.sign(b.u - a.u) || 1, cubesAdd = [], ladders = []; let u = a.u, y = a.y, dir = dir0, D = null, guard = 0;
  const front = (uu, yy) => epaWall(uu, yy);
  while (y < b.y && guard++ < 60) {
    let hh = Math.min(STEP, b.y - y); if (b.top) { const t = epaColTop(u, y); if (t === null || t <= y) break; if (t - y <= STEP + 1) hh = t - y; }
    const h = hh, last = y + h >= b.y || (b.top && epaColTop(u, y) === y + h), cols = [u]; if (!last) for (let i = 1; i <= LW + 1; i++) cols.push(u + dir * i);
    let m = null; for (const uu of cols) for (let yy = y; yy <= y + h + 2; yy++) { const f = front(uu, yy); if (f !== null && (m === null || f > m)) m = f; }
    if (m === null && D === null) { edMsg('Здесь нет стены — путь строится по стене титана', true); return null; }
    D = Math.max(D === null ? -1e9 : D, m === null ? -1e9 : m + 1);
    ladders.push({ u, d: D, y0: y, y1: y + h }); y += h; if (last) break;
    for (let i = 1; i <= LW + 1; i++) { const uu = u + dir * i, f = front(uu, y - 1);   /* +1 клетка за лестницей — запас, чтобы не сорваться с края */ for (let dd = f === null ? D : f + 1; dd <= D; dd++) cubesAdd.push({ u: uu, y: y - 1, d: dd }); }   // полка: верх = y
    u += dir * LW; dir = -dir;
  }
  return { cubesAdd, ladders };
}
function epaCommit(a, b) {
  const P = epaBuild(a, b); if (!P) return; if (!P.ladders.length) { edMsg('Отсюда вверх титана нет', true); return; } const m = etBegin(), cells = etCells(m), have = new Set(cells.map(c => c.x + ',' + c.y + ',' + c.z)), xs = [], ys = [], zs = []; let n = 0;
  const at = (uu, dd) => { const p = epXZ(uu, dd); return { x: Math.round(p.x), z: Math.round(p.z) }; };
  for (const c of P.cubesAdd) { const q = at(c.u, c.d), k = q.x + ',' + c.y + ',' + q.z; xs.push(q.x); ys.push(c.y); zs.push(q.z); if (have.has(k)) continue; cells.push({ x: q.x, y: c.y, z: q.z, m: 'ledge' }); have.add(k); n++; }
  for (const L of P.ladders) { const q = at(L.u, L.d), rec = { lib: 'climb/ladder' }; eldSet(rec, q.x, q.z, view.k); rec.y0 = L.y0; rec.y1 = L.y1; epMark(rec); m.props.push(rec); eldSync(m, rec, null); xs.push(q.x); ys.push(L.y0, L.y1); zs.push(q.z); }
  m.blocks.runs = mapChain(cells, c => c.m);
  const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e3); m.parts.unshift({ id, kind: 'path', name: 'Путь', box: [Math.min(...xs), Math.min(...ys), Math.min(...zs), Math.max(...xs), Math.max(...ys) - 1, Math.max(...zs)], own: true });
  ET.sel = id; epCommit(m, 'Путь: лестниц ' + P.ladders.length + ', уступов ' + Math.max(0, P.ladders.length - 1) + ' — «Тест», чтобы пройти');
}
function epaClick(px, py) {
  const p = epaPoint(px, py); if (!EPA.a) { if (epaWall(p.u, p.y) === null) { edMsg('Низ — у стены титана', true); return; } if (EPA.top) { ET.place = null; canvas.style.cursor = ''; etShowSize(); epaCommit(p, { top: true }); return; } EPA.a = p; edMsg('Теперь кликни ВЕРХ — куда залезть.', true); return; }
  const a = EPA.a; EPA.a = null; ET.place = null; canvas.style.cursor = ''; etShowSize(); epaCommit(a, p);
}
function epaDraw(o) {
  if (ET.place !== 'path' || !EP.mouse) return; const lw = Math.max(2, Math.round(S * 0.03)); const pt = p => [W / 2 + p.u * S, H / 2 - (p.y - cam.y) * S];
  const cur = epaPoint(EP.mouse[0], EP.mouse[1]); o.save(); o.lineWidth = lw; o.strokeStyle = '#ffce46'; o.setLineDash([lw * 3, lw * 2]);
  if (EPA.top) { const P = epaBuild(cur, { top: true }); if (P) { o.setLineDash([]); o.strokeStyle = 'rgba(255,206,70,0.9)'; for (const L of P.ladders) { const [x, y0] = pt({ u: L.u, y: L.y0 }), [, y1] = pt({ u: L.u, y: L.y1 }); o.strokeRect(x - S * 0.3, y1, S * 0.6, y0 - y1); } o.fillStyle = 'rgba(255,206,70,0.35)'; for (const c of P.cubesAdd) { const [x, y] = pt({ u: c.u, y: c.y + 1 }); o.fillRect(x - S / 2, y, S, S); } } }
  else if (EPA.a) { const [ax, ay] = pt(EPA.a), [bx, by] = pt(cur); o.beginPath(); o.moveTo(ax, ay); o.lineTo(ax, by); o.lineTo(bx, by); o.stroke();
    const P = epaBuild(EPA.a, cur); if (P) { o.setLineDash([]); o.strokeStyle = 'rgba(255,206,70,0.9)'; for (const L of P.ladders) { const [x, y0] = pt({ u: L.u, y: L.y0 }), [, y1] = pt({ u: L.u, y: L.y1 }); o.strokeRect(x - S * 0.3, y1, S * 0.6, y0 - y1); }
      o.fillStyle = 'rgba(255,206,70,0.35)'; for (const c of P.cubesAdd) { const [x, y] = pt({ u: c.u, y: c.y + 1 }); o.fillRect(x - S / 2, y, S, S); } } }
  o.setLineDash([]); o.fillStyle = '#ffce46'; const [cx, cy] = pt(cur); o.fillRect(cx - 5, cy - 5, 10, 10); if (EPA.a) { const [ax, ay] = pt(EPA.a); o.fillRect(ax - 6, ay - 6, 12, 12); }
  o.font = '13px "PT Mono", monospace'; const t = EPA.top ? 'низ · до верха' : EPA.a ? 'верх · подъём ' + Math.max(0, cur.y - EPA.a.y) : 'низ'; const w = o.measureText(t).width + 10; o.fillStyle = 'rgba(6,18,26,0.88)'; o.fillRect(cx + 10, cy - 10, w, 20); o.fillStyle = '#ffce46'; o.textBaseline = 'middle'; o.fillText(t, cx + 15, cy); o.restore();
}
// ====================== РЕДАКТОР: «ЮНИТЫ» — РИСОВАТЬ И СОБИРАТЬ АНИМАЦИИ (v259–v260, «редактор вроде Aseprite») ======================
// Слева — анимации героя и робота (клипы игры) и свои; «＋ Новая анимация» — пустая или копия любой. Справа сверху — проигрывание.
// Снизу — кадры: тянуть мышью — менять местами; «＋ Пустой», «⧉ Копия», «◐ Между» (черновик промежуточного), «⇩ Из другой…»
// (кадр любой анимации), «✕ Убрать»; длительность кадра — в мс. Над кадром — панель: ↶ ↷, кисти, размер, «Шелуха», сохранить.
// Цвет — как в Aseprite: основной / фоновый (X — поменять; левая кнопка — основным, правая — фоновым), круг HSV: квадрат + оттенок +
// прозрачность, hex; палитры: «Анимация» (цвета этой анимации), «DB32» (как в Aseprite по умолчанию), «Моя» (＋ — добавить, правой — убрать).
// «Живая линия» — шум по краю рисунка. Отмена — общая: и рисование, и правка кадров/анимации.
// Хранение (ядро 13e_frames.js): перерисованный кадр листа — kind 'frame'; новый кадр — свой спрайт kind 'sprite'; анимация — kind 'clip'.
const EUN = { clip: null, i: 0, work: {}, tool: 'pen', size: 1, fg: [224, 112, 46, 255], bg: [0, 0, 0, 0], onion: true, play: true, t: 0, last: 0, zoom: 8, drawing: null,
  dirty: new Set(), dclip: new Set(), lists: {}, hist: [], redo: [], palTab: 'anim', hsv: null, speed: 1 };
const DB32 = ['000000', '222034', '45283c', '663931', '8f563b', 'df7126', 'd9a066', 'eec39a', 'fbf236', '99e550', '6abe30', '37946e', '4b692f', '524b24', '323c39', '3f3f74',
  '306082', '5b6ee1', '639bff', '5fcde4', 'cbdbfc', 'ffffff', '9badb7', '847e87', '696a6a', '595652', '76428a', 'ac3232', 'd95763', 'd77bba', '8f974a', '8a6f30'];
const EUN_RU = { Stay: 'стоит', Run: 'бег', RunFast: 'бег быстро', RunSlow: 'бег шагом', Jump: 'прыжок', JumpInRun: 'прыжок с бега', Fly: 'полёт', Grounded: 'приземлился', HandAttack: 'удар рукой', LegsAttack: 'удар ногой',
  LegsAttackUp: 'удар ногой вверх', JumpLegsAttack: 'удар ногой в прыжке', KunaiThrow: 'бросок куная', Kulbit: 'кульбит', KulbitBack: 'кульбит назад', Sit: 'присел', SitAttack: 'удар сидя', Take: 'схватился', Stomp: 'топот',
  KnifeAttack: 'удар ножом', Climb: 'лезет', ClimbIdle: 'висит на лестнице', HangOne: 'висит на руке', Burst: 'лопнул', TakeHit: 'получил удар', Death: 'гибель', Died: 'лежит', Rotate: 'поворот', Punch: 'удар', Shoot: 'выстрел', Vent: 'пар', AirJump: 'второй прыжок', AirThrow: 'бросок в полёте',
  CordRip: 'рвёт провод', CordRipA: 'рвёт провод А', CordRipB: 'рвёт провод Б', FireAttack: 'удар огнём', ForkAir: 'вилка в воздухе', ForkAttack: 'удар вилкой', ForkBeam: 'вилка: луч', ForkDash: 'вилка: рывок', ForkHold: 'вилка: держит', ForkPlug: 'вилка: втыкает', ForkPull: 'вилка: тянет',
  JumpFire: 'огонь в прыжке', JumpKnife: 'нож в прыжке', LegsAttackKunai: 'удар ногой с кунаем', DeathA: 'гибель А', DeathB: 'гибель Б', DeathD: 'гибель В', Fire: 'огонь', FxBurst: 'вспышка', FxDash: 'след рывка', FxLand: 'пыль приземления', FxPop: 'хлопок', FxPuff: 'облачко', FxRing: 'кольцо', FxSmoke: 'дым', FxStep: 'шаг: пыль', FxWhoosh: 'свист', KunaiAC_Fly: 'кунай летит', KunaiAC_Hit: 'кунай попал' };
function eunLabel(n) {
  const c = CL[n]; if (c && c.title) return c.title;
  if (EUN_RU[n]) return EUN_RU[n]; const b = n.replace(/^MainCharAC_|^RobotAC_|^Hero/, ''), m = /^([A-Za-z]+?)(L|R)?(\d)?$/.exec(b) || [], base = m[1] || b, ru = EUN_RU[base] || EUN_RU[base.replace(/[LR]$/, '')] || base;
  return ru + (m[2] === 'L' ? ' ←' : m[2] === 'R' ? ' →' : '') + (m[3] ? ' ' + m[3] : '');
}
function eunGroups() {
  const H = [], R = [], O = [], U = []; for (const n of Object.keys(CL)) { const c = CL[n]; if (!c || !c.frames || !c.frames.length || !c.frames.every(f => SP[f[1]])) continue;
    if (c.user) U.push(n); else if (/^(MainCharAC_|Hero)/.test(n)) H.push(n); else if (/^RobotAC_/.test(n)) R.push(n); else O.push(n); }
  const by = (a, b) => eunLabel(a).localeCompare(eunLabel(b), 'ru'); return [['Мои анимации', U.sort(by)], ['Герой', H.sort(by)], ['Робот', R.sort(by)], ['Другое', O.sort(by)]];
}
// ---------- анимация как список кадров с длительностями ----------
function eunList(n) {   // рабочий список [{s, d}] (d — секунды)
  n = n || EUN.clip; let L = EUN.lists[n]; if (L) return L; const c = CL[n]; if (!c) return [];
  L = EUN.lists[n] = c.frames.map((f, i) => ({ s: f[1], d: Math.max(0.01, (i + 1 < c.frames.length ? c.frames[i + 1][0] : c.len) - f[0]) })); return L;
}
function eunApplyClip(n) {   // список → CL (сразу видно в проигрывании и в карте)
  const L = eunList(n); let t = 0; const frames = L.map(f => { const fr = [Math.round(t * 1e4) / 1e4, f.s]; t += f.d; return fr; }); const c = CL[n] || {};
  clipDef(n, { len: Math.round(t * 1e4) / 1e4, frames, title: c.title, group: c.group, user: c.user }); EUN.dclip.add(n);
}
const eunFrames = () => eunList().map(f => f.s);
const eunCur = () => eunFrames()[EUN.i];
// ---------- рабочие копии кадров ----------
function eunWork(name) {
  let w = EUN.work[name]; if (w) return w; const s = SP[name], c = cut[name]; if (!s) return null;
  const px = c ? c.getContext('2d').getImageData(1, 1, s[3], s[4]).data : new Uint8ClampedArray(s[3] * s[4] * 4); w = EUN.work[name] = { w: s[3], h: s[4], px }; return w;
}
function eunCanvas(w) { const c = document.createElement('canvas'); c.width = w.w; c.height = w.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(w.px), w.w, w.h), 0, 0); return c; }
function eunTouch(name) { EUN.dirty.add(name); const w = EUN.work[name]; EUN.inTouch = true; frameSet(name, eunCanvas(w)); EUN.inTouch = false; eunStrip(); eunInfo(); }   /* сразу и в карте за окном */
// ---------- отмена: одна на всё ----------
function eunSnapPx(n) { const w = eunWork(n); EUN.hist.push({ t: 'px', n, px: new Uint8ClampedArray(w.px) }); EUN.redo = []; if (EUN.hist.length > 120) EUN.hist.shift(); }
function eunSnapClip() { EUN.hist.push({ t: 'cl', c: EUN.clip, list: eunList().map(f => Object.assign({}, f)), i: EUN.i }); EUN.redo = []; if (EUN.hist.length > 120) EUN.hist.shift(); }
function eunUndo(redo) {
  const A = redo ? EUN.redo : EUN.hist, B = redo ? EUN.hist : EUN.redo, h = A.pop(); if (!h) { edMsg(redo ? 'Возвращать нечего' : 'Отменять нечего'); return; }
  if (h.t === 'px') { const w = eunWork(h.n); B.push({ t: 'px', n: h.n, px: new Uint8ClampedArray(w.px) }); w.px = h.px; eunTouch(h.n); const k = eunFrames().indexOf(h.n); if (k >= 0) EUN.i = k; }
  else { B.push({ t: 'cl', c: h.c, list: eunList(h.c).map(f => Object.assign({}, f)), i: EUN.i }); EUN.lists[h.c] = h.list; eunApplyClip(h.c); if (EUN.clip !== h.c) eunOpen(h.c, true); EUN.i = Math.min(h.i, h.list.length - 1); }
  EUN.play = false; eunShow();
}
// ---------- рисование ----------
function eunSet(w, x, y, rgba) { if (x < 0 || y < 0 || x >= w.w || y >= w.h) return; const i = (y * w.w + x) * 4; w.px[i] = rgba[0]; w.px[i + 1] = rgba[1]; w.px[i + 2] = rgba[2]; w.px[i + 3] = rgba[3]; }
function eunPaintCol(btn) { return EUN.tool === 'erase' ? [0, 0, 0, 0] : btn === 2 ? EUN.bg : EUN.fg; }
function eunDab(w, x, y, col) { const r = EUN.size, o = Math.floor((r - 1) / 2); for (let yy = 0; yy < r; yy++) for (let xx = 0; xx < r; xx++) eunSet(w, x - o + xx, y - o + yy, col); }
function eunLine(w, x0, y0, x1, y1, col) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let k = 0; k <= n; k++) eunDab(w, Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), col); }
function eunFill(w, x, y, rgba) {
  const at = (xx, yy) => (yy * w.w + xx) * 4, i0 = at(x, y), t = [w.px[i0], w.px[i0 + 1], w.px[i0 + 2], w.px[i0 + 3]];
  const same = i => t[3] === 0 ? w.px[i + 3] === 0 : w.px[i] === t[0] && w.px[i + 1] === t[1] && w.px[i + 2] === t[2] && w.px[i + 3] === t[3];
  if (t.every((v, k) => v === rgba[k])) return; const st = [[x, y]], seen = new Uint8Array(w.w * w.h);
  while (st.length) { const [a, b] = st.pop(); if (a < 0 || b < 0 || a >= w.w || b >= w.h || seen[b * w.w + a]) continue; seen[b * w.w + a] = 1; const i = at(a, b); if (!same(i)) continue; eunSet(w, a, b, rgba); st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]); }
}
function eunPick(w, x, y, btn) { const i = (y * w.w + x) * 4, c = [w.px[i], w.px[i + 1], w.px[i + 2], w.px[i + 3]]; if (btn === 2) EUN.bg = c; else EUN.fg = c; EUN.hsv = null; eunTool(EUN.prevTool || 'pen'); eunColorUI(); }
function eunBoil(w, strength, seed) {   // «живая линия»: край рисунка выпускает точку наружу или гаснет
  let s = (seed * 9301 + 49297) % 233280 || 1; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280, src = new Uint8ClampedArray(w.px), A = (x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h ? src[(y * w.w + x) * 4 + 3] : 0;
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { if (!A(x, y)) continue; const open = N.filter(([dx, dy]) => !A(x + dx, y + dy)); if (!open.length || R() > strength) continue;
    const i = (y * w.w + x) * 4; if (R() < 0.5) { const [dx, dy] = open[Math.floor(R() * open.length)], j = ((y + dy) * w.w + x + dx) * 4; for (let k = 0; k < 4; k++) w.px[j + k] = src[i + k]; }
    else if (open.length < 3) w.px[i + 3] = 0; }
}
// ---------- цвет: основной/фоновый, HSV, палитры ----------
const hex2 = c => '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
function rgb2hsv([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, mx ? d / mx : 0, mx]; }
function hsv2rgb(h, s, v) { const f = n => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); }; return [f(5), f(3), f(1)]; }
function eunColorUI() {
  const fg = EUN.fg, bg = EUN.bg; const sw = (id, c) => { const el = edEl(id); el.style.background = c[3] ? 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (c[3] / 255).toFixed(2) + ')' : 'transparent'; el.classList.toggle('none', !c[3]); };
  sw('eunFg', fg); sw('eunBg', bg); if (!EUN.hsv) EUN.hsv = rgb2hsv(fg); edEl('eunHex').value = hex2(fg).slice(1); edEl('eunAv').textContent = Math.round(fg[3] / 2.55) + '%';
  const cv = edEl('eunSV'), x = cv.getContext('2d'), [h, s, v] = EUN.hsv, W2 = cv.width, H2 = cv.height;
  const gH = x.createLinearGradient(0, 0, W2, 0); gH.addColorStop(0, '#fff'); gH.addColorStop(1, hex2(hsv2rgb(h, 1, 1).concat(255))); x.fillStyle = gH; x.fillRect(0, 0, W2, H2);
  const gV = x.createLinearGradient(0, 0, 0, H2); gV.addColorStop(0, 'rgba(0,0,0,0)'); gV.addColorStop(1, '#000'); x.fillStyle = gV; x.fillRect(0, 0, W2, H2);
  x.strokeStyle = v > 0.5 ? '#000' : '#fff'; x.lineWidth = 2; x.strokeRect(s * W2 - 4, (1 - v) * H2 - 4, 8, 8);
  const hc = edEl('eunHue'), hx = hc.getContext('2d'); for (let i = 0; i < hc.height; i++) { hx.fillStyle = hex2(hsv2rgb(i / hc.height * 360, 1, 1).concat(255)); hx.fillRect(0, i, hc.width, 1); } hx.fillStyle = '#fff'; hx.fillRect(0, h / 360 * hc.height - 1, hc.width, 3);
  const ac = edEl('eunAl'), ax = ac.getContext('2d'); for (let i = 0; i < ac.height; i += 4) for (let j = 0; j < ac.width; j += 4) { ax.fillStyle = (i + j) % 8 ? '#2a3a42' : '#556'; ax.fillRect(j, i, 4, 4); }
  const gA = ax.createLinearGradient(0, 0, 0, ac.height); gA.addColorStop(0, hex2(fg)); gA.addColorStop(1, 'rgba(' + fg[0] + ',' + fg[1] + ',' + fg[2] + ',0)'); ax.fillStyle = gA; ax.fillRect(0, 0, ac.width, ac.height); ax.fillStyle = '#fff'; ax.fillRect(0, (1 - fg[3] / 255) * ac.height - 1, ac.width, 3);
  eunPal();
}
function eunSetFg(rgb, keepHsv) { EUN.fg = [rgb[0], rgb[1], rgb[2], EUN.fg[3] || 255]; if (!keepHsv) EUN.hsv = null; if (EUN.tool === 'erase' || EUN.tool === 'pick') eunTool('pen'); eunColorUI(); }
function eunMyPal(v) { if (v === undefined) { try { return JSON.parse(localStorage.getItem('grk_mypal') || '[]'); } catch (e) { return []; } } try { localStorage.setItem('grk_mypal', JSON.stringify(v)); } catch (e) {} }
function eunPal() {
  const box = edEl('eunPal'); if (!box) return; document.querySelectorAll('#edUnits [data-pt]').forEach(b => b.classList.toggle('act', b.dataset.pt === EUN.palTab)); let cols;
  if (EUN.palTab === 'db32') cols = DB32; else if (EUN.palTab === 'my') cols = eunMyPal();
  else { const cnt = new Map(); for (const n of new Set(eunFrames())) { const w = eunWork(n); if (!w) continue; for (let i = 0; i < w.px.length; i += 4) if (w.px[i + 3] > 40) { const k = hex2([w.px[i], w.px[i + 1], w.px[i + 2]]).slice(1); cnt.set(k, (cnt.get(k) || 0) + 1); } }
    cols = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 48).map(e => e[0]).sort((a, b) => rgb2hsv([parseInt(a.slice(0, 2), 16), parseInt(a.slice(2, 4), 16), parseInt(a.slice(4), 16)])[2] - rgb2hsv([parseInt(b.slice(0, 2), 16), parseInt(b.slice(2, 4), 16), parseInt(b.slice(4), 16)])[2]); }
  const cur = hex2(EUN.fg).slice(1); box.innerHTML = '';
  for (const k of cols) { const b = document.createElement('button'); b.type = 'button'; b.className = 'eunc' + (k === cur ? ' act' : ''); b.style.background = '#' + k; b.title = '#' + k + (EUN.palTab === 'my' ? ' · правой кнопкой — убрать' : '');
    const rgb = [parseInt(k.slice(0, 2), 16), parseInt(k.slice(2, 4), 16), parseInt(k.slice(4), 16)];
    b.addEventListener('mousedown', e => { e.preventDefault(); if (e.button === 2) { if (EUN.palTab === 'my') { eunMyPal(eunMyPal().filter(c => c !== k)); eunPal(); } else { EUN.bg = rgb.concat(255); eunColorUI(); } return; } eunSetFg(rgb); });
    b.addEventListener('contextmenu', e => e.preventDefault()); box.append(b); }
  if (EUN.palTab === 'my') { const a = document.createElement('button'); a.type = 'button'; a.className = 'eunc add'; a.textContent = '＋'; a.title = 'добавить основной цвет'; a.addEventListener('click', () => { const L = eunMyPal(); if (!L.includes(cur)) L.push(cur); eunMyPal(L); eunPal(); }); box.append(a); }
}
function eunColorInit() {
  const drag = (el, fn) => { const go = e => { const r = el.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))); };
    el.addEventListener('mousedown', e => { e.preventDefault(); go(e); const mv = ev => go(ev), up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); }); };
  drag(edEl('eunSV'), (sx, sy) => { const h = EUN.hsv ? EUN.hsv[0] : 0; EUN.hsv = [h, sx, 1 - sy]; eunSetFg(hsv2rgb(h, sx, 1 - sy), true); });
  drag(edEl('eunHue'), (sx, sy) => { const hs = EUN.hsv || rgb2hsv(EUN.fg); EUN.hsv = [sy * 359.9, hs[1], hs[2]]; eunSetFg(hsv2rgb(EUN.hsv[0], hs[1], hs[2]), true); });
  drag(edEl('eunAl'), (sx, sy) => { EUN.fg = EUN.fg.slice(0, 3).concat(Math.round((1 - sy) * 255)); eunColorUI(); });
  edEl('eunHex').addEventListener('change', e => { const v = e.target.value.replace(/[^0-9a-f]/gi, ''); if (v.length === 6) eunSetFg([parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4), 16)]); });
  edEl('eunSwap').addEventListener('click', () => { const t = EUN.fg; EUN.fg = EUN.bg; EUN.bg = t; EUN.hsv = null; eunColorUI(); });
  edEl('eunFg').addEventListener('click', () => { if (!EUN.fg[3]) { EUN.fg = EUN.fg.slice(0, 3).concat(255); eunColorUI(); } });
  document.querySelectorAll('#edUnits [data-pt]').forEach(b => b.addEventListener('click', () => { EUN.palTab = b.dataset.pt; eunPal(); }));
}
// ---------- кадры: добавить, копия, между, из другой, убрать, переставить ----------
function eunNewSprite(like, base) {   // свой спрайт размером/привязкой как у like; base — пиксели (или пустой)
  const s = SP[like], name = 'U_' + (EUN.clip || 'anim').replace(/\W/g, '') + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1e3);
  spriteDef(name, { w: s[3], h: s[4], px: s[5], py: s[6], ppu: s[7] }); EUN.work[name] = { w: s[3], h: s[4], px: base ? new Uint8ClampedArray(base) : new Uint8ClampedArray(s[3] * s[4] * 4) };
  EUN.inTouch = true; frameSet(name, eunCanvas(EUN.work[name])); EUN.inTouch = false; EUN.dirty.add(name); return name;
}
function eunInsert(name, at, d) { eunSnapClip(); const L = eunList(); L.splice(at, 0, { s: name, d: d || (L[EUN.i] ? L[EUN.i].d : 0.1) }); EUN.i = at; eunApplyClip(EUN.clip); EUN.play = false; eunShow(); eunPal(); }
function eunAddEmpty() { const c = eunCur(); if (!c) return; eunInsert(eunNewSprite(c), EUN.i + 1); edMsg('Новый пустой кадр — после текущего'); }
function eunAddCopy() { const c = eunCur(); if (!c) return; eunInsert(eunNewSprite(c, eunWork(c).px), EUN.i + 1); edMsg('Копия кадра — после текущего'); }
function eunTween() {   // черновик кадра между текущим и следующим: общий сдвиг рисунка пополам + то, что есть только у следующего
  const L = eunList(); if (L.length < 2) { edMsg('Нужно хотя бы два кадра', true); return; } const A = eunWork(L[EUN.i].s), B = eunWork(L[(EUN.i + 1) % L.length].s);
  if (A.w !== B.w || A.h !== B.h) { edMsg('Кадры разного размера — «между» не собрать', true); return; }
  const al = (w, x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h ? w.px[(y * w.w + x) * 4 + 3] > 40 : false; let best = [0, 0], bs = -1;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { let sc = 0; for (let y = 0; y < A.h; y += 2) for (let x = 0; x < A.w; x += 2) if (al(A, x, y) && al(B, x + dx, y + dy)) sc++; if (sc > bs) { bs = sc; best = [dx, dy]; } }
  const hx = Math.round(best[0] / 2), hy = Math.round(best[1] / 2), out = new Uint8ClampedArray(A.px.length), cp = (w, sx, sy, dx, dy) => { const i = (sy * w.w + sx) * 4, j = (dy * A.w + dx) * 4; for (let k = 0; k < 4; k++) out[j + k] = w.px[i + k]; };
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const ax = x - hx, ay = y - hy, bx = x + best[0] - hx, by = y + best[1] - hy;
    const ia = al(A, ax, ay), ib = al(B, bx, by); if (ia && (!ib || (x + y) % 2 === 0)) cp(A, ax, ay, x, y); else if (ib) cp(B, bx, by, x, y); }
  const d = L[EUN.i].d / 2; L[EUN.i].d = d; eunInsert(eunNewSprite(L[EUN.i].s, out), EUN.i + 1, d); edMsg('Черновик кадра между — подправь кистью (сдвиг ' + best.join(', ') + ')');
}
function eunRemove() { const L = eunList(); if (L.length < 2) { edMsg('Последний кадр не убрать', true); return; } eunSnapClip(); L.splice(EUN.i, 1); EUN.i = Math.min(EUN.i, L.length - 1); eunApplyClip(EUN.clip); EUN.play = false; eunShow(); eunPal(); edMsg('Кадр убран (Ctrl+Z — вернуть)'); }
function eunMove(from, to) { if (from === to) return; eunSnapClip(); const L = eunList(), [f] = L.splice(from, 1); L.splice(to, 0, f); EUN.i = to; eunApplyClip(EUN.clip); EUN.play = false; eunShow(); }
function eunDur(ms) { const L = eunList(), f = L[EUN.i]; if (!f) return; ms = Math.max(10, Math.min(2000, Math.round(ms))); if (Math.round(f.d * 1000) === ms) return; eunSnapClip(); f.d = ms / 1000; eunApplyClip(EUN.clip); eunInfo(); }
// «из другой анимации»: окно со списком анимаций и их кадров — клик по кадру — вставить его копией после текущего (или в новую анимацию)
function eunFromOpen(cb) {
  EUN.fromCb = cb; edEl('eunFromAll').hidden = true; const dlg = edEl('eunFrom'), sel = edEl('eunFromClip'); sel.innerHTML = ''; for (const [g, L] of eunGroups()) { if (!L.length) continue; const og = document.createElement('optgroup'); og.label = g; for (const n of L) { const o = document.createElement('option'); o.value = n; o.textContent = eunLabel(n); og.append(o); } sel.append(og); }
  sel.value = EUN.clip; eunFromShow(); dlg.hidden = false;
}
function eunFromShow() {
  const n = edEl('eunFromClip').value, box = edEl('eunFromFrames'); box.innerHTML = ''; (CL[n] ? CL[n].frames : []).forEach((f, i) => { const s = SP[f[1]], c = cut[f[1]]; if (!s || !c) return; const b = document.createElement('button'); b.type = 'button'; b.className = 'eunf'; const cv = document.createElement('canvas'), k = Math.max(1, Math.floor(72 / Math.max(s[3], s[4]))); cv.width = s[3] * k; cv.height = s[4] * k; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 1, 1, s[3], s[4], 0, 0, cv.width, cv.height); b.append(cv);
    const t = document.createElement('span'); t.textContent = i + 1; b.append(t); b.addEventListener('click', () => { edEl('eunFrom').hidden = true; EUN.fromCb && EUN.fromCb(f[1]); }); box.append(b); });
}
function eunPixelsLike(src, like) {   // пиксели кадра src в рамке кадра like (по точке привязки)
  const s = SP[src], t = SP[like], ws = eunWork(src), out = new Uint8ClampedArray(t[3] * t[4] * 4), ox = Math.round(t[5] - s[5]), oy = Math.round((t[4] - t[6]) - (s[4] - s[6]));
  for (let y = 0; y < s[4]; y++) for (let x = 0; x < s[3]; x++) { const X = x + ox, Y = y + oy; if (X < 0 || Y < 0 || X >= t[3] || Y >= t[4]) continue; const i = (y * s[3] + x) * 4, j = (Y * t[3] + X) * 4; for (let k = 0; k < 4; k++) out[j + k] = ws.px[i + k]; }
  return out;
}
// ---------- новая анимация ----------
async function eunNewAnim() {   // v262: по умолчанию — копия той, что открыта (её и смотрел); после создания — сразу в ней
  const cur = EUN.clip, curName = cur ? eunLabel(cur) : '';
  const r = await edAsk('Новая анимация. Название:', { input: cur ? curName + ' (копия)' : 'Новая', buttons: [['empty', 'Пустая'], ['other', 'Копия другой…'], ['copy', cur ? 'OK — копия «' + curName + '»' : 'OK', true]] });
  if (!r.ok) return; const name = (r.value || '').trim().slice(0, 40); if (!name) { edMsg('Нужно название', true); return; }
  const id = 'User_' + Date.now().toString(36), make = list => { EUN.clip = id; clipDef(id, { len: list.reduce((a, f) => a + f.d, 0), frames: [], title: name, group: 'user', user: true }); EUN.lists[id] = list; eunApplyClip(id); eunListUI(); eunOpen(id); edMsg('Открыта новая анимация «' + name + '» — рисуй; потом «Сохранить»', true); };
  const copyOf = src => make(eunList(src).map(f => ({ s: eunNewSprite(f.s, eunWork(f.s).px), d: f.d })));
  if (r.btn === 'empty' || !cur) { const like = eunCur() || 'RobotStay_0'; EUN.clip = id; make([{ s: eunNewSprite(like), d: 0.1 }]); return; }
  if (r.btn === 'copy') { copyOf(cur); return; }
  eunFromOpen(() => copyOf(edEl('eunFromClip').value)); edEl('eunFromNote').textContent = 'Выбери анимацию — «Взять всю анимацию» (или клик по любому её кадру): все кадры станут копиями в новой'; edEl('eunFromAll').hidden = false;
}
// ---------- отрисовка ----------
function eunDraw() {
  const cv = edEl('eunCv'), n = eunCur(), w = n && eunWork(n); if (!cv) return; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  if (!w) { x.clearRect(0, 0, cv.width, cv.height); return; }
  const box = cv.parentElement, z = Math.max(2, Math.min(24, Math.floor(Math.min((box.clientWidth - 16) / w.w, (box.clientHeight - 16) / w.h)))); EUN.zoom = z;
  if (cv.width !== w.w * z || cv.height !== w.h * z) { cv.width = w.w * z; cv.height = w.h * z; }
  for (let yy = 0; yy < w.h; yy++) for (let xx = 0; xx < w.w; xx++) { x.fillStyle = (xx + yy) % 2 ? '#2a3a42' : '#22313a'; x.fillRect(xx * z, yy * z, z, z); }
  const fr = eunFrames();
  if (EUN.onion && fr.length > 1) for (const [k, tint] of [[-1, '255,80,60'], [1, '70,150,255']]) { const nm = fr[(EUN.i + k + fr.length) % fr.length]; if (nm === n) continue; const o = eunWork(nm); if (!o || o.w !== w.w || o.h !== w.h) continue;
    for (let yy = 0; yy < o.h; yy++) for (let xx = 0; xx < o.w; xx++) if (o.px[(yy * o.w + xx) * 4 + 3]) { x.fillStyle = 'rgba(' + tint + ',0.28)'; x.fillRect(xx * z, yy * z, z, z); } }
  x.drawImage(eunCanvas(w), 0, 0, w.w * z, w.h * z);
  if (z >= 6) { x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = 1; x.beginPath(); for (let i = 1; i < w.w; i++) { x.moveTo(i * z + 0.5, 0); x.lineTo(i * z + 0.5, w.h * z); } for (let i = 1; i < w.h; i++) { x.moveTo(0, i * z + 0.5); x.lineTo(w.w * z, i * z + 0.5); } x.stroke(); }
  const s = SP[n]; x.strokeStyle = 'rgba(255,206,70,0.8)'; x.beginPath(); const px = s[5] * z, py = (s[4] - s[6]) * z; x.moveTo(px - 6, py); x.lineTo(px + 6, py); x.moveTo(px, py - 6); x.lineTo(px, py + 6); x.stroke();   // точка привязки
  if (EUN.hover && EUN.tool !== 'fill' && EUN.tool !== 'pick') { const r = EUN.size, o = Math.floor((r - 1) / 2); x.strokeStyle = '#fff'; x.strokeRect((EUN.hover[0] - o) * z + 0.5, (EUN.hover[1] - o) * z + 0.5, r * z - 1, r * z - 1); }
}
function eunPreview(ts) {
  const cv = edEl('eunPv'); if (!cv || !EUN.clip || edEl('edUnits').hidden || !CL[EUN.clip]) return; const c = CL[EUN.clip], dt = Math.min(0.1, ((ts || 0) - (EUN.last || ts || 0)) / 1000); EUN.last = ts;
  if (EUN.play) { EUN.t += dt * (EUN.speed || 1); if (EUN.t >= c.len) EUN.t %= Math.max(0.0001, c.len); }
  let nm = c.frames[0][1]; for (const f of c.frames) if (f[0] <= EUN.t + 1e-6) nm = f[1];
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#13212a'; x.fillRect(0, 0, cv.width, cv.height); const s = SP[nm], im = cut[nm]; if (!s || !im) return;
  const k = Math.max(1, Math.floor(Math.min((cv.width - 8) / s[3], (cv.height - 18) / s[4]))), gx = cv.width / 2, gy = cv.height - 10; x.fillStyle = '#2a3a42'; x.fillRect(0, gy, cv.width, 1);
  x.drawImage(im, 1, 1, s[3], s[4], Math.round(gx - s[5] * k), Math.round(gy - s[4] * k), s[3] * k, s[4] * k);
}
function eunStrip() {
  const box = edEl('eunFrames'); if (!box) return; const fr = eunFrames(); if (box.childElementCount !== fr.length) { box.innerHTML = ''; fr.forEach((n, i) => { const b = document.createElement('div'); b.className = 'eunf'; b.dataset.i = i; b.append(document.createElement('canvas'), document.createElement('span')); box.append(b); }); }
  [...box.children].forEach((b, i) => { const n = fr[i], w = eunWork(n), c = b.querySelector('canvas'), k = Math.max(1, Math.floor(64 / Math.max(w.w, w.h))); c.width = w.w * k; c.height = w.h * k; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(eunCanvas(w), 0, 0, c.width, c.height);
    b.dataset.i = i; b.classList.toggle('act', i === EUN.i); b.classList.toggle('dirty', EUN.dirty.has(n)); b.querySelector('span').textContent = (i + 1) + (EUN.dirty.has(n) ? ' •' : FRAMEOV[n] ? ' ✎' : ''); b.title = n + ' · тянуть — переставить'; });
}
function eunInfo() {
  const n = eunCur(), s = n && SP[n], f = eunList()[EUN.i], nd = EUN.dirty.size + EUN.dclip.size;
  edEl('eunInfo').textContent = n ? 'кадр ' + (EUN.i + 1) + ' из ' + eunFrames().length + ' · ' + s[3] + '×' + s[4] + (nd ? ' · не сохранено: ' + nd : '') : '';
  edEl('eunSave').disabled = !nd; edEl('eunReset').disabled = !(n && SP[n][0] !== '_user' && (FRAMEOV[n] || EUN.dirty.has(n)));
  if (f && document.activeElement !== edEl('eunDur')) edEl('eunDur').value = Math.round(f.d * 1000);
  const c = CL[EUN.clip]; edEl('eunClipReset').textContent = c && c.user ? 'Удалить анимацию' : 'Анимация как была'; edEl('eunClipReset').disabled = !(c && (c.user || EUN.dclip.has(EUN.clip) || (CLORIG[EUN.clip] && CL[EUN.clip] !== CLORIG[EUN.clip])));
}
function eunTool(t) { if (t === 'pick' && EUN.tool !== 'pick') EUN.prevTool = EUN.tool; EUN.tool = t; document.querySelectorAll('#edUnits [data-ut]').forEach(b => b.classList.toggle('act', b.dataset.ut === t)); }
function eunListUI() {
  const box = edEl('eunList'); box.innerHTML = ''; for (const [g, L] of eunGroups()) { if (!L.length && g !== 'Мои анимации') continue; const h = document.createElement('div'); h.className = 'edh'; h.textContent = g; box.append(h);
    for (const n of L) { const b = document.createElement('button'); b.type = 'button'; b.dataset.clip = n; b.textContent = eunLabel(n) + (EUN.dclip.has(n) ? ' •' : ''); b.title = n + ' · кадров ' + CL[n].frames.length; b.addEventListener('click', () => eunOpen(n)); box.append(b); } }
  document.querySelectorAll('#eunList [data-clip]').forEach(b => b.classList.toggle('act', b.dataset.clip === EUN.clip));
}
function eunOpen(n, keep) { EUN.clip = n; if (!keep) { EUN.i = 0; EUN.t = 0; EUN.play = true; } document.querySelectorAll('#eunList [data-clip]').forEach(b => b.classList.toggle('act', b.dataset.clip === n)); { const a = document.querySelector('#eunList [data-clip].act'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' }); } edEl('eunName').textContent = eunLabel(n); edEl('eunName').title = n; edEl('eunFrames').innerHTML = ''; eunShow(); eunPal(); }
function eunShow() { eunStrip(); eunInfo(); eunDraw(); edEl('eunPlay').textContent = EUN.play ? '❚❚' : '▶'; edEl('eunOnion').classList.toggle('act', EUN.onion); }
function eunSize(v) { EUN.size = Math.max(1, Math.min(4, v)); document.querySelectorAll('#edUnits [data-us]').forEach(b => b.classList.toggle('act', +b.dataset.us === EUN.size)); }
// ---------- мышь, клавиши ----------
function eunAt(e) { const cv = edEl('eunCv'), r = cv.getBoundingClientRect(), n = eunCur(), w = n && EUN.work[n]; if (!w) return null; const x = Math.floor((e.clientX - r.left) / r.width * w.w), y = Math.floor((e.clientY - r.top) / r.height * w.h); return x < 0 || y < 0 || x >= w.w || y >= w.h ? null : [x, y]; }
function eunMouse() {
  const cv = edEl('eunCv'); cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => { if (e.button !== 0 && e.button !== 2) return; e.preventDefault(); const p = eunAt(e), n = eunCur(), w = n && eunWork(n); if (!p || !w) return; EUN.play = false;
    if (EUN.tool === 'pick') { eunPick(w, p[0], p[1], e.button); eunShow(); return; }
    const col = eunPaintCol(e.button); eunSnapPx(n); if (EUN.tool === 'fill') { eunFill(w, p[0], p[1], col); eunTouch(n); eunDraw(); return; }
    EUN.drawing = { n, last: p, col }; eunDab(w, p[0], p[1], col); eunDraw(); });
  addEventListener('mousemove', e => { if (edEl('edUnits').hidden) return; const p = e.target === cv ? eunAt(e) : null; EUN.hover = p; const D = EUN.drawing;
    if (D && p) { const w = EUN.work[D.n]; eunLine(w, D.last[0], D.last[1], p[0], p[1], D.col); D.last = p; } if (D || p || EUN.hoverWas) eunDraw(); EUN.hoverWas = !!p; });
  addEventListener('mouseup', () => { const D = EUN.drawing; if (!D) return; EUN.drawing = null; eunTouch(D.n); eunDraw(); });
  // кадры: клик — выбрать, тянуть — переставить
  const strip = edEl('eunFrames');
  strip.addEventListener('mousedown', e => { const b = e.target.closest('.eunf'); if (!b || e.button !== 0) return; e.preventDefault(); EUN.fdrag = { from: +b.dataset.i, x: e.clientX, moved: false }; });
  addEventListener('mousemove', e => { const D = EUN.fdrag; if (!D) return; if (Math.abs(e.clientX - D.x) > 6) D.moved = true; if (!D.moved) return; const kids = [...strip.children]; let to = kids.length - 1;
    for (let k = 0; k < kids.length; k++) { const r = kids[k].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { to = k > D.from ? k - 1 : k; break; } }
    D.to = to; kids.forEach((el, k) => { el.classList.toggle('drag', k === D.from); el.classList.toggle('dropL', D.moved && k === to && to < D.from); el.classList.toggle('dropR', D.moved && k === to && to > D.from); }); });
  addEventListener('mouseup', () => { const D = EUN.fdrag; if (!D) return; EUN.fdrag = null; [...strip.children].forEach(el => el.classList.remove('drag', 'dropL', 'dropR'));
    if (!D.moved) { EUN.i = D.from; EUN.play = false; eunShow(); } else if (D.to !== undefined) { eunMove(D.from, D.to); edMsg('Кадр переставлен (Ctrl+Z — вернуть)'); } });
  addEventListener('keydown', e => { if (edEl('edUnits').hidden || !edEl('eunFrom').hidden || (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); e.stopImmediatePropagation(); eunUndo(e.code === 'KeyY' || e.shiftKey); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return; const k = { KeyB: 'pen', KeyE: 'erase', KeyG: 'fill', KeyI: 'pick' }[e.code];
    if (k) { eunTool(k); e.stopImmediatePropagation(); } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') { eunSize(EUN.size + (e.code === 'BracketRight' ? 1 : -1)); e.stopImmediatePropagation(); }
    else if (e.code === 'KeyX') { edEl('eunSwap').click(); e.stopImmediatePropagation(); }
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { const L = eunFrames().length; EUN.i = (EUN.i + (e.code === 'ArrowRight' ? 1 : -1) + L) % L; EUN.play = false; eunShow(); e.preventDefault(); e.stopImmediatePropagation(); }
    else if (e.code === 'Space') { EUN.play = !EUN.play; eunShow(); e.preventDefault(); e.stopImmediatePropagation(); } }, true);
}
// ---------- сохранить / как было ----------
async function eunSave() {
  const btn = edEl('eunSave'); btn.disabled = true; let nf = 0, nc = 0; const L = animLocal(), FL = frameLocal(), slug = n => n.replace(/[^\w]/g, '_');
  try {
    for (const name of [...EUN.dirty]) { const c = eunCanvas(EUN.work[name]), s = SP[name], own = s[0] === '_user'; let src;
      if (ED.db && ED.assets) { const blob = await new Promise(r => c.toBlob(r, 'image/png')); src = (await ED.assets.upload(blob, { type: 'image/png' })).id;
        await ED.db.collection('lib').doc((own ? 'sp_' : 'fr_') + slug(name)).set(own ? { kind: 'sprite', sprite: name, w: s[3], h: s[4], px: s[5], py: s[6], ppu: s[7], asset: src, at: new Date().toISOString() } : { kind: 'frame', sprite: name, asset: src, at: new Date().toISOString() }); }
      else { src = c.toDataURL('image/png'); if (own) L.sprites[name] = { w: s[3], h: s[4], px: s[5], py: s[6], ppu: s[7], src }; else FL[name] = src; }
      FRAMEOV[name] = src; EUN.dirty.delete(name); nf++; }
    for (const n of [...EUN.dclip]) { const c = CL[n], doc = { kind: 'clip', clip: n, frames: c.frames.map(f => ({ t: f[0], s: f[1] })), len: c.len, title: c.title || null, group: c.group || null, user: !!c.user, at: new Date().toISOString() };
      if (ED.db) await ED.db.collection('lib').doc('cl_' + slug(n)).set(doc); else L.clips[n] = doc;   /* кадры — {t, s}: вложенные массивы хранилище не берёт */
      EUN.dclip.delete(n); nc++; }
    if (!ED.db) { if (!animLocal(L) || !frameLocal(FL)) throw new Error('в браузере нет места'); }
    edMsg('Сохранено: кадров ' + nf + ', анимаций ' + nc + (ED.db ? ' — в общей библиотеке, игра их берёт' : ' — в этом браузере'));
  } catch (e) { edMsg('Не сохранилось: ' + (e && (e.code || e.message) || e), true); }
  eunListUI(); eunShow();
}
async function eunReset() {
  const n = eunCur(); if (!n || !await edSure('Вернуть этот кадр как было в листе?', 'Вернуть')) return;
  try { if (ED.db && FRAMEOV[n] && !String(FRAMEOV[n]).startsWith('data:')) await ED.db.collection('lib').doc('fr_' + n.replace(/[^\w]/g, '_')).delete(); const L = frameLocal(); if (L[n]) { delete L[n]; frameLocal(L); } } catch (e) {}
  frameApply(n, null); EUN.dirty.delete(n); delete EUN.work[n]; eunShow(); eunPal(); edMsg('Кадр — как в листе');
}
async function eunClipReset() {
  const n = EUN.clip, c = CL[n]; if (!c) return; const user = !!c.user; if (!await edSure(user ? 'Удалить анимацию «' + eunLabel(n) + '»?' : 'Вернуть порядок и длительность кадров «' + eunLabel(n) + '» как было?', user ? 'Удалить' : 'Вернуть')) return;
  try { if (ED.db) await ED.db.collection('lib').doc('cl_' + n.replace(/[^\w]/g, '_')).delete(); const L = animLocal(); if (L.clips[n]) { delete L.clips[n]; animLocal(L); } } catch (e) {}
  EUN.dclip.delete(n); delete EUN.lists[n]; clipDef(n, null); eunListUI(); const g = eunGroups(); eunOpen(user ? (g[1][1].find(k => /RunFastR$/.test(k)) || g[1][1][0]) : n); edMsg(user ? 'Анимация удалена' : 'Анимация — как была');
}
function eunBoilBtn(all) {
  const k = Number(edEl('eunBoilK').value) / 100, list = all ? [...new Set(eunFrames())] : [eunCur()]; let seed = Math.floor(Math.random() * 1e5);
  for (const n of list) { const w = eunWork(n); eunSnapPx(n); eunBoil(w, k, seed++); eunTouch(n); } eunDraw(); edMsg(all ? 'Живая линия — на всех кадрах (у каждого свой узор)' : 'Живая линия — на кадре');
}
function eunInit() {
  eunListUI(); eunMouse(); eunColorInit(); eunSize(1); eunTool('pen');
  document.querySelectorAll('#edUnits [data-ut]').forEach(b => b.addEventListener('click', () => eunTool(b.dataset.ut)));
  document.querySelectorAll('#edUnits [data-us]').forEach(b => b.addEventListener('click', () => eunSize(+b.dataset.us)));
  edEl('eunOnion').addEventListener('click', () => { EUN.onion = !EUN.onion; eunShow(); });
  edEl('eunUndo').addEventListener('click', () => eunUndo(false)); edEl('eunRedo').addEventListener('click', () => eunUndo(true));
  edEl('eunPlay').addEventListener('click', () => { EUN.play = !EUN.play; eunShow(); });
  edEl('eunSpeed').addEventListener('input', e => { EUN.speed = Number(e.target.value); edEl('eunSpeedv').textContent = '×' + e.target.value; });
  edEl('eunDur').addEventListener('change', e => eunDur(Number(e.target.value)));
  edEl('eunSave').addEventListener('click', eunSave); edEl('eunReset').addEventListener('click', eunReset); edEl('eunClipReset').addEventListener('click', eunClipReset);
  edEl('eunBoil1').addEventListener('click', () => eunBoilBtn(false)); edEl('eunBoilAll').addEventListener('click', () => eunBoilBtn(true));
  edEl('eunAddE').addEventListener('click', eunAddEmpty); edEl('eunAddC').addEventListener('click', eunAddCopy); edEl('eunAddT').addEventListener('click', eunTween); edEl('eunDel').addEventListener('click', eunRemove);
  edEl('eunAddF').addEventListener('click', () => { edEl('eunFromNote').textContent = 'Клик по кадру — вставить его копией после текущего (по точке привязки)'; eunFromOpen(src => { const like = eunCur(); eunInsert(eunNewSprite(like, eunPixelsLike(src, like)), EUN.i + 1); edMsg('Кадр из другой анимации — вставлен копией'); }); });
  edEl('eunFromClip').addEventListener('change', eunFromShow); edEl('eunFromAll').addEventListener('click', () => { edEl('eunFrom').hidden = true; EUN.fromCb && EUN.fromCb(null); }); edEl('eunFromX').addEventListener('click', () => { edEl('eunFrom').hidden = true; });
  edEl('eunNew').addEventListener('click', eunNewAnim);
  addEventListener('resize', () => { if (!edEl('edUnits').hidden) eunDraw(); });
  const loop = ts => { eunPreview(ts); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
}
function eunShowTab(on) { edEl('edUnits').hidden = !on; if (on) { eunListUI(); if (!EUN.clip || !CL[EUN.clip]) { const g = eunGroups(); eunOpen(g[1][1].find(n => /RunFastR$/.test(n)) || g[1][1][0]); } else eunShow(); eunColorUI(); } }
function frameHook(name) { if (EUN.drawing || EUN.dirty.has(name) || EUN.inTouch) return; if (EUN.work[name]) { delete EUN.work[name]; if (!edEl('edUnits').hidden && eunFrames().includes(name)) eunShow(); } }   /* пришёл перерисованный кадр — рабочая копия заново */
// запуск редактора — последним файлом: все части (00_editor, 10_props, …) уже объявлены
edBoot();
