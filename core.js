'use strict';
/* Something Strange — браузерная пересборка прототипа.
   Весь код написан заново; графика, анимации и звук взяты из сборки 0.0.5. */
/* v243: общей обёртки (() => { … })() больше нет — сборка пишет ядро (dist/core.js) и игру (dist/game.js) двумя скриптами
   с общими именами верхнего уровня; 'use strict' ставит сборщик в начало каждого (tools/build.py). */
const GRK_VER = 'v313';   // v243: номер версии — здесь одном месте (журнал P, файл карты, ?v= картинок); в index.html и editor.html ?v= меняется отдельно
const D = window.GAME_DATA;

// ====================== НАСТРОЙКИ (можно менять) ======================
const CFG = {
  gravity: 9.81,
  moveSlow: 2,          // скорость шага (из оригинала)
  moveFast: 4.2,        // скорость бега после разгона (в оригинале 3)
  fastDelay: 0.9,       // сколько секунд герой идёт шагом, прежде чем начать разгон
  accelTime: 0.6,       // за сколько секунд он разгоняется до бега
  finaleAfter: 720,     // через сколько секунд на уровне начинается облава
  jumpImpulse: 3,       // начальная скорость прыжка
  jumpHoldAccel: 6,     // добавка, пока держишь прыжок
  jumpHoldTime: 0.6,   // сколько секунд можно держать
  // v299 (Алексей 25.10: «первоначальный прыжок меньше и приземистее, а то летаешь как Карлсон»): прыжок с земли — как в Celeste / Hollow Knight:
  // быстрый взлёт, короткое зависание, тяжёлое падение. Нажал — ~0.45 куба, держишь — ~0.9 (было 0.64 и 1.13 за 0.8 с в воздухе)
  jumpImpulseG: 4.2, jumpHoldAccelG: 13, jumpHoldTimeG: 0.26, jumpRiseG: 2.0,   // v300: держать — ~1.0 (было 1.15); высокие уступы берутся руками за край
  rotSpeed: 150,        // градусов в секунду при повороте мира (в оригинале 90)
  viewHalfHeight: 3.95,    // половина высоты экрана в игровых единицах
  doubleJump: 3.3,      // скорость второго прыжка в воздухе
  coyote: 0.09,         // сколько секунд после схода с края ещё можно прыгнуть
  jumpBuffer: 0.12,     // нажатие прыжка чуть раньше приземления засчитывается
  heroHP: 5,
  robotHP: 110,          // в оригинале 100
  hitDamage: 10,
  kunaiDamage: 28,       // v297: было 20
  kunaiSpeed: 17,        // v297: было 7 — теперь летит прямо и далеко
  kunaiMax: 3,          // сколько кунаев у героя
  kunaiRegen: 4,        // через сколько секунд возвращается кунай, улетевший за карту
  hookSpeed: 20,        // скорость полёта крюка
  hookRange: 4,         // на сколько кубов летит крюк (дальше — и с балконов можно было бы зацепиться за крышу в обход хода)
  hookPull: 9,          // с какой скоростью крюк тянет
  buckAfter: 4,         // через сколько секунд робот стряхивает героя со спины
  walkBase: 0.9,        // с какой скоростью лес плывёт мимо всё время (кубов в секунду)
  walkSpeed: 2.6,       // на сколько быстрее он бежит, пока эта нога поднята и летит вперёд
  stepTime: 7.5,  stride: 7,        // секунд на один шаг: нога стоит, поднимается, идёт вперёд и обрушивается вниз
  stepLift: 2.6,
  legGap: 24,           // расстояние между осями ног        // на сколько кубов нога поднимается над землёй
  critSide: 2,          // множитель урона по роботу сбоку
  critBack: 3,          // множитель урона в спину
  robotTurnDelay: 0.3,  // сколько секунд после поворота мира робот не замечает героя
  robotTurnSpeed: 220,  // градусов в секунду, когда робот разворачивается
};

// ====================== УРОВЕНЬ ======================
// Куб занимает клетку (x, z) по горизонтали и высоту от y до y+1.
const cubes = new Map();
const ckey = (x, y, z) => x + ',' + y + ',' + z;
function addCube(x, y, z, kind) { cubes.set(ckey(x, y, z), { x, y, z, kind }); }
const hasCube = (x, y, z) => cubes.has(ckey(x, y, z));

const RING = [[-2,2],[-1,2],[0,2],[1,2],[2,2],[2,1],[2,0],[2,-1],[2,-2],[1,-2],[0,-2],[-1,-2],[-2,-2],[-2,-1],[-2,0],[-2,1]];
const LEVEL = { towerTop: 0, robots: [], start: { x: -4, y: 2, z: 9 }, door: null, eye: null };

// Уровень — нога огромного робота: столб 15x15 кубов на ступне 19x19, уходит вверх за край экрана.
// Вокруг столба винтом идут уступы: по каждой стороне поднимаются слева направо, на углу путь заворачивает на следующую сторону.
// Выход — дверь посередине седьмой стороны. По дороге две пары сквозных дверей: открытая ведёт на балкон с ключом,
// запертая — на балкон с паровым клапаном, который срезает почти целый виток.
function buildLevel(noFaces) {   // v241: noFaces — грани не строить (их строит mapLoad после записи в файл)
  cubes.clear(); LEVEL.carved = new Set();
  // всё, кроме самого столба ноги и ступни, раскладывается заново при каждом новом запуске игры (не при смерти): по зерну
  const seed = LEVEL.forceSeed !== undefined && LEVEL.forceSeed !== null ? LEVEL.forceSeed : Math.floor(Math.random() * 1e9); LEVEL.seed = seed;
  const R = rng(seed + 17), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), chance = p => R() < p, shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const box = (x0, x1, y0, y1, z0, z1, kind) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) addCube(x, y, z, kind); };
  const H = 33;                            // высота двери-выхода
  box(-8, 8, -4, 1, -8, 8, 'ledge');       // ступня: подошва в шесть блоков, низ уходит в заросли
  const SHIN = 10; LEVEL.shinTop = SHIN;   // нога ступенями: тонкая голень (9 кубов), колено, широкое бедро (15) — до таза
  box(-4, 4, 2, SHIN, -4, 4, 'core');      // голень
  box(-7, 7, SHIN + 1, H + 14, -7, 7, 'core');    // бедро: выше выхода оно просто продолжается
  // таз титана — общий блок над обеими ногами: с высоты H-1 он тянется от этой ноги через промежуток и накрывает вторую ногу.
  // Низ ровный. В восточной стене, посередине между ногами, — ниша с дверью
  LEVEL.pelY = H - 1;
  for (let zz = 8; zz <= 31; zz++) for (let x = -7; x <= 7; x++) for (let y = H - 1; y <= H + 14; y++) {
    if (x >= 6 && zz >= 11 && zz <= 13 && y >= H + 5 && y <= H + 7) { LEVEL.carved.add(ckey(x, y, -zz)); continue; }   // ниша: настоящая выемка на два куба вглубь
    addCube(x, y, -zz, 'core'); const c = cubes.get(ckey(x, y, -zz)); if (zz > 16) c.br2 = true; else c.br = true; }
  // Торс титана по концепту: корпус шире обеих ног, ступенчатый, с наростами плит и окнами; по бокам — плечевые модули с дисками-шарнирами,
  // под ними висят руки (рисуются отдельно, см. руки титана); наверху кабина с надстройками. Ноги — единица масштаба: торс ~3 ширины ноги.
  { const B0 = H + 15, B1 = B0 + 22; LEVEL.torsoY = [B0, B1]; LEVEL.newBody = true;
    const TR = rng(seed + 991), tri = (a, b) => a + Math.floor(TR() * (b - a + 1));
    const tor = (x, y, z, kind = 'core') => { if (hasCube(x, y, z)) return; addCube(x, y, z, kind); const c = cubes.get(ckey(x, y, z)); c.torso = true; if (-z > 16) c.br2 = true; else if (z < 8) c.br = true; };
    const shell = (x0, x1, y0, y1, z0, z1, kind) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x - x0 < 2 || x1 - x < 2 || z - z0 < 2 || z1 - z < 2 || y - y0 < 1 || y1 - y < 2) tor(x, y, z, kind); };
    shell(-9, 9, B0, B0 + 3, -29, 5);                  // пояс: чуть уже груди
    shell(-11, 11, B0 + 4, B1, -36, 12);               // грудь
    shell(-9, 9, B1 + 1, B1 + 2, -30, 6);              // ступень плеч
    for (const zc of [16.5, -40.5]) { const z0 = Math.round(zc - 3.5), z1 = Math.round(zc + 3.5); shell(-8, 8, B0 + 6, B1 - 1, z0, z1); }   // плечевые модули
    LEVEL.shoulders = [{ z: 17, y: B0 + 13, side: 1 }, { z: -41, y: B0 + 13, side: -1 }];
    shell(-6, 6, B1 + 3, B1 + 7, -19, -5);              // кабина: здесь будет мозг
    for (const [x, z] of [[-4, -24], [4, 0], [0, -28]]) for (let y = B1 + 3; y <= B1 + 4 + tri(0, 2); y++) tor(x, y, z);   // надстройки на крыше
    // наросты плит: прямоугольные выступы на куб на всех четырёх гранях груди — рельеф как на концепте
    for (let n = 0; n < 70; n++) { const f = tri(0, 3), w = tri(2, 5), h = tri(2, 4), y0 = tri(B0 + 4, B1 - h);
      if (f < 2) { const x = f ? 12 : -12, z0 = tri(-36, 12 - w); for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + w; z++) tor(x, y, z); }
      else { const z = f === 2 ? 13 : -37, x0 = tri(-11, 11 - w); for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) tor(x, y, z); } }
    // карнизы с мхом вдоль груди: по ним потом пройдёт путь наверх
    for (let k = 0; k < 4; k++) { const y = B0 + 6 + k * 4; for (const x of [-12, 12]) { const z0 = tri(-30, -5), z1 = z0 + tri(4, 9); for (let z = z0; z <= z1; z++) tor(x + Math.sign(x), y, z, 'ledge'); } }
    // парящие площадки вокруг: между ногой и рукой, у плеч и над тазом
    for (const [x, y, z] of [[9, 25, 11], [10, 30, 12], [9, 35, 11], [-9, 27, 11], [-10, 32, 12], [9, 40, 10], [-9, 43, 10], [10, 46, -12], [-10, 50, -14], [9, 22, -45], [-9, 28, -44]]) for (let d = -1; d <= 1; d++) tor(x, y, z + d, 'plat');
  }
  // клетка дорожки вокруг столба: сторона f (0 юг, 1 восток, 2 север, 3 запад), t от -8 до 8 вдоль стороны слева направо
  const lane = (f, t) => [[t, 8], [8, -t], [-t, -8], [-8, t]][f % 4];
  const PR = 7.95, P3 = (f, t, y, r = PR) => { const c = [[t, r], [r, -t], [-t, -r], [-r, t]][f % 4]; return [c[0], y, c[1]]; };
  LEVEL.path = []; LEVEL.stairs = []; LEVEL.walkways = []; LEVEL.traps = []; LEVEL.spawn = null; LEVEL.soleBalc = null; LEVEL.tutor = null; LEVEL.pistons = []; LEVEL.cables = []; LEVEL.wsprites = []; LEVEL.wireClimbs = []; LEVEL.wruns = []; LEVEL.wires = []; LEVEL.pipes = []; LEVEL.ladders = []; LEVEL.robots = []; LEVEL.bits = []; LEVEL.crates = []; LEVEL.keys = []; LEVEL.vents = []; LEVEL.rings = []; LEVEL.doors = []; LEVEL.steams = []; LEVEL.lamps = []; LEVEL.fires = []; LEVEL.lifts = []; LEVEL.gears = [];
  const freeCol = (f, t, y0, y1) => { const c = lane(f, t); for (let y = y0; y <= y1; y++) if (hasCube(c[0], y, c[1])) return false; return true; };
  const put = (f, a, b, top, kind, r) => { for (let t = a; t <= b; t++) { const c = P3(f, t, 0, r || 8); addCube(c[0], top - 1, c[2], kind); } };
  const lamp = (f, t, y, len) => { const c = lane(f, t); LEVEL.lamps.push({ x: c[0], y, z: c[1], f: f % 4, len, th: 0.25 * Math.sin(f * 2.1 + t), om: 0, bob: 0, bv: 0, ph: f * 1.7 + t }); };
  // ступня: обходчики (один-два идут навстречу остальным), ящики, осколки
  { const CW = [[1, 0], [0, -1], [-1, 0], [0, 1]], faces = shuf([0, 1, 2, 3]), LV = game.level || 1, n = Math.min(6, ri(3, 4) + Math.floor((LV - 1) / 2));
    for (let i = 0; i < n; i++) { const g = faces[i % 4], t = g === 0 ? ri(1, 6) : ri(-6, 6), c = P3(g, t, 2, 8), ccw = i === n - 1 || (i === 1 && chance(0.3));
      LEVEL.robots.push({ x: c[0], y: 2, z: c[2], h: ccw ? [-CW[g][0], -CW[g][1]] : CW[g], R: 9, F: 7.5, loop: true, ccw }); }
    for (let i = 0, n2 = ri(2, 4); i < n2; i++) { const g = ri(0, 3), t = g === 0 ? ri(2, 8) : ri(-8, 8), c = P3(g, t, 2, 8); if (!LEVEL.crates.some(q => Math.abs(q.x - c[0]) + Math.abs(q.z - c[2]) < 2)) LEVEL.crates.push({ x: c[0], y: 2, z: c[2] }); }
    for (const cn of shuf([[8, -8], [-8, -8], [8, 8], [-8, 8]]).slice(0, 2)) LEVEL.bits.push({ x: cn[0], y: 2.45, z: cn[1] });
    for (let g = 0; g < 4; g++) { const c = P3(g, ri(-6, 6), 0, 8); LEVEL.lamps.push({ x: c[0], y: 5.2, z: c[2], f: g, len: 1.3 + R() * 0.3, th: 0.2, om: 0, bob: 0, bv: 0, ph: g * 1.3 }); } }
  // винтовой путь: на каждой стороне пять уступов поднимают на пять кубов; где подъём на два куба — лестница
  const genSide = last => { for (let tr = 0; tr < 600; tr++) {   // три широких уступа с одной лестницей или четыре узких без неё
      const four = !last && chance(0.4), nm = last ? 2 : four ? 4 : 3, rises = last ? [1, 1] : four ? [1, 1, 1, 1, 1] : shuf([1, 1, 2]).concat([1]), P = [[-8, -7, 0]]; let cur = -6, h = 0, ok = true;
      for (let i = 0; i < nm; i++) { const g = rises[i] === 2 ? 0 : ri(1, 2), w = last && i === nm - 1 ? 3 : four ? ri(1, 2) : ri(1, 3); cur += g; h += rises[i]; P.push([cur, cur + w - 1, h]); cur += w; }
      if (last) { if (cur > 6) ok = false; } else { const g3 = 7 - cur; if (g3 < 1 || g3 > 2) ok = false; else P.push([7, 8, 5]); }
      if (ok) return { P, rises }; }
    return last ? { P: [[-8, -7, 0], [-5, -3, 1], [-1, 1, 2]], rises: [1, 1] } : { P: [[-8, -7, 0], [-5, -3, 1], [0, 1, 2], [3, 5, 4], [7, 8, 5]], rises: [1, 1, 2, 1] }; };
  // Под каждым витком пути на той же грани — сплошная каменная перегородка во всю стену (на южной — под площадкой на 20).
  // Снизу сквозь неё не пройти: зоны разделены, попасть выше можно только обойдя ногу. Под перегородкой остаётся два ряда высоты
  // Нога разделена на три яруса двумя сплошными кольцами-площадками (верх на 13 и 23) — третий ярус кончается тазом.
  // Сквозь кольцо ведёт только запертая дверь: она стоит на пути под кольцом, а выводит на кольцо с другой стороны ноги; ключ лежит на этом же ярусе
  const RINGS = [13, 23], BANDS = [[14, 24], [14, 24], [14, 24], [14, 24]]; LEVEL.ringTops = RINGS;
  const liftCeil = y => { for (const r of RINGS) if (y < r - 1) return r - 5; return 99; }, ringCross = (ya, yb) => RINGS.some(r => yb >= r - 2 && ya < r);
  const gateSide = () => { const k = ri(0, 1); return { P: [[-8, -7, 0], [-5, -3, 1], [-1 + k, 2 + k, 2], [4 + k, 6, 3]], rises: [1, 1, 1], gate: true }; };
  const inBelt = (g, ya, yb) => BANDS[g % 4].some(B => yb > B - 4 && ya < B - 1);
  const SIDES = []; let liftSideDone = false;
  for (let f = 0; f < 6; f++) {
    const base = 3 + 5 * f, lifty = !LEVEL.noLiftSide && !liftSideDone && f === 5 && chance(0.3), gate = f === 1 || f === 3;
    // иногда сторону можно пройти только на лифтах: два широких уступа и две люльки между ними (такие цепи не рвутся)
    const G = lifty ? { P: [[-8, -7, 0], [-5, -1, 2], [1, 6, 5], [7, 8, 5]], rises: [9, 9, 0] } : gate ? gateSide() : genSide(false), P = G.P; SIDES.push({ base, P, rises: G.rises, lifty, gate });
    if (lifty) { liftSideDone = true; for (const q of [[-6, base, base + 2], [0, base + 2, base + 5]]) { const c = lane(f, q[0]); LEVEL.lifts.push({ x: c[0], z: c[1], f: f % 4, y0: q[1], y1: q[2], v: (f + q[0] + 8) % 4, safe: true }); } }
    P.forEach((q, i) => {
      if (f === 0 && i === 0 && hasCube(lane(f, q[0])[0], base + q[2] - 2, lane(f, q[0])[1])) { LEVEL.path.push({ f, a: q[0], b: P[1][0] - 1, top: base + q[2] - 1 }); return; }   // первый уступ лёг бы горбом на верх ступни — путь начинается прямо с пола
      const top = base + q[2]; put(f, q[0], q[1], top, 'ledge'); LEVEL.path.push({ f, a: q[0], b: q[1], top });
      if (f === 0 && i === 1 && LEVEL.path.length && LEVEL.path[LEVEL.path.length - 2].top === top - 2) LEVEL.ladders.push({ f, t: q[0] - 1, y0: top - 2.8, y1: top });   // с пола на первый уступ — тоже лестница
      else if (i > 0 && G.rises[i - 1] === 2) LEVEL.ladders.push({ f, t: q[0] - 1, y0: top - 2.8, y1: top });               // у подъёма на два куба — лестница
      if (i > 0 && i < P.length - 1 && q[1] - q[0] >= 1 && f < 6 && chance(Math.min(0.97, (0.5 + 0.1 * (game.level || 1)) * (0.8 + 0.09 * f)) * (q[1] - q[0] === 2 ? 1 : 0.45))) { const c = lane(f, q[1] - 1), d = lane(f, q[1]); LEVEL.robots.push({ x: c[0], y: top, z: c[1], h: [d[0] - c[0], d[1] - c[1]], R: 9, F: 7.5 }); }
      if (i > 0 && i < P.length - 1 && chance(0.7)) { const c = lane(f, q[1] + 1), nt = base + P[i + 1][2]; LEVEL.bits.push({ x: c[0], y: Math.max(top, nt) + 1.1 + R() * 0.5, z: c[1] }); }   // осколок над пролётом
    });
    if (f < 6) {                           // трубы, верёвка с флажками, лампы, пар
      { const wj = gate ? 2 : 3; LEVEL.wires.push({ f, a: P[1][1] + 0.4, ya: base + P[1][2] + 1.5, b: P[wj][0] - 0.4, yb: base + P[wj][2] + 1.3 }); }
      if (gate) { const c = lane(f, P[3][1]), c2 = lane(f, P[3][0]); LEVEL.crates.push({ x: c[0], y: base + 3, z: c[1] }); LEVEL.bits.push({ x: c2[0], y: base + 3.45, z: c2[1] }); }   // тупик под кольцом — с наградой

      const pi = ri(1, P.length - 2), pj = ri(1, P.length - 2);
      if (chance(0.55)) { const q = P[pi], left = chance(0.5), t = left ? q[0] - 0.5 : q[1] + 0.5, sg = left ? 1 : -1, c = lane(f, t), e = lane(f, t + sg), yy = base + q[2] + 0.38;   // пар вдоль уступа: с левого края вправо или с правого влево
        LEVEL.steams.push({ x: c[0], y: yy, z: c[1], dx: e[0] - c[0], dz: e[1] - c[1], ph: f * 1.3 + R() * 3, var: f }); LEVEL.pipes.push({ deco: true, pts: [P3(f, t - sg * 0.9, yy + 1.6, 7.4), P3(f, t - sg * 0.9, yy + 1.6), P3(f, t - sg * 0.9, yy), P3(f, t - sg * 0.05, yy)] }); }
      if (pj !== pi && chance(0.4 + 0.06 * f)) { const q = P[pj], tt = (q[0] + q[1]) / 2 + (chance(0.5) ? 0.4 : -0.4), c = lane(f, tt), yy = base + q[2] + 1.75, sg = chance(0.5) ? 1 : -1;   // пар сверху вниз
        LEVEL.steams.push({ x: c[0], y: yy, z: c[1], dx: 0, dz: 0, down: true, ph: f * 0.9 + R() * 3, var: f + 1 }); LEVEL.pipes.push({ deco: true, pts: [P3(f, tt + sg * 1.3, yy + 1.4, 7.4), P3(f, tt + sg * 1.3, yy + 1.4), P3(f, tt, yy + 1.4), P3(f, tt, yy + 0.05)] }); }
    }
    if (f > 0 && f < 6 && chance(0.25 + 0.07 * f)) { const q = P[ri(1, P.length - 2)]; if (q[1] > q[0]) { const c = lane(f, q[1]); LEVEL.fires.push({ x: c[0], y: base + q[2], z: c[1] }); } }   // костёр на уступе: перепрыгнуть или залить
    lamp(f, ri(-6, 6) + 0.5, base + 3.6 + ri(0, 1), 1.0 + R() * 0.5); if (f < 6 && chance(0.7)) lamp(f, ri(-5, 5) + 0.4, base + 6.6, 1.3);
  }
  for (let g = 0; g < 4; g++) for (const B of BANDS[g]) for (let t = -8; t <= 8; t++) { const c = lane(g, t); if (!hasCube(c[0], B - 2, c[1])) { addCube(c[0], B - 2, c[1], 'ledge'); cubes.get(ckey(c[0], B - 2, c[1])).slab = true; } }
  { const hit = o => { for (let g = 0; g < 4; g++) { const c = [o.x * FN0[g][0] + o.z * FN0[g][1], 0]; if (Math.abs(c[0] - 8) < 0.6 && BANDS[g].some(B => o.y > B - 3.2 && o.y < B - 0.9)) return true; } return false; }, FN0 = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (const k of ['lamps', 'steams', 'fires', 'bits']) LEVEL[k] = LEVEL[k].filter(o => !hit(o)); }
  LEVEL.gates = [];
  RINGS.forEach((r, n) => { const f = n === 0 ? 1 : 3, S = SIDES[f], q = S.P[2], y = S.base + q[2], g = (f + 2) % 4, t = ri(q[0] + 1, q[1] - 1), c = lane(f, t), d = lane(g, -t), n0 = LEVEL.doors.length;
    LEVEL.doors.push({ x: c[0], y, z: c[1], f: f % 4, to: n0 + 1, locked: true, gate: n + 1, sprL: 'door2', spr: 'door0', flip: true }, { x: d[0], y: r, z: d[1], f: g, to: n0, locked: true, gate: n + 1, sprL: 'door3', spr: 'door4', flip: true });
    LEVEL.gates.push({ n: n + 1, f, t, y, g, r }); });
  // с какой стороны от уступа свободна клетка под лестницу (в соседнем пролёте не должна стоять лестница пути)
  const sideLadder = (S, i) => S.rises[i - 1] !== 2 ? { t: S.P[i][0] - 1, dir: 1 } : S.rises[i] !== 2 ? { t: S.P[i][1] + 1, dir: -1 } : null;
  // рельеф ноги: наросты обшивки — блоки той же стены, выступающие на куб; на них можно стоять, сбоку нога перестаёт быть ровным столбом.
  // Коридор главного пути (уступы, пролёты между ними и место для прыжка) не занимаем
  { const reserved = new Set(), byS = {}; for (const q of LEVEL.path) (byS[q.f] = byS[q.f] || []).push(q);
    for (const f in byS) { const P = byS[f]; for (let i = 0; i < P.length; i++) { const q1 = P[i], q2 = P[i + 1] || q1, hi = Math.max(q1.top, q2.top), lo = Math.min(q1.top, q2.top); for (let t = q1.a - 1; t <= q2.b + 1; t++) for (let y = lo - 1; y <= hi + 2; y++) { const c = lane(+f, t); reserved.add(ckey(c[0], y, c[1])); } } }
    LEVEL.bulges = 0;
    for (let g = 0; g < 4; g++) for (let n = 0, tries = 0, want = ri(3, 5); n < want && tries < 80; tries++) { const w = ri(2, 4), h = ri(2, 5), a = ri(-6, 7 - w), y0 = ri(3, (g === 2 ? H - 8 : H - 3) - h); let ok = !inBelt(g, y0 + h - 0.1, y0 + h + 0.1) && !RINGS.some(r => y0 + h > r - 3 && y0 < r + 3) && !LEVEL.doors.some(d => d.f === g && d.y >= y0 - 3 && d.y <= y0 + h + 1 && [d.x, -d.z, -d.x, d.z][g] >= a - 2 && [d.x, -d.z, -d.x, d.z][g] <= a + w + 1);
      for (let t = a - 1; t <= a + w && ok; t++) for (let y = y0 - 1; y <= y0 + h + 2 && ok; y++) { const c = lane(g, t); if (hasCube(c[0], y, c[1]) || reserved.has(ckey(c[0], y, c[1])) || LEVEL.lifts.some(L => Math.abs(c[0] - L.x) + Math.abs(c[1] - L.z) < 1.6 && y > L.y0 - 2 && y < L.y1 + 4.5)) ok = false; }
      if (!ok) continue; for (let t = a; t < a + w; t++) for (let y = y0; y < y0 + h; y++) { const c = lane(g, t); addCube(c[0], y, c[1], 'core'); cubes.get(ckey(c[0], y, c[1])).bulge = true; } n++; LEVEL.bulges++; } }
  // второй ярус над витком на верхних сторонах: лестница, полки, парящая площадка, иногда робот
  for (const f of [0, 1, 3, 4, 5]) { if (SIDES[f].lifty) continue;
    const S = SIDES[f], q = S.P[2], T = S.base + q[2], L = sideLadder(S, 2); if (!L || ringCross(T + 1, T + 8)) continue;
    const span = (a, b) => { const lo = Math.max(-5, Math.min(a, b)), hi = Math.min(5, Math.max(a, b)); return hi - lo >= 1 ? [lo, hi] : null; };
    const clear = (sp, top) => { for (let t = sp[0]; t <= sp[1]; t++) if (!freeCol(f, t, top - 2, top + 1)) return false; return true; };
    const S1 = span(L.t + L.dir, L.t + L.dir * 3); if (!S1 || !clear(S1, T + 5)) continue;
    LEVEL.ladders.push({ f, t: L.t, y0: T, y1: T + 5 }); put(f, S1[0], S1[1], T + 5, 'ledge');
    const S2 = span(L.t - L.dir * 2, L.t - L.dir * 4); if (S2 && clear(S2, T + 6)) { put(f, S2[0], S2[1], T + 6, 'ledge'); if (S2[1] - S2[0] === 2 && chance(0.6)) { const c = lane(f, S2[0] + 1), d = lane(f, S2[0] + 2); LEVEL.robots.push({ x: c[0], y: T + 6, z: c[1], h: [d[0] - c[0], d[1] - c[1]], R: 9, F: 7.5 }); } else { const c = lane(f, S2[0]); LEVEL.bits.push({ x: c[0], y: T + 6.45, z: c[1] }); } }
    const S3 = span(L.t + L.dir * 5, L.t + L.dir * 6); if (S3 && clear(S3, T + 6)) { put(f, S3[0], S3[1], T + 6, 'plat'); const c = lane(f, S3[0]); LEVEL.bits.push({ x: c[0], y: T + 6.45, z: c[1] }); }
  }
  // лифты: люлька на цепи ездит вверх-вниз в двухклеточном пролёте — от нижнего уступа к балкончику наверху, где что-нибудь лежит
  for (let f = 0; f < 6; f++) { const S = SIDES[f]; let done = !!S.lifty;
    for (const i of shuf([0, 1, 2, 3, 4])) { if (done || i + 1 >= S.P.length || (i === 0 && chance(0.65))) continue; const lo = S.P[i], hi = S.P[i + 1]; if (hi[0] - lo[1] - 1 < 1) continue;
      const t = lo[1] + 1, Tb = S.base + lo[2]; if (LEVEL.ladders.some(L => L.f === f && Math.abs(L.t - t) < 1)) continue;
      let Tt = Math.min(S.base + 17, liftCeil(Tb), Tb + ri(7, 11)); const bal = [t + 1, Math.min(6, t + ri(2, 3))];
      const okAt = top => freeCol(f, t, Tb, top + 3) && freeCol(f, t - 1, Tb + 1, top + 3) && freeCol(f, t + 1, Tb + 3, top + 2) && [0, 1, 2].every(k => t + 1 + k > bal[1] || freeCol(f, t + 1 + k, top - 3, top + 2)) && !LEVEL.ladders.some(L => L.f === f && L.t >= bal[0] - 1 && L.t <= bal[1] + 1 && L.y1 > top - 4 && L.y0 < top + 1);   /* балкон не над лестницей */
      while (Tt > Tb + 3 && !okAt(Tt)) Tt--; if (Tt <= Tb + 3) continue;
      put(f, bal[0], bal[1], Tt, 'ledge'); const c = lane(f, t); LEVEL.lifts.push({ x: c[0], z: c[1], f: f % 4, y0: Tb, y1: Tt, v: (f * 7 + i) % 4 });
      const c1 = lane(f, bal[1]), c0 = lane(f, bal[0]), kind = ri(0, 2);
      if (kind === 0) { LEVEL.bits.push({ x: c1[0], y: Tt + 0.45, z: c1[1] }, { x: c0[0], y: Tt + 1.3, z: c0[1] }); }
      else if (kind === 1) { LEVEL.crates.push({ x: c1[0], y: Tt, z: c1[1] }); LEVEL.bits.push({ x: c0[0], y: Tt + 1.2, z: c0[1] }); }
      else { LEVEL.bits.push({ x: c1[0], y: Tt + 0.45, z: c1[1] }); if (bal[1] - bal[0] >= 2) { const d = lane(f, bal[0] + 1); LEVEL.robots.push({ x: d[0], y: Tt, z: d[1], h: [c1[0] - d[0], c1[1] - d[1]], R: 9, F: 7.5 }); } }
      lamp(f, bal[1] + 0.4, Tt + 3, 1.1); done = true; } }
  // шахта лифта остаётся пустой: всё, что успело встать на его пути (кроме труб), убираем
  { const inShaft = o => LEVEL.lifts.some(L => Math.abs(o.x - L.x) + Math.abs(o.z - L.z) < 1.05 && o.y > L.y0 - 1 && o.y < L.y1 + 4.2);
    for (const k of ['bits', 'crates', 'fires', 'lamps', 'steams', 'robots']) LEVEL[k] = LEVEL[k].filter(o => !inShaft(o)); }
  const liftZone = (f, t, y) => { const c = lane(f, t); return LEVEL.lifts.some(L => Math.abs(c[0] - L.x) + Math.abs(c[1] - L.z) < 1.6 && y > L.y0 - 2 && y < L.y1 + 4.5); };
  // выносные площадки на высоте 20: с северной прыгают на вторую ногу и попадают на её южную. К северной ведёт лестница с третьей стороны, с южной лестница поднимает на пятую
  for (let x = 0; x <= 1; x++) for (let z = 9; z <= 10; z++) { addCube(x, 19, -z, 'plat'); addCube(x, 19, z, 'plat'); }
  { const bridge = (f, Lt, ta, tb) => { for (let t = Math.min(Lt - 1, ta); t <= Math.max(Lt + 1, tb); t++) if (t !== Lt && Math.abs(t) <= 6 && freeCol(f, t, 18, 20) && !liftZone(f, t, 19.5)) put(f, t, t, 20, 'plat'); };
    const N = SIDES[2], Ln = sideLadder(N, 2); if (Ln) { LEVEL.ladders.push({ f: 2, t: Ln.t, y0: N.base + N.P[2][2], y1: 20 }); bridge(2, Ln.t, -1, 0); }
    for (const t of [-1, 0, 1, 2]) if (freeCol(4, t, 18, 20) && !liftZone(4, t, 19.5)) put(4, t, t, 20, 'plat'); }
  // двери: f — сторона, на которой дверь видна; to — парная дверь на противоположной стороне, за ней балкон
  const nearDoor = (x, y, z) => LEVEL.doors.some(d => Math.abs(d.x - x) + Math.abs(d.z - z) < 3 && Math.abs(d.y - y) < 2.5);
  const doorPair = (sides, wide) => { for (let tr = 0; tr < 60; tr++) {
      const f = sides[ri(0, sides.length - 1)], S = SIDES[f], i = ri(1, S.P.length - 2), q = S.P[i], t = ri(q[0], q[1]), y = S.base + q[2], g = f + 2, t2 = -t, a = t2 - (wide ? 2 : 1), b = t2 + 1;
      if (inBelt(g, y + 0.5, y + 0.5) || liftZone(f, t, y) || [a, a + 1, b - 1, b].some(u => liftZone(g, u, y))) continue;
      if (a < -6 || b > 6 || LEVEL.ladders.some(L => L.f % 4 === f % 4 && Math.abs(L.t - t) < 1.6 && L.y1 > y - 0.5 && L.y0 < y + 1.5)) continue;
      let ok = true; for (let u = a - 1; u <= b + 1 && ok; u++) if (!freeCol(g, u, y - 3, y + 2)) ok = false; if (!ok) continue;
      { const c = lane(f, t), d = lane(g, t2); if (nearDoor(c[0], y, c[1]) || nearDoor(d[0], y, d[1]) || LEVEL.lifts.some(L => L.f === f % 4 && Math.abs(L.x - c[0]) + Math.abs(L.z - c[1]) < 1.6) || LEVEL.fires.some(q2 => Math.abs(q2.x - c[0]) + Math.abs(q2.z - c[1]) < 1 && q2.y === y)) continue;
        put(g, a, b, y, 'ledge'); return { f, g, y, c, d, a, b }; } }
    return null; };
  // сквозные двери: две-три открытые пары и одна-две запертые; ключей столько же, сколько запертых пар, лежат за открытыми дверями или на пути
  { const OPEN = ['door0', 'door4', 'door1'], nOpen = ri(2, 3), nLock = ri(1, 2), balc = []; let keysLeft = 0;
    for (let i = 0; i < nLock; i++) { const B = doorPair([ri(2, 5)], true); if (!B) continue; const n0 = LEVEL.doors.length; keysLeft++;
      LEVEL.doors.push({ x: B.c[0], y: B.y, z: B.c[1], f: B.f % 4, to: n0 + 1, locked: true, sprL: i % 2 ? 'door3' : 'door2', spr: OPEN[i % 3], flip: true }, { x: B.d[0], y: B.y, z: B.d[1], f: B.g % 4, to: n0, locked: true, sprL: i % 2 ? 'door2' : 'door3', spr: OPEN[(i + 1) % 3], flip: true });
      const v = lane(B.g, B.a), vb = lane(B.g, B.b); if (!LEVEL.keys.some(q => q.red)) LEVEL.keys.push({ x: vb[0], y: B.y + 0.6, z: vb[1], red: true }); if (i === 0) LEVEL.vents.push({ x: v[0], y: B.y, z: v[1], power: 11.7 }); else LEVEL.crates.push({ x: v[0], y: B.y, z: v[1] }); LEVEL.bits.push({ x: vb[0], y: B.y + 0.45, z: vb[1] }, { x: vb[0], y: B.y + 1.3, z: vb[1] }); }
    for (let i = 0; i < nOpen; i++) { const A = doorPair(i === 0 ? [0, 1] : [ri(0, 5)], false); if (!A) continue; const n0 = LEVEL.doors.length;
      LEVEL.doors.push({ x: A.c[0], y: A.y, z: A.c[1], f: A.f % 4, to: n0 + 1, spr: OPEN[i % 3], flip: chance(0.5) }, { x: A.d[0], y: A.y, z: A.d[1], f: A.g % 4, to: n0, spr: OPEN[(i + 2) % 3], flip: chance(0.5) });
      const k = lane(A.g, A.b), kb = lane(A.g, A.a);
      if (keysLeft > 0) { keysLeft--; LEVEL.keys.push({ x: k[0], y: A.y + 0.5, z: k[1] }); } else if (chance(0.5)) LEVEL.crates.push({ x: k[0], y: A.y, z: k[1] }); else LEVEL.bits.push({ x: k[0], y: A.y + 1.2, z: k[1] });
      LEVEL.bits.push({ x: kb[0], y: A.y + 0.45, z: kb[1] }); }
    if (!LEVEL.keys.some(q => q.red)) { const S = SIDES[ri(3, 5)], q = S.P[ri(1, S.P.length - 2)], c = lane(SIDES.indexOf(S), q[1]); LEVEL.keys.push({ x: c[0], y: S.base + q[2] + 0.6, z: c[1], red: true }); }
    while (keysLeft-- > 0) { const S = SIDES[ri(0, 2)], q = S.P[ri(1, S.P.length - 2)], c = lane(SIDES.indexOf(S), q[0]); LEVEL.keys.push({ x: c[0], y: S.base + q[2] + 0.5, z: c[1] }); } }   // не хватило балконов — ключ лежит на пути
  // выход: путь кончается на северо-восточном углу, дальше — восточная стена таза. Две округлые каменные глыбы, между ними щель,
  // а в щели ниша в стене и дверь. На ближнюю глыбу поднимает лифт, с неё спрыгивают в щель
  { const col = (t, ya, yb) => { for (let y = ya; y <= yb; y++) { addCube(8, y, -t, 'ledge'); cubes.get(ckey(8, y, -t)).br = true; } }, HD = H + 5;
    for (let t = 9; t <= 15; t++) if (t !== 12) col(t, H - 1, H - 1);
    col(16, H - 1, H + 7);                                   // балкон вдоль таза от углового уступа
    col(10, HD - 2, HD + 2); col(9, HD - 1, HD + 1); col(14, HD - 2, HD + 2); col(15, HD - 1, HD + 1);   // две глыбы над балконом, между ними ниша
    LEVEL.lifts.push({ x: 8, z: -12, f: 1, y0: H, y1: HD, v: 2, safe: true, exit: true });            // лифт висит прямо под дверью: с балкона — к нише
    LEVEL.doors.push({ x: 7, y: HD, z: -12, f: 1, exit: true, spr: 'door1' }); LEVEL.exit = { x: 5.5, y: HD, z: -12 }; LEVEL.exitY = HD;
    LEVEL.lamps = LEVEL.lamps.filter(q => !(q.x > 7.5 && q.z < -8.5)); }
  // парящие платформы в стороне от пути
  for (const sg of shuf([[1, 1], [-1, -1], [1, -1], [-1, 1]]).slice(0, 2)) { let y = ri(7, 24); while (RINGS.some(r => y >= r - 5 && y <= r)) y = ri(7, 24); addCube(11 * sg[0], y, 11 * sg[1], 'plat'); addCube(12 * sg[0], y, 11 * sg[1], 'plat'); LEVEL.bits.push({ x: 12 * sg[0], y: y + 1.45, z: 11 * sg[1] }); }
  // испытания в пустых зонах над витком. От углового уступа длинная лестница ведёт на площадку, а дальше — либо вереница ламп
  // (перелетать, раскачиваясь), либо «ёлочка» висячих лестниц (с одной на другую — прыжком). В конце площадка с наградой
  LEVEL.trials = [];
  for (let f = 0; f < 6; f++) { const S0 = SIDES[f]; let built = false;
    const clear = (a, b, y0, y1) => { for (let t = Math.min(a, b); t <= Math.max(a, b); t++) if (!freeCol(f, t, y0, y1) || liftZone(f, t, y0) || liftZone(f, t, y1)) return false; return true; };
    for (const Y of shuf(f === 0 ? [7, 8, 9] : f === 1 ? [9, 10, 11, 12] : [12, 13, 14, 15]).map(d => S0.base + d)) for (const dir of shuf([1, -1])) { if (built) break;
      const lt = dir > 0 ? -7 : 7, from = dir > 0 ? S0.base : S0.base + 5, A = dir > 0 ? [-6, -5] : [5, 6], kind = chance(0.5) ? 'lamps' : 'ladders';
      if (ringCross(Math.min(from, Y), Y + 8) || !clear(lt, lt, from, Y + 2) || LEVEL.ladders.some(L => L.f === f && Math.abs(L.t - lt) < 1.2)) continue;
      if (kind === 'lamps') { const B = dir > 0 ? [5, 6] : [-6, -5], n = ri(4, 5); if (!clear(-6, 6, Y - 2, Y + 3) || Y + 3 > S0.base + 19) continue;
        put(f, A[0], A[1], Y, 'plat'); put(f, B[0], B[1], Y, 'plat'); LEVEL.ladders.push({ f, t: lt, y0: from, y1: Y });
        for (let i = 1; i <= n; i++) lamp(f, -dir * 4.4 + dir * 8.8 * i / (n + 1), Y + 2.7, 1.25);
        const c = lane(f, B[dir > 0 ? 1 : 0]), c2 = lane(f, B[dir > 0 ? 0 : 1]); LEVEL.crates.push({ x: c[0], y: Y, z: c[1] }); LEVEL.bits.push({ x: c2[0], y: Y + 0.45, z: c2[1] }, { x: c2[0], y: Y + 1.3, z: c2[1] }); built = true; }
      else { const e = A[dir > 0 ? 1 : 0], l1 = e + dir * 2, l2 = e + dir * 4, B = [l2 + dir, l2 + dir * 2]; if (Math.abs(B[1]) > 6 || Y + 6 > S0.base + 19 || !clear(A[0], B[1], Y - 2, Y + 7)) continue;
        put(f, A[0], A[1], Y, 'plat'); LEVEL.ladders.push({ f, t: lt, y0: from, y1: Y }, { f, t: l1, y0: Y + 0.6, y1: Y + 2.7 }, { f, t: l2, y0: Y + 2.1, y1: Y + 4 });
        put(f, Math.min(B[0], B[1]), Math.max(B[0], B[1]), Y + 4, 'plat');
        const c = lane(f, B[1]), c2 = lane(f, B[0]); LEVEL.crates.push({ x: c[0], y: Y + 4, z: c[1] }); LEVEL.bits.push({ x: c2[0], y: Y + 4.45, z: c2[1] }, { x: lane(f, l1 + dir)[0], y: Y + 3.2, z: lane(f, l1 + dir)[1] }); built = true; }
      if (built) LEVEL.trials.push({ f, kind, Y }); } }
  LEVEL.movers = [];
  // пустых стен быть не должно: на каждой грани ищем свободные полосы и ставим в них готовые места — островки, гнездо роботов,
  // котельную с водяной завесой, трубу-лаз, переправу на бордовой панели, дорожку из колец для крюка. К каждому ведёт своя лестница
  LEVEL.spots = []; LEVEL.fillFrom = cubes.size;
  { const tOf = (g, o) => [o.x, -o.z, -o.x, o.z][g];
    const boxFree = (g, a, b, y0, y1) => { if (inBelt(g, y0 + 3, y1 - 1)) return false; for (let t = a; t <= b; t++) { if (!freeCol(g, t, y0, y1)) return false; for (let y = y0; y <= y1; y += 2) if (liftZone(g, t, y)) return false; }
      if (LEVEL.ladders.some(L => L.f % 4 === g && L.t >= a - 0.6 && L.t <= b + 0.6 && L.y1 > y0 - 0.5 && L.y0 < y1 + 0.5)) return false;
      if (LEVEL.movers.some(m => m.f % 4 === g && m.y >= y0 - 1 && m.y <= y1 + 2 && m.t1 + 1.5 >= a && m.t0 - 1.5 <= b)) return false;
      if (LEVEL.trials.some(q => q.f % 4 === g && y1 > q.Y - 3 && y0 < q.Y + 8)) return false;
      if (LEVEL.rings.some(q => Math.abs(q.x * FN[g][0] + q.z * FN[g][1] - 8) < 0.1 && q.y > y0 - 3 && q.y < y1 + 2.5 && tOf(g, q) >= a - 3 && tOf(g, q) <= b + 3)) return false;   // под кольцами и над ними пусто: это полёт на крюке
      if (LEVEL.path.some(q => q.f % 4 === g && q.b >= a - 2 && q.a <= b + 2 && y0 >= q.top - 1 && y0 < q.top + 2)) return false;   // над уступами пути остаётся место для прыжка
      if (LEVEL.doors.some(d => d.f === g && d.y >= y0 - 2 && d.y <= y1 + 1 && tOf(g, d) >= a - 1 && tOf(g, d) <= b + 1)) return false;
      if (LEVEL.steams.some(q => q.y > y0 - 1 && q.y < y1 + 1 && Math.abs(q.x * FN[g][0] + q.z * FN[g][1] - 8) < 0.7 && tOf(g, q) >= a - 1.5 && tOf(g, q) <= b + 1.5)) return false;
      return true; };
    const FN = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    const floorUnder = (g, t, y) => { const c = lane(g, t); for (let yy = y; yy >= Math.max(1, y - 12); yy--) if (hasCube(c[0], yy, c[1])) return yy + 1; return null; };
    const cell = (g, t) => lane(g, t), bit = (g, t, y) => { const c = cell(g, t); LEVEL.bits.push({ x: c[0], y, z: c[1] }); }, crate = (g, t, y) => { const c = cell(g, t); LEVEL.crates.push({ x: c[0], y, z: c[1] }); };
    const ladderTo = (g, t, top) => { const F = floorUnder(g, t, top); if (F === null || top - F < 2 || inBelt(g, F + 0.5, top) || LEVEL.doors.some(d => d.f === g && Math.abs(tOf(g, d) - t) < 1.6 && d.y > F - 1.5 && d.y < top + 0.5) || LEVEL.ladders.some(L => L.f % 4 === g && Math.abs(L.t - t) < 1.1 && L.y1 > F - 0.5 && L.y0 < top + 0.5) || LEVEL.movers.some(m => m.f % 4 === g && m.y > F && m.y < top + 2 && t >= m.t0 - 1.6 && t <= m.t1 + 1.6) || [F, (F + top) / 2, top].some(yy => liftZone(g, t, yy)) || LEVEL.rings.some(q => Math.abs(q.x * FN[g][0] + q.z * FN[g][1] - 8) < 0.1 && Math.abs(tOf(g, q) - t) < 4.6 && q.y > F - 1 && q.y < top + 2) || LEVEL.fires.some(q => { const c = cell(g, t); return q.x === c[0] && q.z === c[1] && q.y === F; })) return false; LEVEL.ladders.push({ f: g, t, y0: F, y1: top }); return true; };
    let botsLeft = 4 + Math.min(3, (game.level || 1) - 1);
    const robot = (g, ta, tb, top) => { if (top < RINGS[1]) { if (botsLeft <= 0) return; botsLeft--; } const c = cell(g, ta), d = cell(g, tb); LEVEL.robots.push({ x: c[0], y: top, z: c[1], h: [d[0] - c[0], d[1] - c[1]], R: 9, F: 7.5 }); };
    // места на полстены: шесть клеток от t0 в сторону dir (i = 0 — клетка лестницы), низ полосы y
    const HALF = {
      islands(g, T, y) { if (!ladderTo(g, T(0), y + 2)) return false; put(g, Math.min(T(1), T(2)), Math.max(T(1), T(2)), y + 2, 'ledge'); put(g, Math.min(T(4), T(5)), Math.max(T(4), T(5)), y + 3, 'ledge'); put(g, T(3), T(3), y + 4, 'plat'); put(g, T(1), T(1), y + 5, 'plat');
        crate(g, T(5), y + 3); bit(g, T(3), y + 5.3); bit(g, T(1), y + 5.45); bit(g, T(1), y + 6.3); if (chance(0.45)) { const c = cell(g, T(4)); LEVEL.fires.push({ x: c[0], y: y + 3, z: c[1] }); } lamp(g, T(4.5), y + 7.4, 1.2); return true; },
      nest(g, T, y, tall) { if (!ladderTo(g, T(0), y + 2)) return false; put(g, Math.min(T(1), T(5)), Math.max(T(1), T(5)), y + 2, 'ledge'); robot(g, T(3), T(4), y + 2); crate(g, T(5), y + 2); bit(g, T(2), y + 3.2); bit(g, T(4), y + 3.2);
        if (!tall) return true; put(g, Math.min(T(3), T(4)), Math.max(T(3), T(4)), y + 6, 'plat'); bit(g, T(3), y + 6.45); bit(g, T(4), y + 6.45); lamp(g, T(1.5), y + 6.2, 1.3);
        const tt = T(2), yy = y + 5.4, c = cell(g, tt); LEVEL.steams.push({ x: c[0], y: yy, z: c[1], dx: 0, dz: 0, down: true, ph: R() * 5, var: g + y }); LEVEL.pipes.push({ deco: true, pts: [P3(g, tt, yy + 1.2, 7.4), P3(g, tt, yy + 1.2), P3(g, tt, yy + 0.05)] }); return true; },
      boiler(g, T, y) { if (!ladderTo(g, T(0), y + 2)) return false; put(g, Math.min(T(1), T(5)), Math.max(T(1), T(5)), y + 2, 'ledge'); const lo = Math.min(T(2), T(4)), hi = Math.max(T(2), T(4)), yp = y + 6;
        LEVEL.pipes.push({ deco: true, pts: [P3(g, lo - 0.6, yp + 0.9, 7.4), P3(g, lo - 0.6, yp + 0.9), P3(g, hi + 0.6, yp + 0.9), P3(g, hi + 0.6, yp + 0.9, 7.4)] });
        for (const t of [T(2), T(3)]) LEVEL.pipes.push({ out: true, ph: 0.9 * Math.abs(t - T(2)), pts: [P3(g, t, yp + 0.9), P3(g, t, yp + 0.35), P3(g, t, yp + 0.35, 8.3)] });
        crate(g, T(5), y + 2); bit(g, T(4), y + 2.45); bit(g, T(4), y + 3.3); bit(g, T(5), y + 3.6); { const c = cell(g, T(4)); if (chance(0.5)) LEVEL.fires.push({ x: c[0], y: y + 2, z: c[1] }); } return true; },
      gearstep(g, T, y, tall) { if (!ladderTo(g, T(0), y + 2)) return false;   // малый механизм: с уступа на крутящееся колесо и дальше на уступ с ящиком; сверху лампа
        put(g, T(1), T(1), y + 2, 'ledge'); put(g, Math.min(T(4), T(5)), Math.max(T(4), T(5)), y + 3, 'ledge');
        { const c = P3(g, T(2.65), y + 1.15, 8); LEVEL.gears.push({ x: c[0], y: c[1], z: c[2], f: g % 4, R: 1.0, drive: (chance(0.5) ? 1 : -1) * (0.6 + R() * 0.5), rust: chance(0.4) ? 1 : 0, combo: true }); }
        crate(g, T(5), y + 3); bit(g, T(4), y + 3.45); bit(g, T(2.65), y + 3.2); if (tall) { lamp(g, T(2.65), y + 6.6, 1.5); bit(g, T(1), y + 5.6); } return true; },
      pipeway(g, T, y) { const t = T(2), F = floorUnder(g, t, y + 1); if (F === null || F > y - 0) return false;
        LEVEL.pipes.push({ pts: [P3(g, t, F + 0.4, 7.4), P3(g, t, F + 0.4), P3(g, t, y + 6.4), P3(g, t, y + 6.4, 7.4)] });
        put(g, Math.min(T(3), T(4)), Math.max(T(3), T(4)), y + 3, 'ledge'); put(g, Math.min(T(0), T(1)), Math.max(T(0), T(1)), y + 6, 'ledge'); crate(g, T(0), y + 6); bit(g, T(1), y + 6.45); bit(g, T(4), y + 3.45); bit(g, T(3), y + 4.3); lamp(g, T(4.5), y + 6.4, 1.2); return true; },
    };
    // места пониже, на пять рядов: ступени через костёр и уступ под струёй воды
    const LOW = {
      nest: (g, T, y) => HALF.nest(g, T, y, false),
      gearstep: (g, T, y) => HALF.gearstep(g, T, y, false),
      steps(g, T, y) { if (!ladderTo(g, T(0), y + 2)) return false; put(g, Math.min(T(1), T(2)), Math.max(T(1), T(2)), y + 2, 'ledge'); put(g, Math.min(T(4), T(5)), Math.max(T(4), T(5)), y + 3, chance(0.5) ? 'ledge' : 'plat');
        crate(g, T(5), y + 3); bit(g, T(3), y + 3.9); bit(g, T(4), y + 4.2); if (chance(0.6)) { const c = cell(g, T(4)); LEVEL.fires.push({ x: c[0], y: y + 3, z: c[1] }); } return true; },
      curtain(g, T, y) { if (!ladderTo(g, T(0), y + 2)) return false; put(g, Math.min(T(1), T(5)), Math.max(T(1), T(5)), y + 2, 'ledge'); const t = T(3);
        LEVEL.pipes.push({ out: true, ph: R() * 3, pts: [P3(g, t, y + 4.9, 7.4), P3(g, t, y + 4.9), P3(g, t, y + 4.35), P3(g, t, y + 4.35, 8.3)] });
        crate(g, T(5), y + 2); bit(g, T(4), y + 2.45); bit(g, T(5), y + 3.5); if (chance(0.5)) { const c = cell(g, T(4)); LEVEL.fires.push({ x: c[0], y: y + 2, z: c[1] }); } return true; },
    };
    // места на всю стену
    const FULL = {
      ferry(g, d, y, tall) { if (!ladderTo(g, -7 * d, y + 2)) return false; put(g, Math.min(-6 * d, -5 * d), Math.max(-6 * d, -5 * d), y + 2, 'ledge'); put(g, Math.min(5 * d, 6 * d), Math.max(5 * d, 6 * d), y + 2, 'ledge');
        LEVEL.movers.push({ f: g, y: y + 2, t0: -3, t1: 3, ph: R() }); crate(g, 6 * d, y + 2); bit(g, 5 * d, y + 2.45); bit(g, -2, y + 3.4); bit(g, 0, y + 3.4); bit(g, 2, y + 3.4); if (!tall) return true;
        const yy = y + 5.2, c = cell(g, 0); LEVEL.steams.push({ x: c[0], y: yy, z: c[1], dx: 0, dz: 0, down: true, ph: R() * 5, var: g + y }); LEVEL.pipes.push({ deco: true, pts: [P3(g, 1.3, yy + 1.4, 7.4), P3(g, 1.3, yy + 1.4), P3(g, 0, yy + 1.4), P3(g, 0, yy + 0.05)] }); lamp(g, -4 * d, y + 6.6, 1.2); return true; },
      gauntlet(g, d, y) { if (!ladderTo(g, -7 * d, y + 2)) return false; put(g, -6, 6, y + 2, 'ledge');   // длинный уступ: костёр, пар сверху, водяная завеса, робот — и награда в конце
        { const c = cell(g, -3 * d); LEVEL.fires.push({ x: c[0], y: y + 2, z: c[1] }); }
        { const yy = y + 4.3, c = cell(g, 0); LEVEL.steams.push({ x: c[0], y: yy, z: c[1], dx: 0, dz: 0, down: true, ph: R() * 5, var: g + y }); LEVEL.pipes.push({ deco: true, pts: [P3(g, 0, yy + 0.55, 7.4), P3(g, 0, yy + 0.55), P3(g, 0, yy + 0.05)] }); }
        { const t = 3 * d; LEVEL.pipes.push({ out: true, ph: R() * 3, pts: [P3(g, t, y + 4.9, 7.4), P3(g, t, y + 4.9), P3(g, t, y + 4.35), P3(g, t, y + 4.35, 8.3)] }); }
        robot(g, 4 * d, 5 * d, y + 2); crate(g, 6 * d, y + 2); bit(g, -5 * d, y + 2.45); bit(g, -1 * d, y + 2.45); bit(g, 2 * d, y + 2.45); bit(g, 6 * d, y + 3.5); return true; },
      machine(g, d, y, tall) { if (!ladderTo(g, -7 * d, y + 2)) return false;   // механизм: два колеса навстречу и лампа между ними — перебраться на дальний уступ к награде
        put(g, Math.min(-6 * d, -5 * d), Math.max(-6 * d, -5 * d), y + 2, 'ledge'); put(g, Math.min(5 * d, 6 * d), Math.max(5 * d, 6 * d), y + 2, 'ledge');
        const sp = (chance(0.5) ? 1 : -1) * (0.7 + R() * 0.6), G = (t, s2) => { const c = P3(g, t * d, y + 2 - 1.05, 8); LEVEL.gears.push({ x: c[0], y: c[1], z: c[2], f: g % 4, R: 1.2, drive: s2, rust: chance(0.4) ? 1 : 0, combo: true }); };
        const ly = tall ? y + 5.4 : y + 4.6, ll = tall ? 1.7 : 1.1;
        if (chance(0.5)) { G(-2.6, sp); lamp(g, 0.2 * d, ly, ll); G(2.8, -sp); } else { G(-2.6, sp); G(-0.15, -sp); lamp(g, 2.6 * d, ly, ll); }
        crate(g, 6 * d, y + 2); bit(g, 5 * d, y + 2.45); bit(g, 5 * d, y + 3.3); bit(g, 0, y + 4.3); if (tall) lamp(g, -4 * d, y + 7.2, 1.2); return true; },
      rings(g, d, y) { if (!ladderTo(g, -7 * d, y + 2)) return false; put(g, Math.min(-6 * d, -5 * d), Math.max(-6 * d, -5 * d), y + 2, 'ledge'); put(g, Math.min(4 * d, 6 * d), Math.max(4 * d, 6 * d), y + 4, 'ledge');
        for (const q of [[-2.5, 3.5], [0.3, 4.4], [2.9, 5.3]]) { const c = P3(g, q[0] * d, y + q[1], 8); LEVEL.rings.push({ x: c[0], y: c[1], z: c[2] }); }
        crate(g, 6 * d, y + 4); bit(g, 5 * d, y + 4.45); bit(g, 5 * d, y + 5.3); bit(g, -1 * d, y + 4.6); bit(g, 2 * d, y + 5.5); lamp(g, 0.5, y + 7.6, 1.1); return true; },
    };
    // полка на четыре клетки: лестница и уступ с чем-нибудь — ящик, осколки, робот, костёр с наградой за ним
    const shelf = (g, T, y) => { if (!ladderTo(g, T(0), y + 2)) return false; put(g, Math.min(T(1), T(3)), Math.max(T(1), T(3)), y + 2, 'ledge'); const k = ri(0, 3);
      if (k === 0) { crate(g, T(3), y + 2); bit(g, T(2), y + 3.2); } else if (k === 1) { robot(g, T(2), T(3), y + 2); bit(g, T(3), y + 3.3); }
      else if (k === 2) { const c = cell(g, T(2)); LEVEL.fires.push({ x: c[0], y: y + 2, z: c[1] }); crate(g, T(3), y + 2); bit(g, T(3), y + 3.5); } else { bit(g, T(1), y + 2.45); bit(g, T(2), y + 3.1); bit(g, T(3), y + 2.45); }
      return true; };
    const hNames = Object.keys(HALF), fNames = Object.keys(FULL); let hi = ri(0, 3), fi = ri(0, 1), li = ri(0, 2); const lNames = Object.keys(LOW);
    for (let g = 0; g < 4; g++) { const top = g === 2 ? H - 3 : H + 2;
      const tryHalf = (side, y, only) => {
        const a = side < 0 ? -6 : 1, b = side < 0 ? -1 : 6, tall = only !== 'low' && y + 7 <= top && boxFree(g, a, b, y - 1, y + 7);
        if (tall || (only !== 'tall' && boxFree(g, a, b, y - 1, y + 4))) { let done = false;
          for (let k = 0; k < hNames.length && !done; k++) { const nm = tall ? hNames[(hi + k) % hNames.length] : lNames[li++ % lNames.length];
            for (const o of shuf([[side * 6, -side], [side, side]])) { const T = i => o[0] + o[1] * i; if ((tall ? HALF : LOW)[nm](g, T, y, tall)) { LEVEL.spots.push({ g, y, nm, side }); done = true; if (tall) hi += k + 1; break; } }
            if (!tall) break; }
          if (done) return tall ? 8 : 5; }
        return 0; };
      for (const B of BANDS[g]) for (const side of shuf([-1, 1])) { if (B - 10 >= 4 && tryHalf(side, B - 10, 'tall')) continue; if (B - 7 >= 4) tryHalf(side, B - 7, 'low'); }   // под самым поясом — в первую очередь: иначе там остаётся голая стена
      for (let y = 4 + ri(0, 1); y + 7 <= top; ) {       // сначала — места на всю стену
        const tall = boxFree(g, -7, 7, y - 1, y + 7);
        if (chance(0.7) && (tall || boxFree(g, -7, 7, y - 1, y + 4))) { const d = chance(0.5) ? 1 : -1, nm = tall ? fNames[fi++ % fNames.length] : ['machine', 'ferry', 'gauntlet'][fi++ % 3]; if (FULL[nm](g, d, y, tall) || FULL[nm](g, -d, y, tall)) { LEVEL.spots.push({ g, y, nm }); y += tall ? 9 : 6; continue; } }
        y++; }
      for (const side of shuf([-1, 1])) for (let y = 4 + ri(0, 2); y + 4 <= top; ) { const adv = tryHalf(side, y); y += adv ? adv + ri(0, 2) : 1; }
      let nSh = 0; for (let y = 4 + ri(0, 2); y + 4 <= top && nSh < 9; ) { let done = false;   // и полки там, где осталось место хотя бы четыре на пять
        for (const a of shuf([-6, -5, -4, -3, -2, -1, 0, 1, 2, 3])) { if (!boxFree(g, a, a + 3, y - 1, y + 4)) continue;
          for (const o of shuf([[a, 1], [a + 3, -1]])) { const T = i => o[0] + o[1] * i; if (shelf(g, T, y)) { LEVEL.spots.push({ g, y, nm: 'shelf' }); done = true; nSh++; break; } } if (done) break; }
        y += done ? 3 + ri(0, 2) : 1; } }
    LEVEL.fillTo = cubes.size;
    // лампа не должна висеть сквозь новый уступ
    LEVEL.lamps = LEVEL.lamps.filter(q => { for (let yy = Math.floor(q.y - q.len - 0.5); yy <= Math.floor(q.y - 0.1); yy++) if (hasCube(Math.round(q.x), yy, Math.round(q.z))) return false; return true; }); }
  // ездящие платформы: бордовая панель в три клетки ходит из края в край свободного ряда
  for (let f = 0; f < 6; f++) { const base = 3 + 5 * f; let got = 0;
    for (const dy of shuf([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17])) { if (got >= 2) break; const Y = base + dy; if (inBelt(f, Y - 1.5, Y + 1.5)) continue; let a = null, best = null;
      for (let t = -6; t <= 7; t++) { const ok = t <= 6 && freeCol(f, t, Y - 2, Y + 1) && !liftZone(f, t, Y) && !LEVEL.ladders.some(L => L.f % 4 === f % 4 && Math.abs(L.t - t) < 0.6 && L.y1 > Y - 1.5 && L.y0 < Y + 1.5) && !LEVEL.rings.some(q => { const c = lane(f, t); return Math.abs(q.x - c[0]) + Math.abs(q.z - c[1]) < 0.9 && Math.abs(q.y - Y) < 2.5; }) && !LEVEL.lamps.some(q => { const c = lane(f, t); return Math.abs(q.x - c[0]) + Math.abs(q.z - c[1]) < 0.9 && q.y > Y - 0.5 && q.y - q.len < Y + 2; });
        if (ok && a === null) a = t; if ((!ok || t === 7) && a !== null) { const b2 = t - 1; if (b2 - a >= 5 && (!best || b2 - a > best[1] - best[0])) best = [a, b2]; a = null; } }
      if (!best || LEVEL.movers.some(m => m.f % 4 === f % 4 && Math.abs(m.y - Y) < 4)) continue;
      LEVEL.movers.push({ f, y: Y, t0: best[0] + 1, t1: best[1] - 1, ph: R() }); got++;
      const c = lane(f, Math.round((best[0] + best[1]) / 2)); LEVEL.bits.push({ x: c[0], y: Y + 1.5, z: c[1] }); } }
  // иногда на стороне целая батарея труб рядом: льёт сплошной стеной
  if (chance(0.45)) { const f = ri(0, 5), base = 3 + 5 * f, n = ri(5, 8), a = ri(-6, 6 - n + 1), y = base + ri(9, 16); let ok = true;
    for (let t = a; t < a + n; t++) if (!freeCol(f, t, y - 1, y + 1) || liftZone(f, t, y)) ok = false;
    if (ok) { LEVEL.pipes.push({ deco: true, pts: [P3(f, a - 0.6, y + 0.9, 7.4), P3(f, a - 0.6, y + 0.9), P3(f, a + n - 0.4, y + 0.9), P3(f, a + n - 0.4, y + 0.9, 7.4)] });
      for (let t = a; t < a + n; t++) LEVEL.pipes.push({ out: true, ph: 0.6 * (t - a), pts: [P3(f, t, y + 0.9), P3(f, t, y + 0.35), P3(f, t, y + 0.35, 8.3)] }); } }
  // трубы: каждый раз свои — стояки, колена за угол с водой, перемычки и стояки с отводом; ставятся только там, где ничего не мешает
  { const busyCol = (f, t) => { const c = lane(f, t); return LEVEL.ladders.some(L => L.f % 4 === f % 4 && Math.abs(L.t - t) < 1.2) || LEVEL.lifts.some(L => L.f === f % 4 && Math.abs(c[0] - L.x) + Math.abs(c[1] - L.z) < 1.6) || LEVEL.doors.some(d => d.f === f % 4 && Math.abs(c[0] - d.x) + Math.abs(c[1] - d.z) < 1.2); };
    const rowFree = (f, a, b, y) => { for (let t = Math.round(Math.min(a, b)); t <= Math.round(Math.max(a, b)); t++) if (Math.abs(t) <= 8 && !freeCol(f, t, Math.floor(y) - 1, Math.floor(y))) return false; return true; };
    const beltV = (f, ya, yb) => inBelt(f, ya - 0.5, yb + 1);   // труба в поясе была бы лестницей или мостком в обход
    const spotRow = (f, y) => LEVEL.spots.some(q => q.g === f % 4 && (q.nm === 'rings' || q.nm === 'ferry') && y > q.y && y < q.y + 7.5);
    for (const [f, base] of [[0, 3], [1, 8], [2, 13], [3, 18], [4, 23], [5, 28], [1, -3], [2, 0], [3, 2], [3, 27]]) { const want = ri(3, 5); let made = 0, outs = base < 3 || f * 5 + 3 !== base ? 1 : 0;
      for (let tr = 0; tr < 80 && made < want; tr++) { const kind = outs < 1 && tr < 40 ? 1 : ri(0, 3);   // сначала — труба с водой: она нужна, чтобы сбивать пламя
        if (kind === 0) { const t = ri(-6, 6), y0 = base + ri(-3, 9), len = ri(3, 9); if (y0 < 2 || busyCol(f, t) || beltV(f, y0, y0 + len) || !freeCol(f, t, y0, y0 + len + 1)) continue;
          LEVEL.pipes.push({ pts: [P3(f, t, y0 + 0.4, 7.4), P3(f, t, y0 + 0.4), P3(f, t, y0 + len + 0.4), P3(f, t, y0 + len + 0.4, 7.4)] }); made++; }
        else if (kind === 1 && outs < 1) { const t = ri(2, 6), ya = base + ri(0, 4), yb = base + ri(5, 17), t2 = -ri(3, 6); if (ya < 2 || busyCol(f, t) || beltV(f, ya, yb) || beltV(f + 1, yb, yb) || spotRow(f, yb) || spotRow(f + 1, yb) || !freeCol(f, t, ya, yb + 1) || !rowFree(f, t, 8, yb + 0.6) || !rowFree(f + 1, -8, t2, yb + 0.6)) continue;
          LEVEL.pipes.push({ pts: [P3(f, t, ya + 0.5, 7.4), P3(f, t, ya + 0.5), P3(f, t, yb + 0.6), P3(f, PR, yb + 0.6), P3(f + 1, t2 - 0.5, yb + 0.6), P3(f + 1, t2 - 0.5, yb + 0.6, 8.3)], out: true }); made++; outs++; }
        else if (kind === 2) { const a = ri(-7, 2), len = ri(3, 7), y = base + ri(1, 13) + 0.6, b2 = Math.min(7, a + len); if (y < 3 || spotRow(f, y) || beltV(f, y, y) || !rowFree(f, a, b2, y)) continue;
          LEVEL.pipes.push({ pts: [P3(f, a - 0.4, y, 7.4), P3(f, a - 0.4, y), P3(f, b2 + 0.4, y), P3(f, b2 + 0.4, y, 7.4)] }); made++; }
        else if (kind === 3) { const t = ri(-6, 4), y0 = base + ri(0, 6), len = ri(3, 6), run = ri(2, 4), y1 = y0 + len + 0.6; if (y0 < 2 || t + run > 7 || busyCol(f, t) || beltV(f, y0, y1) || spotRow(f, y1) || !freeCol(f, t, y0, y0 + len + 1) || !rowFree(f, t, t + run, y1)) continue;
          LEVEL.pipes.push({ pts: [P3(f, t, y0 + 0.4, 7.4), P3(f, t, y0 + 0.4), P3(f, t, y1), P3(f, t + run + 0.4, y1), P3(f, t + run + 0.4, y1, 7.4)] }); made++; }
      } } }
  // ключи от перегородок, обитатели колец, верхний ярус погуще, лужи
  { const FN2 = [[0, 1], [1, 0], [0, -1], [-1, 0]], tOfG = (g, o) => [o.x, -o.z, -o.x, o.z][g], near = (q, c, y) => Math.abs(q.y - y) < 1.2 && Math.abs(q.x - c[0]) + Math.abs(q.z - c[1]) < 1.1;
    const cellOK = (g, t, y) => { const c = lane(g, t); return freeCol(g, t, y, y + 1) && hasCube(c[0], y - 1, c[1]) && !liftZone(g, t, y + 0.5) && !LEVEL.doors.some(d => d.f === g && Math.abs(tOfG(g, d) - t) < 1.6 && Math.abs(d.y - y) < 1.5)
      && !LEVEL.ladders.some(L => L.f % 4 === g && Math.abs(L.t - t) < 1.1 && L.y0 < y + 1.5 && L.y1 > y - 0.5) && !LEVEL.fires.some(q => near(q, c, y)) && !LEVEL.crates.some(q => near(q, c, y)) && !LEVEL.vents.some(q => near(q, c, y)) && !LEVEL.keys.some(q => near(q, c, y + 0.5)); };
    // верхний ярус (под тазом): добавочные площадки с роботами, ящиками и осколками
    for (let g = 0; g < 4; g++) for (let n = 0, tr = 0; n < 3 && tr < 50; tr++) { const w = ri(2, 3), a = ri(-6, 6 - w), y = ri(RINGS[1] + 4, (g === 2 ? H - 4 : H + 1)); let ok = true;
      for (let t = a - 1; t <= a + w && ok; t++) if (!freeCol(g, t, y - 5, y + 2) || liftZone(g, t, y) || liftZone(g, t, y - 3)) ok = false;
      if (!ok || LEVEL.ladders.some(L => L.f % 4 === g && L.t >= a - 1.6 && L.t <= a + w + 0.6 && L.y1 > y - 5.5 && L.y0 < y + 2.5) || LEVEL.doors.some(d => d.f === g && tOfG(g, d) >= a - 2 && tOfG(g, d) <= a + w + 1 && d.y > y - 5 && d.y < y + 3)
        || LEVEL.movers.some(m => m.f % 4 === g && Math.abs(m.y - y) < 3) || LEVEL.rings.some(q => q.x * FN2[g][0] + q.z * FN2[g][1] > 7.5 && Math.abs(q.y - y) < 4 && tOfG(g, q) > a - 4 && tOfG(g, q) < a + w + 3)
        || LEVEL.steams.some(q => q.x * FN2[g][0] + q.z * FN2[g][1] > 7 && Math.abs(q.y - y) < 2.5 && tOfG(g, q) > a - 2.5 && tOfG(g, q) < a + w + 1.5)) continue;
      put(g, a, a + w - 1, y, 'plat'); n++; const c0 = lane(g, a), c1 = lane(g, a + w - 1), k = ri(0, 2);
      if (k === 0) { LEVEL.robots.push({ x: c0[0], y, z: c0[1], h: [Math.sign(c1[0] - c0[0]), Math.sign(c1[1] - c0[1])], R: 9, F: 7.5 }); LEVEL.bits.push({ x: c1[0], y: y + 1.3, z: c1[1] }); }
      else if (k === 1) { LEVEL.crates.push({ x: c1[0], y, z: c1[1] }); LEVEL.bits.push({ x: c0[0], y: y + 0.45, z: c0[1] }); } else LEVEL.bits.push({ x: c0[0], y: y + 0.45, z: c0[1] }, { x: c1[0], y: y + 1.2, z: c1[1] }); }
    { LEVEL.gallery = 0; for (const g of [0, 3, 2, 1]) { let run = 0, fireN = 0, botN = 0;
        for (let t = -8; t <= 8; t++) { const c = lane(g, t), gap = Math.abs(t) < 7 && ((t + g * 2 + 40) % 6 === 5);   // через каждые пять кубов — щель в один куб: перепрыгнуть
          const busy = hasCube(c[0], H - 1, c[1]), clear = freeCol(g, t, H, H + 2) && !liftZone(g, t, H) && !LEVEL.ladders.some(L => L.f % 4 === g && Math.abs(L.t - t) < 0.6 && L.y1 > H - 1.5 && L.y0 < H + 2) && !LEVEL.doors.some(d => d.f === g && Math.abs(tOfG(g, d) - t) < 1.1 && d.y > H - 3 && d.y < H + 2);
          if (busy) { run = 0; continue; } if (gap || !clear || !freeCol(g, t, H - 1, H - 1)) { run = 0; continue; }
          addCube(c[0], H - 1, c[1], 'plat'); LEVEL.gallery++; run++;
          if (run >= 3 && Math.abs(t) <= 6 && cellOK(g, t - 1, H)) { const k = R(); const b = lane(g, t - 1);
            if (k < 0.22 && fireN < 2) { LEVEL.fires.push({ x: b[0], y: H, z: b[1] }); fireN++; run = 0; }
            else if (k < 0.5 && botN < 2 && cellOK(g, t - 2, H)) { const a2 = lane(g, t - 2); LEVEL.robots.push({ x: a2[0], y: H, z: a2[1], h: [Math.sign(b[0] - a2[0]), Math.sign(b[1] - a2[1])], R: 9, F: 7.5 }); botN++; run = 0; }
            else if (k < 0.6) { LEVEL.crates.push({ x: b[0], y: H, z: b[1] }); run = 0; }
            else if (k < 0.75) { LEVEL.bits.push({ x: b[0], y: H + 0.45, z: b[1] }); run = 1; } } } } }
    // балкон таза перед выходом сторожат двое
    LEVEL.robots.push({ x: 8, y: H, z: -10, h: [0, -1], R: 9, F: 7.5 }, { x: 8, y: H, z: -14, h: [0, -1], R: 9, F: 7.5 }); LEVEL.crates.push({ x: 8, y: H, z: -15 }); LEVEL.bits.push({ x: 8, y: H + 1.3, z: -13 });
    // по кольцам ходят роботы
    RINGS.forEach((r, n) => { for (const g of shuf([0, 1, 2, 3]).slice(0, n === 0 ? 3 : 4)) for (let tr = 0; tr < 14; tr++) { const t = ri(-5, 4); if (!cellOK(g, t, r) || !cellOK(g, t + 1, r)) continue; const c = lane(g, t), d = lane(g, t + 1);
        LEVEL.robots.push({ x: c[0], y: r, z: c[1], h: [d[0] - c[0], d[1] - c[1]], R: 9, F: 7.5 }); if (cellOK(g, t - 2, r)) { const b = lane(g, t - 2); LEVEL.bits.push({ x: b[0], y: r + 0.45, z: b[1] }); } break; } });
    // ключ от перегородки лежит на своём ярусе: чаще в ящике. Первый — на ступне с обратной стороны ноги, второй — на первом кольце в стороне от двери
    const hideKey = (n, x, y, z) => { const inCrate = chance(0.6); LEVEL.keys.push({ x, y: y + 0.5, z, gate: n, crate: inCrate }); if (inCrate) LEVEL.crates.push({ x, y, z, key: true, gate: n }); };
    { let done = false; for (let tr = 0; tr < 40 && !done; tr++) { const g = ri(2, 3), c = P3(g, ri(-6, 6), 2, 8); if (LEVEL.crates.some(q => q.y === 2 && Math.abs(q.x - c[0]) + Math.abs(q.z - c[2]) < 1.5)) continue; hideKey(1, c[0], 2, c[2]); done = true; } if (!done) { const c = P3(2, 0, 2, 8); hideKey(1, c[0], 2, c[2]); } }
    { let done = false; for (let tr = 0; tr < 40 && !done; tr++) { const S2 = SIDES[2], q = S2.P[ri(1, S2.P.length - 1)], t = ri(q[0], q[1]), y = S2.base + q[2]; if (!cellOK(2, t, y) || y >= RINGS[1] - 1) continue; const c = lane(2, t); hideKey(2, c[0], y, c[1]); done = true; }   // синий ключ — выше по пути, на северной стороне второго яруса: за ним надо подняться и повернуть мир
      for (let tr = 0; tr < 90 && !done; tr++) { const g = tr < 60 ? 0 : ri(0, 3), t = ri(-6, 6); if (!cellOK(g, t, RINGS[0])) continue; const c = lane(g, t); hideKey(2, c[0], RINGS[0], c[1]); done = true; }
      if (!done) { const G0 = LEVEL.gates[0], c = lane(G0.g, -G0.t + (G0.t > 0 ? 2 : -2)); LEVEL.keys.push({ x: c[0], y: RINGS[0] + 0.5, z: c[1], gate: 2 }); } }
    // укрытия: выемка в стене прямо за уступом, на две клетки — в неё можно зайти (W + прыжок) и переждать
    LEVEL.niches = 0; { const wallC = (g, t) => [[t, 7], [7, -t], [-t, -7], [-7, t]][g], cand = [];
      for (const c of cubes.values()) { if (c.kind !== 'ledge' || c.y < (LEVEL.shinTop || 0) + 1 || hasCube(c.x, c.y + 1, c.z)) continue;   /* у голени стены нет — ниш там нет */ for (let g = 0; g < 4; g++) { if (c.x * FN2[g][0] + c.z * FN2[g][1] !== 8) continue; const t = tOfG(g, c); if (Math.abs(t) <= 6) cand.push([g, t, c.y + 1]); } }
      const made = []; for (const [g, t, y] of shuf(cand)) { if (LEVEL.niches >= 8) break; if (!cellOK(g, t, y) || !cellOK(g, t + 1, y) || made.some(m => m[0] === g && Math.abs(m[1] - t) < 5 && Math.abs(m[2] - y) < 4)) continue;
        const wallOK = n => { for (let tt = t - 1; tt <= t + n; tt++) for (const yy of [y - 1, y, y + 1, y + 2]) { const wc = wallC(g, tt), q = cubes.get(ckey(wc[0], yy, wc[1])); if (!q || q.kind !== 'core' || q.br || q.br2) return false; }
          return !LEVEL.pipes.some(q => q.pts.some(pt => pt[0] * FN2[g][0] + pt[2] * FN2[g][1] > 7 && tOfG(g, { x: pt[0], z: pt[2] }) > t - 1.2 && tOfG(g, { x: pt[0], z: pt[2] }) < t + n + 0.2 && pt[1] > y - 0.5 && pt[1] < y + 2.5)); };
        const nw = t + 2 <= 6 && cellOK(g, t + 2, y) && wallOK(3) ? 3 : wallOK(2) ? 2 : 0; if (!nw) continue;   // три клетки в ширину, если помещается: есть где разминуться с роботом снаружи
        for (let tt = t; tt < t + nw; tt++) { const wc = wallC(g, tt); for (const yy of [y, y + 1]) { cubes.delete(ckey(wc[0], yy, wc[1])); LEVEL.carved.add(ckey(wc[0], yy, wc[1])); } const fl = cubes.get(ckey(wc[0], y - 1, wc[1])); if (fl) fl.rec = true; } made.push([g, t, y]); LEVEL.niches++; }
      // v309 (Алексей 26.10: «на самом нижнем уровне всегда ниша, иногда две»): ярус до первого кольца — хотя бы одна, в 40% карт — две;
      // если там не нашлось места по строгим правилам — берём любую клетку пути у стены ноги этого яруса (уступ или ровный верх), ширина 2
      { const NR = rng(((LEVEL.seed | 0) + 3131) >>> 0), lowY = RINGS[0], want = NR() < 0.4 ? 2 : 1,   /* свой ГСЧ — остальная карта не сдвигается */ carve = (g, t, y, nw) => { for (let tt = t; tt < t + nw; tt++) { const wc = wallC(g, tt); for (const yy of [y, y + 1]) { cubes.delete(ckey(wc[0], yy, wc[1])); LEVEL.carved.add(ckey(wc[0], yy, wc[1])); } const fl = cubes.get(ckey(wc[0], y - 1, wc[1])); if (fl) fl.rec = true; } made.push([g, t, y]); LEVEL.niches++; };
        /* v311 (Алексей: «облазил весь нижний уровень — ни одной ниши»): ниши v309 вставали на высоте кольца (y=13), а низ — это голень, у неё стена
           не на глубине 7, а ближе (тонкая нога). Теперь ищем стену любой глубины k (3..7): снаружи клетка пути с полом, в стене — ядро, за ним тоже ядро */
        const low = () => made.filter(m => m[2] < lowY).length, wK = (g, t, k) => [[t, k], [k, -t], [-t, -k], [-k, t]][g], core = (q) => q && q.kind === 'core' && !q.br && !q.br2;
        const okK = (g, t, y, k) => { for (let tt = t - 1; tt <= t + 2; tt++) for (const yy of [y - 1, y, y + 1, y + 2]) { const a = wK(g, tt, k), bk = wK(g, tt, k - 1), ok = yy < y ? q => !!q : core; if (!ok(cubes.get(ckey(a[0], yy, a[1]))) || !ok(cubes.get(ckey(bk[0], yy, bk[1])))) return false; }
          for (let tt = t; tt <= t + 1; tt++) { const o = wK(g, tt, k + 1); if (hasCube(o[0], y, o[1]) || hasCube(o[0], y + 1, o[1]) || !hasCube(o[0], y - 1, o[1])) return false; }
          return !LEVEL.doors.some(d => d.f === g && Math.abs(tOfG(g, d) - t) < 2.6 && Math.abs(d.y - y) < 2.5) && !(LEVEL.ladders || []).some(L => L.f % 4 === g && Math.abs(L.t - t - 0.5) < 2.5 && L.y0 - 1 < y + 2 && L.y1 + 1 > y); };
        const c2 = []; for (let g = 0; g < 4; g++) for (let k = 3; k <= 7; k++) for (let t = -k + 2; t <= k - 3; t++) for (let y = 1; y + 1 < lowY - 1; y++) if (okK(g, t, y, k)) c2.push([g, t, y, k]);
        for (let i = c2.length - 1; i > 0; i--) { const j = Math.floor(NR() * (i + 1)); [c2[i], c2[j]] = [c2[j], c2[i]]; }
        for (const [g, t, y, k] of c2) { if (low() >= want) break; if (made.some(m => m[0] === g && Math.abs(m[1] - t) < 4 && Math.abs(m[2] - y) < 3)) continue;
          for (let tt = t; tt < t + 2; tt++) { const wc = wK(g, tt, k); for (const yy of [y, y + 1]) { cubes.delete(ckey(wc[0], yy, wc[1])); LEVEL.carved.add(ckey(wc[0], yy, wc[1])); } const fl = cubes.get(ckey(wc[0], y - 1, wc[1])); if (fl) fl.rec = true; }
          made.push([g, t, y, k]); LEVEL.niches++; } }
      if (typeof window !== 'undefined') window.__niches = made.map(m => m.slice());   // для проверок
      // ключ от перегородки иногда спрятан в нише своего яруса — взять его можно, только зайдя в нишу
      for (const n of [1, 2]) if (chance(0.35)) { const k = LEVEL.keys.find(q => q.gate === n), ok = made.filter(m => n === 1 ? LEVEL.path.some(q => q.f <= 1 && q.f % 4 === m[0] && q.top === m[2] && m[1] >= q.a && m[1] <= q.b) : m[2] === RINGS[0] || LEVEL.path.some(q => (q.f === 2 || q.f === 3) && q.f % 4 === m[0] && q.top === m[2] && m[1] >= q.a && m[1] <= q.b));
        if (k && ok.length) { const m = ok[ri(0, ok.length - 1)], wc = m[3] ? [[m[1], m[3]], [m[3], -m[1]], [-m[1], -m[3]], [-m[3], m[1]]][m[0]] : wallC(m[0], m[1]); LEVEL.crates = LEVEL.crates.filter(c => !(c.key && c.gate === n)); k.x = wc[0]; k.z = wc[1]; k.y = m[2] + 0.5; k.crate = false; k.niche = true; } } }
    // сердечки: редко, по одному на верхние ярусы
    LEVEL.prom = window.__startKit ? { x: LEVEL.start.x + 3, y: LEVEL.start.y + 0.5, z: LEVEL.start.z } : null;   // v230: у выхода из туннеля ничего нет (Алексей 13.10); для теста — клавиша T; старые проверки включают window.__startKit
    { const S0 = LEVEL.start, Y = Math.round(S0.y), Z = Math.round(S0.z), free = dx => hasCube(Math.round(S0.x + dx), Y - 1, Z) && !hasCube(Math.round(S0.x + dx), Y, Z) && !hasCube(Math.round(S0.x + dx), Y + 1, Z);   /* сапоги лежат у старта, пока всё тестируем */
      const offs = [5, -2, 6, -3, 7, -4, 4, 8, 2, 1].filter(free); LEVEL.items = ['spider', 'hermes'].map((kind, i) => ({ kind, x: S0.x + (offs[i] !== undefined ? offs[i] : 1 + i), y: S0.y + 0.45, z: S0.z })); LEVEL.forkAt = { x: S0.x + (offs[2] !== undefined ? offs[2] : 2), y: S0.y + 0.45, z: S0.z }; if (!window.__startKit) { LEVEL.items = []; LEVEL.forkAt = null; } }   // «Руки Прометея» пока лежат у самого старта
    { const q = SIDES[0].P[1], c = lane(0, q[0]); LEVEL.knife = { x: c[0], y: SIDES[0].base + q[2] + 0.5, z: c[1] }; }   // нож лежит в самом начале пути
    LEVEL.hearts = []; for (const zr of [[RINGS[0] + 1, RINGS[1] - 2], [RINGS[1] + 1, H]]) if (chance(0.65)) for (let tr = 0; tr < 60; tr++) { const g = ri(0, 3), t = ri(-6, 6), y = ri(zr[0], zr[1]); if (!cellOK(g, t, y)) continue; const c = lane(g, t); LEVEL.hearts.push({ x: c[0], y: y + 0.5, z: c[1] }); break; }
    // лужи: выемка в уступе, в ней вода
    LEVEL.puddles = []; { let pools = 0; const rows = [];   // бассейн: две-три клетки уступа на треть ниже соседних, в углублении вода
      for (let g = 0; g < 4; g++) for (let y = 3; y <= H; y++) for (let t = -6; t <= 5; t++) rows.push([g, y, t]);
      for (const [g, y, t] of shuf(rows)) { if (pools >= 7) break; const n = ri(2, 3), ledge = tt => { const c = lane(g, tt), q = cubes.get(ckey(c[0], y - 1, c[1])); return q && q.kind === 'ledge' && !q.pool ? q : null; }; let ok = t + n <= 7;
        for (let k = 0; k < n && ok; k++) if (!ledge(t + k) || !cellOK(g, t + k, y)) ok = false; if (!ok) continue;
        { const a = lane(g, t - 1), b = lane(g, t + n); if (!hasCube(a[0], y - 1, a[1]) || !hasCube(b[0], y - 1, b[1]) || (cubes.get(ckey(a[0], y - 1, a[1])) || {}).pool || (cubes.get(ckey(b[0], y - 1, b[1])) || {}).pool) continue; }   // по краям остаются бортики
        if (LEVEL.puddles.some(o => o.f === g && Math.abs(o.y - y) < 3 && Math.abs(tOfG(g, o) - t) < 6)) continue;
        for (let k = 0; k < n; k++) { const q = ledge(t + k); q.pool = true; LEVEL.puddles.push({ x: q.x, y, z: q.z, f: g }); } pools++; } }
    LEVEL.lamps = LEVEL.lamps.filter(q => { for (let yy = Math.floor(q.y - q.len - 0.5); yy <= Math.floor(q.y - 0.1); yy++) if (hasCube(Math.round(q.x), yy, Math.round(q.z))) return false; return true; }); }
  { const tOf = (g, o) => [o.x, -o.z, -o.x, o.z][g], gOf = o => o.z === 8 ? 0 : o.x === 8 ? 1 : o.z === -8 ? 2 : 3, nearO = (q, c, y) => Math.abs(q.y - y) < 1.2 && Math.abs(q.x - c[0]) + Math.abs(q.z - c[1]) < 1.1;
    const stand = (g, t, y) => { const c = lane(g, t), q = cubes.get(ckey(c[0], y - 1, c[1])); return !!q && !q.pool && !q.br && !q.br2 && freeCol(g, t, y, y + 1); };
    const good = (g, t, y) => { if (!stand(g, t, y) || !freeCol(g, t, y, y + 7)) return false; for (let dy = 4; dy <= 6; dy++) for (const dt of [-2, -1, 1, 2]) if (Math.abs(t + dt) <= 7 && stand(g, t + dt, y + dy)) return true; return false; };
    if (!LEVEL.vents.length) LEVEL.vents.push({ x: 0, y: -99, z: 8, power: 11.7, fresh: true });   // хотя бы один клапан на уровне
    for (const v of LEVEL.vents) { const g0 = gOf(v), t0 = tOf(g0, v); if (good(g0, t0, v.y)) continue; const cand = []; if (v.fresh) v.y = ri(6, H - 8);
      for (let g = 0; g < 4; g++) for (let t = -6; t <= 6; t++) for (let y = 2; y <= H - 5; y++) { if (!good(g, t, y) || liftZone(g, t, y + 0.5)) continue; const c = lane(g, t);
        if (LEVEL.doors.some(d => d.f === g && Math.abs(tOf(g, d) - t) < 1.6 && Math.abs(d.y - y) < 1.5) || LEVEL.ladders.some(L => L.f % 4 === g && Math.abs(L.t - t) < 1.1 && L.y0 < y + 1.5 && L.y1 > y - 0.5)) continue;
        if (LEVEL.fires.some(q => nearO(q, c, y)) || LEVEL.crates.some(q => nearO(q, c, y)) || LEVEL.keys.some(q => nearO(q, c, y + 0.5)) || (LEVEL.hearts || []).some(q => nearO(q, c, y + 0.5))) continue;
        cand.push([c[0], y, c[1], Math.abs(y - v.y)]); }
      if (cand.length) { cand.sort((a, b) => a[3] - b[3]); const q = cand[ri(0, Math.min(5, cand.length - 1))]; v.x = q[0]; v.y = q[1]; v.z = q[2]; } else v.off = true; }
    LEVEL.vents = LEVEL.vents.filter(v => !v.off); }
  if (LEVEL.newBody) buildInteriorRoutes({ ri, chance, shuf, R, lane, liftZone });   // комнаты внутри титана, путь по груди, кабина

  // всё, по чему можно лезть: лестницы и вертикальные куски труб
  LEVEL.climbs = LEVEL.ladders.map(L => { const r = L.r || 8, c = [[L.t, r], [r, -L.t], [-L.t, -r], [-r, L.t]][L.f % 4]; return { x: c[0], z: c[1], y0: L.y0, y1: L.y1, d: r }; });
  for (const q of LEVEL.pipes) for (let i = 0; i + 1 < q.pts.length; i++) { const a = q.pts[i], c2 = q.pts[i + 1]; if (a[0] === c2[0] && a[2] === c2[2] && Math.abs(a[1] - c2[1]) > 0.9 && Math.max(Math.abs(a[0]), Math.abs(a[2])) > 7.5) { const wallAx = v => { const f = Math.abs(v) % 1; return f > 0.88 && f < 0.995; }, d = wallAx(a[2]) ? Math.round(Math.abs(a[2])) : wallAx(a[0]) ? Math.round(Math.abs(a[0])) : 8;   // глубина — по оси, где труба прижата к стене (координата …,95)
    LEVEL.climbs.push({ x: a[0], z: a[2], y0: Math.min(a[1], c2[1]), y1: Math.max(a[1], c2[1]) + 0.13, pipe: true, d }); } }
  // снаружи провода редко: свисают пучком из-под уступа пути; по длинным можно лезть
  if (typeof WIRES !== 'undefined') for (const q of LEVEL.path) { if (q.top < 6 || !chance(0.09)) continue; const i = ri(0, WIRES.V.length - 1), h = WIRES.V[i][3] / 40, t = chance(0.5) ? q.a : q.b, c = lane(q.f, t), top = q.top - 1;
    let ok = true; for (let y = Math.floor(top - h - 0.5); y < top; y++) if (hasCube(c[0], y, c[1])) ok = false; if (!ok) continue;
    const FN3 = [[0, 1], [1, 0], [0, -1], [-1, 0]][q.f % 4]; LEVEL.wsprites.push({ g: 'V', i, x: c[0] - FN3[0] * 0.2, y: top, z: c[1] - FN3[1] * 0.2, f: q.f % 4, out: true }); }   /* снаружи провода только для вида: лезть по ним нельзя (мешали бы тропе) */
  LEVEL.climbs = LEVEL.climbs.concat(LEVEL.wireClimbs || []);
  LEVEL.beams = []; for (const q of LEVEL.pipes) for (let i = 0; i + 1 < q.pts.length; i++) { const a = q.pts[i], c2 = q.pts[i + 1]; if (Math.abs(a[1] - c2[1]) < 0.01 && Math.hypot(a[0] - c2[0], a[2] - c2[2]) > 0.95 && Math.max(Math.abs(a[0]), Math.abs(a[2])) > 7.9 && Math.max(Math.abs(c2[0]), Math.abs(c2[2])) > 7.9) LEVEL.beams.push([a, c2]); }   // все горизонтальные трубы на стене (и декоративные, и на торсе): по ним ходят   // горизонтальные куски труб: по ним ходят
  LEVEL.decor = [];
  { const busy = (x, y, z) => LEVEL.doors.some(q => Math.abs(q.x - x) < 1.2 && Math.abs(q.z - z) < 1.2 && Math.abs(q.y - y) < 1) || LEVEL.crates.some(q => Math.abs(q.x - x) < 0.9 && Math.abs(q.z - z) < 0.9 && Math.abs(q.y - y) < 1) || LEVEL.vents.some(q => Math.abs(q.x - x) < 0.9 && Math.abs(q.z - z) < 0.9 && Math.abs(q.y - y) < 1);
    const IND = ['stub0', 'stub1', 'stub2', 'stub3', 'arch0', 'arch1', 'arch2', 'arch3'], WOOD = ['branch0', 'branch1', 'branch2', 'branch3'];
    const tryPut = (f, t, top, r) => { const hsh = Math.abs(((f + 3) * 73856093) ^ (Math.round(t * 2 + 40) * 19349663) ^ (top * 83492791)) % 1000, c = P3(f, t, 0, r);
      const pw = top <= 2 ? 300 : 240; if (hsh >= pw || busy(c[0], top, c[2])) return;
      const wood = hsh % 10 < (top <= 2 ? 6 : top < 14 ? 4 : 2), list = wood ? WOOD : IND;
      LEVEL.decor.push({ x: c[0], y: top, z: c[2], f: f % 4, spr: list[(hsh >> 2) % list.length], flip: !!(hsh & 2) }); };
    for (let f = 0; f < 4; f++) for (let t = -8.6; t <= 8.6; t += 0.8) tryPut(f, t, 2, 9);
    for (const c of cubes.values()) if (c.kind === 'ledge' && c.y >= 2 && !hasCube(c.x, c.y + 1, c.z)) for (let f = 0; f < 4; f++) { const N = [[0, 1], [1, 0], [0, -1], [-1, 0]][f]; if (c.x * N[0] + c.z * N[1] !== 8) continue; const t = [c.x, -c.z, -c.x, c.z][f]; if (Math.abs(t) > 7) continue; tryPut(f, t - 0.25, c.y + 1, 8); tryPut(f, t + 0.25, c.y + 1, 8); }
  }
  { const FN1 = [[0, 1], [1, 0], [0, -1], [-1, 0]], wallC = (g, t) => [[t, 7], [7, -t], [-t, -7], [-7, t]][g], tOf1 = (g, x, z) => [x, -z, -x, z][g]; LEVEL.recesses = 0;
    for (let g = 0; g < 4; g++) for (let n = 0, tries = 0, want = ri(2, 4); n < want && tries < 70; tries++) { const w = ri(2, 4), h = ri(2, 4), a = ri(-7, 8 - w), y0 = ri(3, (g === 2 ? H - 8 : H - 4) - h); let ok = true;
      for (let t = a - 1; t <= a + w && ok; t++) for (let y = y0 - 1; y <= y0 + h && ok; y++) { const wc = wallC(g, Math.max(-7, Math.min(7, t))), q = cubes.get(ckey(wc[0], y, wc[1])), lc = lane(g, t); if (!q || q.kind !== 'core' || q.br || q.br2 || (y >= y0 && hasCube(lc[0], y, lc[1]))) ok = false; }   // под выемкой уступ может быть: с него в неё и запрыгивают
      if (ok && LEVEL.doors.some(d => d.f === g && tOf1(g, d.x, d.z) >= a - 1.5 && tOf1(g, d.x, d.z) <= a + w + 0.5 && d.y >= y0 - 2 && d.y <= y0 + h)) ok = false;
      if (ok) for (const q of LEVEL.pipes) for (const pt of q.pts) { const dd = pt[0] * FN1[g][0] + pt[2] * FN1[g][1], tt = tOf1(g, pt[0], pt[2]); if (dd > 7 && dd < 8.6 && tt > a - 1.2 && tt < a + w + 0.2 && pt[1] > y0 - 1 && pt[1] < y0 + h + 1) ok = false; }
      if (ok && LEVEL.steams.some(q => { const dd = q.x * FN1[g][0] + q.z * FN1[g][1], tt = tOf1(g, q.x, q.z); return dd > 7 && tt > a - 1.5 && tt < a + w + 0.5 && q.y > y0 - 1.5 && q.y < y0 + h + 1.5; })) ok = false;
      if (!ok) continue; for (let t = a; t < a + w; t++) { for (let y = y0; y < y0 + h; y++) { const wc = wallC(g, t); cubes.delete(ckey(wc[0], y, wc[1])); LEVEL.carved.add(ckey(wc[0], y, wc[1])); } const fl = cubes.get(ckey(wallC(g, t)[0], y0 - 1, wallC(g, t)[1])); if (fl) fl.rec = true; } n++; LEVEL.recesses++; } }
  LEVEL.wet = LEVEL.pipes.filter(q => q.out).map(q => q.pts[q.pts.length - 1]);
  if (!LEVEL.newBody) LEVEL.towerTop = LEVEL.exitY;
  LEVEL.door = null; LEVEL.eye = null; LEVEL.eyeSpot = undefined; LEVEL.soleY = undefined; LEVEL.pipesFixed = null;
  // Руки титана собраны из тех же кубов, что и нога (те же плитки, мох, скобы), но живут отдельно: каждая часть — своя группа далеко над миром
  // (y от 1000), а рисуется повёрнутой на своём месте у плеча. Координаты в группе — от шарнира: вниз по y, наружу по z.
  if (LEVEL.newBody) { LEVEL.armGroups = []; const AR = rng(seed + 4242);
    const grp = (part, rows, hw, hd, ledges, extra) => { const gi = LEVEL.armGroups.length, gy = 1000 + gi * 60, G = { part, gy, piv: 0, rows, hw, ledges: ledges || [], mz: 1 }, sd = /-1$/.test(part) ? -1 : 1;   /* v280: z в группе — как в мире (у левой руки зеркально), mz: 1 */
      for (let r = 1; r <= rows; r++) { const w = typeof hw === 'function' ? hw(r) : hw, d = typeof hd === 'function' ? hd(r) : hd;
        for (let z = -w; z <= w; z++) for (let x = -d; x <= d; x++) addCube(x, gy - r, sd * z, 'core');
        if (AR() < 0.35 && r > 1 && r < rows) { const z0 = Math.floor(AR() * (2 * w - 2)) - w + 1; for (let z = z0; z < z0 + 2; z++) addCube(d + 1, gy - r, sd * z, 'core'); } }   // наросты плит спереди
      for (const L of G.ledges) for (let k = 1; k <= L.n; k++) for (let x = -1; x <= 1; x++) { const w = typeof hw === 'function' ? hw(L.r) : hw; addCube(x, gy - L.r, sd * L.o * (w + k), 'ledge'); }
      if (extra) extra(gy); LEVEL.armGroups.push(G); return G; };
    for (const side of [1, -1]) {
      grp('upper' + side, 15, r => r <= 3 || r === 8 ? 4 : 3, r => r <= 3 ? 4 : 3, [{ r: 5, o: -1, n: 2 }, { r: 9, o: 1, n: 2 }, { r: 13, o: -1, n: 2 }]);
      grp('fore' + side, 12, r => r <= 3 ? 4 : 3, 3, [{ r: 3, o: 1, n: 2 }, { r: 7, o: -1, n: 2 }, { r: 10, o: 1, n: 2 }]);
      grp('palm' + side, 7, 5, 2, []);
      for (let f = 0; f < 3; f++) { grp('f' + f + 'a' + side, 4, 1, 1, []); grp('f' + f + 'b' + side, 3, 1, 1, []); }
      grp('th' + side, 4, 1, 1, []);
    }
    // v280 (Алексей 21.10: «на руках лазать как по ногам»): лестницы на плече и предплечье, с обеих сторон (видны с востока и с запада).
    // Внутренняя сторона — сквозной путь снизу доверху (лестница предплечья заходит за локоть, плеча — ниже локтя: переход без разрыва),
    // внешняя — от уступа до верха. lz — поперёк руки (наружу +), в группе z = lz у правой руки и −lz у левой.
    // v280 (Алексей 21.10: «лестница на лестнице, выглядит странно»): у локтя лаз заходит в соседний кусок (переход без срыва), но нарисована
    // лестница только в пределах своего куска — от нижнего края до верхнего; дальше её продолжает лестница соседнего куска
    const armLad = (G, lz, y0, y1) => { const sd = /-1$/.test(G.part) ? -1 : 1, zp = sd * lz, r = 5, v0 = Math.max(y0, G.gy - G.rows), v1 = Math.min(y1, G.gy);
      for (const f of [1, 3]) { const t = f === 1 ? -zp : zp, L = { f, t, y0, y1, vy0: v0, vy1: v1, r, ak: 1 }; LEVEL.ladders.push(L); const c = lanePosR(f, t, r); LEVEL.climbs.push({ x: c[0], z: c[1], y0, y1, d: r }); } };
    for (const G of LEVEL.armGroups) { const k = G.part.replace(/-?1$/, '');
      if (k === 'upper') { armLad(G, -4.6, G.gy - G.rows - 2.5, G.gy); armLad(G, 4.6, G.gy - 8, G.gy); }
      if (k === 'fore') armLad(G, -4.6, G.gy - G.rows - 0.5, G.gy + 2.5); } }   /* v283: снаружи предплечья вместо лестницы — труба (armDress) */
  if (!LEVEL.noShin) { // голая стена голени у пола: на свободной стороне — служебная полка на балках, на ней осколок или ящик, под ней лампа
    LEVEL.shelves = 0; const freeCol = (f, t, y0, y1) => { const c = lane(f, t); for (let y = y0; y <= y1; y++) { const q = cubes.get(ckey(c[0], y, c[1])); if (q && !(q.bulge && y <= SHIN + 1)) return false; } return true; };   /* наросты у голени всё равно уберут */ for (let f = 0; f < 4; f++) { if (!freeCol(f, 0, 2, SHIN) && !freeCol(f, -2, 2, SHIN) && !freeCol(f, 2, 2, SHIN)) continue;
      for (let tr = 0; tr < 12; tr++) { const w = ri(2, 3), a = ri(-4, 4 - w + 1), b = a + w - 1, Y = ri(3, 4); let ok = true;
        for (let t = a - 1; t <= b + 1 && ok; t++) if (!freeCol(f, t, Y - 1, Y + 3)) ok = false;
        if (ok && LEVEL.doors.some(d => d.f === f && d.y > Y - 3 && d.y < Y + 4) || ok && LEVEL.ladders.some(l => l.f % 4 === f && Math.abs(l.t - (a + b) / 2) < w && l.y0 < Y + 3 && l.y1 > Y - 2) || ok && LEVEL.pipes.some(q => q.pts.some(p => p[1] > Y - 1 && p[1] < Y + 2.2 && p[0] * [0, 1, 0, -1][f] + p[2] * [1, 0, -1, 0][f] > 6 && [p[0], -p[2], -p[0], p[2]][f] > a - 1.6 && [p[0], -p[2], -p[0], p[2]][f] < b + 1.6))) ok = false;
        if (!ok) continue; put(f, a, b, Y + 1, 'ledge'); LEVEL.shelves++;
        const c = lane(f, chance(0.5) ? a : b); if (chance(0.5)) LEVEL.crates.push({ x: c[0], y: Y + 1, z: c[1] }); else LEVEL.bits.push({ x: c[0], y: Y + 1.45, z: c[1] });
        if (chance(0.6)) { const t = chance(0.5) ? a : b, lc = lane(f, t); LEVEL.lamps.push({ x: lc[0], y: Y, z: lc[1], f, len: 0.8, th: 0.15, om: 0, bob: 0, bv: 0, ph: R() * 6 }); }
        break; } } }
  if (!LEVEL.noShin) shinBuild(SHIN);
  { // v230: на первом ярусе (до кольца 13) — не больше трёх роботов, из них обходчиков у подножия не больше двух (Алексей 13.10: «новый игрок должен потестить механики, прижиться»)
    // выбор без R(): дальше по генерации случайность не сдвигается
    const hs = (r, i) => ((Math.round(r.x * 31 + r.z * 17 + r.y * 7) + (LEVEL.seed || 1) % 997 + i * 131) % 101 + 101) % 101, low = LEVEL.robots.filter(r => r.y < RINGS[0] && r.y > -5 && !r.taxi && !r.lift && !r.key);
    const ord = a => a.map((r, i) => [hs(r, i), r]).sort((p, q) => p[0] - q[0]).map(p => p[1]), keep = new Set(ord(low.filter(r => r.loop)).slice(0, 2));
    for (const r of ord(low.filter(r => !r.loop))) if (keep.size < 3) keep.add(r);
    LEVEL.robots = LEVEL.robots.filter(r => !low.includes(r) || keep.has(r)); LEVEL.lowBots = keep.size; }
  { // горбы: один-два куба торчат прямо из ровного пола, а рядом пусто — убираем (кроме кусков пути и того, к чему что-то приделано)
    const lane8 = (f, t) => [[t, 8], [8, -t], [-t, -8], [-8, t]][f], onPath = (f, t, y) => LEVEL.path.some(q => q.f % 4 === f && q.top - 1 === y && t >= q.a && t <= q.b);
    const used = (x, y, z) => LEVEL.doors.some(d => Math.abs(d.x - x) < 1.6 && Math.abs(d.z - z) < 1.6 && Math.abs(d.y - y) < 2.5) || LEVEL.ladders.some(l => { const c = lane8(l.f % 4, l.t); return Math.abs(c[0] - x) + Math.abs(c[1] - z) < 1.6 && y >= l.y0 - 1.5 && y <= l.y1 + 0.5; }) || LEVEL.lifts.some(L => Math.abs(L.x - x) + Math.abs(L.z - z) < 2.2 && y > L.y0 - 2 && y < L.y1 + 2);
    LEVEL.humps = 0; for (let f = 0; f < 4; f++) for (let y = 2; y < 80; y++) { const has = t => hasCube(...((c => [c[0], y, c[1]])(lane8(f, t)))), under = t => hasCube(...((c => [c[0], y - 1, c[1]])(lane8(f, t)))), upN = t => { const c = lane8(f, t); return hasCube(c[0], y + 1, c[1]) || hasCube(c[0], y + 2, c[1]); };
      for (let t = -7; t <= 7; t++) { if (!has(t) || has(t - 1)) continue; let e = t; while (e + 1 <= 8 && has(e + 1)) e++;
        if (e - t <= 1 && e <= 7 && under(t) && under(e) && under(t - 1) && under(e + 1) && !has(e + 1) && ![t - 2, t - 1, e + 1, e + 2].some(upN) && ![t, e].some(tt => upN(tt) || onPath(f, tt, y) || used(...((c => [c[0], y, c[1]])(lane8(f, tt)))))) {
          for (let tt = t; tt <= e; tt++) { const c = lane8(f, tt); cubes.delete(ckey(c[0], y, c[1])); } LEVEL.humps++; LEVEL.crates = LEVEL.crates.filter(o => !(Math.abs(o.y - y - 1) < 0.6 && [t, e].some(tt => { const c = lane8(f, tt); return Math.abs(o.x - c[0]) + Math.abs(o.z - c[1]) < 0.6; }))); }
        t = e; } } }
  for (const c of cubes.values()) c.top = !hasCube(c.x, c.y + 1, c.z);
  { // v230: лампы на ноге — только там, куда можно залезть (Алексей 13.10): под лампой рядом верх уступа или тумбы (не пол и не плинтус); длинные шнуры-лазы остаются
    const before = LEVEL.lamps.length, tops = [...cubes.values()].filter(c => c.top && c.y >= 3 && c.y < (LEVEL.pelY || 32) && c.y < 2500);
    LEVEL.lamps = LEVEL.lamps.filter(L => { if (L.long || L.y > 2500 || L.y >= (LEVEL.pelY || 32) - 1) return true; const bulb = L.y - (L.len || 1);
      return tops.some(c => Math.abs(c.x - L.x) <= 1.6 && Math.abs(c.z - L.z) <= 1.6 && c.y + 1 <= bulb + 0.6 && c.y + 1 >= bulb - 2.6); });
    LEVEL.lampsNoClimb = before - LEVEL.lamps.length; }
  for (const c of cubes.values()) if (c.cons) c.top = false;   /* консоли голени — не опора: сбоку их видно, но по ним не ходят */
  placeStairs();   /* v287: ступенчатые марши между площадками (13j_stairs.js) */
  placeWallGears();   /* v269: шестерни в стене (13g_wgears.js, свой ГСЧ) */
  armDress();   /* v283: руки как ноги — шестерни под уступами, труба на предплечье (13i_armworld.js) */
  lootItems();   /* v286: нож, руки Прометея, вилка, сапоги — в ящиках внутренних комнат (01b_rooms.js) */
  placeGrips();   /* v265: ухваты по внешним стенам (13f_grips.js, свой ГСЧ) */
  placeHydrants();   /* v307: гидранты у огней (13m_hydrants.js) */
  placeCams();   /* v305: камеры-наблюдатели (13l_cams.js) */
  placeScreens();   /* v301: экраны — последними, чтобы не сдвигать ухваты (иначе карта меняется) */
  if (!noFaces) buildFaces();
}


// Голень тоньше бедра: уступы пути остаются на прежнем кольце вокруг ноги, а к тонкой голени их держат консоли —
// балки из обшивки от уступа до стены голени. Всё, что висело на стене (лампы, трубы), переезжает на стену голени,
// у дверей на голени — свой кожух в стене. На колене — большие шестерни-шарниры.
function shinBuild(SHIN) {
  const FN = [[0, 1], [1, 0], [0, -1], [-1, 0]], faceOf = (x, z) => Math.abs(z) >= Math.abs(x) ? (z > 0 ? 0 : 2) : (x > 0 ? 1 : 3), inShin = y => y >= 1.5 && y < SHIN + 1;
  for (const c of [...cubes.values()]) if (c.bulge && c.y <= SHIN + 1) cubes.delete(ckey(c.x, c.y, c.z));   // наросты обшивки у голени не висят в воздухе
  const cons = [];
  for (const c of cubes.values()) { if (c.y < 2 || c.y > SHIN || c.kind === 'plat' || c.y > 2500 || Math.max(Math.abs(c.x), Math.abs(c.z)) !== 8 || Math.min(Math.abs(c.x), Math.abs(c.z)) > 4) continue;   /* консоли только напротив голени, у углов — нет */
    const g = faceOf(c.x, c.z), N = FN[g]; for (let r = 7; r >= 5; r--) { const x = c.x - N[0] * (8 - r), z = c.z - N[1] * (8 - r); if (!hasCube(x, c.y, z)) cons.push([x, c.y, z]); } }
  { const FN2 = [[0, 1], [1, 0], [0, -1], [-1, 0]], hang = p => { if (p[1] < 1.5 || p[1] > SHIN + 0.6 || p[1] > 2500) return false; const r = Math.max(Math.abs(p[0]), Math.abs(p[2])); if (r < 6.9 || r > 8.05) return false; const g = Math.abs(p[2]) >= Math.abs(p[0]) ? (p[2] > 0 ? 0 : 2) : (p[0] > 0 ? 1 : 3), along = FN2[g][0] ? Math.abs(p[2]) : Math.abs(p[0]); return along > 4.4 && Math.min(Math.abs(p[0]), Math.abs(p[2])) < 7.4; };
    const segHang = q => q.pts.some((p, i) => { if (hang(p)) return true; if (i + 1 >= q.pts.length) return false; const B = q.pts[i + 1], n = Math.ceil(Math.hypot(B[0] - p[0], B[1] - p[1], B[2] - p[2]) / 0.4); for (let k = 1; k < n; k++) { const m = p.map((v, j) => v + (B[j] - v) * k / n), al = Math.min(Math.abs(m[0]), Math.abs(m[2])); if (al > 4.6 && al < 7.0 && hang(m)) return true; } return false; });
    LEVEL.pipes = LEVEL.pipes.filter(q => !segHang(q));
    LEVEL.steams = LEVEL.steams.filter(q => LEVEL.pipes.some(pp => pp.pts.some(e => Math.hypot(e[0] - q.x, e[1] - q.y, e[2] - q.z) < 0.6))); }   /* сопло без своей трубы в воздухе не висит (v266) */   /* трубы сбоку от тонкой голени держать не на чем — их нет */
  // трубы у голени держатся на тех же балках-кронштейнах: через каждые два куба от трубы до стены голени
  for (const q of LEVEL.pipes) for (let i = 0; i + 1 < q.pts.length; i++) { const A = q.pts[i], B2 = q.pts[i + 1], L = Math.hypot(B2[0] - A[0], B2[1] - A[1], B2[2] - A[2]); if (L < 0.5) continue;
    for (let k = 0.5; k < L; k += 2) { const x = A[0] + (B2[0] - A[0]) * k / L, y = A[1] + (B2[1] - A[1]) * k / L, z = A[2] + (B2[2] - A[2]) * k / L; if (y < 2 || y > SHIN + 0.5 || y > 2500) continue; const r = Math.max(Math.abs(x), Math.abs(z)); if (r < 7.3 || r > 8.4) continue;
      const g = faceOf(x, z), N = FN[g], along = Math.abs(N[0]) ? Math.abs(z) : Math.abs(x); if (along > 4.4) continue; for (let rr = 7; rr >= 5; rr--) cons.push([Math.round(x - N[0] * (r - rr)), Math.floor(y), Math.round(z - N[1] * (r - rr))]); } }
  for (const [x, y, z] of cons) { addCube(x, y, z, 'core'); cubes.get(ckey(x, y, z)).cons = true; }
  const inward = (o, k) => { const g = faceOf(o.x, o.z), N = FN[g]; o.x -= N[0] * k; o.z -= N[1] * k; };
  LEVEL.lamps = LEVEL.lamps.filter(L => { if (L.y > 2500 || L.y > SHIN + 1.5) return true;   // лампа у голени висит только под уступом: крепление — к низу ближайшего куба над ней
    const X = Math.round(L.x), Z = Math.round(L.z); for (let y = Math.floor(L.y); y <= Math.floor(L.y) + 4; y++) if (hasCube(X, y, Z)) { const old = L.y; L.y = y; L.len = Math.max(0.6, Math.min(1.6, L.len + (y - old))); return true; } return false; });
  for (const d of LEVEL.doors) { if (d.y > 2500 || !inShin(d.y)) continue; const N = FN[d.f]; for (let k = -1; k <= 1; k++) for (let y = d.y - 1; y <= d.y + 2; y++) for (let r = 5; r <= 7; r++) { const t = [[d.x + k, d.z], [d.x, d.z + k], [d.x - k, d.z], [d.x, d.z - k]][d.f], x = Math.round(t[0] - N[0] * (8 - r)), z = Math.round(t[1] - N[1] * (8 - r)); if (!hasCube(x, y, z) && !(r === 7 && k === 0 && y >= d.y && y <= d.y + 1)) addCube(x, y, z, 'core'); } }   // кожух двери
  { const old = LEVEL.gears || [], keep = old.map((G, i) => G.y > 2500 || G.y - G.R > SHIN + 0.5 || G.lift !== undefined || (LEVEL.pistons || []).some(P => P.gi === i));   // шестерни на пустом месте у голени не висят
    for (let i = 1; i < old.length; i++) if (old[i].pair && !keep[i - 1]) keep[i] = false;   // пара уходит вместе с ведущим колесом
    const map = []; let n = 0; old.forEach((G, i) => { map[i] = keep[i] ? n++ : -1; }); LEVEL.gears = old.filter((G, i) => keep[i]);
    for (const P of LEVEL.pistons || []) P.gi = map[P.gi]; LEVEL.pistons = (LEVEL.pistons || []).filter(P => P.gi >= 0); }
  shinFill(SHIN);
  if (false) for (let g = 0; g < 4; g++) { const N = FN[g]; LEVEL.gears.push({ x: N[0] * 4.6 + N[1] * 2.2, y: SHIN - 1.2, z: N[1] * 4.6 - N[0] * 2.2, f: g, R: 1.6, deco: true, knee: true, drive: (g % 2 ? 1 : -1) * 0.25, rust: 1 }); LEVEL.gears.push({ x: N[0] * 4.6 - N[1] * 1.0, y: SHIN - 0.6, z: N[1] * 4.6 + N[0] * 1.0, f: g, R: 1.2, deco: true, knee: true, drive: 0, pair: true, rust: 0 }); }   // колено-шарнир
}
// v230 (Алексей 13.10: «пустое пространство до блока», «стало меньше труб», «залезть без двойных прыжков»): у подножия узкой голени —
// плинтус в куб высотой между голенью и дорожкой (радиусы 5–7), на нём тумбы-ступени (1–2 куба), по стенам голени — вертикальные трубы.
// Дорожка на радиусе 8 свободна: кубы позади неё не мешают идти, но на их верх можно встать — ступени к первым уступам.
// Случайность — своя, от номера карты: остальная генерация не сдвигается.
function shinFill(SHIN) {
  let s = ((LEVEL.seed || 1) * 7919 + 104729) % 2147483647; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, ri2 = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const at = (g, t, r) => [[t, r], [r, -t], [-t, -r], [-r, t]][g];
  const objs = [].concat(LEVEL.bits || [], LEVEL.crates || [], LEVEL.keys || [], LEVEL.hearts || [], LEVEL.fires || [], LEVEL.steams || []);
  const segNear = (x, y, z) => LEVEL.pipes.some(q => q.pts.some((p, i) => { const B = q.pts[i + 1] || p, n = Math.max(1, Math.ceil(Math.hypot(B[0] - p[0], B[1] - p[1], B[2] - p[2]) / 0.3)); for (let k = 0; k <= n; k++) { const m = [0, 1, 2].map(j => p[j] + (B[j] - p[j]) * k / n); if (Math.abs(m[0] - x) < 0.75 && Math.abs(m[2] - z) < 0.75 && m[1] > y - 0.3 && m[1] < y + 1.3) return true; } return false; }));
  const busy = (x, y, z) => hasCube(x, y, z) || hasCube(x, y + 1, z) && y >= 3 ||
    LEVEL.doors.some(d => d.y < 2500 && Math.abs(d.x - x) < 2.6 && Math.abs(d.z - z) < 2.6 && y >= d.y - 1 && y <= d.y + 2) ||
    Math.abs(LEVEL.start.x - x) < 2.6 && Math.abs(LEVEL.start.z - z) < 2.6 && y < 5 ||
    (LEVEL.gears || []).some(G => G.y < 2500 && Math.hypot(G.x - x, G.z - z) < G.R + 1.1 && Math.abs(G.y - y - 0.5) < G.R + 1.1) ||
    (LEVEL.pistons || []).some(P => Math.abs(P.gx - x) < 1.7 && Math.abs(P.gz - z) < 1.7) ||
    (LEVEL.lifts || []).some(L => Math.abs(L.x - x) < 1.2 && Math.abs(L.z - z) < 1.2) ||
    objs.some(o => o.y < 2500 && Math.abs(o.x - x) < 0.8 && Math.abs(o.z - z) < 0.8 && o.y > y - 0.6 && o.y < y + 1.6) || segNear(x, y, z);
  // v235 (Алексей 18.10: «трубы туманно-серые, будто с фона, с белыми точками, и по ним нельзя лазать»): вместо труб на самой стене голени —
  // обычные лазательные трубы на передней дорожке (радиус 7.95): с пола до края уступа пути, наверху шаг вбок на уступ; держатся на кронштейнах к голени
  LEVEL.shinPipes = 0;
  { const ledgeAt = (g, tt, y) => { const c = at(g, tt, 8), q = cubes.get(ckey(c[0], y, c[1])); return !!q && q.kind === 'ledge' && !hasCube(c[0], y + 1, c[1]); };
    for (let g = 0; g < 4; g++) { const ts = [-3, -2, -1, 0, 1, 2, 3].sort(() => rnd() - 0.5); let made = 0;
      for (const tt of ts) { if (made >= 1) break; const c = at(g, tt, 8); let Y = null, s = 0;
        for (let y = 4; y <= SHIN && Y === null; y++) for (const ds of [-1, 1]) if (ledgeAt(g, tt + ds, y) && !hasCube(c[0], y, c[1]) && !hasCube(c[0], y + 1, c[1])) { Y = y; s = ds; break; }
        if (Y === null) continue; let ok = true; for (let y = 2; y <= Y + 1 && ok; y++) if (hasCube(c[0], y, c[1]) || busy(c[0], y, c[1])) ok = false;
        if (!ok || LEVEL.doors.some(d => d.y < 2500 && Math.abs(d.x - c[0]) + Math.abs(d.z - c[1]) < 2.5 && d.y < Y + 2) || (LEVEL.ladders || []).some(l => l.f % 4 === g && Math.abs(l.t - tt) < 1.5 && l.y0 < Y + 2) || LEVEL.steams.some(o => o.y < 2500 && Math.abs(o.x - c[0]) + Math.abs(o.z - c[1]) < 1.5 && o.y < Y + 2)) continue;
        const P = (y, r) => { const q = at(g, tt, r); return [q[0], y, q[1]]; };
        LEVEL.pipes.push({ shinClimb: g, t: tt, pts: [P(2.4, 7.4), P(2.4, 7.95), P(Y + 1.4, 7.95), P(Y + 1.4, 7.4)] });
        for (let y = 3; y <= Y; y += 2) for (const r of [7, 6, 5]) { const q = at(g, tt, r); if (!hasCube(q[0], y, q[1])) { addCube(q[0], y, q[1], 'core'); cubes.get(ckey(q[0], y, q[1])).cons = true; } }   // кронштейны к голени, как у остальных труб
        made++; LEVEL.shinPipes++; } } }
  // v231: ступень-тумба у насоса старта (Алексей 14.10: «шестерёнка не работает»): без сапог с земли на колесо (верх 1.53) и ползун (1.84) не запрыгнуть, со ступени в куб — да.
  // Ставится в конце генерации; кронштейн трубы прямо над ступенью убирается (соседние держат трубу)
  LEVEL.pumpStep = 0;
  { const P = (LEVEL.pistons || []).find(q => q.start && q.gy < 10); if (P) { const g = P.f % 4, pu = [P.gx, -P.gz, -P.gx, P.gz][g], lane8c = tt => at(g, tt, 8);
    const ok = tt => { const c = lane8c(tt); for (let y = 2; y <= 4; y++) if (hasCube(c[0], y, c[1])) return false;
      for (const r of [5, 6, 7]) { const q = at(g, tt, r); const c2 = cubes.get(ckey(q[0], 2, q[1])); if (c2 && !c2.fill) return false; for (const y of [3, 4]) { const c3 = cubes.get(ckey(q[0], y, q[1])); if (c3 && !(c3.cons && y === 3)) return false; } }
      if (objs.concat(LEVEL.robots.filter(o => o.y < 4)).some(o => o.y < 2500 && Math.abs(o.x - c[0]) + Math.abs(o.z - c[1]) < 1.2 && o.y < 4.5)) return false;
      return !LEVEL.doors.some(d => d.y < 2500 && Math.abs(d.x - c[0]) + Math.abs(d.z - c[1]) < 2.2 && d.y < 6) && !(LEVEL.ladders || []).some(l => l.f % 4 === g && Math.abs(l.t - tt) < 1.2 && l.y0 < 5); };
    const cand = []; for (let tt = Math.floor(pu) - 4; tt <= Math.ceil(pu) + 4; tt++) { const dd = Math.abs(tt - pu); if (dd >= 1.4 && dd <= 2.6 && ok(tt)) cand.push([dd, tt]); } cand.sort((p, q) => p[0] - q[0]);
    if (cand.length) { const t1 = cand[0][1], s = t1 > pu ? 1 : -1, cols = ok(t1 + s) && Math.abs(t1 + s - pu) <= 3.6 ? [t1, t1 + s] : [t1];
      for (const tt of cols) for (const r of [5, 6, 7]) { const q = at(g, tt, r); cubes.delete(ckey(q[0], 3, q[1])); addCube(q[0], 2, q[1], 'core'); Object.assign(cubes.get(ckey(q[0], 2, q[1])), { fill: true, pumpStep: true }); LEVEL.pumpStep++; } P.step = cols.length; } else P.step = 0; } }
  // тумбы-ступени (без сплошного плинтуса: на сплошной полосе позади дорожки герой стоял бы на куб выше пола и роботов):
  // на каждой стороне 1–2 блока от голени до дорожки (радиусы 5–7), шириной 2–3, высотой в куб, у широкого — ещё ступень с одного края;
  // между блоками — пол; в колонке за ящиком, предметом, дверью, лестницей, лифтом, шестернёй — не ставим (иначе встанешь не туда)
  LEVEL.shinFill = 0; const colBusy = (g, t, y) => { const c = at(g, t, 8); for (const r of [5, 6, 7, 8]) { const q = at(g, t, r); if (busy(q[0], y, q[1])) return true; }
    return objs.concat(LEVEL.robots.filter(o => o.y < 4)).some(o => o.y < 2500 && Math.abs(o.x - c[0]) + Math.abs(o.z - c[1]) < 1.6 && o.y < y + 2) || (LEVEL.ladders || []).some(l => l.f % 4 === g && Math.abs(l.t - t) < 1.6 && l.y0 < y + 2) ||
      LEVEL.doors.some(d => d.y < 2500 && Math.abs(d.x - c[0]) + Math.abs(d.z - c[1]) < 3.2 && d.y < y + 3) || Math.abs(LEVEL.start.x - c[0]) + Math.abs(LEVEL.start.z - c[1]) < 3.2; };
  const used = [[], [], [], []];
  for (let g = 0; g < 4; g++) for (let k = 0, n = ri2(1, 2), tr = 0; k < n && tr < 30; tr++) { const w = ri2(2, 3), t0 = ri2(-6, 6 - w + 1), cells = [];
    if (used[g].some(([a, b]) => t0 <= b + 2 && t0 + w - 1 >= a - 2)) continue;
    let bad = false; for (let t = t0; t < t0 + w && !bad; t++) for (const y of [2, 3]) if (colBusy(g, t, y)) bad = true; if (bad) continue;
    for (let t = t0; t < t0 + w; t++) for (const r of [5, 6, 7]) cells.push([at(g, t, r), 2]);
    if (w === 3 && rnd() < 0.7) { const te = rnd() < 0.5 ? t0 : t0 + w - 1; for (const r of [5, 6]) cells.push([at(g, te, r), 3]); }
    if (cells.some(([c, y]) => hasCube(c[0], y, c[1]))) continue;
    for (const [c, y] of cells) { addCube(c[0], y, c[1], 'core'); cubes.get(ckey(c[0], y, c[1])).fill = true; LEVEL.shinFill++; } used[g].push([t0, t0 + w - 1]); k++; }
}
// ====================== ВНУТРИ ТИТАНА ======================
// Помещения — разрез корпуса, как в FEZ: комнаты, коридоры, вентиляционные лазы и шахты с лестницами. Собраны из тех же кубов,
// но лежат далеко над миром (y от 3000), вид внутри всегда с юга (мир не поворачивается). Плоскость хода z = 8, задняя стена z = 7 —
// поэтому лестницы, лампы, трубы и роботы внутри работают так же, как на южной стене ноги.
const ROOM_Y = 3000, ROOM_Z = 8;
const inRoom = () => hero.y > 2500;
const offLeg = () => hero.y > 2500 || hero.y > LEVEL.pelY + 1;      // в таз, на торс и в комнаты облавы не прилетают
function complexAt(y) { return (LEVEL.complexes || []).find(c => y >= c.y0 && y <= c.y1); }
function heroAlt() { if (hero.arm) return Math.max(0, Math.round(heroWorld().y));   /* v280: на руке */
  if (!inRoom()) return Math.max(0, Math.round(hero.y)); const c = complexAt(hero.y); return c ? c.alt : 0; }

// opt: cols, rows, name, alt (высота снаружи — для табло), entry/exit: 'bl' | 'br' | 'tl' | 'tr', bots (сколько роботов), loot (больше добычи)
function makeComplex(T, opt) {
  const { ri, chance, R } = T, Z = ROOM_Z, n = (LEVEL.complexes || (LEVEL.complexes = [])).length, Y0 = ROOM_Y + n * 60;
  const W = [], Hh = []; for (let c = 0; c < opt.cols; c++) W.push(ri(opt.wMin || 6, opt.wMax || 9)); for (let r = 0; r < opt.rows; r++) Hh.push(ri(opt.hMin || 3, opt.hMax || 4));
  const total = W.reduce((a, b) => a + b, 0) + opt.cols - 1, X0 = -Math.floor(total / 2), cx = [], fy = [Y0];
  for (let c = 0, x = X0; c < opt.cols; c++) { cx.push(x); x += W[c] + 1; }
  for (let r = 0; r < opt.rows; r++) fy.push(fy[r] + Hh[r] + 1);
  const xa = X0 - 2, xb = X0 + total + 1, ya = Y0 - 2, yb = fy[opt.rows] + 2;
  for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) addCube(x, y, Z, 'core');   // сплошной разрез корпуса
  const open = new Set(), carve = (x, y) => { const k = ckey(x, y, Z); if (open.has(k)) return; open.add(k); cubes.delete(k); LEVEL.carved.add(k); addCube(x, y, Z - 1, 'core'); };
  for (let c = 0; c < opt.cols; c++) for (let r = 0; r < opt.rows; r++) for (let x = cx[c]; x < cx[c] + W[c]; x++) for (let y = fy[r] + 1; y <= fy[r] + Hh[r]; y++) carve(x, y);
  const busy = new Set(), mark = (x, y) => busy.add(x + ',' + y), isBusy = (x, y) => busy.has(x + ',' + y);   // клетки пола, где уже что-то стоит
  const corner = w => { const c = w.includes('l') ? 0 : opt.cols - 1, r = w.includes('b') ? 0 : opt.rows - 1; return [c, r]; };   // 'bl' — низ слева, 'tr' — верх справа
  const doorIn = (w, i) => { const [c, r] = corner(w), x = w.includes('l') ? cx[c] + 1 : cx[c] + W[c] - 2, y = fy[r] + 1; for (let dy = 0; dy <= 2; dy++) { mark(x - 1, y + dy); mark(x, y + dy); mark(x + 1, y + dy); }
    const d = { x, y, z: Z, f: 0, room: true, spr: ['door0', 'door1', 'door4'][i % 3], flip: chance(0.5) }; LEVEL.doors.push(d); return LEVEL.doors.length - 1; };
  const C = { name: opt.name, alt: opt.alt, y0: ya - 4, y1: yb + 4, x0: xa, x1: xb };
  C.inD = doorIn(opt.entry || 'bl', n); if (opt.exit) C.outD = doorIn(opt.exit, n + 1);
  // связи между комнатами: остов-дерево по сетке и пара лишних проходов
  const id = (c, r) => r * opt.cols + c, seen = new Set([0]), edges = [], stack = [[0, 0]];
  while (stack.length) { const [c, r] = stack[stack.length - 1], nb = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < opt.cols && b < opt.rows && !seen.has(id(a, b)));
    if (!nb.length) { stack.pop(); continue; } const q = nb[Math.floor(R() * nb.length)]; seen.add(id(q[0], q[1])); edges.push([c, r, q[0], q[1]]); stack.push(q); }
  for (let c = 0; c < opt.cols; c++) for (let r = 0; r < opt.rows; r++) { if (c + 1 < opt.cols && chance(0.25)) edges.push([c, r, c + 1, r]); if (r + 1 < opt.rows && chance(0.2)) edges.push([c, r, c, r + 1]); }
  const done = new Set(); edges.sort((p, q) => (p[1] === p[3]) - (q[1] === q[3]));   // сначала люки с лестницами, потом проходы в стенах: ступени лаза не встанут на выход лестницы
  for (const e of edges) { const a = Math.min(e[0], e[2]), b = Math.min(e[1], e[3]), hz = e[1] === e[3], key = (hz ? 'h' : 'v') + a + ',' + b; if (done.has(key)) continue; done.add(key);
    if (hz) { const wx = cx[a] + W[a], f = fy[b];
      let vok = !opt.tunnel && Hh[b] >= 3 && chance(0.3);   /* лаз под потолком — только в высоких комнатах */ for (let x = wx - 2; x <= wx + 2 && vok; x++) for (let y = f + 1; y <= f + 3; y++) if (isBusy(x, y)) vok = false;
      if (vok) {   // вентиляционный лаз: в куб высотой, под потолком — к нему ступени
        carve(wx, f + 3); for (const [x, y] of [[wx - 1, f + 2], [wx - 2, f + 1], [wx + 1, f + 2], [wx + 2, f + 1]]) { const k = ckey(x, y, Z); cubes.set(k, { x, y, z: Z, kind: 'plat' }); mark(x, y); mark(x, y + 1); }
        for (let x = wx - 4; x <= wx + 4; x++) for (let y = f + 1; y <= f + 3; y++) mark(x, y); }   // у ступеней ничего не ставим: полка или ящик перекрыли бы прыжок
      else { carve(wx, f + 1); carve(wx, f + 2); mark(wx - 1, f + 1); mark(wx + 1, f + 1); } }
    else { let sx = cx[a] + ri(1, W[a] - 2); const sy = fy[b + 1]; for (let tr = 0; tr < 12 && (isBusy(sx, sy + 1) || isBusy(sx, fy[b] + 1)); tr++) sx = cx[a] + ri(1, W[a] - 2); if (isBusy(sx, sy + 1) || isBusy(sx, fy[b] + 1)) for (let x = cx[a] + 1; x <= cx[a] + W[a] - 2; x++) if (!isBusy(x, sy + 1) && !isBusy(x, fy[b] + 1)) { sx = x; break; } if (isBusy(sx, sy + 1)) for (let x = cx[a] + 1; x <= cx[a] + W[a] - 2; x++) if (!isBusy(x, sy + 1) && x !== sx) { sx = x; break; } carve(sx, sy);   /* люк не под дверью */                 // люк в перекрытии и лестница сквозь него
      LEVEL.ladders.push({ f: 0, t: sx, y0: fy[b] + 1, y1: sy + 1 }); for (let y = fy[b] + 1; y <= sy + 1; y++) { mark(sx, y); mark(sx - 1, y); mark(sx + 1, y); } } }
  // наполнение комнат
  let bots = opt.bots || 0; const P3r = (t, y, r) => [t, y, r];
  const free = (x, y) => !isBusy(x, y) && open.has(ckey(x, y, Z)) && open.has(ckey(x, y + 1, Z)) && hasCube(x, y - 1, Z);
  for (let r = 0; r < opt.rows; r++) for (let c = 0; c < opt.cols; c++) { const x0 = cx[c], x1 = cx[c] + W[c] - 1, f = fy[r] + 1, top = fy[r] + Hh[r], first = c === corner(opt.entry || 'bl')[0] && r === corner(opt.entry || 'bl')[1];
    if (chance(0.75)) LEVEL.lamps.push({ x: ri(x0 + 1, x1 - 1) + 0.5, y: top + 1, z: Z, f: 0, len: opt.tunnel ? 0.35 : 0.7 + R() * 0.5, th: 0.15, om: 0, bob: 0, bv: 0, ph: R() * 6 });   // лампа на шнуре с потолка
    if (chance(0.55)) { const yp = top + 0.55; LEVEL.pipes.push({ deco: true, pts: [P3r(x0 - 0.45, yp, 7.4), P3r(x0 - 0.45, yp, 7.95), P3r(x1 + 0.45, yp, 7.95), P3r(x1 + 0.45, yp, 7.4)] }); }   // труба под потолком
    if (!opt.tunnel && Hh[r] >= 4 && W[c] >= 5 && chance(0.5)) { for (let tr = 0; tr < 10; tr++) { const x = ri(x0 + 1, x1 - 1); if ([x - 1, x, x + 1].some(xx => isBusy(xx, f) || !open.has(ckey(xx, f, Z)) || [1, 2, 3].some(k => k < Hh[r] && (hasCube(xx, f + k, Z) || !open.has(ckey(xx, f + k, Z)))))) continue;   // насос в комнате: шестерня на полу, ползун ходит вверх-вниз, цилиндр под потолком
        const rp = 0.5, Lr = 1.3, th = 0.28, gy = f + 0.75, cyB = gy + Lr + rp + th / 2 + 0.68, cyT = f + Hh[r];
        LEVEL.gears.push({ x: x + 0.5, y: gy, z: Z, f: 0, R: 0.75, deco: true, drive: (chance(0.5) ? 1 : -1) * (1 + R() * 0.6), rust: chance(0.5) ? 1 : 0 });
        LEVEL.pistons.push({ f: 0, gx: x + 0.5, gz: Z, gy, cyB, cyT, gi: LEVEL.gears.length - 1, rp, L: Lr, th, hw: 0.7, cw: 0.3, room: true });
        for (const xx of [x - 1, x, x + 1]) for (let yy = f; yy < f + Hh[r]; yy++) mark(xx, yy); break; } }
    if (!first && bots > 0 && W[c] >= 6 && chance(0.85)) { for (let tr = 0; tr < 8; tr++) { const x = ri(x0 + 1, x1 - 2); if (!free(x, f) || !free(x + 1, f)) continue; LEVEL.robots.push({ x, y: f, z: Z, h: [1, 0], R: 9, F: 7.5 }); mark(x, f); mark(x + 1, f); bots--; break; } }
    if (chance(opt.loot ? 0.8 : 0.45)) { for (const x of [x1, x0]) if (free(x, f)) { LEVEL.crates.push({ x, y: f, z: Z }); mark(x, f); break; } }
    { const tp = opt.tunnel ? 0.9 : 0.4; LEVEL.traps = LEVEL.traps || [];   // электроловушки: из пола, с потолка, из боковой стены
      if (!first && chance(tp)) for (let tr = 0; tr < 8; tr++) { const x = ri(x0 + 1, x1 - 1); if (!free(x, f) || isBusy(x - 1, f) || isBusy(x + 1, f)) continue; LEVEL.traps.push({ kind: 'floor', x, y: f, z: Z + 0.02, f: 0, ph: R() * 3 }); mark(x, f); mark(x, f + 1); break; }
      if (chance(opt.tunnel ? 0.7 : 0.3)) { const x = ri(x0 + 1, x1 - 1); if (open.has(ckey(x, top, Z)) && hasCube(x, top + 1, Z)) LEVEL.traps.push({ kind: 'ceil', x, y: top + 1, z: Z + 0.02, f: 0, ph: R() * 3 }); }
      if (!opt.tunnel && chance(0.25)) { const y = f + 0.5, side = chance(0.5); const x = side ? x0 - 0.5 : x1 + 0.5; if (!isBusy(side ? x0 : x1, f)) LEVEL.traps.push({ kind: 'wall', x, y, z: Z + 0.02, f: 0, ax: 1, az: 0, dir: side ? 1 : -1, ph: R() * 3 }); } }
    if (!first && !opt.tunnel && chance(0.22)) { for (let tr = 0; tr < 6; tr++) {   /* в стартовом коридоре огня нет: двойного прыжка ещё нет, не перепрыгнуть */ const x = ri(x0 + 1, x1 - 1); if (!free(x, f)) continue; LEVEL.fires.push({ x, y: f, z: Z }); mark(x, f); break; } }
    if (Hh[r] >= 4 && chance(0.5)) { for (let tr = 0; tr < 6; tr++) { const x = ri(x0 + 1, x1 - 2); if (isBusy(x, f + 1) || isBusy(x + 1, f + 1) || isBusy(x, f + 2) || isBusy(x + 1, f + 2) || !open.has(ckey(x, f + 1, Z)) || !open.has(ckey(x + 1, f + 1, Z))) continue;   // полка в воздухе
      for (const xx of [x, x + 1]) { cubes.set(ckey(xx, f + 1, Z), { x: xx, y: f + 1, z: Z, kind: 'plat' }); mark(xx, f + 2); mark(xx, f + 1); } LEVEL.bits.push({ x: x + 0.5, y: f + 2.45, z: Z }); break; } }
    if (!opt.tunnel && chance(0.6)) { const Rg = chance(0.5) ? 0.75 : 1.2, gx = ri(x0, x1) + 0.5, gy = f + Hh[r] - 1.2 - R() * 0.8; LEVEL.gears.push({ x: gx, y: gy, z: Z, f: 0, R: Rg, soft: true, drive: (chance(0.5) ? 1 : -1) * (0.3 + R() * 0.5), rust: chance(0.5) ? 1 : 0 });   // колёса механизма на задней стене
      if (Rg < 1 && chance(0.6)) LEVEL.gears.push({ x: gx + (gx < (x0 + x1) / 2 ? 1 : -1) * 1.38, y: gy - 0.35, z: Z, f: 0, R: 0.75, soft: true, drive: 0, pair: true, rust: 0 }); }   // сцепленная пара
    if (!opt.tunnel && W[c] >= 6 && chance(0.4)) { for (let tr = 0; tr < 8; tr++) { const x = ri(x0 + 1, x1 - 1); if ([x - 1, x, x + 1].some(xx => isBusy(xx, f) || isBusy(xx, f + 1))) continue;   // малое колесо в полу: на него запрыгивают, оно крутится и сбрасывает
      LEVEL.gears.push({ x, y: f + 0.25, z: Z, f: 0, R: 0.75, soft: true, rust: chance(0.5) ? 1 : 0 }); for (const xx of [x - 1, x, x + 1]) { mark(xx, f); mark(xx, f + 1); } LEVEL.bits.push({ x, y: f + 1.6, z: Z }); break; } }
    { const top2 = fy[r] + Hh[r] + 1, PPU = 40, Wd = typeof WIRES !== 'undefined' ? WIRES : null;   // провода с листа автора: провисающие жгуты под потолком, свисающие пучки (по длинным можно лезть), коробки на стене
      if (Wd) { const used = [];
        if (chance(0.85)) { const big = W[c] >= 5, i = big ? ri(0, 1) : ri(2, 3), r2 = Wd.D[i], w = r2[2] / PPU, x = x0 - 0.5 + R() * Math.max(0.1, W[c] - w); LEVEL.wsprites.push({ g: 'D', i, x: x + w / 2, y: top2 - 0.02, z: Z + 0.02, f: 0 }); used.push([x, x + w]);
          // от кучи проводов расходятся простые провода: по потолку к стене и вниз по ней — в коробку, в пол или обрываются
          for (let k = 0, nr = ri(5, 9), side0 = chance(0.5) ? -1 : 1; k < nr; k++) { const side = k % 3 === 2 ? -side0 : side0, sx = side < 0 ? x + 0.15 : x + w - 0.15, ex = side < 0 ? x0 - 0.42 + R() * 0.25 : x1 + 0.42 - R() * 0.25, yc = top2 - 0.12 - k * 0.07 - R() * 0.1;
            const pts = [[sx, top2 - 0.25 - R() * 0.3], [sx + side * 0.4, yc], [ex, yc]], down = R() < 0.7, ye = down ? f + (R() < 0.4 ? 0 : 0.6 + R() * (Hh[r] - 1.8)) : yc; if (down) pts.push([ex, ye]);
            LEVEL.wruns.push({ pts, c: ri(0, 5), z: Z + 0.01, sag: 0.08 + R() * 0.2 });
            if (down && ye > f + 0.3 && chance(0.4)) LEVEL.wsprites.push({ g: 'B', i: ri(0, WIRES.B.length - 1), x: ex + (side < 0 ? 0.25 : -0.25), y: ye + 0.35, z: Z + 0.015, f: 0 }); } }
        for (let k = 0, n = ri(0, 2); k < n; k++) { const i = ri(0, Wd.V.length - 1), r2 = Wd.V[i], h = r2[3] / PPU, x = ri(x0, x1); if (h > Hh[r] - 0.7 || [x - 1, x, x + 1].some(xx => isBusy(xx, f + Hh[r] - 1))) continue;
          LEVEL.wsprites.push({ g: 'V', i, x, y: top2 - 0.02, z: Z + 0.02, f: 0 }); if (h > 1.4) LEVEL.wireClimbs.push({ x, z: Z, y0: top2 - h + 0.2, y1: top2 - 0.6, pipe: true, d: 8, wire: true }); }
        if (chance(0.3)) { const i = ri(0, Wd.B.length - 1), x = ri(x0, x1); if (!isBusy(x, f + 1)) LEVEL.wsprites.push({ g: 'B', i, x, y: f + 1.6 + R() * 0.8, z: Z - 0.25, f: 0 }); } } }
    for (let i = 0, nb = ri(1, opt.loot ? 3 : 2); i < nb; i++) { const x = ri(x0, x1); if (!isBusy(x, f)) LEVEL.bits.push({ x, y: f + 0.45 + (i % 2) * 0.9, z: Z }); }
    if (opt.loot && !first && chance(0.35) && LEVEL.hearts) { const x = ri(x0, x1); if (free(x, f)) { LEVEL.hearts.push({ x, y: f + 0.5, z: Z }); mark(x, f); } } }
  LEVEL.complexes.push(C); return C;
}
// связать две двери: из a — в b и обратно
function linkDoors(a, b) { LEVEL.doors[a].to = b; LEVEL.doors[b].to = a; }

// Где на титане двери внутрь: проходы на ноге (вместо сквозной двери — через комнаты), кладовые за дверью в стене,
// таз (бывший выход) — большой лабиринт до торса, путь по восточной стене груди на крышу и дверь кабины — новый выход.
function buildInteriorRoutes(T) {
  const { ri, chance, R, lane, liftZone } = T, D = LEVEL.doors, H = LEVEL.pelY + 1;
  LEVEL.complexes = [];
  // 1) сквозные открытые пары на ноге: первая — всегда через комнаты, вторая — как повезёт
  const pairs = []; for (let i = 0; i + 1 < D.length; i++) { const a = D[i], b = D[i + 1]; if (!a.locked && !a.gate && !a.exit && !a.room && a.to === i + 1 && b.to === i) { pairs.push(i); i++; } }
  pairs.forEach((i, k) => { const A = D[i], C = makeComplex(T, { cols: ri(2, 3), rows: 1, name: 'Переход', alt: A.y, entry: 'bl', exit: 'br', bots: ri(1, 2) });
    linkDoors(i, C.inD); linkDoors(C.outD, i + 1); });
  // 2) двери в стене ноги прямо на уступах пути. Шахты: вход внизу, выход выше и часто на другой стороне ноги — короткий путь наверх
  //    сквозь корпус (с роботами внутри). Кладовые: тупик с добычей.
  const wallC = (g, t) => [[t, 7], [7, -t], [-t, -7], [-7, t]][g];
  const FNs = [[0, 1], [1, 0], [0, -1], [-1, 0]], cand = [];   // любая верхушка уступа или площадки у стены ноги — место для двери
  for (const c of cubes.values()) { if ((c.kind !== 'ledge' && c.kind !== 'plat') || c.y < 3 || c.y > 900 || hasCube(c.x, c.y + 1, c.z)) continue; for (let g = 0; g < 4; g++) if (c.x * FNs[g][0] + c.z * FNs[g][1] === 8) { const t = [c.x, -c.z, -c.x, c.z][g]; if (Math.abs(t) <= 7) cand.push([g, t, c.y + 1]); } }
  const legSpot = (yMin, yMax, notG) => { yMin = Math.max(yMin, (LEVEL.shinTop || 0) + 2); const pool = cand.filter(q => q[2] >= yMin && q[2] <= yMax && q[0] !== notG); for (let tr = 0; tr < 120 && pool.length; tr++) { const [g, t, y] = pool[ri(0, pool.length - 1)], c = lane(g, t);
      let ok = true;
      for (const yy of [y, y + 1, y + 2]) { const w = wallC(g, t), k = ckey(w[0], yy, w[1]), cc = cubes.get(k); if (!cc || cc.kind !== 'core' || LEVEL.carved.has(k)) ok = false; if (hasCube(c[0], yy, c[1])) ok = false; }
      if (!ok || liftZone(g, t, y) || D.some(d => Math.abs(d.x - c[0]) + Math.abs(d.z - c[1]) < 2.5 && Math.abs(d.y - y) < 3) || LEVEL.ladders.some(L => L.f % 4 === g && Math.abs(L.t - t) < 1.2 && L.y1 > y - 0.5 && L.y0 < y + 2)) continue;
      if (LEVEL.crates.concat(LEVEL.fires).some(o => Math.abs(o.x - c[0]) + Math.abs(o.z - c[1]) < 1.1 && Math.abs(o.y - y) < 1)) continue;
      return { g, t, y, c }; } return null; };
  const wallDoor = (P, spr) => { D.push({ x: P.c[0], y: P.y, z: P.c[1], f: P.g, spr, flip: chance(0.5) }); return D.length - 1; };
  for (let k = 0, made = 0, want = ri(8, 10); k < 80 && made < want; k++) { const A = legSpot(4, H - 4); if (!A) continue; const ia = wallDoor(A, 'door4');
    const ring = (LEVEL.ringTops || []).find(r => r > A.y), cap = Math.min(H - 2, ring !== undefined ? ring - 1 : 999);
    let Bp = legSpot(A.y + 4, Math.min(A.y + 14, cap), chance(0.7) ? A.g : -1), up = true;   // шахта вверх — выход на том же ярусе: запертые перегородки она не обходит
    if (!Bp) { Bp = legSpot(Math.max(4, A.y - 2), Math.min(A.y + 3, cap), A.g); up = false; }   // или сквозной ход на другую сторону ноги
    if (!Bp) { D.pop(); continue; } const ib = wallDoor(Bp, 'door0'); made++;
    const C = makeComplex(T, up ? { cols: ri(2, 3), rows: ri(2, 3), name: 'Шахта', alt: A.y, entry: 'bl', exit: 'tr', bots: ri(0, 2) } : { cols: ri(2, 4), rows: ri(1, 2), name: 'Сквозной ход', alt: A.y, entry: 'bl', exit: chance(0.5) ? 'br' : 'tr', bots: ri(0, 1) });
    linkDoors(ia, C.inD); linkDoors(C.outD, ib); }
  for (let k = 0; k < 1; k++) { const P = legSpot(5, H - 4); if (!P) continue; const io = wallDoor(P, 'door1'); D[io].store = true;
    const C = makeComplex(T, { cols: ri(1, 2), rows: ri(1, 2), name: 'Кладовая', alt: P.y, entry: chance(0.5) ? 'bl' : 'br', bots: ri(0, 1), loot: true, wMin: 5, wMax: 7 }); linkDoors(io, C.inD); }
  // 2б) круглые люки на высоте: над уступом пути, в 3 кубах; к люку ведёт лесенка-скоба. За люком — тайник с добычей
  for (let k = 0, made = 0; k < 60 && made < 2; k++) { const P = legSpot(6, H - 8); if (!P) continue; const hy = P.y + 3; let ok = true;
    for (const yy of [hy, hy + 1, hy + 2]) { const w = wallC(P.g, P.t), kk = ckey(w[0], yy, w[1]), cc = cubes.get(kk); if (!cc || cc.kind !== 'core' || LEVEL.carved.has(kk)) ok = false; }
    for (let yy = P.y; yy <= hy + 2 && ok; yy++) for (const dt of [-1, 0, 1]) { const c = lane(P.g, P.t + dt); if (hasCube(c[0], yy, c[1]) || liftZone(P.g, P.t + dt, yy)) ok = false; }
    if (!ok || D.some(d => Math.abs(d.x - P.c[0]) + Math.abs(d.z - P.c[1]) < 2.5 && Math.abs(d.y - hy) < 4) || LEVEL.lamps.some(o => Math.abs(o.x - P.c[0]) + Math.abs(o.z - P.c[1]) < 1.5 && o.y > P.y && o.y < hy + 3)) continue;
    LEVEL.ladders.push({ f: P.g, t: P.t, y0: P.y, y1: hy + 0.05, hatch: true });
    D.push({ x: P.c[0], y: hy, z: P.c[1], f: P.g, spr: 'door1', flip: chance(0.5), hatch: true, store: true }); const io = D.length - 1;
    const C = makeComplex(T, { cols: 1, rows: 1, name: 'Тайник', alt: hy, entry: 'bl', bots: 0, loot: true, wMin: 5, wMax: 6 }); linkDoors(io, C.inD); made++; }
  // 3) торс: восточная стена груди очищается от наростов, по ней — путь наверх; на крыше кабина, её дверь — выход
  const [B0, B1] = LEVEL.torsoY, XR = 12, lt = t => [XR, -t];   // клетка хода у груди: x = 12, вдоль стены t = -z
  for (const c of [...cubes.values()]) if (c.torso && c.x >= 12 && c.y >= B0 && c.y <= B1 + 2) cubes.delete(ckey(c.x, c.y, c.z));
  LEVEL.torsoPath = []; const led = (a, b, top) => { LEVEL.torsoPath.push({ a: Math.min(a, b), b: Math.max(a, b), top }); for (let t = Math.min(a, b); t <= Math.max(a, b); t++) { const c = lt(t); addCube(c[0], top - 1, c[1], 'ledge'); const q = cubes.get(ckey(c[0], top - 1, c[1])); q.torso = true; } };
  const robotAt = (a, b, top, dir) => { const c = lt(a); LEVEL.robots.push({ x: c[0], y: top, z: c[1], h: [0, -dir], R: 9, F: 7.5 }); };
  const bitAt = (t, y) => { const c = lt(t); LEVEL.bits.push({ x: c[0], y, z: c[1] }); };
  const tA = -10, tB = 34; let y = B0 + 5, dir = 1, a = -1, b = 2; led(a, b, y);
  D.push({ x: XR, y, z: 0, f: 1, spr: 'door4', flip: false }); const torsoDoor = D.length - 1;
  LEVEL.lamps.push({ x: XR, y: y + 3.4, z: -1.5, f: 1, len: 1.2, th: 0.2, om: 0, bob: 0, bv: 0, ph: 1 });
  const stores = []; let guard = 0;
  while (y < B1 + 1 && guard++ < 60) {
    const edge = dir > 0 ? b : a, w = ri(2, 4), rise = chance(0.25) ? 2 : 1, gap = rise === 2 ? 1 : ri(1, 2), na = dir > 0 ? edge + gap + 1 : edge - gap - w, nb = na + w - 1;
    if ((dir > 0 && nb > tB) || (dir < 0 && na < tA)) {      // край стены: лестница на три вверх и обратно
      const lt0 = dir > 0 ? b + 1 : a - 1, c = lt(lt0); LEVEL.ladders.push({ f: 1, t: lt0, y0: y, y1: y + 3, r: XR }); y += 3; dir = -dir;
      a = dir > 0 ? lt0 + 1 : lt0 - 3; b = a + 2; led(a, b, y); void c; bitAt(dir > 0 ? b : a, y + 0.45); continue; }
    y += rise; if (rise === 2) LEVEL.ladders.push({ f: 1, t: dir > 0 ? na - 1 : nb + 1, y0: y - 2.8, y1: y, r: XR }); a = na; b = nb; led(a, b, y);
    const k = R();
    if (w >= 3 && k < 0.35) robotAt(dir > 0 ? a : b - 1, dir > 0 ? a + 1 : b, y, dir);
    else if (k < 0.5) { const c = lt(dir > 0 ? b : a); LEVEL.crates.push({ x: c[0], y, z: c[1] }); }
    else if (k < 0.62 && w >= 3) { const c = lt(Math.round((a + b) / 2)); LEVEL.fires.push({ x: c[0], y, z: c[1] }); }
    else if (w >= 3 && y < B1 - 3 && stores.length < 1) stores.push([Math.round((a + b) / 2), y]);
    if (chance(0.6)) bitAt(dir > 0 ? b + 1 : a - 1, y + 1.2);
    if (chance(0.45)) LEVEL.lamps.push({ x: XR, y: y + 3.3, z: -((a + b) / 2), f: 1, len: 1.1, th: 0.2, om: 0, bob: 0, bv: 0, ph: y });
    if (chance(0.3)) { const yp = y + 1.6 + ri(0, 1); LEVEL.pipes.push({ deco: true, pts: [[11.4, yp, -(a - 1.4)], [11.95, yp, -(a - 1.4)], [11.95, yp, -(b + 1.4)], [11.4, yp, -(b + 1.4)]] }); } }
  // наросты плит на груди снова, но в стороне от пути
  for (let n = 0, tr = 0; n < 24 && tr < 300; tr++) { const w = ri(2, 4), h = ri(2, 3), t0 = ri(-12, 36 - w), y0 = ri(B0 + 4, B1 - h); let ok = true;
    for (let t = t0 - 1; t <= t0 + w && ok; t++) for (let yy = y0 - 2; yy <= y0 + h + 2 && ok; yy++) { const c = lt(t); if (hasCube(c[0], yy, c[1]) || LEVEL.ladders.some(L => L.f === 1 && L.r === XR && Math.abs(L.t - t) < 1.5 && L.y1 > yy - 1 && L.y0 < yy + 1)) ok = false; }
    if (!ok || Math.abs(t0) < 3 && y0 < B0 + 9) continue; for (let t = t0; t < t0 + w; t++) for (let yy = y0; yy < y0 + h; yy++) { const c = lt(t); addCube(c[0], yy, c[1], 'core'); const q = cubes.get(ckey(c[0], yy, c[1])); q.torso = true; q.bulge = true; } n++; }
  // шахта на груди: с нижней половины подъёма на верхнюю
  for (let rr = 0, mk = 0; rr < 14 && mk < 2; rr++) { const TP = LEVEL.torsoPath, lo = TP.filter(q => q.top < B0 + 11 && q.top > B0 + 5), hi = TP.filter(q => q.top > B0 + 14 && q.top < B1);
    const okAt = (t, y) => !D.some(d => d.f === 1 && Math.abs(-d.z - t) < 4 && Math.abs(d.y - y) < 3) && !LEVEL.ladders.some(L => L.r === XR && Math.abs(L.t - t) < 1.2 && L.y1 > y - 0.5 && L.y0 < y + 2) && [0, 1, 2].every(k => !hasCube(XR, y + k, -t)) && !stores.some(q => Math.abs(q[0] - t) < 3 && q[1] === y);
    if (lo.length && hi.length) { const a = lo[ri(0, lo.length - 1)], b = hi[ri(0, hi.length - 1)], ta = ri(a.a, a.b), tb = ri(b.a, b.b);
      if (okAt(ta, a.top) && okAt(tb, b.top)) { D.push({ x: XR, y: a.top, z: -ta, f: 1, spr: 'door4', flip: false }); const ia = D.length - 1; D.push({ x: XR, y: b.top, z: -tb, f: 1, spr: 'door0', flip: true }); const ib = D.length - 1;
        const C = makeComplex(T, { cols: ri(2, 3), rows: 3, name: 'Шахта', alt: a.top, entry: 'bl', exit: 'tr', bots: ri(2, 3) }); linkDoors(ia, C.inD); linkDoors(C.outD, ib); mk++; } } }
  // кладовые на груди
  for (const [t, yy] of stores) { const c = lt(t); D.push({ x: c[0], y: yy, z: c[1], f: 1, spr: 'door0', flip: chance(0.5), store: true }); const out = D.length - 1;
    const C = makeComplex(T, { cols: ri(1, 2), rows: ri(1, 2), name: 'Кладовая', alt: yy, entry: chance(0.5) ? 'bl' : 'br', bots: 1, loot: true, wMin: 5, wMax: 7 }); linkDoors(out, C.inD); }
  // v303 (Алексей: «усложни торс и выше: больше роботов, ловушек, тайлов, пара, воды, лампочек — а то чем выше, тем проще»): второй проход по уступам груди,
  // со своим ГСЧ (остальная карта не сдвигается); чем выше, тем гуще. Не у дверей и не у лестниц.
  { const TR2 = rng(((LEVEL.seed | 0) + 4477) >>> 0), ch = p => TR2() < p, rI = (a, b) => a + Math.floor(TR2() * (b - a + 1));
    const nearDL = (t, y) => D.some(d => d.f === 1 && Math.abs(-d.z - t) < 2.2 && Math.abs(d.y - y) < 2.5) || LEVEL.ladders.some(L => L.f === 1 && L.r === XR && Math.abs(L.t - t) < 1.6 && y > L.y0 - 1.5 && y < L.y1 + 1.5);
    const busyT = (t, y) => D.some(d => d.f === 1 && Math.abs(-d.z - t) < 2.2 && Math.abs(d.y - y) < 2.5) || LEVEL.ladders.some(L => L.f === 1 && L.r === XR && Math.abs(L.t - t) < 1.6 && y > L.y0 - 1.5 && y < L.y1 + 1.5)
      || LEVEL.robots.some(o => Math.abs(o.x - XR) < 0.6 && Math.abs(-o.z - t) < 1.6 && Math.abs(o.y - y) < 1) || LEVEL.crates.concat(LEVEL.fires, LEVEL.traps || []).some(o => Math.abs(o.x - XR) < 0.6 && Math.abs(-o.z - t) < 1.2 && Math.abs(o.y - y) < 1);
    const clear = (t, y0, y1) => { for (let y = y0; y <= y1; y++) if (hasCube(XR, y, -t)) return false; return true; };
    LEVEL.traps = LEVEL.traps || [];
    for (const q of LEVEL.torsoPath) { if (q.top < B0 + 6) continue; const h = Math.min(1, (q.top - B0) / (B1 - B0)), w = q.b - q.a + 1;
      if (w >= 2 && ch(0.5 + 0.3 * h)) { const t = rI(q.a, q.b); if (!busyT(t, q.top)) LEVEL.traps.push({ kind: 'floor', x: XR + 0.02, y: q.top, z: -t, f: 1, ph: TR2() * 3 }); }   // электроловушка в полу
      if (w >= 2 && ch(0.45 + 0.35 * h)) { const t = rI(q.a, q.b - 1); if (!busyT(t, q.top)) LEVEL.robots.push({ x: XR, y: q.top, z: -t, h: [0, ch(0.5) ? 1 : -1], R: 9, F: 7.5 }); }   // ещё робот
      if (ch(0.5 + 0.3 * h)) { const t = rI(q.a, q.b), yy = q.top + 2.9; if (clear(t, q.top, Math.ceil(yy + 1.2)) && !nearDL(t, q.top)) {   // пар сверху из трубы со стены
        LEVEL.steams.push({ x: XR, y: yy, z: -t, dx: 0, dz: 0, down: true, ph: TR2() * 5, var: q.top + t }); LEVEL.pipes.push({ deco: true, pts: [[11.4, yy + 1.2, -t], [XR, yy + 1.2, -t], [XR, yy + 0.05, -t]] }); }
        else if (w >= 2) { const left = ch(0.5), tt = left ? q.a - 0.5 : q.b + 0.5, sg = left ? 1 : -1, y2 = q.top + 0.38, tp = tt - sg * 0.9;   // пар вдоль уступа из трубы у края
          if (!nearDL(left ? q.a : q.b, q.top)) { LEVEL.steams.push({ x: XR, y: y2, z: -tt, dx: 0, dz: -sg, ph: TR2() * 3, var: q.top }); LEVEL.pipes.push({ deco: true, pts: [[11.4, y2 + 1.6, -tp], [XR, y2 + 1.6, -tp], [XR, y2, -tp], [XR, y2, -(tt - sg * 0.05)]] }); } } }
      if (ch(0.55)) LEVEL.lamps.push({ x: XR, y: q.top + 3.2 + TR2() * 0.4, z: -(q.a + TR2() * (q.b - q.a)), f: 1, len: 0.8 + TR2() * 0.5, th: 0.2, om: 0, bob: 0, bv: 0, ph: TR2() * 6 });
    }
  }
  // крыша: ступень к плечевому уступу, кабина, её дверь — выход
  for (let z = -14; z <= -10; z++) { addCube(10, B1 + 1, z, 'ledge'); cubes.get(ckey(10, B1 + 1, z)).torso = true; }
  LEVEL.robots.push({ x: 8, y: B1 + 3, z: -18, h: [0, 1], R: 9, F: 7.5 });
  D.push({ x: 7, y: B1 + 3, z: -12, f: 1, cabin: true, spr: 'door1' }); LEVEL.finalY = B1 + 3; linkDoors(D.length - 1, makeBossRoom(T, B1 + 3));   // за дверью кабины — мозг
  LEVEL.lamps.push({ x: 7.6, y: B1 + 6.4, z: -9.5, f: 1, len: 1.0, th: 0.2, om: 0, bob: 0, bv: 0, ph: 2 });
  // 4) таз: дверь бывшего выхода ведёт в лабиринт, его верхняя дверь — на балкон груди
  const ex = D.findIndex(d => d.exit), P = makeComplex(T, { cols: ri(3, 4), rows: 3, name: 'Таз', alt: H + 6, entry: 'bl', exit: 'tr', bots: 4 + Math.min(3, (game.level || 1) - 1) });
  linkDoors(ex, P.inD); linkDoors(P.outD, torsoDoor); P.final = torsoDoor;
  LEVEL.towerTop = B1 + 3;
  soleTunnel(T);
  placeGears(T);
  LEVEL.engines = [];   /* паровые машины пока убраны */
}
// Начало игры — внутри подошвы: длинный узкий коридор, в нём 1–3 робота (чаще один); в конце — выход наружу,
// всегда на ступню: круглая дверь в стене ноги у старта и рядом лестница вверх.
function soleTunnel(T) {
  const { ri, chance, R } = T, D = LEVEL.doors, S0 = LEVEL.start, r = R(), bots = r < 0.6 ? 1 : r < 0.85 ? 2 : 3;
  const C = makeComplex(T, { cols: ri(3, 4), rows: 1, name: 'Подошва', alt: 0, entry: 'bl', exit: 'br', bots, wMin: 6, wMax: 8, hMin: 2, hMax: 2, tunnel: true });
  { const inC = o => o.y >= C.y0 && o.y <= C.y1; let bots2 = LEVEL.robots.filter(inC);   // ключ от выхода — у робота в коридоре
    if (!bots2.length) { const d0 = D[C.inD], d1 = D[C.outD], x = Math.round((d0.x + d1.x) / 2); LEVEL.robots.push({ x, y: d0.y, z: d0.z, h: [1, 0], R: 9, F: 7.5 }); bots2 = LEVEL.robots.filter(inC); }
    bots2.sort((a, b) => Math.abs(a.x - D[C.outD].x) - Math.abs(b.x - D[C.outD].x))[0].key = true; Object.assign(D[C.outD], { locked: true, tkey: true }); }
  const dx = ri(-5, 3), sy = -3, SZ = 9;   /* выход каждый раз в новом месте подошвы */   // выход — круглая дверь в боку подошвы, у неё балкончик и лестница вверх, на ступню
  for (let x = dx - 1; x <= dx + 2; x++) addCube(x, sy - 1, SZ, 'ledge');
  LEVEL.soleBalc = { x0: dx - 1, x1: dx + 2, y: sy, z: SZ };   // v231: на этом балкончике перила всегда (Алексей 14.10)
  D.push({ x: dx, y: sy, z: SZ, f: 0, spr: 'door1', flip: false, hatch: true, sole: true }); const out = D.length - 1;
  linkDoors(C.outD, out); D[out].to = C.outD; Object.assign(D[C.inD], { sealed: true, locked: true });   // выход только в конце коридора; дверь у старта заварена
  const din = D[C.inD]; LEVEL.spawn = { x: din.x + 1.2, y: din.y, z: din.z }; LEVEL.tutor = { x: din.x + 2.8, y: din.y, z: din.z - 0.3 };   // кнопка «Обучение» у старта (без R(): раскладка карт не меняется)
  LEVEL.ladders.push({ f: 0, t: dx + 2, r: SZ, y0: sy, y1: Math.round(S0.y) + 0.05 });
}

// Шестерни: где на стене свободный круг, а рядом (в прыжке от верха колеса) есть на чём стоять; над колесом — осколок.
// По всей ноге и на груди.
function placeGears(T) {
  const { ri, chance, R, lane, liftZone } = T; LEVEL.gears = LEVEL.gears || [];
  const tryAt = (cellAt, f, ct, cy, Rg, leg) => {
    for (let t = Math.floor(ct - Rg - 1); t <= Math.ceil(ct + Rg + 1); t++) for (let y = Math.floor(cy - Rg - 1); y <= Math.ceil(cy + Rg + 2); y++) {
      const inC = (t - ct) * (t - ct) + (y + 0.5 - cy) * (y + 0.5 - cy) <= (Rg + 0.45) * (Rg + 0.45) || (y > cy + Rg - 0.5 && y < cy + Rg + 1.5 && Math.abs(t - ct) < Rg * 0.8);   // сам круг и место над ним
      if (!inC) continue; const c = cellAt(t); if (hasCube(c[0], y, c[1]) || (leg && liftZone(f, t, y))) return false; }
    const near = o => { const c = cellAt(ct); return Math.abs(o.x - c[0]) + Math.abs(o.z - c[1]) < Rg + 2 && o.y > cy - Rg - 2 && o.y < cy + Rg + 3; };
    if (LEVEL.ladders.some(L => L.f % 4 === f && (L.r || 8) === (leg ? 8 : 12) && Math.abs(L.t - ct) < Rg + 1.5 && L.y1 > cy - Rg - 1 && L.y0 < cy + Rg + 2)) return false;
    if (LEVEL.doors.concat(LEVEL.lamps, LEVEL.steams, LEVEL.rings, LEVEL.fires, LEVEL.gears).some(near)) return false;
    if (LEVEL.movers.some(m => m.f % 4 === f && Math.abs(m.y - cy) < Rg + 3)) return false;
    if (leg && LEVEL.path.some(q => q.f % 4 === f && q.b + 1.5 > ct - Rg && q.a - 1.5 < ct + Rg && cy - Rg > q.top - 0.5 && cy - Rg < q.top + 2.6)) return false;   // колесо не нависает низко над тропой: мешало бы прыжкам
    if (LEVEL.pipes.some(q => q.pts.some(p => near({ x: p[0], y: p[1], z: p[2] })))) return false;
    const top = cy + Rg; let reach = false;   // рядом есть уступ, с которого допрыгнуть до верха колеса
    for (let t = Math.floor(ct - Rg - 3); t <= Math.ceil(ct + Rg + 3) && !reach; t++) { if (Math.abs(t - ct) < Rg * 0.8) continue; const c = cellAt(t);
      for (let y = Math.floor(top - 1.5); y <= Math.ceil(top + 1.5); y++) if (hasCube(c[0], y - 1, c[1]) && !hasCube(c[0], y, c[1]) && !hasCube(c[0], y + 1, c[1]) && top - y <= 1.2) { reach = true; break; } }
    if (!reach) return false;
    const c = cellAt(ct); LEVEL.gears.push({ x: c[0], y: cy, z: c[1], f, R: Rg, rust: chance(0.4) ? 1 + R() * 3 : 0 }); LEVEL.bits.push({ x: c[0], y: top + 0.9, z: c[1] }); return true; };
  let n = 0;
  for (let tr = 0; tr < 2500 && n < 8; tr++) { const f = ri(0, 3), Rg = chance(0.75) ? 1.5 : 2.5, ct = ri(-6, 6), cy = ri(4, LEVEL.pelY - 4) + 0.5;
    if (tryAt(t => lane(f, t), f, ct, cy, Rg, true)) n++; }
  const [B0, B1] = LEVEL.torsoY; let m = 0;
  for (let tr = 0; tr < 400 && m < 3; tr++) { const Rg = chance(0.5) ? 1.5 : 2.5, ct = ri(-8, 32), cy = ri(B0 + 6, B1 - 3) + 0.5; if (tryAt(t => [12, -t], 1, ct, cy, Rg, false)) m++; }
  // блоки над лифтами: малая шестерня наверху шахты крутится, пока едет люлька
  (LEVEL.lifts || []).forEach((L, li) => { const FNl = [[0, 1], [1, 0], [0, -1], [-1, 0]][L.f], al = [-FNl[1], FNl[0]], sd = chance(0.5) ? 1 : -1, R1 = 0.66, R2 = chance(0.5) ? 0.38 : 0.46, y = L.y1 + 3.5;   // верх лифта: цепь идёт по большому блоку-шестерне, к нему сцеплена малая
    const c1 = [L.x + al[0] * sd * R1 * 0.92, L.z + al[1] * sd * R1 * 0.92], d = R1 + R2 - 0.1, c2 = [c1[0] + al[0] * sd * d * 0.94, c1[1] + al[1] * sd * d * 0.94];
    LEVEL.gears.push({ x: c1[0], y, z: c1[1], f: L.f, R: R1, deco: true, lift: li, rev: false, ph: 0, rust: chance(0.5) ? 2 : 0 });
    LEVEL.gears.push({ x: c2[0], y: y + d * 0.34, z: c2[1], f: L.f, R: R2, deco: true, lift: li, rev: true, ph: 0.2, ratio: R1 / R2, rust: chance(0.5) ? 2 : 0 }); });
  // колесо между ногами: одно, на балке-оси от ноги (не висит в воздухе, не заходит за линию смены ноги)
  for (const f of [1, 3]) for (let tr = 0; tr < 160; tr++) { if (!chance(0.85) && tr === 0) break; const cy = ri(5, LEVEL.pelY - 5) + 0.5, Rg = 1.5, sg = f === 1 ? 1 : -1, ts = [10.3 * sg];
    if ((LEVEL.ringTops || []).some(r => Math.abs(cy + Rg - r) < 2.5)) continue;
    const cell = t => lane(f, t); let ok = true;
    for (const ct of ts) for (let t = Math.floor(Math.abs(ct) - Rg - 1); t <= Math.ceil(Math.abs(ct) + Rg + 1) && ok; t++) for (let y = Math.floor(cy - Rg - 1); y <= Math.ceil(cy + Rg + 2) && ok; y++) { const c = cell(t * sg); if (hasCube(c[0], y, c[1])) ok = false; }
    if (!ok) continue; const top = cy + Rg, ay = Math.floor(cy); let reach = false, t0 = 0;
    for (let t = 7; t >= 3; t--) { const c = cell(t * sg); if (hasCube(c[0], ay, c[1])) { t0 = t; break; } }
    if (!t0) continue;
    for (let t = 5; t <= 8 && !reach; t++) { const c = cell(t * sg); for (let y = Math.floor(top - 2); y <= Math.ceil(top + 1.2); y++) if (hasCube(c[0], y - 1, c[1]) && !hasCube(c[0], y, c[1]) && top - y <= 1.6) { reach = true; break; } }
    if (!reach) continue; const dv = (chance(0.5) ? 1 : -1) * (0.8 + R() * 0.7);
    for (let t = t0 + 1; t <= 9; t++) { const c = cell(t * sg); addCube(c[0], ay, c[1], 'ledge'); }   // балка-ось от ноги до ступицы
    const c = cell(ts[0]); LEVEL.gears.push({ x: c[0], y: cy, z: c[1], f, R: Rg, rust: chance(0.4) ? 1 + R() * 3 : 0, drive: dv, bridge: true });
    LEVEL.bits.push({ x: c[0], y: top + 0.9, z: c[1] }); break; }
  // поршневой механизм: шестерня-кривошип внизу, шатун гонит ползун вверх-вниз, над ним цилиндр. Ставится у конца уступа пути:
  // с уступа шагаешь на ползун, он поднимает на два куба — оттуда на крышку цилиндра или выше
  const FN1 = [[0, 1], [1, 0], [0, -1], [-1, 0]], prot = new Set();
  for (const q of LEVEL.path) for (let t = q.a - 1; t <= q.b + 1; t++) for (let y = q.top - 2; y <= q.top + 2; y++) { const c = lane(q.f, t); prot.add(ckey(c[0], y, c[1])); }   // уступы пути и место над ними
  for (const d of LEVEL.doors) for (let dx = -2; dx <= 2; dx++) for (let y = d.y - 1; y <= d.y + 2; y++) for (let dz = -2; dz <= 2; dz++) prot.add(ckey(Math.round(d.x) + dx, y, Math.round(d.z) + dz));
  { // первый насос — у старта, на углу ступни справа от ноги: малый, на него запрыгивают прямо с земли
    const GR = 0.75, rp = 0.6, Lr = 1.5, th = 0.3, gy = 2.78, top0 = gy + Lr - rp + th / 2, cyB = gy + Lr + rp + th / 2 + 0.95, cyT = cyB + 1.0; let sx = 0, sz = 0, ok = false, pf = 0, pumpStep = 0;
    for (const needStep of [true, false]) { if (ok) break; for (const [f, t] of [[0, 3], [0, -3], [0, 2], [0, -2], [3, 2], [3, -2], [1, 2], [1, -2], [3, 3], [3, -3], [1, 3], [1, -3], [2, 2], [2, -2], [0, 6], [0, 5], [1, -6], [1, -5], [0, -6], [3, 6], [1, 5], [2, 6], [2, -6], [3, -6], [1, 0]]) {   /* v230: сперва — перед голенью (Алексей: «на углу выглядит странно»), угол — запасной вариант */ const c = lane(f, t); let fr = true;   // на ступне — где над ней свободно
      for (let y = 2; y <= Math.ceil(cyT + 0.8) && fr; y++) for (const dt of [-1, 0, 1]) { const q = lane(f, t + dt), cq = cubes.get(ckey(q[0], y, q[1])), gone = cq && cq.bulge && !LEVEL.noShin && y <= 11; if ((cq && !gone) || prot.has(ckey(q[0], y, q[1]))) fr = false; }   /* v230: нарост у голени всё равно уберёт shinBuild */
      if (fr && !LEVEL.doors.some(d => Math.abs(d.x - c[0]) + Math.abs(d.z - c[1]) < 3 && d.y < 6)) { const gx0 = c[0] + 0.5 * (f === 0 || f === 2 ? 1 : 0), gz0 = c[1];
        // v231: рядом — ступень-тумба в куб (радиусы 5–7): без сапог с земли на колесо (верх 1.53) и ползун (1.84) не запрыгнуть, со ступени — да
        const N = FN1[f], at = (tt, r) => { const q = lane(f, tt); return [q[0] - N[0] * (8 - r), q[1] - N[1] * (8 - r)]; }, du = tt => { const q = lane(f, tt); return Math.abs(q[0] - gx0) + Math.abs(q[1] - gz0); };
        const colFree = tt => { const q = lane(f, tt); for (let y = 2; y <= 4; y++) { if (hasCube(q[0], y, q[1]) || prot.has(ckey(q[0], y, q[1]))) return false; for (const r of [5, 6, 7]) { const w = at(tt, r); if (hasCube(w[0], y, w[1])) return false; } }
          return !LEVEL.ladders.some(l => l.f % 4 === f && Math.abs(l.t - tt) < 1.2 && l.y0 < 5) && !LEVEL.doors.some(d => Math.abs(d.x - q[0]) + Math.abs(d.z - q[1]) < 2.2 && d.y < 6); };
        const cand = []; for (let tt = t - 4; tt <= t + 4; tt++) { const dd = du(tt); if (dd >= 1.4 && dd <= 2.6 && colFree(tt)) cand.push([dd, tt]); } cand.sort((p, q) => p[0] - q[0]);
        if (!cand.length && needStep) continue;   // без места под ступень — следующее место (второй проход — как раньше, без ступени)
        sx = gx0; sz = gz0; pf = f; ok = true;
        if (cand.length) { const t1 = cand[0][1], s = Math.sign(du(t1 + 1) - du(t1)) > 0 ? 1 : -1, cols = colFree(t1 + s) && du(t1 + s) <= 3.6 ? [t1, t1 + s] : [t1];
          pumpStep = cols.length; }   /* сами кубы ступени ставит shinFill в конце генерации — раньше их перекрывали ниши и кронштейны труб */
        break; } } }
    if (ok) { LEVEL.crates = LEVEL.crates.filter(o => !(Math.abs(o.x - sx) < 2 && Math.abs(o.z - sz) < 1.5)); LEVEL.lamps = LEVEL.lamps.filter(o => !(Math.abs(o.x - sx) < 2 && Math.abs(o.z - sz) < 1.5));
      LEVEL.robots = LEVEL.robots.filter(o => !(Math.abs(o.x - sx) < 2.5 && Math.abs(o.z - sz) < 1.5 && o.y < 4));
      LEVEL.gears.push({ x: sx, y: gy, z: sz, f: pf, R: GR, deco: false, pist: true, drive: 0.9, rust: 0 });   
      LEVEL.pistons.push({ f: pf, gx: sx, gz: sz, gy, cyB, cyT, gi: LEVEL.gears.length - 1, rp, L: Lr, th, hw: 0.72, cw: 0.32, start: true, step: pumpStep }); LEVEL.bits.push({ x: sx, y: cyT + 0.45, z: sz }); } }
  { const rp = 0.7, Lr = 2.2, th = 0.32, cand = [];
    for (let f = 0; f < 4; f++) for (let ct = -6; ct <= 6; ct++) for (let gy0 = 5; gy0 <= LEVEL.pelY - 10; gy0++) cand.push([f, ct, gy0 + 0.5]);
    cand.sort(() => R() - 0.5);
    for (const [f, ct, gy] of cand) { if (LEVEL.pistons.length >= 5) break;
      const lo = gy + Lr - rp + th / 2, cyB = gy + Lr + rp + th / 2 + 0.95, cyT = cyB + 1.2;
      // дотянуться: уступ пути на той же стороне примерно вровень с нижним положением ползуна и не дальше прыжка
      const q = [2, -2, 3, -3].some(dt => [0, 1].some(k => { const yT = Math.round(lo) + k, c = lane(f, ct + dt); return hasCube(c[0], yT - 1, c[1]) && !hasCube(c[0], yT, c[1]) && !hasCube(c[0], yT + 1, c[1]); })); if (!q) continue;   // рядом есть на что встать примерно вровень с нижним положением ползуна
      let ok = true; const clr = [];   // мешают только свободные куски (наросты, полки) — их можно убрать; путь, кольца и всё у дверей — нет
      for (let t = ct - 1; t <= ct + 1 && ok; t++) for (let y = Math.floor(gy - 1.2); y <= (t === ct ? Math.ceil(cyT + 0.9) : Math.ceil(gy + 1.2)) && ok; y++) { const c = lane(f, t); if (liftZone(f, t, y)) { ok = false; break; } if (!hasCube(c[0], y, c[1])) continue;
        const q = cubes.get(ckey(c[0], y, c[1])); if (!q.bulge || prot.has(ckey(c[0], y, c[1])) || clr.length >= 8) ok = false;   /* убирать можно только наросты обшивки */ else clr.push(ckey(c[0], y, c[1])); }
      if (!ok) continue; LEVEL.lamps = LEVEL.lamps.filter(o => !(Math.abs(o.x - lane(f, ct)[0]) + Math.abs(o.z - lane(f, ct)[1]) < 1.6 && o.y > gy - 2 && o.y < cyT + 3)); const c = lane(f, ct), near = o => Math.abs(o.x - c[0]) + Math.abs(o.z - c[1]) < 2.6 && o.y > gy - 2 && o.y < cyT + 2;
      const tOf = o => [o.x, -o.z, -o.x, o.z][f], onF = o => FN1[f][0] * o.x + FN1[f][1] * o.z > 7.4, hitX = (o, w, y0, y1) => onF(o) && Math.abs(tOf(o) - ct) < w && y1 > gy - 1.3 && y0 < cyT + 1;
      if (LEVEL.doors.some(d => hitX(d, 2.2, d.y, d.y + 2)) || LEVEL.steams.some(o => hitX(o, 1.2, o.y - 0.5, o.y + 0.5)) || LEVEL.gears.some(G => hitX(G, G.R + 1.3, G.y - G.R, G.y + G.R)) || LEVEL.ladders.some(L => L.f % 4 === f && Math.abs(L.t - ct) < 1.6 && L.y1 > gy - 1.3 && L.y0 < cyT + 1) || LEVEL.movers.some(m => m.f % 4 === f && m.y > gy - 2 && m.y < cyT + 2 && m.t1 + 2 > ct && m.t0 - 2 < ct) || LEVEL.pistons.some(p => p.f === f && Math.abs(p.gy - gy) < 8)) continue;
      for (const k of clr) cubes.delete(k);
      LEVEL.gears.push({ x: c[0], y: gy, z: c[1], f, R: 1.2, deco: false, pist: true, drive: (chance(0.5) ? 1 : -1) * (0.85 + R() * 0.4), rust: chance(0.4) ? 2 : 0 });
      LEVEL.pistons.push({ f, gx: c[0], gz: c[1], gy, cyB, cyT, gi: LEVEL.gears.length - 1 }); LEVEL.bits.push({ x: c[0], y: cyT + 0.45, z: c[1] }); } }
  // длинный шнур с лампой: свисает с высокого уступа почти до уступа ниже — по нему лезут наверх, на нём раскачиваются
  for (let k = 0, made = 0; k < 60 && made < (chance(0.6) ? 2 : 1); k++) { const P = LEVEL.path; const q2 = P[ri(4, P.length - 1)]; if (!q2) continue; const f = q2.f % 4, t = chance(0.5) ? q2.a - 1 : q2.b + 1, top = q2.top + 1.6, len = ri(6, 9);
    if (Math.abs(t) > 7 || top - len < 3) continue; const c = lane(f, t); let ok = true; for (let y = Math.floor(top - len - 1); y <= Math.ceil(top); y++) if (hasCube(c[0], y, c[1]) || liftZone(f, t, y)) ok = false;
    if (LEVEL.path.some(q => q.f % 4 === f && q !== q2 && q.top > top - len - 2 && q.top < top + 1 && t >= q.a - 2 && t <= q.b + 2)) continue;
    if (!ok || LEVEL.lamps.some(o => Math.abs(o.x - c[0]) + Math.abs(o.z - c[1]) < 1.5 && Math.abs(o.y - top) < len + 1) || LEVEL.ladders.some(L => L.f % 4 === f && Math.abs(L.t - t) < 1.2 && L.y1 > top - len && L.y0 < top)) continue;
    LEVEL.lamps.push({ x: c[0], y: top, z: c[1], f, len, th: 0.1, om: 0, bob: 0, bv: 0, ph: R() * 6, long: true }); made++; }
  // связки от края уступа пути в пустоту: колесо → лампа → уступ с наградой, лампа → колесо → уступ, или два колеса навстречу
  { let made = 0; const P = LEVEL.path.slice().sort(() => R() - 0.5);
    for (const q of P) { if (made >= 3) break; if (q.top < 5 || q.top > LEVEL.pelY - 6) continue; const f = q.f % 4;
      for (const dir of [1, -1]) { const e = dir > 0 ? q.b : q.a, T = k => e + dir * k; if (Math.abs(T(6)) > 7.5) continue;
        let ok = true; for (let k = 1; k <= 6 && ok; k++) for (let y = q.top - 2; y <= q.top + 3 && ok; y++) { const c = lane(f, T(k)); if (hasCube(c[0], y, c[1]) || liftZone(f, T(k), y)) ok = false; }
        const near = o => { const c = lane(f, T(3.5)); return Math.abs(o.x - c[0]) + Math.abs(o.z - c[1]) < 3.6 && o.y > q.top - 3 && o.y < q.top + 4.5; };
        if (!ok || LEVEL.doors.concat(LEVEL.lamps, LEVEL.steams, LEVEL.gears, LEVEL.fires).some(near) || LEVEL.pipes.some(p2 => p2.pts.some(p => near({ x: p[0], y: p[1], z: p[2] }))) || LEVEL.movers.some(m => m.f % 4 === f && Math.abs(m.y - q.top) < 5)
          || LEVEL.ladders.some(L => L.f % 4 === f && (L.t - e) * dir > 0 && (L.t - e) * dir < 7 && L.y1 > q.top - 3 && L.y0 < q.top + 5)) continue;
        const kind = ri(0, 2), gear = (k, sp) => { const c = lane(f, T(k)); LEVEL.gears.push({ x: c[0], y: q.top - 1.05, z: c[1], f, R: 1.2, drive: sp, rust: chance(0.4) ? 1 : 0, combo: true }); };
        const lampAt = k => { const c = lane(f, T(k)); LEVEL.lamps.push({ x: c[0], y: q.top + 3.6, z: c[1], f, len: 1.7, th: 0.3, om: 0, bob: 0, bv: 0, ph: R() * 6 }); };
        const sp = (chance(0.5) ? 1 : -1) * (0.7 + R() * 0.6);
        if (kind === 0) { gear(2.2, sp); lampAt(4.3); } else if (kind === 1) { lampAt(1.8); gear(3.8, sp); } else { gear(1.9, sp); gear(4.25, -sp); }   // колёса рядом крутятся навстречу
        for (const k of [5.5, 6].map(v => Math.round(v))) { const c = lane(f, T(k)); addCube(c[0], q.top, c[1], 'ledge'); }   // уступ на куб выше — с наградой
        { const c = lane(f, T(6)); LEVEL.crates.push({ x: c[0], y: q.top + 1, z: c[1] }); const c2 = lane(f, T(5)); LEVEL.bits.push({ x: c2[0], y: q.top + 1.45, z: c2[1] }, { x: c2[0], y: q.top + 2.3, z: c2[1] }); }
        made++; break; } } }
  if (LEVEL.boss) for (const sx of [-1, 1]) LEVEL.gears.push({ x: sx * 8.5, y: LEVEL.boss.F + 4.1, z: ROOM_Z, f: 0, R: 1.5, rust: 1 + R() * 3 });   // и в кабине мозга — по колесу над полками
}

// Кабина: одна большая комната с мозгом посередине. Полки у стен (на них узлы питания), повыше — две площадки, в полу решётки пара.
// Красные лампы. Вход слева у стены; выход справа появится, когда мозг погибнет.
function makeBossRoom(T, alt) {
  const Z = ROOM_Z, n = LEVEL.complexes.length, Y0 = ROOM_Y + n * 60, F = Y0 + 1;
  for (let x = -14; x <= 14; x++) for (let y = Y0 - 2; y <= Y0 + 12; y++) addCube(x, y, Z, 'core');
  for (let x = -12; x <= 12; x++) for (let y = Y0 + 1; y <= Y0 + 9; y++) { const k = ckey(x, y, Z); cubes.delete(k); LEVEL.carved.add(k); addCube(x, y, Z - 1, 'core'); }
  const plat = (a, b, y) => { for (let x = a; x <= b; x++) cubes.set(ckey(x, y, Z), { x, y, z: Z, kind: 'plat' }); };
  plat(-11, -8, F); plat(8, 11, F); plat(-6, -4, F + 1); plat(4, 6, F + 1);   // полки: стоять на F+1 и F+2
  LEVEL.doors.push({ x: -12, y: F, z: Z, f: 0, room: true, spr: 'door1', flip: false }); const inD = LEVEL.doors.length - 1;
  for (const x of [-10, -5.5, 0.5, 5.5, 10]) LEVEL.lamps.push({ x, y: F + 8, z: Z, f: 0, len: 0.9 + (x % 2 ? 0.3 : 0), th: 0.12, om: 0, bob: 0, bv: 0, ph: x, red: true });
  LEVEL.boss = { x: 0, y: F, z: Z, F, xa: -12, xb: 12, ceil: F + 8, nodes: [{ x: -10, y: F + 1.65 }, { x: 10, y: F + 1.65 }], vents: [-7.5, -3.2, 3.2, 7.5], noz: [-11, -8.5, -6, -3.5, -1.4, 1.4, 3.5, 6, 8.5, 11], drops: [-7, -4, 4, 7, -9, 9] };
  const C = { name: 'Кабина', alt, y0: Y0 - 6, y1: Y0 + 16, x0: -14, x1: 14, boss: true, inD }; LEVEL.complexes.push(C); return inD;
}

// Паровые машины на ноге (детали с листа паровой машины автора): кирпичная топка, на ней котёл с трубой и манометром,
// справа маховик, к нему от цилиндра идёт шатун. Стоят на широких уступах тропы, у стены; герой ходит перед ними.
function placeEngines(T) {
  const { ri, chance, R, lane, liftZone } = T; LEVEL.engines = []; LEVEL.engDbg = {}; const EW = 5, EH = 4, top = Math.min(60, (LEVEL.pelY || 40) - EH - 1);
  const tries = []; for (let f = 0; f < 4; f++) for (let y = 4; y <= top; y++) for (let t0 = -8; t0 <= 8 - EW + 1; t0++) tries.push([f, y, t0]);
  tries.sort(() => R() - 0.5);
  for (const [f, y0, t0] of tries) { if (LEVEL.engines.length >= 4) break; if (LEVEL.engines.some(e => e.f === f && Math.abs(e.y - y0) < 12)) continue; let ok = true;
    for (let t = t0; t < t0 + EW && ok; t++) for (let y = y0; y < y0 + EH && ok; y++) { const c = lane(f, t), wl = r => [[t, r], [r, -t], [-t, -r], [-r, t]][f], w7 = wl(7), w6 = wl(6); if (hasCube(c[0], y, c[1]) || liftZone(f, t, y) || !hasCube(w7[0], y, w7[1]) || LEVEL.carved.has(ckey(w7[0], y, w7[1])) || LEVEL.carved.has(ckey(w6[0], y, w6[1]))) ok = false; }   /* и не в нише */
    if (!ok) { (LEVEL.engDbg = LEVEL.engDbg || {}).rect = (LEVEL.engDbg.rect || 0) + 1; continue; } const c0 = lane(f, t0), c1 = lane(f, t0 + EW - 1), cx = (c0[0] + c1[0]) / 2, cz = (c0[1] + c1[1]) / 2;
    const near = o => Math.abs(o.x - cx) + Math.abs(o.z - cz) < EW / 2 + 1.5 && o.y > y0 - 1.5 && o.y < y0 + EH + 1;
    if (LEVEL.doors.concat(LEVEL.steams, LEVEL.gears, LEVEL.rings || [], LEVEL.keys || []).some(near)) { LEVEL.engDbg['obj'] = (LEVEL.engDbg['obj'] || 0) + 1; continue; }
    if (LEVEL.ladders.some(L => L.f % 4 === f && Math.abs(L.t - (t0 + EW / 2)) < EW / 2 + 1 && L.y1 > y0 - 1 && L.y0 < y0 + EH)) { LEVEL.engDbg['lad'] = (LEVEL.engDbg['lad'] || 0) + 1; continue; }
    if (LEVEL.pipes.some(p => p.pts.some(pt => near({ x: pt[0], y: pt[1], z: pt[2] })))) { LEVEL.engDbg['pipe'] = (LEVEL.engDbg['pipe'] || 0) + 1; continue; }
    if ((LEVEL.pistons || []).some(P => near({ x: P.gx, y: P.gy, z: P.gz }))) { LEVEL.engDbg['pist'] = (LEVEL.engDbg['pist'] || 0) + 1; continue; }
    if ((LEVEL.wires || []).some(w => w.f % 4 === f && Math.abs(w.y - y0) < EH + 1)) { LEVEL.engDbg['wire'] = (LEVEL.engDbg['wire'] || 0) + 1; continue; }
    const N = [[0, 1], [1, 0], [0, -1], [-1, 0]][f]; LEVEL.engines.push({ f, x: cx - N[0] * 0.45, z: cz - N[1] * 0.45, y: y0, flip: chance(0.5), ph: R() * 6, sp: 0.8 + R() * 0.6 }); }
}
// ====================== ПРЕДМЕТЫ — В ЯЩИКАХ ВНУТРЕННИХ КОМНАТ (v286) ======================
// Алексей 24.10: «раскидай все имеющиеся предметы по ящикам, желательно во внутренних комнатах, и чтобы была некоторая случайность».
// Нож, Руки Прометея, Вилка, Сапоги паука, Сапоги Гермеса — каждый в своём ящике (поле item у ящика), разбил — выпал предмет.
// Комнаты — внутри титана (y > 2500); ящик выбирается случайно (свой ГСЧ от номера карты: у каждой карты свой расклад).
// Нож — в комнате с самым низким входом (оружие нужно рано), остальное — по другим комнатам, по одному в комнату, пока комнат хватает.
// Ящиков в комнатах не хватило — предмет в ящике на ноге. Тест-набор (клавиша T, window.__startKit) — как раньше, у старта.
const ITEM_LOOT = ['knife', 'prom', 'fork', 'spider', 'hermes'];
function lootItems() {
  if (window.__startKit) return; const R = rng(((LEVEL.seed | 0) + 5151) >>> 0), C = LEVEL.complexes || [], D = LEVEL.doors || [];
  for (const c of LEVEL.crates || []) delete c.item;
  const cx = y => C.find(q => y >= q.y0 && y <= q.y1), entry = new Map();
  for (const d of D) { if (!d || d.y > 2500 || d.to === undefined || d.to === null) continue; const p = D[d.to], q = p && cx(p.y); if (q && (!entry.has(q) || d.y < entry.get(q))) entry.set(q, d.y); }   // вход в комплекс — дверь на ноге
  const startC = LEVEL.spawn ? cx(LEVEL.spawn.y) : null, byC = new Map();
  for (const c of LEVEL.crates || []) { if (c.y <= 2500 || c.key) continue; const q = cx(c.y); if (!q) continue; if (!byC.has(q)) byC.set(q, []); byC.get(q).push(c); }
  const rooms = [...byC.keys()].sort((a, b) => (a === startC ? -1 : entry.has(a) ? entry.get(a) : 1e4) - (b === startC ? -1 : entry.has(b) ? entry.get(b) : 1e4));
  const pickIn = q => { const L = byC.get(q).filter(c => !c.item); return L.length ? L[Math.floor(R() * L.length)] : null; };
  const used = new Set(), legC = (LEVEL.crates || []).filter(c => c.y < 900 && !c.key);
  for (const kind of ITEM_LOOT) { let c = null;
    if (kind === 'knife') { const low = rooms.slice(0, Math.min(2, rooms.length)); for (const q of low.sort(() => R() - 0.5)) { c = pickIn(q); if (c) { used.add(q); break; } } }
    else { const free = rooms.filter(q => !used.has(q)), pool = free.length ? free : rooms; for (let t = 0; t < 6 && !c && pool.length; t++) { const q = pool[Math.floor(R() * pool.length)]; c = pickIn(q); if (c) used.add(q); } }
    if (!c) { const L = legC.filter(q => !q.item); if (L.length) c = L[Math.floor(R() * L.length)]; }
    if (c) c.item = kind; }
  if (ITEM_LOOT.every(k => (LEVEL.crates || []).some(c => c.item === k))) { LEVEL.knife = null; LEVEL.prom = null; LEVEL.forkAt = null; LEVEL.items = []; }
}
// ====================== ФАЙЛ КАРТЫ (v241, шаг 1 нового этапа — паспорт, раздел 20) ======================
// Генератор строит уровень (buildLevel), mapSave() пишет его в файл карты (формат — notes/MAP_FORMAT.md),
// mapLoad(text) собирает уровень обратно из текста файла. Игра ВСЕГДА играет из файла: restart() → loadLevel().
// В файле: gen (зерно, порядок полей), titan (устройство), blocks (кубы цепочками в порядке постановки, выемки),
// props (предметы — ссылка на раздел библиотеки + поля), finish (пока пусто: отделка считается правилами в коде).
// Не в файле (достраивается при загрузке): верх кубов (top), грани (buildFaces); при запуске — spawnProps как раньше.
// Индексы между предметами (дверь → дверь, поршень → шестерня, перегородка → дверь) остаются номерами в своих списках,
// поэтому порядок предметов в каждом списке сохраняется. Общие объекты (лаз-провод в двух списках, точки мостков = точки труб)
// записываются один раз, второе место — {"$ref": "путь"}. Минус ноль пишется строкой "-0".
const MAP_VER = 1;
const MAP_RUNTIME = ['forceSeed', 'noLiftSide', 'noShin'];   // переключатели тестов: не карта, при загрузке не трогаются
const MAP_LIB = { robots: 'unit/robot', traps: 'danger/trap', pistons: 'mech/piston', cables: 'hang/cable', wsprites: 'deco/wireSprite', wireClimbs: 'climb/wire',
  wruns: 'hang/wireRun', wires: 'hang/wire', pipes: 'climb/pipe', ladders: 'climb/ladder', bits: 'unit/shard', crates: 'plat/crate', keys: 'unit/key', vents: 'mech/vent',
  rings: 'mech/hookRing', doors: 'unit/door', steams: 'danger/steam', lamps: 'hang/lamp', fires: 'danger/fire', lifts: 'mech/lift', gears: 'mech/gear', movers: 'mech/mover',
  items: 'unit/item', hearts: 'unit/heart', puddles: 'deco/puddle', engines: 'mech/engine', climbs: 'climb/climb', beams: 'climb/beam', decor: 'deco/decor', wet: 'deco/drip', grips: 'hang/grip', wgears: 'mech/wallGear', stairs: 'climb/stairs', walkways: 'plat/walkway' };
const MAP_ONE = { tutor: 'unit/tutorButton', knife: 'unit/knife', prom: 'unit/prometheus', forkAt: 'unit/fork' };   // одиночные предметы
const MAP_STATS = ['bulges', 'niches', 'recesses', 'shelves', 'shinPipes', 'shinFill', 'lowBots', 'humps', 'lampsNoClimb', 'lampsDropped', 'pipeHid', 'pipeOpen'];   // счётчики генератора — для журнала
const MAP_CFLAGS = ['x', 'y', 'z', 'kind', 'top', 'U', 'dep'];   // поля куба, которые не метки
function mapSave() {
  const L = LEVEL, seen = new Map();
  const clone = (v, p) => {
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : v;
    if (typeof v === 'function') return undefined;
    if (!v || typeof v !== 'object') return v;
    if (seen.has(v)) return { $ref: seen.get(v) }; seen.set(v, p);
    if (Array.isArray(v)) return v.map((x, i) => clone(x, p + '.' + i));
    const o = {}; for (const k of Object.keys(v)) { const c = clone(v[k], p + '.' + k); if (c !== undefined) o[k] = c; } return o; };
  const keys = Object.keys(L).filter(k => !MAP_RUNTIME.includes(k)), undef = keys.filter(k => L[k] === undefined);
  const m = { grk: MAP_VER, name: 'Карта ' + L.seed, gen: { by: GRK_VER, seed: L.seed, keys, undef, stats: {} }, titan: {}, blocks: { runs: [], holes: [] }, props: [], finish: {} };
  for (const k of keys) {
    if (k === 'seed' || k === 'carved' || L[k] === undefined) continue;
    if (k === 'armGroups') { m.titan.armGroups = L.armGroups.map((G, i) => { const o = {}; for (const q of Object.keys(G)) { if (q === 'hw' && typeof G.hw === 'function') { o.hw = { tab: [] }; for (let r = 1; r <= G.rows; r++) o.hw.tab.push(G.hw(r)); } else { const c = clone(G[q], 'armGroups.' + i + '.' + q); if (c !== undefined) o[q] = c; } } return o; }); continue; }   /* ширина руки по рядам 1..rows — таблицей, в прежнем порядке полей */
    if (k === 'userProps' && Array.isArray(L[k])) { L[k].forEach((q, i) => m.props.push(clone(q, k + '.' + i))); continue; }   /* v249: предметы из картинок — у каждого свой lib 'user/…' */
    if (MAP_LIB[k] && Array.isArray(L[k])) { L[k].forEach((q, i) => { const c = clone(q, k + '.' + i); m.props.push(c && typeof c === 'object' && !Array.isArray(c) && !c.$ref ? Object.assign({ lib: MAP_LIB[k] }, c) : { lib: MAP_LIB[k], v: c }); }); continue; }
    if (MAP_ONE[k] && L[k] && typeof L[k] === 'object') { m.props.push(Object.assign({ lib: MAP_ONE[k], one: true }, clone(L[k], k))); continue; }
    if (MAP_STATS.includes(k)) { m.gen.stats[k] = clone(L[k], k); continue; }
    m.titan[k] = clone(L[k], k); }
  // кубы цепочками: подряд поставленные кубы одного материала, идущие на +1 по одной оси, — одна запись [x, y, z, материал, ось, сколько]
  const mat = c => [c.kind, ...Object.keys(c).filter(k => !MAP_CFLAGS.includes(k) && c[k] === true)].join('+');
  const chain = (list, withMat) => mapChain(list, withMat ? mat : null);
  m.blocks.runs = chain(cubes.values(), true);
  const hs = [...L.carved].map(s => { const p = s.split(',').map(Number); return { x: p[0], y: p[1], z: p[2], s }; });
  if (hs.every(h => ckey(h.x, h.y, h.z) === h.s)) m.blocks.holes = chain(hs, false); else m.blocks.holesRaw = [...L.carved];
  return m;
}
// v247: цепочки кубов — общие для файла карты и редактора (редактор правит кубы в файле теми же функциями)
// mapChain(список {x,y,z,…}, matFn|null) → [[x, y, z, (материал,) (ось, сколько)], …]: подряд идущие на +1 по одной оси с одним материалом — одна запись
function mapChain(list, matFn) { const out = []; let run = null;
  for (const c of list) { const mm = matFn ? matFn(c) : '';
    if (run && run.m === mm) { const d = [c.x - run.lx, c.y - run.ly, c.z - run.lz], ax = d.findIndex(v => v === 1);
      if (ax >= 0 && d.filter(v => v === 0).length === 2 && (run.ax === undefined || run.ax === ax)) { run.ax = ax; run.n++; run.lx = c.x; run.ly = c.y; run.lz = c.z; continue; } }
    if (run) out.push(run); run = { x: c.x, y: c.y, z: c.z, m: mm, n: 1, lx: c.x, ly: c.y, lz: c.z }; }
  if (run) out.push(run);
  return out.map(r => { const a = [r.x, r.y, r.z]; if (matFn) a.push(r.m); if (r.n > 1) a.push('xyz'[r.ax], r.n); return a; });
}
function mapUnchain(runs, put, hasM) { for (const r of runs) { const o = hasM ? 1 : 0, mm = hasM ? r[3] : '', i0 = 'xyz'.indexOf(r[3 + o]), n = r[4 + o] || 1;
  for (let i = 0; i < n; i++) { const p = [r[0], r[1], r[2]]; if (i0 >= 0) p[i0] += i; put(p[0], p[1], p[2], mm); } } }
function mapLoad(text) {
  const m = typeof text === 'string' ? JSON.parse(text) : JSON.parse(JSON.stringify(text));
  if (!m || m.grk !== MAP_VER) throw new Error('не файл карты GRK (grk: ' + (m && m.grk) + ')');
  const rev = v => { if (v === '-0') return -0; if (Array.isArray(v)) return v.map(rev); if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = rev(v[k]); } return v; };
  // кубы
  cubes.clear();
  const unchain = mapUnchain;
  unchain(m.blocks.runs, (x, y, z, mm) => { const f = mm.split('+'); addCube(x, y, z, f[0]); const c = cubes.get(ckey(x, y, z)); for (let i = 1; i < f.length; i++) c[f[i]] = true; }, true);
  // уровень: всё прежнее (кроме переключателей тестов) убирается, поля ставятся в прежнем порядке
  for (const k of Object.keys(LEVEL)) if (!MAP_RUNTIME.includes(k)) delete LEVEL[k];
  const V = {}; V.seed = m.gen.seed;
  for (const k in m.titan) V[k] = rev(m.titan[k]);
  for (const k in m.gen.stats || {}) V[k] = rev(m.gen.stats[k]);
  for (const k in MAP_LIB) V[k] = [];
  const back = {}; for (const k in MAP_LIB) back[MAP_LIB[k]] = k; const backOne = {}; for (const k in MAP_ONE) backOne[MAP_ONE[k]] = k;
  for (const q0 of m.props) { const q = rev(q0), lib = q.lib;
    if (typeof lib === 'string' && lib.startsWith('user/')) { (V.userProps = V.userProps || []).push(q); continue; }
    if (q.one && backOne[lib]) { delete q.lib; delete q.one; V[backOne[lib]] = q; continue; }
    const k = back[lib]; if (!k) continue;
    if ('v' in q && Object.keys(q).length === 2) V[k].push(q.v); else { delete q.lib; V[k].push(q); } }
  for (const k of m.gen.keys) LEVEL[k] = k in V ? V[k] : (m.gen.undef || []).includes(k) ? undefined : null;
  if (V.userProps && !m.gen.keys.includes('userProps')) LEVEL.userProps = V.userProps;   /* v249: карта, где предметы из картинок появились впервые */
  LEVEL.carved = new Set(); if (m.blocks.holesRaw) for (const s of m.blocks.holesRaw) LEVEL.carved.add(s); else unchain(m.blocks.holes || [], (x, y, z) => LEVEL.carved.add(ckey(x, y, z)), false);
  for (const G of LEVEL.armGroups || []) if (G.hw && G.hw.tab) { const t = G.hw.tab; G.hw = r => t[r - 1]; }
  // v280: у левой руки кубы в группе теперь зеркальны (z как в мире) — старые карты переворачиваем при чтении, вместе с тем, что стоит на этих кубах
  for (const G of LEVEL.armGroups || []) if (!G.mz) { G.mz = 1; if (!/-1$/.test(G.part)) continue; const lo = G.gy - G.rows - 4, hi = G.gy + 4, inG = y => +y >= lo && +y <= hi;
    const list = [...cubes.values()].filter(c => inG(c.y)); for (const c of list) cubes.delete(ckey(c.x, c.y, c.z)); for (const c of list) { c.z = -c.z; cubes.set(ckey(c.x, c.y, c.z), c); }
    for (const k of Object.keys(LEVEL)) { const A = LEVEL[k]; if (!Array.isArray(A) || k === 'armGroups') continue; for (const o of A) { if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
      if (k === 'ladders' && inG(o.y0)) { if (o.f === 1 || o.f === 3) o.t = -o.t; else o.f = 2 - o.f; continue; }
      if (o.y0 !== undefined && o.z !== undefined && inG(o.y0)) { o.z = -o.z; continue; }
      if (o.y !== undefined && o.z !== undefined && inG(o.y)) { o.z = -o.z; if (o.f === 0 || o.f === 2) o.f = 2 - o.f; } } } }
  // общие объекты: {"$ref": "путь"} → тот же объект
  const get = p => { let o = LEVEL; for (const s of p.split('.')) { o = o[s]; if (o && o.$ref) o = get(o.$ref); } return o; };
  const fix = v => { if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { if (v[i] && v[i].$ref) v[i] = get(v[i].$ref); else fix(v[i]); } } else if (v && typeof v === 'object') { for (const k of Object.keys(v)) { if (v[k] && v[k].$ref) v[k] = get(v[k].$ref); else fix(v[k]); } } };
  for (const k of Object.keys(LEVEL)) { if (k === 'carved') continue; if (LEVEL[k] && LEVEL[k].$ref) LEVEL[k] = get(LEVEL[k].$ref); else fix(LEVEL[k]); }
  // как в конце buildLevel: верх кубов, консоли не опора, грани
  for (const c of cubes.values()) c.top = !hasCube(c.x, c.y + 1, c.z);
  for (const c of cubes.values()) if (c.cons) c.top = false;
  for (const q of LEVEL.puddles || []) { const c = cubes.get(ckey(Math.round(q.x), Math.round(q.y) - 1, Math.round(q.z))); if (c) c.pool = true; }   /* v270: лужа из редактора — вода в кубе под ней (как у бассейнов генератора) */
  buildFaces();
  return m;
}
function loadLevel() {   // restart(): открытый файл — играем его, иначе генератор пишет новую карту в файл и игра грузит её оттуда
  if (game.mapFileText) { mapLoad(game.mapFileText); game.mapText = game.mapFileText; return; }
  buildLevel(true); game.mapText = JSON.stringify(mapSave()); mapLoad(game.mapText);
}
function mapPretty(text) {   // для сохранения на диск: по строке на предмет и на цепочку кубов
  const m = JSON.parse(text), J = v => JSON.stringify(v), arr = a => '[\n' + a.map(x => '    ' + J(x)).join(',\n') + '\n  ]';
  return '{\n  "grk": ' + m.grk + ',\n  "name": ' + J(m.name) + ',\n  "gen": ' + J(m.gen) + ',\n  "titan": {\n' + Object.keys(m.titan).map(k => '    ' + J(k) + ': ' + J(m.titan[k])).join(',\n') + '\n  },\n' +
    '  "blocks": {\n    "runs": ' + arr(m.blocks.runs).replace(/\n {4}/g, '\n      ').replace(/\n {2}\]$/, '\n    ]') + ',\n    ' + (m.blocks.holesRaw ? '"holesRaw": ' + J(m.blocks.holesRaw) : '"holes": ' + J(m.blocks.holes)) + '\n  },\n' +
    '  "props": ' + arr(m.props) + ',\n  "finish": ' + J(m.finish) + (m.parts ? ',\n  "parts": ' + arr(m.parts) : '') + '\n}\n';   /* v255: части титана из редактора («Титан») */
}
async function mapDownload() {   // v242: в claude.ai — через сохранение claude.ai (спросит подтверждение), иначе обычное скачивание
  if (!game.mapText) return; const text = mapPretty(game.mapText), name = 'grk-' + (LEVEL.seed !== undefined ? LEVEL.seed : 'map') + '.grk.json';
  let dl = null; try { dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (dl) { try { await dl.save({ filename: name, data: new Blob([text], { type: 'application/json' }) }); showCombo('Карта сохранена в файл', true); }
    catch (e) { if (e && e.code === 'declined') showCombo('Сохранение отменено', true); else showCombo('Не сохранилось: ' + (e && (e.code || e.message)), true); } return; }
  const b = new Blob([text], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  showCombo('Карта сохранена в файл', true);
}
function mapPickFile() { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,.grk.json,application/json'; i.onchange = () => mapOpenFile(i.files[0]); i.click(); }
function mapOpenText(text, name) {
  try { const m = JSON.parse(text); if (!m || m.grk !== MAP_VER) throw new Error('это не файл карты'); game.mapFileText = JSON.stringify(m); restart(); showCombo('Карта из файла' + (name ? ': ' + name : ''), true); }
  catch (e) { showCombo('Не открылось: ' + e.message, true); }
}
function mapOpenFile(f) { if (!f) return; const r = new FileReader(); r.onload = () => { game.mapFileName = f.name.replace(/\.grk\.json$|\.json$/i, ''); mapOpenText(String(r.result), f.name); }; r.readAsText(f); }
addEventListener('keydown', e => {   // Ctrl+S — сохранить карту в файл, Ctrl+O — открыть файл карты
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.code === 'KeyS') { e.preventDefault(); e.stopImmediatePropagation(); mapDownload(); }
  else if (e.code === 'KeyO') { e.preventDefault(); e.stopImmediatePropagation(); mapPickFile(); }
}, true);
addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
addEventListener('drop', e => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); mapOpenFile(e.dataTransfer.files[0]); });
// ====================== ВИД (поворот мира) ======================
const view = { k: 0, angle: 0, rotating: false, from: 0, to: 0, r: [1, 0], n: [0, 1] };
let cells = new Map();   // клетка проекции -> кубы, ближние к камере первыми
const cellKey = (U, Y) => (U + 512) * 4096 + (Y + 512);
function basis(deg) { const a = deg * Math.PI / 180; return { r: [Math.cos(a), -Math.sin(a)], n: [Math.sin(a), Math.cos(a)] }; }
function setView(k) {
  view.k = ((k % 4) + 4) % 4; view.angle = view.k * 90;
  const b = basis(view.angle);
  view.r = [Math.round(b.r[0]), Math.round(b.r[1])]; view.n = [Math.round(b.n[0]), Math.round(b.n[1])];
  cells = new Map();
  for (const c of cubes.values()) {
    c.U = c.x * view.r[0] + c.z * view.r[1]; c.dep = c.x * view.n[0] + c.z * view.n[1];
    const k2 = cellKey(c.U, c.y); let a = cells.get(k2); if (!a) cells.set(k2, a = []); a.push(c);
  }
  for (const a of cells.values()) a.sort((p, q) => q.dep - p.dep);
}
const cellAt = (U, Y) => cells.get(cellKey(U, Y));
const toU = e => e.x * view.r[0] + e.z * view.r[1];
const toD = e => e.x * view.n[0] + e.z * view.n[1];
function setUD(e, u, d) { e.x = u * view.r[0] + d * view.n[0]; e.z = u * view.r[1] + d * view.n[1]; }
const DEPTH_TOL = 0.61;

function eachBodyCell(u, y, hw, h, fn) {
  const U0 = Math.round(u - hw + 1e-4), U1 = Math.round(u + hw - 1e-4);
  const Y0 = Math.floor(y + 1e-4), Y1 = Math.floor(y + h - 1e-4);
  for (let U = U0; U <= U1; U++) for (let Y = Y0; Y <= Y1; Y++) { const a = cellAt(U, Y); if (a && fn(a, U, Y)) return true; }
  return false;
}
const overlapsAny = (u, y, hw, h) => eachBodyCell(u, y, hw, h, () => true);
const overlapsDepth = (u, y, hw, h, d) => eachBodyCell(u, y, hw, h, a => a.some(c => Math.abs(c.dep - d) <= DEPTH_TOL));
// Куб, на котором можно стоять в клетке (U, Y): куб своей глубины, а если такого нет — самый ближний к камере
// (его верх виден игроку). Кубы, спрятанные за другими, опорой не считаются. mode 'same' — только своя глубина.
function floorCube(U, Y, d, mode) {
  const a = cellAt(U, Y); if (!a) return null;
  let best = null, bd = 1e9;
  for (const c of a) if (c.top) { const dd = Math.abs(c.dep - d); if (dd <= DEPTH_TOL && dd < bd) { best = c; bd = dd; } }
  if (best || mode === 'same') return best;
  return a[0].top && !a[0].rec ? a[0] : null;   // дно углубления в стене — не опора: герой в нишу не проваливается
}

// ====================== ГРАФИКА: загрузка ======================
const img = {};
function loadImages() {
  return Promise.all(D.tex.concat(['legwall2', 'PipeKit', 'Grips', 'WallGears', 'Stairs', 'Screens', 'Hydrants', 'Fans']).map(n => new Promise(res => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = 'tex/' + n + (n === 'wall3' ? '.jpg' : '.png') + '?v=' + GRK_VER.slice(1); img[n] = i; })));
}
// Каждый кадр вырезаем в отдельный холст с прозрачной каймой, чтобы при сглаживании не подмешивались соседние кадры листа.
const cut = {};
const yFix = {};
function fixKicks() {
  for (const cn of ['MainCharAC_LegsAttackUpL1', 'MainCharAC_LegsAttackUpL2']) for (const f of CL[cn].frames) {
    const s = SP[f[1]], b = bounds[f[1]]; if (s && b) yFix[f[1]] = -0.01 - ((s[4] - b[3] - s[6]) / s[7] + 0.39);
  }
}
function cutSprites() {
  for (const name in D.sprites) {
    const s = D.sprites[name], im = img[s[0]]; if (!im || !im.width) continue;
    const c = document.createElement('canvas'); c.width = s[3] + 2; c.height = s[4] + 2;
    const x = c.getContext('2d'); x.drawImage(im, s[1], s[2], s[3], s[4], 1, 1, s[3], s[4]); cut[name] = c;
    // границы нарисованного (непрозрачного) в кадре — по ним считаются попадания
    try {
      const d = x.getImageData(1, 1, s[3], s[4]).data; let x0 = s[3], x1 = -1, y0 = s[4], y1 = -1;
      for (let yy = 0; yy < s[4]; yy++) for (let xx = 0; xx < s[3]; xx++) if (d[(yy * s[3] + xx) * 4 + 3] > 60) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      if (x1 >= 0) bounds[name] = [x0, y0, x1 + 1, y1 + 1];
      if (x1 >= 0 && /^(hamethrow|HandAttack_|hamehandattack|hamesitattack)/.test(name)) {   // кончик вытянутой руки: крайний столбик рисунка со стороны броска
        const left = /L_\d+$/.test(name) || /^(hamehandattack|hamesitattackL)/.test(name), col = left ? x0 : x1; let sy = 0, n = 0;
        for (let yy = 0; yy < s[4]; yy++) if (d[(yy * s[3] + col) * 4 + 3] > 60) { sy += yy; n++; }
        hand[name] = [(col + 0.5 - s[5]) / s[7], (s[4] - sy / n - s[6]) / s[7]];
      }
    } catch (err) { /* без границ попадания считаются по запасным размерам */ }
  }
  frameReapply();   /* v259: перерисованные кадры (13e_frames.js) */
}
const bounds = {}, hand = {}, colTops = {}, rowEdges = {};
// левый и правый край рисунка в каждой строке кадра — вдоль них вода стекает по герою
function rowEdge(name) {
  if (rowEdges[name]) return rowEdges[name]; const c = cut[name]; if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, a = [];
  for (let y = 0; y < c.height; y++) { let l = -1, r = -1; for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 60) { if (l < 0) l = x; r = x; } a.push([l, r]); }
  return rowEdges[name] = a;
}
// верхняя граница рисунка в каждом столбце кадра — по ней вода ложится на героя
function colTop(name) {
  if (colTops[name]) return colTops[name]; const c = cut[name]; if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, a = new Int16Array(c.width).fill(-1);
  for (let x = 0; x < c.width; x++) for (let y = 0; y < c.height; y++) if (d[(y * c.width + x) * 4 + 3] > 60) { a[x] = y; break; }
  return colTops[name] = a;
}
// прямоугольник нарисованного кадра в мире: [лево, право, низ, верх]; u, y — куда ставится опорная точка кадра
function spriteBox(name, u, y, flip) {
  const s = SP[name], b = bounds[name]; if (!s || !b) return null;
  let l = (b[0] - s[5]) / s[7], r = (b[2] - s[5]) / s[7];
  if (flip) { const t = l; l = -r; r = -t; }
  return [u + l, u + r, y + (s[4] - b[3] - s[6]) / s[7], y + (s[4] - b[1] - s[6]) / s[7]];
}

// ====================== АНИМАЦИЯ ======================
const CL = D.clips, SP = D.sprites;
// звук шагов в сборке привязан только к правым клипам бега — даём те же моменты левым
CL.MainCharAC_RunSlowL.events = CL.MainCharAC_RunSlowR.events; CL.MainCharAC_RunFastL.events = CL.MainCharAC_RunFastR.events;
// второй прыжок: те же кадры, что и толчок от земли (присел — выпрямился — взлетел), только в воздухе
{ const fr = [[0, 1], [0.07, 2], [0.15, 3], [0.24, 4], [0.33, 5]];
  CL.MainCharAC_AirJumpR = { len: 0.42, events: [], frames: fr.map(f => [f[0], 'JumpAnimations_' + f[1]]) };
  CL.MainCharAC_AirJumpL = { len: 0.42, events: [], frames: fr.map(f => [f[0], 'JumpAnimations_' + (f[1] + 15)]) }; }
// бросок куная в полёте: кадры броска «полулёжа» из комбо с ножом
CL.MainCharAC_AirThrow = { len: 0.4, events: [[0.1, 'ThrowKunai', 1]], frames: [[0, 'LegsAttackAnimation_6'], [0.1, 'LegsAttackAnimation_7'], [0.2, 'LegsAttackAnimation_8'], [0.3, 'LegsAttackAnimation_9']] };
class Anim {
  constructor() { this.clip = null; this.name = ''; this.t = 0; this.loop = true; this.flip = false; this.done = false; this.looped = false; this.speed = 1; this.onEvent = null; }
  play(name, o = {}) {
    if (!CL[name]) return;
    if (this.name === name && !o.restart && this.flip === !!o.flip) return;
    this.name = name; this.clip = CL[name]; this.t = 0; this.loop = o.loop !== false; this.flip = !!o.flip; this.done = false; this.looped = false; this.speed = o.speed || 1;
  }
  update(dt) {
    const c = this.clip; this.looped = false; if (!c || this.done) return;
    const t0 = this.t; let t1 = t0 + dt * this.speed;
    if (this.onEvent) for (const ev of c.events) if ((ev[0] >= t0 && ev[0] < t1) || (t0 === 0 && ev[0] === 0)) this.onEvent(ev[1], ev[2]);
    if (t1 >= c.len) { if (this.loop) { t1 -= c.len; this.looped = true; } else { t1 = c.len; this.done = true; } }
    this.t = t1;
  }
  sprite() {
    const c = this.clip; if (!c) return null;
    let s = null; for (const f of c.frames) { if (f[0] <= this.t + 1e-6) s = f[1]; else break; }
    return s;
  }
}
function heroClip(base, n = '') {
  const side = hero.face > 0 ? 'R' : 'L';
  let nm = 'MainCharAC_' + base + side + n; if (CL[nm]) return [nm, false];
  nm = 'MainCharAC_' + base + 'R' + n; if (CL[nm]) return [nm, hero.face < 0];
  nm = 'MainCharAC_' + base + n; return [nm, hero.face < 0];
}

// ====================== МИР: общее состояние (ядро, v243) ======================
// Шаг 2 нового этапа: то, что нужно и игре, и редактору, — состояние мира и сами сущности.
// Поведение (управление героем, бой, роботы, интерфейс) — в файлах игры.
const game = { gSide: -1, gv: { x: 0, y: 0, z: -26 }, deathT: 0, firstFire: false, time: 0, started: false, finishT: 0, pan: 0, hudT: 0, hitStop: 0, shake: 0, scroll: 0, stepT: 0, bob: 0, nudge: 0, lift: 0 };
const hero = { x: 0, y: 0, z: 0, vx: 0, vy: 0, hw: 0.13, h: 0.57, face: 1, onGround: false, anim: new Anim(),
  st: 'Stay', state: 'free', trig: {}, hitOK: false, timeWithInput: 0, jumpStart: -9, jumpUp: false, hp: CFG.heroHP, armor: 0, invuln: 0,
  deadT: 0, embedded: false, hang: null, hangCool: 0, boostT: 0, boostDir: 0, noGrav: false, pushV: 0, airJumps: 1, coyote: 0, jumpBuf: 0, airT: 0, ride: null, rideCool: 0, hitWin: null, levelY: 0, series: { arm: { i: -1, t: -9 }, leg: { i: -1, t: -9 } }, kunai: 3, standOn: null, onRobotT: 0, hook: null, hookCool: 0, sq: 0, sqV: 0, lean: 0, hangPop: 0, sprint: false, tapDir: 0, tapT: -9, rideU: null };
const rnd = (a, b) => a + Math.random() * (b - a);   // из 04_audio.js
let rings = [], puddles = [], wetSpots = [], hearts = [], knifeItem = null, promItem = null;   // из 08_hero_movesa_fireHook.js
let forkItem = null, forkPulls = [], fBolts = [];   // из 08_hero_movese_fork.js
const pick = arr => arr[Math.floor(Math.random() * arr.length)];   // из 04_audio.js
let robots = [], kunais = [];   // из 09_robotsa_nextDeath.js
let heads = [], headCv = null;   // из 09_robotsa_nextDeath.js
let bolts = [];   // из 09_robotsb_spawnHunter.js
let jets = [];   // из 09_robotsa_nextDeath.js
// ↓ из 09_robotsc_pixelGlow.js
// Пиксельный свет: несколько ступенчатых кругов из крупных квадратов, сложенных светом
const glowCache = new Map();
// ↓ из 16_loop.js
const FOOT_HALF = 8.5;
// ↓ из 16_loop.js
// Подошва: снизу тёмная, почти чёрная зелёная полоса; когда нога отрывается, к подошве прилипли куски почвы и мха —
// каждый кусок собран из мелких пикселей (как мох и листва), висит под подошвой, подрагивает и по физике отваливается.
let soleChunks = [];
// ↓ из 08_hero_movesb_plogTick.js
let arcs = [];
// ↓ из 07_heroa_nextIn.js
let cshots = [], fbolts = [], fwake = [];   // fwake — огонь, оставшийся за шаром: героя не жжёт, роботов поджигает
// ↓ из 07_herob_updateCharge.js
let slashes = [], kickArcs = [];
// ↓ из 08_hero_movesb_plogTick.js
const heroHiddenAt = (u, y, d) => eachBodyCell(u, y, hero.hw, hero.h, a => a[0].dep > d + DEPTH_TOL);   // героя на этой глубине закроет ближний куб?
// ↓ из 08_hero_movesc_startGrab.js
let dashTrail = [], firstGrab = false;
// ↓ из 08_hero_movesc_startGrab.js
// Удар с неба: двойной прыжок и нога — герой пикирует ногой вниз, за ногой белый шлейф
let diveTrail = [];
// ↓ из 09_robotsa_nextDeath.js
const popups = [], puffs = [];
// ====================== ЭФФЕКТЫ ======================
// Кадровые эффекты (пыль, кольца, дым) — из листа эффектов; мелкие «пиксели» (грязь, искры, дымок) рисуются кодом.
const fxs = [], parts = [];
const DIRT = ['#2b2226', '#4a3d3c', '#6f5f56', '#9c8a78'], SPARK = ['#fff4e1', '#ffd27a', '#e0702e'], SMOKE = ['#f3ead0', '#d9cdb0', '#b3a58c'], WOOD = ['#2b1a17', '#5b3a29', '#8a5a3a', '#b07a4c'], GOLD = ['#fff4e1', '#ffd27a', '#f0a63c'];
const at = (e, du) => ({ x: e.x + du * view.r[0], z: e.z + du * view.r[1] });
function spawnFx(name, x, y, z, o = {}) {
  if (!CL[name]) return;
  const a = new Anim(); a.play(name, { loop: false, restart: true, speed: o.speed || 1 });
  fxs.push({ x, y, z, anim: a, flip: !!o.flip, scale: o.scale || 1 });
}
// горсть пикселей: dir — куда летят (−1 влево, 1 вправо, 0 во все стороны), up — добавка вверх, g — тяжесть, drag — торможение
function burst(x, y, z, o) {
  const sp = o.sp || [1, 3], g = o.g === undefined ? 9 : o.g;
  for (let i = 0; i < o.n; i++) {
    const a = o.dir ? rnd(-0.3, 1.25) : rnd(0.15, 2.99), v = rnd(sp[0], sp[1]);
    const vu = (o.dir || 1) * Math.cos(a) * v, vy = Math.sin(a) * v * (g ? 1 : 0.5) + (o.up || 0);
    parts.push({ x, y, z, vx: vu * view.r[0], vz: vu * view.r[1], vy, g, drag: o.drag || 0, t: 0, life: (o.life || 0.5) * rnd(0.6, 1.1), size: o.size || (Math.random() < 0.35 ? 2 : 1), col: pick(o.cols) });
  }
}
function updateFx(dt) {
  updateHeads(dt); updateZaps(dt); promTrail(dt); updateCShots(dt); updateCharge(dt); updateFBolts(dt); for (const A of arcs) A.t += dt; if (arcs.length && arcs.some(A => A.t >= A.life)) arcs = arcs.filter(A => A.t < A.life); plogTick(dt); fatT += dt; if (fatT > 35) { fatT = 0; for (const k in fatigue) fatigue[k] = Math.max(0, fatigue[k] - 1); } for (const q of dashTrail) q.t += dt; for (const q of diveTrail) q.t += dt; if (diveTrail.length && diveTrail[0].t > 0.3) diveTrail = diveTrail.filter(q => q.t <= 0.3); if (dashTrail.length && dashTrail[0].t > 0.3) dashTrail = dashTrail.filter(q => q.t <= 0.3);
  for (const f of fxs) f.anim.update(dt);
  for (let i = fxs.length - 1; i >= 0; i--) if (fxs[i].anim.done) fxs.splice(i, 1);
  if (parts.length > 1100) parts.splice(0, parts.length - 1100);   // предел частиц: старые уходят первыми
  let j = 0; for (let i = 0; i < parts.length; i++) {   // без splice в цикле: живые частицы сдвигаются к началу
    const q = parts[i]; if (q.hold > 0) { q.hold -= dt; parts[j++] = q; continue; }   /* ком висит на ступне, потом отрывается */
    q.t += dt; if (q.t >= q.life) continue;
    q.vy -= q.g * dt; if (q.drag) { const k = Math.exp(-q.drag * dt); q.vx *= k; q.vz *= k; q.vy *= k; }
    q.x += q.vx * dt; q.z += q.vz * dt; q.y += q.vy * dt; parts[j++] = q;
  }
  parts.length = j;
}
function drawFx(b) {
  ctx.imageSmoothingEnabled = false; drawDashTrail(b); drawDiveTrail(b);
  for (const f of fxs) {
    const nm = f.anim.sprite(), s = SP[nm], c = cut[nm]; if (!s || !c) continue;
    const sc = S / s[7] * f.scale;
    ctx.save(); ctx.translate(Math.round(W / 2 + relU(f, b) * S), Math.round(H / 2 - (f.y - cam.y) * S)); if (f.flip) ctx.scale(-1, 1);
    ctx.drawImage(c, -(s[5] + 1) * sc, -(s[4] - s[6] + 1) * sc, (s[3] + 2) * sc, (s[4] + 2) * sc); ctx.restore();
  }
  const g = Math.max(2, Math.round(S * 0.026));
  for (const q of parts) {
    const k = q.t / q.life, sz = g * (k > 0.7 && q.size > 1 ? q.size - 1 : q.size);
    const px = Math.round((W / 2 + relU(q, b) * S) / g) * g, py = Math.round((H / 2 - (q.y - cam.y) * S) / g) * g; if (px < -g * 4 || px > W + g * 4 || py < -g * 12 || py > H + g * 4) continue;   /* вне кадра не рисуем */
    if (q.a) ctx.globalAlpha = q.a * (1 - k);
    ctx.fillStyle = q.col;
    if (q.tongue) { const hN = Math.max(1, Math.round(q.tongue * (1 - k))), wide = hN >= 3 ? 2 : 1; ctx.fillRect(px - (wide > 1 ? g : 0), py - (hN >> 1) * g, g * (wide > 1 ? 3 : 1), Math.max(1, hN >> 1) * g); ctx.fillRect(px, py - hN * g, g, hN * g); if (hN >= 4) ctx.fillRect(px + ((q.tongue & 1) ? g : -g), py - (hN - 1) * g, g, g * 2); continue; }
    ctx.fillRect(px, py, sz, sz);
    if (q.glint && k < 0.6) { ctx.fillRect(px - g, py, g * 3, g); ctx.fillRect(px, py - g, g, g * 3); }   // блик крестиком
    if (q.a) ctx.globalAlpha = 1;
  }
  ctx.imageSmoothingEnabled = true;
}

// ====================== ПРЕДМЕТЫ ======================
let vents = [], bits = [], crates = [], bitsGot = 0, bitsTotal = 0, doors = [], keyItems = [];
const FACE_N = [[0, 1], [1, 0], [0, -1], [-1, 0]];   // куда смотрит каждая сторона ноги
let lifts = [], dynClimbs = [], movers = [];
const moverPos = M => { const c = [[M.t, 8], [8, -M.t], [-M.t, -8], [-8, M.t]][M.f % 4]; return { x: c[0], z: c[1] }; };
function updateMovers(dt) {
  for (const M of movers) { const t0 = M.t; if (M.wait > 0) M.wait -= dt; else { M.t += M.dir * 1.3 * dt; if (M.t >= M.t1) { M.t = M.t1; M.dir = -1; M.wait = 0.8; } else if (M.t <= M.t0) { M.t = M.t0; M.dir = 1; M.wait = 0.8; } }
    const p = moverPos(M); M.x = p.x; M.z = p.z;
    if (hero.standOn === M && hero.state !== 'dead') { const FN = FACE_N[M.f % 4], al = [-FN[1], FN[0]], dt2 = M.t - t0, sgn = [1, -1, -1, 1][M.f % 4];   // везёт героя
      const du = (M.x - (M.px === undefined ? M.x : M.px)) * view.r[0] + (M.z - (M.pz === undefined ? M.z : M.pz)) * view.r[1], nu = toU(hero) + du, dd = toD(hero); if (Math.abs(du) < 0.5 && !overlapsDepth(nu, hero.y + 0.03, hero.hw, hero.h - 0.06, dd)) setUD(hero, nu, dd); }
    M.px = M.x; M.pz = M.z; }
}
function drawMover(M, b) {             // панель — брус три на один на один: видна спереди, с торца и сзади
  const N = FACE_N[M.f % 4], A = [-N[1], N[0]], im = img.plat; if (!im || !im.width) return;
  const fN = N[0] * b.n[0] + N[1] * b.n[1], fA = A[0] * b.n[0] + A[1] * b.n[1], aU = A[0] * b.r[0] + A[1] * b.r[1], nU = N[0] * b.r[0] + N[1] * b.r[1], cu = relU(M, b), py = Math.round(H / 2 - (M.y - cam.y) * S);
  const quad = (u0, u1, sx, sw, dark) => { const x0 = Math.round(W / 2 + Math.min(u0, u1) * S), w = Math.abs(u1 - u0) * S; if (w < 1) return; ctx.fillStyle = 'rgba(8,6,16,0.22)'; ctx.fillRect(x0, py + S, w, Math.round(S * 0.16)); ctx.imageSmoothingEnabled = true; ctx.drawImage(im, sx, 0, sw, im.height, x0, py, w + 0.6, S);
    if (dark > 0.01) { ctx.fillStyle = 'rgba(6,18,26,' + dark.toFixed(3) + ')'; ctx.fillRect(x0, py, w + 0.6, S); } ctx.fillStyle = 'rgba(255,244,225,0.18)'; ctx.fillRect(x0, py, w + 0.6, Math.max(2, S * 0.04)); };
  if (Math.abs(fA) > 0.02) { const c = cu + Math.sign(fA) * 1.5 * aU; quad(c - 0.5 * nU, c + 0.5 * nU, im.width * 0.4, im.width * 0.2, 0.22 + (1 - Math.abs(fA)) * 0.3); }   // торец
  if (Math.abs(fN) > 0.02) { const c = cu + Math.sign(fN) * 0.5 * nU; quad(c - 1.5 * aU, c + 1.5 * aU, 0, im.width, fN > 0 ? (1 - fN) * 0.4 : 0.3); }                              // длинная сторона: передняя или задняя
}
// Лифт перегородки: открыл дверь ключом и прошёл — от земли до этого яруса ходит люлька с меткой цвета ключа. Цепь у неё не рвётся.
// Открыл следующую перегородку — прежний лифт убирается, новый идёт выше
function openGateLift(n) {
  if ((game.gateLift || 0) >= n || !LEVEL.ringTops || !LEVEL.ringTops[n - 1]) return; game.gateLift = n;
  for (const L of lifts) if (L.gateN) dynClimbs = dynClimbs.filter(q => q !== L.chain); lifts = lifts.filter(L => !L.gateN);
  const top = LEVEL.ringTops[n - 1], sx = LEVEL.start.x, sy = LEVEL.start.y, sz = LEVEL.start.z; let best = null;
  for (let t = -7; t <= 7; t++) { if (Math.abs(t - sx) < 1.5 || !hasCube(t, sy - 1, sz)) continue; let ok = true; for (let y = sy; y <= top + 3 && ok; y++) if (hasCube(t, y, sz)) ok = false; if (!ok) continue;
    if (lifts.some(L => Math.abs(L.x - t) + Math.abs(L.z - sz) < 2.1) || doors.some(d => Math.abs(d.x - t) < 1.5 && Math.abs(d.z - sz) < 1.5 && d.y < sy + 2)) continue; if (best === null || Math.abs(t - sx) < Math.abs(best - sx)) best = t; }
  if (best === null) return;
  const L = { x: best, z: sz, f: 0, y0: sy + 0.12, y1: top + 0.12, y: sy + 0.12, dir: 1, wait: 0.5, v: 1, dead: true, lift: true, safe: true, gateN: n }; L.chain = { x: L.x, z: L.z, y0: L.y + 1.3, y1: L.y1 + 3.3, pipe: true, chain: L }; dynClimbs.push(L.chain); lifts.push(L);
  { gears = gears.filter(G => !G.gateN); const li = lifts.length - 1, sd = hasCube(L.x - 1, L.y1 + 3, L.z) ? 1 : -1, R1 = 0.66, R2 = 0.38, y = L.y1 + 3.5, d = R1 + R2 - 0.1, x1 = L.x + sd * R1 * 0.92;   /* над лифтом перегородки тоже две шестерни: большая и малая */
    gears.push({ x: x1, y, z: L.z, f: 0, R: R1, deco: true, lift: li, rev: false, ph: 0, rust: 2, gateN: n, ang: 0, om: 0, on: false, extra: 0, drive: 0 });
    gears.push({ x: x1 + sd * d * 0.94, y: y + d * 0.34, z: L.z, f: 0, R: R2, deco: true, lift: li, rev: true, ph: 0.2, ratio: R1 / R2, rust: 0, gateN: n, ang: 0, om: 0, on: false, extra: 0, drive: 0 }); }
  showCombo(GATE_COL[n][5] + ' лифт ждёт внизу — довезёт до этого яруса', true);
}
function updateLifts(dt) {               // люлька ездит туда и обратно, на остановках ждёт; с пассажиром цепь может лопнуть
  for (const L of lifts) {
    const aboard = hero.standOn === L && hero.state !== 'dead';
    if (L.broken) {                        // оборвалась: падает до нижней остановки и там остаётся
      if (L.y > L.y0) { L.vy -= 22 * dt; L.y = Math.max(L.y0, L.y + L.vy * dt);
        if (L.y <= L.y0) { game.shake = Math.max(game.shake, 0.22); sfx('Jump_4_landfall', 0.9, 0.4); sfx('RobotDeathD', 0.5, 0.7);
          burst(L.x, L.y + 0.1, L.z, { n: 26, cols: DIRT, sp: [1, 4.5], life: 0.7, size: 2 }); burst(L.x, L.y + 0.2, L.z, { n: 14, cols: SMOKE, sp: [0.4, 1.6], up: 0.8, g: 0, drag: 2.5, life: 0.8, size: 2 });
          for (const r of robots.slice()) if (!r.dead && !r.lift && Math.abs(r.x - L.x) + Math.abs(r.z - L.z) < 1.3 && r.y > L.y - 1.3 && r.y < L.y + 1.3) rageBlast(r);   // придавило робота — он взрывается
          if (hero.state !== 'dead' && Math.abs(toU(hero) - toU(L)) < 0.9 && hero.y >= L.y - 0.3 && hero.y < L.y + 1.6) hurtHero(toU(L) + (Math.random() < 0.5 ? -0.3 : 0.3), 'придавило люлькой'); } }
      continue; }
    if ((L.exit || L.gateN) && !aboard && L.y <= L.y0 + 0.001) { L.dir = 1; L.wait = 0.5; continue; }   // лифт к выходу ждёт героя внизу и без него не уезжает
    if (!L.exit && !L.gateN && L.wait > 0 && L.wait - dt <= 0 && !L.cargo && !aboard && hero.state !== 'dead') {   // трогается из места, которого не видно, туда, где герой: в одном случае из пяти везёт робота
      const dest = L.dir > 0 ? L.y1 : L.y0, seenAt = y => Math.abs(y + 0.5 - cam.y) < H / S / 2 + 0.5 && Math.abs((L.x - cam.x) * view.r[0] + (L.z - cam.z) * view.r[1]) < W / S / 2 + 1 && FACE_N[L.f][0] * view.n[0] + FACE_N[L.f][1] * view.n[1] > 0.5;
      if (!seenAt(L.y) && seenAt(dest) && Math.random() < 0.5 && robots.filter(r => !r.dead).length < 22) { const r = makeRobot({ x: L.x, y: L.y, z: L.z, h: [1, 0], R: 9, F: 7.5 }); r.lift = L; r.anim.play('RobotAC_Stay'); robots.push(r); L.cargo = r; } }
    if (L.wait > 0) { L.wait -= dt; if (L.wait <= 0) L.snapAt = aboard && !L.safe && Math.random() < 0.3 ? L.y0 + (L.y1 - L.y0) * rnd(0.35, 0.85) : null; continue; }   // тронулась с героем: в трёх случаях из десяти цепь не выдержит
    const tgt = L.dir > 0 ? L.y1 : L.y0, v = (L.gateN ? 3 : 1.5) * dt; L.moved = true;
    if (L.cargo && (L.cargo.dead || robots.indexOf(L.cargo) < 0)) L.cargo = null;
    if (Math.abs(tgt - L.y) <= v && L.cargo) {   // приехал с роботом: тот сходит на соседнюю опору
      const r = L.cargo, ax = Math.abs(FACE_N[L.f][0]) > 0.5 ? [0, 1] : [1, 0]; for (const sg of [1, -1]) { const nx = L.x + ax[0] * sg, nz = L.z + ax[1] * sg; if (L.cargo && robotFloor(nx, nz, Math.round(tgt))) { r.lift = null; r.baseY = r.y = Math.round(tgt); r.tx = nx; r.tz = nz; r.hx = ax[0] * sg; r.hz = ax[1] * sg; r.mode = 'walk'; r.t = 6; L.cargo = null; } } }
    if (Math.abs(tgt - L.y) <= v) { L.y = tgt; L.dir = -L.dir; L.wait = (L.exit || L.gateN) && tgt === L.y1 ? 5 : 2.4; sfx('Jump_4_landfall', 0.25, 1.6); }
    else L.y += Math.sign(tgt - L.y) * v;
    if (L.snapAt !== null && L.snapAt !== undefined && aboard && (L.y - L.snapAt) * L.dir >= 0 && L.y > L.y0 + 1) { L.broken = true; L.vy = 0; L.breakY = L.y; sfx('RobotHit5', 0.8, 0.5); sfx('RobotHit3', 0.6, 2.2); showCombo('Цепь лопнула!', true); game.shake = Math.max(game.shake, 0.1);
      burst(L.x, L.y + 2.2, L.z, { n: 10, cols: ['#a09090', '#1c1a12', '#fff4e1'], sp: [1, 3], life: 0.5 }); }
  }
  for (const L of lifts) if (L.chain) L.chain.y0 = (L.broken ? L.breakY : L.y) + 1.3;
}
function drawLift(L, b) {
  const N = FACE_N[L.f], fc0 = N[0] * b.n[0] + N[1] * b.n[1], fc = 1, im = img.lift; if (!im || !im.width) return;   // люлька объёмная: с любой стороны видна целиком
  const going = !L.broken && !(L.wait > 0), sw = going ? Math.sin(game.time * 2.6 + L.x) * 0.035 + Math.sin(game.time * 6.1 + L.z) * 0.012 : 0;   // в пути люльку пошатывает
  const ap = S / APX, px = Math.round(W / 2 + (relU(L, b) + sw) * S), fy = H / 2 - (L.y - cam.y) * S, w = 46 * ap * fc, h = 56 * ap, top = Math.round(fy + 5 * ap - h);
  // цепь, на которой висит люлька: звенья стоят на месте, а рисунок по ним бежит — так кажется, что цепь движется
  const g = Math.max(1, Math.round(ap)), yA = Math.round(H / 2 - (L.y1 + 3.4 - cam.y) * S), PT = ['.L.', 'L.L', '.L.', '.D.', '.D.'], ph = Math.floor(L.y * APX);
  const pxA = Math.round(W / 2 + relU(L, b) * S), cEnd = L.broken ? Math.round(H / 2 - (L.breakY + 1.3 - cam.y) * S) : top;
  if (cEnd > yA) { if (!chainPat || chainPatG !== g) { const pc = document.createElement('canvas'); pc.width = 3 * g; pc.height = 5 * g; const x = pc.getContext('2d'); PT.forEach((row, k) => { for (let i = 0; i < 3; i++) { const ch = row[i]; if (ch === '.') continue; x.fillStyle = ch === 'D' ? '#6f6862' : '#a09090'; x.fillRect(i * g, k * g, g, g); } }); chainPat = ctx.createPattern(pc, 'repeat'); chainPatG = g; }   // цепь — один узор, а не сотни квадратиков
    const m = ((ph % 5) + 5) % 5; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(pxA, yA); ctx.transform(1, 0, (px - pxA) / Math.max(1, cEnd - yA), 1, 0, 0); ctx.translate(-Math.round(1.5 * g), -m * g); ctx.fillStyle = chainPat; ctx.fillRect(0, m * g, 3 * g, cEnd - yA); ctx.restore(); }
  ctx.fillStyle = '#6f6862'; ctx.fillRect(pxA - Math.round(4 * g * fc), yA - 3 * g, Math.round(8 * g * fc), 3 * g); ctx.fillStyle = '#a09090'; ctx.fillRect(pxA - Math.round(3 * g * fc), yA - 2 * g, Math.round(6 * g * fc), g);   // кронштейн наверху
  { const bw = Math.round(w * 0.8), by = top + Math.round(h), sh = Math.round(S * 0.14); ctx.fillStyle = 'rgba(8,6,16,0.24)'; ctx.fillRect(Math.round(px - bw / 2), by, bw, sh); ctx.fillStyle = 'rgba(8,6,16,0.11)'; ctx.fillRect(Math.round(px - bw / 2), by + sh, bw, Math.round(S * 0.09));   // тень под днищем люльки
    const gy = shadowFloor(L, 0); if (gy !== null && gy < L.y - 0.3) { const k = 1 - (L.y - gy) / 7; if (k > 0.12) drawShadow(b, L, 0, gy, 1.1, k); } }                // и пятно на полу под ней
  ctx.imageSmoothingEnabled = false; ctx.drawImage(im, (L.v % 4) * 46, 0, 46, 56, Math.round(px - w / 2), top, w, h); ctx.imageSmoothingEnabled = true;
  if (L.gateN && GATE_COL[L.gateN]) { const C = GATE_COL[L.gateN], g2 = Math.max(2, Math.round(S * 0.03)), bw = Math.round(w * 0.86), bx = Math.round(px - bw / 2);   // метка цвета ключа: полоса по крыше и по порогу, значок ключа на борту
const yb = Math.round(top + h * 0.47); ctx.fillStyle = C[0]; ctx.fillRect(bx, yb, bw, g2 * 2); ctx.fillStyle = C[1]; ctx.fillRect(bx, yb, bw, g2); ctx.fillStyle = C[2]; ctx.fillRect(bx, yb, bw, Math.max(1, Math.round(g2 / 3)));
    ctx.fillStyle = C[1]; ctx.fillRect(bx, Math.round(top + h - g2 * 2), bw, g2); keyMark(px, Math.round(top + h * 0.6), g2, C); }
}
function spawnProps() {
  anchorLamps(); groundLadders();
  for (const q of LEVEL.lamps) { q.gone = false; q.snapNow = 0; } hero.ladT0 = null;
  lifts = (LEVEL.lifts || []).map(v => ({ x: v.x, z: v.z, f: v.f, y0: v.y0, y1: v.y1, y: v.y0, dir: 1, wait: rnd(0.5, 2.5), v: v.v, dead: true, lift: true, safe: !!v.safe, exit: !!v.exit }));
  movers = (LEVEL.movers || []).map(m => { const M = { f: m.f, y: m.y, t0: m.t0, t1: m.t1, t: m.t0 + (m.t1 - m.t0) * m.ph, dir: m.ph < 0.5 ? 1 : -1, wait: 0, dead: true, lift: true }; const p = moverPos(M); M.x = p.x; M.z = p.z; return M; });
  game.gateLift = 0; wetSpots = []; dynClimbs = []; spawnGears(); spawnPistons(); spawnBoss(); spawnTurrets(); spawnTutor();                       // цепи лифтов и провода ламп: по ним лезут как по трубе
  for (const L of lifts) { L.chain = { x: L.x, z: L.z, y0: L.y + 1.3, y1: L.y1 + 3.3, pipe: true, chain: L }; dynClimbs.push(L.chain); }
  for (const q of LEVEL.lamps) dynClimbs.push({ x: q.x, z: q.z, y0: q.y - q.len - 0.55, y1: q.y - 0.05, pipe: true, lamp: q });
  vents = LEVEL.vents.map(v => ({ x: v.x, y: v.y, z: v.z, power: v.power, t: rnd(0, 0.3), cool: 0 }));
  spawnTraps();
  bits = LEVEL.bits.map(v => ({ x: v.x, y: v.y, z: v.z, got: false, ph: rnd(0, 6), born: 9 }));
  crates = LEVEL.crates.map(v => { const c = { x: v.x, y: v.y, z: v.z, hp: 2, broken: false, shake: 0, key: !!v.key, gate: v.gate || 0 }; if (v.loot) c.loot = v.loot; if (v.pv !== undefined) c.pv = v.pv; if (v.tv !== undefined) c.tv = v.tv; if (v.hyd !== undefined) { c.hyd = v.hyd; c.hx = v.hx; c.hz = v.hz; } c.src = v; return c; }); cogs = []; spawnCams();   /* v301: tv — экран */   /* v271: pv — вид ящика, задан в редакторе */   /* v253: loot — что выпадает, задано в редакторе */
  crates = crates.filter(c => { const x = Math.round(c.x), z = Math.round(c.z); { const q = cubes.get(ckey(x, Math.round(c.y) - 1, z)); if (q) return !(q.br || q.br2) || !!c.key; }   // ящик стоит на кубе под собой; висит в воздухе — опускаем на ближайшую опору ниже, нет её — убираем
    for (let y = Math.round(c.y) - 1; y >= Math.round(c.y) - 8; y--) if (hasCube(x, y, z)) { c.y = y + 1; return !c.key || true; } return !!c.key; });
  crates = crates.filter(c => { if (c.key || c.y > 2500 || c.tv !== undefined || c.hyd !== undefined) return true;   /* v301: экран стоит и на узком уступе */ const x = Math.round(c.x), y = Math.round(c.y), z = Math.round(c.z); let open = 0;   /* ящик у края уступа — убираем: с краю он торчит в пустоту и выглядит странно */
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!hasCube(x + dx, y - 1, z + dz) && !hasCube(x + dx, y, z + dz)) open++; return open <= 1; });
  fires = (LEVEL.fires || []).map(q => ({ x: q.x, y: q.y + 0.08, z: q.z, life: 1e9, smk: 0, delay: 0, trap: true, fl: [{ dx: 0, dy: 0, sc: 1, flip: Math.random() < 0.5, ph: rnd(0, 9), sp: 1, hot: false }] })); booms = []; hero.ladder = null; game.gSide = -1; game.gFlip = 1; hero.burn = 0; hero.burnTick = 0; game.firstFire = false;
  fixPipeEnds();
  waters = LEVEL.pipes.filter(q => q.out).map((q, i) => { const o = q.pts[q.pts.length - 1], cx = Math.round(o[0]), cz = Math.round(o[2]); let bottom = Math.max(-2, o[1] - 14);
    for (let yy = Math.floor(o[1]) - 1; yy >= 0; yy--) if (hasCube(cx, yy, cz)) { bottom = yy + 1; break; }
    return { x: o[0], y: o[1] - 0.15, z: o[2], bottom, ph: q.ph !== undefined ? q.ph : i * 4.3, head: o[1] - 0.15, tail: o[1] - 0.15, spl: 0 }; });
  for (const c of sky) if (c.front && c.rain) waters.push({ x: 0, y: c.y, z: 0, bottom: c.y - 12, ph: 0, head: c.y, tail: c.y, spl: 0, cloud: c });
  doors = LEVEL.doors.map(v => Object.assign({}, v)); keyItems = LEVEL.keys.map(v => ({ x: v.x, y: v.y, z: v.z, got: false, ph: rnd(0, 6), red: !!v.red, gate: v.gate || 0, niche: !!v.niche, hid: !!v.crate })); hero.keys = 0; hero.tkey = false; hero.redKey = false; hero.gk = {}; hero.inDoor = 0;
  puddles = (LEVEL.puddles || []).map(v => ({ x: v.x, y: v.y, z: v.z, f: v.f, in: false, t: 0 }));
  knifeItem = LEVEL.knife ? { x: LEVEL.knife.x, y: LEVEL.knife.y, z: LEVEL.knife.z, got: false, ph: 0 } : null; hero.knife = false; promItem = LEVEL.prom ? { x: LEVEL.prom.x, y: LEVEL.prom.y, z: LEVEL.prom.z, got: false, ph: 1.3 } : null; hero.prom = false;
  spawnItems(); spawnArms(); armWInit();   /* v280: руки как ноги (13i_armworld.js) */
  buildSkins(); buildDecor(); buildKit2(); hero.wStats = {}; hero.fork = false; forkPulls = []; forkItem = LEVEL.forkAt ? { x: LEVEL.forkAt.x, y: LEVEL.forkAt.y, z: LEVEL.forkAt.z, got: false, ph: 0.7, stat: rollStat() } : null; if (knifeItem) knifeItem.stat = rollStat(); if (promItem) promItem.stat = rollStat();
  hearts = (LEVEL.hearts || []).map(v => ({ x: v.x, y: v.y, z: v.z, got: false, ph: rnd(0, 6), born: 9 })); hero.hideN = false;
  bitsGot = 0; bitsTotal = bits.length + crates.filter(c => !c.loot && c.tv === undefined && c.hyd === undefined).length; rings = LEVEL.rings.map(v => ({ x: v.x, y: v.y, z: v.z, t: 0 })); userSpawn();   /* v251: свои предметы с поведением */
}
// предмет закрыт кубом, который ближе к камере
// v266 (Алексей 19.10: «с краю смотришь на трубу, механизм, воду — а он не работает, оказывается далеко; правило: видно — значит работает,
// слишком далеко — не видно»). Трубы, лестницы, лампы, пар, вода, кольца на боковой стороне титана (у края силуэта) работают, только если
// они ближе 7 к нам по глубине — как и раньше в физике; дальше — теперь и не рисуются (у границы плавно гаснут). Внутри силуэта (|u| < 7.3) — как было.
const REACH_D = 7;
function reachA(x, z, b, thr) { const B = b || view, u = x * B.r[0] + z * B.r[1], d = x * B.n[0] + z * B.n[1], t = thr === undefined ? REACH_D : thr;
  if (Math.abs(u) < 7.3) return 1; return Math.max(0, Math.min(1, (d - t + 0.5) / 0.45)); }
const farOff = o => reachA(o.x, o.z) < 0.5;
function withA(a, fn) { if (a <= 0) return; if (a >= 1) { fn(); return; } const g = ctx.globalAlpha; ctx.globalAlpha = g * a; fn(); ctx.globalAlpha = g; }
const propHidden = o => { if (o && o.armP) return false; const a = cellAt(Math.round(toU(o)), Math.floor(o.y + 0.2)); return !!a && a[0].dep > toD(o) + DEPTH_TOL; };
function hitCrate(c, dir) {
  if (c.hyd !== undefined) { hydSpray(c, dir); return; }   /* v307: гидрант не ломается — бьёт струёй */
  if (c.broken) { if (c.tv !== undefined && !c.gone && game.time - (c.brokeT || 0) > 0.8) tvScrap(c, dir); return; }   /* v302: разбитый экран через секунду добивается — без следа */
  c.hp--; c.shake = 0.18; sfx('RobotHit3', 0.4, 0.7);
  burst(c.x, c.y + 0.25, c.z, { n: 6, cols: c.tv !== undefined ? ['#ffffff', '#ffd052', '#7fd8ff'] : WOOD, dir, sp: [1, 3], life: 0.5 });
  if (c.hp > 0) return;
  c.broken = true; if (c.tv !== undefined) { tvBreak(c); return; }   // v301: экран
  sfx('RobotHit5', 0.5, 0.6);
  burst(c.x, c.y + 0.2, c.z, { n: 16, cols: WOOD, sp: [1, 3.6], life: 0.7, size: 2 });
  const it = c.src && c.src.item; if (it) { crateItem(c, it); return; }   // v286: в ящике лежал предмет (нож, руки Прометея, вилка, сапоги)
  if (!c.loot) bits.push({ x: c.x, y: c.y + 0.4, z: c.z, got: false, ph: 0, born: 0 });   // в ящике лежал осколок
  const cu = toU(c), nearH = hero.state !== 'dead' && !hero.inDoor && Math.abs(toD(hero) - toD(c)) <= 1.1 && Math.abs(toU(hero) - cu) < 1.4 && Math.abs(hero.y - c.y) < 1.3;
  if (c.key) { for (const o of keyItems) if (o.hid && Math.abs(o.x - c.x) + Math.abs(o.z - c.z) < 0.6 && Math.abs(o.y - c.y) < 1.2) { o.hid = false; burst(o.x, o.y, o.z, { n: 14, cols: [GATE_COL[o.gate || 1][1], GATE_COL[o.gate || 1][2], '#fff4e1'], sp: [0.8, 2.6], g: 3, life: 0.6 }); sfx('RUN_1_13', 0.4, 2.2); } return; }
  if (c.loot) { dropLoot(c, c.loot, nearH, cu); return; }   // v253: своё «что выпадает» из редактора
  if (Math.random() < 0.07) { hearts.push({ x: c.x, y: c.y + 0.5, z: c.z, got: false, ph: 0, born: 0 }); sfx('RUN_1_13', 0.4, 2.0); return; }   // редкая удача: сердечко
  const v = Math.random();
  if (v < 0.1) crateBoom(c, nearH, cu);   // ящик с сюрпризом: взрыв
  else if (v < 0.8) crateWater(c, nearH);   // в ящике была вода: расплёскивается, сбивает пламя, остужает взбешённых
}
function crateItem(c, kind) {
  const p = { x: c.x, y: c.y + 0.45, z: c.z, got: false, ph: 0 }; burst(c.x, c.y + 0.4, c.z, { n: 16, cols: ['#fff4e1', '#ffd27a', '#ffce46'], sp: [0.8, 2.6], up: 1.4, life: 0.6 }); sfx('RUN_1_13', 0.5, 1.6);
  if (kind === 'knife') { p.stat = rollStat(); knifeItem = p; } else if (kind === 'prom') { p.ph = 1.3; p.stat = rollStat(); promItem = p; } else if (kind === 'fork') { p.ph = 0.7; p.stat = rollStat(); forkItem = p; }
  else itemsOnMap.push(Object.assign(p, { kind, ph: rnd(0, 6) }));
  showCombo('В ящике: ' + (ITEM_DEFS[kind] ? ITEM_DEFS[kind].name : kind) + '!', true);
}
function crateBoom(c, nearH, cu) {
    booms.push({ x: c.x, y: c.y + 0.35, z: c.z, t: 0 }); burst(c.x, c.y + 0.3, c.z, { n: 24, cols: ['#ffce46', '#ff7014', '#fff3c4', '#c0392b', '#3a2f36'], sp: [1.5, 5.5], life: 0.8, size: 2 }); game.shake = Math.max(game.shake, 0.2); sfx('RobotDeathB', 0.8, 1.0);
    if (nearH) hurtHero(cu, 'ящик взорвался'); for (const o of robots) if (!o.dead && Math.hypot(o.x - c.x, o.z - c.z) < 1.5 && Math.abs(o.y - c.y) < 1.2) robotHurtRobot(o, 25, Math.sign(toU(o) - cu) || 1);
}
function crateWater(c, nearH) {
    const WC = ['#bfeaf2', '#5fc3dc', '#eefcff', '#3a9fc0']; burst(c.x, c.y + 0.25, c.z, { n: 34, cols: WC, sp: [1, 4.2], up: 2.6, g: 9, life: 0.8, size: 2 }); burst(c.x, c.y + 0.1, c.z, { n: 16, cols: WC, sp: [1.5, 3.5], g: 9, life: 0.5 }); sfx('RUN_1_13', 0.55, 0.75);
    if (nearH) hero.wetDrip = 3; if (nearH && hero.burn > 0) { hero.burn = 0; showCombo('Пламя сбито', true); } for (const o of robots) if (!o.dead && Math.hypot(o.x - c.x, o.z - c.z) < 1.4 && Math.abs(o.y - c.y) < 1.2) { o.wet = 2.5; if (o.burn > 0) o.burn = 0; if (o.rage > 0 && !o.hunter) coolRobot(o); }
    for (const f of fires) if (!f.trap && Math.hypot(f.x - c.x, f.z - c.z) < 1.3 && Math.abs(f.y - c.y) < 1.2) f.life = Math.min(f.life, 0.2);
    wetSpots.push({ x: c.x, y: c.y, z: c.z, t: 6 });
}
// v253: что выпадает из разбитого (ящик, свой предмет) — независимые шансы в процентах: осколок, сердечко, взрыв, вода.
// Задаётся в редакторе: у ящика — в «Выбрано», у своего предмета — в карточке. Без настройки ящик как раньше.
const LOOT_KINDS = ['shard', 'heart', 'boom', 'water'];
function dropLoot(c, L, nearH, cu) {
  const ch = k => Math.random() * 100 < (L[k] || 0);
  if (ch('shard')) { bits.push({ x: c.x, y: c.y + 0.4, z: c.z, got: false, ph: 0, born: 0 }); bitsTotal++; }
  if (ch('heart')) { hearts.push({ x: c.x, y: c.y + 0.5, z: c.z, got: false, ph: 0, born: 0 }); sfx('RUN_1_13', 0.4, 2.0); }
  if (ch('boom')) crateBoom(c, nearH, cu);
  if (ch('water')) crateWater(c, nearH);
}
// Огонь: иногда остаётся гореть над обломками робота. Обжигает героя и поджигает его; сбить пламя можно под струёй воды из трубы.
let fires = [], waters = [];
const mkFlames = n => { const a = []; for (let i = 0; i < n; i++) a.push({ dx: rnd(-0.16, 0.16) * (n > 1 ? 1 : 0), dy: rnd(0, 0.08), sc: rnd(0.75, 1.25), flip: Math.random() < 0.5, ph: rnd(0, 9), sp: rnd(0.8, 1.3), hot: Math.random() < 0.4 }); return a; };
const PROM_FL = [{ dx: 0, dy: 0, sc: 0.3, flip: false, ph: 2, sp: 1.4, hot: true }], PROM_FL2 = [{ dx: 0, dy: 0, sc: 0.52, flip: false, ph: 1, sp: 1.8, hot: true }];
const HERO_FL = [{ dx: 0, dy: 0, sc: 0.85, flip: false, ph: 0, sp: 1, hot: false }];
const HERO_FRONT = [{ dx: -0.1, dy: 0.0, sc: 0.32, flip: true, ph: 2, sp: 1.3 }, { dx: 0.09, dy: 0.2, sc: 0.26, flip: false, ph: 5, sp: 1.1 }];
function drawBurner(u, y) {             // газовая горелка: труба выходит из-под уступа, колено и сопло, из которого бьёт пламя
  const g = Math.max(2, Math.round(S * 0.03)), px = Math.round((W / 2 + u * S) / g) * g, py = Math.round(H / 2 - (y - 0.08 - cam.y) * S);
  ctx.fillStyle = '#3a3237'; ctx.fillRect(px - 8 * g, py - 3 * g, 3 * g, Math.round(S * 0.55)); ctx.fillRect(px - 8 * g, py - 3 * g, 7 * g, 3 * g);
  ctx.fillStyle = '#5a4f55'; ctx.fillRect(px - 8 * g, py - 3 * g, g, Math.round(S * 0.55)); ctx.fillRect(px - 8 * g, py - 3 * g, 7 * g, g);
  ctx.fillStyle = '#231d21'; ctx.fillRect(px - 3 * g, py - 4 * g, 6 * g, 4 * g); ctx.fillStyle = '#5a4f55'; ctx.fillRect(px - 3 * g, py - 4 * g, 6 * g, g); ctx.fillStyle = '#3a3237'; ctx.fillRect(px - 2 * g, py - 6 * g, 4 * g, 2 * g);
  ctx.fillStyle = '#ff9a2e'; ctx.fillRect(px - g, py - 6 * g, 2 * g, g);
}
let fireGlowC = null;
function drawFire(fl, u, y, k, noGlow) {
  const px = W / 2 + u * S, py = H / 2 - (y + 0.3 - cam.y) * S, fl2 = 0.8 + 0.2 * Math.sin(game.time * 13) * Math.sin(game.time * 7.3);
  // тёплое свечение вокруг: пламя освещает то, что рядом
  if (!noGlow) {
  if (!fireGlowC) { fireGlowC = document.createElement('canvas'); fireGlowC.width = fireGlowC.height = 128; const x = fireGlowC.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);   // свечение огня — одна заготовка на всех, а не новый градиент на каждый огонь каждый кадр
    gr.addColorStop(0, 'rgba(255,150,40,1)'); gr.addColorStop(0.45, 'rgba(255,110,20,0.333)'); gr.addColorStop(1, 'rgba(255,90,10,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }
  const R = S * 1.1 * k, ga = ctx.globalAlpha; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, 0.3 * fl2 * k); ctx.imageSmoothingEnabled = true; ctx.drawImage(fireGlowC, px - R, py - R, R * 2, R * 2); ctx.globalAlpha = ga; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.imageSmoothingEnabled = false;
  for (const q of fl) {                 // сам язык чуть «дышит»: тянется вверх и оседает
    const fr = Math.floor(game.time * 6.5 * q.sp + q.ph) % 9, sc = q.sc * (0.4 + 0.6 * k), st = 1 + 0.07 * Math.sin(game.time * 9 + q.ph);
    squash(u + q.dx, y + q.dy, sc * (2 - st), sc * st, 0, () => drawSprite('Fire_' + fr, u + q.dx, y + q.dy, q.flip));
  }
  ctx.imageSmoothingEnabled = true;
}
function flecks(x, y, z, dt, rate) {    // спереди от пламени: одноцветные язычки, расходятся лучами от огня, уменьшаются и гаснут
  if (Math.random() < dt * rate) { const an = rnd(-1.25, 1.25), sp = rnd(0.5, 1.15), ux = Math.sin(an), uy = Math.cos(an);
    parts.push({ x: x + ux * 0.1 * view.r[0], y: y + 0.22 + uy * 0.1, z: z + ux * 0.1 * view.r[1], vx: ux * sp * view.r[0], vz: ux * sp * view.r[1], vy: uy * sp + 0.25, g: -0.5, drag: 1.6, t: 0, life: rnd(0.3, 0.6), size: 1, tongue: 4 + Math.floor(rnd(0, 4)), col: pick(['#ff7014', '#ff7014', '#ffce46', '#e8501a']) }); }
}
function embers(x, y, z, dt, rate) {    // искры: взлетают, желтеют-краснеют и гаснут
  if (Math.random() < dt * rate) parts.push({ x: x + rnd(-0.14, 0.14) * view.r[0], y: y + rnd(0.2, 0.6), z: z + rnd(-0.14, 0.14) * view.r[1], vx: rnd(-0.3, 0.3) * view.r[0], vz: rnd(-0.3, 0.3) * view.r[1], vy: rnd(0.9, 2.1), g: -0.6, drag: 0.9, t: 0, life: rnd(0.5, 1.2), size: 1, col: pick(['#ffce46', '#ff7014', '#ff7014', '#c0392b']), a: 1 });
  if (Math.random() < dt * rate * 0.45) parts.push({ x: x + rnd(-0.1, 0.1) * view.r[0], y: y + rnd(0.6, 0.9), z: z + rnd(-0.1, 0.1) * view.r[1], vx: 0, vz: 0, vy: rnd(0.4, 0.8), g: 0, drag: 0.4, t: 0, life: rnd(0.8, 1.5), size: 2, col: '#3a2f36', a: 0.5 });
}
// Маленький пиксельный взрыв: вспышка-шипы, светлый шар, клубы светлого и тёмного дыма, потом всё рассыпается на точки
let booms = [];
function drawBoom(q, b) {
  const g = Math.max(1, Math.round(S * 0.02)), px = Math.round(W / 2 + relU(q, b) * S), py = Math.round(H / 2 - (q.y - cam.y) * S), t = q.t;
  const disc = (cx, cy, r, col) => { ctx.fillStyle = col; for (let yy = -r; yy <= r; yy++) { const hw2 = Math.floor(Math.sqrt(r * r - yy * yy + r * 0.6)); ctx.fillRect(px + (cx - hw2) * g, py + (cy + yy) * g, (hw2 * 2 + 1) * g, g); } };
  if (t < 0.07) { ctx.fillStyle = '#ffce46'; for (const d of [[-1, 0], [1, 0], [0, -1], [-0.7, -0.7], [0.7, -0.7]]) for (let i = 2; i < 9; i++) ctx.fillRect(px + Math.round(d[0] * i) * g, py + Math.round(d[1] * i) * g, g, g); disc(0, 0, 3, '#fff4e1'); }
  else if (t < 0.2) { const k = (t - 0.07) / 0.13, r = Math.round(4 + 9 * k); disc(0, -2, r + 2, '#ff7014'); disc(0, -2, r, '#fff4e1'); ctx.fillStyle = '#ffce46'; for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; ctx.fillRect(px + Math.round(Math.cos(a) * (r + 5)) * g, py - 2 * g - Math.round(Math.abs(Math.sin(a)) * (r + 5)) * g, g * 2, g * 2); } }
  else if (t < 0.42) { const k = (t - 0.2) / 0.22, up = Math.round(6 * k);
    disc(-9, 2 - up, 6, '#5a3d52'); disc(9, 1 - up, 7, '#5a3d52'); disc(2, -14 - up, 6, '#6f5560');
    disc(-5, -3 - up, 8, '#e9e2d0'); disc(6, -5 - up, 7, '#fff4e1'); disc(0, -11 - up, 6, '#fff4e1'); disc(-1, -1 - up, Math.round(5 * (1 - k)), '#ffce46'); }
  else { const k = (t - 0.42) / 0.2; for (let i = 0; i < 16; i++) { const a = i * 2.4, rr = 8 + (i * 5) % 9 + 8 * k, sz = k < 0.5 && i % 3 === 0 ? 2 : 1; ctx.fillStyle = i % 3 === 0 ? '#5a3d52' : i % 3 === 1 ? '#e9e2d0' : '#b3a58c'; if ((i * 7) % 10 / 10 > k * 0.9) ctx.fillRect(px + Math.round(Math.cos(a) * rr) * g, py - Math.round(8 + Math.sin(a) * rr * 0.8 + 10 * k) * g, g * sz, g * sz); } }
}

// концы прямых труб прячем: конец, что уходит в стену посреди пустой стены, тянем вдоль трубы до ближайшего куба,
// который стоит перед трубой (уступ, выступ, стена комнаты), — его грань закрывает обрез трубы
function lampHeld(L) {   // лампа держится: над крюком куб (потолок, низ уступа) или прямо за ней стена
  if (L.y > 2500) return true; const X = Math.round(L.x), Z = Math.round(L.z), Y = Math.floor(L.y + 0.01), N = [[0, 1], [1, 0], [0, -1], [-1, 0]][(L.f || 0) % 4];
  if (hasCube(X, Y, Z)) return true; for (const k of [1, 2]) if (hasCube(Math.round(L.x - N[0] * k * 0.6), Y, Math.round(L.z - N[1] * k * 0.6)) || hasCube(Math.round(L.x - N[0] * k * 0.6), Y - 1, Math.round(L.z - N[1] * k * 0.6))) return true; return false; }
function anchorLamps() {   // лампа в воздухе: подвешиваем к ближайшему кубу над ней (шнур чуть длиннее), нет такого — убираем
  LEVEL.lampsDropped = 0; LEVEL.lamps = LEVEL.lamps.filter(L => { if (L.arm || lampHeld(L)) return true;   /* v278: лампа на руке висит на руке */ const X = Math.round(L.x), Z = Math.round(L.z);
    for (let y = Math.floor(L.y) + 1; y <= Math.floor(L.y) + 2; y++) if (hasCube(X, y, Z)) { const lo = L.y - L.len; L.y = y; L.len = Math.min(2.4, L.y - lo); return true; }
    LEVEL.lampsDropped++; return false; });
  { const PY = LEVEL.pelY || 32, tops = [...cubes.values()].filter(c => c.top && c.y >= 3 && c.y < PY && !hasCube(c.x, c.y + 1, c.z));   // v230: и после перевески — лампа на ноге только там, куда можно залезть
    LEVEL.lamps = LEVEL.lamps.filter(L => L.long || L.pin || L.arm || L.y > 2500 || L.y >= PY - 1 || tops.some(c => Math.abs(c.x - L.x) <= 1.6 && Math.abs(c.z - L.z) <= 1.6 && c.y + 1 <= L.y - (L.len || 1) + 0.6 && c.y + 1 >= L.y - (L.len || 1) - 3.2)); } }
function groundLadders() {   // низ лестницы висит в воздухе (опору под ней убрали позже) — дотягиваем лестницу до пола ниже
  for (const l of LEVEL.ladders) { if (l.y0 > 2500 || l.hatch || l.pin) continue;   /* v253: поставленную руками не трогаем */ const r = l.r || 8, f = l.f % 4, c = [[l.t, r], [r, -l.t], [-l.t, -r], [-r, l.t]][f], N = [[0, 1], [1, 0], [0, -1], [-1, 0]][f];
    const at = (dd, y) => [-1, 0, 1].some(dt => { const R2 = [[dt, 0], [0, -dt], [-dt, 0], [0, dt]][f]; return hasCube(Math.round(c[0] + R2[0] + N[0] * dd), y, Math.round(c[1] + R2[1] + N[1] * dd)); });
    let ok = false; for (let y = Math.floor(l.y0 - 1.6); y <= Math.floor(l.y0 + 0.9) - 1 && !ok; y++) if (at(0, y) || at(-1, y)) ok = true; if (ok) continue;
    for (let y = Math.floor(l.y0) - 2; y >= Math.floor(l.y0) - 12; y--) if (hasCube(c[0], y, c[1])) {
      for (const q of LEVEL.climbs || []) if (!q.pipe && Math.abs(q.x - c[0]) < 0.05 && Math.abs(q.z - c[1]) < 0.05 && Math.abs(q.y0 - l.y0) < 0.05) q.y0 = y + 1;   /* v268: лаз тянется вместе с лестницей — иначе низ нарисован, но не хватается (Алексей 19.10) */
      l.y0 = y + 1; break; } } }
function fixPipeEnds() {   // только рисунок (q.vpts): по трубам лазают, из них собраны мостки — сами точки трубы не трогаем
  if (LEVEL.pipesFixed === LEVEL.seed) return; LEVEL.pipesFixed = LEVEL.seed; LEVEL.pipeHid = 0; LEVEL.pipeOpen = 0;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = v => Math.hypot(v[0], v[1], v[2]);
  for (const q of LEVEL.pipes) { const P = q.pts.map(p => p.slice()); q.vpts = P; if (P.length < 3) continue;
    for (const [w, e, nx] of [[0, 1, 2], [P.length - 1, P.length - 2, P.length - 3]]) {
      const turn = sub(P[e], P[w]), tl = len(turn); if (tl < 0.2 || tl > 1.2 || Math.abs(turn[1]) > 0.01) continue;   // конец уходит в стену поперёк неё
      const run = sub(P[e], P[nx]), rl = len(run); if (rl < 0.5) continue; const d = [run[0] / rl, run[1] / rl, run[2] / rl], n = [turn[0] / tl, 0, turn[2] / tl]; if (Math.abs(d[1]) > 0.01) continue;   /* вертикальные трубы не удлиняем: по ним лазают */
      const covered = k => { const x = P[e][0] + d[0] * k - n[0] * 0.05, y = P[e][1] + d[1] * k, z = P[e][2] + d[2] * k - n[2] * 0.05; return hasCube(Math.round(x), Math.floor(y), Math.round(z)); };   // куб в слое перед стеной — его грань закрывает трубу
      if (covered(0)) continue; let K = -1; for (let k = 0.5; k <= 12; k += 0.5) if (covered(k)) { K = k; break; }
      if (K < 0 && Math.abs(d[1]) < 0.01) { const wall = k => { const x = P[e][0] + d[0] * k + n[0] * 0.55, y = P[e][1], z = P[e][2] + d[2] * k + n[2] * 0.55; return hasCube(Math.round(x), Math.floor(y), Math.round(z)) || LEVEL.carved.has(ckey(Math.round(x), Math.floor(y), Math.round(z))); };
        for (let k = 0.5; k <= 16; k += 0.5) if (!wall(k)) { K = k - 0.5; break; } }   // укрыть нечем — труба уходит за угол ноги
      if (K < 0) { LEVEL.pipeOpen++; continue; }   /* (лазы ниже пересобираются по нарисованной трубе) */ LEVEL.pipeHid++; const ext = K + 0.3; for (const i of [w, e]) P[i] = [P[i][0] + d[0] * ext, P[i][1] + d[1] * ext, P[i][2] + d[2] * ext];
    } }
  { const ST = (LEVEL.shinTop || 0) + 0.6; for (const q of LEVEL.pipes) if (q.vpts && q.vpts.some(p => p[1] < ST && p[1] > 1.5 && Math.max(Math.abs(p[0]), Math.abs(p[2])) > 6.5 && Math.min(Math.abs(p[0]), Math.abs(p[2])) > 4.45)) q.vpts = q.pts.map(p => p.slice()); }   // у голени конец трубы не тянем в пустоту сбоку от неё
  // мостки по горизонтальным трубам — тоже по нарисованному
  LEVEL.beams = []; for (const q of LEVEL.pipes) { const P = q.vpts || q.pts; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], c2 = P[i + 1]; if (Math.abs(a[1] - c2[1]) < 0.01 && Math.hypot(a[0] - c2[0], a[2] - c2[2]) > 0.95 && Math.max(Math.abs(a[0]), Math.abs(a[2])) > 7.9 && Math.max(Math.abs(c2[0]), Math.abs(c2[2])) > 7.9) LEVEL.beams.push([a, c2]); } }
  // лазы по вертикальным кускам труб — ровно по тому, что нарисовано
  const old = LEVEL.climbs.filter(c => c.pipe && !c.wire && c.y0 < 2500); LEVEL.climbs = LEVEL.climbs.filter(c => !old.includes(c));
  for (const q of LEVEL.pipes) { const P = q.vpts || q.pts; if (q.pin && (q.deco || !q.n)) continue;   /* v254: труба из редактора — «Лезть» выключено → не лезть */
    if (q.pin) { for (let i = 0; i + 1 < P.length; i++) { const a = P[i], c2 = P[i + 1]; if (Math.abs(a[0] - c2[0]) < 1e-6 && Math.abs(a[2] - c2[2]) < 1e-6 && Math.abs(a[1] - c2[1]) > 0.9 && a[1] < 2500) LEVEL.climbs.push({ x: a[0], z: a[2], y0: Math.min(a[1], c2[1]), y1: Math.max(a[1], c2[1]) + 0.13, pipe: true, d: a[0] * q.n[0] + a[2] * q.n[1], pin: true }); } continue; }   /* у любой стены, лицом к нам (grabLadder) */
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], c2 = P[i + 1]; if (Math.abs(a[0] - c2[0]) < 1e-6 && Math.abs(a[2] - c2[2]) < 1e-6 && Math.abs(a[1] - c2[1]) > 0.9 && a[1] < 2500 && Math.max(Math.abs(a[0]), Math.abs(a[2])) > 7.5) {
    const m = old.find(c => Math.abs(c.x - a[0]) < 1e-6 && Math.abs(c.z - a[2]) < 1e-6); LEVEL.climbs.push({ x: a[0], z: a[2], y0: Math.min(a[1], c2[1]), y1: Math.max(a[1], c2[1]) + 0.13, pipe: true, d: m ? m.d : 8 }); } } }
}
function igniteHero() {
  if (view.rotating || hero.prom) return;   // с Руками Прометея огонь не берёт
  if (hero.dodgeT > 0) return;          // только что увернулся — не загорается
  if (hero.hideN) return;               // в нише огонь снаружи не достаёт
  if (hero.state === 'dead' || hero.inDoor || (hero.ride && hero.ride.r.taxi)) return;   // пока робот везёт к выходу, героя ничто не берёт
  if (!(hero.burn > 0)) { if (game.time - (hero.hurtAt === undefined ? -9 : hero.hurtAt) > 0.5) { PLOG.why = 'загорелся'; loseHP(); } hero.burnTick = 0; sfx('RobotHit2', 0.5, 1.4); showCombo('Горишь! Сверху льёт вода — беги под струю', true); miracleWater(); updateHUD(); if (hero.hp <= 0) { hero.burn = 0; killHero(); return; } }
  hero.burn = 6;
}
function miracleWater() {               // загорелся — рядом чудом пробивается струя воды: в двух-трёх шагах, на уровне героя
  waters = waters.filter(w => !(w.temp !== undefined && w.temp <= 0)); const hu = toU(hero), d = toD(hero), fy = Math.floor(hero.y + 0.1), camU = cam.x * view.r[0] + cam.z * view.r[1];
  // если в кадре уже льёт вода, до которой можно добежать (труба, облако или прежняя струя), новая не нужна
  if (waters.some(w => w.temp > 0 || (w.tail > w.head + 0.3 && !propHidden(w) && Math.abs(toU(w) - camU) < W / S / 2 - 0.5 && Math.abs(toU(w) - hu) < 8 && w.head < hero.y + 1.5 && w.tail > hero.y - 0.5 && Math.abs(w.bottom - hero.y) < 3.5))) return;
  const top = Math.ceil(cam.y + H / S / 2 + 1.5), f = hero.face;     // струя приходит из-за верхнего края кадра
  for (const pass of [0, 1]) for (const du of [f * 4, -f * 4, f * 5, -f * 5, f * 6, -f * 6, f * 3, -f * 3, f * 2, -f * 2, f, -f, 0]) { const U = Math.round(hu + du); if (Math.abs(U - camU) > W / S / 2 - 1) continue;
    let bottom = null; for (let Y = fy - 1; Y >= fy - 4; Y--) if (floorCube(U, Y, d, pass ? 'any' : 'same')) { bottom = Y + 1; break; } if (bottom === null) continue;
    let y1 = top; for (let Y = bottom; Y < top; Y++) if (overlapsDepth(U, Y + 0.05, 0.3, 0.9, d)) { y1 = Y; break; }   // сверху что-то нависает — вода течёт из-под него
    if (y1 < top && (pass === 0 || y1 < bottom + 1.6)) continue;
    const x = U * view.r[0] + d * view.n[0], z = U * view.r[1] + d * view.n[1];
    waters.push({ x, y: y1, z, bottom, ph: 0, head: y1, tail: y1, spl: 0, temp: 10 }); sfx('RUN_1_13', 0.5, 0.5); return; }
}
// v266 (Алексей: «вода льётся неестественно»): живая струя — у трубы раструб шире струи и водяной «язык» из него,
// дальше струя чуть тоньше (разгоняется), края темнее и чуть гуляют, внизу — пена с брызгами и разбегающаяся рябь
function stream(w, px, a, e, wdt, g, low) {
  if (e <= a) return; const T = game.time, mouth = !low && !w.cloud && w.temp === undefined && Math.abs(w.tail - w.y) < 0.02, landed = w.head <= w.bottom + 0.01, rr = n => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const thin = g, seg = g * 2, lipH = mouth ? g * 3 : 0;
  for (let y = a; y < e; y += seg) { const y1 = Math.min(e, y + seg), dy = y - a, top = dy < lipH;
    const nar = top ? -1 : Math.min(1, Math.floor((dy - lipH) / (S * 0.18)));   // у раструба шире, ниже — тоньше (разгон)
    const wl = wdt - nar * thin * 2, sh = dy < lipH + S * 0.3 ? 0 : Math.round(Math.sin((y - T * S * 5) / (S * 0.42)) * 0.55) * g;   // мягкая волна, бежит вниз
    const x0 = Math.round(px - wl / 2 + sh), x1 = x0 + Math.round(wl);
    ctx.fillStyle = 'rgba(95,195,220,0.56)'; ctx.fillRect(x0, y, x1 - x0, y1 - y);
    ctx.fillStyle = 'rgba(52,128,168,0.55)'; ctx.fillRect(x0, y, g, y1 - y); ctx.fillRect(x1 - g, y, g, y1 - y);   // края темнее — объём
    if (top && dy < g) { ctx.fillStyle = 'rgba(205,244,250,0.75)'; ctx.fillRect(x0 + g, y, x1 - x0 - g * 2, Math.min(g, y1 - y)); } }
  ctx.fillStyle = 'rgba(190,240,246,0.7)'; const inner = wdt - thin * 2 - g * 2;
  for (let j = 0; j * 2 * g + g < inner; j++) { const sx = Math.round(px - inner / 2 + g * j * 2), len = g * (5 + (j * 3) % 4), per = len * 3; for (let yy = a + ((T * S * (7 + j) + j * 37) % per) - per; yy < e; yy += per) { const p0 = Math.max(a + (mouth ? g * 2 : 0), Math.round(yy)), p1 = Math.min(e, Math.round(yy) + len); if (p1 > p0) { const sh = p0 - a < (mouth ? g * 3 : 0) + S * 0.3 ? 0 : Math.round(Math.sin((p0 - T * S * 5) / (S * 0.42)) * 0.55) * g; ctx.fillRect(sx + sh, p0, g, p1 - p0); } } }
  if (mouth) { const cw = wdt + g * 6, cx = Math.round(px - cw / 2), cy = a - g;   // раструб на конце трубы: шире струи, вода выходит из него
    ctx.fillStyle = '#26222a'; ctx.fillRect(cx, cy, cw, g * 3); ctx.fillStyle = '#5d5660'; ctx.fillRect(cx + g, cy, cw - g * 2, g); ctx.fillStyle = '#8d858c'; ctx.fillRect(cx + g, cy, Math.round(cw * 0.4), Math.max(1, Math.round(g / 2)));
    ctx.fillStyle = '#121014'; ctx.fillRect(cx + g, cy + g * 2, cw - g * 2, g); }
  if (landed) { const fw = wdt + g * 6, fy = e - g * 2;   // пена: плотная полоса, над ней скачут брызги, по полу — рябь
    ctx.fillStyle = 'rgba(120,205,226,0.35)'; const rw = wdt + g * (10 + 2 * Math.round(2 + 2 * Math.sin(T * 5))); ctx.fillRect(Math.round(px - rw / 2), e - g, rw, g);
    ctx.fillStyle = 'rgba(230,250,252,0.9)'; ctx.fillRect(Math.round(px - fw / 2), fy, fw, g * 2); ctx.fillRect(Math.round(px - wdt / 2), fy - g, wdt, g);
    for (let i = 0; i < 6; i++) { const t = (T * 2.6 + i * 0.37) % 1, side = i % 2 ? 1 : -1, dx = side * (wdt / 2 + g * (1 + i % 3 + t * 4)), dy = -g * (1 + 9 * t * (1 - t) * (2 + i % 2));
      ctx.fillStyle = i % 3 ? 'rgba(190,240,246,0.8)' : 'rgba(240,252,255,0.95)'; ctx.fillRect(Math.round(px + dx), Math.round(fy + dy), g, g); } }
}
function drawWater(w, b) {
  const g = Math.max(2, Math.round(S * 0.03)), wx = Math.round(W / 2 + relU(w, b) * S), y0 = Math.round(H / 2 - (w.tail - cam.y) * S), wd = g * 9;
  const isCut = w.cut !== null && w.cut !== undefined && w.cut > w.head, yEnd = Math.round(H / 2 - (w.head - cam.y) * S);
  const col = (px, a, e, wdt, seed) => {  // один столб воды со светлыми бегущими штрихами
    if (e <= a) return; ctx.fillStyle = 'rgba(95,195,220,0.56)'; ctx.fillRect(px - wdt / 2, a, wdt, e - a); ctx.fillStyle = 'rgba(190,240,246,0.7)';
    for (let j = 0; j * 2 * g + g < wdt - g; j++) { const sx = px - wdt / 2 + g * (1 + j * 2), len = g * (5 + ((j + seed) * 3) % 4), per = len * 3; for (let yy = a + ((game.time * S * (7 + j) + (j + seed) * 37) % per) - per; yy < e; yy += per) { const p0 = Math.max(a, Math.round(yy)), p1 = Math.min(e, Math.round(yy) + len); if (p1 > p0) ctx.fillRect(sx, p0, g, p1 - p0); } }
  };
  if (!isCut) { stream(w, wx, y0, yEnd, wd, g); return; }
  // герой под струёй: каждый столбик воды падает до его силуэта, а вокруг тела тянется водяная кайма — вода обтекает именно его
  const E = w.cutE || hero, isR = E !== hero, rs = isR ? robotSprite(E) : null, fl = isR ? rs.flip : hero.anim.flip, eu = isR ? relU(E, b) + (E.dead ? 0 : E.sh || 0) + rs.ox : relU(hero, b), ey = E.y, grounded = isR || hero.onGround;
  const nm = isR ? rs.name : hero.anim.sprite(), sp = SP[nm], tops = colTop(nm), cv = cut[nm]; if (!sp || !tops || !cv) { col(wx, y0, yEnd, wd, 0); return; }
  const sc = S / sp[7], hy = ey + 0.39 + (isR ? 0 : hero.hangPop + (yFix[nm] || 0)), hx = W / 2 + eu * S, left = hx - (fl ? cv.width - (sp[5] + 1) : sp[5] + 1) * sc, topPx = H / 2 - (hy - cam.y) * S - (sp[4] - sp[6] + 1) * sc;
  for (let x = wx - wd / 2, j = 0; x < wx + wd / 2 - 0.5; x += g, j++) {
    let ci = Math.floor((x + g / 2 - left) / sc); if (fl) ci = cv.width - 1 - ci;
    const t = ci >= 0 && ci < cv.width ? tops[ci] : -1, e = t >= 0 ? Math.min(yEnd, Math.round(topPx + t * sc)) : yEnd;
    if (e <= y0) continue; ctx.fillStyle = 'rgba(95,195,220,0.56)'; ctx.fillRect(Math.round(x), y0, g, e - y0);
    if (j % 2 === 1) { ctx.fillStyle = 'rgba(190,240,246,0.7)'; const len = g * (5 + (j * 3) % 4), per = len * 3; for (let yy = y0 + ((game.time * S * (7 + j) + j * 37) % per) - per; yy < e; yy += per) { const p0 = Math.max(y0, Math.round(yy)), p1 = Math.min(e, Math.round(yy) + len); if (p1 > p0) ctx.fillRect(Math.round(x), p0, g, p1 - p0); } }
  }
  // вода стекает по бокам героя: вдоль левого и правого края его силуэта, от того места, где его накрыла струя, до самых ног
  const edges = rowEdge(nm), yTopWet = Math.round(topPx);
  if (edges) for (let ry = 0, k = 0; ry < cv.height; ry += Math.max(1, g / sc), k++) {
    const e2 = edges[Math.floor(ry)]; if (!e2 || e2[0] < 0) continue;
    const sy = Math.round(topPx + ry * sc), xl = fl ? left + (cv.width - 1 - e2[1]) * sc : left + e2[0] * sc, xr = fl ? left + (cv.width - e2[0]) * sc : left + (e2[1] + 1) * sc;
    const lit = (k + Math.floor(game.time * 14)) % 5 === 0;
    ctx.fillStyle = lit ? 'rgba(230,250,252,0.95)' : 'rgba(95,195,220,0.66)'; ctx.fillRect(Math.round(xl) - g * 2, sy, g * 2, g + 1); ctx.fillRect(Math.round(xr), sy, g * 2, g + 1);
    if (!lit && k % 2) { ctx.fillStyle = 'rgba(190,240,246,0.7)'; ctx.fillRect(Math.round(xl) - g * 3, sy, g, g + 1); ctx.fillRect(Math.round(xr) + g * 2, sy, g, g + 1); }
  }
  const yFeet = Math.round(H / 2 - (ey - cam.y) * S);
  if (grounded) { ctx.fillStyle = 'rgba(230,250,252,0.9)'; const pw = Math.round(S * 0.24); ctx.fillRect(Math.round(hx) - pw - g * 2, yFeet - g, g * 4, g); ctx.fillRect(Math.round(hx) + pw - g * 2, yFeet - g, g * 4, g); }
  else if (yEnd > yFeet + g) stream(w, wx, yFeet + g, yEnd, wd, g, true);
}
function updateFireWater(dt) {
  const hu = toU(hero), alive = hero.state !== 'dead' && !hero.inDoor;
  { const wet = alive && !(hero.burstT > 0) && waters.some(w => w.tail > w.head + 0.02 && !propHidden(w) && (w.cloud || !farOff(w)) && Math.abs(toU(w) - hu) < 0.45 && hero.y + 0.5 > w.head && hero.y < w.tail);
    if (wet) hero.wetDrip = 3; const w0 = hero.wetT || 0; hero.wetT = wet ? w0 + dt : Math.max(0, w0 - dt * 0.6);            // под струёй дольше шести секунд — раздувает и разрывает
    if (wet && hero.wetT >= 6) { hero.burstT = 0.0001; hero.wetT = 0; hero.washT = 0; hero.ride = null; hero.hang = null; hero.ladder = null; hero.hook = null; hero.burn = 0; hero.anim.play('HeroBurst', { loop: false, restart: true, flip: hero.face < 0 }); sfx('RobotHit2', 0.5, 0.5); } }
  hero.luckT = (hero.luckT === undefined ? 20 : hero.luckT) - dt;
  if (hero.luckT <= 0) { hero.luckT = 20; if (alive && !(hero.burstT > 0) && !hero.inDoor && game.finishT <= 0 && Math.random() < 0.002 + ((typeof dcHas === 'function' && dcHas('burst')) ? 0.035 : 0)) { hero.burstT = 0.0001; hero.ride = null; hero.hang = null; hero.ladder = null; hero.hook = null; hero.anim.play('HeroBurst', { loop: false, restart: true, flip: hero.face < 0 }); showCombo('Не повезло…', true); } }   // просто не повезло
  if (hero.washT > 0 && onGateLift()) hero.washT = 0;
  if (hero.washT > 0) { hero.washT -= dt; if (alive && !hero.ladder && !hero.hang && !hero.ride) { const nu = hu + hero.washDir * (hero.washV || 5.5) * dt, dd = toD(hero); if (!overlapsDepth(nu, hero.y + 0.03, hero.hw, hero.h - 0.06, dd)) setUD(hero, nu, dd);
      if (Math.random() < dt * 30) parts.push({ x: hero.x, y: hero.y + rnd(0, 0.4), z: hero.z, vx: hero.washDir * rnd(0.5, 2) * view.r[0], vz: hero.washDir * rnd(0.5, 2) * view.r[1], vy: rnd(0.2, 1.4), g: 8, drag: 0, t: 0, life: rnd(0.25, 0.5), size: 1, col: pick(['#bfeaf2', '#5fc3dc', '#eefcff']) }); } }
  for (const w of waters) {
    if (w.cloud) { const bx = cloudBox(w.cloud); if (!bx) continue; const spc = cloudSpr[w.cloud.i], gu = Math.max(1, Math.round(S * 0.05)) / S;
      // струя выходит из самого толстого места облака и начинается внутри него — облако рисуется поверх и закрывает стык
      if (w.cloud.rcol === undefined) { let bc = Math.floor(spc.w / 2), bh = -1; for (let xx = Math.floor(spc.w * 0.25); xx < spc.w * 0.75; xx++) { let top = 0; while (top < spc.h && spc.bot[xx] >= 0 && top < spc.bot[xx]) top++; const th = spc.bot[xx]; if (th > bh) { bh = th; bc = xx; } } let bd = 1e9; for (let xx = Math.floor(spc.w * 0.3); xx < spc.w * 0.7; xx++) if (spc.bot[xx] >= bh - 1 && Math.abs(xx - spc.w / 2) < bd) { bd = Math.abs(xx - spc.w / 2); bc = xx; } w.cloud.rcol = bc; }
      const col = w.cloud.flip ? spc.w - 1 - w.cloud.rcol : w.cloud.rcol, u = bx.u + (col - spc.w / 2) * gu, far = Math.abs(u - (cam.x * view.r[0] + cam.z * view.r[1])) > W / S / 2 + 3;
      w.x = u * view.r[0] + 8.6 * view.n[0]; w.z = u * view.r[1] + 8.6 * view.n[1]; w.y = bx.y + (spc.h - Math.max(0, spc.bot[w.cloud.rcol])) * gu + 0.06; let bt = w.y - 14;
      for (const dl of [9, 8]) { const cx = Math.round(u * view.r[0] + dl * view.n[0]), cz = Math.round(u * view.r[1] + dl * view.n[1]); for (let yy = Math.floor(w.y) - 1; yy >= Math.max(0, Math.floor(w.y) - 14); yy--) if (hasCube(cx, yy, cz)) { bt = Math.max(bt, yy + 1); break; } }
      w.bottom = bt; if (far || view.rotating) { w.head = w.tail = w.y; continue; } w.head = Math.min(w.head, w.y); if (w.head < w.bottom) w.head = w.bottom; }
    if (w.temp !== undefined) w.temp -= dt;
    const on = w.cloud ? true : w.temp !== undefined ? w.temp > 0 : (game.time + w.ph) % 16 < 11;   // трубы льют подолгу
    if (on) { w.tail = w.y; w.head = Math.max(w.bottom, w.head - 11 * dt); } else { w.tail = Math.max(w.bottom, w.tail - 11 * dt); if (w.tail <= w.head + 0.01) { w.head = w.tail = w.y; } }
    if (w.tail <= w.head + 0.02) continue;
    w.spl -= dt; if (w.head <= w.bottom + 0.01 && w.spl <= 0) { w.spl = 0.06; burst(w.x, w.bottom + 0.05, w.z, { n: 2, cols: ['#bfeaf2', '#5fc3dc', '#eefcff'], sp: [0.6, 2], g: 8, life: 0.4 }); }
    const under = e => !propHidden(w) && (w.cloud || !farOff(w)) && Math.abs(toU(w) - toU(e)) < 0.45 && e.y + 0.5 > w.head && e.y < w.tail;
    w.cut = alive && under(hero) ? hero.y + 0.6 : null; w.cutE = null;
    if (w.cut !== null && !hero.hang && !hero.ride) {     // под струёй может смыть в сторону
      if (!(hero.washT > 0) && !(hero.burstT > 0) && !onGateLift() && Math.random() < dt * 0.3) { hero.washT = w.cloud ? 0.75 : 0.6; hero.washV = w.cloud ? 6.6 : 5.5; hero.washDir = Math.random() < 0.5 ? -1 : 1; if (hero.ladder) { hero.ladder = null; hero.ladPL = null; hero.ladT0 = null; hero.ladderCool = 0.7; hero.vy = 0; hero.lean = 0; go('Fly'); }   // с лестницы срывает
        sfx('RUN_1_13', 0.4, 0.7); showCombo('Смыло!', true); }
    }
    for (const r of robots) { const top = r.y + (r.dead ? 0.4 : ROBOT_TOP); if (robotHidden(r) || Math.abs(toU(w) - toU(r) - (r.dead ? 0 : r.sh || 0)) > 0.5 || top < w.head || r.y > w.tail) continue; if (r.burn > 0) r.burn = 0; if (!r.dead && r.rage > 0) coolRobot(r); if (!r.dead) { r.wet = 2.5; r.soak = Math.min(6, (r.soak || 0) + dt); if (!r.rust && !r.hunter && Math.random() < dt * 0.045) { r.rust = true; popups.push({ x: r.x, y: r.y + 1.05, z: r.z, text: 'Заржавел!', t: 0 }); sfx('RobotHit3', 0.4, 0.5); } } if (w.cut === null || top > w.cut) { w.cut = top; w.cutE = r; } }   // робот под струёй: вода обтекает и его     // герой под струёй: вода разбивается о его голову и ниже не идёт
    if (w.cut !== null) { w.spl2 = (w.spl2 || 0) - dt; if (w.spl2 <= 0) { w.spl2 = 0.03; const sd = Math.random() < 0.5 ? -1 : 1; parts.push({ x: (w.cutE || hero).x + sd * rnd(0, 0.12) * view.r[0], y: w.cut + 0.02, z: (w.cutE || hero).z + sd * rnd(0, 0.12) * view.r[1], vx: sd * rnd(0.6, 2) * view.r[0], vz: sd * rnd(0.6, 2) * view.r[1], vy: rnd(0.4, 1.8), g: 9, drag: 0, t: 0, life: rnd(0.25, 0.5), size: Math.random() < 0.3 ? 2 : 1, col: pick(['#bfeaf2', '#5fc3dc', '#eefcff']) }); } }
    if (alive && (typeof dcHas === 'function' && dcHas('poison')) && under(hero) && typeof heroPoison === 'function') heroPoison(6);   /* v310: отравленная вода */
    if (alive && hero.burn > 0 && under(hero)) { hero.burn = 0; sfx('RUN_1_13', 0.5, 0.5); burst(hero.x, hero.y + 0.4, hero.z, { n: 14, cols: SMOKE, sp: [0.3, 1.2], up: 1.4, g: 0, drag: 2, life: 0.8, size: 2 }); showCombo('Пламя сбито', true); }
    for (const f of fires) if (f.life > 1 && under(f)) f.life = 1;      // вода гасит и костёр
  }
  for (const q of booms) q.t += dt; booms = booms.filter(q => q.t < 0.62);
  const camU0 = cam.x * view.r[0] + cam.z * view.r[1];
  for (const f of fires) {
    if (!f.snapped && !f.trap && !f.wreck && !(f.prom && f.src)) { f.snapped = true; const su = surfaceBelow(toU(f), f.y + 0.35, toD(f));   // огонь не висит в воздухе: садится на опору под собой, а если её нет — гаснет
      if (su == null || f.y - su > 3) f.life = Math.min(f.life, 0.4); else f.y = su - (f.prom ? 0.07 : 0); }
    if (f.wreck) { const r = f.wreck; if (robots.indexOf(r) < 0) f.wreck = null; else { f.x = r.x; f.z = r.z; f.y = r.y + 0.08; } }   // горит на обломках — и падает вместе с ними
    if (f.delay > 0) { f.delay -= dt; continue; }   // сначала взрыв, короткая пауза — и только потом пламя
    f.life -= dt; f.smk -= dt;
    if (f.wreck && f.life > 1.5 && Math.random() < dt * 0.012) {     // небольшой шанс: обломки взрываются второй раз и пропадают
      const r = f.wreck; f.wreck = null; f.life = Math.min(f.life, 1.2); robots = robots.filter(o => o !== r); for (const k of kunais) if (k.in === r) { k.in = null; k.state = 'fly'; k.drop = true; k.vy = 0; k.t = 1; k.fx = 0; }
      booms.push({ x: r.x, y: r.y + 0.35, z: r.z, t: 0 }); booms.push({ x: r.x + 0.3 * view.r[0], y: r.y + 0.6, z: r.z + 0.3 * view.r[1], t: -0.08 }); sfx('RobotDeathB', 0.7, 1.2); sfx('RobotDeathD', 0.5, 0.8); game.shake = Math.max(game.shake, 0.14);
      burst(r.x, r.y + 0.3, r.z, { n: 26, cols: ['#2c2c30', '#55555c', '#8a8a92', '#ff7014', '#ffce46'], sp: [1.5, 5.5], up: 2.4, life: 0.9, size: 2 });
      if (alive && !propHidden(f) && Math.abs(toU(f) - hu) < 1.2 && Math.abs(hero.y - f.y) < 1.2) hurtHero(toU(f), 'взрыв горящего обломка');
    }
    if (!f.cull && !f.hid && Math.abs(toU(f) - camU0) < W / S / 2 + 1 && Math.abs(f.y - cam.y) < H / S / 2 + 1) { const tr = f.prom && !f.big ? 0.35 : 1; embers(f.x, f.y, f.z, dt, 9 * tr); flecks(f.x, f.y, f.z, dt, 11 * tr); }   // искры — только у видимых огней; у следа реже
    if (false) { f.smk = 0.12; parts.push({ x: f.x + rnd(-0.1, 0.1) * view.r[0], y: f.y + 0.6, z: f.z + rnd(-0.1, 0.1) * view.r[1], vx: 0, vz: 0, vy: rnd(0.6, 1.2), g: 0, drag: 0.6, t: 0, life: rnd(0.5, 1), size: 1, col: Math.random() < 0.3 ? '#ffb326' : '#4a3d3c' }); }
    { const touch = alive && f.life > 0.6 && !propHidden(f) && Math.abs(toU(f) - hu) < 0.42 && hero.y < f.y + 0.9 && hero.y + hero.h > f.y - 0.15;   // мир повернули, и герой оказался на огне — не загорается, пока сам не выйдет из него и не войдёт снова
      if (!touch) { f.safeH = false; f.touchT = 0; } else if (hero.rotSafe > 0) f.safeH = true; else if (!f.safeH) { if (f.trap) igniteHero(); else { f.touchT = (f.touchT || 0) + dt; if (f.touchT > 0.6) igniteHero(); } } }
  }
  fires = fires.filter(f => f.life > 0);
  if (hero.prom && hero.burn > 0) hero.burn = 0;
  if (hero.burn > 0 && alive) {          // герой горит: каждые полторы секунды теряет здоровье, пока не погаснет сам или под водой
    hero.burn -= dt; hero.burnTick += dt;
    embers(hero.x, hero.y, hero.z, dt, 7); flecks(hero.x, hero.y, hero.z, dt, 10);
    if (false) parts.push({ x: hero.x, y: hero.y + rnd(0.2, 0.6), z: hero.z, vx: 0, vz: 0, vy: rnd(0.8, 1.5), g: 0, drag: 0.5, t: 0, life: rnd(0.3, 0.7), size: 1, col: Math.random() < 0.5 ? '#ffb326' : '#ff7014' });
    if (hero.burnTick >= 3.2) { hero.burnTick = 0; PLOG.why = 'горит'; loseHP(); hero.sq = -0.1; sfx('RobotHit2', 0.4, 1.6); updateHUD(); if (hero.hp <= 0) { hero.burn = 0; killHero(); } }
  }
}
// Лестница из труб на стене: вверх — схватиться и лезть, вниз — спускаться, прыжок — спрыгнуть, наверху шаг в сторону — сойти на уступ.
// Кадров лазания спиной у героя нет: пока чередуются два кадра «держится за край» — левой и правой рукой.
function ladderU(L) { return L.x * view.r[0] + L.z * view.r[1]; }
function grabLadder(fromTop) {       // fromTop: герой стоит наверху и жмёт вниз — берётся за верх лестницы или трубы и лезет вниз
  if (hero.ride || hero.hang || hero.state === 'dead' || hero.ladderCool > 0 || ST[hero.st].lock) return false;
  for (const L of LEVEL.climbs.concat(dynClimbs)) {
    const near = !(Math.abs(ladderU(L) - toU(hero)) > (fromTop ? 1.0 : L.pipe ? 0.45 : 0.7) || (fromTop ? Math.abs(hero.y - L.y1) > 0.25 : hero.y < L.y0 - 1.5 || hero.y > L.y1 - 0.15));
    const facing = L.armP ? armVisible() : !(L.chain ? FACE_N[L.chain.f][0] * view.n[0] + FACE_N[L.chain.f][1] * view.n[1] < -0.3 : L.x * view.n[0] + L.z * view.n[1] < (L.pin && L.d !== undefined ? L.d - 0.5 : 7));   /* v278: лаз на руке — когда руки видны */
    if (!facing || !near) continue;
    if (!fromTop && hero.y < L.y0 - 0.25) { if (hero.onGround) { hero.vy = 3.9; hero.onGround = false; hero.jumpUp = false; go('JumpInRun'); return false; } if (hero.y < L.y0 - 0.45) continue; }
    if (L.lamp && L.lamp.gone) continue;
    if (L.lamp) { L.lamp.bv -= 1.4; L.lamp.om += (hero.vx || hero.face * 1.2) * 0.9 / Math.max(0.6, L.lamp.len); hero.ladPL = null; }
    hero.ladder = L; hero.ladOff = 0; hero.y = fromTop ? L.y1 - 0.06 : Math.max(hero.y, L.y0); hero.vx = hero.vy = 0; hero.hook = null; hero.jumpUp = false; hero.onGround = false; hero.ladT = 0; go('Take'); return true;
  }
  return false;
}
const CLIMB_HAND = {"HeroClimb_0_0": [0.142, 0.61], "HeroClimb_0_1": [0.125, 0.61], "HeroClimb_0_2": [0.113, 0.61], "HeroClimb_0_3": [0.118, 0.6], "HeroClimb_0_4": [0.119, 0.62], "HeroClimb_0_5": [0.129, 0.59], "HeroClimb_1_0": [0.149, 0.68], "HeroClimb_1_1": [0.167, 0.64], "HeroClimb_1_2": [0.119, 0.62], "HeroClimb_1_3": [0.153, 0.62], "HeroClimb_1_4": [0.133, 0.63], "HeroClimb_1_5": [0.106, 0.61], "HeroClimb_1_6": [0.083, 0.61], "HeroClimb_2_0": [0.152, 0.63], "HeroClimb_2_1": [0.078, 0.58], "HeroClimb_2_2": [0.135, 0.63], "HeroClimb_2_3": [0.058, 0.59], "HeroClimb_2_4": [0.158, 0.62], "HeroClimb_2_5": [0.072, 0.62], "HeroClimb_3_0": [0.125, 0.61], "HeroClimb_3_1": [0.125, 0.61], "HeroClimb_3_2": [0.125, 0.61], "HeroClimb_3_3": [0.125, 0.61], "HeroClimb_3_4": [0.125, 0.61], "HeroClimb_3_5": [0.125, 0.61], "HeroClimb_3_6": [0.125, 0.61], "HeroClimb_4_0": [0.149, 0.68], "HeroClimb_4_1": [0.149, 0.68], "HeroClimb_4_2": [0.149, 0.68], "HeroClimb_4_3": [0.149, 0.68], "HeroClimb_4_4": [0.149, 0.68], "HeroClimb_4_5": [0.149, 0.68], "HeroClimb_4_6": [0.149, 0.68]};   // где ладонь поднятой руки в каждом кадре лазания (от ступней, в кубах)
function updateLadder(dt, ax) {
  const L = hero.ladder, lu = L.x * view.r[0] + L.z * view.r[1], ld = L.chain || L.lamp ? L.x * view.n[0] + L.z * view.n[1] : (L.d || 8);
  if (L.lamp) {                         // на проводе лампы: рука держится за шнур, лампа качает героя как маятник; A/D — раскачаться, прыжок — отпустить и улететь по ходу качания
    const q = L.lamp, HX = 0.15, HY = 0.66, v = (keys.has('up') ? 1 : 0) - (keys.has('sit') ? 1 : 0);
    hero.vx = hero.vy = 0; hero.onGround = false; hero.airJumps = 1; hero.hookAir = false;
    if (hero.ladPL !== L) { hero.ladP = hero.y; hero.ladPL = L; }
    hero.ladP = Math.max(L.y0, Math.min(L.y1 - 0.8, hero.ladP + v * 1.4 * dt));
    q.om += ax * 6 * Math.cos(q.th) * dt; q.th = Math.max(-1.25, Math.min(1.25, q.th));
    if (hero.ladT0 !== L) { hero.ladT0 = L; q.snapNow = Math.random() < 0.02 ? 0.25 : 0; }       // иногда провод не выдерживает сразу
    if (q.snapNow > 0) { q.snapNow -= dt; if (q.snapNow <= 0) q.gone = true; }
    if (Math.abs(q.th) > 0.55 && Math.random() < dt * 0.03) q.gone = true;                       // а иногда рвётся, когда сильно раскачаешься
    if (q.gone) { const bx = q.x + Math.sin(q.th) * q.len * view.r[0], bz = q.z + Math.sin(q.th) * q.len * view.r[1], by = q.y - Math.cos(q.th) * q.len;
      sfx('RobotHit3', 0.6, 2.4); showCombo('Провод оборвался!', true); burst(bx, by, bz, { n: 12, cols: ['#ffe9a8', '#ffb347', '#fff3c4', '#1c1719'], sp: [0.8, 3], life: 0.5 }); burst(q.x, q.y, q.z, { n: 5, cols: ['#1c1719', '#fff4e1'], sp: [0.5, 2], life: 0.3 });
      hero.ladder = null; hero.ladPL = null; hero.ladT0 = null; hero.ladderCool = 0.4; hero.vx = q.om * q.len * 0.8; hero.vy = 0.5; hero.lean = 0; go('Fly'); return; }
    if (v !== 0) { hero.ladT += v * dt; hero.ladIdle = 0; hero.anim.play('HeroClimb', { loop: true }); const ln = CL.HeroClimb.len; hero.anim.t = (((hero.ladT * 1.25) % ln) + ln) % ln; }
    else { hero.anim.play('HeroHangOne', { loop: true }); hero.anim.update(dt); }
    // точка шнура, за которую он держится, и где в этом кадре ладонь: ставим героя так, чтобы ладонь легла ровно на шнур (с учётом наклона тела)
    const s = Math.max(0.12, q.y - (hero.ladP + HY)), hu = lu + Math.sin(q.th) * s, hy = q.y - Math.cos(q.th) * s, rot = -q.th * 0.9, hp = CLIMB_HAND[hero.anim.sprite()] || [HX, HY];
    hero.lean = rot; hero.face = 1; hero.hangPop = 0;
    setUD(hero, hu - (hp[0] * Math.cos(rot) + hp[1] * Math.sin(rot)), 8); hero.y = hy - (hp[1] * Math.cos(rot) - hp[0] * Math.sin(rot));
    if (pressed.has('jump')) { const vu = q.om * s * Math.cos(q.th); hero.ladder = null; hero.ladPL = null; hero.ladT0 = null; hero.ladderCool = 0.35; hero.vx = vu * 1.1 + ax * 1.2; hero.vy = 3.2 + Math.abs(vu) * 0.5; hero.jumpUp = true; hero.jumpStart = game.time; hero.face = Math.sign(hero.vx) || 1; hero.lean = 0;
      if (Math.abs(vu) > 0.8) { hero.boostT = 0.6; hero.boostDir = Math.sign(vu); hero.boostY = hero.y - 1; } q.om *= 0.5; go('JumpInRun'); }
    else if (pressed.has('sit') && hero.ladP <= L.y0 + 0.001) { hero.ladder = null; hero.ladPL = null; hero.ladT0 = null; hero.ladderCool = 0.3; hero.lean = 0; go('Fly'); }
    return;
  }
  hero.vx = hero.vy = 0; hero.onGround = false; hero.airJumps = 1; hero.hookAir = false;
  if (hero.ladOff) {                    // сходит наверху: шагает в сторону на уступ, без скачка
    const nu = toU(hero) + hero.ladOff * 2.4 * dt; setUD(hero, nu, ld); hero.y = Math.max(hero.y, L.y1 + 0.01);
    const [nm, flip] = heroClip('RunSlow'); if (hero.anim.name !== nm) hero.anim.play(nm, { loop: true, flip }); hero.anim.update(dt);
    if (Math.abs(nu - lu) >= 0.47) { hero.ladder = null; hero.ladderCool = 0.3; hero.onGround = true; hero.st = 'RunSlow'; }
    return;
  }
  const v = (keys.has('up') ? 1 : 0) - (keys.has('sit') ? 1 : 0), top = hero.y >= L.y1 - 0.03, cu = toU(hero), du = lu - cu;
  setUD(hero, Math.abs(du) < 3.2 * dt ? lu : cu + Math.sign(du) * 3.2 * dt, ld);   // подтягивается к лестнице, а не прыгает на неё
  { const ny = Math.max(L.y0, Math.min(L.y1, hero.y + v * 1.7 * dt)); const cd = L.pin ? ld : 8; if (!overlapsDepth(lu, ny, hero.hw, hero.h, cd) || overlapsDepth(lu, hero.y, hero.hw, hero.h, cd)) hero.y = ny; }   /* v257: лестница «руками» — проверка на её глубине */   // сквозь уступ по трубе не пролезть
  if (v !== 0) { hero.ladT += v * dt; hero.ladIdle = 0; } else hero.ladIdle = (hero.ladIdle || 0) + dt;
  // кадры автора: лезет — перехватывается руками (вниз те же кадры идут в обратном порядке), замер — висит на двух руках
  if (L.lamp && hero.ladIdle > 0.12 && CL.HeroHangOne) { hero.anim.play('HeroHangOne', { loop: true }); hero.anim.update(dt); }
  else if (hero.ladIdle > 0.45 && CL.HeroClimbIdle) { hero.anim.play('HeroClimbIdle', { loop: true }); hero.anim.update(dt); }
  else if (CL.HeroClimb) { hero.anim.play('HeroClimb', { loop: true }); const ln = CL.HeroClimb.len; hero.anim.t = (((hero.ladT * 1.25) % ln) + ln) % ln; }
  hero.face = 1;
  if (keys.has('up') && top && !L.pin && doorAt()) {   /* v258: с лестницы «руками» в дверь не входим — лезем дальше */ pressed.delete('up'); const L0 = hero.ladder; if (useDoor()) { if (hero.ladder === L0) hero.ladder = null; hero.ladderCool = 0.3; return; } }   // на верху лесенки — люк: вверх, и ты внутри
  if (pressed.has('jump')) { hero.ladder = null; hero.ladderCool = 0.3; hero.vy = 3.4; hero.jumpUp = true; hero.jumpStart = game.time; if (ax) { hero.face = ax; } go('JumpInRun'); }
  else if (ax !== 0 && top) { hero.ladOff = ax; hero.face = ax; }
  else if (top && v > 0) {              // долез до верха: сам запрыгивает на опору рядом, а если её нет — подпрыгивает
    const fy = Math.round(L.y1) - 1, cd2 = L.pin ? ld : 8, own = L.pin ? (floorCube(Math.round(lu + 1), fy, cd2, 'same') ? 1 : floorCube(Math.round(lu - 1), fy, cd2, 'same') ? -1 : 0) : 0, sd = own || (floorCube(Math.round(lu + 1), fy, cd2, 'any') ? 1 : floorCube(Math.round(lu - 1), fy, cd2, 'any') ? -1 : 0);   /* v258: у лестницы «руками» — сначала опора на её глубине */
    if (sd && Math.abs(L.y1 - Math.round(L.y1)) < 0.01) { hero.ladOff = sd; hero.face = sd; }
    else { hero.ladder = null; hero.ladderCool = 0.35; hero.vy = 3.6; hero.jumpUp = true; hero.jumpStart = game.time; go('JumpInRun'); }
  }
  else if (ax !== 0 && pressed.has(ax > 0 ? 'right' : 'left')) { hero.ladder = null; hero.ladderCool = 0.3; hero.face = ax; go('Fly'); }
  else if (hero.y <= L.y0 + 0.001 && v < 0) { hero.ladder = null; hero.ladderCool = 0.3; go('Fly'); }
}
function drawSteam(q, b) {              // сопло на стене (или грудь робота) и клубы пара из листа автора
  const dir = q.down ? 1 : q.dx * b.r[0] + q.dz * b.r[1]; if (Math.abs(dir) < 0.2 || (!q.robot && q.x * b.n[0] + q.z * b.n[1] < 6)) return;
  const g = Math.max(1, Math.round(S * 0.02)), px = Math.round(W / 2 + relU(q, b) * S), py = Math.round(H / 2 - (q.y - cam.y) * S), sg = Math.sign(dir);
  if (q.down) { ctx.fillStyle = '#3a3237'; ctx.fillRect(px - 4 * g, py - 7 * g, 8 * g, 7 * g); ctx.fillStyle = '#5a4f55'; ctx.fillRect(px - 4 * g, py - 7 * g, 8 * g, g); ctx.fillStyle = '#231d21'; ctx.fillRect(px - 2 * g, py, 4 * g, 3 * g); }
  else if (!q.robot) { ctx.fillStyle = '#3a3237'; ctx.fillRect(px - 5 * g, py - 4 * g, 7 * g, 8 * g); ctx.fillStyle = '#5a4f55'; ctx.fillRect(px - 5 * g, py - 4 * g, 7 * g, g); ctx.fillStyle = '#231d21'; ctx.fillRect(px + (sg > 0 ? 2 : -6) * g, py - 2 * g, 3 * g, 4 * g); }
  const im = img.steam; if (!im || !im.width) return;
  // клубы вылетают один за другим, каждый проигрывает свои 11 кадров и уплывает вперёд; размер и переворот у каждого свои
  const ROWS = [[44, 0, 29], [34, 29, 22], [26, 51, 17]], ap = S / APX, ph = q.robot ? q.t : (game.time + q.ph) % 3.7, LIFE = 0.78, n0 = q.var || 0, far = q.down ? 1.25 : 1;
  ctx.imageSmoothingEnabled = false;
  const puff = (age, i, row) => { const R = ROWS[row], fr = Math.min(10, Math.floor(age / LIFE * 11)), dist = (0.12 + (0.55 + 0.25 * ((i * 7 + n0) % 3)) * far * (1 - Math.exp(-age * 3.4))) * S, w = R[0] * ap, h = R[2] * ap, up = ((i * 5 + n0) % 4 - 1.5) * 0.05 * S * age / LIFE;
    ctx.save(); if (q.down) { ctx.translate(Math.round(px + up), Math.round(py + dist)); ctx.rotate(Math.PI / 2); ctx.scale(1, (i + n0) % 2 ? -1 : 1); } else { ctx.translate(Math.round(px + sg * dist), Math.round(py - up)); ctx.scale(sg, (i + n0) % 2 ? -1 : 1); }
    ctx.drawImage(im, fr * R[0], R[1], R[0], R[2], -w * 0.12, -h / 2, w, h); ctx.restore(); };
  if (q.warn) puff(((game.time * 2.2) % 1) * 0.2, 0, 2);
  const cnt = q.robot ? 7 : 9;
  for (let i = 0; i < cnt; i++) { const age = ph - i * 0.14; if (age >= 0 && age < LIFE) puff(age, i, (i + n0) % 3 === 2 ? (n0 % 2 ? 2 : 1) : n0 % 3 === 2 && i % 2 ? 1 : 0); }
  ctx.imageSmoothingEnabled = true;
}
function drawLadder(L, b) {
  const N = FACE_N[L.f % 4], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < 0.08) return;
  const c = lanePosR(L.f, L.t, L.r || 8), g = Math.max(2, Math.round(S * 0.03)), px = Math.round(W / 2 + relU({ x: c[0], z: c[1] }, b) * S), y1 = Math.round(H / 2 - (L.y1 + 0.25 - cam.y) * S), y0 = Math.round(H / 2 - (L.y0 - 0.25 - cam.y) * S), hw2 = Math.round(S * 0.27 * fc);
  const lk = (img.props3 && img.props3.width ? 'p' : '') + g + '|' + hw2 + '|' + (y0 - y1) + '|' + Math.round(S * 0.3); let cv = ladderCache.get(lk), ox = hw2 + 3 * g, oy = 2 * g;
  const P3 = img.props3; if (!cv && P3 && P3.width) { const q = PROPS3.ladder, k = S / 32, tw = Math.max(4, Math.round(q[2] * k * fc)), th = Math.round(q[3] * k);   // лестница автора: тайл по высоте
    cv = document.createElement('canvas'); cv.width = 2 * hw2 + 6 * g; cv.height = y0 - y1 + 4 * g; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; const X = ox - Math.round(tw / 2);
    for (let yy = cv.height - th; yy > -th; yy -= th) x.drawImage(P3, q[0], q[1], q[2], q[3], X, yy, tw, th);
    if (ladderCache.size > 200) ladderCache.clear(); ladderCache.set(lk, cv); }
  if (!cv) { cv = document.createElement('canvas'); cv.width = 2 * hw2 + 6 * g; cv.height = y0 - y1 + 4 * g; const x = cv.getContext('2d'), X = ox, Y0 = y0 - y1 + oy, Y1 = oy;   // лестница одной картинкой на каждый её размер
    for (let yy = Y0 - g * 4; yy > Y1 + g * 2; yy -= Math.round(S * 0.3)) { x.fillStyle = '#3a3237'; x.fillRect(X - hw2, yy, hw2 * 2, g * 2); x.fillStyle = '#5a4f55'; x.fillRect(X - hw2, yy, hw2 * 2, g); }
    for (const sx of [-hw2 - g, hw2 - g]) { x.fillStyle = '#3a3237'; x.fillRect(X + sx, Y1, g * 3, Y0 - Y1); x.fillStyle = '#5a4f55'; x.fillRect(X + sx, Y1, g, Y0 - Y1); x.fillStyle = '#231d21'; x.fillRect(X + sx - g, Y1 - g, g * 5, g * 2); }
    if (ladderCache.size > 200) ladderCache.clear(); ladderCache.set(lk, cv); }
  ctx.drawImage(cv, px - ox, y1 - oy);
}
// Дверь: встать перед ней, когда её сторона повёрнута к камере, и нажать вверх. Герой выходит из парной двери на противоположной
// стороне ноги, мир сам поворачивается к ней. Запертой нужен ключ; открыв одну дверь пары, открываешь и вторую.
function doorAt() {
  if (hero.ride || hero.hang || view.rotating) return null; const hu = toU(hero);
  if (hero.ladder) { for (const d of doors) if (d.hatch && d.f === view.k && Math.abs(toU(d) - hu) < 0.7 && Math.abs(hero.y - d.y) < 0.9) return d; return null; }   // люк на высоте — с верха лесенки
  if (!hero.onGround) return null;
  for (const d of doors) if (!d.sealed && !d.gone && d.f === view.k && Math.abs(toU(d) - hu) < (d.exit ? 0.95 : 0.8) && hero.y - d.y > -0.1 && hero.y - d.y < 1.25) return d;   // и стоя на обломках робота, упавшего у двери   // в щели выхода дверь берётся с любого места
  return null;
}
function useDoor() {
  const d = doorAt(); if (!d) return false;
  if (d.locked && d.gate) {
    if (!hero.gk[d.gate]) { const o = keyItems.find(q => q.gate === d.gate), nm = GATE_COL[d.gate][6]; d.tries = (d.tries || 0) + 1; if (doors[d.to]) doors[d.to].tries = d.tries;
      if (o && !o.got && d.tries >= 4) { o.hid = false; o.niche = false; const r = view.r, sg = floorCube(Math.round(toU(hero)) + 1, Math.round(hero.y) - 1, toD(hero), 'same') ? 1 : -1; o.x = d.x + r[0] * sg; o.z = d.z + r[1] * sg; o.y = d.y + 0.5; for (const c of crates) if (c.key && c.gate === d.gate) c.key = false; burst(o.x, o.y, o.z, { n: 14, cols: [GATE_COL[d.gate][1], GATE_COL[d.gate][2], '#fff4e1'], sp: [0.8, 2.6], g: 3, life: 0.6 }); showCombo('Ключ выпал из замка — подбери', true); }
      else if (o && !o.got) { const FNk = [[0, 1], [1, 0], [0, -1], [-1, 0]], f = [0, 1, 2, 3].reduce((m, q) => FNk[q][0] * o.x + FNk[q][1] * o.z > FNk[m][0] * o.x + FNk[m][1] * o.z ? q : m, 0); showCombo('Заперто. Нужен ' + nm + ' ключ: сторона ' + ['Юг', 'Восток', 'Север', 'Запад'][f] + ', высота ' + Math.floor(o.y) + (o.niche ? ', в тёмной нише' : o.hid ? ', в ящике со значком' : ''), true); }
      else showCombo('Заперто. Нужен ' + nm + ' ключ', true);
      sfx('RobotHit3', 0.4, 0.6); game.nudge = 0.12; return true; }
    d.locked = false; if (d.to !== undefined) doors[d.to].locked = false; sfx('RobotHit5', 0.6, 1.5); showCombo('Дверь открыта', true); updateHUD();
  } else if (d.locked && d.tkey) {
    if (!hero.tkey) { showCombo('Заперто. Ключ у робота в коридоре — над ним светится ключ', true); sfx('RobotHit3', 0.4, 0.6); game.nudge = 0.12; return true; }
    d.locked = false; sfx('RobotHit5', 0.6, 1.5); showCombo('Дверь открыта', true); updateHUD();
  } else if (d.locked) {
    if (hero.keys <= 0) { showCombo('Заперто — где-то рядом лежит ключ', true); sfx('RobotHit3', 0.4, 0.6); game.nudge = 0.12; return true; }
    hero.keys--; d.locked = false; if (d.to !== undefined) doors[d.to].locked = false; sfx('RobotHit5', 0.6, 1.5); showCombo('Дверь открыта', true); updateHUD();
  }
  if (d.exit && !hero.redKey) { showCombo('Вход в таз заперт — нужен красный ключ', true); sfx('RobotHit3', 0.4, 0.6); game.nudge = 0.12; return true; }
  if (d.final || (d.exit && d.to === undefined)) { plog('финиш', ''); plogSave(); game.finishT = 1.8; $('banner').hidden = false; sfx('RobotDeathD', 0.6, 0.6); hero.inDoor = 9; return true; }
  const o = doors[d.to]; if (!o) return true; sfx('RUN_1_13', 0.5, 0.6);
  if (d.room || o.room) {               // внутрь титана и обратно: мгновенно, через затемнение; внутри вид всегда с юга
    plog('дверь', o.room ? 'внутрь' : 'наружу'); if (!o.room && o.y < 12) game.calmT = CALM_AFTER_EXIT;   /* v230: у выхода из туннеля роботы не нападают сразу */ hero.x = o.x; hero.y = o.y; hero.z = o.z; hero.vx = hero.vy = 0; hero.hook = null; hero.inDoor = 0; hero.rotSafe = 0.5; go('Stay');
    setView(o.f); game.fadeT = 0.5; cam.x = hero.x; cam.y = hero.y + 1.2; cam.z = hero.z; cam.gy = null; cam.la = 0; jets.length = 0;
    for (const r of robots) { robotAwayCalc(r); r.sh = robotShift(r); if (!r.dead) r.turnWait = CFG.robotTurnDelay; }
    const C = o.room ? complexAt(o.y) : null; showCombo(C ? C.name + (C.name === 'Таз' ? ': найди выход наверх, к груди' : C.boss ? ': мозг титана' : '') : 'Снаружи', true); updateHUD(); return true; } plog('дверь', d.gate ? 'перегородка ' + GATE_COL[d.gate][6] : 'обычная'); if (d.gate) openGateLift(d.gate);
  hero.x = o.x; hero.y = o.y; hero.z = o.z; hero.vx = hero.vy = 0; hero.inDoor = 1; hero.hook = null; go('Stay');
  { const dk = ((o.f - view.k) % 4 + 4) % 4;   /* v276: дверь из редактора может вести на любую сторону (и на ту же) — мир поворачивается к стороне второй двери */
    if (dk === 0) { hero.inDoor = 0; game.fadeT = 0.4; cam.x = hero.x; cam.y = hero.y + 1.2; cam.z = hero.z; } else { view.rotating = true; view.from = view.angle; view.dir = dk === 3 ? -1 : 1; view.to = view.angle + (dk === 3 ? -90 : dk * 90); view.fast = true; } }   // мир поворачивается на другую сторону
  return true;
}
const PROPS = {"door0": [1, 1, 21, 28], "door1": [23, 1, 21, 28], "door2": [45, 1, 21, 28], "door3": [67, 1, 21, 28], "door4": [89, 1, 21, 28], "stub0": [111, 1, 3, 5], "stub1": [115, 1, 3, 8], "stub2": [119, 1, 3, 5], "stub3": [1, 30, 8, 8], "branch0": [10, 30, 16, 6], "branch1": [27, 30, 16, 6], "branch2": [44, 30, 9, 6], "branch3": [54, 30, 16, 6], "arch0": [71, 30, 9, 4], "arch1": [81, 30, 13, 4], "arch2": [95, 30, 9, 7], "arch3": [105, 30, 9, 4], "cap0": [1, 39, 105, 19], "cap1": [1, 59, 105, 19], "cap2": [1, 79, 105, 19], "xdoorY": [1, 100, 21, 28], "xdoorB": [23, 100, 21, 28], "xdoorR": [45, 100, 21, 28], "mgrille": [1, 134, 12, 12], "mbolt": [14, 134, 12, 11], "mlight": [27, 134, 11, 11], "mslits": [39, 134, 11, 11]};
const APX = 23.5;                       // столько пикселей рисунка автора приходится на один куб
function drawProp(name, px, py, fc, flip) {   // низ рисунка по центру в точке (px, py)
  const r = PROPS[name], im = img.props; if (!r || !im || !im.width) return;
  const a = S / APX, w = r[2] * a * fc, h = r[3] * a;
  ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.save(); ctx.translate(Math.round(px), 0); ctx.scale(-1, 1); ctx.drawImage(im, r[0], r[1], r[2], r[3], -w / 2, Math.round(py - h), w, h); ctx.restore(); }
  else ctx.drawImage(im, r[0], r[1], r[2], r[3], Math.round(px - w / 2), Math.round(py - h), w, h);
  ctx.imageSmoothingEnabled = true;
}
function drawDecor(o, b) {
  const N = FACE_N[o.f], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < 0.03) return; ctx.globalAlpha = edgeFade(fc);
  drawProp(o.spr, W / 2 + relU(o, b) * S, H / 2 - (o.y - cam.y) * S + 1, fc, o.flip);
}
function drawRecess(b) {               // ниша выхода в стене таза: свет не достаёт вглубь — сверху и по бокам ступенчатая тень, у пола чуть светлее
  const fc = b.n[0]; if (fc < 0.03) return; ctx.globalAlpha = edgeFade(fc); const E = LEVEL.exit, g = Math.max(2, Math.round(S * 0.045));
  const cx = W / 2 + relU(E, b) * S, x0 = Math.round(cx - 1.5 * S * fc), x1 = Math.round(cx + 1.5 * S * fc), y0 = Math.round(H / 2 - (E.y + 3 - cam.y) * S), y1 = Math.round(H / 2 - (E.y - cam.y) * S);
  const T = Math.round(g * 1.5), n = 5;       // пять ступеней тени: у самого края темнее всего, к середине задней стенки светлеет
  for (let i = 0; i < n; i++) { ctx.fillStyle = 'rgba(5,3,12,' + (i === 0 ? 0.5 : 0.17).toFixed(2) + ')'; const d = T * (n - i), dx = Math.round(d * fc);
    ctx.fillRect(x0, y0, x1 - x0, d * 2); ctx.fillRect(x0, y0 + d * 2, dx, y1 - y0 - d * 2); ctx.fillRect(x1 - dx, y0 + d * 2, dx, y1 - y0 - d * 2); }
  ctx.fillStyle = 'rgba(5,3,12,0.45)'; ctx.fillRect(x0, y0, x1 - x0, g * 2);                       // тень притолоки
  ctx.fillStyle = 'rgba(170,240,230,0.10)'; ctx.fillRect(x0 + Math.round(T * 3 * fc), y1 - g * 2, x1 - x0 - Math.round(T * 6 * fc), g * 2);   // отсвет двери на полу ниши
}
function drawDoorAt(d, b) {
  if (d.gone) return; const N = FACE_N[d.f], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < 0.03) return; ctx.globalAlpha = edgeFade(fc);   /* v276: gone — дверь удалена в редакторе (номера остальных не сдвигаются) */
  const g = Math.max(2, Math.round(S * 0.03)), px = Math.round(W / 2 + relU(d, b) * S), py = Math.round(H / 2 - (d.y - cam.y) * S);
  const ap = S / APX;                    // дверь автора: у каждой свой вариант — где больше зелени, где меньше, запертые с засовами
  { const DI = img.Doors, set = d.room || d.y > 2500 ? 'plain' : 'moss', kind = d.hatch ? 'round' : 'rect';   // двери автора: снаружи — во мху, внутри — чистые; круглые — только люки на высоте
    if (DI && DI.width && typeof DOORS2 !== 'undefined') { const L = DOORS2.filter(q => q.set === set && q.kind === kind), h = Math.abs(Math.round(d.x * 7 + d.y * 13 + d.z * 5)), v = d.exit || d.final || d.cabin ? L[L.length - 1] : L[(d.v !== undefined ? d.v : h) % L.length];   /* v276: d.v — вид, заданный в редакторе */
      const open = !(d.locked || d.sealed || ((d.exit) && !hero.redKey)), r = open ? v.o : v.c, gg = Math.max(1, Math.round(S / 40)), cw = v.c[2] * gg;
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(px, 0); ctx.scale(fc * (d.flip ? -1 : 1), 1); ctx.drawImage(DI, r[0], r[1], r[2], r[3], -Math.round(r[2] * gg / 2), Math.round(py + 1 + (d.hatch ? 0.15 * S : 0.1 * S) - r[3] * gg), r[2] * gg, r[3] * gg); ctx.restore(); }
    else { const key = d.exit || d.final || d.cabin ? 'xdoorR' : d.gate && d.locked ? (d.gate === 1 ? 'xdoorY' : 'xdoorB') : null; drawProp(key || (d.locked ? d.sprL : d.spr), px, py + 1, fc, key ? false : d.flip); } }   // двери автора; у дверей под ключ внутри рамы — створка цвета ключа
  if (d.gate && d.locked && fc > 0.6) keyMark(px, Math.round(py - 36 * ap), Math.max(2, Math.round(S * 0.03)), GATE_COL[d.gate]);
  if (d.exit || d.final || d.cabin) pixelGlow(px, Math.round(py - 15 * ap), 0.7, 0.07 + 0.04 * Math.sin(game.time * 3), '255,90,60');
  if (d.final || (d.exit ? hero.redKey : (!d.locked || (d.gate ? hero.gk[d.gate] : hero.keys > 0)))) {      // сюда можно войти: над дверью светится треугольник
    const k = 0.55 + 0.45 * Math.sin(game.time * 4 + d.x), ty = Math.round(py - 33 * (S / APX)) - Math.round(Math.sin(game.time * 2.5 + d.x) * g);
    pixelGlow(px, ty - g, 0.28, 0.1 + 0.08 * k, d.exit ? '150,255,240' : '255,220,140');
    ctx.fillStyle = d.exit ? '#bff0f0' : '#ffe9a8'; ctx.globalAlpha = 0.6 + 0.4 * k;
    ctx.fillRect(px - g / 2, ty - g * 3, g, g); ctx.fillRect(px - g * 1.5, ty - g * 2, g * 3, g); ctx.fillRect(px - g * 2.5, ty - g, g * 5, g); ctx.globalAlpha = 1;
  }
  if (d === doorAt()) { ctx.fillStyle = '#fff4e1'; ctx.fillRect(px - g, py - 50 * g - Math.round(Math.sin(game.time * 5) * g), g * 2, g * 3); ctx.fillRect(px - g * 2, py - 48 * g - Math.round(Math.sin(game.time * 5) * g), g * 4, g); }   // подсказка: стрелка вверх
}
function drawKey(o, b) {
  const g = o.small ? Math.max(1, Math.round(S * 0.016)) : Math.max(2, Math.round(S * 0.026)) * (o.red ? 1.5 : o.gate ? 1.25 : 1), k = Math.abs(Math.cos(game.time * 3 + o.ph)), w = Math.max(1, Math.round(4 * k));
  const px = Math.round(W / 2 + relU(o, b) * S), py = Math.round(H / 2 - (o.y + 0.05 * Math.sin(game.time * 2.2 + o.ph) - cam.y) * S);
  const C = o.gate ? GATE_COL[o.gate] : o.red ? ['#6a1410', '#e0402a', '#ffb09a', 'rgba(255,90,60,0.22)'] : ['#1d5a50', '#7fd1b0', '#bff0f0', 'rgba(190,255,246,0.2)'];   // красный ключ крупнее: он от двери-выхода
  if (o.red) pixelGlow(px, py, 0.5, 0.09 + 0.04 * Math.sin(game.time * 5), '255,60,40');
  ctx.fillStyle = C[3]; ctx.fillRect(px - g * 5, py - g * 7, g * 10, g * 14);
  const R = (cx, cy, ww, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(px + cx * g), Math.round(py + cy * g), Math.round(ww * g), Math.round(h * g)); };
  R(-w - 1, -7, w * 2 + 2, 7, C[0]); R(-w, -6, w * 2, 5, C[1]); if (w > 1) R(-w + 1, -5, w * 2 - 2, 3, C[0]);   // кольцо
  R(-1, 0, 2, 7, C[1]); R(1, 3, Math.max(1, w - 1), 1, C[1]); R(1, 5, Math.max(1, w), 1, C[1]); R(-1, -6, 1, 13, C[2]);
}
function updatePuddles(dt) {             // лужа в выемке уступа: вошёл — брызги; вода сбивает пламя
  if (hero.wetDrip > 0) { hero.wetDrip -= dt; if (hero.state !== 'dead' && !hero.inDoor && Math.random() < dt * 9) parts.push({ x: hero.x + rnd(-0.18, 0.18) * view.r[0], y: hero.y + rnd(0.1, 0.6), z: hero.z + rnd(-0.18, 0.18) * view.r[1], vx: 0, vz: 0, vy: -0.3, g: 9, drag: 0, t: 0, life: rnd(0.3, 0.5), size: 1, col: pick(['#bfeaf2', '#5fc3dc', '#eefcff']) }); }
  const WC = ['#bfeaf2', '#5fc3dc', '#eefcff', '#3a9fc0'];
  for (let i = wetSpots.length - 1; i >= 0; i--) { wetSpots[i].t -= dt; if (wetSpots[i].t <= 0) wetSpots.splice(i, 1); }
  let dipH = false; for (const r of robots) r.dipOn = false;
  for (const p of puddles) { p.t += dt;
    const inP = e => Math.abs(e.x - p.x) < 0.55 && Math.abs(e.z - p.z) < 0.55 && Math.abs(e.y - p.y) < 0.12;
    const hin = hero.state !== 'dead' && hero.onGround && inP(hero);
    if (hin && !p.in) { burst(hero.x, p.y + 0.05, hero.z, { n: 12, cols: WC, sp: [0.8, 2.6], up: 1.8, g: 9, life: 0.5 }); sfx('RUN_1_13', 0.3, 1.1); }
    if (hin && Math.abs(hero.vx) > 0.6 && Math.random() < dt * 26) parts.push({ x: hero.x, y: p.y + 0.04, z: hero.z, vx: -Math.sign(hero.vx) * rnd(0.3, 1.6) * view.r[0], vz: -Math.sign(hero.vx) * rnd(0.3, 1.6) * view.r[1], vy: rnd(0.8, 2.2), g: 9, drag: 0, t: 0, life: rnd(0.25, 0.45), size: 1, col: pick(WC) });
    if (hin && hero.burn > 0) { hero.burn = 0; burst(hero.x, hero.y + 0.4, hero.z, { n: 12, cols: SMOKE, sp: [0.3, 1.2], up: 1.4, g: 0, drag: 2, life: 0.8, size: 2 }); showCombo('Пламя сбито', true); }
    p.in = hin; if (hin) { dipH = true; hero.wetDrip = Math.max(hero.wetDrip || 0, 2.5); if (typeof dcHas === 'function' && dcHas('poison') && typeof heroPoison === 'function') heroPoison(6); }   /* v312: вода в бассейне тоже отравлена */
    for (const r of robots) if (inP(r)) { r.dipOn = true; if (!r.dead) { r.wet = Math.max(r.wet || 0, 1.5); r.soak = Math.min(6, (r.soak || 0) + dt * 1.6); } }
    for (const r of robots) if (!r.dead && inP(r)) { if (Math.random() < dt * 9) parts.push({ x: r.x, y: p.y + 0.04, z: r.z, vx: rnd(-1.2, 1.2) * view.r[0], vz: rnd(-1.2, 1.2) * view.r[1], vy: rnd(0.8, 2), g: 9, drag: 0, t: 0, life: rnd(0.25, 0.45), size: 1, col: pick(WC) }); if (r.burn > 0) r.burn = 0; } }
  hero.dip = (hero.dip || 0) + ((dipH ? 0.33 : 0) - (hero.dip || 0)) * Math.min(1, dt * 14); for (const r of robots) r.dip = (r.dip || 0) + ((r.dipOn ? 0.33 : 0) - (r.dip || 0)) * Math.min(1, dt * 14);
}
function drawPuddle(p, b, wet) {         // вода в чаше: полупрозрачная, герой и роботы видны сквозь неё по колено
  const N = FACE_N[p.f], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < 0.03) return; ctx.globalAlpha = edgeFade(fc);
  const g = Math.max(2, Math.round(S * 0.04)), cx = W / 2 + relU(p, b) * S, py = Math.round(H / 2 - (p.y - cam.y) * S), x0 = Math.round(cx - S * fc / 2), x1 = Math.round(cx + S * fc / 2), w = x1 - x0;
  if (wet) { const hw = Math.round(S * 0.36 * fc), a = 0.5 * Math.min(1, p.t / 2); ctx.fillStyle = 'rgba(95,195,220,' + a.toFixed(2) + ')'; ctx.fillRect(Math.round(cx) - hw, py - g, hw * 2, g); return; }
  const dp = Math.round(S / 3), top = py + g; ctx.fillStyle = 'rgba(58,150,205,0.42)'; ctx.fillRect(x0, top, w, dp - g); ctx.fillStyle = 'rgba(20,60,100,0.22)'; ctx.fillRect(x0, top + Math.round((dp - g) * 0.55), w, dp - g - Math.round((dp - g) * 0.55));
  ctx.fillStyle = 'rgba(214,244,255,0.6)'; ctx.fillRect(x0, top, w, Math.max(1, g >> 1)); const k = Math.floor(p.t * 4 + p.x * 3 + p.z) % Math.max(1, Math.round(w / g)); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x0 + k * g, top, Math.min(g * 2, x1 - (x0 + k * g)), Math.max(1, g >> 1));
}
function drawProm(o, b) {                 // предмет «Руки Прометея»: кулак в пламени, в духе ключей
  const g = Math.max(2, Math.round(S * 0.03)), px = Math.round(W / 2 + relU(o, b) * S), py = Math.round(H / 2 - (o.y + 0.05 * Math.sin(game.time * 2.2 + o.ph) - cam.y) * S), fl = Math.floor(game.time * 9) % 3;
  pixelGlow(px, py, 0.5, 0.1 + 0.05 * Math.sin(game.time * 6), '255,150,50'); ctx.fillStyle = 'rgba(255,170,70,0.16)'; ctx.fillRect(px - g * 5, py - g * 8, g * 10, g * 15);
  const R = (cx, cy, ww, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(px + cx * g), Math.round(py + cy * g), Math.round(ww * g), Math.round(h * g)); };
  const F = [[[-2, -7, 1, 2], [0, -8, 1, 3], [2, -6, 1, 1]], [[-1, -8, 1, 3], [1, -7, 1, 2], [-3, -6, 1, 1]], [[0, -7, 1, 2], [2, -8, 1, 3], [-2, -6, 1, 1]]][fl];
  R(-3, -5, 6, 3, '#e8501a'); R(-2, -6, 4, 2, '#ff7014'); R(-1, -5, 2, 2, '#ffce46'); for (const q of F) { R(q[0], q[1], q[2], q[3], '#ff7014'); R(q[0], q[1] + 1, q[2], Math.max(1, q[3] - 1), '#ffce46'); }   // пламя
  R(-3.5, -3, 7, 6.5, '#2b1a17'); R(-3, -2.5, 6, 5.5, '#c98a5e'); R(-3, -2.5, 6, 1, '#e8b58a'); for (let i = 0; i < 3; i++) R(-1.5 + i * 1.5, -2.5, 0.5, 2.5, '#2b1a17'); R(-3, 1, 6, 0.5, '#8a5a3a'); R(1.5, 0, 1.5, 1.5, '#e8b58a');   // кулак
  R(-2.5, 3.5, 5, 3, '#2b1a17'); R(-2, 3.5, 4, 2.5, '#6b4a3a');   // запястье в обмотке
}
function drawShieldCoin(px, py, g2, kk) {   // щиток, который крутится как монетка: kk — косинус поворота
  const ak = Math.abs(kk), PR = [3.5, 3.5, 3.5, 3.5, 3.5, 3, 2, 1], R2 = (cx, cy, ww, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(px + cx * g2), Math.round(py + cy * g2), Math.max(1, Math.round(ww * g2)), Math.round(h * g2)); };
  for (let r = 0; r < 8; r++) { const hw = Math.max(0.5, Math.round(PR[r] * ak * 2) / 2); R2(-hw - 0.5, r - 4.5, hw * 2 + 1, 2, '#1e2630'); }
  for (let r = 0; r < 8; r++) { const hw = Math.max(0.5, Math.round(PR[r] * ak * 2) / 2); R2(-hw, r - 4, hw * 2, 1, r === 0 ? '#e6f0f8' : '#aebccc'); if (hw >= 1.5) { R2(kk > 0 ? -hw : hw - 1, r - 4, 1, 1, '#f4faff'); R2(kk > 0 ? hw - 1 : -hw, r - 4, 1, 1, '#6f8194'); } }
  if (ak > 0.55) { R2(-0.5, -2, 1, 4, '#6f8194'); R2(-1.5, -1, 3, 1, '#6f8194'); }   // крестик-заклёпка на лицевой стороне
}
function drawKnife(o, b) {                // предмет «нож»: в духе ключей — крутится на месте в мягком свечении
  const g = Math.max(2, Math.round(S * 0.03)), k = Math.cos(game.time * 3 + o.ph), w = Math.max(1, Math.round(2 * Math.abs(k)));
  const px = Math.round(W / 2 + relU(o, b) * S), py = Math.round(H / 2 - (o.y + 0.05 * Math.sin(game.time * 2.2 + o.ph) - cam.y) * S);
  pixelGlow(px, py, 0.45, 0.09 + 0.04 * Math.sin(game.time * 5), '200,230,255'); ctx.fillStyle = 'rgba(200,230,255,0.18)'; ctx.fillRect(px - g * 4, py - g * 8, g * 8, g * 16);
  const R = (cx, cy, ww, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(px + cx * g), Math.round(py + cy * g), Math.round(ww * g), Math.round(h * g)); };
  R(-w / 2 - 0.5, -8, w + 1, 10, '#3c4654'); R(-w / 2, -7, w, 8, '#aebccc'); R(-w / 2, -7, Math.max(0.5, w / 2), 8, '#e6f0f8'); R(-0.5, -8, 1, 1, '#e6f0f8');   // клинок
  R(-w - 0.5, 1, w * 2 + 1, 1.5, '#2b1a17'); R(-w, 1, w * 2, 1, '#b07a4c'); R(-1, 2.5, 2, 5, '#2b1a17'); R(-0.5, 2.5, 1, 4.5, '#8a5a3a');   // гарда и рукоять
}
function drawHeart(o, b) {
  const g = Math.max(2, Math.round(S * 0.034)), pop = o.born < 0.4 ? Math.sin(o.born / 0.4 * 3.1416) * 0.35 : 0, bt = 1 + 0.12 * Math.max(0, Math.sin(game.time * 5 + o.ph));
  const px = Math.round(W / 2 + relU(o, b) * S), py = Math.round(H / 2 - (o.y + pop + 0.05 * Math.sin(game.time * 2.2 + o.ph) - cam.y) * S), q = Math.max(1, Math.round(g * bt));
  if (o.armor) { if (o.born > 26 && Math.sin(game.time * 22) > 0) return;   // щиток-монетка; перед тем как пропасть, мигает
    const g2 = Math.max(2, Math.round(S * 0.026 * 1.25)); ctx.fillStyle = 'rgba(190,215,240,0.2)'; ctx.fillRect(px - g2 * 5, py - g2 * 6, g2 * 10, g2 * 12); drawShieldCoin(px, py, g2, Math.cos(game.time * 3 + o.ph));
    return; }
  pixelGlow(px, py, 0.42, 0.1 + 0.04 * Math.sin(game.time * 5 + o.ph), '255,70,90');
  const ROWS = ['.XX.XX.', 'XWXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) { const ch = ROWS[r][c]; if (ch === '.') continue; ctx.fillStyle = '#5a0f1c'; ctx.fillRect(px + (c - 3.5) * q - 1, py + (r - 3) * q - 1, q + 2, q + 2); }
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) { const ch = ROWS[r][c]; if (ch === '.') continue; ctx.fillStyle = ch === 'W' ? '#ffd0d6' : r < 2 ? '#ff5468' : '#e02440'; ctx.fillRect(px + (c - 3.5) * q, py + (r - 3) * q, q, q); }
}
function updateProps(dt) {
  updateCogs(dt); updateCams(dt); updateHydrants(dt); for (const c of crates) if (c.zapT > 0) c.zapT -= dt;   /* v301 */
  testTick(dt); updatePuddles(dt); updateItems(dt); updateArms(dt); updateGears(dt); updatePistons(dt); updatePunish(dt); updateTraps(dt); updateSoleChunks(dt); updateBoss(dt); updateTurrets(dt); updateTutor(dt); crateStepUp(); userStepUp(); bossMantle(); updateBossTaxi(dt); updateForkItem(dt); updateForkPulls(dt);
  for (const o of [promItem, knifeItem]) if (o && o.cool > 0) o.cool -= dt;
  { const o = promItem; if (o && !o.got && !(o.cool > 0) && hero.state !== 'dead' && !propHidden(o) && Math.abs(toU(o) - toU(hero)) < 0.4 && o.y > hero.y - 0.25 && o.y < hero.y + 0.9 && takeWeapon(o)) { o.got = true; hero.prom = true; (hero.wStats || (hero.wStats = {})).prom = o.stat || rollStat(); if (o.stat && !o.shown) { o.shown = true; popups.push({ x: o.x, y: o.y + 0.8, z: o.z, text: o.stat.txt, t: 0 }); } hero.promOrb = 4; if (hero.knife) { hero.knife = false; dropStyle('knife'); } if (hero.fork) dropFork(); plog('взял', 'Руки Прометея'); sfx('RobotHit5', 0.5, 0.7); sfx('RUN_1_13', 0.5, 0.5); showCombo('Руки Прометея: кулаки горят и поджигают роботов', true);
      burst(o.x, o.y, o.z, { n: 22, cols: ['#fff4e1', '#ffce46', '#ff7014', '#e8501a'], sp: [0.8, 3.2], up: 1.6, g: 2, life: 0.7 }); updateHUD(); } }
  { const o = knifeItem; if (o && !o.got && !(o.cool > 0) && hero.state !== 'dead' && !propHidden(o) && Math.abs(toU(o) - toU(hero)) < 0.4 && o.y > hero.y - 0.25 && o.y < hero.y + 0.9 && takeWeapon(o)) { o.got = true; hero.knife = true; (hero.wStats || (hero.wStats = {})).knife = o.stat || rollStat(); if (o.stat && !o.shown) { o.shown = true; popups.push({ x: o.x, y: o.y + 0.8, z: o.z, text: o.stat.txt, t: 0 }); } if (hero.prom) { hero.prom = false; dropStyle('prom'); } if (hero.fork) dropFork(); sfx('RobotHit5', 0.5, 2.0); sfx('RUN_1_13', 0.4, 2.4); burst(o.x, o.y, o.z, { n: 14, cols: ['#e6f0f8', '#aebccc', '#fff4e1'], sp: [0.8, 2.6], g: 3, life: 0.6 }); updateHUD(); } }
  for (const o of hearts) if (o.armor) { o.born += dt; if (o.born > 30) o.got = true;
    if (!o.got && o.born > 0.35 && hero.armor < armorCap() && hero.state !== 'dead' && !propHidden(o) && Math.abs(toU(o) - toU(hero)) < 1.25 && o.y > hero.y - 0.6 && o.y < hero.y + 1.2) { const du = toU(hero) - toU(o), st = Math.sign(du) * Math.min(Math.abs(du), 7 * dt); o.x += st * view.r[0]; o.z += st * view.r[1]; o.y += (hero.y + 0.4 - o.y) * Math.min(1, dt * 8); }   // летит к герою сама
    if (!o.got && o.born > 0.35 && hero.armor < armorCap() && hero.state !== 'dead' && !propHidden(o) && Math.abs(toU(o) - toU(hero)) < 0.4 && o.y > hero.y - 0.25 && o.y < hero.y + 0.9) { o.got = true; plog('взял', 'броня'); hero.armor++; popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, t: 0, text: 'Броня +1' }); sfx('RobotHit5', 0.45, 1.7); sfx('RobotHit3', 0.3, 2.4); burst(o.x, o.y, o.z, { n: 12, cols: ['#e6f0f8', '#aebccc', '#fff4e1'], sp: [0.8, 2.6], up: 1.2, life: 0.5 }); updateHUD(); } }
  hearts = hearts.filter(o => !(o.armor && o.got));
  for (const o of hearts) { if (o.armor) continue; o.born += dt; if (!o.got && o.born > 0.3 && hero.state !== 'dead' && !propHidden(o) && Math.abs(toU(o) - toU(hero)) < 0.4 && o.y > hero.y - 0.25 && o.y < hero.y + 0.9) { o.got = true; hero.hp++; game.hpSeen = hero.hp; popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, t: 0, text: '+1 ♥', heal: true }); sfx('RobotHit5', 0.5, 2.2); burst(o.x, o.y, o.z, { n: 16, cols: ['#ff5468', '#ffd0d6', '#e02440'], sp: [0.8, 2.6], up: 1.5, life: 0.6 }); updateHUD(); } }
  for (const o of keyItems) if (!o.got && !o.hid && hero.state !== 'dead' && (o.niche ? hero.hideN && !hero.hideJ && Math.abs(toU(o) - toU(hero)) < 0.55 : !hero.hideN && !propHidden(o) && Math.abs(toU(o) - toU(hero)) < 0.36) && o.y > hero.y - 0.25 && o.y < hero.y + 0.9) {
    o.got = true; plog('взял', o.red ? 'красный ключ' : o.gate ? 'ключ ' + GATE_COL[o.gate][6] : 'ключ'); if (o.tkey) hero.tkey = true; else if (o.red) hero.redKey = true; else if (o.gate) hero.gk[o.gate] = true; else hero.keys++; sfx('RUN_1_13', 0.5, 2.6); sfx('RobotHit3', 0.3, 2.4); burst(o.x, o.y, o.z, { n: o.red ? 20 : 12, cols: o.red ? ['#ff5a3a', '#c0392b', '#fff4e1'] : ['#bff0f0', '#7fd1b0', '#fff4e1'], sp: [0.8, 2.6], g: 3, life: 0.6 }); updateHUD();
  }
  const hu = toU(hero), hd = toD(hero), alive = hero.state !== 'dead';
  for (const v of vents) {
    v.cool = Math.max(0, v.cool - dt); v.t -= dt;
    if (v.t <= 0) { v.t = 0.16; parts.push({ x: v.x + rnd(-0.12, 0.12) * view.r[0], y: v.y + 0.04, z: v.z + rnd(-0.12, 0.12) * view.r[1], vx: 0, vz: 0, vy: rnd(0.5, 1.1), g: 0, drag: 0.8, t: 0, life: rnd(0.4, 0.8), size: 1, col: pick(SMOKE) }); }
    // герой встал на клапан — струя пара подбрасывает его вверх
    if (v.cool <= 0 && alive && hero.onGround && !hero.ride && Math.abs(hero.y - v.y) < 0.02 && Math.abs(toU(v) - hu) < 0.3 && Math.abs(toD(v) - hd) <= DEPTH_TOL) {
      v.cool = 0.7; hero.vy = v.power; hero.onGround = false; hero.jumpUp = false; hero.airJumps = 1; hero.coyote = 0; hero.jumpBuf = 0; go('JumpInRun');
      sfx('RobotHit5', 0.5, 1.6); sfx('RUN_1_13', 0.4, 0.6);
      spawnFx('FxLand', v.x, v.y - 0.03, v.z, { scale: 0.7 }); burst(v.x, v.y + 0.1, v.z, { n: 18, cols: SMOKE, sp: [0.3, 1.4], up: 3.5, g: 0, drag: 3, life: 0.7, size: 2 });
    }
  }
  for (const o of bits) {
    o.born += dt;
    if (!o.got && o.born > 0.4 && alive && !propHidden(o) && Math.abs(toU(o) - hu) < 0.34 && o.y > hero.y - 0.25 && o.y < hero.y + 0.85) {
      o.got = true; bitsGot++; sfx('RUN_1_13', 0.5, 2.4); sfx('RobotHit3', 0.25, 2.2);
      if (bitsGot % shardLife() === 0 && hero.state !== 'dead') { hero.hp++; game.hpSeen = hero.hp; popups.push({ x: hero.x, y: hero.y + 1.0, z: hero.z, t: 0, text: '+1 ♥', heal: true }); sfx('RobotHit5', 0.5, 2.2); burst(hero.x, hero.y + 0.5, hero.z, { n: 14, cols: ['#ffd27a', '#fff4e1', '#e0702e'], sp: [0.8, 2.6], up: 1.5, life: 0.6 }); }   // каждые десять осколков — плюс одна жизнь
      burst(o.x, o.y, o.z, { n: 12, cols: GOLD, sp: [0.8, 2.6], g: 3, life: 0.6 });
      showCombo(bitsGot === bitsTotal ? 'Все осколки собраны!' : 'Осколок ' + bitsGot + ' из ' + bitsTotal, true); updateHUD();
    }
  }
  for (const c of crates) c.shake = Math.max(0, c.shake - dt);
  for (const q of rings) q.t = Math.max(0, q.t - dt);
  for (const g of LEVEL.grips || []) if (g.lit > 0) g.lit = Math.max(0, g.lit - dt * 3);
  for (const q of LEVEL.steams) {       // пар: 1.3 с бьёт, 2.4 с молчит; обжигает и сносит
    const ph = (game.time + q.ph) % 3.7; q.on = ph < 1.3; q.warn = ph > 3.3;
    if (q.on && ph < 0.05 && !q.hiss) { q.hiss = true; sfx('RUN_1_13', 0.25, 0.45); } if (!q.on) q.hiss = false;
  }
  for (const q of jets) { q.t += dt; q.on = q.t < 0.95 && !q.robot.dead; const r = q.robot; q.x = r.x + view.r[0] * ((r.sh || 0) + q.dir * 0.14); q.z = r.z + view.r[1] * ((r.sh || 0) + q.dir * 0.14); q.y = r.y + 0.36; }
  jets = jets.filter(q => q.t < 1.8 && !q.robot.dead);
  for (const q of slashes) q.t += dt; slashes = slashes.filter(q => q.t < 0.16); for (const q of kickArcs) { q.t += dt; if (q.follow && hero.st === 'JumpLegsAttack2') { q.x = hero.x + q.dir * 0.12 * view.r[0]; q.z = hero.z + q.dir * 0.12 * view.r[1]; q.y += (hero.y + 0.25 - q.y) * Math.min(1, dt * 20); } } kickArcs = kickArcs.filter(q => q.t < 0.2);
  updateLamps(dt); updateBolts(dt); updateLifts(dt); updateMovers(dt); updateFinale(dt); updateClouds(dt);
  for (const q of LEVEL.steams.concat(jets)) {
    if (!q.on || hero.state === 'dead' || hero.inDoor || (q.robot ? !reach(q.robot) : q.x * view.n[0] + q.z * view.n[1] < 7)) continue;
    const su = q.x * view.r[0] + q.z * view.r[1], hu = toU(hero);
    for (const o of robots) if (o.burn > 0 && o !== q.robot && Math.abs(toD(o) - (q.x * view.n[0] + q.z * view.n[1])) <= 1.1) { const ou = toU(o) + (o.sh || 0), dr = q.dx * view.r[0] + q.dz * view.r[1];
      if (q.down ? Math.abs(ou - su) < 0.45 && o.y < q.y && o.y + ROBOT_TOP > q.y - 1.75 : (ou - su) * dr > -0.1 && (ou - su) * dr < 1.9 && o.y < q.y + 0.4 && o.y + ROBOT_TOP > q.y - 0.3) { o.burn = 0; burst(o.x, o.y + 0.4, o.z, { n: 10, cols: SMOKE, sp: [0.3, 1.2], up: 1.4, g: 0, drag: 2, life: 0.8, size: 2 }); } }
    if (q.robot && !q.hitR) for (const o of robots) if (o !== q.robot && !o.dead && Math.abs(toD(o) - toD(q.robot)) <= NEAR_D) { const ou = toU(o) + (o.sh || 0), dr = q.dx * view.r[0] + q.dz * view.r[1]; if ((ou - su) * dr > -0.1 && (ou - su) * dr < 1.7 && Math.abs(o.y - q.robot.y) < 0.6) { q.hitR = true; robotHurtRobot(o, 6, Math.sign(dr) || 1); } }
    const douse = () => { if (hero.burn > 0) { hero.burn = 0; sfx('RUN_1_13', 0.5, 0.5); burst(hero.x, hero.y + 0.4, hero.z, { n: 14, cols: SMOKE, sp: [0.3, 1.2], up: 1.4, g: 0, drag: 2, life: 0.8, size: 2 }); showCombo('Пар сбил пламя', true); } };
    if (q.down) {                       // струя сверху вниз: обжигает и прибивает к земле
      if (Math.abs(hu - su) < 0.3 && hero.y < q.y && hero.y + hero.h > q.y - 1.75) { douse(); hurtHero(su + (hu >= su ? -0.2 : 0.2), q.robot ? null : 'пар из трубы'); if (!hero.onGround && !hero.ladder && !hero.hang) hero.vy = Math.min(hero.vy, -3.5); }
      continue;
    }
    const dir = q.dx * view.r[0] + q.dz * view.r[1];
    if (dir !== 0 && (hu - su) * dir > -0.1 && (hu - su) * dir < 1.7 && hero.y < q.y + 0.32 && hero.y + hero.h > q.y - 0.3) { douse(); hurtHero(su - dir * 0.2, q.robot ? null : 'пар из трубы'); }
    if (dir !== 0 && (hu - su) * dir > -0.1 && (hu - su) * dir < 1.7 && hero.y < q.y + 1.1 && hero.y + hero.h > q.y - 0.3) {
      if (!hero.ladder && !hero.hang && !hero.ride) { const nu = hu + Math.sign(dir) * 1.9 * dt, dd = toD(hero); if (!overlapsDepth(nu, hero.y + 0.03, hero.hw, hero.h - 0.06, dd)) setUD(hero, nu, dd); }   // струя ещё и сносит
    }
  }
  updateFireWater(dt);
}
function drawVent(v, b) {
  const g = Math.max(2, Math.round(S * 0.03)), w = Math.round(0.5 * S / g) * g, x0 = Math.round(W / 2 + relU(v, b) * S - w / 2), y0 = Math.round(H / 2 - (v.y - cam.y) * S);
  ctx.fillStyle = '#c9b79c'; ctx.fillRect(x0 - g, y0 - g * 3, w + g * 2, g);
  ctx.fillStyle = '#1a0f14'; ctx.fillRect(x0, y0 - g * 2, w, g * 2);
  ctx.fillStyle = v.cool > 0.4 ? '#bff' : '#3e8e92'; for (let x = x0 + g; x < x0 + w - g; x += g * 2) ctx.fillRect(x, y0 - g * 2, g, g);
}
function drawBit(o, b) {
  const g = Math.max(2, Math.round(S * 0.026)), k = Math.abs(Math.cos(game.time * 3 + o.ph)), h = g * 5, w = Math.max(g, Math.round(5 * k) * g);
  const pop = o.born < 0.4 ? Math.sin(o.born / 0.4 * 3.1416) * 0.35 : 0;
  const px = Math.round(W / 2 + relU(o, b) * S), py = Math.round(H / 2 - (o.y + pop + 0.05 * Math.sin(game.time * 2.2 + o.ph) - cam.y) * S);
  ctx.fillStyle = 'rgba(255,210,122,0.22)'; ctx.fillRect(px - g * 5, py - g * 5, g * 10, g * 10);
  ctx.fillStyle = '#7a4a1c'; ctx.fillRect(px - w / 2 - g, py - h / 2 - g, w + g * 2, h + g * 2);
  ctx.fillStyle = '#ffd27a'; ctx.fillRect(px - w / 2, py - h / 2, w, h);
  ctx.fillStyle = '#fff4e1'; ctx.fillRect(px - w / 2, py - h / 2, Math.max(g, w - g * 2), g);
  ctx.fillStyle = '#f0a63c'; ctx.fillRect(px - w / 2, py + h / 2 - g, w, g);
}
const GATE_COL = { 1: ['#6a4a10', '#e8b530', '#fff0a8', 'rgba(255,214,90,0.22)', '255,214,90', 'Жёлтый', 'жёлтый'], 2: ['#143a6a', '#3f8fe8', '#c4e2ff', 'rgba(90,160,255,0.22)', '90,160,255', 'Синий', 'синий'] };
function keyMark(px, py, g, C) {         // маленький значок ключа: на ящике с ключом и над запертой дверью-перегородкой
  const R = (cx, cy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(px + cx * g), Math.round(py + cy * g), Math.round(w * g), Math.round(h * g)); };
  R(-2.5, -4.5, 5, 9, 'rgba(10,8,16,0.55)'); R(-1.5, -3.5, 3, 3, C[1]); R(-0.5, -2.5, 1, 1, C[0]); R(-0.5, -0.5, 1, 4, C[1]); R(0.5, 1.5, 1, 1, C[1]); R(0.5, 2.5, 1, 1, C[1]); R(-1.5, -3.5, 1, 1, C[2]);
}
const PROPS3 = { crate0: [0, 0, 16, 20], crate1: [18, 0, 16, 19], crate2: [36, 0, 16, 23], barrel0: [54, 0, 14, 22], barrel1: [70, 0, 12, 20], barrel2: [84, 0, 12, 21], ladder: [98, 0, 18, 54], pipeH: [118, 0, 36, 10], pipeV: [156, 0, 10, 36] };   // tools/props_build.py
const crateCache = new Map(), ladderCache = new Map(), wireCache = new Map(); let chainPat = null, chainPatG = 0;
function drawCrate(c, b) {
  const g = Math.max(2, Math.round(0.44 * S / 11)), s = g * 11;
  const x0 = Math.round(W / 2 + relU(c, b) * S - s / 2 + (c.shake > 0 ? Math.sin(c.shake * 90) * g : 0)), y0 = Math.round(H / 2 - (c.y - cam.y) * S) - s;
  const ck = g + '|' + (c.hp < 2 ? 1 : 0); let cv = crateCache.get(ck);
  { const CI = img.Crates; if (CI && CI.width && typeof CRATES2 !== 'undefined') {   // ящики и бочки с нового листа автора: во мху — только снаружи
    const L = CRATES2.filter(q => q.kind !== 'barrel' && (c.y < 2500 || !q.moss)), q = L[c.pv !== undefined ? c.pv % L.length : (c.pv = Math.abs(Math.round(c.x * 7 + c.z * 13 + c.y * 3))) % L.length], r = q.r, gg = Math.max(1, Math.round(S / 40)), dw = r[2] * gg, dh = r[3] * gg, dx = Math.round(x0 + (s - dw) / 2), dy = Math.round(y0 + s - dh);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(CI, r[0], r[1], r[2], r[3], dx, dy, dw, dh);
    if (c.hp < 2) { ctx.fillStyle = '#18141c'; const R = (cx, cy, w, h) => ctx.fillRect(dx + cx * gg, dy + cy * gg, w * gg, h * gg); R(7, 4, 1, 4); R(8, 7, 1, 3); R(6, 10, 1, 3); }
    if (c.key && GATE_COL[c.gate]) keyMark(dx + dw / 2, dy + dh / 2, g, GATE_COL[c.gate]); return; } }
  const P3 = img.props3; if (P3 && P3.width) {   // ящики и бочки из листов автора, упрощённые под стиль
    const pv = c.pv !== undefined ? c.pv : (c.pv = (Math.abs(Math.round(c.x * 7 + c.z * 13 + c.y * 3)) % 6)), q = PROPS3[['crate0', 'crate1', 'crate2', 'crate0', 'crate1', 'crate2'][pv]], k = s / 16, dw = Math.round(q[2] * k), dh = Math.round(q[3] * k), dx = x0 + Math.round((s - dw) / 2), dy = y0 + s - dh;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(P3, q[0], q[1], q[2], q[3], dx, dy, dw, dh);
    if (c.hp < 2) { const R = (cx, cy, w, h) => ctx.fillRect(dx + Math.round(cx * k), dy + Math.round(cy * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))); ctx.fillStyle = '#18141c'; R(7, 4, 1, 4); R(8, 7, 1, 3); R(6, 9, 1, 3); R(7, 12, 1, 2); }   // трещина после первого удара
    if (c.key && GATE_COL[c.gate]) keyMark(dx + dw / 2, dy + dh / 2, g, GATE_COL[c.gate]); return; }
  if (!cv) { cv = document.createElement('canvas'); cv.width = cv.height = s; const x = cv.getContext('2d'), R = (cx, cy, w, h, col) => { x.fillStyle = col; x.fillRect(cx * g, cy * g, w * g, h * g); };
    R(0, 0, 11, 11, '#2b1a17'); R(1, 1, 9, 9, '#8a5a3a'); R(1, 1, 9, 1, '#b07a4c'); R(1, 4, 9, 1, '#5b3a29'); R(1, 7, 9, 1, '#5b3a29');
    for (let i = 2; i < 9; i++) { R(i, i, 1, 1, '#2b1a17'); R(10 - i, i, 1, 1, '#2b1a17'); }
    R(0, 0, 2, 2, '#c9b79c'); R(9, 0, 2, 2, '#c9b79c'); R(0, 9, 2, 2, '#9c8a78'); R(9, 9, 2, 2, '#9c8a78');
    if (c.hp < 2) { R(5, 2, 1, 3, '#1a0f14'); R(6, 4, 1, 2, '#1a0f14'); R(4, 5, 1, 2, '#1a0f14'); }   // трещина после первого удара
    crateCache.set(ck, cv); }
  ctx.drawImage(cv, x0, y0);
  if (c.key && GATE_COL[c.gate]) keyMark(x0 + s / 2, y0 + s / 2, g, GATE_COL[c.gate]);   // в этом ящике ключ
}

// v223 (просьба Алексея): на ящик можно встать. Ящик 0.44 куба — ниже порога шага (STEP_UP), поэтому на него и заходят с ходу, и запрыгивают.
// Сбоку не держит (тонкий, как на картинке), разбили — опоры нет.
const CRATE_H = 0.44;
function crateSupport(u, yFeet, depth, best) {
  for (const c of crates) { if (c.broken || c.tv !== undefined || c.hyd !== undefined || propHidden(c) || Math.abs(toD(c) - depth) > 0.7 || (typeof sideVis === 'function' && sideVis(c) < 0.5)) continue;   /* v311: не нарисован (боковая сторона) — не держит */ const du = u - toU(c); if (Math.abs(du) > 0.3) continue;
    const top = c.y + CRATE_H; if (top <= yFeet + STEP_UP + 0.001 && top > yFeet - 0.6 && (!best || top > best.top)) best = { top, r: c }; }
  return best;
}
function crateStepUp() {   // идёшь в ящик по земле — шагаешь на него сам (как на край до 0.45 куба)
  if (!hero.onGround || hero.hang || hero.ladder || hero.ride || hero.state === 'dead' || Math.abs(hero.vx) < 0.3) return; const hu = toU(hero), d = toD(hero);
  for (const c of crates) { if (c.broken || c.tv !== undefined || c.hyd !== undefined || propHidden(c) || Math.abs(toD(c) - d) > 0.7 || (typeof sideVis === 'function' && sideVis(c) < 0.5)) continue; const du = toU(c) - hu, top = c.y + CRATE_H, rise = top - hero.y;
    if (Math.abs(du) < 0.3 && du * hero.vx > 0 && rise > 0.05 && rise <= 0.46 && !overlapsDepth(hu, top + 0.02, hero.hw, hero.h - 0.04, d)) { hero.y = top; hero.vy = 0; hero.standOn = c; return; } }
}
// ====================== ПРЕДМЕТЫ (сапоги и прочее) ======================
// Предмет лежит на уровне; подобрал — иконка внизу экрана, как в Risk of Rain: наведи мышь — описание.
// Картинка задаётся пиксельной сеткой: одна и та же и в мире, и в полоске предметов.
const ITEM_DEFS = {
  spider: { name: 'Сапоги паука', desc: 'В прыжке оттолкнись от стены: Пробел у стены. Между двумя стенами можно карабкаться вверх. У стены, держа к ней кнопку, скользишь медленнее.',
    pal: { k: '#1a1220', p: '#4a2a5e', q: '#8a5aaa', r: '#e0402a', l: '#2a1a34' },
    px: ['....kkkk....', '...kppppk...', '...kpqppk...', '...kppppk...', '...kprrpk...', '...kpprpk...', '...kppppk...', '..kpppppkk..', '.kpqpppppppk', '.kppppppppppk', '.kkkkkkkkkkkk', '..l.l.l.l.l.', '.l.l.l.l.l..'] },
  hermes: { name: 'Сапоги Гермеса', desc: 'Второй прыжок в воздухе. Без них двойного прыжка нет.',
    pal: { k: '#2a2226', g: '#e8b03a', y: '#ffe08a', w: '#f4f4f0', s: '#a8b4bc' },
    px: ['w.......kkkk.', 'ww.....kggggk', 'sww....kgyggk', '.sww...kggggk', '..swww.kggggk', '...ssw.kgyggk', '......kgggggk', '.....kggggggkk', '....kgyggggggk', '....kgggggggggk', '....kkkkkkkkkkk'] },
  knife: { name: 'Нож', desc: 'Оружие. J — удары ножом, связки с ножом.', weapon: true,
    pal: { k: '#2a2226', b: '#cfd9de', d: '#8f9ca5', h: '#6b4a3a' }, px: ['..k..', '.kbk.', '.kbk.', '.kbdk', '.kbdk', '.kbdk', '.kbdk', 'kkkkk', '.khk.', '.khk.', '.kkk.'] },
  prom: { name: 'Руки Прометея', desc: 'Оружие. Огненные кулаки: J бьёт пламенем, удержать J — огненный шар, рывок оставляет огонь.', weapon: true,
    pal: { k: '#2a2226', o: '#ff7014', y: '#ffce46', s: '#c98a5e', l: '#e8b58a' }, px: ['.o..o..', '.oo.oo.', 'ooyoyoo', '.oyyyo.', 'kkkkkkk', 'kllllsk', 'kssssk.', 'kssssk.', '.kkkk..'] },
};
ITEM_DEFS.fork = { name: 'Вилка', desc: 'Оружие, бьёт током. J — три удара с разрядом. F за спиной робота — вилка в гнездо: робот обездвижен, его трясёт током. Пока держишь — H: крюк притягивает другого робота, оба взрываются.', weapon: true,
  pal: { k: '#2a2226', m: '#8f9ca5', w: '#dfe6ea', b: '#5a4a3e', e: '#8fe8ff' }, px: ['e.m.m.e', '.kmkmk.', '.kmkmk.', '.kwwwk.', '..kwk..', '...m...', '...b...', '...m...', '...b...', '...m...', '...b...', '...m...'] };
/* у каждого оружия свой случайный бонус — выпадает при появлении на карте */
const WSTATS = [{ dmg: 1.2, spd: 1, txt: '+1 урон' }, { dmg: 1, spd: 1.15, txt: '+1 скорость' }, { dmg: 1.4, spd: 1, txt: '+2 урон' }, { dmg: 1.1, spd: 1.08, txt: '+1 урон, +1 скорость' }, { dmg: 1, spd: 1.3, txt: '+2 скорость' }];
const rollStat = () => Object.assign({}, pick(WSTATS));
const heroWpn = () => hero.knife ? (hero.wStats || {}).knife : hero.prom ? (hero.wStats || {}).prom : hero.fork ? (hero.wStats || {}).fork : null;
let itemsOnMap = [];
const itemSvg = {}, itemImg = {};
function itemArt(kind) {          // сетка -> svg (для полоски) и картинка (для мира)
  if (itemSvg[kind]) return itemSvg[kind];
  const d = ITEM_DEFS[kind], w = Math.max(...d.px.map(r => r.length)), h = d.px.length; let s = '';
  d.px.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = d.pal[row[x]]; if (c) s += '<rect x="' + x + '" y="' + y + '" width="1.02" height="1.02" fill="' + c + '"/>'; } });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" shape-rendering="crispEdges">' + s + '</svg>';
  const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); itemImg[kind] = { im, w, h };
  return itemSvg[kind] = svg;
}
function spawnItems() {
  itemsOnMap = (LEVEL.items || []).map(v => ({ kind: v.kind, x: v.x, y: v.y, z: v.z, got: false, ph: rnd(0, 6) }));
  hero.items = {}; if (typeof talApplyItems === 'function') talApplyItems(); updateItemsBar();   /* v301: таланты двойного прыжка и толчка */
}
function giveItem(kind) {
  hero.items[kind] = (hero.items[kind] || 0) + 1; plog('взял', ITEM_DEFS[kind].name); sfx('RUN_1_13', 0.5, 1.6); sfx('RobotHit5', 0.25, 2.2);
  showCombo(ITEM_DEFS[kind].name + ': ' + ITEM_DEFS[kind].desc.split('.')[0], true); updateItemsBar();
}
function updateItems(dt) {
  for (const o of itemsOnMap) { if (o.got || hero.state === 'dead' || propHidden(o)) continue;
    if (Math.abs(toU(o) - toU(hero)) < 0.45 && o.y > hero.y - 0.3 && o.y < hero.y + 0.95) { o.got = true; giveItem(o.kind); burst(o.x, o.y, o.z, { n: 14, cols: ['#fff4e1', '#ffe08a', '#c9d2d8'], sp: [0.8, 2.6], up: 1.2, life: 0.5 }); } }
}
function drawItem(o, b) {
  itemArt(o.kind); const A = itemImg[o.kind]; if (!A.im.complete) return;
  const g = 3, px = Math.round(W / 2 + relU(o, b) * S), py = Math.round(H / 2 - (o.y + 0.06 * Math.sin(game.time * 2.2 + o.ph) - cam.y) * S);
  pixelGlow(px, py, 0.45, 0.08 + 0.04 * Math.sin(game.time * 5 + o.ph), o.kind === 'hermes' ? '255,224,138' : '170,120,220');
  ctx.imageSmoothingEnabled = false; ctx.drawImage(A.im, Math.round(px - A.w * g / 2), Math.round(py - A.h * g / 2), A.w * g, A.h * g);
}
function updateItemsBar() {
  const el = document.getElementById('items'); if (!el) return; let h = '';
  for (const k of ['knife', 'prom', 'fork']) if (hero[k]) { const d = ITEM_DEFS[k], st = (hero.wStats || {})[k];
    h += '<div class="item wpn" tabindex="0">' + itemArt(k) + '<div class="tip"><b>' + d.name + (st ? ' <i>' + st.txt + '</i>' : '') + '</b>' + d.desc + '</div></div>'; }
  for (const k of Object.keys(hero.items || {})) { const d = ITEM_DEFS[k], n = hero.items[k];
    h += '<div class="item" tabindex="0">' + itemArt(k) + (n > 1 ? '<em>×' + n + '</em>' : '') + '<div class="tip"><b>' + d.name + '</b>' + d.desc + '</div></div>'; }
  if (el._h !== h) { el._h = h; el.innerHTML = h; el.hidden = !h; } if (typeof talHudSync === 'function') talHudSync();
}
// касается стены сбоку на своей глубине? (для сапог паука)
function wallSide() {
  const u = toU(hero), d = toD(hero);
  for (const s of [hero.face, -hero.face]) if (overlapsDepth(u + s * 0.07, hero.y + 0.05, hero.hw, hero.h - 0.1, d)) return s;
  return 0;
}

// оружие: если рук свободны — подбирается само; если уже что-то в руках — над вещью подсказка G, и меняется только по нажатию
const hasWeapon = () => !!(hero.knife || hero.prom || hero.fork);
function takeWeapon(o) { if (!hasWeapon()) return true; game.takeHint = o; if (pressed.has('take')) { pressed.delete('take'); return true; } return false; }
function drawTakeHint(b) { const o = game.takeHint; game.takeHint = null; if (!o || o.got) return; const g = Math.max(3, Math.round(S * 0.045)), px = Math.round(W / 2 + relU(o, b) * S), py = Math.round(H / 2 - (o.y + 0.75 - cam.y) * S); drawKeycap(px, py - g * 8, g, 'G', true); }
// ====================== РУКИ ТИТАНА ======================
// Две руки висят из плеч по бокам корпуса (плечи над тазом, снаружи ног). Видны и живут, когда камера смотрит с востока или запада:
// тогда обе ноги стоят рядом, а руки — слева и справа от них, как на концепте «вид спереди».
// Рука: плечевой шарнир, плечо, локоть, предплечье, ладонь и четыре пальца. Качается в такт шагам, пальцы медленно сжимаются.
// На руке — выступы-площадки: на них можно запрыгнуть и ехать. Иногда рука замахивается на героя: замах с красным светом в ладони
// (больше секунды), быстрый удар, потом рука отдыхает — тогда по ней легко забраться. От удара уходят на F.
const ARM_CFG = { ys: 61, L1: 15, L2: 12, palm: 7, fing: 7, w1: 7, w2: 7, wp: 11, x0: -3, x1: 3 };
let arms = [];
function makeArm(side) {                 // side: +1 — рука со стороны первой ноги (z > 0), -1 — с дальней стороны (за второй ногой)
  const sh = (LEVEL.shoulders || []).find(q => q.side === side), zs = sh ? sh.z : side > 0 ? 13 : -37; if (sh) ARM_CFG.ys = sh.y; const A = { side, zs, a1: 0, a2: 0, curl: 0.3, sw: null, cool: rnd(16, 26), ledges: [], tw: 0 };
  // площадки — те самые выступы с мхом, что собраны на кубах руки (группы плеча и предплечья)
  for (const G of LEVEL.armGroups || []) { const seg = G.part === 'upper' + side ? 'u' : G.part === 'fore' + side ? 'f' : null; if (!seg) continue;
    for (const L of G.ledges) { const w = typeof G.hw === 'function' ? G.hw(L.r) : G.hw; A.ledges.push({ arm: A, seg, lz: L.o * (w + (L.n + 1) / 2), ly: -L.r + 1, w: L.n + 0.2, u: 0, y: 0, x: 0, z: 0, du: 0, dy: 0, isArm: true }); } }
  return A;
}
function spawnArms() { arms = LEVEL.torsoY ? [makeArm(1), makeArm(-1)] : [];
  // v277 (Алексей 20.10: «огромные шестерни на руке обязательно осязаемые и ведут себя как остальные»): шарниры плеча и локтя — настоящие колёса
  // (в списке gears): встать сверху — везёт, у края съезжаешь, хват за зубец; колесо едет вместе с рукой. Рисуются в руке (drawJoint).
  for (const A of arms) { A.jg = [5.2, 3.4].map((R, i) => ({ x: 0, y: 0, z: 0, f: 1, R, rust: 1, armJ: A, ji: i, ang: rnd(0, 6.28), om: 0, on: false, extra: 0, drive: (i ? -1 : 1) * A.side * 0.35 })); gears.push(...A.jg); }
  for (const A of arms) A.segO = { u: { arm: A, isArm: true, seg: 'u' }, f: { arm: A, isArm: true, seg: 'f' }, p: { arm: A, isArm: true, seg: 'p' } }; }
// v279 (Алексей 20.10: «когда падаешь с робота — попадаешь в темноту»): на руке у героя оставалась прежняя глубина — сойдя с руки,
// он падал внутрь корпуса (за кубы, в темноту). Пока герой на руке (стоит на ней, на колесе-шарнире, на предмете руки, висит на пальце,
// лезет по лестнице/трубе руки), его глубина — перед всеми кубами под ним: сошёл — падает перед титаном и встаёт на то, что видно.
function armHeroDepth() {
  const so = hero.standOn, hg = hero.hang, on = (so && (so.isArm || so.armJ || so.armP)) || (hg && (hg.finger || (hg.gear && hg.gear.armJ) || (hg.grip && hg.grip.armP))) || (hero.ladder && hero.ladder.armP);
  if (!on || hero.state === 'dead') return; const u = toU(hero), d = toD(hero); let md = -1e9;
  for (let U = Math.round(u - hero.hw) - 1; U <= Math.round(u + hero.hw) + 1; U++) for (let Y = Math.floor(hero.y) - 3; Y <= Math.floor(hero.y + hero.h) + 1; Y++) { const a = cellAt(U, Y); if (a && a.length && a[0].dep > md) md = a[0].dep; }
  if (md > -1e8 && d < md + 1) setUD(hero, u, md + 1);
}
// v277: тело руки твёрдое — плечо, предплечье, ладонь: прямоугольники вдоль кости (в плоскости руки, z–y). В них упираешься, сверху на них стоишь.
function armSegs(A, pose) { const C = ARM_CFG, th3 = armTh3(A, pose), pe = armTW(A, pose.Wr, th3, 0, -C.palm);
  return [{ k: 'u', p0: pose.S, p1: pose.E, w: C.w1 }, { k: 'f', p0: pose.E, p1: pose.Wr, w: C.w2 }, { k: 'p', p0: pose.Wr, p1: pe, w: C.wp }]; }
function armSegFrame(sg) { const dz = sg.p1.z - sg.p0.z, dy = sg.p1.y - sg.p0.y, len = Math.hypot(dz, dy) || 1, a = [dz / len, dy / len]; return { len, a, n: [-a[1], a[0]] }; }
function armLocal(sg, z, y) { const F = armSegFrame(sg), rz = z - sg.p0.z, ry = y - sg.p0.y; return { t: rz * F.a[0] + ry * F.a[1], s: rz * F.n[0] + ry * F.n[1], F }; }
function armWorld(sg, t, s) { const F = armSegFrame(sg); return { z: sg.p0.z + F.a[0] * t + F.n[0] * s, y: sg.p0.y + F.a[1] * t + F.n[1] * s }; }
function armBodyPush(A, pose) {   // герой внутри тела руки — наружу, в ближнюю сторону (если там не куб)
  if (hero.state === 'dead' || hero.inDoor || hero.ladder || hero.ride || (hero.hang && (hero.hang.finger || hero.hang.gear))) return; const r1 = view.r[1];
  for (const sg of armSegs(A, pose)) { const hz = toU(hero) * r1, hy = hero.y + hero.h / 2, L = armLocal(sg, hz, hy), F = L.F, half = sg.w / 2 + Math.abs(F.n[0]) * hero.hw + Math.abs(F.n[1]) * hero.h / 2;
    if (L.t < 0.2 || L.t > F.len - 0.2 || Math.abs(L.s) >= half) continue;
    const sd = L.s >= 0 ? 1 : -1, nz = hz + F.n[0] * (sd * half - L.s), ny = hy + F.n[1] * (sd * half - L.s), nu = nz * r1, nyF = ny - hero.h / 2, d = toD(hero);
    if (overlapsDepth(nu, nyF + 0.02, hero.hw, hero.h - 0.04, d)) continue; setUD(hero, nu, d); hero.y = nyF;
    const pn = [F.n[0] * sd * r1, F.n[1] * sd]; if (hero.vx * pn[0] < 0) hero.vx = 0; if (pn[1] > 0.4 && hero.vy < 0) hero.vy = 0; if (pn[1] < -0.4 && hero.vy > 0) hero.vy = 0; }
}   /* пока новый титан не собран — рук нет */
const armVisible = () => Math.abs(view.r[1]) > 0.5 && !view.rotating;
// точки руки в плоскости (z, y): плечо S, локоть E, запястье Wr; углы считаются от вертикали, плюс — наружу
function armPose(A) {
  const C = ARM_CFG, s = A.side, S0 = { z: A.zs, y: C.ys }, E = { z: S0.z + Math.sin(A.a1) * C.L1 * s, y: S0.y - Math.cos(A.a1) * C.L1 }, a = A.a1 + A.a2;
  const Wr = { z: E.z + Math.sin(a) * C.L2 * s, y: E.y - Math.cos(a) * C.L2 }, P = { z: Wr.z + Math.sin(a) * C.palm * 0.5 * s, y: Wr.y - Math.cos(a) * C.palm * 0.5 };
  return { S: S0, E, Wr, P, a };
}
const armTW = (A, P, th, lz, ly) => ({ z: P.z + A.side * (lz * Math.cos(th) - ly * Math.sin(th)), y: P.y + lz * Math.sin(th) + ly * Math.cos(th) });   // точка группы -> мир
function armLedgePos(A, L, pose) { return L.seg === 'u' ? armTW(A, pose.S, A.a1, L.lz, L.ly) : armTW(A, pose.E, pose.a, L.lz, L.ly); }
function armIK(A, tz, ty) {
  const C = ARM_CFG, X = (tz - A.zs) * A.side, Y = ty - C.ys, d = Math.hypot(X, Y); if (d > C.L1 + C.L2 - 0.2 || d < Math.abs(C.L1 - C.L2) + 0.5) return null;
  const c2 = (d * d - C.L1 * C.L1 - C.L2 * C.L2) / (2 * C.L1 * C.L2), phi = Math.atan2(X, -Y); let best = null;
  for (const sg of [1, -1]) { const a2 = sg * Math.acos(Math.max(-1, Math.min(1, c2))), a1 = phi - Math.atan2(C.L2 * Math.sin(a2), C.L1 + C.L2 * Math.cos(a2)), ex = Math.sin(a1) * C.L1; if (!best || ex > best.ex) best = { a1, a2, ex }; }
  return best;
}
const C0 = ARM_CFG;
function updateArms(dt) {
  if (game.armGap > 0) game.armGap -= dt;
  const T = CFG.stepTime, p = (game.stepT % T) / T, hu = toU(hero), vis = armVisible();
  for (const A of arms) {
    // в такт шагам: руки качаются в противофазе ногам, локоть чуть сгибается, пальцы медленно сжимаются и разжимаются
    let a1 = 0.07 * Math.sin(p * 6.2832 + (A.side > 0 ? 0.6 : Math.PI + 0.6)) + 0.03 - (game.sway || 0) * 0.05 * A.side, a2 = 0.06 + 0.04 * Math.sin(p * 6.2832 + 1.2), curl = 0.35 + 0.25 * Math.sin(game.time * 0.7 + A.side);
    const pose0 = armPose(A), hand = pose0.P, handU = hand.z * view.r[1], dU = hu - handU;
    // удар рукой: замах — кисть поднимается над героем, в ладони разгорается красный свет; потом рука обрушивается туда, где герой стоял;
    // после удара кисть лежит на уступе пару секунд — по ней можно пройти — и медленно возвращается
    // v278 (план рук, шаг 3): ладонь-лифт — рука сгибается, предплечье и ладонь ложатся ровно (ладонью вверх), ждёт, потом медленно
    // поднимается к плечу и опускается обратно: на ладони и предплечье можно ехать (тело руки твёрдое, везёт)
    // v280 (Алексей 21.10: «пока перс на руке, она его не бьёт — рука немного машет, и надо бежать по плоскости, чтобы не упасть, или зацепиться»):
    // герой на этой руке (в её куске, 13i_armworld.js) — ни удара, ни замаха: рука медленно раскачивается наружу-внутрь, кисть гуляет
    const onMe = hero.arm && hero.arm.w.A === A;
    if (onMe) { A.sw = null; A.lf = null; A.rest = false; A.cool = Math.max(A.cool, 5); const t = game.time * 0.8 + A.side * 1.3; a1 = 0.04 + 0.3 * Math.sin(t); a2 = 0.1 + 0.12 * Math.sin(t * 1.3 + 1); curl = 0.4;
      // v283 (план рук: «круто — не устоять, перевернуло — держишься только за уступ, трубу, ухват»): раз в 10–16 с рука стряхивает героя —
      // дрожит (предупреждение «Держись!»), резко запрокидывается почти на 60°, держит и возвращается. Стоял — съедешь; на лестнице, трубе, ухвате, колесе — удержишься
      if (A.bigT === undefined) A.bigT = rnd(8, 12); if (!A.big) { A.bigT -= dt; if (A.bigT <= 0) { A.big = { t: 0, s: Math.random() < 0.5 ? 1 : -1 }; popups.push({ x: hero.x, y: hero.y + 1.2, z: hero.z, text: 'Держись!', t: 0 }); sfx('RobotDeathD', 0.4, 0.55); } }
      if (A.big) { const B = A.big; B.t += dt; const k = B.t, env = k < 0.9 ? 0 : k < 1.6 ? (k - 0.9) / 0.7 : k < 3.3 ? 1 : k < 4.4 ? 1 - (k - 3.3) / 1.1 : 0;
        if (k < 0.9) game.shake = Math.max(game.shake, 0.06); a1 = a1 * (1 - env) + (0.04 + B.s * 0.95) * env; a2 = a2 * (1 - env) + 0.05 * env;
        if (k > 4.4) { A.big = null; A.bigT = rnd(10, 16); } } }
    else { A.big = null; A.bigT = undefined; }
    if (!A.sw && !onMe) { A.cool -= dt;
      const riding = !!hero.arm || (hero.hang && hero.hang.finger) || (game.armGap > 0);   // висит на пальцах или стоит на другой руке — не бьёт; после удара одной рукой другая выжидает
      if (false) {}
      else if (vis && A.cool <= 0 && !riding && hero.state !== 'dead' && !hero.inDoor && Math.abs(dU) < 12 && !(game.finishT > 0) && armIK(A, hero.z * 0 + toU(hero) * view.r[1], hero.y + 0.6)) {
        A.pick = null; A.sw = { t: 0, hit: false, dodged: false, u: handU, A, tz: toU(hero) * view.r[1], ty: hero.y }; sfx('RobotDeathD', 0.45, 0.4); popups.push({ x: hero.x, y: hero.y + 1.2, z: hero.z, text: 'Рука! F', t: 0 }); } }
    if (A.sw) { const W2 = A.sw; W2.t += dt; const k = W2.t;
      if (k < 0.95) { W2.tz = toU(hero) * view.r[1]; W2.ty = hero.y; }   // целится, пока не замахнулась до конца
      W2.u = W2.tz * view.r[1];
      const up = armIK(A, W2.tz + A.side * 1.2, W2.ty + 1.9 + C0.palm) || armIK(A, W2.tz, W2.ty + 1.2 + C0.palm), down = armIK(A, W2.tz, W2.ty + C0.palm * 0.55);
      if (k < 1.2) { if (up) { a1 = up.a1; a2 = up.a2; } curl = 0.95; }                       // замах: кулак над героем
      else if (k < 1.42) { const e = Math.min(1, (k - 1.2) / 0.22); if (up && down) { a1 = up.a1 + (down.a1 - up.a1) * e * e; a2 = up.a2 + (down.a2 - up.a2) * e * e; } curl = 0.2;   // удар
        if (!W2.hit && e > 0.6) { const P2 = armPose(Object.assign({}, A, { a1, a2 })).P, du = hu - P2.z * view.r[1], dy = hero.y + 0.3 - P2.y;
          if (Math.abs(du) < 2.4 && dy > -1.5 && dy < 2.2 && !(hero.invuln > 0) && !W2.dodged) { W2.hit = true; const aw = Math.sign(hu - A.zs * view.r[1]) || 1; hurtHero(hu - aw, 'рука титана'); hero.vx = aw * 3.5; hero.vy = 4.5; game.shake = Math.max(game.shake, 0.3); sfx('RobotHit5', 0.9, 0.5); } } }
      else if (k < 3.6) { if (down) { a1 = down.a1; a2 = down.a2; } curl = 0.15; A.rest = true; }   // лежит на уступе
      else if (k < 4.8) { const e = (k - 3.6) / 1.2; if (down) { a1 = down.a1 + (a1 - down.a1) * e; a2 = down.a2 + (a2 - down.a2) * e; } A.rest = false; }
      else { A.sw = null; A.rest = false; A.cool = rnd(20, 32); game.armGap = 12; }
      if (k > 1.32 && k - dt <= 1.32) { sfx('RobotHit5', 0.8, 0.35); sfx('Jump_4_landfall', 0.9, 0.4); game.shake = Math.max(game.shake, 0.22); const P2 = armPose(Object.assign({}, A, { a1, a2 })).P; burst(0, P2.y - 1.8, P2.z, { n: 30, cols: DIRT, sp: [1.5, 5], up: 1.4, life: 0.7, size: 2 }); } }
    // плавно к целевой позе
    const kk = 1 - Math.exp(-dt * (A.sw && A.sw.t > 1.2 && A.sw.t < 1.45 ? 40 : A.sw ? 7 : onMe ? (A.big ? 3 : 1.5) : 6)); A.a1 += (a1 - A.a1) * kk; A.a2 += (a2 - A.a2) * kk; A.curl += (curl - A.curl) * (1 - Math.exp(-dt * 5));
    const pose = armPose(A);
    (A.jg || []).forEach((G, i) => { const c = i ? pose.E : pose.S, du = (c.z - G.z) * view.r[1], dy = c.y - G.y, moved = G.inited; G.z = c.z; G.y = c.y; G.x = 0; G.inited = true; if (view.k === 1 || view.k === 3) G.f = view.k;
      if (moved && hero.standOn === G && vis && hero.onGround) { const nu = toU(hero) + du; if (!overlapsDepth(nu, hero.y + dy, hero.hw, hero.h, toD(hero))) { setUD(hero, nu, toD(hero)); hero.y += dy; } } });
    if (A === arms[arms.length - 1]) armWTick(dt);   // v280: герой входит в кусок руки и выходит из него, съезжает при наклоне
  }
}
// опоры для героя: верх площадок на руках (только когда руки видны)
function armSupport(u, yFeet, best) {
  return best;   // v280: тело руки — в своём куске (13i_armworld.js), в мире опор у руки нет (кроме колёс-шарниров)
  if (!armVisible()) return best;
  for (const A of arms) if (A.segO) { const pose = armPose(A); for (const sg of armSegs(A, pose)) { const F = armSegFrame(sg), sd = F.n[1] >= 0 ? 1 : -1; if (Math.abs(F.a[0]) < 0.35 || F.n[1] * sd < 0.3) continue;   // v277: верх тела руки (не отвесный) — опора
      const z = u * view.r[1], t = (z - sg.p0.z - F.n[0] * sd * sg.w / 2) / F.a[0]; if (t < 0 || t > F.len) continue; const top = sg.p0.y + F.n[1] * sd * sg.w / 2 + F.a[1] * t;
      if (top <= yFeet + STEP_UP + 0.02 && top > yFeet - 0.6 && (!best || top > best.top)) best = { top, r: A.segO[sg.k] }; } }
  for (const A of arms) for (const J of A.jl || []) { const du = u - J.cu; if (Math.abs(du) > J.R * 0.85) continue; const top = J.cy + Math.sqrt(J.R * J.R - du * du);
    if (top <= yFeet + STEP_UP + 0.02 && top > yFeet - 0.6 && (!best || top > best.top)) best = { top, r: J }; }
  for (const A of arms) for (const L of A.ledges) { if (L.seg === 'h' && !A.rest) continue; if (Math.abs(u - L.u) > L.w / 2 + 0.05) continue; if (L.y <= yFeet + STEP_UP + 0.02 && L.y > yFeet - 0.6 && (!best || L.y > best.top)) best = { top: L.y, r: L }; }
  return best;
}
// угроза для подсказки F
function armThreat() {
  for (const A of arms) { const W2 = A.sw; if (!W2 || W2.dodged || W2.hit || W2.t > 1.6 || !armVisible()) continue; return { r: null, A: W2, tti: Math.max(0, 1.45 - W2.t), u: W2.u, span: 1.45 }; }
  return null;
}
// ---- рисование: сегменты из плиток стены, повернутые вдоль кости; шарнир-диск в плече; пальцы; кабели; площадки
function drawArmSeg(b, z0, y0, z1, y1, wid, wp, al) {
  const X0 = W / 2 + relU({ x: 0, z: z0 }, b) * S, Y0 = H / 2 - (y0 - cam.y) * S, X1 = W / 2 + relU({ x: 0, z: z1 }, b) * S, Y1 = H / 2 - (y1 - cam.y) * S;
  const len = Math.hypot(X1 - X0, Y1 - Y0), ang = Math.atan2(X1 - X0, Y1 - Y0), ws = wid * S * Math.max(0.15, Math.abs(b.r[1]));
  if (Math.max(Y0, Y1) < -ws || Math.min(Y0, Y1) > H + ws || Math.max(X0, X1) < -ws || Math.min(X0, X1) > W + ws) return;
  ctx.save(); ctx.globalAlpha = al; ctx.translate(Math.round(X0), Math.round(Y0)); ctx.rotate(-ang); ctx.imageSmoothingEnabled = false;
  const n = Math.ceil(len / S), m = Math.max(1, Math.round(ws / S));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const t = wallTile({ wp: (wp + i * 3 + j * 7) % 12, sl: (i + j) % 3 === 0 ? 1 : 0, sb: i % 2 }); const hh = Math.min(S, len - i * S); ctx.drawImage(t, 0, 0, TS, TS * hh / S, -ws / 2 + j * ws / m, i * S, ws / m + 0.5, hh + 0.5); }
  ctx.fillStyle = 'rgba(22,20,34,0.45)'; ctx.fillRect(-ws / 2, 0, ws, len);   /* в тени, как боковые грани ноги */
  ctx.fillStyle = 'rgba(10,8,16,0.35)'; ctx.fillRect(-ws / 2, 0, Math.max(3, ws * 0.12), len); ctx.fillStyle = 'rgba(255,240,220,0.08)'; ctx.fillRect(ws / 2 - Math.max(3, ws * 0.1), 0, Math.max(3, ws * 0.1), len);   // объём: тень слева, блик справа
  ctx.fillStyle = '#2a2226'; ctx.fillRect(-ws / 2, 0, ws, 3); ctx.fillRect(-ws / 2, len - 3, ws, 3);
  ctx.restore();
}
function drawJoint(b, z, y, r, al, ang) {   // шарнир руки — огромная шестерня в стиле наших колёс; поворачивается вместе с суставом
  const X = Math.round(W / 2 + relU({ x: 0, z }, b) * S), Y = Math.round(H / 2 - (y - cam.y) * S), R = r * S, g = Math.max(3, Math.round(S * 0.06));
  if (Y < -R * 1.2 || Y > H + R * 1.2 || X < -R * 1.2 || X > W + R * 1.2) return; ctx.save(); ctx.globalAlpha = al; ctx.imageSmoothingEnabled = false;
  const st = ((Math.round((ang || 0) / (Math.PI * 2) * 32) % 32) + 32) % 32, fr = gearFrameNear(r, 1, st);
  if (fr && fr.width) { const w = fr.width * S / GEAR_PX, sx = Math.min(1, Math.abs(b.r[1])); ctx.drawImage(fr, Math.round(X - w * sx / 2), Math.round(Y - w / 2), Math.round(w * sx), Math.round(w)); }
  { const r2 = Math.round(r * 0.36 * 10) / 10, st2 = ((Math.round(-(ang || 0) * 2.4 / (Math.PI * 2) * 32) % 32) + 32) % 32, f2 = gearFrameNear(r2, 0, st2); if (f2 && f2.width) { const w = f2.width * S / GEAR_PX, sx = Math.min(1, Math.abs(b.r[1])); ctx.drawImage(f2, Math.round(X - w * sx / 2), Math.round(Y - w / 2), Math.round(w * sx), Math.round(w)); } }   /* в середине — шестерня поменьше, крутится навстречу */
  ctx.restore();
}
// группа кубов руки рисуется той же кистью, что и стены ноги, но повёрнутой вокруг своего шарнира P на угол th
function armGroupFaces(G) { if (G.src !== faces) { G.src = faces; G.faces = faces.filter(f => f.y <= G.gy && f.y >= G.gy - G.rows - 1); } return G.faces; }
function drawArmGroup(A, G, b, P, th, al) {
  const k = A.side * b.r[1], Xp = W / 2 + relU({ x: 0, z: P.z }, b) * S, Yp = H / 2 - (P.y - cam.y) * S, R = (G.rows + 8) * S;
  if (Xp < -R || Xp > W + R || Yp < -R || Yp > H + R * 0.2 + G.rows * S) return;
  const list = []; for (const f of armGroupFaces(G)) { const w = f.nx * b.n[0] + f.nz * b.n[1];   /* v280: z в группе — как в мире */ if (w < 0.02) continue; f._u = b.r[1] * f.cz + f.cx * b.r[0]; f._d = (f.cx - cam.x) * b.n[0]; f._w = w; list.push(f); }
  list.sort((p, q) => p._d - q._d);
  ctx.save(); ctx.globalAlpha = al; const c = Math.cos(th), sn = Math.sin(th); ctx.transform(c, -k * sn, k * sn, c, Xp, Yp); drawFaceList(list, 0, 0, G.gy); ctx.restore();
}
// за что на пальцах можно повиснуть: средний сустав и кончик каждого пальца, кончик большого
const armTh3 = (A, P) => P.a + (A.sw && A.sw.t > 1.2 && A.sw.t < 1.5 ? -0.3 : 0.08 * Math.sin(game.time * 0.9 + A.side));
function armGrips(A) {
  const C = ARM_CFG, P = armPose(A), th3 = armTh3(A, P), cu = A.curl, PB = (lz, ly) => armTW(A, P.Wr, th3, lz, ly), out = [];
  for (let f = 0; f < 3; f++) { const base = PB(-4 + f * 4, -C.palm), t1 = th3 - cu * (0.7 + f * 0.15), mid = armTW(A, base, t1, 0, -4), t2 = t1 - cu * 0.6, tip = armTW(A, mid, t2, 0, -3); out.push(mid, tip); }
  { const tb = PB(-5.5, -2), ta = th3 - 0.7 - cu * 0.6; out.push(armTW(A, tb, ta, 0, -4)); }
  return out;
}
// в прыжке рука героя рядом с пальцем — хватается и висит; палец двигается — герой с ним
function tryFingerGrab() {
  if (!armVisible() || hero.onGround || hero.hang || hero.ride || hero.ladder || hero.hangCool > 0 || hero.state === 'dead' || hero.inDoor) return false;
  const hu = toU(hero), hy = hero.y + HAND_Y;
  for (const A of arms) { const G = armGrips(A); for (let i = 0; i < G.length; i++) { const q = G[i], gu = q.z * view.r[1];
    if (Math.abs(gu - hu) < 0.5 && hy > q.y - 0.45 && hy < q.y + 0.35) { const dir = Math.sign(gu - hu) || hero.face;
      hero.hang = { U: Math.round(gu), T: q.y, dir, finger: { A, i }, pu: gu, py: q.y, vu: 0, vy: 0 }; hero.vx = hero.vy = 0; hero.hook = null; hero.hookAir = false; hero.face = dir; hero.hangPop = 0; go('Take');
      sfx('RobotHit3', 0.3, 1.4); return true; } } }
  return false;
}
function updateFingerHang(dt, ax) {
  const hg = hero.hang, A = hg.finger.A, q = armGrips(A)[hg.finger.i], gu = q.z * view.r[1];
  hg.vu = (gu - hg.pu) / Math.max(dt, 1e-4); hg.vy = (q.y - hg.py) / Math.max(dt, 1e-4); hg.pu = gu; hg.py = q.y;   // скорость пальца: прыжок с него — с разгоном
  const nu = gu - hg.dir * 0.12, ny = q.y - HANG_Y, d = toD(hero);
  if (!armVisible() || overlapsDepth(nu, ny, hero.hw, hero.h, d)) { hero.hang = null; hero.hangCool = 0.5; go('Fly'); return; }   // палец ушёл в стену — сорвался
  setUD(hero, nu, d); hero.y = ny;
  if (pressed.has('jump')) { hero.hang = null; hero.airJumps = 1; hero.vy = 5 + Math.max(0, hg.vy) * 0.5; hero.vx = (ax || hg.dir) * 2.2 + Math.max(-6, Math.min(6, hg.vu * 0.8)); hero.jumpUp = true; hero.jumpStart = game.time; hero.hangCool = 0.45; go('JumpInRun'); }
  else if (pressed.has('sit')) { hero.hang = null; hero.hangCool = 0.5; hero.vx = Math.max(-6, Math.min(6, hg.vu * 0.8)); go('Fly'); }
  hero.anim.update(dt);
}
function drawArm(A, b) {
  const al = Math.min(1, (Math.abs(b.r[1]) - 0.3) / 0.5); if (al <= 0) return;
  const C = ARM_CFG, P = armPose(A), Gs = {}; for (const G of LEVEL.armGroups || []) Gs[G.part] = G; const sd = A.side;
  const th3 = armTh3(A, P), Wr = P.Wr;
  // пальцы и большой палец — за ладонью, ладонь, предплечье, плечо
  const cu = A.curl, PB = (lz, ly) => armTW(A, Wr, th3, lz, ly);
  for (let f = 0; f < 3; f++) { const base = PB(-4 + f * 4, -C.palm), t1 = th3 - cu * (0.7 + f * 0.15), mid = armTW(A, base, t1, 0, -4), t2 = t1 - cu * 0.6;
    if (Gs['f' + f + 'b' + sd]) drawArmGroup(A, Gs['f' + f + 'b' + sd], b, mid, t2, al); if (Gs['f' + f + 'a' + sd]) drawArmGroup(A, Gs['f' + f + 'a' + sd], b, base, t1, al); }
  if (Gs['th' + sd]) drawArmGroup(A, Gs['th' + sd], b, PB(-5.5, -2), th3 - 0.7 - cu * 0.6, al);
  if (Gs['palm' + sd]) drawArmGroup(A, Gs['palm' + sd], b, Wr, th3, al);
  if (Gs['fore' + sd]) drawArmGroup(A, Gs['fore' + sd], b, P.E, P.a, al);
  if (Gs['upper' + sd]) drawArmGroup(A, Gs['upper' + sd], b, P.S, A.a1, al);
  // замах: в ладони разгорается красный свет
  if (A.sw && A.sw.t < 1.3) { const k = Math.min(1, A.sw.t / 1.0), q = PB(0, -C.palm / 2), X = W / 2 + relU({ x: 0, z: q.z }, b) * S, Y = H / 2 - (q.y - cam.y) * S; pixelGlow(X, Y, 3.2, 0.12 * k * (0.8 + 0.2 * Math.sin(game.time * 30)), '255,50,30'); }
  drawJoint(b, P.E.z, P.E.y, 3.4, al, A.jg ? A.jg[1].ang : A.a2 * 4 * A.side + 0.3); drawJoint(b, P.S.z, P.S.y, 5.2, al, A.jg ? A.jg[0].ang : -A.a1 * 3 * A.side);
  armWDrawAll(A, b, al);   /* v280: что стоит на кусках руки (лестницы, ухваты, лампы…) и герой, если он на руке */   /* v277: поворот — у колеса (gears) */
}
// ====================== ДЕТАЛИ ИЗ ЛИСТОВ АВТОРА ======================
// Уступы, по которым ходят, рисуем готовыми площадками из листов (камень с мхом, ферма, полоса опасности), а не плиткой куба:
// подряд идущие кубы уступа на одной грани и высоте — одна «полка», под неё подбирается площадка подходящей длины. Парящие площадки — фермы.
let skins = [];
const SKIN_R = [[1, 0], [0, -1], [-1, 0], [0, 1]], SKIN_N = [[0, 1], [1, 0], [0, -1], [-1, 0]];
function buildSkins() {
  skins = []; const K = D.kit; if (!K) return; const R = rng((LEVEL.seed || 1) + 777), pickBy = (cat, n) => { const L = K[cat]; let best = null, bd = 1e9;
    for (const s of L) { const asp = s[2] / Math.max(1, s[3] - s[4]), want = n / 1.05, dd = Math.abs(Math.log(asp / want)) + R() * 0.35; if (dd < bd) { bd = dd; best = s; } } return best; };
  const runs = new Map();
  for (const c of cubes.values()) { if (c.y <= 1 || c.y >= 900 || (c.kind !== 'ledge' && c.kind !== 'plat') || hasCube(c.x, c.y + 1, c.z)) continue;
    for (let f = 0; f < 4; f++) { const N = SKIN_N[f], r = SKIN_R[f]; if (hasCube(c.x + N[0], c.y, c.z + N[1])) continue;
      const d = c.x * N[0] + c.z * N[1], u = c.x * r[0] + c.z * r[1], key = f + '|' + c.y + '|' + d + '|' + c.kind; let a = runs.get(key); if (!a) runs.set(key, a = { f, y: c.y, d, kind: c.kind, us: [] }); a.us.push(u); } }
  for (const a of runs.values()) { a.us.sort((p, q) => p - q); let s0 = a.us[0], prev = s0;
    const flush = (u0, u1) => { let n = u1 - u0 + 1; for (let st = u0; n > 0;) { const m = n > 7 ? Math.min(n - 2, 3 + Math.floor(R() * 3)) : n; const cat = a.kind === 'plat' ? 'girder' : R() < 0.12 ? 'hazard' : 'ledge', spr = pickBy(cat, m);
        if (spr) skins.push({ f: a.f, y: a.y, d: a.d, u0: st - 0.5, u1: st + m - 0.5, s: spr, plat: a.kind === 'plat' }); st += m; n -= m; } };
    for (let i = 1; i <= a.us.length; i++) { const u = a.us[i]; if (u === prev + 1) { prev = u; continue; } flush(s0, prev); s0 = prev = u; } }
}
function drawSkin(q, b, w) {
  const im = img.Kit; if (!im || !im.width) return; ctx.globalAlpha = edgeFade(w); const N = SKIN_N[q.f], r = SKIN_R[q.f];
  const p0 = { x: q.u0 * r[0] + (q.d + 0.5) * N[0], z: q.u0 * r[1] + (q.d + 0.5) * N[1] }, p1 = { x: q.u1 * r[0] + (q.d + 0.5) * N[0], z: q.u1 * r[1] + (q.d + 0.5) * N[1] };
  const X0 = W / 2 + relU(p0, b) * S, X1 = W / 2 + relU(p1, b) * S, x = Math.round(Math.min(X0, X1)), ww = Math.round(Math.abs(X1 - X0)); if (ww < 2 || x > W || x + ww < 0) return;
  const s = q.s, sc = ww / s[2], top = Math.round(H / 2 - (q.y + 1 - cam.y) * S - s[4] * sc), hh = Math.round(s[3] * sc); if (top > H || top + hh < 0) return;
  const flip = X1 < X0; ctx.save(); if (w < 0.98) ctx.globalAlpha = Math.max(0, (w - 0.3) / 0.68); ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.translate(x + ww, 0); ctx.scale(-1, 1); ctx.drawImage(im, s[0], s[1], s[2], s[3], 0, top, ww, hh); } else ctx.drawImage(im, s[0], s[1], s[2], s[3], x, top, ww, hh);
  ctx.restore();
}
function pushSkins(actors, b, relD) {
  for (const q of skins) { const N = SKIN_N[q.f], w = N[0] * b.n[0] + N[1] * b.n[1]; if (w < 0.03) continue; if (Math.abs(q.y - cam.y) > H / S / 2 + 3) continue;
    const c = { x: (q.u0 + q.u1) / 2 * SKIN_R[q.f][0] + (q.d + 0.5) * N[0], z: (q.u0 + q.u1) / 2 * SKIN_R[q.f][1] + (q.d + 0.5) * N[1] };
    actors.push({ _d: relD(c) + 0.03, draw: () => drawSkin(q, b, w) }); }
}
// ---- наполнение стен: вентиляции, вентиляторы, экраны, консоли, лампы, светящиеся трубки, трубы — по свободным местам стен;
// бочки и ящики — у стены на уступах; мох свисает из-под уступов. Путь, двери, лестницы, лампы и трубы уровня не загораживаем.
let decor = [];
const KPX = 40;   // пикселей листа на куб
function buildDecor() {
  decor = []; const K = D.kit; if (!K || !K.wall) return; const R = rng((LEVEL.seed || 1) + 4321), pk = a => a[Math.floor(R() * a.length)];
  const busy = new Set(), key = (f, d, u, y) => f + '|' + d + '|' + u + '|' + y, uOf = (f, x, z) => x * SKIN_R[f][0] + z * SKIN_R[f][1];
  const mark = (f, u, y, ru = 1, ry = 1) => { for (let a = -ru; a <= ru; a++) for (let b = -ry; b <= ry; b++) busy.add(f + '|' + Math.round(u + a) + '|' + Math.round(y + b)); };
  for (const L of LEVEL.ladders || []) for (let y = Math.floor(L.y0) - 1; y <= Math.ceil(L.y1) + 1; y++) mark(L.f, L.t, y, 1, 0);
  for (const d of LEVEL.doors || []) for (let y = d.y - 1; y <= d.y + 3; y++) mark(d.f, uOf(d.f, d.x, d.z), y, 2, 0);
  for (const L of LEVEL.lamps || []) for (let y = Math.floor(L.y - L.len - 1); y <= L.y + 1; y++) mark(L.f, uOf(L.f, L.x, L.z), y, 1, 0);
  for (const P of LEVEL.pipes || []) for (let i = 0; i + 1 < (P.pts || []).length; i++) { const a = P.pts[i], b = P.pts[i + 1]; for (let k = 0; k <= 8; k++) { const x = a[0] + (b[0] - a[0]) * k / 8, y = a[1] + (b[1] - a[1]) * k / 8, z = a[2] + (b[2] - a[2]) * k / 8; for (let f = 0; f < 4; f++) mark(f, uOf(f, x, z), y, 0, 0); } }
  // кандидаты: открытая грань стены, перед ней пусто
  const cand = [], wall = new Set();
  for (const c of cubes.values()) { if (c.kind !== 'core' || c.y < 2 || c.y >= 900 || LEVEL.carved.has(ckey(c.x, c.y, c.z))) continue;
    for (let f = 0; f < 4; f++) { const N = SKIN_N[f]; if (hasCube(c.x + N[0], c.y, c.z + N[1]) || LEVEL.carved.has(ckey(c.x + N[0], c.y, c.z + N[1]))) continue;
      const d = c.x * N[0] + c.z * N[1], u = uOf(f, c.x, c.z); wall.add(key(f, d, u, c.y)); cand.push([f, d, u, c.y]); } }
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const used = new Set(), free = (f, d, u0, y0, w, h) => { for (let u = u0; u < u0 + w; u++) for (let y = y0; y < y0 + h; y++) { const k = key(f, d, u, y); if (!wall.has(k) || used.has(k) || busy.has(f + '|' + u + '|' + y)) return false; } return true; };
  const take = (f, d, u0, y0, w, h) => { for (let u = u0 - 1; u < u0 + w + 1; u++) for (let y = y0; y < y0 + h; y++) used.add(key(f, d, u, y)); };
  const target = cand.length * 0.42; let cover = 0;
  for (const [f, d, u, y] of cand) { if (cover > target) break; let s = null, cat = null, w = 0, h = 0;
    for (let tr = 0; tr < 3 && !s; tr++) { const r = R(); cat = tr === 2 ? (R() < 0.5 ? 'lamp' : 'tubeH') : r < 0.5 ? 'wall' : r < 0.62 ? 'lamp' : r < 0.8 ? 'tubeH' : r < 0.87 ? 'tubeV' : r < 0.95 ? 'pipeH' : 'pipeV'; const s2 = pk(K[cat]);   /* большое не влезло — пробуем мельче */
      w = Math.max(1, Math.ceil(s2[2] / KPX - 0.15)); h = Math.max(1, Math.ceil(s2[3] / KPX - 0.15)); if (free(f, d, u, y, w, h)) s = s2; }
    if (!s) continue;
    take(f, d, u, y, w, h); cover += w * h; decor.push({ f, d: d + 0.5, u: u - 0.5 + w / 2, y: y + h / 2, s, cat, glow: cat === 'tubeH' || cat === 'tubeV' || cat === 'lamp' }); }
  // на уступах у стены — бочки, ящики, консоли; под уступами — свисающий мох
  for (const q of skins) { if (q.plat) continue; const n = Math.round(q.u1 - q.u0);
    if (R() < 0.45 && n >= 2) { const s = pk(K.floor), u = q.u0 + 0.5 + Math.floor(R() * n); if (!busy.has(q.f + '|' + Math.round(u) + '|' + (q.y + 1))) decor.push({ f: q.f, d: q.d - 0.35, u, y: q.y + 1 + s[3] / KPX / 2, s, cat: 'floor' }); }
    if (R() < 0.55) { const s = pk(K.hang), u = q.u0 + 0.5 + R() * Math.max(0, n - 1); decor.push({ f: q.f, d: q.d + 0.52, u, y: q.y - 0.25 - s[3] / KPX / 2, s, cat: 'hang' }); } }
}
function drawKitDecor(q, b, w) {
  const im = img.Kit; if (!im || !im.width) return; ctx.globalAlpha = edgeFade(w); const N = SKIN_N[q.f], r = SKIN_R[q.f], s = q.s;
  const c = { x: q.u * r[0] + q.d * N[0], z: q.u * r[1] + q.d * N[1] }, X = W / 2 + relU(c, b) * S, Y = H / 2 - (q.y - cam.y) * S, sw = s[2] / KPX * S, sh = s[3] / KPX * S, ww = sw * w;
  if (X + ww < 0 || X - ww > W || Y + sh < 0 || Y - sh > H) return;
  if (q.glow) { const col = q.cat === 'lamp' ? '255,190,90' : s[1] % 3 === 0 ? '120,230,255' : '255,140,60'; pixelGlow(X, Y, q.cat === 'lamp' ? 1.2 : 0.9, 0.06 * w * (0.85 + 0.15 * Math.sin(game.time * 3 + q.u)), q.cat === 'tubeH' && s[1] % 2 ? '255,70,50' : col); }
  ctx.save(); if (w < 0.98) ctx.globalAlpha = Math.max(0, (w - 0.3) / 0.68); ctx.imageSmoothingEnabled = false; ctx.drawImage(im, s[0], s[1], s[2], s[3], Math.round(X - ww / 2), Math.round(Y - sh / 2), Math.round(ww), Math.round(sh)); ctx.restore();
}
function pushDecor(actors, b, relD) {
  const hh = H / S / 2 + 3, hw = W / S / 2 + 3;
  for (const q of decor) { if (Math.abs(q.y - cam.y) > hh) continue; const N = SKIN_N[q.f], w = N[0] * b.n[0] + N[1] * b.n[1]; if (w < 0.03) continue;
    const c = { x: q.u * SKIN_R[q.f][0] + q.d * N[0], z: q.u * SKIN_R[q.f][1] + q.d * N[1] }; if (Math.abs(relU(c, b)) > hw) continue;
    actors.push({ _d: relD(c) + 0.01, draw: () => drawKitDecor(q, b, w) }); }
}
// ====================== СТЕНЫ И ПЕРИЛА ИЗ ПАКА АВТОРА (v221) ======================
// Лист Алексея 13.10 (атлас Kit2). Аккуратно, не абы как:
//  - на стены ноги и груди (снаружи, не в комнатах) — плоские щиты 0–6: панели, щиты с проводами внутри, решётки, пробоина.
//    В палитре стен игры (варианты 'w*' в атласе). Нога — около 12% свободной стены, большая грудь — 5%; щит целиком на стене, перед ним пусто; рядом с лестницами, дверями, лампами, трубами,
//    шестернями, кольцами, паром, огнём, ловушками, лифтами и поршнями не ставим. Декоративных труб и кабелей-петель нет:
//    все трубы в игре осязаемые (правило Алексея), а плиты-полки 11–13 похожи на уступы — их тоже нет, чтобы не было ложных платформ.
//  - перила (15) — передним планом на краю части длинных уступов пути (не у лестниц и дверей). Только картинка, герою не мешают.
// Своя последовательность случайных чисел: раскладка карты (R) не меняется, номера карт из жалоб совпадают.
let k2walls = [], k2rails = [];
const RAIL_SC = 0.55;   // v233–235: перила в 0.55 от размера листа; куски по 1.4×0.55 куба ставятся внахлёст по всей платформе (Алексей 18.10: «стоят слишком отдельно»)
const K2_PANELS = [0, 1, 2, 3, 4, 5, 6];
let stRails = [];
function buildKit2() {
  k2walls = []; k2rails = []; stRails = []; if (!D.kit2) return; const R = rng((LEVEL.seed || 1) + 9127), KP = 40;
  const uOf = (f, x, z) => x * SKIN_R[f][0] + z * SKIN_R[f][1], dOf = (f, x, z) => x * SKIN_N[f][0] + z * SKIN_N[f][1];
  const faceOf = (x, z) => [0, 1, 2, 3].reduce((m, f) => dOf(f, x, z) > dOf(m, x, z) ? f : m, 0);
  const busy = new Set(), mark = (f, u, y, ru = 1, ry = 1) => { for (let a = -ru; a <= ru; a++) for (let b = -ry; b <= ry; b++) busy.add(f + '|' + Math.round(u + a) + '|' + Math.round(y + b)); };
  const markObj = (o, ru, ry) => { if (!o || o.x === undefined || o.y > 900) return; const f = o.f !== undefined && o.f >= 0 && o.f < 4 && !o.loop ? o.f % 4 : faceOf(o.x, o.z); mark(f, uOf(f, o.x, o.z), o.y, ru, ry); };
  for (const L of LEVEL.ladders || []) for (let y = Math.floor(L.y0) - 1; y <= L.y1 + 1; y++) mark(L.f % 4, L.t, y, 1, 0);
  for (const d of LEVEL.doors || []) for (let y = d.y - 1; y <= d.y + 3; y++) markObj({ x: d.x, y, z: d.z, f: d.f }, 2, 0);
  for (const L of LEVEL.lamps || []) for (let y = Math.floor(L.y - (L.len || 1) - 1); y <= L.y + 1; y++) markObj({ x: L.x, y, z: L.z, f: L.f }, 1, 0);
  for (const P of LEVEL.pipes || []) for (let i = 0; i + 1 < (P.pts || []).length; i++) { const a = P.pts[i], c = P.pts[i + 1]; for (let k = 0; k <= 10; k++) markObj({ x: a[0] + (c[0] - a[0]) * k / 10, y: a[1] + (c[1] - a[1]) * k / 10, z: a[2] + (c[2] - a[2]) * k / 10 }, 1, 1); }
  for (const G of LEVEL.gears || []) markObj(G, Math.ceil(G.R || 2) + 1, Math.ceil(G.R || 2) + 1);
  for (const key of ['rings', 'steams', 'fires', 'traps', 'pistons', 'wsprites', 'cables', 'movers', 'items', 'engines', 'grips', 'wgears']) for (const o of LEVEL[key] || []) markObj(o, 2, 2);
  // свободная стена: грань «сердцевины» ноги, перед ней пусто, не ниша
  const wall = new Set(), cand = [], key = (f, d, u, y) => f + '|' + d + '|' + u + '|' + y;
  for (const c of cubes.values()) { if (c.kind !== 'core' || c.y < 2 || c.y >= 900 || LEVEL.carved.has(ckey(c.x, c.y, c.z))) continue;
    for (let f = 0; f < 4; f++) { const N = SKIN_N[f]; if (hasCube(c.x + N[0], c.y, c.z + N[1]) || LEVEL.carved.has(ckey(c.x + N[0], c.y, c.z + N[1]))) continue;
      const d = dOf(f, c.x, c.z), u = uOf(f, c.x, c.z); wall.add(key(f, d, u, c.y)); cand.push([f, d, u, c.y]); } }
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const used = new Set(), free = (f, d, u0, y0, w, h) => { for (let u = u0; u < u0 + w; u++) for (let y = y0; y < y0 + h; y++) { if (!wall.has(key(f, d, u, y)) || used.has(key(f, d, u, y)) || busy.has(f + '|' + u + '|' + y)) return false; } return true; };
  const take = (f, d, u0, y0, w, h) => { for (let u = u0 - 2; u < u0 + w + 2; u++) for (let y = y0 - 1; y < y0 + h + 1; y++) used.add(key(f, d, u, y)); };   // вокруг щита — зазор
  const zone = y => y < (LEVEL.torsoY ? LEVEL.torsoY[0] : 47) ? 0 : 1, tgt = [0, 0], cov = [0, 0]; for (const c of cand) tgt[zone(c[3])] += zone(c[3]) ? 0.05 : 0.12; let last = -1;
  for (const [f, d, u, y] of cand) { const z = zone(y); if (cov[z] > tgt[z]) continue;
    let k = K2_PANELS[Math.floor(R() * K2_PANELS.length)]; if (k === last) k = K2_PANELS[(K2_PANELS.indexOf(k) + 1) % K2_PANELS.length];   // без одинаковых подряд — не будет узора
    const s = D.kit2['w' + k] || D.kit2[k], w = Math.max(1, Math.round(s[2] / KP)), h = Math.max(1, Math.round(s[3] / KP));
    if (!free(f, d, u, y, w, h)) continue; take(f, d, u, y, w, h); cov[z] += w * h; last = k;
    k2walls.push({ f, d: d + 0.5, u: u - 0.5 + w / 2, y: y + h / 2, k: D.kit2['w' + k] ? 'w' + k : k, w: s[2] / KP, h: s[3] / KP, flip: R() < 0.5 && k !== 1 && k !== 3 }); }
  const railBusy = new Set();   // перилам мешают только сама колонка лестницы и проём двери
  for (const L of LEVEL.ladders || []) for (let y = Math.floor(L.y0) - 1; y <= L.y1 + 1; y++) railBusy.add((L.f % 4) + '|' + Math.round(L.t) + '|' + y);
  for (const dd of LEVEL.doors || []) { if (dd.y > 900) continue; const f = dd.f !== undefined ? dd.f % 4 : faceOf(dd.x, dd.z); for (let y = dd.y - 1; y <= dd.y + 3; y++) for (let k = -1; k <= 1; k++) railBusy.add(f + '|' + (Math.round(uOf(f, dd.x, dd.z)) + k) + '|' + y); }
  { const B = LEVEL.soleBalc; if (B) { const n = B.x1 - B.x0 + 1, RW = 1.4 * RAIL_SC, pieces = Math.max(1, Math.ceil(n / RW)), step = pieces > 1 ? (n - RW) / (pieces - 1) : 0;   // v231: балкончик у выхода из туннеля — перила всегда, на все тайлы
    for (let i = 0; i < pieces; i++) k2rails.push({ f: 0, d: B.z + 0.44, u: B.x0 - 0.5 + RW / 2 + i * step, y: B.y, k: D.kit2.w15 ? 'w15' : 15 }); } }
  // v308 (Алексей: «у лестницы поручни странно выглядят, плохо стыкуются с обычными и выше них»): уступ, к которому приходит марш, — весь в перилах марша,
  // одного вида и высоты; обычных перил на нём нет
  const stEnds = []; for (const L of LEVEL.stairs || []) { const f = ((L.f | 0) % 4 + 4) % 4, r = L.r || 8; for (const [t, y] of [[num0s(L.t0), num0s(L.y0)], [num0s(L.t1), num0s(L.y1)]]) { const c = lanePosR(f, t, r); stEnds.push({ f, u: uOf(f, c[0], c[1]), d: dOf(f, c[0], c[1]), y }); } }
  // перила: длинные уступы пути (из той же раскладки, что и площадки), передний край, не у лестниц и дверей
  const runs = new Map();
  for (const c of cubes.values()) { if (c.y <= 1 || c.y >= 900 || c.kind !== 'ledge' || hasCube(c.x, c.y + 1, c.z)) continue;
    for (let f = 0; f < 4; f++) { const N = SKIN_N[f]; if (hasCube(c.x + N[0], c.y, c.z + N[1])) continue; const d = dOf(f, c.x, c.z), u = uOf(f, c.x, c.z), kk = f + '|' + c.y + '|' + d; let a = runs.get(kk); if (!a) runs.set(kk, a = { f, y: c.y, d, us: [] }); a.us.push(u); } }
  for (const a of runs.values()) { a.us.sort((p, q) => p - q); let s0 = a.us[0], prev = s0; const seg = [];
    for (let i = 1; i <= a.us.length; i++) { const u = a.us[i]; if (u === prev + 1) { prev = u; continue; } seg.push([s0, prev]); s0 = prev = u; }
    for (const [u0, u1] of seg) { const n = u1 - u0 + 1;
      if (stEnds.some(e => e.f === a.f && Math.abs(e.y - (a.y + 1)) < 0.2 && Math.abs(e.d - a.d) < 0.6 && e.u > u0 - 1.1 && e.u < u1 + 1.1)) { R(); stRails.push({ f: a.f, d: a.d, u0: u0 - 0.5, u1: u1 + 0.5, y: a.y + 1 }); continue; }
      if (n < 3 || R() > 0.5) continue;
      // v230 (Алексей 13.10): перила — так на всю платформу, от края до края; куски по 1.4 внахлёст, крайние — заподлицо с краями
      const RW = 1.4 * RAIL_SC, L = n, pieces = Math.max(1, Math.ceil(L / RW)), step = pieces > 1 ? (L - RW) / (pieces - 1) : 0, start = u0 - 0.5 + (pieces > 1 ? 0 : (L - RW) / 2);
      let ok = true; for (let u = u0; u <= u1; u++) if (railBusy.has(a.f + '|' + u + '|' + (a.y + 1)) || railBusy.has(a.f + '|' + u + '|' + a.y)) ok = false;
      if (!ok) continue; for (let i = 0; i < pieces; i++) k2rails.push({ f: a.f, d: a.d + 0.44, u: start + RW / 2 + i * step, y: a.y + 1, k: D.kit2.w15 ? 'w15' : 15 }); } }
  // v311 (Алексей: «сверху нет поручня»): марш пришёл не на уступ, а на крышу блока/комнаты — перила марша и там, по всей открытой крыше рядом (до 8 кубов)
  for (const e of stEnds) { if (stRails.some(q => q.f === e.f && Math.abs(q.y - e.y) < 0.2 && Math.abs(q.d - e.d) < 0.6 && e.u > q.u0 - 0.7 && e.u < q.u1 + 0.7)) continue;
    const N = SKIN_N[e.f], R2 = SKIN_R[e.f], D0 = Math.round(e.d), Y = Math.round(e.y), at = u => { const x = u * R2[0] + D0 * N[0], z = u * R2[1] + D0 * N[1]; return hasCube(x, Y - 1, z) && !hasCube(x, Y, z) && !hasCube(x + N[0], Y - 1, z + N[1]) && !hasCube(x + N[0], Y, z + N[1]); };
    for (const s0 of [Math.round(e.u - 0.5), Math.round(e.u + 0.5)]) { if (!at(s0)) continue; let a = s0, b2 = s0; while (b2 - s0 < 7 && at(b2 + 1)) b2++; while (s0 - a < 7 && at(a - 1)) a--;
      if (stRails.some(q => q.f === e.f && Math.abs(q.y - e.y) < 0.2 && Math.abs(q.d - D0) < 0.6 && q.u0 < b2 + 0.5 && q.u1 > a - 0.5)) continue; stRails.push({ f: e.f, d: D0, u0: a - 0.5, u1: b2 + 0.5, y: Y }); } }
}
function drawK2(q, b, w, bottom) {   // плоская деталь на грани: ширина сжимается при повороте мира, как у остальных картинок на стенах
  const im = img.Kit2, s = D.kit2 && D.kit2[q.k]; if (!im || !im.width || !s) return; const N = SKIN_N[q.f], r = SKIN_R[q.f];
  const c = { x: q.u * r[0] + q.d * N[0], z: q.u * r[1] + q.d * N[1] }, X = W / 2 + relU(c, b) * S, sc = S / 40 * (q.sc || 1), sw = s[2] * sc, sh = s[3] * sc, ww = Math.max(1, Math.round(sw * w));
  const Yt = bottom ? Math.round(H / 2 - (q.y - cam.y) * S - sh) : Math.round(H / 2 - (q.y - cam.y) * S - sh / 2); if (X + ww < 0 || X - ww > W || Yt > H || Yt + sh < 0) return;
  ctx.save(); ctx.globalAlpha = edgeFade(w); ctx.imageSmoothingEnabled = false; const x0 = Math.round(X - ww / 2);
  if (q.flip) { ctx.translate(x0 + ww, 0); ctx.scale(-1, 1); ctx.drawImage(im, s[0], s[1], s[2], s[3], 0, Yt, ww, Math.round(sh)); } else ctx.drawImage(im, s[0], s[1], s[2], s[3], x0, Yt, ww, Math.round(sh));
  ctx.restore();
}
function pushKit2(actors, b, relD) {
  const hh = H / S / 2 + 3, hw = W / S / 2 + 3;
  const put = (q, dd, bottom) => { if (Math.abs(q.y - cam.y) > hh) return; const N = SKIN_N[q.f], w = N[0] * b.n[0] + N[1] * b.n[1]; if (w < 0.03) return;
    const c = { x: q.u * SKIN_R[q.f][0] + q.d * N[0], z: q.u * SKIN_R[q.f][1] + q.d * N[1] }; if (Math.abs(relU(c, b)) > hw) return; actors.push({ _d: relD(c) + dd, draw: () => drawK2(q, b, w, bottom) }); };
  for (const q of k2walls) put(q, 0.01, false);
  for (const q of k2rails) put(Object.assign(q, { sc: RAIL_SC }), 0.6, true);
  for (const q of stRails) { if (Math.abs(q.y - cam.y) > hh) continue; const N = SKIN_N[q.f], w = N[0] * b.n[0] + N[1] * b.n[1]; if (w < 0.08) continue; const um = (q.u0 + q.u1) / 2, c = { x: um * SKIN_R[q.f][0] + q.d * N[0], z: um * SKIN_R[q.f][1] + q.d * N[1] };
    actors.push({ _d: relD(c) + 0.6, draw: () => drawStairRailRun(q, b, w) }); }   /* v308: перила марша вдоль всего уступа */   // v233: перила меньше и тоньше (Алексей: «слишком плотные и большие, за ними не видно героя»)   // перила перед героем
}
// ====================== ШЕСТЕРНИ ======================
// Большие шестерни на стенах. Стоят, пока на них никто не встал. Встал не по центру — вес крутит колесо: верх уезжает в ту же сторону
// и везёт героя, чем дальше от середины, тем круче склон и быстрее разгон, а у края — соскальзываешь и падаешь.
// Бег против хода тормозит колесо (как на бревне в воде). Опора только сверху: снизу и сбоку сквозь шестерню можно пройти.
let gears = [];
function spawnGears() { setTimeout(() => { const seen = new Set(); for (const G of gears) { if (G.sp) continue; const k = G.R + '|' + (G.rust ? 1 : 0); if (seen.has(k)) continue; seen.add(k); for (let st = 0; st < 32; st++) gearQueue.push([G.R, G.rust ? 1 : 0, st]); } }, 0);   // все положения колёс заранее, понемногу
  gears = (LEVEL.gears || []).map(g => Object.assign({}, g, { ang: rnd(0, 6.28), om: 0, on: false, extra: 0, drive: g.drive !== undefined ? g.drive : (Math.random() < 0.5 ? -1 : 1) * rnd(0.7, 1.3) }));
  gears = gears.concat(wgSpawn());   /* v269: шестерни в стене (13g_wgears.js) */
  }   // v223: только старые нарисованные колёса, как было до v222 (шестерни автора убраны по просьбе Алексея 13.10); шестерни автора — добавлены рядом, сцепленные
const gearFace = G => { const N = FACE_N[G.f]; return N[0] * view.n[0] + N[1] * view.n[1]; };
// v224: колесо осязаемо всегда, когда нарисовано (правило «что видно — то есть»). Колёса насосов и блоки над лифтами рисуются и сбоку
// (полным кругом, у края ноги) — тогда и держат: глубина у них на 1–2 куба дальше, чем у героя на уступе, допуск сбоку 2.6.
// Раньше физика требовала «колесо лицом к камере», и сбоку герой проходил сквозь нарисованное колесо (жалоба Алексея 13.10).
function gearTangible(G, hd, stand) {
  if (G.armJ || G.armP) return armVisible();   // v277: шарнир руки — когда руки видны, на любой глубине (как площадки руки)   // stand: встать сверху (как на куб — можно и на дальний, если верх виден); иначе — толкать и хвататься: только вблизи по глубине
  const gf = gearFace(G), side = G.pist || G.lift !== undefined; if (side ? gf <= -0.3 : gf < 0.6) return false;
  if (G.pist) return Math.abs(toD(G) - hd) <= 1.6 || !gearOccluded(G);   // v233: колесо насоса нарисовано с любой стороны — и осязаемо с любой, если его не загораживает куб спереди (Алексей 14.10: «когда поворачиваешь, вообще не осязаемая»)
  if (gf >= 0.6) return Math.abs(toD(G) - hd) <= 1.6;
  return Math.abs(toD(G) - hd) <= 2.6 || (stand && gearTopVisible(G));   // сбоку: как с кубами — держит, если верх колеса не загорожен (герой в воздухе уходит на ближнюю глубину)
}
function gearOccluded(G) { const u = toU(G), d = toD(G); for (const dy of [-G.R * 0.5, 0, G.R * 0.6]) { const c = cellAt(Math.round(u), Math.floor(G.y + dy)); if (c && c.some(q => q.dep > d + DEPTH_TOL)) return true; } return false; }
function gearTopVisible(G) { const u = toU(G), y = G.y + G.R, d = toD(G);
  for (const du of [-0.3, 0, 0.3]) { const c = cellAt(Math.round(u + du), Math.floor(y + 0.2)); if (!(c && c.some(q => q.dep > d + DEPTH_TOL))) return true; } return false; }
// форма колеса для физики — та же, что на рисунке: обод и зубья, между зубьями впадины (в них проваливаешься)
const gearN = R => Math.max(10, Math.round(2 * Math.PI * (R - 0.3) / 0.62));
function gearSolid(G, du, dh) {   // du — вправо, dh — вверх от центра (в кубах)
  if (G.wg && !wgOut(G, du, dh)) return false;   // v269: в стене колеса нет
  if (G.sp && GSPR[G.sp.k]) return Math.hypot(du, dh) <= G.R && gearSolidSpr(G, du, dh);   // v222: по пикселям рисунка
  const R = G.R, Rr = R - 0.3, r = Math.hypot(du, dh); if (r > R) return false; if (r <= Rr) return true;
  const N = gearN(R), per = 2 * Math.PI / N, a = Math.atan2(-dh, du) - G.ang, ph = ((a % per) + per) % per - per / 2, k = (r - Rr) / (R - Rr);
  return Math.abs(ph) < per * (0.3 - 0.1 * k);
}
function gearTop(G, du, yFeet) {   // верх колеса под точкой: ищем сверху вниз от ног; только светлая верхняя часть — на нижней не устоять
  const R = G.R; if (Math.abs(du) > R * 0.86) return null; let best = -1e9;
  for (const ox of [-0.08, 0, 0.08]) { const x = du + ox; if (Math.abs(x) >= R) continue;
    for (let h = Math.min(Math.sqrt(R * R - x * x), yFeet - G.y + 0.3); h > R * 0.4; h -= 0.02) if (gearSolid(G, x, h)) { if (h > best) best = h; break; } }
  return best > R * 0.4 ? G.y + best : null;
}
function gearSupport(u, yFeet, best) {
  for (const G of gears) { if ((G.deco && G.lift === undefined) || !gearTangible(G, toD(hero), true)) continue; const top = gearTop(G, u - toU(G), yFeet); if (top === null) continue;
    if (top <= yFeet + 0.2 && top > yFeet - 0.6 && (!best || top > best.top) && !overlapsDepth(u, top + 0.02, hero.hw * 0.9, hero.h - 0.04, toD(hero))) best = { top, r: G }; }   // над колесом нет места (потолок) — на нём не стоят
  return best;
}
function gearPush(G) {
  if (G.pist) {   // колесо насоса — твёрдое, как столб: в него упираешься сбоку, сверху на нём стоишь; никуда не швыряет
    if (hero.standOn === G || hero.hang || hero.ride || hero.ladder || hero.state === 'dead' || !gearTangible(G, toD(hero))) return;
    const du = toU(hero) - toU(G), lim = G.R * 0.8 + hero.hw; if (Math.abs(du) >= lim || hero.y > G.y + G.R * 0.55 || hero.y + hero.h < G.y - G.R) return;
    const nu = toU(G) + Math.sign(du || -hero.face) * lim; if (!overlapsDepth(nu, hero.y + 0.02, hero.hw, hero.h - 0.04, toD(hero))) setUD(hero, nu, toD(hero)); if (hero.vx * Math.sign(du) < 0) hero.vx = 0; return; }
  if ((G.deco && G.lift === undefined) || G.soft || hero.standOn === G || hero.hang || hero.ride || hero.ladder || hero.state === 'dead' || !gearTangible(G, toD(hero))) return;
  const gu = toU(G), d = toD(hero);
  for (const py of [0.05, hero.h * 0.5, hero.h - 0.05]) for (const px of [-hero.hw, 0, hero.hw]) { const du = toU(hero) + px - gu, dh = hero.y + py - G.y; if (!gearSolid(G, du, dh)) continue;
    const r = Math.hypot(du, dh) || 0.01, ux = du / r, uy = dh / r;
    if (uy > 0.45) { const top = gearTop(G, toU(hero) - gu, hero.y + 1); if (top !== null && !overlapsDepth(toU(hero), top + 0.02, hero.hw * 0.9, hero.h - 0.04, d)) { hero.y = top; if (hero.vy < 0) hero.vy = 0; } return; }   // сверху — встаёт на колесо
    const push = (G.R + 0.03 - r), hu0 = toU(hero); let nu = hu0 + ux * push, ny = hero.y + Math.max(0, uy) * push; if (uy < 0) nu = hu0 + Math.sign(ux || hero.face) * push;   /* снизу и сбоку — только вбок, вниз колесо не толкает */   // сбоку и снизу — наружу, но не в стену и не сквозь пол
    if (overlapsDepth(nu, ny + 0.02, hero.hw, hero.h - 0.04, d)) { nu = hu0 + Math.sign(ux || 1) * push; ny = hero.y; if (overlapsDepth(nu, ny + 0.02, hero.hw, hero.h - 0.04, d)) return; }
    setUD(hero, nu, d); hero.y = ny;
    if (hero.vx * ux < 0) hero.vx = 0; if (uy < 0 && hero.vy > 0) hero.vy = 0; return; }
}
function updateGears(dt) {
  for (const G of gears) {
    if (G.pair) { const M = gears[gears.indexOf(G) - 1]; if (M) G.drive = -M.om * M.R; }   // сцепленное колесо крутится навстречу ведущему
    if (G.deco && G.lift === undefined) { if (G.pair) { const M = gears[gears.indexOf(G) - 1]; if (M) { G.om = -M.om * M.R / G.R; G.ang += G.om * dt; } continue; } G.om = G.drive / G.R; G.ang += G.om * dt; continue; }
    if (G.deco) { const L = lifts[G.lift]; if (L) { G.om = ((L.y - (G.ly === undefined ? L.y : G.ly)) / Math.max(dt, 1e-4)) / G.R; G.ly = L.y; G.ang = (G.rev ? -1 : 1) * L.y / (G.ratio ? G.R * G.ratio : G.R) * (G.ratio || 1) + (G.ph || 0); } continue; }   // блок над лифтом крутится, пока едет люлька
    gearPush(G);
    const on = hero.standOn === G && hero.onGround && hero.state !== 'dead';
    if (G.on && !on) G.offT = game.time; G.on = on;
    let om = G.mesh ? Math.max(-1.3, Math.min(1.3, -G.mesh.om * G.mesh.R / G.R)) : G.drive / G.R;   // v223: сцепленная шестерня автора крутится навстречу своему колесу (не быстрее 1.3 — иначе сбрасывает)                                             // мотор крутит колесо всегда; стоишь на нём — твой вес раскручивает сильнее
    if (on && !G.pist) { const du = toU(hero) - toU(G); G.extra = (G.extra || 0) + (du / G.R) * 1.6 * dt; G.extra = Math.max(-1.6 / G.R, Math.min(1.6 / G.R, G.extra));
      const slide = Math.abs(du) > G.R * 0.5 ? Math.sign(du) * Math.pow((Math.abs(du) - G.R * 0.5) / (G.R * 0.4), 2) * 2.4 : 0;   // у края — съезжает вниз по склону
      const th = (om + G.extra) * dt, dh = hero.y - G.y, c = Math.cos(th), s = Math.sin(th), ndu = du * c + dh * s + slide * dt, ndh = -du * s + dh * c, dd = toD(hero), nu = toU(G) + ndu;
      if (!overlapsDepth(nu, G.y + ndh, hero.hw, hero.h, dd)) { setUD(hero, nu, dd); hero.y = G.y + ndh; } }
    else G.extra = (G.extra || 0) * Math.exp(-dt * 1.2);
    G.om = om + (G.extra || 0); G.ang += G.om * dt;
  }
}
// в прыжке рука рядом с вершиной зубца на верхней половине колеса — герой виснет и едет с зубцом; зубец ушёл вниз — сорвался
function gearTooth(G, i) { if (G.sp && GSPR[G.sp.k]) return gearToothSpr(G, i); const per = 2 * Math.PI / gearN(G.R), th = G.ang + (i + 0.5) * per; return { du: Math.cos(th) * (G.R - 0.04), dh: -Math.sin(th) * (G.R - 0.04) }; }
// хват за вершину любого зубца: руки на зубце, тело висит вниз (перед колесом); колесо крутится — герой едет с зубцом по кругу,
// хоть целый оборот. Пробел — спрыгнуть с разгоном от вращения, вниз — отпустить.
function tryGearGrab() {
  if (hero.onGround || hero.hang || hero.ride || hero.ladder || hero.hangCool > 0 || hero.state === 'dead' || hero.inDoor) return false;
  const hu = toU(hero), hy = hero.y + HAND_Y;
  for (const G of gears) { if ((G.deco && G.lift === undefined) || !gearTangible(G, toD(hero)) || game.time - (G.offT || -9) < 0.45) continue;   /* v233: за колесо насоса тоже цепляешься */ const gu = toU(G);
    if (Math.abs(hu - gu) > G.R + 0.5 || Math.abs(hy - G.y) > G.R + 0.5) continue;
    for (let i = 0, N = gearTeethN(G); i < N; i++) { const q = gearTooth(G, i), tu = gu + q.du, ty = G.y + q.dh; if (G.wg && !wgOut(G, q.du, q.dh)) continue;
      if (Math.abs(tu - hu - Math.sign(q.du) * 0.0) < 0.32 && Math.abs(hy - ty) < 0.28) { const dir = Math.sign(gu - hu) || hero.face;
        hero.hang = { U: Math.round(tu), T: ty, dir, gear: G, i, low: q.dh < G.R * 0.05 };   /* снизу — хват за нижний зубец, едет по кругу без перехвата */ hero.vx = hero.vy = 0; hero.hook = null; hero.hookAir = false; hero.face = dir; hero.hangPop = 0; go('Take'); return true; } } }
  return false;
}
function updateGearHang(dt, ax) {
  const hg = hero.hang, G = hg.gear, gu = toU(G), d = toD(hero); let q = gearTooth(G, hg.i);
  if (G.wg && !wgOut(G, q.du, q.dh)) { hero.hang = null; hero.hangCool = 0.5; G.offT = game.time; go('Fly'); return; }   // v269: зубец ушёл в стену — сорвался
  if (false && q.dh < G.R * 0.05 && !hg.low) {   // (перехват отключён: едет с зубцом по кругу) зубец уходит под колесо — перехватывается за ближний зубец повыше на этой же стороне
    const side = Math.sign(q.du) || -hg.dir, N = gearTeethN(G); let best = -1, bd = 1e9;
    for (let k = 0; k < N; k++) { const t = gearTooth(G, k); if (t.dh < G.R * 0.12 || t.dh > G.R * 0.75 || Math.sign(t.du) !== side) continue; const dd = Math.hypot(t.du - q.du, t.dh - q.dh); if (dd < bd) { bd = dd; best = k; } }
    if (best < 0) { hero.hang = null; hero.hangCool = 0.5; G.offT = game.time; go('Fly'); return; }
    hg.i = best; q = gearTooth(G, best); hero.hangPop = 0.12; }
  { const up = hg.pdh !== undefined && q.dh > hg.pdh + 1e-4; hg.pdh = q.dh; hg.ht = (hg.ht || 0) + dt;   // зубец несёт вверх и подходит к макушке — подтягивается и встаёт на верхние зубцы
    if ((up && hg.ht > 0.35 && q.dh > G.R * 0.7) || (q.dh > G.R * 0.88 && Math.abs(q.du) < G.R * 0.35)) { const sd = Math.sign(q.du) || -hg.dir, top = G.y + G.R + 0.05, rise = Math.max(0.3, top - hero.y + 0.25);
      hero.hang = null; hero.hangCool = 0.45; G.offT = game.time - 0.3; hero.airJumps = 1; hero.vy = Math.sqrt(2 * CFG.gravity * rise); hero.vx = 0; hero.jumpUp = true; hero.jumpStart = game.time;
      hero.boostT = 0.7; hero.boostDir = -sd; hero.boostY = top; go('JumpInRun'); return; } }
  const side = Math.abs(q.du) < G.R * 0.12 ? -hg.dir : Math.sign(q.du), dir = -side; if (dir !== hg.dir) { hg.sl = (hg.sl || 0) + 2 * dir * (hero.hw + 0.02); hg.dir = dir; hero.face = dir; const t0 = hero.anim.t; go(hero.st); hero.anim.t = Math.min(t0, hero.anim.clip.len); hero.anim.done = t0 >= hero.anim.clip.len; } hero.face = dir;   // колесо перенесло на другую сторону — герой разворачивается к нему   // лицом к колесу, руки на вершине зубца
  if (hg.sl) { hg.sl *= Math.exp(-dt * 9); if (Math.abs(hg.sl) < 0.005) hg.sl = 0; }   // разворот у колеса — тело переезжает на другую сторону плавно, без скачка
  const tu = gu + q.du, ty = G.y + q.dh, nu = tu - dir * (hero.hw + 0.02) + (hg.sl || 0), ny = ty - HANG_Y, vu = (nu - (hg.pu === undefined ? nu : hg.pu)) / Math.max(dt, 1e-4); hg.pu = nu;
  if (overlapsDepth(nu, ny, hero.hw, hero.h, d)) { hero.hang = null; hero.hangCool = 0.5; G.offT = game.time; go('Fly'); return; }   // зубец утащил к стене — сорвался
  setUD(hero, nu, d); hero.y = ny;
  if (pressed.has('jump')) { hero.hang = null; hero.airJumps = 1; hero.vy = 5; hero.vx = (ax || side) * 2.2 + Math.max(-5, Math.min(5, vu * 0.7)); hero.jumpUp = true; hero.jumpStart = game.time; hero.hangCool = 0.4; G.offT = game.time; go('JumpInRun'); }
  else if (pressed.has('sit')) { hero.hang = null; hero.hangCool = 0.5; G.offT = game.time; hero.vx = Math.max(-5, Math.min(5, vu * 0.6)); go('Fly'); }
  hero.anim.update(dt);
}
// Рисунок: колесо считается попиксельно (зубья, обод, диск с облегчающими отверстиями, ступица с болтами) уже повёрнутым —
// свет всегда сверху слева, контур тёмный, как у героя. 64 положения на оборот, кэш.
const GEAR_PX = 26, gearCache = new Map(); let gearTex = null;
// фактура металла — с листов обшивки ноги (legwall2): царапины, швы и ржавчина листа поворачиваются вместе с колесом
function gearTexData() { if (gearTex !== null) return gearTex; const im = img.legwall2; if (!im || !im.width) return null;
  try { const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d'); x.drawImage(im, 256 * 2, 0, 256, 160, 0, 0, 256, 160); const d = x.getImageData(0, 0, 256, 160).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; gearTex = { d, avg: s / (d.length / 4) / 3 }; } catch (e) { gearTex = false; }
  return gearTex; }
function gearFrame(R, rust, step) {
  const TX = gearTexData(), key = R + '|' + (rust ? 1 : 0) + '|' + step + (TX ? 't' : ''); let c = gearCache.get(key); if (c) return c;
  const P = GEAR_PX, Rt = R * P, Rr = Rt - 0.3 * P, Rim = Rr - 0.26 * P, Rh = Math.max(4, R * P * 0.24), N = Math.max(10, Math.round(2 * Math.PI * Rr / (0.62 * P))), K = R > 2 ? 6 : 5;
  const Hr = (Rim + Rh) / 2, hr = Math.min((Rim - Rh) * 0.38, Hr * Math.sin(Math.PI / K) * 0.72), a0 = step / 32 * Math.PI * 2, sz = Math.ceil(Rt) * 2 + 4, o = sz / 2;
  const M = new Uint8Array(sz * sz);   // 0 пусто, 1 диск (утоплен), 2 выступ (зубья, обод, ступица)
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) { const dx = x + 0.5 - o, dy = y + 0.5 - o, r = Math.hypot(dx, dy); if (r > Rt) continue; const a = Math.atan2(dy, dx) - a0;
    let m = 0;
    if (r > Rr) { const per = 2 * Math.PI / N, ph = ((a % per) + per) % per - per / 2, k = (r - Rr) / (Rt - Rr), hw = per * (0.3 - 0.1 * k); if (Math.abs(ph) < hw) m = 2; }   // зуб сужается к вершине
    else if (r > Rim || r < Rh) m = 2;
    else { m = 1; for (let i = 0; i < K; i++) { const b = a0 + i * 2 * Math.PI / K + Math.PI / K, hx = Math.cos(b) * Hr, hy = Math.sin(b) * Hr; if (Math.hypot(dx - hx, dy - hy) < hr) { m = 0; break; } } }
    if (r < 1.8) m = 0;                                                  // отверстие оси
    M[y * sz + x] = m; }
  c = document.createElement('canvas'); c.width = c.height = sz; const x2 = c.getContext('2d'), im = x2.createImageData(sz, sz), D = im.data;
  const at = (x, y) => x < 0 || y < 0 || x >= sz || y >= sz ? 0 : M[y * sz + x];
  const COL = { out: [62, 55, 45], hi: [190, 181, 158], li: [166, 153, 148], mid: [146, 133, 128], dk: [112, 101, 94], web: [96, 87, 80], webd: [78, 70, 62], rust: [164, 107, 110], rust2: [150, 160, 40] };   // палитра лифта
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) { const m = M[y * sz + x]; let col = null;
    if (m === 0) { }
    else { const edgeOut = !at(x + 1, y) || !at(x, y + 1), edgeIn = !at(x - 1, y) || !at(x, y - 1);   // тонкий контур только снизу-справа, где тень
      if (edgeOut) col = COL.out; else if (edgeIn && m === 2) col = COL.hi;
      else if (m === 2) { const ul = at(x - 1, y - 1) < 2 || at(x, y - 1) < 2, dr = at(x + 1, y + 1) < 2 || at(x, y + 1) < 2; col = ul ? COL.hi : dr ? COL.dk : (y < o ? COL.li : COL.mid); }
      else { col = at(x - 1, y - 1) === 2 || at(x, y - 1) === 2 || at(x - 2, y - 2) === 2 ? COL.webd : COL.web; }   // тень от обода на утопленном диске
      if (TX && col !== COL.out) { const dx = x + 0.5 - o, dy = y + 0.5 - o, lx = dx * Math.cos(-a0) - dy * Math.sin(-a0), ly = dx * Math.sin(-a0) + dy * Math.cos(-a0), tx = ((Math.round(lx * 1.6 + 128) % 256) + 256) % 256, ty = ((Math.round(ly * 1.6 + 80) % 160) + 160) % 160, ti = (ty * 256 + tx) * 4;
        const tr = TX.d[ti], tg = TX.d[ti + 1], tb = TX.d[ti + 2], dl = ((tr + tg + tb) / 3 - TX.avg) * (m === 2 ? 0.3 : 0.22);
        col = [Math.max(0, Math.min(255, col[0] + dl | 0)), Math.max(0, Math.min(255, col[1] + dl | 0)), Math.max(0, Math.min(255, col[2] + dl | 0))]; }   // ржавые пятна листа — его цветом, остальное — светлее/темнее по рисунку
      if (rust && m === 2 && col !== COL.out) { const dx = x + 0.5 - o, dy = y + 0.5 - o, lx = Math.round(dx * Math.cos(-a0) - dy * Math.sin(-a0)), ly = Math.round(dx * Math.sin(-a0) + dy * Math.cos(-a0)), h = Math.abs((lx * 73856093) ^ (ly * 19349663) ^ (rust * 997)) % 100; if (h < 7) col = h < 3 ? COL.rust2 : COL.rust; } }
    if (col) { const i = (y * sz + x) * 4; D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = 255; } }
  // болты на ступице
  x2.putImageData(im, 0, 0);
  for (let i = 0; i < 4; i++) { const b = a0 + i * Math.PI / 2 + 0.4, bx = Math.round(o + Math.cos(b) * Rh * 0.62), by = Math.round(o + Math.sin(b) * Rh * 0.62); x2.fillStyle = '#2a2226'; x2.fillRect(bx - 1, by - 1, 2, 2); x2.fillStyle = '#a59ea6'; x2.fillRect(bx - 1, by - 1, 1, 1); }
  if (step === 0) { const sh = document.createElement('canvas'); sh.width = sh.height = sz; const sx = sh.getContext('2d'), si = sx.createImageData(sz, sz); for (let i = 0; i < sz * sz; i++) if (M[i]) si.data[i * 4 + 3] = 255; sx.putImageData(si, 0, 0); c.sh = sh; }   // силуэт для тени
  gearCache.set(key, c); return c;
}
// кадры колеса строятся понемногу, не больше нескольких миллисекунд за кадр игры; пока нужного нет — берём ближайший готовый
const gearQueue = [];
function gearFrameNear(R, rust, st) {
  const TX = gearTexData(), kk = s => R + '|' + rust + '|' + s + (TX ? 't' : ''); if (gearCache.has(kk(st))) return gearCache.get(kk(st));
  if (!gearQueue.some(q => q[0] === R && q[1] === rust && q[2] === st)) gearQueue.push([R, rust, st]);
  for (let d = 1; d < 16; d++) for (const s2 of [(st + d) % 32, (st - d + 32) % 32]) if (gearCache.has(kk(s2))) return gearCache.get(kk(s2));
  return gearFrame(R, rust, st);
}
function gearWork() { const t0 = performance.now(); while (gearQueue.length && performance.now() - t0 < 3) { const q = gearQueue.shift(); gearFrame(q[0], q[1], q[2]); } }
function drawGear(G, b) {
  const fc = G.pist || G.lift !== undefined ? (gearFace(G) > -0.3 ? 1 : -1) : gearFace(G);   /* блоки над лифтом видно с любой стороны, как и цепь */ if (fc < 0.04) return;   // колесо насоса — объёмная деталь механизма, видно с любой стороны   // при повороте колесо сжимается в ребро, а не пропадает
  const cx = W / 2 + relU(G, b) * S, cy = H / 2 - (G.y - cam.y) * S, R = G.R * S; if (cx < -R * 1.3 || cx > W + R * 1.3 || cy < -R * 1.3 || cy > H + R * 1.3) return;
  if (G.wg) { drawWGear(G, b); return; }   /* v269 */
  if (G.sp && drawGearSpr(G, b, fc)) return;   // v222: шестерня с листа автора
  const st = ((Math.round(G.ang / (Math.PI * 2) * 32) % 32) + 32) % 32, fr = gearFrameNear(G.R, G.rust ? 1 : 0, st), k = S / GEAR_PX, w = fr.width * k;
  ctx.imageSmoothingEnabled = false;
  const sh0 = gearCache.get(G.R + '|' + (G.rust ? 1 : 0) + '|0' + (gearTexData() ? 't' : '')); if (sh0 && sh0.sh && !G.bridge) { ctx.globalAlpha = 0.32; ctx.drawImage(sh0.sh, Math.round(cx - w * fc / 2 + S * 0.12), Math.round(cy - w / 2 + S * 0.16), Math.round(w * fc), Math.round(w)); ctx.globalAlpha = 1; }   // тень на стене
  ctx.drawImage(fr, Math.round(cx - w * fc / 2), Math.round(cy - w / 2), Math.round(w * fc), Math.round(w));
  const g = Math.max(2, Math.round(S / GEAR_PX)); ctx.fillStyle = '#2a2226'; ctx.fillRect(Math.round(cx) - g * 2, Math.round(cy) - g * 2, g * 4, g * 4); ctx.fillStyle = G.rust ? '#c4602a' : '#8fe8ff'; ctx.fillRect(Math.round(cx) - g, Math.round(cy) - g, g * 2, g * 2);   // ось
}
// ====================== ШЕСТЕРНИ С ЛИСТА АВТОРА — ОТКЛЮЧЕНО (13.10) ======================
// Алексей попросил пока убрать шестерни автора и оставить старые колёса как были. Отсюда ничего не вызывается (gearSkin, addSpriteGears);
// проверки G.sp и G.mesh в 11_propsh_gears.js без них не срабатывают — колёса как в v221. Ниже — прежнее описание.
// v223 по просьбе Алексея: старые колёса НЕ заменяем — они как были. Его шестерни (атлас Kit2, перекрашены в палитру колёс игры: 'g39', 'g41',
// 'g46', 'g47') ДОБАВЛЯЕМ: кое-где рядом с колесом на стене ноги и груди — сцепленная с ним, крутится навстречу (без своего мотора),
// на ней можно стоять и хвататься за зубец. Своя последовательность случайных чисел — раскладка карты не меняется.
// Размер — целым увеличением картинки (×1, ×2: пиксели квадратные, без растяжения); радиус колеса = радиус рисунка.
// Физика — по самой картинке: точка колеса твёрдая, если в повёрнутом рисунке там непрозрачный пиксель (впадины между зубьями — там же, где нарисованы).
// Зубцы для хвата в прыжке — вершины зубьев рисунка. Поворот — 64 положения, пиксель в пиксель (ближайший пиксель, без сглаживания).
const GSPR = { 39: null, 41: null, 46: null, 47: null }, GSPR_N = 64, gsprCache = new Map();
function gsprData(k) {   // маска и вершины зубьев рисунка (один раз на картинку)
  if (GSPR[k]) return GSPR[k]; const im = img.Kit2, r = D.kit2 && (D.kit2['g' + k] || D.kit2[k]); if (!im || !im.width || !r) return null;
  let px; try { const c = document.createElement('canvas'); c.width = r[2]; c.height = r[3]; const x = c.getContext('2d'); x.drawImage(im, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]); px = x.getImageData(0, 0, r[2], r[3]).data; } catch (e) { return null; }
  const w = r[2], h = r[3]; let sx = 0, sy = 0, n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 0) { sx += x + 0.5; sy += y + 0.5; n++; }
  const cx = sx / n, cy = sy / n, A = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y); return ix >= 0 && iy >= 0 && ix < w && iy < h && px[(iy * w + ix) * 4 + 3] > 0; };
  const M = 720, prof = new Float32Array(M); let Rmax = 0;
  for (let i = 0; i < M; i++) { const a = i / M * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a); for (let rr = Math.max(w, h); rr > 0; rr -= 0.25) if (A(cx + ca * rr, cy + sa * rr)) { prof[i] = rr; break; } Rmax = Math.max(Rmax, prof[i]); }
  const teeth = []; for (let i = 0; i < M; i++) { const v = prof[i]; if (v < Rmax - 2.2) continue; let peak = true; for (let d = -6; d <= 6; d++) if (prof[(i + d + M) % M] > v) { peak = false; break; } if (peak && !teeth.some(t => Math.abs(((t - i + M / 2 + M) % M) - M / 2) < 10)) teeth.push(i); }
  return (GSPR[k] = { k, px, w, h, cx, cy, Rmax, A, teeth: teeth.map(i => i / M * 2 * Math.PI) });
}
function gearSkin(G, i) {   // подобрать рисунок и целое увеличение под прежний радиус колеса
  const opts = []; for (const k of [39, 41, 46, 47]) { const d = gsprData(k); if (!d) continue; for (let m = 1; m <= 5; m++) { const R = m * d.Rmax / 40; if (R <= G.R + 0.04) opts.push({ k, m, R }); } }
  if (!opts.length) return; opts.sort((a, b) => b.R - a.R); let top = opts.filter(o => o.R > opts[0].R - 0.15); const mMin = Math.min(...top.map(o => o.m)); top = top.filter(o => o.m === mMin); const o = top[i % top.length];   // пиксель покрупнее не берём, если можно мельче
  G.sp = { k: o.k, m: o.m }; G.R0 = G.R; G.R = o.R;
}
function gearSolidSpr(G, du, dh) {   // твёрдость по пикселю повёрнутого рисунка
  const d = GSPR[G.sp.k], s = 40 / G.sp.m, c = Math.cos(G.ang), sn = Math.sin(G.ang), sx = du, sy = -dh;
  return d.A(d.cx + (sx * c + sy * sn) * s, d.cy + (-sx * sn + sy * c) * s);
}
const gearTeethN = G => G.sp ? GSPR[G.sp.k].teeth.length : gearN(G.R);
function gearToothSpr(G, i) { const th = G.ang + GSPR[G.sp.k].teeth[i], r = G.R - 0.04 * G.sp.m; return { du: Math.cos(th) * r, dh: -Math.sin(th) * r }; }
function gsprFrame(k, st) {   // рисунок, повёрнутый на st/64 оборота, ближайшим пикселем
  const key = k + '|' + st; let c = gsprCache.get(key); if (c) return c; const d = GSPR[k]; if (!d) return null;
  const sz = Math.ceil(d.Rmax * 2) + 2, o = sz / 2, a = st / GSPR_N * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
  c = document.createElement('canvas'); c.width = c.height = sz; const x2 = c.getContext('2d'), im = x2.createImageData(sz, sz), Dd = im.data;
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) { const sx = x + 0.5 - o, sy = y + 0.5 - o, tx = Math.floor(d.cx + sx * ca + sy * sa), ty = Math.floor(d.cy - sx * sa + sy * ca);
    if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) continue; const j = (ty * d.w + tx) * 4; if (!d.px[j + 3]) continue; const i = (y * sz + x) * 4; Dd[i] = d.px[j]; Dd[i + 1] = d.px[j + 1]; Dd[i + 2] = d.px[j + 2]; Dd[i + 3] = 255; }
  x2.putImageData(im, 0, 0); gsprCache.set(key, c); return c;
}
function drawGearSpr(G, b, fc) {
  const cx = W / 2 + relU(G, b) * S, cy = H / 2 - (G.y - cam.y) * S, st = ((Math.round(G.ang / (Math.PI * 2) * GSPR_N) % GSPR_N) + GSPR_N) % GSPR_N, fr = gsprFrame(G.sp.k, st); if (!fr) return false;
  const k = S / 40 * G.sp.m, w = fr.width * k; ctx.imageSmoothingEnabled = false; ctx.drawImage(fr, Math.round(cx - w * fc / 2), Math.round(cy - w / 2), Math.round(w * fc), Math.round(w)); return true;
}

function addSpriteGears() {   // сцепленные шестерни автора рядом с колёсами на стенах (v223)
  const R = rng((LEVEL.seed || 1) + 5309), base = gears.filter(G => !G.deco && !G.pist && !G.soft && !G.sp && G.y < 900); let n = 0;
  const kinds = [[46, 2], [41, 2], [39, 2]].filter(([k]) => gsprData(k));   // маленькие (47, 39×1) не ставим: колесо радиусом 0.7 сбрасывает героя за полсекунды
  const near = (o, x, y, z, r) => o && Math.hypot(o.x - x, o.z - z) < r && Math.abs(o.y - y) < r;
  for (const M of base) { if (n >= 5 || R() > 0.85) continue;
    const [k, m] = kinds[Math.floor(R() * kinds.length)], d = GSPR[k], Rs = m * d.Rmax / 40, Dc = M.R + Rs - 0.28, f = M.f % 4, r = SKIN_R[f], N = SKIN_N[f];
    const mu = M.x * r[0] + M.z * r[1], md = M.x * N[0] + M.z * N[1];
    for (const a of (R() < 0.5 ? [0.6, Math.PI - 0.6, 0.25, Math.PI - 0.25] : [Math.PI - 0.6, 0.6, Math.PI - 0.25, 0.25])) {   // сбоку и выше своего колеса: над шестернёй свободно
      const cu = mu + Math.cos(a) * Dc, cy = M.y + Math.sin(a) * Dc, at = (u, y) => [u * r[0] + md * N[0], y, u * r[1] + md * N[1]], c = at(cu, cy);
      let ok = true;   // круг свободен от кубов на глубине колеса (уступы, стены)
      for (let du = -Rs - 0.3; du <= Rs + 0.3 && ok; du += 0.25) for (let dy = -Rs - 0.3; dy <= Rs + 0.6 && ok; dy += 0.25) if (du * du + dy * dy <= (Rs + 0.3) * (Rs + 0.3) || (dy > Rs - 0.3 && Math.abs(du) < Rs * 0.8)) { const p = at(cu + du, cy + dy); if (hasCube(Math.round(p[0]), Math.floor(p[1]), Math.round(p[2]))) ok = false; }
      if (!ok) continue;
      for (let du = -0.6; du <= 0.6 && ok; du += 0.3) for (let dy = 0; dy <= 1.5 && ok; dy += 0.25) { const p = at(cu + du, cy + Rs + dy); const X = Math.round(p[0]), Y = Math.floor(p[1]), Z = Math.round(p[2]), Xb = Math.round(p[0] - N[0]), Zb = Math.round(p[2] - N[1]);
        if (hasCube(X, Y, Z) || hasCube(Math.round(p[0] + N[0]), Y, Math.round(p[2] + N[1])) || (hasCube(Xb, Y - 1, Zb) && !hasCube(Xb, Y, Zb))) ok = false;   // над верхом — место на рост героя: пусто на её ряду и ближе к камере, и за ней нет открытого верха стены (на него герой встал бы)
        if (gears.some(G => Math.hypot(G.x - p[0], G.z - p[2], G.y - p[1]) < G.R + 0.15)) ok = false; }
      if (!ok) continue;
      let reach = false;   // рядом уступ, с которого допрыгнуть до верха шестерни (как у колёс на стенах)
      for (let t = Math.floor(cu - Rs - 3); t <= Math.ceil(cu + Rs + 3) && !reach; t++) { if (Math.abs(t - cu) < Rs * 0.8) continue; const p = at(t, 0);
        for (let y = Math.floor(cy + Rs - 1.5); y <= Math.ceil(cy + Rs + 0.5); y++) if (hasCube(Math.round(p[0]), y - 1, Math.round(p[2])) && !hasCube(Math.round(p[0]), y, Math.round(p[2])) && !hasCube(Math.round(p[0]), y + 1, Math.round(p[2])) && cy + Rs - y <= 1.0) { reach = true; break; } }
      if (!reach) continue;
      if (gears.some(G => G !== M && Math.hypot(G.x - c[0], G.z - c[2], G.y - c[1]) < G.R + Rs + 0.2)) continue;
      if ((LEVEL.ladders || []).some(L => L.f % 4 === f && Math.abs(L.t - cu) < Rs + 1 && L.y1 > cy - Rs - 1 && L.y0 < cy + Rs + 1)) continue;
      if (['doors', 'lamps', 'rings', 'steams', 'fires', 'traps', 'items', 'movers'].some(kk => (LEVEL[kk] || []).some(o => near(o, c[0], c[1], c[2], Rs + 1.5)))) continue;
      if ((LEVEL.pipes || []).some(P => (P.pts || []).some(p => near({ x: p[0], y: p[1], z: p[2] }, c[0], c[1], c[2], Rs + 1)))) continue;
      if ((LEVEL.path || []).some(q => q.f % 4 === f && q.b + 1.5 > cu - Rs && q.a - 1.5 < cu + Rs && cy - Rs > q.top - 0.5 && cy - Rs < q.top + 2.6)) continue;   // не нависает низко над тропой
      gears.push({ x: c[0], y: cy, z: c[2], f, R: Rs, sp: { k, m }, mesh: M, ang: R() * 6.28, om: 0, on: false, extra: 0, drive: 0, add: true }); n++; break; } }
}
// ====================== МОЗГ ТИТАНА ======================
// Колба с мозгом в кабине, сверху её трубы уходят в потолок. Пока колба цела, удары по ней только звенят. По бокам на полках —
// две кнопки-узла с листа автора (v219, вместо малых колб): каждый удар вдавливает кнопку на ступень; нажал обе до конца — большая
// колба трескается на несколько секунд, мозг можно бить. Потом кнопки поднимаются.
// Три фазы. Каждая атака сначала предупреждает (подсказка F, как от удара робота): F — кувырок в сторону, урона нет.
// Атаки: лазер по высоте героя; пар из свисающих с потолка паровых труб; струи воды из труб под потолком (смывают, пол мокрый);
// огонь из тех же труб (горящие капли, пол горит); пресс с потолка; молнии — картинки тока от вилки (по мокрому полу — по всему);
// призыв бешеных охотников.
let boss = null;
// лёгкая дрожь колбы (v227, Алексей: «слишком статичен, хоть немного пусть трясётся»): вся колба с трубами на 1 точку листа, в ритме, без рывков картинки
const BRAIN_JIT = [[0, 0], [1, 0], [0, 0], [0, 1], [-1, 0], [0, 0], [1, 1], [0, 0], [-1, 0], [0, 1]];
function brainJit(k) { const j = BRAIN_JIT[Math.floor(game.time * 11) % BRAIN_JIT.length], m = boss && !boss.shield ? 2 : 1; return [Math.round(j[0] * k * m), Math.round(j[1] * k * m)]; }   // колба треснула — дрожит сильнее
const BRAIN = D.brain ? { fw: D.brain.fw, fh: D.brain.fh, ppu: 28, n: D.brain.n || 1 } : { fw: 128, fh: 139, ppu: 28, n: 8 };   // v226: 8 кадров, совмещённых по подставке (tools/brain_build3.py) — мозг живой, колба не гуляет
function spawnBoss() {
  const L = LEVEL.boss; if (!L) { boss = null; return; }
  boss = { x: L.x, y: L.y, z: L.z, F: L.F, xa: L.xa, xb: L.xb, ceil: L.ceil, vents: L.vents, drops: L.drops, noz: L.noz, hp: 36, max: 36, phase: 1, shield: true, open: 0,
    nodes: L.nodes.map(n => ({ x: n.x, y: n.y, z: L.z, hp: 4, max: 4, dead: false, flash: 0 })), atkT: 3.5, atk: null, fr: 0, flash: 0, dead: false, deathT: 0, active: false, wet: 0, minions: [], said: false, ring: 0,
    steams: L.vents.map((x, i) => ({ x, y: L.F + 1.9, z: L.z - 0.05, down: true, ph: 0, var: i, warn: false })) };
}
const bossRoomHas = e => boss && e.y > boss.F - 4 && e.y < boss.ceil + 4 && e.x > boss.xa - 3 && e.x < boss.xb + 3 && e.y > 2500;
const bossBox = () => [boss.x - 1.8, boss.x + 1.8, boss.F, boss.F + 4.2];   // u0, u1, y0, y1 (вид с юга: u = x)
const NODE_H = 1.4;   // высота кнопки-узла (56 точек листа Kit2)
const K2PX = 40;   // точек листа Kit2 на куб
// деталь k атласа Kit2 (пак автора): по центру cx, низом на by (экранные точки), крупным пикселем; flash — вспышка от удара
function kit2Draw(k, cx, by, flash, flip) {
  const im = img.Kit2, r = D.kit2 && D.kit2[k]; if (!im || !im.width || !r) return null; const s = S / K2PX, w = Math.round(r[2] * s), h = Math.round(r[3] * s), x = Math.round(cx - w / 2), y = Math.round(by - h);
  const put = () => { if (flip) { ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); ctx.drawImage(im, r[0], r[1], r[2], r[3], 0, y, w, h); ctx.restore(); } else ctx.drawImage(im, r[0], r[1], r[2], r[3], x, y, w, h); };
  ctx.save(); ctx.imageSmoothingEnabled = false; put(); if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45; put(); } ctx.restore(); return [x, y, w, h];
}
function bossHurt(fromX, why) { if (boss.atk && boss.atk.dodged) return; hurtHero(fromX, why); }
// удары героя: из checkHits — его замах [fl, fr] по горизонтали и hb[2..3] по высоте
function bossCheckHits(w, fl, fr, hb) {
  if (!boss || boss.dead || !bossRoomHas(hero)) return;
  for (const n of boss.nodes) { if (n.dead || w.done.has(n)) continue;
    if (fl < n.x + 0.75 && fr > n.x - 0.75 && hb[2] < boss.F + 1 + NODE_H && hb[3] > boss.F + 1) { w.done.add(n); n.hp -= hero.fork ? 2 : 1; n.flash = 0.15; sfx('RobotHit3', 0.6, 0.8);
      burst(n.x, n.y + 0.5, n.z + 0.2, { n: 10, cols: ['#a04a3a', '#6a6470', '#3e3a44'], sp: [1.5, 4], life: 0.35 });
      if (n.hp <= 0) { n.dead = true; sfx('RobotHit5', 0.6, 0.6); game.shake = Math.max(game.shake, 0.15); burst(n.x, n.y + 0.4, n.z + 0.2, { n: 16, cols: ['#ff9a40', '#ffd27a', '#a04a3a'], sp: [1.5, 4], life: 0.45 });
        if (boss.nodes.every(q => q.dead)) { boss.shield = false; boss.open = 7 - boss.phase; sfx('RobotHit5', 0.9, 0.5); game.shake = Math.max(game.shake, 0.3); showCombo('Колба треснула — бей мозг!', true); boss.atk = null; boss.atkT = 1.5; }
        else showCombo('Кнопка нажата. Осталась ещё одна', true); } } }
  const B = bossBox();
  if (!w.done.has(boss) && fl < B[1] && fr > B[0] && hb[2] < B[3] && hb[3] > B[2]) { w.done.add(boss);
    if (boss.shield) { sfx('RobotHit3', 0.5, 1.8); burst(hero.x + hero.face * 0.4, hero.y + 0.4, boss.z + 0.3, { n: 8, cols: ['#ffffff', '#bfeaf2'], sp: [1, 3], life: 0.25 }); if (!(boss.ring > 0)) { showCombo('Колба цела — дожми обе кнопки на полках', true); boss.ring = 4; } }
    else { const dm = hero.knife || hero.prom || hero.fork ? 2 : 1; boss.hp -= dm; boss.flash = 0.18; sfx('RobotHit5', 0.8, 0.7); game.hitStop = Math.max(game.hitStop || 0, 0.06);
      burst(hero.x + hero.face * 0.5, hero.y + 0.5, boss.z + 0.3, { n: 22, cols: ['#e07850', '#ff9a70', '#ffffff', '#c04030'], sp: [2, 6], life: 0.5, size: 2 });
      const ph = boss.hp <= 12 ? 3 : boss.hp <= 24 ? 2 : 1;
      if (boss.hp <= 0) bossDie();
      else if (ph !== boss.phase) { boss.phase = ph; bossRepair(); showCombo(ph === 2 ? 'Мозг в ярости: кнопки снова поднялись' : 'Последняя фаза!', true); bossSummon(2); } } }
}
function bossRepair() { boss.shield = true; boss.open = 0; for (const n of boss.nodes) { n.dead = false; n.hp = n.max = 3 + boss.phase; n.flash = 0.3; } }
function bossDie() {
  boss.dead = true; boss.deathT = 0; boss.atk = null; sfx('RobotDeathD', 1, 0.4); game.shake = Math.max(game.shake, 0.5); showCombo('Мозг титана уничтожен!', true); plog('босс', 'мозг уничтожен');
  for (const r of boss.minions) if (!r.dead) { r.hunter = false; r.rage = 0.01; }   // охотники без мозга взрываются
}
function bossSummon(n) {
  const alive = boss.minions.filter(r => !r.dead).length; let made = 0;
  for (const x of boss.drops.slice().sort(() => Math.random() - 0.5)) { if (made >= n || alive + made >= 1 + boss.phase) break; if (Math.abs(x - toU(hero)) < 1.5) continue;
    const top = boss.F + (Math.abs(x) >= 8 ? 1 : 0), r = makeRobot({ x, y: top + 9, z: boss.z, h: [1, 0], R: 9, F: 7.5 });
    r.hunter = true; r.rage = 1e9; r.aggro = 9; r.hp = Math.round(r.hp * 0.7); r.fa = view.k * 90; r.face = Math.sign(toU(hero) - x) || 1; r.bossMin = true;
    r.atk = { type: 'jump', t: -0.75, dir: 1, flip: false, y0: top + 9, x0: x, z0: boss.z, land: { x, z: boss.z, y: top }, done: false, drop: true }; r.anim.play('RobotAC_Jump', { loop: false, restart: true }); r.anim.t = 0.33;
    robots.push(r); boss.minions.push(r); made++; }
  if (made) { whistle(); showCombo('Мозг зовёт охотников!', true); }
}
function bossPick() {
  const P = boss.phase, list = [['laser', 3], ['steam', 2.3], ['crush', 2.2], ['water', 1.8], ['fire', 1.6 + P * 0.3], ['zap', boss.wet > 0 ? 3.5 : 1.6], ['summon', boss.minions.filter(r => !r.dead).length < P ? 1.4 + P * 0.4 : 0]];
  let s = 0; for (const q of list) s += q[1]; let k = Math.random() * s; for (const q of list) { k -= q[1]; if (k <= 0) return q[0]; } return 'laser';
}
const nearNoz = (u, n) => boss.noz.slice().sort((a, b) => Math.abs(a - u) - Math.abs(b - u)).slice(0, n);
function bossStart(type) {
  const hu = toU(hero), F = boss.F, A = { type, t: 0 };
  if (type === 'laser') { const lv = [F + 0.3, F + 1.3, F + 2.3, F + 4.45],   /* v223: четвёртый уровень — над колбой: на голове мозга не отсидеться */ near = lv.reduce((m, y) => Math.abs(y - (hero.y + 0.3)) < Math.abs(m - (hero.y + 0.3)) ? y : m, lv[0]); A.ys = [near]; if (boss.phase === 3) A.ys.push(lv[(lv.indexOf(near) + 1 + Math.floor(Math.random() * 2)) % 4]); A.tel = 1.15 - boss.phase * 0.1; A.fire = 0.45; }
  else if (type === 'steam') { A.xs = boss.vents.slice().sort((a, b) => Math.abs(a - hu) - Math.abs(b - hu)).slice(0, 1 + boss.phase); A.tel = 1.0; A.fire = 1.4; }
  else if (type === 'crush') { A.xs = [Math.max(boss.xa + 1, Math.min(boss.xb - 1, Math.round(hu)))]; if (boss.phase >= 2) A.xs.push(A.xs[0] + (A.xs[0] > 0 ? -4 : 4)); A.tel = 1.15 - boss.phase * 0.1; }
  else if (type === 'water') { A.xs = nearNoz(hu, 1 + boss.phase); A.tel = 0.9; A.fire = 2.2; A.ws = []; }
  else if (type === 'fire') { A.xs = nearNoz(hu, boss.phase + 1); A.tel = 1.0; A.fire = 0.5; A.lit = false; }
  else if (type === 'zap') { A.wide = boss.wet > 0; A.xs = A.wide ? [] : [hu, hu + 2.2 * (Math.random() < 0.5 ? 1 : -1), hu + (Math.random() * 6 - 3)]; A.tel = 0.95; A.fire = 0.5; }
  else if (type === 'summon') { bossSummon(2); A.tel = 0.6; }
  boss.atk = A; sfx(type === 'laser' ? 'RobotHit5' : 'RobotDeathD', 0.3, type === 'laser' ? 2 : 0.8);
}
// предупреждение для уворота: что из начатой атаки заденет героя и через сколько
function bossThreat() {
  if (!boss || boss.dead || !boss.atk || boss.atk.dodged || !bossRoomHas(hero) || hero.state === 'dead') return null;
  const A = boss.atk, t = A.t, hu = toU(hero), F = boss.F; let hit = null, near = 0;
  if (A.type === 'laser') { if (A.ys.some(y => Math.abs(hero.y + 0.3 - y) < 0.6)) hit = A.tel; near = boss.x; }
  else if (A.type === 'steam') { const x = A.xs.find(x => Math.abs(hu - x) < 0.9); if (x !== undefined && hero.y < F + 2) { hit = A.tel; near = x; } }
  else if (A.type === 'crush') { const x = A.xs.find(x => Math.abs(hu - x) < 1.5); if (x !== undefined) { hit = A.tel + 0.16; near = x; } }
  else if (A.type === 'water' || A.type === 'fire') { const x = A.xs.find(x => Math.abs(hu - x) < 0.9); if (x !== undefined) { hit = A.tel + (A.type === 'fire' ? 0.35 : 0.2); near = x; } }
  else if (A.type === 'zap') { if (A.wide ? hero.y < F + 0.6 : A.xs.some(x => Math.abs(hu - x) < 1)) { hit = A.tel; near = A.wide ? hu - hero.face : A.xs.reduce((m, x) => Math.abs(x - hu) < Math.abs(m - hu) ? x : m); } }
  if (hit === null || t > hit + 0.05) return null;
  return { r: null, A, tti: Math.max(0, hit - t), u: near, span: hit };
}
function updateBoss(dt) {
  if (!boss) return;
  boss.fr += dt * (boss.shield ? 7 : 12); if (boss.flash > 0) boss.flash -= dt; if (boss.ring > 0) boss.ring -= dt; for (const n of boss.nodes) if (n.flash > 0) n.flash -= dt;
  if (boss.wet > 0) boss.wet -= dt;
  if (boss.dead) { boss.deathT += dt; if (boss.deathT < 2.6 && Math.random() < dt * 14) { const x = boss.x + rnd(-1.6, 1.6), y = boss.F + rnd(0.5, 4); burst(x, y, boss.z + 0.3, { n: 16, cols: ['#ff7014', '#ffce46', '#e07850', '#2a2226', '#ffffff'], sp: [2, 7], life: 0.6, size: 2 }); sfx('RobotDeathD', 0.4, 0.8 + Math.random() * 0.5); game.shake = Math.max(game.shake, 0.18); }
    if (boss.deathT >= 2.6 && !boss.exitOpen) { boss.exitOpen = true; doors.push({ x: boss.xb, y: boss.F, z: boss.z, f: 0, final: true, spr: 'door1' }); showCombo('Выход открыт — справа', true); game.guideOn = true; }
    return; }
  const inR = bossRoomHas(hero) && hero.state !== 'dead'; if (!inR) { if (boss.active) { boss.active = false; boss.atk = null; } return; }
  if (!boss.active) { boss.active = true; boss.atkT = 2.5; if (!boss.said) { boss.said = true; showCombo('Мозг титана. Дожми обе кнопки на полках — колба треснет. F — увернуться', true); sfx('RobotDeathD', 0.8, 0.35); game.shake = Math.max(game.shake, 0.2); } }
  if (!boss.shield) { boss.open -= dt; if (Math.random() < dt * 6) zapBolt({ x: boss.x + rnd(-1.2, 1.2), y: boss.F + rnd(1.5, 3.8), z: boss.z + 0.2 }, { x: boss.x + rnd(-1.2, 1.2), y: boss.F + rnd(1.5, 3.8), z: boss.z + 0.2 }, 0.12, 0.35, true);
    if (boss.open <= 0) { bossRepair(); showCombo('Кнопки снова поднялись', true); } }
  for (const q of boss.steams) q.warn = false;
  const hu = toU(hero), F = boss.F, A = boss.atk;
  if (!A) { boss.atkT -= dt * (boss.shield ? 1 : 0.5); if (boss.atkT <= 0) bossStart(bossPick()); return; }
  A.t += dt; const t = A.t, done = cd => { boss.atk = null; boss.atkT = cd - boss.phase * 0.45; };
  const drip = (x, cols, n) => { if (Math.random() < dt * n) parts.push({ x: x + rnd(-0.12, 0.12), y: F + 8.9, z: boss.z + 0.1, vx: 0, vz: 0, vy: -rnd(0.5, 2), g: 9, drag: 0, t: 0, life: rnd(0.4, 0.9), size: 2, col: pick(cols) }); };
  if (A.type === 'laser') { if (t >= A.tel && t - dt < A.tel) { sfx('RobotHit5', 0.7, 2.4); game.shake = Math.max(game.shake, 0.08); }
    if (t >= A.tel && t < A.tel + A.fire) for (const y of A.ys) if (Math.abs(hero.y + 0.3 - y) < 0.38) bossHurt(boss.x, 'лазер мозга');
    if (t >= A.tel + A.fire) done(2.6); }
  else if (A.type === 'steam') { for (const q of boss.steams) if (A.xs.includes(q.x)) { q.warn = t < A.tel; q.ph = (t - A.tel) - game.time; if (t >= A.tel && t < A.tel + A.fire && Math.abs(hu - q.x) < 0.55 && hero.y < q.y) bossHurt(q.x, 'пар'); }
    if (t >= A.tel && t - dt < A.tel) sfx('RUN_1_13', 0.6, 0.5);
    if (t >= A.tel + A.fire + 0.6) done(2.4); }
  else if (A.type === 'crush') {
    for (const x of A.xs) if (t > A.tel && t < A.tel + 0.3 && Math.abs(hu - x) < 1.15 && hero.y + hero.h > crushY(A) - 0.05 && hero.y < crushY(A)) { bossHurt(x, 'пресс'); hero.vy = -2; }
    if (t >= A.tel + 0.16 && t - dt < A.tel + 0.16) { sfx('Jump_4_landfall', 1, 0.4); sfx('RobotHit5', 0.8, 0.4); game.shake = Math.max(game.shake, 0.3); for (const x of A.xs) burst(x, F + 0.1, boss.z + 0.2, { n: 20, cols: DIRT, sp: [1.5, 4], up: 1.2, life: 0.5 }); }
    if (t >= A.tel + 1.9) done(2.4); }
  else if (A.type === 'water') { if (t < A.tel) for (const x of A.xs) drip(x, ['#bfeaf2', '#5fc3dc'], 14);
    if (t >= A.tel && !A.ws.length) { for (const x of A.xs) { const w = { x, y: F + 8.85, z: boss.z + 0.05, bottom: F, ph: 0, head: F + 8.85, tail: F + 8.85, spl: 0, temp: A.fire, boss: true }; waters.push(w); A.ws.push(w); } sfx('RUN_1_13', 0.7, 0.45); }
    for (const w of A.ws) if (Math.abs(hu - w.x) < 0.45 && hero.y + 0.5 > w.head && hero.y < w.tail && !(hero.washT > 0) && !A.dodged) { hero.washT = 0.9; hero.washV = 7.5; hero.washDir = Math.sign(hu - w.x) || (hu < boss.x ? -1 : 1); hero.wetDrip = 2.5; if (hero.burn > 0) hero.burn = 0; if (!hero.onGround) hero.vy = Math.min(hero.vy, -3); sfx('RUN_1_13', 0.5, 0.6); showCombo('Смыло!', true); }
    if (A.ws.some(w => w.head <= F + 0.05)) boss.wet = Math.max(boss.wet, 6);
    if (t >= A.tel + A.fire + 0.8) done(1.8); }
  else if (A.type === 'fire') { if (t < A.tel) for (const x of A.xs) drip(x, ['#ff7014', '#ffce46', '#e8501a'], 16);
    else if (t < A.tel + A.fire) { for (const x of A.xs) if (Math.random() < dt * 40) parts.push({ x: x + rnd(-0.2, 0.2), y: F + 8.8, z: boss.z + 0.1, vx: rnd(-0.4, 0.4), vz: 0, vy: -rnd(6, 10), g: 12, drag: 0, t: 0, life: 0.6, size: 3, col: pick(['#fff6cf', '#ffce46', '#ff7014', '#e8501a']) });
      if (!A.lit && t >= A.tel + 0.35) { A.lit = true; for (const x of A.xs) fires.push({ x, y: F + 0.08, z: boss.z, life: 2.6 + boss.phase * 0.5, smk: 0, delay: 0, trap: true, boss: true, fl: [{ dx: 0, dy: 0, sc: 1, flip: Math.random() < 0.5, ph: rnd(0, 9), sp: 1, hot: false }] }); sfx('RobotDeathB', 0.5, 1.3); } }
    if (t >= A.tel + A.fire + 0.3) done(2.2); }
  else if (A.type === 'zap') { const seg = (x, y0, y1) => { let px = x + rnd(-0.2, 0.2); for (let y = y0; y > y1 + 0.01; y -= 2.2) { const ny = Math.max(y1, y - 2.2), nx = x + rnd(-0.35, 0.35); zapBolt({ x: px, y, z: boss.z + 0.3 }, { x: nx, y: ny, z: boss.z + 0.3 }, 0.12, 0.6, true); px = nx; } };
    if (t < A.tel) { if (Math.random() < dt * 30) { const x = A.wide ? rnd(boss.xa, boss.xb) : pick(A.xs) + rnd(-0.4, 0.4); parts.push({ x, y: F + 0.05, z: boss.z + 0.3, vx: rnd(-1, 1), vz: 0, vy: rnd(1, 3), g: 6, drag: 0, t: 0, life: 0.25, size: 1, col: pick(['#ffffff', '#8fe8ff']) }); } }
    else if (t < A.tel + A.fire) { if (Math.random() < dt * 12) { if (A.wide) { const x = rnd(boss.xa, boss.xb); zapBolt({ x, y: F + 0.1, z: boss.z + 0.3 }, { x: x + rnd(1.2, 2.4) * (Math.random() < 0.5 ? 1 : -1), y: F + 0.15, z: boss.z + 0.3 }, 0.12, 0.5, true); } else for (const x of A.xs) seg(x, F + 8.8, F + 0.05); }   // молнии — картинки тока, как у вилки
      if (A.wide ? hero.y < F + 0.3 && hero.onGround : A.xs.some(x => Math.abs(hu - x) < 0.6) && hero.y < F + 2.2) bossHurt(hu - hero.face, A.wide ? 'ток по мокрому полу' : 'молния мозга'); }
    else done(2.6); }
  else if (A.type === 'summon') { if (t > A.tel) done(3); }
  boss.minions = boss.minions.filter(r => !r.dead || game.time - (r.diedAt || game.time) < 5);
}
function crushY(A) { const t = A.t, top = boss.ceil + 1, F = boss.F; if (t < A.tel) return top; if (t < A.tel + 0.16) return top - (top - (F + 0.35)) * ((t - A.tel) / 0.16) ** 2; if (t < A.tel + 0.85) return F + 0.35; return Math.min(top, F + 0.35 + (t - A.tel - 0.85) * 7); }
// Y на роботе (висишь на нём или стоишь на спине): робот взлетает вместе с героем и затаскивает его в кабину к мозгу
function startBossTaxi(r) {
  if (!LEVEL.boss || game.bossTaxi || r.dead) return; const d = doors.find(q => q.room && complexAt(q.y) && complexAt(q.y).boss); if (!d) return;
  game.bossTaxi = { r, t: 0, d }; r.flyUp = 0.001; r.atk = null; r.stun = 0; hero.hook = null; sfx('RobotDeathD', 0.7, 0.5); cannonSound(); showCombo('Робот тащит тебя к мозгу!', true);
  if (!hero.ride) { hero.ride = { r, mode: 'hang' }; hero.rideU = null; go('Take'); hero.hangPop = hero.y - (r.y + ROBOT_SHOULDER - HANG_Y); hero.vx = hero.vy = 0; hero.onGround = false; hero.standOn = null; placeRider(); }   // стоял на спине — хватается за плечи
}
function updateBossTaxi(dt) {
  const T = game.bossTaxi; if (!T) return; T.t += dt;
  if (T.t > 0.9 && !(game.fadeT > 0.2)) game.fadeT = 0.6;
  if (T.t > 1.25) { const d = T.d; robots = robots.filter(q => q !== T.r); hero.ride = null; hero.standOn = null; hero.hang = null; hero.ladder = null; hero.x = d.x; hero.y = d.y + 0.02; hero.z = d.z; hero.vx = hero.vy = 0; hero.onGround = false; hero.rideCool = 0.8;
    setView(0); cam.x = hero.x; cam.y = hero.y + 1.2; cam.z = hero.z; cam.gy = null; game.fadeT = 0.6; game.bossTaxi = null; go('Fly'); plog('такси', 'к мозгу'); updateHUD(); }
}
// ---- рисование

// ---- рисование
function drawBoss(b) {
  if (!boss || cam.y < 2500 || Math.abs(cam.y - boss.F) > 30) return;
  const im = img.Brain, g = Math.max(2, Math.round(S * 0.04)), X = x => Math.round(W / 2 + (x - cam.x) * S), Y = y => Math.round(H / 2 - (y - cam.y) * S), F = boss.F, Z = 7.95;
  // трубы: магистраль под потолком с соплами, паровые трубы свисают к паровым соплам, две трубы колбы уходят в потолок
  drawPipeSeg([boss.xa - 0.6, F + 8.55, Z], [boss.xb + 0.6, F + 8.55, Z], b, 1, false);
  for (const x of boss.noz) { drawPipeSeg([x, F + 8.55, Z], [x, F + 8.05, Z], b, 3, false); ctx.fillStyle = '#231d21'; ctx.fillRect(X(x) - g * 2, Y(F + 8.05), g * 4, g * 2); }
  for (const q of boss.steams) drawPipeSeg([q.x, F + 8.55, Z], [q.x, q.y + 0.25, Z], b, 5, false);
  // v227: трубы и трубки колбы продлеваются вверх, сквозь потолок за край карты — одним цельным куском (строка самой трубы с листа, растянутая по высоте: без стыков)
  { const fi0 = Math.floor(boss.fr) % BRAIN.n, st = D.brain && D.brain.stubs ? D.brain.stubs[fi0] : null, imB = img.Brain;
    if (st && imB && imB.width && !(boss.dead && boss.deathT > 2.6)) { const k = S / BRAIN.ppu, bj = brainJit(k), sx = Math.round(X(boss.x) - BRAIN.fw * k / 2) + bj[0], sy = Y(F) - Math.round(BRAIN.fh * k) + bj[1], yEnd = Math.min(Y(F + 16), -10);
      ctx.imageSmoothingEnabled = false; if (boss.dead) ctx.globalAlpha = Math.max(0, 1 - boss.deathT / 2.6);
      for (const [xa, xb, top, rs] of st) { const r = rs !== undefined ? rs : top + 2, dx = sx + Math.round(xa * k), dw = Math.round((xb - xa) * k), y1 = sy + Math.round(r * k);
        ctx.drawImage(imB, fi0 * BRAIN.fw + xa, r, xb - xa, 1, dx, yEnd, dw, y1 - yEnd); }
      ctx.globalAlpha = 1; } }
  for (const q of boss.steams) drawSteam(q, b);
  // кнопки-узлы с листа автора: кадр 0 — кнопка поднята, 4 — почти вдавлена, 5 — нажата до конца (горит огонёк); кабели к колбе
  const kB = S / BRAIN.ppu, fi = Math.floor(boss.fr) % BRAIN.n;
  for (const n of boss.nodes) {
    ctx.fillStyle = '#2a2226'; for (let i = 0; i <= 22; i++) { const tt = i / 22, x = n.x + (boss.x + Math.sign(n.x) * 1.6 - n.x) * tt, y = F + 1.9 + (F + 3 - F - 1.9) * tt - Math.sin(tt * Math.PI) * 0.7; ctx.fillRect(X(x) - g, Y(y) - g, g * 2, g * 2); }   // кабель
    const fr = n.dead ? 5 : Math.max(0, Math.min(4, Math.floor((1 - n.hp / (n.max || 4)) * 5)));
    kit2Draw(62 + fr, X(n.x), Y(F + 1), n.flash > 0); }
  // колба
  if (im && im.width && !(boss.dead && boss.deathT > 2.6)) { const k = kB, w = BRAIN.fw * k, h = BRAIN.fh * k, bj = brainJit(k), sx = Math.round(X(boss.x) - w / 2) + bj[0], sy = Y(F) - Math.round(h) + bj[1];
    ctx.imageSmoothingEnabled = false; if (boss.dead) ctx.globalAlpha = Math.max(0, 1 - boss.deathT / 2.6);
    ctx.drawImage(im, fi * BRAIN.fw, 0, BRAIN.fw, BRAIN.fh, sx, sy, Math.round(w), Math.round(h));
    if (boss.flash > 0 || (!boss.shield && Math.sin(game.time * 18) > 0.6)) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = boss.flash > 0 ? 0.6 : 0.18; ctx.drawImage(im, fi * BRAIN.fw, 0, BRAIN.fw, BRAIN.fh, sx, sy, Math.round(w), Math.round(h)); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
    if (!boss.shield && !boss.dead) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; const crack = (x0, y0, seed) => { let x = x0, y = y0; for (let i = 0; i < 9; i++) { x += ((seed * 7 + i * 13) % 5 - 2) * g; y += g * (i % 2 ? 1 : 2); ctx.fillRect(x, y, g, g); } };
      crack(sx + w * 0.3, sy + h * 0.25, 1); crack(sx + w * 0.62, sy + h * 0.22, 2); crack(sx + w * 0.45, sy + h * 0.3, 3); }
    pixelGlow(X(boss.x), Y(F + 3), 2.6, (boss.shield ? 0.05 : 0.1) + 0.03 * Math.sin(game.time * 3), boss.shield ? '255,60,40' : '255,140,100'); }
  // атаки
  const A = boss.atk; if (!A || boss.dead) return;
  if (A.type === 'laser') for (const y of A.ys) { const yy = Y(y), on = A.t >= A.tel, x0 = X(boss.xa - 0.5), x1 = X(boss.xb + 0.5);
    if (!on) { ctx.fillStyle = 'rgba(255,40,30,' + (0.35 + 0.35 * Math.sin(A.t * 30)).toFixed(2) + ')'; for (let x = x0; x < x1; x += g * 3) ctx.fillRect(x, yy, g * 2, Math.max(1, g / 2)); }
    else { ctx.fillStyle = 'rgba(255,40,30,0.35)'; ctx.fillRect(x0, yy - g * 3, x1 - x0, g * 6); ctx.fillStyle = '#ff3a2a'; ctx.fillRect(x0, yy - g, x1 - x0, g * 2); ctx.fillStyle = '#fff0e8'; ctx.fillRect(x0, yy - Math.max(1, g / 2), x1 - x0, Math.max(1, g)); pixelGlow(X(boss.x), Y(F + 3), 1.5, 0.3, '255,60,40'); } }
  else if (A.type === 'crush') for (const x of A.xs) { const yb = crushY(A), x0 = X(x - 1.1), ww = Math.round(2.2 * S), y0 = Y(boss.ceil + 1), y1 = Y(yb);
    if (A.t < A.tel) { ctx.fillStyle = 'rgba(255,40,30,' + (0.25 + 0.2 * Math.sin(A.t * 24)).toFixed(2) + ')'; ctx.fillRect(x0, Y(F + 0.1), ww, g * 2); }
    ctx.fillStyle = '#1c1719'; ctx.fillRect(x0, y0, ww, Math.max(g * 2, y1 - y0)); ctx.fillStyle = '#5d5762'; ctx.fillRect(x0 + g, y0, ww - g * 2, Math.max(g, y1 - y0 - g * 2));
    ctx.fillStyle = '#e0a020'; for (let xx = x0 + g; xx < x0 + ww - g * 3; xx += g * 4) ctx.fillRect(xx, y1 - g * 3, g * 2, g * 2); }
  else if ((A.type === 'water' || A.type === 'fire') && A.t < A.tel) for (const x of A.xs) pixelGlow(X(x), Y(F + 8), 0.7, 0.15 + 0.1 * Math.sin(A.t * 25), A.type === 'fire' ? '255,120,30' : '120,220,255');   // сопло наливается
}
function drawBossFloor() {   // мокрый пол — тонкая голубая полоса; поверх всего — полоса здоровья
  if (!boss || cam.y < 2500 || Math.abs(cam.y - boss.F) > 30) return;
  const g = Math.max(2, Math.round(S * 0.04)), F = boss.F;
  if (boss.wet > 0) { ctx.fillStyle = 'rgba(95,195,220,' + Math.min(0.5, boss.wet * 0.15).toFixed(2) + ')'; ctx.fillRect(Math.round(W / 2 + (boss.xa - 0.5 - cam.x) * S), Math.round(H / 2 - (F + 0.12 - cam.y) * S), Math.round((boss.xb - boss.xa + 1) * S), Math.round(0.12 * S) + g); }
  if (boss.active || boss.dead) { ctx.fillStyle = 'rgba(70,4,10,0.2)'; ctx.fillRect(0, 0, W, H); }   // красный полумрак кабины
  if (boss.atk && boss.atk.type === 'zap' && boss.atk.t < boss.atk.tel && !boss.atk.wide) for (const x of boss.atk.xs) { const X0 = Math.round(W / 2 + (x - cam.x) * S); pixelGlow(X0, Math.round(H / 2 - (F + 0.1 - cam.y) * S), 0.7, 0.2 + 0.1 * Math.sin(game.time * 30), '255,255,255'); pixelGlow(X0, Math.round(H / 2 - (F + 8.6 - cam.y) * S), 0.6, 0.18, '140,230,255'); }
  if (boss.active && !boss.dead) { const bw = Math.min(520, W * 0.5), x0 = Math.round(W / 2 - bw / 2), y0 = H - 64;
    ctx.fillStyle = 'rgba(10,8,14,0.8)'; ctx.fillRect(x0 - 4, y0 - 4, bw + 8, 18); ctx.fillStyle = '#4a1612'; ctx.fillRect(x0, y0, bw, 10); ctx.fillStyle = boss.shield ? '#c0392b' : '#ff7a4a'; ctx.fillRect(x0, y0, Math.round(bw * Math.max(0, boss.hp) / boss.max), 10);
    ctx.fillStyle = '#fff4e1'; ctx.font = '13px monospace'; ctx.textAlign = 'center'; ctx.fillText('МОЗГ ТИТАНА' + (boss.shield ? ' · колба цела' : ' · колба треснула!'), W / 2, y0 - 9); ctx.textAlign = 'left'; }
}
// v223 (просьба Алексея): на колбу мозга можно запрыгнуть. Верх — по силуэту картинки колбы: крышка 4.15 куба над полом (±1 куб от середины),
// плечи 3.85 (до ±1.8), пологий край купола 3.6 и 3.35 (до ±2.25) — на край долетает прыжок из приседа с площадки рядом, оттуда — на крышку. Только сверху: сбоку колба не держит, сквозь неё по полу проходишь, как раньше. Растаяла после гибели — опоры нет.
// край колбы, как край уступа: в прыжке дотянулся руками до верха — герой сам подтягивается и встаёт (с пола не достать — только с площадок рядом)
function bossMantle() {
  if (!boss || (boss.dead && boss.deathT > 2.4) || hero.onGround || hero.hang || hero.ladder || hero.ride || hero.state === 'dead' || hero.vy < -6) return;   // и на подъёме: руки выше края — хватается (не пролетает сквозь стекло)
  if (hero.y < 2500 || Math.abs(hero.y - boss.F) > 9 || Math.abs(toD(hero) - boss.z) > 1.2) return;
  const hu = toU(hero), du = Math.abs(hu - boss.x); if (du < 0.9 || du > 2.45) return;
  const uu = boss.x + Math.sign(hu - boss.x) * Math.min(du, 2.15), t = bossCapTop(Math.abs(uu - boss.x)); if (t === null) return; if (hero.y >= t - 0.02 || hero.y + 0.95 < t) return;   // руки ниже края — не достал
  if (overlapsDepth(uu, t + 0.02, hero.hw, hero.h - 0.04, toD(hero))) return;
  setUD(hero, uu, toD(hero)); hero.y = t + 0.01; hero.vy = 0; hero.vx *= 0.3; sfx('Jump_4_landfall', 0.4, 1.2);
}
const bossCapTop = du => du < 1.0 ? boss.F + 4.15 : du < 1.8 ? boss.F + 3.85 : du < 2.0 ? boss.F + 3.6 : du < 2.25 ? boss.F + 3.35 : null;   // верх колбы по силуэту картинки
function bossSupport(u, yFeet, depth, best) {
  if (!boss || (boss.dead && boss.deathT > 2.4) || yFeet < 2500 || Math.abs(yFeet - boss.F) > 9 || Math.abs(depth - boss.z) > 1.2) return best;
  const top = bossCapTop(Math.abs(u - boss.x)); if (top === null) return best;
  if (top <= yFeet + 0.14 && top > yFeet - 0.6 && (!best || top > best.top)) best = { top, r: boss.cap || (boss.cap = { x: boss.x, z: boss.z, cap: true }) };
  return best;
}
// ====================== ПУШКИ В КАБИНЕ МОЗГА (v220) ======================
// Детали с листа автора (атлас Kit2), просьба Алексея 13.10. Стреляют вместе с соплами мозга, но одновременно — только одна пушка.
// Перед каждым выстрелом пушка предупреждает (подсказка F, как у мозга и роботов): F — кульбит, урона нет.
//  лазер (58)       — ездит по рельсу левой стены поближе к высоте героя и бьёт лучом в него (наискось, ступеньками пикселей, без сглаживания);
//  вода (59)        — так же по правой стене, прицельная струя сбивает с ног и смывает (без урона), пол мокнет — ток мозга бьёт по всему полу;
//  огненный шар (55) и пули (56) — на настенных установках (61) повыше, бьют прицельно; шар поджигает героя и пол;
//  пар (57, 60)     — ездят под потолком над героем, струя вниз до пола.
let turrets = [], tShots = [], tGap = 0;
const TUR = { 58: { my: 0.66 }, 59: { my: 0.58 }, 55: { my: 0.72 }, 56: { my: 0.64 }, 57: { my: 0.6 }, 60: { my: 0.64 } };   // высота дула от низа (доля высоты картинки)
const k2w = k => (D.kit2 && D.kit2[k] ? D.kit2[k][2] / K2PX : 1.5), k2h = k => (D.kit2 && D.kit2[k] ? D.kit2[k][3] / K2PX : 1.2);
function spawnTurrets() {
  turrets = []; tShots = []; tGap = 4; if (!boss) return; const F = boss.F, L = boss.xa - 0.5, Rw = boss.xb + 0.5;
  const add = (kind, k, x, y, dir, rail) => turrets.push({ kind, k, x, y, dir, rail, ty: y, tx: x, cd: rnd(1.5, 5), st: 'idle', t: 0, shot: null, flash: 0, sp: 0 });
  add('laser', 58, L + k2w(58) / 2 + 0.05, F + 1.05, 1, 'v'); add('water', 59, Rw - k2w(59) / 2 - 0.05, F + 1.05, -1, 'v');
  add('fire', 55, L + k2w(55) / 2 + 0.05, F + 3.2 + k2h(61), 1, null); add('bullets', 56, Rw - k2w(56) / 2 - 0.05, F + 3.2 + k2h(61), -1, null);
  add('steam', 57, -4.5, F + 8.45, 0, 'h'); add('steam', 60, 4.5, F + 8.45, 0, 'h');
}
const tMuzzle = q => q.rail === 'h' ? { x: q.x, y: q.y - k2w(q.k) + 0.05 } : { x: q.x + q.dir * k2w(q.k) / 2, y: q.y + TUR[q.k].my * k2h(q.k) };
const tHeroIn = (y0, y1) => hero.y < y1 && hero.y + 1.0 > y0;   // тело героя по высоте
function tAim(q, S0) {   // луч лазера и воды: из дула в середину героя и дальше до стены, пола или потолка
  const m = tMuzzle(q), F = boss.F; let dx = toU(hero) - m.x, dy = hero.y + 0.5 - m.y; if (dx * q.dir < 0.5) dx = q.dir * 0.5; const d = Math.hypot(dx, dy); S0.ux = dx / d; S0.uy = dy / d;
  const ts = [S0.ux ? ((S0.ux > 0 ? boss.xb + 0.5 : boss.xa - 0.5) - m.x) / S0.ux : 1e9, S0.uy < 0 ? (F - m.y) / S0.uy : S0.uy > 0 ? (F + 8.5 - m.y) / S0.uy : 1e9]; S0.max = Math.min(...ts.filter(v => v > 0)); S0.x0 = m.x; S0.y0 = m.y;
}
function tOnRay(S0, len, w) { const px = toU(hero) - S0.x0, py = hero.y + 0.5 - S0.y0, s = px * S0.ux + py * S0.uy; return s > 0 && s < len && Math.abs(px * S0.uy - py * S0.ux) < w; }
function turretHurt(q, why) { if (q.shot && q.shot.dodged) return; hurtHero(q.x, why); }
function turretStart(q) {
  const F = boss.F, ph = boss.phase, S0 = { type: 'turret', kind: q.kind, t: 0, dodged: false };
  if (q.kind === 'laser' || q.kind === 'water') { S0.tel = 0.95 - ph * 0.08; S0.fire = q.kind === 'laser' ? 0.45 : 1.3; S0.y = null; S0.len = 0; }
  else if (q.kind === 'steam') { S0.tel = 0.9; S0.fire = 1.3; }
  else if (q.kind === 'fire') { S0.tel = 0.85; S0.fire = 0.2; }
  else if (q.kind === 'bullets') { S0.tel = 0.7; S0.fire = 0.55 + ph * 0.15; S0.n = 0; }
  q.shot = S0; q.st = 'aim'; q.t = 0; q.aimT = 0; sfx('RobotHit5', 0.25, q.kind === 'laser' ? 2.2 : 1.1);
}
function updateTurrets(dt) {
  if (!boss || !turrets.length) return; const F = boss.F, hu = toU(hero);
  for (const s of tShots) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.kind === 'fire' && Math.random() < dt * 40) parts.push({ x: s.x, y: s.y, z: boss.z + 0.2, vx: rnd(-0.5, 0.5), vz: 0, vy: rnd(-0.2, 0.6), g: 0, drag: 2, t: 0, life: 0.35, size: 2, col: pick(['#ffce46', '#ff7014', '#e8501a']) });
    const hit = Math.abs(hu - s.x) < 0.42 && s.y > hero.y - 0.1 && s.y < hero.y + 1.05;
    if (hit && !s.dead) { s.dead = true; if (!s.dodged) { hurtHero(s.x - Math.sign(s.vx), s.kind === 'fire' ? 'огненный шар пушки' : 'пули пушки'); if (s.kind === 'fire') igniteHero(); } burst(s.x, s.y, boss.z + 0.3, { n: 10, cols: s.kind === 'fire' ? ['#ffce46', '#ff7014', '#fff6cf'] : ['#ffd27a', '#a09aa8'], sp: [1, 4], life: 0.3 }); }
    if (!s.dead && (s.y < F + 0.05 || s.x < boss.xa - 0.5 || s.x > boss.xb + 0.5 || s.t > 4)) { s.dead = true;
      if (s.kind === 'fire') { burst(s.x, Math.max(F + 0.1, s.y), boss.z + 0.3, { n: 16, cols: ['#ffce46', '#ff7014', '#e8501a'], sp: [1.5, 5], life: 0.45, size: 2 }); sfx('RobotDeathB', 0.4, 1.4);
        if (s.y < F + 0.3) fires.push({ x: Math.max(boss.xa, Math.min(boss.xb, s.x)), y: F + 0.08, z: boss.z, life: 2.4, smk: 0, delay: 0, trap: true, boss: true, fl: [{ dx: 0, dy: 0, sc: 0.8, flip: Math.random() < 0.5, ph: rnd(0, 9), sp: 1, hot: false }] }); }
      else burst(s.x, Math.max(F + 0.05, s.y), boss.z + 0.3, { n: 4, cols: ['#a09aa8', '#ffd27a'], sp: [1, 3], life: 0.2 }); } }
  tShots = tShots.filter(s => !s.dead);
  if (boss.dead) { for (const q of turrets) { q.st = 'idle'; q.shot = null; } return; }
  if (!boss.active) return;
  if (!turrets.some(q => q.st !== 'idle')) { tGap -= dt; if (tGap <= 0) { const rd = turrets.filter(q => q.cd <= 0); if (rd.length) turretStart(pick(rd)); } }   // одна пушка за раз, только перезарядившаяся
  for (const q of turrets) { if (q.flash > 0) q.flash -= dt; if (q.st === 'idle') { q.cd -= dt; continue; }
    const S0 = q.shot; q.t += dt; S0.t = q.t - (q.aimT || 0);
    if (q.st === 'aim') {   // рельсовые пушки сначала доезжают до героя
      if (q.rail === 'v') q.ty = Math.max(F + 1.05, Math.min(F + 3.6, hero.y + 0.5 - TUR[q.k].my * k2h(q.k)));
      if (q.rail === 'h') q.tx = Math.max(boss.xa + 1, Math.min(boss.xb - 1, hu));
      const sp = 3.5 * dt; if (q.rail === 'v') q.y += Math.max(-sp, Math.min(sp, q.ty - q.y)); if (q.rail === 'h') q.x += Math.max(-sp, Math.min(sp, q.tx - q.x));
      const there = q.rail === 'v' ? Math.abs(q.ty - q.y) < 0.05 : q.rail === 'h' ? Math.abs(q.tx - q.x) < 0.05 : true;
      if (there || q.t > 1.6) { q.st = 'warn'; q.aimT = q.t; S0.t = 0; if (q.kind === 'laser' || q.kind === 'water') tAim(q, S0); } continue; }
    const t = S0.t, m = tMuzzle(q);
    if (q.st === 'warn') { if (Math.random() < dt * 20) parts.push({ x: m.x, y: m.y, z: boss.z + 0.3, vx: rnd(-0.6, 0.6), vz: 0, vy: rnd(-0.6, 0.6), g: 0, drag: 3, t: 0, life: 0.25, size: 1,
        col: q.kind === 'water' ? pick(['#bfeaf2', '#5fc3dc']) : q.kind === 'steam' ? '#e6f2f4' : q.kind === 'laser' ? '#ff3a2a' : pick(['#ffce46', '#ff7014']) });
      if (t >= S0.tel) { q.st = 'fire'; q.flash = 0.12; game.shake = Math.max(game.shake, 0.06);
        sfx(q.kind === 'laser' ? 'RobotHit5' : q.kind === 'bullets' ? 'RobotHit2' : q.kind === 'fire' ? 'RobotDeathB' : 'RUN_1_13', 0.6, q.kind === 'laser' ? 2.4 : q.kind === 'bullets' ? 1.8 : 0.5);
        if (q.kind === 'fire') { const dx = hu - m.x, dy = hero.y + 0.5 - m.y, d = Math.hypot(dx, dy) || 1; tShots.push({ kind: 'fire', x: m.x, y: m.y, vx: dx / d * 7, vy: dy / d * 7, t: 0, dodged: S0.dodged }); } }
      continue; }
    // q.st === 'fire'
    const ft = t - S0.tel;
    if (q.kind === 'laser') { if (tOnRay(S0, S0.max, 0.42)) turretHurt(q, 'лазер пушки'); }
    else if (q.kind === 'water') { S0.len = Math.min(S0.max, ft * 22);
      const hx = S0.x0 + S0.ux * S0.len, hy = S0.y0 + S0.uy * S0.len; if (!S0.dodged && tOnRay(S0, S0.len, 0.55) && !(hero.washT > 0)) {
        hero.washT = 1.0; hero.washV = 8.5; hero.washDir = q.dir; hero.wetDrip = 2.5; if (hero.burn > 0) hero.burn = 0; hero.vy = Math.max(hero.vy, 2.5); hero.onGround = false; sfx('RUN_1_13', 0.6, 0.6); showCombo('Сбило с ног водой!', true); }
      if (Math.random() < dt * 30) parts.push({ x: hx, y: hy + rnd(-0.2, 0.2), z: boss.z + 0.3, vx: -q.dir * rnd(0.5, 2), vz: 0, vy: rnd(0.5, 2.5), g: 9, drag: 0, t: 0, life: 0.4, size: 2, col: pick(['#bfeaf2', '#5fc3dc', '#2a7fa0']) });
      boss.wet = Math.max(boss.wet, 6); }
    else if (q.kind === 'steam') { if (Math.abs(hu - m.x) < 0.5 && hero.y < m.y) turretHurt(q, 'пар пушки'); }
    else if (q.kind === 'bullets') { const want = Math.floor(ft / 0.09); while (S0.n <= want && ft < S0.fire) { S0.n++; const dx = hu - m.x, dy = hero.y + 0.55 - m.y + rnd(-0.25, 0.25), d = Math.hypot(dx, dy) || 1; tShots.push({ kind: 'bullet', x: m.x, y: m.y, vx: dx / d * 15, vy: dy / d * 15, t: 0, dodged: S0.dodged }); q.flash = 0.05; } }
    if (ft >= S0.fire + (q.kind === 'water' ? 0.3 : 0.15)) { q.st = 'idle'; q.shot = null; q.cd = rnd(4, 7.5) - boss.phase * 0.7; tGap = rnd(1.4, 2.6) - boss.phase * 0.3; }
  }
}
function turretThreat() {   // для подсказки F: пушка вот-вот выстрелит туда, где герой
  if (!boss || boss.dead || !bossRoomHas(hero) || hero.state === 'dead') return null; const hu = toU(hero);
  for (const q of turrets) { const S0 = q.shot; if (!S0 || S0.dodged || q.st !== 'warn') continue; const m = tMuzzle(q); let hit = false;
    if (q.kind === 'laser' || q.kind === 'water') hit = tOnRay(S0, S0.max, 0.7); else if (q.kind === 'steam') hit = Math.abs(hu - m.x) < 0.9; else hit = true;
    if (hit) return { r: null, A: S0, tti: Math.max(0, S0.tel - S0.t), u: m.x, span: S0.tel }; }
  return null;
}
function drawTurrets(b) {
  if (!boss || !turrets.length || cam.y < 2500 || Math.abs(cam.y - boss.F) > 30) return;
  const F = boss.F, g = Math.max(2, Math.round(S * 0.04)), Z = 7.95, X = x => Math.round(W / 2 + (x - cam.x) * S), Y = y => Math.round(H / 2 - (y - cam.y) * S);
  // рельсы и опоры: трубы по стенам для лазера и воды, настенные установки (61) под огнём и пулями
  for (const q of turrets) { if (q.rail === 'v') { const xr = q.x - q.dir * (k2w(q.k) / 2 - 0.2); drawPipeSeg([xr, F + 1, Z], [xr, F + 5, Z], b, 3, false); }
    if (!q.rail) kit2Draw(61, X(q.x - q.dir * 0.1), Y(q.y - k2h(61) + 0.02), false, q.dir < 0); }
  for (const q of turrets) { const fl = q.flash > 0 || (q.st === 'warn' && Math.sin(game.time * 30) > 0.3);
    if (q.rail === 'h') { const im = img.Kit2, r = D.kit2 && D.kit2[q.k]; if (!im || !im.width || !r) continue; const s = S / K2PX, w = Math.round(r[2] * s), h = Math.round(r[3] * s);   // пар висит под потолком дулом вниз (поворот на 90° — пиксели не мылятся)
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(X(q.x) + Math.round(h / 2), Y(q.y)); ctx.rotate(Math.PI / 2); ctx.drawImage(im, r[0], r[1], r[2], r[3], 0, 0, w, h);
      if (fl) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4; ctx.drawImage(im, r[0], r[1], r[2], r[3], 0, 0, w, h); } ctx.restore(); }
    else kit2Draw(q.k, X(q.x), Y(q.y), fl, q.dir < 0);
    const m = tMuzzle(q); pixelGlow(X(m.x - (q.rail === 'h' ? 0 : q.dir * 0.4)), Y(m.y + (q.rail === 'h' ? 0.6 : 0)), 0.9, q.st === 'warn' ? 0.16 : 0.06, q.kind === 'water' ? '120,220,255' : q.kind === 'steam' ? '230,240,240' : '255,150,60'); }   // огонёк: в полумраке кабины пушку видно
}
function drawTurretFx(b) {   // лучи и снаряды — поверх всего (их не заслоняет обстановка у стены)
  if (!boss || !turrets.length || cam.y < 2500 || Math.abs(cam.y - boss.F) > 30) return;
  const F = boss.F, g = Math.max(2, Math.round(S * 0.04)), X = x => Math.round(W / 2 + (x - cam.x) * S), Y = y => Math.round(H / 2 - (y - cam.y) * S);
  for (const q of turrets) { const S0 = q.shot; if (!S0 || q.st === 'aim') continue; const m = tMuzzle(q), ft = S0.t - S0.tel, x0 = X(m.x), wallX = X(q.dir > 0 ? boss.xb + 0.5 : boss.xa - 0.5);
    const ray = (len, step, put) => { for (let d = 0; d < len; d += step) put(X(S0.x0 + S0.ux * d), Y(S0.y0 + S0.uy * d)); };   // по точкам вдоль луча: квадраты по сетке, без поворота и сглаживания
    const st = g / S;
    if (q.kind === 'laser') {
      if (q.st === 'warn') { if (Math.sin(S0.t * 30) > -0.2) { ctx.fillStyle = '#ff3a2a'; let i = 0; ray(S0.max, st, (x, y) => { if ((i++ % 3) < 2) ctx.fillRect(x, y, g, g); }); } }
      else { ctx.fillStyle = '#a01e18'; ray(S0.max, st, (x, y) => ctx.fillRect(x - g * 2, y - g * 2, g * 4, g * 4)); ctx.fillStyle = '#ff3a2a'; ray(S0.max, st, (x, y) => ctx.fillRect(x - g, y - g, g * 2, g * 2)); ctx.fillStyle = '#fff0e8'; ray(S0.max, st, (x, y) => ctx.fillRect(x, y, g, g)); } }
    else if (q.kind === 'water' && q.st === 'fire') { ctx.fillStyle = '#2a7fa0'; ray(S0.len, st, (x, y) => ctx.fillRect(x - g * 3, y - g * 3, g * 6, g * 6)); ctx.fillStyle = '#5fc3dc'; ray(S0.len, st, (x, y) => ctx.fillRect(x - g * 2, y - g * 2, g * 4, g * 4));
      ctx.fillStyle = '#bfeaf2'; let i = 0; const sh = Math.floor(game.time * 30) % 6; ray(S0.len, st, (x, y) => { if (((i++ + sh) % 6) < 2) ctx.fillRect(x - g, y - g, g * 2, g); }); }
    else if (q.kind === 'steam' && q.st === 'fire') { for (let y = m.y, i = 0; y > F + 0.2; y -= 1.1, i++) drawSteam({ x: m.x, y, z: boss.z + 0.05, down: true, robot: true, t: ft + i * 0.07, var: i }, b); } }
  for (const s of tShots) { const x = X(s.x), y = Y(s.y);
    if (s.kind === 'fire') { ctx.fillStyle = '#e8501a'; ctx.fillRect(x - g * 3, y - g * 3, g * 6, g * 6); ctx.fillStyle = '#ffce46'; ctx.fillRect(x - g * 2, y - g * 2, g * 4, g * 4); ctx.fillStyle = '#fff6cf'; ctx.fillRect(x - g, y - g, g * 2, g * 2); pixelGlow(x, y, 0.6, 0.2, '255,140,40'); }
    else { ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - g, y - Math.round(g / 2), g * 3, g); ctx.fillStyle = '#fff6cf'; ctx.fillRect(x, y - Math.round(g / 2), g, g); } }
}
// ====================== РОБОТЫ ПРИВЫКАЮТ К ПРИЁМАМ ======================
// Счёт повторов (fatigue) остывает: раз в 35 секунд каждый приём теряет одно очко.
// Руки Прометея: много огня подряд — «жар» копится, ближний робот даёт залп водой: струи летят дугой, смывают героя
// и гасят перчатки на 8 секунд. Слишком много пламени вокруг — сверху бьют струи и сбивают его.
let fireHeat = 0, volley = null, wBlobs = [], douseCool = 0, fatTick = 0;
function fireUse(n) { if (hero.prom) fireHeat += n; }
function promDouse(t) {
  if (!hero.prom) return; hero.prom = false; hero.promWet = t; hero.chg = 0; fireHeat = 0;
  burst(hero.x, hero.y + 0.5, hero.z, { n: 22, cols: SMOKE, sp: [0.3, 1.4], up: 1.6, g: 0, drag: 2, life: 1, size: 2 }); sfx('RUN_1_13', 0.6, 0.45);
  showCombo('Перчатки погасли — ' + t + ' с без огня', true); plog('погас', 'перчатки'); updateHUD();
}
function volleyBot() {                    // кто стреляет: живой робот в кадре, недалеко, примерно на высоте героя
  const hu = toU(hero); let best = null, bd = 9;
  for (const r of robots) { if (r.dead || r.taxi || r.lift || r.onCloud || r.forked || r.grabT > 0 || !reach(r) || robotHidden(r) || !robotOnScreen(r) || Math.abs(r.y - hero.y) > 2.5) continue;
    const d = Math.abs(toU(r) - hu); if (d > 1.2 && d < bd) { bd = d; best = r; } }
  return best;
}
function shootBlob(r) {
  const hu = toU(hero), ru = toU(r) + (r.sh || 0), du = hu - ru, T = Math.max(0.35, Math.min(0.9, Math.abs(du) / 7)), dy = hero.y + 0.4 - (r.y + 0.7);
  wBlobs.push({ u: ru + Math.sign(du) * 0.3, y: r.y + 0.7, d: toD(r), vu: du / T + rnd(-0.4, 0.4), vy: (dy + 0.5 * 9.8 * T * T) / T + rnd(-0.3, 0.3), t: 0 });
  sfx('RUN_1_13', 0.45, 1.5);
}
function updatePunish(dt) {
  if (hero.prom && hero.promWet > 0) hero.promWet = 0;   // подобрал другие перчатки
  if (hero.promWet > 0) { hero.promWet -= dt; if (Math.random() < dt * 6) { const q = heroHands()[0] || [0, 0.4]; parts.push({ x: hero.x + q[0] * view.r[0], y: hero.y + q[1], z: hero.z + q[0] * view.r[1], vx: 0, vz: 0, vy: rnd(0.4, 0.9), g: 0, drag: 1, t: 0, life: rnd(0.5, 0.9), size: 2, col: pick(SMOKE) }); }
    if (hero.promWet <= 0) { hero.promWet = 0; if (hero.state !== 'dead') { if (!hero.knife && !hero.fork) { hero.prom = true; showCombo('Перчатки снова горят', false); sfx('RobotDeathB', 0.3, 2.2); } else dropStyle('prom'); updateHUD(); } } }
  fireHeat = Math.max(0, fireHeat - dt * 0.7); if (hero.volCool > 0) hero.volCool -= dt;
  if (!hero.prom) fireHeat = Math.min(fireHeat, 4);
  // залп: робот замирает, над ним «!», потом три струи дугой
  if (!volley && fireHeat >= 16 && !(hero.volCool > 0) && hero.state !== 'dead' && !hero.inDoor) { const r = volleyBot(); if (r) { volley = { r, t: 0, n: 0 }; r.atk = null; r.stun = Math.max(r.stun || 0, 1.2); popups.push({ x: r.x, y: r.y + 1.3, z: r.z, text: '!', t: 0 }); showCombo('Робот тушит огонь — уходи от струй', true); fireHeat = 0; hero.volCool = 30; } }
  if (volley) { const V = volley, r = V.r; V.t += dt;
    if (r.dead || robots.indexOf(r) < 0) volley = null;
    else { r.face = Math.sign(toU(hero) - toU(r)) || r.face; if (V.t > 0.65 + V.n * 0.16 && V.n < 3) { V.n++; shootBlob(r); } if (V.n >= 3 && V.t > 1.3) volley = null; } }
  const hu = toU(hero);
  for (const B of wBlobs) { B.t += dt; B.vy -= 9.8 * dt; B.u += B.vu * dt; B.y += B.vy * dt;
    const x = B.u * view.r[0] + B.d * view.n[0], z = B.u * view.r[1] + B.d * view.n[1];
    if (Math.random() < 0.5) for (let i = 0; i < 1; i++) parts.push({ x: x + rnd(-0.06, 0.06) * view.r[0], y: B.y + rnd(-0.06, 0.06), z: z + rnd(-0.06, 0.06) * view.r[1], vx: -B.vu * 0.1 * view.r[0], vz: -B.vu * 0.1 * view.r[1], vy: rnd(-0.5, 0.2), g: 4, drag: 2, t: 0, life: rnd(0.15, 0.3), size: i ? 2 : 3, col: pick(['#bfeaf2', '#5fc3dc', '#eefcff', '#5fc3dc']) });
    const hit = hero.state !== 'dead' && !(hero.dodgeT > 0) && Math.abs(B.u - hu) < 0.38 && B.y > hero.y - 0.1 && B.y < hero.y + hero.h + 0.35 && Math.abs(B.d - toD(hero)) < 1.2;
    if (hit) { B.done = true; hero.washT = 0.6; hero.washV = 6; hero.washDir = Math.sign(B.vu) || 1; hero.burn = 0; promDouse(8); burst(hero.x, hero.y + 0.45, hero.z, { n: 18, cols: ['#bfeaf2', '#5fc3dc', '#eefcff'], sp: [1, 3.5], g: 8, life: 0.5, size: 2 }); continue; }
    if (B.t > 2.5 || overlapsDepth(B.u, B.y, 0.08, 0.08, B.d)) { B.done = true; burst(x, B.y, z, { n: 10, cols: ['#bfeaf2', '#5fc3dc', '#eefcff'], sp: [0.6, 2.5], g: 8, life: 0.4 }); for (const f of fires) if (f.life > 1 && Math.abs(toU(f) - B.u) < 0.8 && Math.abs(f.y - B.y) < 1.2) f.life = 1; } }
  if (waters.some(w => w.temp !== undefined && w.temp < -2)) waters = waters.filter(w => !(w.temp !== undefined && w.temp < -2));
  if (wBlobs.length) wBlobs = wBlobs.filter(B => !B.done);
  // пожар: много пламени в кадре — сверху бьют струи прямо над огнём
  douseCool -= dt;
  if (douseCool <= 0) { douseCool = 1.5; const camU = cam.x * view.r[0] + cam.z * view.r[1], vis = o => !propHidden(o) && Math.abs(toU(o) - camU) < W / S / 2 && Math.abs(o.y - cam.y) < H / S / 2;
    const hot = fires.filter(f => f.life > 1.5 && !(f.delay > 0) && (!f.prom || f.big) && vis(f)).concat(robots.filter(r => r.burn > 0 && !robotHidden(r) && vis(r)));
    if (hot.length >= 6) { douseCool = 25; const top = Math.ceil(cam.y + H / S / 2 + 1.5); let n = 0;
      for (const o of hot.sort(() => Math.random() - 0.5)) { if (n >= 3) break; const U = Math.round(toU(o)), d = toD(o), bottom = Math.floor(o.y + 0.05); if (waters.some(w => w.temp > 0 && Math.abs(toU(w) - U) < 1)) continue;
        let y1 = top; for (let Y = bottom + 1; Y < top; Y++) if (overlapsDepth(U, Y + 0.05, 0.3, 0.9, d)) { y1 = Y; break; }
        if (y1 < bottom + 1.2) continue; waters.push({ x: U * view.r[0] + d * view.n[0], y: y1, z: U * view.r[1] + d * view.n[1], bottom, ph: 0, head: y1, tail: y1, spl: 0, temp: 2.6 }); n++; }
      if (n) { sfx('RUN_1_13', 0.5, 0.5); showCombo('Слишком много огня — сверху бьёт вода', false); } } }
}
// капля залпа: целая струйка — голова и хвост по скорости, рисуется каждый кадр там, где капля сейчас
function drawWBlobs(actors, b, relD) {
  for (const B of wBlobs) { const x = B.u * view.r[0] + B.d * view.n[0], z = B.u * view.r[1] + B.d * view.n[1], o = { x, y: B.y, z };
    actors.push({ _d: relD(o) + 0.7, draw: () => { const g = Math.max(2, Math.round(S * 0.03)), px = W / 2 + relU(o, b) * S, py = H / 2 - (B.y - cam.y) * S, sp = Math.hypot(B.vu, B.vy) || 1, ux = -B.vu / sp, uy = B.vy / sp;
      for (let i = 0; i < 7; i++) { const k = i * g * 1.2, r = i < 2 ? 2 : i < 4 ? 1 : 0; ctx.fillStyle = i < 2 ? '#eefcff' : i < 5 ? '#5fc3dc' : 'rgba(95,195,220,0.6)';
        ctx.fillRect(Math.round((px + ux * k) / g) * g - r * g, Math.round((py + uy * k) / g) * g - r * g, (2 * r + 1) * g, (2 * r + 1) * g); } } }); }
}
// ====================== ПОРШНЕВОЙ МЕХАНИЗМ НА НОГЕ ======================
// Кривошип: внизу крутится шестерня, на ней палец; шатун от пальца толкает ползун вверх-вниз по оси, над ползуном — цилиндр со штоком.
// Ползун — площадка: на ней едешь вверх-вниз; верх цилиндра — неподвижная опора. Цвета — как у шестерён и лифтов.
let pistons = [];
const PIST = { rp: 0.7, L: 2.2, hw: 0.72, th: 0.38, cw: 0.34 };   // палец кривошипа, длина шатуна, полуширина ползуна, его толщина, полуширина цилиндра
function spawnPistons() { pistons = (LEVEL.pistons || []).map(p => Object.assign({ rp: PIST.rp, L: PIST.L, hw: PIST.hw, th: PIST.th, cw: PIST.cw }, p, { y: 0, top: 0, py: null })); for (const P of pistons) { if (gears[P.gi]) { gears[P.gi].pist = true; gears[P.gi].deco = false; }   /* колесо насоса твёрдое */ updatePistonPos1(P); crates = crates.filter(c => !(Math.abs(c.x - P.gx) + Math.abs(c.z - P.gz) < 1.6 && c.y > P.gy - 2 && c.y < P.cyT + 1)); } }
function pistonGear(P) { return gears[P.gi]; }
const pistonFace = P => { const N = FACE_N[P.f]; return N[0] * view.n[0] + N[1] * view.n[1]; };
function updatePistons(dt) {
  for (const P of pistons) { const t0 = P.top; updatePistonPos1(P);
    if (hero.standOn === P && hero.state !== 'dead' && !hero.hang) { const dy = P.top - t0; if (!overlapsDepth(toU(hero), hero.y + dy + 0.02, hero.hw, hero.h - 0.04, toD(hero))) hero.y += dy; if (dy > 0 && hero.vy < 0) hero.vy = 0; }
    if (P.top > t0 + 0.001 && P.top - t0 > 0.03 && Math.abs(P.top - P.gy - P.L - P.rp) < 0.05 && pistonFace(P) > 0.5 && Math.abs(toU(P) - toU(hero)) < 6 && Math.abs(P.y - hero.y) < 5 && !P.thud) { P.thud = true; sfx('Jump_4_landfall', 0.22, 0.7); }
    if (P.top < t0) P.thud = false; }
}
function updatePistonPos1(P) { const G = pistonGear(P); if (!G) return; const a = G.ang, du = P.rp * Math.cos(a), dh = -P.rp * Math.sin(a); P.pu = du; P.pdh = dh; P.y = P.gy + dh + Math.sqrt(P.L * P.L - du * du); P.top = P.y + P.th / 2; P.x = P.gx; P.z = P.gz; }
function pistonTangible(P, hd, y) {   // v237 (Алексей 18.10: «платформа поршня работает не со всех сторон»): ближняя глубина — всегда; иначе — если эта часть насоса видна (не загорожена кубом спереди)
  const G = gears[P.gi], face = G ? gearFace(G) : pistonFace(P); if (face <= -0.3) return false; const d = toD(P); if (Math.abs(d - hd) <= 1.6) return true;
  if (G && gearTangible(G, hd, true)) return true;   // видно колесо — держит и ползун (как в v233)
  const c = cellAt(Math.round(toU(P)), Math.floor(y)); return !(c && c.some(q => q.dep > d + DEPTH_TOL)); }   // или видна сама эта часть насоса
function pistonSupport(u, yFeet, best) {
  for (const P of pistons) { if (!pistonTangible(P, toD(hero), P.top - 0.15)) continue;   /* v237: ползун и крышка держат с любой стороны, где их видно (раньше смотрели на колесо: колесо закрыто ступенью — ползун «призрачный») */ const du = u - toU(P);
    if (Math.abs(du) < P.hw + 0.06 && P.top <= yFeet + STEP_UP + 0.04 && P.top > yFeet - 0.6 && (!best || P.top > best.top)) best = { top: P.top, r: P };   // ползун
    if (Math.abs(du) < P.cw + 0.08 && P.cyT <= yFeet + 0.14 && P.cyT > yFeet - 0.6 && (!best || P.cyT > best.top)) best = { top: P.cyT, r: P.cap || (P.cap = { x: P.x, z: P.z, cap: true }) }; }   // крышка цилиндра
  return best;
}
// Рисунок по схеме кривошипно-шатунного механизма: на оси шестерни — кривошип (плечо), на его конце палец; шатун соединяет палец
// с крейцкопфом-ползуном, который ходит строго вверх-вниз между двумя направляющими; от ползуна шток уходит в цилиндр.
// Всё из уже готовых текстур: трубы (шток, шатун, направляющие, корпус цилиндра) и плита платформ (ползун, крышки) — без контура.
let pistTile = null;
function pistonTileOld() { if (pistTile) return pistTile; const T = typeof LEDGE5 !== 'undefined' ? LEDGE5 : []; let best = null;
  for (const t of T) if (t[2] >= 60 && t[3] >= 20 && t[3] <= 60 && (!best || t[4] < best[4])) best = t; return pistTile = best; }
// Детали — с листа паровой машины автора (Steam.png): корпус цилиндра — клёпаный котёл стоймя, крышки и направляющая — клёпаные планки,
// шатун — тяга с проушинами (концы не растягиваются), ползун — клёпаная плита. Механизм объёмный: виден с любой стороны, кроме задней.
function drawPiston(P, b) {
  const fcr = pistonFace(P); if (fcr < -0.3) return; const SP = img.Steam, M = typeof STEAMP !== 'undefined' ? STEAMP : null; if (!SP || !SP.width || !M) return;
  const cx = W / 2 + relU(P, b) * S, Y = y => H / 2 - (y - cam.y) * S, gyS = Y(P.gy), sh = Math.max(2, Math.round(S * 0.03));
  ctx.save(); ctx.imageSmoothingEnabled = false;
  const part = (k, sx, sy, sw, shh, x, y, w, h) => { const r = M[k]; ctx.drawImage(SP, r[0] + sx, r[1] + sy, sw, shh, Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const tileV = (k, x0, y0, w, h) => { const r = M[k], kk = w / r[2]; let y = y0; while (y < y0 + h - 0.5) { const hh = Math.min(r[3] * kk, y0 + h - y); part(k, 0, 0, r[2], hh / kk, x0, y, w, hh); y += hh; } };   // по высоте кусками в родном масштабе
  const cropH = (k, x0, y0, w, h) => { const r = M[k], kk = h / r[3], sw = Math.min(r[2], w / kk); part(k, (r[2] - sw) / 2, 0, sw, r[3], x0, y0, w, h); };   // по ширине — вырез из середины
  const shadow = (x, y, w, h) => { ctx.fillStyle = 'rgba(8,6,16,0.22)'; ctx.fillRect(Math.round(x + sh * 2), Math.round(y + sh * 2), Math.round(w), Math.round(h)); };
  const yHead = Y(P.top), yLow = Y(P.top - P.th), yCB = Y(P.cyB), yCT = Y(P.cyT), cw = P.cw * S * 2.4, hw = P.hw * S;
  // направляющая: клёпаная планка стоймя за ползуном
  { const r = M.barS, bw = Math.max(4, S * 0.2), y0 = yCB, y1 = Y(P.gy + 0.9), kk = bw / r[3]; shadow(cx - bw / 2, y0, bw, y1 - y0);
    ctx.save(); ctx.translate(Math.round(cx + bw / 2), Math.round(y0)); ctx.rotate(Math.PI / 2); let x = 0; while (x < y1 - y0 - 0.5) { const ww = Math.min(r[2] * kk, y1 - y0 - x); ctx.drawImage(SP, r[0], r[1], ww / kk, r[3], Math.round(x), 0, Math.ceil(ww), Math.round(bw)); x += ww; } ctx.restore(); }
  // цилиндр: котёл стоймя, сверху и снизу клёпаные крышки
  shadow(cx - cw / 2, yCT, cw, yCB - yCT); tileV('drumV', cx - cw / 2, yCT, cw, yCB - yCT);
  const capH = Math.max(4, S * 0.15); cropH('bar', cx - cw * 0.62, yCT - capH * 0.7, cw * 1.24, capH); cropH('bar', cx - cw * 0.62, yCB - capH * 0.3, cw * 1.24, capH);
  // шток: тонкая труба
  { const rw = Math.max(4, S * 0.11); tileV('pipeV', cx - rw / 2, yCB + capH * 0.5, rw, Math.max(0, yHead - yCB - capH * 0.5)); }
  // кривошип: плечо от оси до пальца
  const px = cx + P.pu * S, py = Y(P.gy + P.pdh), aw = Math.max(4, S * 0.16), an0 = Math.atan2(py - gyS, px - cx), la = Math.hypot(px - cx, py - gyS);
  ctx.save(); ctx.translate(Math.round(cx), Math.round(gyS)); ctx.rotate(an0); ctx.fillStyle = '#4a4248'; ctx.fillRect(-aw / 2, -aw / 2, la + aw, aw); ctx.fillStyle = '#6e6470'; ctx.fillRect(-aw / 2, -aw / 2, la + aw, Math.max(1, aw * 0.25)); ctx.restore();
  // шатун: тяга с проушинами — концы в родном размере, середина тянется по длине
  { const hx = cx, hy = yLow, L = Math.hypot(hx - px, hy - py), an = Math.atan2(hy - py, hx - px), r = M.rod, lw = Math.max(5, S * 0.17), kk = lw / r[3], e = r[3];   // проушина ≈ квадрат высоты тяги
    ctx.save(); ctx.translate(Math.round(px), Math.round(py)); ctx.rotate(an); const ew = e * kk, x0 = -ew / 2;
    ctx.drawImage(SP, r[0], r[1], e, r[3], Math.round(x0), Math.round(-lw / 2), Math.round(ew), Math.round(lw));
    ctx.drawImage(SP, r[0] + e, r[1], r[2] - 2 * e, r[3], Math.round(x0 + ew), Math.round(-lw / 2), Math.max(1, Math.round(L - ew + 1)), Math.round(lw));
    ctx.drawImage(SP, r[0] + r[2] - e, r[1], e, r[3], Math.round(L - ew / 2), Math.round(-lw / 2), Math.round(ew), Math.round(lw)); ctx.restore(); }
  // ползун: клёпаная плита — на ней едет герой
  { const t = pistonPlat(), L4 = img.ledge4, pw = hw * 2, ph = Math.max(4, yLow - yHead);   // площадка ползуна — как платформы уровня: плита с листа платформ в родном масштабе, с тенью снизу
    shadow(cx - hw, yHead, pw, ph); ctx.fillStyle = 'rgba(8,6,16,0.24)'; ctx.fillRect(Math.round(cx - hw), Math.round(yHead + ph), Math.round(pw), Math.round(S * 0.14));
    if (t && L4 && L4.width) { const sw = Math.min(t[2], pw / S * 96), shh = Math.min(t[3], ph / S * 96); ctx.drawImage(L4, t[0] + Math.floor((t[2] - sw) / 2), t[1], sw, shh, Math.round(cx - hw), Math.round(yHead), Math.round(pw), Math.round(ph)); }
    else cropH('plate', cx - hw, yHead, pw, ph); }
  { const f = M.flange, d = Math.max(6, S * 0.2); part('flange', 0, 0, f[2], f[3], cx - d / 2, gyS - d / 2, d, d); }   // ступица на оси шестерни
  ctx.restore();
}
let pistPl = null;
function pistonPlat() { if (pistPl) return pistPl; const T = typeof LEDGE5 !== 'undefined' ? LEDGE5 : []; let best = null;
  for (const t of T) if (t[2] >= 130 && t[3] >= 34 && t[3] <= 70 && t[4] < 33 && (!best || t[4] < best[4])) best = t;
  if (!best) for (const t of T) if (t[2] >= 100 && t[3] >= 30 && (!best || t[4] < best[4])) best = t; return pistPl = best; }
let pistTl = null;
function pistonTiles() { if (pistTl) return pistTl; const T = typeof LEDGE5 !== 'undefined' ? LEDGE5 : []; let flat = null, tall = null;
  for (const t of T) { if (t[2] >= 60 && t[3] >= 20 && t[3] <= 60 && (!flat || t[4] < flat[4])) flat = t; if (t[3] >= 120 && t[2] >= 40 && t[4] < 30 && (!tall || t[4] < tall[4])) tall = t; }
  return pistTl = { flat, tall: tall || flat }; }
// ====================== ПРОВОДА ПУЧКАМИ ======================
// Внутри робота под потолком — пучки проводов, как на улицах: провисают дугами разной глубины, цвета как на щитке автора; часть свисает концом.
const CABLE_COL = [['#a8403a', '#6e2a28'], ['#3a6896', '#24425e'], ['#bf7834', '#7a4a20'], ['#222024', '#0e0c10'], ['#6e6c70', '#3e3c42'], ['#5a96be', '#36607a'], ['#8a3a5a', '#52223a']];
function drawCables(b) {
  const C = LEVEL.cables; if (!C || !C.length || cam.y < 2500) return; const g = Math.max(2, Math.round(S * 0.032)), T = game.time;
  for (const q of C) { const ax = W / 2 + relU({ x: q.x0, z: q.z }, b) * S, bx = W / 2 + relU({ x: q.x1, z: q.z }, b) * S, y0 = H / 2 - (q.y - cam.y) * S;
    if (Math.max(ax, bx) < -20 || Math.min(ax, bx) > W + 20 || y0 < -S * 3 || y0 > H + S) continue;
    const L = Math.abs(bx - ax), n = Math.max(4, Math.round(L / g));
    for (const s of q.st) { const col = CABLE_COL[s.c], sag = (s.sag + 0.04 * Math.sin(T * 0.9 + s.ph)) * S, dy = s.dy * S;
      for (let i = 0; i <= n; i++) { const t = i / n, x = Math.round((ax + (bx - ax) * t) / g) * g, y = Math.round((y0 + dy + sag * 4 * t * (1 - t)) / g) * g;
        ctx.fillStyle = col[1]; ctx.fillRect(x, y + g, g, g); ctx.fillStyle = col[0]; ctx.fillRect(x, y, g, g * s.w); } }
    if (q.drop) { const d = q.drop, col = CABLE_COL[d.c], x0 = W / 2 + relU({ x: d.x, z: q.z }, b) * S, len = d.len * S, sw = Math.sin(T * 1.3 + d.x) * 0.12 * S;   // свисающий конец: качается, на конце — оголённые жилы
      for (let yy = 0; yy < len; yy += g) { const k = yy / len, x = Math.round((x0 + sw * k * k) / g) * g, y = Math.round((y0 + yy) / g) * g; ctx.fillStyle = col[0]; ctx.fillRect(x, y, g, g); ctx.fillStyle = col[1]; ctx.fillRect(x + g, y, g, g); }
      const ex = Math.round((x0 + sw) / g) * g, ey = Math.round((y0 + len) / g) * g; ctx.fillStyle = '#c9a060'; ctx.fillRect(ex - g, ey, g, g); ctx.fillRect(ex + g, ey, g, g); if (Math.random() < 0.02) { ctx.fillStyle = '#ffffff'; ctx.fillRect(ex, ey + g, g, g); } } }
}
// провода-спрайты с листа автора (Wires.png), 170 px листа на куб; свисают от точки крепления (x, y — верх)
function drawWireSprites(actors, b, relD) {
  const L = LEVEL.wsprites, im = img.Wires; if (!L || !L.length || !im || !im.width) return; const g = Math.max(1, Math.round(S / 40));   // пиксель провода = целое число пикселей экрана, без растяжения
  for (const q of L) { const N = FACE_N[q.f], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < 0.03) continue; if ((q.y > 2500) !== (cam.y > 2500)) continue;
    const r = WIRES[q.g][q.i], w = r[2] * g, h = r[3] * g, u = relU(q, b), px = W / 2 + u * S, py = H / 2 - (q.y - cam.y) * S; if (px + w < 0 || px - w > W || py > H || py + h < 0) continue;
    actors.push({ _d: relD(q), draw: () => { ctx.imageSmoothingEnabled = false; ctx.globalAlpha = edgeFade(fc); const sw = q.g === 'V' ? Math.sin(game.time * 1.1 + q.x * 2.3) * 0.015 : 0;
      ctx.save(); ctx.translate(Math.round(px), Math.round(py)); if (sw) ctx.rotate(sw); ctx.scale(fc, 1); ctx.drawImage(im, r[0], r[1], r[2], r[3], Math.round(-w / 2), q.g === 'D' ? -Math.round(h * 0.08) : 0, Math.round(w), Math.round(h)); ctx.restore(); } }); }
}
// простые провода: идут от куч по потолку к стене и вниз — линия в пиксель проводов, со слабым провисом на длинных пролётах
const WRUN_COL = [['#3e3a46', '#26232c'], ['#5a3a34', '#3a2420'], ['#4a4a3a', '#2e2e24'], ['#34404a', '#20282e'], ['#6a5040', '#44322a'], ['#2c2a30', '#18161c']];
function drawWireRuns(b) {
  const L = LEVEL.wruns; if (!L || !L.length || cam.y < 2500) return; const g = Math.max(1, Math.round(S / 40));
  for (const q of L) { const P = q.pts.map(p => [W / 2 + relU({ x: p[0], z: q.z }, b) * S, H / 2 - (p[1] - cam.y) * S]); if (P.every(p => p[1] < -20 || p[1] > H + 20) || P.every(p => p[0] < -20 || p[0] > W + 20)) continue; const C = WRUN_COL[q.c];
    for (let i = 0; i + 1 < P.length; i++) { const [x0, y0] = P[i], [x1, y1] = P[i + 1], n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / g)), hz = Math.abs(y1 - y0) < Math.abs(x1 - x0) * 0.3, sag = hz ? q.sag * S * Math.min(1, Math.abs(x1 - x0) / (3 * S)) : 0;
      for (let k = 0; k <= n; k++) { const t = k / n, x = Math.round((x0 + (x1 - x0) * t) / g) * g, y = Math.round((y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)) / g) * g; ctx.fillStyle = C[0]; ctx.fillRect(x, y, g, g); ctx.fillStyle = C[1]; if (hz) ctx.fillRect(x, y + g, g, g); else ctx.fillRect(x + g, y, g, g); } }
    const e = P[P.length - 1]; ctx.fillStyle = '#8a6a4a'; ctx.fillRect(Math.round(e[0] / g) * g, Math.round(e[1] / g) * g + g, g, g); }   // медная жила на конце
}

// ---- паровая машина на ноге: всё из листа Steam, крупным пикселем без сглаживания; маховик крутится, шатун ходит, из трубы — дым
const engRot = new Map();
function engWheel(k, st) {   // маховик, заранее повёрнутый (32 положения) и уже в нужном размере — без размытия
  const key = k.toFixed(3) + '|' + st; let c = engRot.get(key); if (c) return c; const r = STEAMP.wheel, w = Math.round(r[2] * k), h = Math.round(r[3] * k), sz = Math.ceil(Math.hypot(w, h)) + 2;
  c = document.createElement('canvas'); c.width = c.height = sz; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.translate(sz / 2, sz / 2); x.rotate(st / 32 * Math.PI * 2); x.drawImage(img.Steam, r[0], r[1], r[2], r[3], -w / 2, -h / 2, w, h);
  if (engRot.size > 200) engRot.delete(engRot.keys().next().value); engRot.set(key, c); return c; }
function drawEngine(E, b) {
  const SP = img.Steam; if (!SP || !SP.width || typeof STEAMP === 'undefined') return; const N = FACE_N[E.f], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < 0.03) return; ctx.globalAlpha = edgeFade(fc);
  const k = S / 100 * 0.5, X = Math.round(W / 2 + relU(E, b) * S), Y = Math.round(H / 2 - (E.y - cam.y) * S), P = STEAMP;
  const part = (n, x, y) => { const r = P[n]; ctx.drawImage(SP, r[0], r[1], r[2], r[3], Math.round(x * k), Math.round(y * k), Math.round(r[2] * k), Math.round(r[3] * k)); };
  // раскладка в пикселях листа (×k): снизу полка-рама на кронштейнах, на ней топка и маховик, на топке котёл, справа от маховика цилиндр
  const fw = P.firebox[2], fh = P.firebox[3], bh = P.base[3], wd = P.wheel[2], bw = P.boiler[2], boh = P.boiler[3], cl = P.cyl[3], cd = P.cyl[2];
  const xw = fw + 10 + wd / 2, pr = wd * 0.28, Lr = wd / 2 + 10, Cs = xw + pr + Lr + 8, TW = Cs + cl + 10, L = -TW / 2, wy = -bh - wd / 2 - 4;
  ctx.save(); ctx.translate(X, Y); ctx.scale(fc * (E.flip ? -1 : 1), 1); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(L * k), 0);
  part('bracketB', 10, -4); part('bracketB', TW - P.bracketB[2] - 10, -4);                                  // кронштейны в стене под полкой
  { const r = P.base, h = Math.round(TW / 2); ctx.drawImage(SP, r[0], r[1], h, r[3], 0, Math.round(-bh * k), Math.round(h * k), Math.round(r[3] * k)); ctx.drawImage(SP, r[0] + r[2] - (TW - h), r[1], TW - h, r[3], Math.round(h * k), Math.round(-bh * k), Math.round((TW - h) * k), Math.round(r[3] * k)); }   // полка: левый и правый концы рамы, без растяжки
  part('firebox', 0, -bh - fh);
  part('boiler', -5, -bh - fh - boh + 6);
  part('gauge', bw * 0.55, -bh - fh - boh + 6 - P.gauge[3] + 18);
  const a = game.time * E.sp + E.ph, st = ((Math.round(a / (Math.PI * 2) * 32) % 32) + 32) % 32, aa = st / 32 * Math.PI * 2;
  { const cx = Cs, cy = wy; ctx.save(); ctx.translate(Math.round((cx + cl / 2) * k), Math.round(cy * k)); ctx.rotate(Math.PI / 2); const r = P.cyl; ctx.drawImage(SP, r[0], r[1], r[2], r[3], -Math.round(cd * k / 2), -Math.round(cl * k / 2), Math.round(cd * k), Math.round(cl * k)); ctx.restore(); }   // цилиндр лежит на боку
  const px = xw + Math.cos(aa) * pr, py = wy + Math.sin(aa) * pr, hx = px + Math.sqrt(Math.max(1, Lr * Lr - (py - wy) * (py - wy))), g = Math.max(2, Math.round(S * 0.03));
  ctx.fillStyle = '#2a2226'; ctx.fillRect(Math.round(hx * k), Math.round(wy * k) - g, Math.round((Cs + 6 - hx) * k), g * 2);   // шток: от ползуна в цилиндр
  ctx.fillStyle = '#5a4f55'; ctx.fillRect(Math.round(hx * k) - g * 2, Math.round(wy * k) - g * 2, g * 4, g * 4);   // ползун
  { const wc = engWheel(k, st); ctx.drawImage(wc, Math.round(xw * k - wc.width / 2), Math.round(wy * k - wc.height / 2)); }
  { const r = P.rod, ang = Math.atan2(wy - py, hx - px), len = Math.hypot(hx - px, wy - py); ctx.save(); ctx.translate(Math.round(px * k), Math.round(py * k)); ctx.rotate(ang); ctx.drawImage(SP, r[0], r[1], r[2], r[3], Math.round(-8 * k), Math.round(-r[3] * k / 2), Math.round((len + 16) * k), Math.round(r[3] * k)); ctx.restore(); }   // шатун поверх маховика
  ctx.restore();
  E.smk = (E.smk || 0) - 1 / 60; if (E.smk <= 0 && !view.rotating) { E.smk = 0.25 + Math.random() * 0.3; const sg = fc * (E.flip ? -1 : 1), u = (L + 25) * k / S * sg, R2 = view.r;   // дым из трубы котла
    parts.push({ x: E.x + u * R2[0] + N[0] * 0.3, y: E.y + (bh + fh + boh) * k / S, z: E.z + u * R2[1] + N[1] * 0.3, vx: rnd(-0.1, 0.1), vz: rnd(-0.1, 0.1), vy: rnd(0.6, 1.1), g: -0.3, drag: 1.2, t: 0, life: rnd(1.2, 2), size: 3, col: pick(SMOKE) }); }
}
// tools/steam_build.py: детали паровой машины в атласе Steam.png — [x, y, w, h]
const STEAMP = {"boiler": [0, 0, 778, 323], "elbow": [780, 0, 106, 95], "drumV": [888, 0, 200, 270], "capL": [1090, 0, 135, 196], "wheel": [1227, 0, 265, 266], "firebox": [0, 325, 374, 281], "base": [376, 325, 800, 130], "elbowA": [1178, 325, 132, 382], "pipeV": [1312, 325, 68, 310], "elbowB": [1382, 325, 102, 301], "gauge": [0, 709, 151, 309], "rod": [153, 709, 148, 42], "crank": [303, 709, 201, 114], "gear": [506, 709, 103, 109], "flange": [611, 709, 95, 96], "bar": [708, 709, 282, 40], "bracketA": [992, 709, 142, 112], "bracketB": [1136, 709, 139, 134], "cyl": [1277, 709, 48, 139], "valves": [1327, 709, 133, 334], "tee": [1462, 709, 116, 140], "barS": [0, 1045, 261, 37], "plate": [263, 1045, 318, 93], "lever": [583, 1045, 62, 147]};
// tools/wire_build.py: провода в атласе Wires.png — H жгуты, D провисающие, V свисающие, B коробки: [x, y, w, h]
const WIRES = {"H": [[0, 0, 256, 17], [258, 0, 253, 15]], "D": [[0, 19, 126, 84], [128, 19, 176, 78], [306, 19, 96, 21], [404, 19, 104, 30]], "V": [[0, 105, 23, 87], [25, 105, 18, 121], [45, 105, 17, 94], [64, 105, 26, 104], [92, 105, 18, 87], [112, 105, 25, 94], [139, 105, 20, 83], [161, 105, 26, 77], [189, 105, 15, 78], [206, 105, 16, 104]], "B": [[224, 105, 19, 39], [245, 105, 24, 20], [271, 105, 29, 18], [302, 105, 22, 42]]};
// tools/door_build.py: двери в атласе Doors.png — пары закрыта/открыта: [x, y, w, h]
const DOORS2 = [{"set": "moss", "kind": "round", "c": [0, 0, 39, 55], "o": [41, 0, 39, 55]}, {"set": "moss", "kind": "rect", "c": [82, 0, 35, 55], "o": [119, 0, 35, 55]}, {"set": "moss", "kind": "rect", "c": [156, 0, 36, 55], "o": [194, 0, 36, 55]}, {"set": "moss", "kind": "round", "c": [232, 0, 34, 55], "o": [268, 0, 34, 55]}, {"set": "moss", "kind": "rect", "c": [304, 0, 37, 55], "o": [343, 0, 37, 55]}, {"set": "moss", "kind": "round", "c": [382, 0, 41, 55], "o": [425, 0, 41, 55]}, {"set": "plain", "kind": "round", "c": [468, 0, 41, 55], "o": [511, 0, 41, 55]}, {"set": "plain", "kind": "rect", "c": [554, 0, 39, 55], "o": [595, 0, 39, 55]}, {"set": "plain", "kind": "round", "c": [636, 0, 51, 55], "o": [689, 0, 51, 55]}, {"set": "plain", "kind": "rect", "c": [742, 0, 40, 55], "o": [784, 0, 40, 55]}, {"set": "plain", "kind": "round", "c": [826, 0, 44, 55], "o": [872, 0, 44, 55]}, {"set": "plain", "kind": "rect", "c": [918, 0, 37, 55], "o": [957, 0, 37, 55]}, {"set": "plain", "kind": "round", "c": [996, 0, 49, 55], "o": [1047, 0, 49, 55]}, {"set": "plain", "kind": "rect", "c": [1098, 0, 44, 55], "o": [1144, 0, 44, 55]}, {"set": "plain", "kind": "round", "c": [1190, 0, 42, 55], "o": [1234, 0, 42, 55]}];
// tools/crate_build.py: ящики и бочки в атласе Crates.png
const CRATES2 = [{"kind": "barrel", "moss": false, "r": [0, 0, 16, 26]}, {"kind": "barrel", "moss": false, "r": [18, 0, 16, 26]}, {"kind": "barrel", "moss": false, "r": [36, 0, 17, 26]}, {"kind": "barrel", "moss": false, "r": [55, 0, 17, 26]}, {"kind": "barrel", "moss": true, "r": [74, 0, 17, 26]}, {"kind": "crate", "moss": false, "r": [93, 4, 22, 22]}, {"kind": "crate", "moss": false, "r": [117, 4, 22, 22]}, {"kind": "crate", "moss": false, "r": [141, 4, 23, 22]}, {"kind": "crate", "moss": false, "r": [166, 4, 24, 22]}, {"kind": "crate", "moss": true, "r": [192, 4, 21, 22]}];
// tools/trap_build.py: электроловушки в атласе Traps.png — кадры [x, y, w, h]: floor — низ кадра = пол, ceil — верх = потолок, wall — левый край = стена
const TRAPS = {"floor": [[0, 0, 41, 64], [42, 0, 41, 64], [84, 0, 41, 64], [126, 0, 41, 64], [168, 0, 41, 64], [210, 0, 41, 64]], "ceil": [[252, 0, 41, 58], [294, 0, 41, 58], [336, 0, 41, 58], [378, 0, 41, 58], [420, 0, 41, 58], [462, 0, 41, 58]], "wall": [[504, 0, 47, 44], [552, 0, 47, 44], [600, 0, 47, 44], [648, 0, 47, 44], [696, 0, 47, 44], [744, 0, 43, 44]]};
// ====================== ЭЛЕКТРОЛОВУШКИ ======================
// Выезжают из пола, с потолка и из стен по ритму: покой → искры (предупреждение) → штырь выезжает и бьёт током → прячется.
// Кадры с листа автора (TRAPS): 0 покой, 1–2 искры, 3 выехал наполовину, 4 полностью, 5 покой.
let traps = [];
const TRAP_T = 2.8, trapSp = () => (typeof dcHas === 'function' && dcHas('traps') ? 1.7 : 1);   // v310: «частые разряды» — весь цикл быстрее
function spawnTraps() { traps = (LEVEL.traps || []).map(q => Object.assign({ hit: 0 }, q)); }
function trapFrame(Tp) { const p = ((game.time * trapSp() + Tp.ph) % TRAP_T + TRAP_T) % TRAP_T;
  return p < 0.95 ? 0 : p < 1.4 ? 1 : p < 1.8 ? 2 : p < 1.95 ? 3 : p < 2.5 ? 4 : p < 2.65 ? 3 : 5; }
// зона удара в координатах (u, y): у пола — столб вверх, у потолка — вниз, у стены — вбок
function trapZone(Tp, fr) { const u = toU(Tp), L = fr === 4 ? 1.25 : 0.7;
  if (Tp.kind === 'floor') return [u - 0.22, u + 0.22, Tp.y, Tp.y + L];
  if (Tp.kind === 'ceil') return [u - 0.22, u + 0.22, Tp.y - L, Tp.y];
  const s = Tp.dir * (view.r[0] * Tp.ax + view.r[1] * Tp.az) >= 0 ? 1 : -1; return s > 0 ? [u, u + L, Tp.y - 0.22, Tp.y + 0.22] : [u - L, u, Tp.y - 0.22, Tp.y + 0.22]; }
let keyBots = [];
function updateKeyBots() {   // робот с ключом погиб — ключ падает на пол
  for (const r of keyBots) if (!r.keyDone && (r.dead || robots.indexOf(r) < 0)) { r.keyDone = true; keyItems.push({ x: r.x, y: r.y + 0.5, z: r.z, got: false, ph: 0, red: false, gate: 0, tkey: true }); burst(r.x, r.y + 0.8, r.z, { n: 10, cols: ['#bff0f0', '#7fd1b0', '#ffffff'], sp: [1, 3], up: 1.5, life: 0.5, size: 2 }); }
}
function updateTraps(dt) { updateKeyBots();
  for (const Tp of traps) { const fr = trapFrame(Tp), was = Tp.fr; Tp.fr = fr;
    if (fr === 1 && was === 0 && trapNear(Tp, 8)) zapSound(0.12, 0.12);
    if (fr !== 3 && fr !== 4) continue; if (was !== 3 && was !== 4 && trapNear(Tp, 8)) { zapSound(0.3, 0.25); sfx('RobotHit5', 0.25, 1.8); }
    const z = trapZone(Tp, fr), d = toD(Tp);
    if (hero.state !== 'dead' && !hero.inDoor && Math.abs(toD(hero) - d) < 0.9) { const hu = toU(hero);
      if (hu + hero.hw > z[0] && hu - hero.hw < z[1] && hero.y + hero.h > z[2] && hero.y < z[3] && !(hero.invuln > 0)) {
        hurtHero(toU(Tp), 'электроловушка'); if (typeof heroShock === 'function') heroShock(0.6);   /* v310: героя бьёт током — замирает, как роботы */ hero.vy = Tp.kind === 'ceil' ? -3 : 4; burst(hero.x, hero.y + 0.5, hero.z, { n: 16, cols: ['#ffffff', '#8fe8ff', '#bff0ff'], sp: [1.5, 4], up: 1, life: 0.35, size: 2 }); } }
    for (const r of robots) { if (r.dead || Math.abs(toD(r) - d) > 0.9) continue; const ru = toU(r) + (r.sh || 0);   // робота тоже бьёт: замирает в шоке
      if (ru + 0.3 > z[0] && ru - 0.3 < z[1] && r.y + 1 > z[2] && r.y < z[3] && !(r.shockT > 0.2)) { r.shockT = 0.8; r.flashT = 0.12; damageRobot(r, CFG.hitDamage * 0.6, true); } } }
}
const trapNear = (Tp, m) => Math.abs(toU(Tp) - toU(hero)) < m && Math.abs(Tp.y - hero.y) < m;
function drawTrap(Tp, b) {
  const im = img.Traps; if (!im || !im.width || typeof TRAPS === 'undefined') return; const N = FACE_N[Tp.f], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < 0.03) return; ctx.globalAlpha = edgeFade(fc);
  const fr = Tp.fr === undefined ? trapFrame(Tp) : Tp.fr, r = TRAPS[Tp.kind][fr], gg = Math.max(1, Math.round(S / 40)), w = r[2] * gg, h = r[3] * gg;
  const X = Math.round(W / 2 + relU(Tp, b) * S), Y = Math.round(H / 2 - (Tp.y - cam.y) * S); ctx.imageSmoothingEnabled = false;
  if (Tp.kind === 'floor') { const r0 = TRAPS.floor[0]; ctx.drawImage(im, r[0], r[1], r[2], r[3], X - Math.round(w / 2), Y - h + 3 * gg, w, h);   /* плита утоплена в пол */ }
  else if (Tp.kind === 'ceil') ctx.drawImage(im, r[0], r[1], r[2], r[3], X - Math.round(w / 2), Y - 3 * gg, w, h);
  else { const s = Tp.dir * (b.r[0] * Tp.ax + b.r[1] * Tp.az) >= 0 ? 1 : -1; ctx.save(); ctx.translate(X, Y); ctx.scale(s, 1); ctx.drawImage(im, r[0], r[1], r[2], r[3], -3 * gg, -Math.round(h / 2), w, h); ctx.restore(); }   /* v274: у кадра слева 2–3 пустых столбца — основание вплотную к стене, без щели */
  if (Tp.fr === 1 || Tp.fr === 2) {   // v302 (Алексей: «ловушки должны предупредительно светиться молниями перед ударом»): синее свечение растёт, по линии будущего удара трещат разряды
    const p = ((game.time * trapSp() + Tp.ph) % TRAP_T + TRAP_T) % TRAP_T, k = Math.max(0, Math.min(1, (p - 0.95) / 0.85)), sw = Tp.kind === 'wall' ? (Tp.dir * (b.r[0] * Tp.ax + b.r[1] * Tp.az) >= 0 ? 1 : -1) : 0;
    const dx = sw, dy = Tp.kind === 'floor' ? -1 : Tp.kind === 'ceil' ? 1 : 0, bx = X + dx * 2 * gg, by = Y + dy * 2 * gg;
    const blink = (k > 0.25 && k < 0.36) || (k > 0.62 && k < 0.73) || k > 0.93;   // v302b (Алексей: «просто пару вспышек, а не молнию»): две-три короткие вспышки у основания
    if (blink) { pixelGlow(bx, by, 0.45, 0.2, '140,230,255'); ctx.fillStyle = '#e8f8ff'; for (let n = 0; n < 5; n++) ctx.fillRect(Math.round(bx + (Math.random() - 0.5) * 0.35 * S + dx * 0.1 * S), Math.round(by + (Math.random() - 0.5) * 0.35 * S + dy * 0.1 * S), gg, gg); }
    else pixelGlow(bx, by, 0.3, 0.04 + 0.04 * k, '120,220,255'); }
  if (Tp.fr === 4) pixelGlow(X + (Tp.kind === 'wall' ? (Tp.dir * (b.r[0] * Tp.ax + b.r[1] * Tp.az) >= 0 ? 1 : -1) * S * 0.9 : 0), Y + (Tp.kind === 'floor' ? -S * 1.1 : Tp.kind === 'ceil' ? S * 1.1 : 0), 0.5, 0.08, '140,230,255');
}
// ====================== КНОПКА «ОБУЧЕНИЕ» ======================
// В начале игры, в туннеле подошвы, у заваренной двери старта — кнопка с листа автора и подпись «ОБУЧЕНИЕ».
// Ударил — кнопка вдавливается и включается обучение (game.tutorial = true). Само обучение будет позже (просьба Алексея 13.10).
let tutor = null;
function spawnTutor() { const L = LEVEL.tutor; tutor = L ? { x: L.x, y: L.y, z: L.z, on: !!game.tutorial, fr: game.tutorial ? 5 : 0, flash: 0 } : null; }
function tutorCheckHits(w, fl, fr, hb) {
  const q = tutor; if (!q || w.done.has(q) || Math.abs(hero.y - q.y) > 2.5 || Math.abs(hero.z - q.z) > 1.5) return;
  if (fl < q.x + 0.75 && fr > q.x - 0.75 && hb[2] < q.y + NODE_H && hb[3] > q.y) { w.done.add(q); q.flash = 0.15; sfx('RobotHit3', 0.5, 0.8);
    burst(q.x, q.y + 0.6, q.z + 0.2, { n: 8, cols: ['#a04a3a', '#6a6470'], sp: [1, 3], life: 0.3 });
    if (!q.on) { q.on = true; game.tutorial = true; showCombo('Обучение включено', true); plog('обучение', 'включено'); } }
}
function updateTutor(dt) { const q = tutor; if (!q) return; q.flash = Math.max(0, q.flash - dt); if (q.on && q.fr < 5) q.fr = Math.min(5, q.fr + dt * 18); }
function drawTutor() {
  const q = tutor; if (!q || Math.abs(cam.y - q.y) > 12 || Math.abs(cam.z - q.z) > 3) return;
  const X = Math.round(W / 2 + (q.x - cam.x) * S), Y = y => Math.round(H / 2 - (y - cam.y) * S);
  const r = kit2Draw(62 + Math.floor(q.fr), X, Y(q.y), q.flash > 0); if (r) kit2Draw('tutor', X, r[1] - Math.max(2, Math.round(S * 0.06)));
}
// ====================== ПОВОРОТ ======================
// Проверки перед поворотом считают то же, что будет после него, но на пробной карте клеток вокруг нужного места.
function viewAfter(dir, x, z, y) {
  const k = (((view.k + dir) % 4) + 4) % 4, b = basis(k * 90), r = [Math.round(b.r[0]), Math.round(b.r[1])], n = [Math.round(b.n[0]), Math.round(b.n[1])];
  const u = x * r[0] + z * r[1], d = x * n[0] + z * n[1], col = new Map();   // клетка -> самый близкий к камере куб
  for (const c of cubes.values()) {
    const U = c.x * r[0] + c.z * r[1]; if (Math.abs(U - u) > 2.2 || c.y < y - 3 || c.y > y + 3) continue;
    const key = U * 100 + c.y, dep = c.x * n[0] + c.z * n[1], cur = col.get(key);
    if (!cur || dep > cur.dep) col.set(key, { dep, top: c.top });
  }
  const hiddenBox = (uu, yy, hw, h, dd) => {
    for (let U = Math.round(uu - hw + 1e-4); U <= Math.round(uu + hw - 1e-4); U++) for (let Y = Math.floor(yy + 1e-4); Y <= Math.floor(yy + h - 1e-4); Y++) { const c = col.get(U * 100 + Y); if (c && c.dep > dd + DEPTH_TOL) return true; }
    return false;
  };
  return { u, d, col, hiddenBox };
}
function rotationHidesHero(dir) {
  const v = viewAfter(dir, hero.x, hero.z, hero.y); let d = v.d;
  if (hero.onGround && Math.abs(hero.y - Math.round(hero.y)) < 0.01) { const f = v.col.get(Math.round(v.u) * 100 + Math.round(hero.y) - 1); if (f && f.top) d = Math.max(d, f.dep); }
  return v.hiddenBox(v.u, hero.y, hero.hw, hero.h, d);
}
function rotationHidesRider(dir) {     // робот с седоком после поворота оказался бы за стеной?
  const r = hero.ride.r, v = viewAfter(dir, r.x, r.z, r.y);
  if (v.hiddenBox(v.u, r.y, 0.3, 0.7, v.d)) return true;
  return hero.ride.mode === 'sit' ? v.hiddenBox(v.u, r.y + ROBOT_TOP, hero.hw, hero.h, v.d) : v.hiddenBox(v.u - r.dir * 0.4, r.y, hero.hw, hero.h, v.d);
}
function rotWhyNot() {   // v291: почему мир сейчас не повернётся (для журнала)
  if (hero.state === 'dead') return 'герой погиб'; if (hero.hang) return 'висит на краю'; if (hero.ladder) return 'на лестнице'; if (game.finishT > 0) return 'финиш';
  if (onStairs()) return 'на ступенях или переходе'; if (hero.arm) return 'на руке титана'; if (inRoom()) return 'внутри титана'; return '';
}
function startRotate(dir) {
  if (view.rotating || hero.state === 'dead' || hero.hang || hero.ladder || game.finishT > 0) return;
  if (onStairs()) return;   /* v287: на марше мир не поворачивается — как на лестнице */
  if (hero.arm) { if (!(game.roomMsgT > 0)) { showCombo('На руке титана мир не поворачивается', true); game.roomMsgT = 3; } return; }   /* v280 */
  if (inRoom()) { if (!(game.roomMsgT > 0)) { showCombo('Внутри титана мир не поворачивается', true); game.roomMsgT = 3; } return; }
  // запоминаем, кто стоял рядом с героем и с какой стороны на экране
  for (const r of robots) { r._du = toU(r) - toU(hero); r._near = !r.dead && !hero.ride && reach(r) && Math.abs(r._du) <= 2.6 && Math.abs(r.y - hero.y) < 0.9; }
  if (game.dodge && hero.state !== 'dead') doDodge(game.dodge, false);   // повернул мир в момент нападения — увернулся
  hero.hook = null; if (hero.kride) { hero.kride = null; go('Fly'); } if (hero.forkP) forkRelease(false); if (hero.beam) { hero.beam = null; go('Stay'); }
  view.rotating = true; view.from = view.angle; view.to = view.angle + dir * 90; view.dir = dir; PLOG.n['поворот'] = (PLOG.n['поворот'] || 0) + 1;
}
function updateRotate(dt) {
  const step = CFG.rotSpeed * (view.fast ? 2.2 : 1) * dt;
  if (Math.abs(view.to - view.angle) <= step) {
    view.rotating = false; setView(Math.round(view.to / 90)); game.pan += view.to - view.from; view.fast = false; if (hero.inDoor && hero.inDoor < 9) { hero.inDoor = 0; sfx('RUN_1_13', 0.5, 0.8); }
    // герой встаёт на ближний к камере куб под собой: то, что видно на экране, и есть то, по чему он идёт
    const hu = toU(hero);
    if (!hero.ride && hero.onGround && Math.abs(hero.y - Math.round(hero.y)) < 0.01) {
      const a = cellAt(Math.round(hu), Math.round(hero.y) - 1), d0 = toD(hero);
      const keep = false; void d0;   // как в FEZ: герой встаёт на ближний к камере пол — по нему он и ходит
      if (!keep && a && a[0].top && !overlapsDepth(hu, hero.y, hero.hw, hero.h, a[0].dep)) setUD(hero, hu, a[0].dep);
    }
    if (!hero.ride && overlapsDepth(toU(hero), hero.y, hero.hw, hero.h, toD(hero))) {   // в новом ракурсе задевает соседний куб — сдвигаем чуть вглубь или вперёд, а не отбрасываем вбок
      const u1 = toU(hero), d1 = toD(hero), Y = Math.round(hero.y) - 1;
      for (const dd of [0.5, -0.5, 1, -1]) if (!overlapsDepth(u1, hero.y, hero.hw, hero.h, d1 + dd) && (!hero.onGround || floorCube(Math.round(u1), Y, d1 + dd, 'same'))) { setUD(hero, u1, d1 + dd); break; }
    }
    for (const r of robots) if (!r.dead && r.atk && r.atk.type !== 'jump') { r.atk = null; r.charge = 0; r.atkCool = Math.max(r.atkCool || 0, 0.6); r.anim.play('RobotAC_Stay', { restart: true }); r.clipT = 0; }
    jets.length = 0; hero.hitWin = null; hero.pushV = 0; hero.rotSafe = 0.5;
    view.cool = 0.16;   /* следующий поворот не раньше чем через миг: частые повороты не дёргают героя */
    for (const r of robots) if (!r.dead && reach(r) && Math.abs(toU(r) + (r.sh || 0) - toU(hero)) < 0.75 && Math.abs(r.y - hero.y) < 0.9) { hero.passT = Math.max(hero.passT || 0, 0.7); r.turnWait = Math.max(r.turnWait || 0, 0.5); }   /* после поворота робот оказался вплотную — не выталкивает, герой проходит сквозь */
    for (const r of robots) if (!r.dead && r.atk && r.atk.type === 'jump' && r.atk.land) { const dj = Math.sign(toU(r.atk.land) - toU(r)) || r.atk.dir; r.atk.dir = dj; r.atk.flip = dj > 0; }   // прыжок продолжается, но кадр разворачиваем под новый ракурс
    for (const r of robots) if (!r.dead) r.turnWait = CFG.robotTurnDelay;
    for (const r of robots) { robotAwayCalc(r); r.sh = robotShift(r); }   // мир повернули: робот виден сбоку или со спины и через миг разворачивается
  }
  else view.angle += Math.sign(view.to - view.angle) * step;
}

// ====================== КАМЕРА И ОТРИСОВКА ======================
const canvas = document.getElementById('game'), ctx0 = canvas.getContext('2d'); let ctx = ctx0;
const cam = { x: 0, y: 1.2, z: 0, la: 0, gy: null };
let W = 0, H = 0, S = 100, S0 = 100, dpr = 1;
function resize() {
  dpr = 1; const r = canvas.getBoundingClientRect();   // холст всегда одной высоты (куб = 100 его пикселей), на экран его растягивает браузер крупным пикселем — на больших и ретина-экранах это в разы быстрее
  H = Math.round(CFG.viewHalfHeight * 2 * 100); W = Math.max(320, Math.round(H * Math.max(0.3, r.width / Math.max(1, r.height))));
  canvas.width = W; canvas.height = H; S = H / (CFG.viewHalfHeight * 2);
  if (W / S < 9) S = W / 9;
  S0 = S;   // на узком экране показываем не меньше 9 единиц по ширине
}
addEventListener('resize', resize);

// Обшивка титана рисуется кодом по образцу: серо-зелёные панели в пятнах, швы, трубы, решётки, окна, лючки.
// Каждая плитка 32x32 «пикселя»; вариантов много, какой достанется грани — решает её место в мире.
const TS = 32, tiles = {};
const TONE = {
  light: { base: '#958e92', dk: '#7a7277', lt: '#b9b1b3', line: '#5d565e', pipe: '#c4bcbf', pipeHi: '#e6dfe0', pipeSh: '#6f676e', frame: '#59525a' },   // серо-лиловые, как камень уступов
  dark: { base: '#7c7479', dk: '#665e63', lt: '#958c8f', line: '#494249', pipe: '#a59ca0', pipeHi: '#c4bbbd', pipeSh: '#554d53', frame: '#474047' },   // таз: тот же металл, темнее
};
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeTile(tone, feat, seed) {
  const c = document.createElement('canvas'); c.width = c.height = TS; const x = c.getContext('2d'), P = TONE[tone], R = rng(seed * 7919 + (tone === 'dark' ? 13 : 1) + feat.length * 101);
  const r = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); }, ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  r(0, 0, TS, TS, P.base);
  for (let i = 0, n = ri(3, 5); i < n; i++) {           // пятна: кучки прямоугольников с рваным краем
    const col = R() < 0.76 ? P.dk : P.lt, cx = ri(0, TS), cy = ri(0, TS);
    for (let k = 0, m = ri(5, 12); k < m; k++) r(cx + ri(-6, 5), cy + ri(-5, 4), ri(2, 7), ri(1, 4), col);
    for (let k = 0; k < 10; k++) r(cx + ri(-9, 9), cy + ri(-7, 7), 1, 1, col);
  }
  r(0, 0, 1, TS, P.line); if (R() < 0.5) r(ri(12, 20), 0, 1, TS, P.line);   // швы панелей
  r(0, TS - 1, TS, 1, P.line);
  const rivets = (a, b, w, h) => { for (const q of [[a + 1, b + 1], [a + w - 2, b + 1], [a + 1, b + h - 2], [a + w - 2, b + h - 2]]) r(q[0], q[1], 1, 1, P.pipe); };
  if (feat === 'ventV') { r(9, 3, 14, 26, P.frame); r(11, 6, 10, 20, '#1c2740'); for (let i = 12; i < 21; i += 2) r(i, 8, 1, 17, '#3a4a63'); r(11, 6, 10, 2, '#0f1830'); rivets(9, 3, 14, 26); }
  else if (feat === 'ventH') { r(4, 9, 24, 15, P.frame); r(6, 11, 20, 11, '#1c2740'); for (let i = 13; i < 22; i += 2) r(7, i, 18, 1, '#3a4a63'); rivets(4, 9, 24, 15); }
  else if (feat === 'window') { r(9, 5, 14, 20, P.frame); r(10, 6, 12, 18, P.dk); r(12, 8, 8, 14, '#3fc1d6'); r(12, 8, 8, 3, '#1e5f8a'); r(12, 11, 8, 1, '#2a8fb0'); r(14, 13, 1, 4, '#bff0f0'); rivets(9, 5, 14, 20); }
  else if (feat === 'grid') { r(10, 10, 12, 12, P.frame); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r(12 + i * 3, 12 + j * 3, 2, 2, '#1c2740'); }
  else if (feat === 'lights') { for (const top of [4, 18]) { r(13, top, 6, 11, P.pipe); r(14, top + 1, 4, 9, P.frame); for (let j = 0; j < 4; j++) r(14, top + 1 + j * 2 + (j > 1 ? 1 : 0), 4, 1, R() < 0.7 ? '#eceedd' : '#3fc1d6'); } }
  else if (feat === 'hatch') { r(7, 8, 18, 18, P.frame); r(8, 9, 16, 16, P.dk); r(15, 9, 1, 16, P.frame); for (let i = 0; i < 6; i++) r(10 + i, 20 - i, 1, 1, P.line); rivets(7, 8, 18, 18); }
  else if (feat === 'label') { r(6, 12, 15, 9, P.pipe); r(7, 13, 13, 7, P.pipeHi); r(8, 14, 4, 5, P.frame); r(13, 15, 6, 1, P.frame); r(13, 17, 5, 1, P.frame); r(21, 15, 5, 2, P.pipe); }
  const pipeH = () => { r(0, 13, TS, 1, P.pipeHi); r(0, 14, TS, 2, P.pipe); r(0, 16, TS, 1, P.pipeSh); }, pipeV = () => { r(13, 0, 1, TS, P.pipeHi); r(14, 0, 2, TS, P.pipe); r(16, 0, 1, TS, P.pipeSh); };
  if (feat === 'pipeH') { pipeH(); if (R() < 0.4) { const a = ri(4, 24); r(a, 12, 3, 6, P.pipeHi); r(a, 17, 3, 1, P.pipeSh); } }
  else if (feat === 'pipeV') { pipeV(); if (R() < 0.4) { const a = ri(4, 24); r(12, a, 6, 3, P.pipeHi); r(17, a, 1, 3, P.pipeSh); } }
  else if (feat === 'pipeX') { pipeH(); pipeV(); r(11, 11, 8, 8, P.pipeHi); r(12, 12, 6, 6, P.pipe); r(11, 18, 8, 1, P.pipeSh); }
  return c;
}
// Варианты кубов: исходная плитка плюс пятна мха, местами пучки травы в трещинах и чуть другой тон
const mossTiles = {};
function mossTile(v, m) {
  const key = v * 10 + m; if (mossTiles[key]) return mossTiles[key];
  const sb = SP['bgblock_' + v], n = 35, c = document.createElement('canvas'); c.width = c.height = n * 2; const x = c.getContext('2d'), R = rng(key * 977 + 5);
  x.imageSmoothingEnabled = false; x.drawImage(img.bgblock, sb[1] + 1, sb[2] + 1, sb[3] - 2, sb[4] - 2, 0, 0, n * 2, n * 2);
  const r = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px * 2, py * 2, w * 2, h * 2); }, ri = (a, b2) => a + Math.floor(R() * (b2 - a + 1));
  if (m === 4) { x.fillStyle = 'rgba(40,30,46,0.14)'; x.fillRect(0, 0, n * 2, n * 2); }
  const GR = ['#4e5a2c', '#66733a', '#86904a'];
  if (m === 7) {                        // сплошной мох: камень едва проглядывает
    r(0, 0, n, n, '#4e5a2c'); for (let i = 0; i < 90; i++) r(ri(0, n - 2), ri(0, n - 1), ri(1, 4), ri(1, 2), GR[ri(0, 2)]);
    for (let i = 0; i < 10; i++) r(ri(0, n - 2), ri(0, n - 2), ri(1, 2), 1, '#36421f'); for (let i = 0; i < 5; i++) { const gx = ri(2, n - 3), gy = ri(4, n - 2); r(gx, gy - 3, 1, 4, '#9a9c56'); r(gx + 1, gy - 1, 1, 2, '#aeae64'); }
    for (let i = 0; i < 3; i++) x.drawImage(img.bgblock, sb[1] + 1 + ri(4, 50), sb[2] + 1 + ri(4, 50), 6, 4, ri(2, n - 6) * 2, ri(2, n - 6) * 2, 8, 6);
    return mossTiles[key] = c;
  }
  if (m === 6) {                        // мох поднимается снизу: нижняя треть заросла, край рваный
    for (let px = 0; px < n; px++) { const hgt = 6 + Math.floor(R() * 9) + (px % 7 === 0 ? 4 : 0); for (let py = n - hgt; py < n; py++) if (R() < 0.93) r(px, py, 1, 1, GR[ri(0, 2)]); }
    return mossTiles[key] = c;
  }
  for (let i = 0, k = m === 4 ? 2 : 2 + m; i < k; i++) {      // пятна мха: гуще у верхнего края и по углам
    const cx = ri(0, n), cy = R() < 0.6 ? ri(0, 8) : ri(0, n);
    for (let j = 0, q = ri(5, 12); j < q; j++) r(cx + ri(-5, 4), cy + ri(-3, 3), ri(1, 4), ri(1, 2), GR[ri(0, 2)]);
    for (let j = 0; j < 6; j++) r(cx + ri(-7, 7), cy + ri(-5, 5), 1, 1, GR[ri(0, 1)]);
  }
  if (m >= 2) for (let i = 0, k = 2; i < k; i++) { const gx = ri(3, n - 4), gy = ri(10, n - 3); r(gx, gy - 3, 1, 4, '#9a9c56'); r(gx + 1, gy - 2, 1, 3, '#6d7a3a'); r(gx - 1, gy - 1, 1, 2, '#6d7a3a'); }   // пучки травы из трещин
  return mossTiles[key] = c;
}
const WALLP = { cols: 8, meta: { plain: [0, 12], chip: [12, 10], light: [22, 5], vent: [27, 1], handle: [28, 4], mossLow: [32, 8], mossTop: [40, 6] }, seam: 'rgb(141,116,104)', seamHi: 'rgba(214,180,170,0.55)' }, wallTiles = {};
function wallTile(f) {                  // плитка из набора автора; швы панелей (три куба на два, со сдвигом через ряд) дорисовываются тем же цветом, что у него
  const key = f.wp * 4 + f.sl * 2 + f.sb; let c = wallTiles[key]; if (c) return c;
  c = wallTiles[key] = document.createElement('canvas'); c.width = c.height = TS; const x = c.getContext('2d');
  if (img.wallp && img.wallp.width) x.drawImage(img.wallp, (f.wp % WALLP.cols) * TS, Math.floor(f.wp / WALLP.cols) * TS, TS, TS, 0, 0, TS, TS); else { x.fillStyle = 'rgb(188,148,138)'; x.fillRect(0, 0, TS, TS); }
  if (f.sl) { x.fillStyle = WALLP.seam; x.fillRect(0, 0, 1, TS); x.fillStyle = WALLP.seamHi; x.fillRect(1, 0, 1, TS); }
  if (f.sb) { x.fillStyle = WALLP.seam; x.fillRect(0, TS - 1, TS, 1); }
  return c;
}
function tileFor(f) {
  if (f.wp !== undefined) return wallTile(f);
  const key = f.tone + f.feat + f.tv; return tiles[key] || (tiles[key] = makeTile(f.tone, f.feat, f.tv));
}
let faces = [];
const LEDGE4 = [[0, 2, 4], [2, 4, 3], [6, 3, 4], [9, 2, 3], [11, 2, 2], [13, 4, 1]];   // tools/ledge4_build.py: [начало, ширина, высота] в кубах
// панели кладутся без растяжения: полосами по 4 куба в высоту, вдоль стены — подряд, каждая своей шириной; ниже своей высоты повторяется
const ledge4Rows = new Map();
function ledge4Cell(su, y, n) {
  const by = Math.floor(y / 4), key = by * 16 + n; let row = ledge4Rows.get(key);
  if (!row) { row = []; for (let pos = -96, j = 0; pos < 96; j++) { const p = LEDGE4[Math.abs((by * 73856093) ^ (n * 19349663) ^ (j * 83492791)) % LEDGE4.length]; for (let k = 0; k < p[1]; k++) row[pos + k + 96] = [p, k]; pos += p[1]; } ledge4Rows.set(key, row); }
  const c = row[Math.max(0, Math.min(191, su + 96))], p = c[0]; return [p[0] + c[1], (3 - (((y % 4) + 4) % 4)) % p[2]];
}
function buildFaces() {
  faces = [];
  const NS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (const c of cubes.values()) for (let i = 0; i < 4; i++) {
    const N = NS[i]; if (hasCube(c.x + N[0], c.y, c.z + N[1]) || (c.y > 2500 && i !== 0)) continue;
    const along = N[0] !== 0 ? c.z : c.x;
    const su = [c.x, -c.z, -c.x, c.z][i];   // координата вдоль стены слева направо, как её видит камера
    faces.push({ cx: c.x + 0.5 * N[0], cz: c.z + 0.5 * N[1], y: c.y, nx: N[0], nz: N[1], kind: c.kind, top: c.top, br: !!c.br, br2: !!c.br2, hiT: !!c.bulge && !hasCube(c.x, c.y + 1, c.z), shB: c.y >= 2 && !c.br && (c.kind !== 'core' || !!c.bulge) && !hasCube(c.x, c.y - 1, c.z),
      v: ((c.x * 7 + c.y * 13 + c.z * 5 + i * 3) % 4 + 4) % 4, qa: ((along % 2) + 2) % 2, qy: ((c.y % 2) + 2) % 2 });
    const f = faces[faces.length - 1], hh = Math.abs((c.x * 73856093) ^ (c.y * 19349663) ^ (c.z * 83492791) ^ (i * 2654435)) % 1000; f.h = hh;
    f.topOpen = !hasCube(c.x, c.y + 1, c.z); f.botOpen = !hasCube(c.x, c.y - 1, c.z);
    f.su = su; f.cons = !!c.cons; f.tor = !!c.torso; f.bul = !!c.bulge; f.rm = c.y > 2500; f.flo = f.rm && c.kind === 'core' && c.z === ROOM_Z && LEVEL.carved.has(ckey(c.x, c.y + 1, c.z)); f.pool = !!c.pool; f.inn = c.kind === 'core' && LEVEL.carved.has(ckey(c.x + N[0], c.y, c.z + N[1]));
    if (c.kind === 'plat') {            // парящая платформа: левый край, середина или правый край её рисунка
      const L = cubes.get(ckey(c.x - N[1], c.y, c.z + N[0])), Rr = cubes.get(ckey(c.x + N[1], c.y, c.z - N[0]));
      f.pl = !!(L && L.kind === 'plat'); f.pr = !!(Rr && Rr.kind === 'plat'); continue;
    }
    // металлическая обшивка — только у стен корпуса и башни; ступени, уступы и пояс остаются каменными кубами; с краёв уступов свисают лозы
    const core = c.kind === 'core', p = hh % 100, ph = core && ((c.y % 9) + 9) % 9 === 3, pv = false;
    f.tone = core && c.y >= LEVEL.pelY ? 'dark' : 'light';
    if (core) {                           // обшивка автора: пять листов металла, разрезанных по швам, собраны в блоки 8x5 кубов; ряды блоков идут со сдвигом, как кладка
      const by = Math.floor(c.y / 5), sx = su + (by & 1 ? 3 : 0), bx = Math.floor(sx / 8), hb = Math.abs((bx * 73856093) ^ (by * 19349663) ^ (i * 83492791)) % 100;
      const nearDoor = LEVEL.doors.some(d => { const ds = [d.x, -d.z, -d.x, d.z][i] + (by & 1 ? 3 : 0); return d.f === i && d.y >= by * 5 - 1 && d.y < by * 5 + 5 && ds >= bx * 8 - 1 && ds <= bx * 8 + 8; });
      f.wv = nearDoor || (c.y < 5 && hb < 50) ? 4 + hb % 2 : hb < 10 ? 6 + hb % 2 : hb % 4; f.wx = ((sx % 8) + 8) % 8; f.wy = 4 - ((c.y % 5) + 5) % 5;   // листы с «рваными» заплатами — редко
      // какой это лист в блоке и где на нём эта клетка: раскладка 0 — A | B над C+D | E, раскладка 1 — E | C+D над B | A; нечётные варианты зеркальные
      const lay = f.wv === 2 || f.wv === 3 ? 1 : 0, mx = f.wv % 2 ? 7 - f.wx : f.wx, wy = f.wy; let P;
      if (lay === 0) P = mx === 0 ? [0, 0, 0, 1, 5] : mx >= 6 ? [4, 6, 0, 2, 5] : wy < 2 ? [1, 1, 0, 5, 2] : mx <= 4 ? [2, 1, 2, 4, 3] : [3, 5, 2, 1, 3];
      else P = mx <= 1 ? [4, 0, 0, 2, 5] : mx === 7 ? [0, 7, 0, 1, 5] : wy >= 3 ? [1, 2, 3, 5, 2] : mx <= 5 ? [2, 2, 0, 4, 3] : [3, 6, 0, 1, 3];
      const px = mx - P[1], py = wy - P[2], pw = P[3], phh = P[4], hp = Math.abs((bx * 2246822519) ^ (by * 3266489917) ^ (i * 668265263) ^ (P[0] * 374761393)) >>> 0;
      f.wl = hp % 100 < 24 ? 1 : 0;                                    // часть листов светлее — будто лежат ближе
      const flipR = f.wv % 2 === 1;                                    // в зеркальном блоке «право» листа на экране слева
      if ((hp >> 4) % 100 < 55 && pw * phh >= 5) { const vert = pw >= 3 && (phh < 3 || (hp >> 9) % 2), k = vert ? 1 + (hp >> 11) % (pw - 1) : 1 + (hp >> 11) % (phh - 1);   // лишний шов режет большой лист на два
        if (vert) { if (px === k - 1) f[flipR ? 'sL' : 'sR'] = 1; } else if (py === k - 1) f.sB = 1; }
      if ((hp >> 6) % 100 < 42) { const row = (hp >> 13) % phh, c0 = (hp >> 15) % pw, len = 1 + (hp >> 18) % Math.min(4, pw - c0); const dv = (hp >>> 21) % 100, dt2 = dv < 20 ? 1 : dv < 32 ? 2 : dv < 42 ? 3 : dv < 54 ? 5 : dv < 66 ? 6 : dv < 69 ? 7 : dv < 78 ? 8 : dv < 88 ? 9 : dv < 93 ? 10 : 11; if (py === row && px >= c0 && px < c0 + (dt2 <= 5 ? len : 1)) f.det = dt2; }   // ряд деталей: болты, ручки, торчащая труба
      { const Dv = [[1, 0], [0, -1], [-1, 0], [0, 1]][i]; if (!hasCube(c.x - Dv[0], c.y, c.z - Dv[1])) f.sL = 1; if (!hasCube(c.x + Dv[0], c.y, c.z + Dv[1])) f.sR = 1; if (!hasCube(c.x, c.y - 1, c.z)) f.sB = 1; if (!hasCube(c.x, c.y + 1, c.z)) f.sT = 1; } }   // у края стены лист тоже заканчивается швом
    f.feat = ph && pv ? 'pipeX' : ph ? 'pipeH' : pv ? 'pipeV'
      : core ? (p < 1 ? 'ventV' : p < 2 ? 'ventH' : p < 3 ? 'window' : p < 4 ? 'hatch' : p < 5 ? 'grid' : 'plain')
      : 'plain';
    f.tv = f.feat === 'plain' ? hh % 10 : hh % 3;
    if (core) {                          // стена ноги — из плиток автора: ровные панели, изредка скол, светлая заплата, решётка или скоба; мох — у дверей
      const t = [c.x, -c.z, -c.x, c.z][i], M = WALLP.meta, pk = (k, n) => M[k][0] + (n % M[k][1]); let kind = p < 84 ? 'plain' : p < 93 ? 'chip' : p < 96 ? 'light' : p < 97 ? 'vent' : p < 98 ? 'handle' : 'plain';
      for (const d of LEVEL.doors) { if (d.f !== i) continue; const dt = Math.abs(t - [d.x, -d.z, -d.x, d.z][i]), dy = c.y - d.y; if (dy === 0 && (dt <= 1.6 || (dt <= 2.6 && hh % 2))) kind = 'mossLow'; else if (dy === 1 && dt <= 1.6 && hh % 3) kind = 'mossTop'; else if (dy === -1 && dt <= 1.6 && hh % 2) kind = 'mossTop'; }
      if (kind === 'plain' && hh % 67 === 0) kind = 'mossTop';
      f.wp = pk(kind, hh >> 3); f.sl = ((t + (Math.floor(c.y / 2) % 2) * 2 + 3000) % 3 === 0) ? 1 : 0; f.sb = c.y % 2 === 0 ? 1 : 0; f.pel = c.y >= LEVEL.pelY;
    }
    if (c.kind === 'ledge' && c.top) { const Lq = cubes.get(ckey(c.x - N[1], c.y, c.z + N[0])), Rq = cubes.get(ckey(c.x + N[1], c.y, c.z - N[0]));   /* уступ из листа автора: край или середина полки */
      const l = !(Lq && Lq.kind === 'ledge' && Lq.top && !hasCube(Lq.x + N[0], c.y, Lq.z + N[1])), r = !(Rq && Rq.kind === 'ledge' && Rq.top && !hasCube(Rq.x + N[0], c.y, Rq.z + N[1])); f.ls = l && r ? 'S' : l ? 'L' : r ? 'R' : 'M'; f.lv = hh % 3; }
    if (c.kind === 'ledge' && c.top) {   // моховая шапка автора: на весь уступ сразу или ни на один его куб; у воды мох густой, у пара его нет, чем выше — тем реже и тоньше
      let rx = c.x, rz = c.z, n = 0; while (n++ < 30) { const q = cubes.get(ckey(rx - N[1], c.y, rz + N[0])); if (!q || q.kind !== 'ledge' || !q.top || hasCube(rx - N[1] + N[0], c.y, rz + N[0] + N[1])) break; rx -= N[1]; rz += N[0]; }
      const rh = Math.abs((rx * 2246822519) ^ (c.y * 3266489917) ^ (rz * 668265263) ^ (i * 97)) % 1000;
      const run = [[rx, rz]]; { let qx = rx, qz = rz, m = 0; while (m++ < 30) { const q = cubes.get(ckey(qx + N[1], c.y, qz - N[0])); if (!q || q.kind !== 'ledge' || !q.top || hasCube(qx + N[1] + N[0], c.y, qz - N[0] + N[1])) break; qx += N[1]; qz -= N[0]; run.push([qx, qz]); } }
      const wet = run.some(u => LEVEL.wet.some(q => Math.abs(q[0] - u[0]) < 1.6 && Math.abs(q[2] - u[1]) < 1.6 && q[1] > c.y)), dry = run.some(u => LEVEL.steams.some(q => Math.abs(q.x - u[0]) + Math.abs(q.z - u[1]) < 2.2 && Math.abs(q.y - c.y - 1.4) < 1));
      const pc = c.y <= 1 ? 1000 : dry ? 0 : wet ? 1000 : c.y < 12 ? 520 : c.y < 25 ? 400 : 300;
      if (rh < pc) { f.cap = 1 + (c.y <= 1 || wet ? 0 : c.y < 12 ? (rh % 3 ? 0 : 1) : c.y < 25 ? (rh % 3 ? 1 : 0) : (rh % 3 ? 1 : 2));
        const Lq = cubes.get(ckey(c.x - N[1], c.y, c.z + N[0])), Rq = cubes.get(ckey(c.x + N[1], c.y, c.z - N[0]));
        f.capL = !(Lq && Lq.kind === 'ledge' && Lq.top); f.capR = !(Rq && Rq.kind === 'ledge' && Rq.top); f.capS = f.capL ? 0 : f.capR ? 3 : 1 + hh % 2; }
    }
    f.dec = !core && c.top && hh % 5 === 0 ? 2 : 0; { const pm = c.y === 0 ? 1 : c.y === 1 ? 0.55 : c.y < 8 ? 0.3 : 0.2; f.mv = !core && c.kind !== 'plat' && (hh % 100) / 100 < pm ? (c.y === 0 ? 7 : c.y === 1 ? 6 : 1 + (hh >> 3) % 4) : 0; f.low = c.y <= 1 ? 1 : 0; }
  }
  ledge4Cover(); nicheCover(); mossAssign();
}
// платформы и выступы: плоскость уступа режется на прямоугольники, каждый выкладывается ЦЕЛЫМИ плитками автора в их
// родном размере (LEDGE4K пикселей листа на куб) — плитка выбирается по форме оставшегося места; не влезла — обрезается, по срезу шов
// мох в стиле листа платформ: приглушённый оливковый, растёт от верхних краёв со свисающими нитями, из нижних углов, пятнами у швов;
// у подошвы титана (самый низ ноги) — сплошной мох с грязью. Тайл 40x40 «пикселей», прозрачный, кладётся поверх грани
// мох сплошной по миру: толщина и наличие — гладкий шум по координате вдоль стены (в «пикселях мха», 40 на куб),
// поэтому соседние грани стыкуются без швов. Сверху уступов — бахрома с нитями, полосами с сужением к краям;
// у подошвы (нижние ряды ноги) — мох с грязью, поднимается снизу неровной кромкой.
const mossOv = new Map(), mossBud = { t: -1, n: 0 };
function mHash(i, sd) { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(sd + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 15; return (h >>> 0) / 4294967296; }
function mNoise(X, step, sd) { const i = Math.floor(X / step), t = X / step - i, a = mHash(i, sd), b = mHash(i + 1, sd), k = (1 - Math.cos(t * Math.PI)) / 2; return a + (b - a) * k; }
function mossCanvas(kind, su, y, pl) {   // kind 0 — бахрома сверху, 1 — подошва (нижний ряд), 2 — подошва, ряд выше
  const key = kind + '|' + su + '|' + y + '|' + pl; let c = mossOv.get(key); if (c) return c;
  if (mossBud.t !== game.time) { mossBud.t = game.time; mossBud.n = 0; } if (++mossBud.n > 10) return null;   // не больше 10 новых кусков мха за кадр — без рывков
  const N = 40, TOPX = 6, H = N + TOPX; c = document.createElement('canvas'); c.width = N; c.height = H; const x2 = c.getContext('2d'), sd = pl * 131 + y * 17;
  const M = new Uint8Array(N * H), set = (x, yy) => { if (x >= 0 && x < N && yy >= 0 && yy < H) M[yy * N + x] = 1; }, at = (x, yy) => x >= 0 && x < N && yy >= 0 && yy < H && M[yy * N + x];
  for (let px = 0; px < N; px++) { const X = su * N + px;
    if (kind === 0) {
      const pres = mNoise(X, 70, sd + 3) * 1.4 - 0.25; if (pres <= 0) continue;   // мох полосами; у краёв полосы тоньше
      const th = Math.round((3 + mNoise(X, 9, sd + 5) * 8 + mNoise(X, 3, sd + 7) * 2) * Math.min(1, pres * 3));
      const up = Math.round(mNoise(X, 5, sd + 9) * 3 * Math.min(1, pres * 3)); for (let yy = TOPX - up; yy < TOPX + th; yy++) set(px, yy);   // чуть наползает на верх
      if (mHash(X, sd + 11) < 0.07 * pres) { const L = 4 + Math.floor(mHash(X, sd + 13) * 14); for (let yy = TOPX + th; yy < TOPX + th + L; yy++) set(px, yy); }   // свисающая нить
    } else {
      const base = kind === 1 ? 16 : -24, hh = base + Math.round(mNoise(X, 11, 77) * 22 + mNoise(X, 4, 79) * 6);   // одна кромка на оба ряда — стык ровный
      for (let yy = Math.max(0, H - hh); yy < H; yy++) set(px, yy);
      if (mHash(X, 83) < 0.08) { const L = 3 + Math.floor(mHash(X, 85) * 7); for (let yy = H - hh - L; yy < H - hh; yy++) set(px, yy); }   // травинки вверх
    } }
  for (let yy = 0; yy < H; yy++) for (let px = 0; px < N; px++) { if (!M[yy * N + px]) continue; const X = su * N + px, r = mHash(X * 64 + yy, sd + 21); let col;
    if (!at(px, yy - 1)) col = r < 0.3 ? MOSS_PAL[5] : MOSS_PAL[4]; else if (!at(px, yy + 1)) col = MOSS_PAL[1]; else col = MOSS_PAL[2 + (r < 0.45 ? 1 : 0)];
    if (kind === 1 && yy > H - 10 && r < 0.85) col = ['#1e150f', '#2a1d14', '#17110c', '#33241a'][Math.floor(r * 7) % 4];   // внизу, у самой подошвы — тёмная грязь
    if (r > 0.97) col = MOSS_PAL[0]; x2.fillStyle = col; x2.fillRect(px, yy, 1, 1); }
  mossOv.set(key, c); return c;
}
function mossAssign() {
  for (const f of faces) { f.moss = null; if (f.rm || f.inn || f.flo || f.pool || f.cons) continue; const pl = (f.nx + 1) * 3 + f.nz + 1 + (f.nx ? f.cx : f.cz) * 9;
    if (f.y <= -4) f.moss = [1, pl]; else if (f.y === -3) f.moss = [2, pl];
    else if (f.topOpen && f.kind !== 'core') f.moss = [0, pl]; else if (f.topOpen && f.y < 40) f.moss = [0, pl]; }
}
function drawMoss(f, x, y, w, Sq) {
  const c = mossCanvas(f.moss[0], f.su, f.y, f.moss[1]), k = Sq / 40; if (!c) return; ctx.imageSmoothingEnabled = false; ctx.drawImage(c, x, Math.round(y - 6 * k), w, Math.round(46 * k)); }
const MOSS_PAL = ['#2c3619', '#3d4a22', '#56632f', '#6d7a3a', '#8a9448', '#a6a85a'], DIRT_PAL = ['#3a2c22', '#4d3a2a', '#5e4934', '#2e231c'];
const LEDGE4K = 96, NICHE2 = [[0, 0, 230, 258], [232, 0, 257, 258], [491, 0, 345, 371], [838, 0, 458, 371], [1298, 0, 189, 371], [1489, 0, 293, 371], [1784, 0, 294, 373], [2080, 0, 343, 373], [2425, 0, 287, 374], [2714, 0, 321, 374], [3037, 0, 327, 374], [3366, 0, 304, 373], [3672, 0, 320, 379], [3994, 0, 329, 380], [4325, 0, 328, 380], [4655, 0, 329, 380], [4986, 0, 313, 378], [5301, 0, 320, 378], [5623, 0, 327, 379], [5952, 0, 328, 378], [6282, 0, 329, 378], [6613, 0, 312, 379]];   /* + 20 панелей с проводами автора (tools/wire2_build.py) */   // tools/niche_build.py: панели ниш (провода и щиток, косая балка с трубой)
// ниши: задняя стенка ниши чаще закрыта панелью автора — целиком, если влезает, иначе вырез из середины; масштаб как у платформ
function nicheCover() {
  const K = LEDGE4K, G = new Map();
  for (const f of faces) { f.nch = null; const back = f.rm && f.kind === 'core' && f.nz === 1 && Math.abs(f.cz - (ROOM_Z - 0.5)) < 0.01; if (!(f.kind === 'core' && ((f.inn && !f.rm) || back))) continue; f.nback = back;   /* и задняя стена комнат внутри робота */ const k = (f.nx + 1) * 3 + f.nz + 1 + '|' + (f.nx ? f.cx : f.cz); let g = G.get(k); if (!g) G.set(k, g = new Map()); g.set(f.su + ',' + f.y, f); }
  for (const g of G.values()) { const done = new Set(), cells = [...g.values()].sort((a, b) => b.y - a.y || a.su - b.su), free = (su, y) => g.has(su + ',' + y) && !done.has(su + ',' + y);
    for (const f of cells) { if (done.has(f.su + ',' + f.y)) continue;
      let gw = 1; while (gw < 4 && free(f.su + gw, f.y)) gw++; let gh = 1; while (gh < 4) { let ok = true; for (let a = 0; a < gw; a++) if (!free(f.su + a, f.y - gh)) ok = false; if (!ok) break; gh++; }
      for (let a = 0; a < gw; a++) for (let b = 0; b < gh; b++) done.add((f.su + a) + ',' + (f.y - b));
      if (f.h % 100 >= (f.nback ? 65 : 88)) continue;   /* часть ниш с прежней решёткой; в комнатах панели с проводами — пятнами */
      const P = NICHE2[Math.abs(f.h * 7 + f.y * 3 + f.su) % NICHE2.length], ox = Math.round((P[2] - gw * K) / 2), oy = Math.round((P[3] - gh * K) / 2);
      for (let a = 0; a < gw; a++) for (let b = 0; b < gh; b++) { const q = g.get((f.su + a) + ',' + (f.y - b)); if (!q) continue;
        const sx0 = ox + a * K, sy0 = oy + b * K, x0 = Math.max(0, sx0), y0 = Math.max(0, sy0), x1 = Math.min(P[2], sx0 + K), y1 = Math.min(P[3], sy0 + K); if (x1 <= x0 || y1 <= y0) continue;
        q.nch = [P[0] + x0, P[1] + y0, x1 - x0, y1 - y0, x0 - sx0, y0 - sy0]; } } }
}
function ledge4Cover() {
  const K = LEDGE4K, T = (typeof LEDGE5 !== 'undefined' ? LEDGE5 : []).filter(t => Math.min(t[2], t[3]) >= 36 && Math.max(t[2], t[3]) / Math.min(t[2], t[3]) <= 6), use = f => f.kind === 'ledge' || f.kind === 'plat' || f.bul, G = new Map();
  for (const f of faces) { f.l4 = null; if (!use(f)) continue; const k = (f.nx + 1) * 3 + f.nz + 1 + '|' + (f.nx ? f.cx : f.cz); let g = G.get(k); if (!g) G.set(k, g = new Map()); g.set(f.su + ',' + f.y, f); }
  if (!T.length) return;
  let rs = 1, used = {}, lastUse = {}, smallR = false; const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
  const fill = (x, y, w, h, out) => {
    if (w < 6 || h < 6) return;
    let best = -1, bs = -1e9;
    for (let k = 0; k < T.length; k++) { const t = T[k], tw = t[2], th = t[3]; if (tw > w + 3 || th > h + 3) continue;
      const rw = w - tw, rh = h - th, sl = (rw > 3 && rw < 18 ? 0.35 : 0) + (rh > 3 && rh < 18 ? 0.35 : 0);
      const simple = t[4] < 33; if (smallR && !simple) continue; const sc = (tw * th) / (w * h) - sl + rnd() * (smallR ? 1.2 : 0.4) - (used[k] || 0) * 0.3 - (lastUse[k] || 0) * 0.2 + (simple ? 0.3 : rnd() < 0.15 ? 0 : -0.7); if (sc > bs) { bs = sc; best = k; } }   /* простые плитки — основа, детальные изредка */
    if (best < 0) { let bd = 1e9; for (let k = 0; k < T.length; k++) { const t = T[k]; if (t[4] >= 33) continue; const d = Math.max(0, w - t[2]) * 3 + Math.max(0, h - t[3]) * 3 + (t[2] - w > 0 ? t[2] - w : 0) * 0.3 + (t[3] - h > 0 ? t[3] - h : 0) * 0.3 + rnd() * 20; if (d < bd) { bd = d; best = k; } } }   // не влезает ни одна — простая плитка, обрезанная по месту
    const t = T[best], cw = Math.min(t[2], w), ch = Math.min(t[3], h);
    used[best] = (used[best] || 0) + 1; lastUse[best] = (lastUse[best] || 0) + 1; out.push([t[0], t[1], cw, ch, x, y, t[2] > w + 0.5, t[3] > h + 0.5]);
    if (w - cw > h - ch) { fill(x + cw, y, w - cw, h, out); fill(x, y + ch, cw, h - ch, out); }
    else { fill(x, y + ch, w, h - ch, out); fill(x + cw, y, w - cw, ch, out); }
  };
  for (const g of G.values()) {
    const cells = [...g.values()].sort((a, b) => b.y - a.y || a.su - b.su), free = (su, y) => { const f = g.get(su + ',' + y); return f && !f.l4; };
    if (typeof LEDGE5L !== 'undefined') for (const f of cells) { if (f.l4 || f.h % 10 >= 8) continue;   // уголок «Г»: верхний ряд из двух кубов и стойка под одним из концов
      const s = f.su, y = f.y, B = free(s + 1, y), C = free(s + 1, y - 1), D = free(s, y - 1), hasC = g.has((s + 1) + ',' + (y - 1)), hasD = g.has(s + ',' + (y - 1)); if (!B) continue;
      const CH = 30, put = (su, yy, e) => { g.get(su + ',' + yy).l4 = [e]; };
      if ((C && !hasD) || (D && !hasC)) { game.l4L = (game.l4L || 0) + 1; (game.l4Lp || (game.l4Lp = [])).push([f.cx, f.y, f.cz, f.nx, f.nz]); }
      if (C && !hasD) { const [Lx, Ly] = LEDGE5L[0]; put(s, y, [Lx, Ly, K, K + CH, 0, 0, 0, 0]); put(s + 1, y, [Lx + K, Ly, K, K, 0, 0, 0, 0]); put(s + 1, y - 1, [Lx + K, Ly + K, K, K, 0, 0, 0, 0]); }
      else if (D && !hasC) { const [Lx, Ly] = LEDGE5L[1]; put(s, y, [Lx, Ly, K, K, 0, 0, 0, 0]); put(s + 1, y, [Lx + K, Ly, K, K + CH, 0, 0, 0, 0]); put(s, y - 1, [Lx, Ly + K, K, K, 0, 0, 0, 0]); } }
    for (const f of cells) { if (f.l4) continue;
      let gw = 1; while (gw < 10 && free(f.su + gw, f.y)) gw++; let gh = 1; while (gh < 8) { let ok = true; for (let a = 0; a < gw; a++) if (!free(f.su + a, f.y - gh)) ok = false; if (!ok) break; gh++; }
      rs = (Math.abs((f.su * 73856093) ^ (f.y * 19349663) ^ (f.h * 7)) % 2147483646) + 1; rnd(); smallR = gw * gh <= 2; used = {}; for (const k in lastUse) lastUse[k] *= 0.6; const out = []; fill(0, 0, gw * K, gh * K, out);
      for (let a = 0; a < gw; a++) for (let b = 0; b < gh; b++) { const q = g.get((f.su + a) + ',' + (f.y - b)); if (!q) continue; const X0 = a * K, Y0 = b * K, L = [];
        for (const o of out) { const x0 = Math.max(o[4], X0), y0 = Math.max(o[5], Y0), x1 = Math.min(o[4] + o[2], X0 + K), y1 = Math.min(o[5] + o[3], Y0 + K); if (x1 <= x0 || y1 <= y0) continue;
          L.push([o[0] + x0 - o[4], o[1] + y0 - o[5], x1 - x0, y1 - y0, x0 - X0, y0 - Y0, o[6] && x1 === o[4] + o[2] ? 1 : 0, o[7] && y1 === o[5] + o[3] ? 1 : 0]); }
        q.l4 = L; } } }
}
const vis = [], faceRows = { src: null, n: 0, m: null };
let ghostPass = false, pelPass = false;
// Грани стен склеиваются в готовые куски 6x4 куба (по плоскостям): вместо сотен плиток за кадр — несколько картинок.
// Кусок перерисовывается только когда меняется масштаб или глубина камеры; во время поворота мира — по-старому, по плиткам.
const CH = { src: null, cache: new Map(), S: 0, bakes: 0 }, CH_W = 6, CH_H = 4; let chFrame = 0; const CH_M = () => Math.round(S * 0.3);
function chunksBuild() { if (CH.src === faces) return; CH.src = faces; CH.cache.clear(); const m = new Map();
  for (const f of faces) { f.chk = null; if (f.su === undefined || (f.br2 && !f.tor)) continue; const pl = f.nx + ',' + f.nz + ',' + (f.nx ? f.cx : f.cz), cs = Math.floor(f.su / CH_W), cy = Math.floor(f.y / CH_H), k = pl + '|' + cs + '|' + cy;
    let C = m.get(k); if (!C) m.set(k, C = { id: k, faces: [], su0: cs * CH_W, yTop: cy * CH_H + CH_H - 1, fr: -1 }); C.faces.push(f); f.chk = C; }
  for (const C of m.values()) if (C.faces.length < CH_W * CH_H * 0.75) for (const f of C.faces) f.chk = null; }   /* редкие куски (уступы, выступы) — по-старому: прозрачная картинка дороже нескольких плиток */
function chunkCanvas(C, dq) { const key = C.id + '|' + dq; let c = CH.cache.get(key); if (c) { CH.cache.delete(key); CH.cache.set(key, c); return c; }
  if (CH.bakes >= 3) return null; CH.bakes++; CH.tot = (CH.tot || 0) + 1; const M = CH_M(); c = document.createElement('canvas'); c.width = CH_W * S + 2 * M; c.height = CH_H * S + 2 * M;
  const list = C.faces.map(f => { const o = Object.create(f); o._u = f.su - C.su0 + 0.5; o._w = 1; o._d = dq; return o; });
  const keep = ctx; ctx = c.getContext('2d'); mossBud.t = game.time; mossBud.n = -1e9; try { drawFaceList(list, M, M, C.yTop + 1); } finally { ctx = keep; mossBud.n = 0; }
  CH.cache.set(key, c); while (CH.cache.size > 70) CH.cache.delete(CH.cache.keys().next().value); return c; }
function drawWorld(b, actors) {
  vis.length = 0; chunksBuild(); if (CH.S !== S0) { CH.S = S0; CH.cache.clear(); } chFrame++; CH.bakes = 0;
  const useCh = false && !ghostPass && !pelPass && S === S0 && !view.rotating && !game.zoom;
  const halfW = W / S / 2 + 1, halfH = H / S / 2 + 1;
  if (faceRows.src !== faces || faceRows.n !== faces.length) { faceRows.m = new Map(); for (const f of faces) { let r = faceRows.m.get(f.y); if (!r) faceRows.m.set(f.y, r = []); r.push(f); } faceRows.src = faces; faceRows.n = faces.length; }   /* грани по рядам: перебираем только ряды в кадре */
  for (let Y = Math.floor(cam.y - halfH) - 1, Y1 = Math.ceil(cam.y + halfH) + 1; Y <= Y1; Y++) { const row = faceRows.m.get(Y); if (row) for (const f of row) {
    const facing = f.nx * b.n[0] + f.nz * b.n[1]; if (facing < 0.02 || (ghostPass ? (f.br || f.br2 || f.y + game.gv.y > LEVEL.pelY + 0.02) : (pelPass ? (!f.br2 || f.tor) : (f.br2 && !f.tor)))) continue;   /* торс — обычные грани: иначе он ложился поверх героя у дверей */   // вторая нога — без таза и не выше его низа; таз над ней рисуется отдельно, поверх
    if (f.y + 1 < cam.y - halfH || f.y > cam.y + halfH) continue;
    const rx = f.cx - cam.x, rz = f.cz - cam.z;
    const u = rx * b.r[0] + rz * b.r[1]; if (u < -halfW || u > halfW) continue;
    f._u = u; f._d = rx * b.n[0] + rz * b.n[1]; f._w = facing;
    if (useCh && f.chk && facing > 0.999) { const C = f.chk; if (C.fr === chFrame) continue; const dq = Math.round(f._d * 4) / 4, cv = chunkCanvas(C, dq);
      if (cv) { C.fr = chFrame; const X = Math.round(W / 2 + f._u * S - S / 2 - (f.su - C.su0) * S), Y = Math.round(H / 2 - (f.y + 1 - cam.y) * S - (C.yTop - f.y) * S); vis.push({ _d: f._d, draw: () => ctx.drawImage(cv, X - CH_M(), Y - CH_M()) }); continue; } }
    vis.push(f);
  } }
  for (const a of actors) vis.push(a);
  vis.sort((p, q) => p._d - q._d);
  drawFaceList(vis, W / 2, H / 2, cam.y);
}
// рисует готовый список граней (и вставленных между ними актёров); OX, OY — где на холсте «середина», CY — высота камеры. Им же рисуются руки титана
const c3Facing = f => f._w > 0.55 && !ghostPass;
// v240 (Алексей 18.10: «на стыках поворота бардак»): плоская вещь на стене при повороте не пропадает рывком — сужается и плавно гаснет к ребру
const edgeFade = fc => fc <= 0.03 ? 0 : Math.min(1, (fc - 0.03) / 0.3);
function drawFaceList(list, OX, OY, CY) {
  const plat = img.plat, block = img.bgblock;
  for (const f of list) {
    if (f.draw) { ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1; f.draw(); ctx.globalAlpha = 1; continue; }
    const w0 = f._w * S, x0 = OX + f._u * S - w0 / 2, y0 = OY - (f.y + 1 - CY) * S, x = Math.round(x0), y = Math.round(y0), w = Math.max(1, Math.round(x0 + w0) - x), Sq = Math.round(y0 + S) - y;
    if (f.shB && !ghostPass) { const sh = Math.round(S * 0.16); ctx.fillStyle = 'rgba(8,6,16,0.24)'; ctx.fillRect(x, y + Sq, w, sh); ctx.fillStyle = 'rgba(8,6,16,0.11)'; ctx.fillRect(x, y + Sq + sh, w, Math.round(S * 0.1)); }   // мягкая тень под нижней кромкой: уступ отделяется от стены
    ctx.imageSmoothingEnabled = false;
    const L3 = img.ledge3, LM = D.ledge3;
    if (f.ls && L3 && L3.width && LM && c3Facing(f)) {   // уступ: срез из нового набора — плита 1 куб и опоры под ней
      const row = f.lv % LM.rows, nm = LM.mid[row], col = f.ls === 'L' ? 0 : f.ls === 'R' ? 1 : f.ls === 'S' ? (f.h % 2) : 2 + f.h % nm, flip = f.nx + f.nz < 0 ? false : false, hgt = Math.round(Sq * LM.h / 32);
      ctx.drawImage(L3, col * 32, row * LM.h, 32, LM.h, x, y, w + 0.6, hgt);
      if (f.ls === 'S') ctx.drawImage(L3, 32, row * LM.h, 16, LM.h, x + w / 2, y, w / 2 + 0.6, hgt);
      let dk = (1 - f._w) * 0.4 + Math.min(0.5, Math.max(0, (2.5 - f._d) * 0.045)); if (dk > 0.01) { ctx.fillStyle = 'rgba(6,18,26,' + dk.toFixed(3) + ')'; ctx.fillRect(x, y, w, Sq); }
      continue; }
    const L4 = img.ledge4, use4 = L4 && L4.width && (f.kind === 'ledge' || f.kind === 'plat' || f.bul) && f.su !== undefined;
    if (use4) {   // платформы и выступы — панели автора: блоками 3x3 куба, у каждого блока своя панель
      const Q = f.l4, kx = w / LEDGE4K, ky = Sq / LEDGE4K; ctx.fillStyle = '#1e1a22'; ctx.fillRect(x, y, w, Sq);
      if (Q) ctx.imageSmoothingEnabled = kx < 0.97;   // мельче оригинала — сглаживать, иначе выпадают целые ряды пикселей
      if (Q) for (const o of Q) { const X0 = Math.floor(x + o[4] * kx), Y0 = Math.floor(y + o[5] * ky), X1 = Math.ceil(x + (o[4] + o[2]) * kx), Y1 = Math.ceil(y + (o[5] + o[3]) * ky);
        ctx.drawImage(L4, o[0], o[1], o[2], o[3], X0, Y0, X1 - X0, Y1 - Y0);
        ctx.fillStyle = '#1e1a22'; if (o[6]) ctx.fillRect(X1 - Math.max(1, 3 * kx), Y0, Math.max(1, 3 * kx), Y1 - Y0); if (o[7]) ctx.fillRect(X0, Y1 - Math.max(1, 3 * ky), X1 - X0, Math.max(1, 3 * ky)); } ctx.imageSmoothingEnabled = false; if (f.moss) drawMoss(f, x, y, w, Sq); }
    else if (f.kind === 'plat') {
      const pw = plat.width, a = f.pl && f.pr ? [pw * 0.33, pw * 0.34] : f.pl ? [pw * 0.5, pw * 0.5] : f.pr ? [0, pw * 0.5] : [0, pw];
      ctx.drawImage(plat, a[0], 0, a[1], plat.height, x, y, w, Sq);
    } else if (f.kind === 'core') { const WT = img.legwall3 && img.legwall3.width ? img.legwall3 : img.legwall2, nt = WT === img.legwall3; if (CFG.wallTex !== false && WT && WT.width && f.wv !== undefined) { const kp = nt ? WT.height / 160 : 1, wv = nt && f.inn && !f.rm && WT.width >= 2560 * kp ? 8 + (f.h % 2) : f.wv; ctx.drawImage(WT, (wv * 256 + f.wx * 32) * kp, f.wy * 32 * kp, 32 * kp, 32 * kp, x, y, w, Sq); if (f.nch && img.niche2 && img.niche2.width) { const o = f.nch, kx2 = w / LEDGE4K, ky2 = Sq / LEDGE4K; ctx.imageSmoothingEnabled = kx2 < 0.97; ctx.drawImage(img.niche2, o[0], o[1], o[2], o[3], Math.floor(x + o[4] * kx2), Math.floor(y + o[5] * ky2), Math.ceil(o[2] * kx2), Math.ceil(o[3] * ky2)); ctx.imageSmoothingEnabled = false; } if (f.moss) drawMoss(f, x, y, w, Sq); if (nt) f.det = 0; const kx = w / 32, ky = Sq / 32, R = (a, b2, c2, d2, col) => { ctx.fillStyle = col; ctx.fillRect(x + a * kx, y + b2 * ky, c2 * kx + 0.5, d2 * ky + 0.5); };
        if (f.wl) { ctx.fillStyle = 'rgba(255,240,236,0.035)'; ctx.fillRect(x, y, w, Sq); }   /* v266: было 0.13 — светлые листы сильно выделялись */
        if (f.det === 1 || f.det === 4) for (const bxp of [5, 15, 25]) { R(bxp, 5, 2, 2, '#4c474e'); R(bxp, 5, 1, 1, '#c9bcc0'); }                                   // болты
        else if (f.det === 2) ctx.drawImage(img.legwall2, 1024 + 66, 26, 10, 13, x + 11 * kx, y + 9 * ky, 10 * kx, 13 * ky);                                          // ручка-скоба автора
        else if (f.det === 3) { R(11, 19, 10, 2, 'rgba(20,14,22,0.28)'); R(11, 10, 10, 9, '#3a3237'); R(12, 11, 8, 7, '#5a4f55'); R(13, 12, 6, 5, '#231d21'); R(12, 11, 3, 1, '#9a8f95'); }   // торец трубы, торчащей из стены
        else if (f.det === 5) { for (const q of [[11, 9, 9], [14, 7, 12], [17, 10, 8]]) { R(q[0], q[1], 1, q[2], '#57515a'); R(q[0] + 1, q[1] + 1, 1, q[2] - 1, 'rgba(255,244,240,0.14)'); } }                      // царапины
        else if (f.det === 6) { const PD = (nm, tx, ty) => { const q = PROPS[nm]; if (q && img.props && img.props.width) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img.props, q[0], q[1], q[2], q[3], Math.round(x + tx * kx), Math.round(y + ty * ky), Math.round(q[2] * 1.36 * kx), Math.round(q[3] * 1.36 * ky)); } }; PD('mgrille', 8, 8); }
        else if (f.det === 7) { const PD = (nm, tx, ty) => { const q = PROPS[nm]; if (q && img.props && img.props.width) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img.props, q[0], q[1], q[2], q[3], Math.round(x + tx * kx), Math.round(y + ty * ky), Math.round(q[2] * 1.36 * kx), Math.round(q[3] * 1.36 * ky)); } }; PD('mlight', 9, 9); }
        else if (f.det === 8) { R(9, 12, 8, 8, '#b89a3c'); R(9, 12, 8, 1, '#d8bc58'); R(13, 13, 2, 3, '#2a262c'); R(12, 15, 3, 1, '#2a262c'); R(11, 16, 2, 3, '#2a262c'); R(19, 13, 5, 6, '#8b8389'); R(19, 13, 5, 1, '#5f5860'); }
        else if (f.det === 9) { R(4, 4, 24, 1, '#4c474e'); R(4, 27, 24, 1, '#4c474e'); R(4, 4, 1, 24, '#4c474e'); R(27, 4, 1, 24, '#4c474e'); R(5, 5, 22, 1, 'rgba(255,244,240,0.16)'); R(5, 5, 1, 22, 'rgba(255,244,240,0.1)'); for (const q of [[6, 7], [24, 7], [6, 24], [24, 24]]) { R(q[0], q[1], 2, 2, '#4c474e'); R(q[0], q[1], 1, 1, '#c9bcc0'); } R(9, 21, 14, 4, '#5f5860'); R(10, 22, 12, 2, '#2a262c'); R(9, 21, 14, 1, '#8b8389'); }   // вдавленная панель в рамке с заклёпками и щелью
        else if (f.det === 10) { const PD = (nm, tx, ty) => { const q = PROPS[nm]; if (q && img.props && img.props.width) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img.props, q[0], q[1], q[2], q[3], Math.round(x + tx * kx), Math.round(y + ty * ky), Math.round(q[2] * 1.36 * kx), Math.round(q[3] * 1.36 * ky)); } }; PD('mslits', 9, 9); }
        else if (f.det === 11) { for (let k2 = 0; k2 < 12; k2++) { const xx = 20 - (k2 >> 1); R(xx, 8 + k2, 1, 1, '#4c474e'); R(xx + 1, 8 + k2, 1, 1, 'rgba(255,244,240,0.16)'); if (k2 > 3) { R(xx + 5, 9 + k2, 1, 1, '#4c474e'); R(xx + 6, 9 + k2, 1, 1, 'rgba(255,244,240,0.16)'); } } }   // косые борозды   // жёлтая табличка
        if (f.sR) R(31, 0, 1, 32, '#4e4a50'); if (f.sL) R(0, 0, 1, 32, '#4e4a50'); if (f.sB) R(0, 31, 32, 1, '#4e4a50'); if (f.sT) R(0, 0, 32, 1, '#4e4a50'); if (f.hiT && !ghostPass) { R(0, 0, 32, 2, '#cfc6c9'); R(0, 2, 32, 1, 'rgba(255,246,232,0.3)'); } }   // полоса света по верхней кромке нароста: видно, что он выступает
        else ctx.drawImage(tileFor(f), 0, 0, TS, TS, x, y, w, Sq); }
    else if (f.mv) { ctx.imageSmoothingEnabled = true; ctx.drawImage(mossTile(f.v, f.mv), x, y, w, Sq); }
    else { ctx.imageSmoothingEnabled = true; const sb = SP['bgblock_' + f.v]; ctx.drawImage(block, sb[1] + 1, sb[2] + 1, sb[3] - 2, sb[4] - 2, x, y, w, Sq); }
    let dark = (1 - f._w) * 0.4 + Math.min(0.5, Math.max(0, (2.5 - f._d) * 0.045));
    if (f.kind === 'plat') dark *= 0.5; else if (f.kind === 'core') dark += img.legwall3 && img.legwall3.width ? (f.pel ? 0.12 : 0.02) : f.pel ? 0.3 : 0.16;
    if (f.y <= -4) dark += 0.4; else if (f.y === -3) dark += 0.22; else if (f.y === -2) dark += 0.08;   // низ ступни темнее: чем ближе к земле, тем гуще
    if (f.cons) dark += 0.08;   /* консоли голени — та же обшивка, что у стены: не тёмные провалы, похожие на ниши */
    if (f.rm) dark = f.inn ? 0.22 + (f.y % 2 ? 0.03 : 0) : f.kind === 'plat' ? dark : 0.8;   // разрез корпуса: толща стен почти чёрная, комната — светлая
    else if (f.inn) dark = Math.min(0.9, dark + 0.3);   // внутри хода темно: проём читается как дыра в стене
    if (f.inn && !f.rm && f.kind === 'core') dark = Math.min(0.7, dark + 0.06);   // ниша глубже и темнее
    if (dark > 0.01) { ctx.fillStyle = (f.inn && !f.rm ? 'rgba(12,7,12,' : 'rgba(6,18,26,') + dark.toFixed(3) + ')'; ctx.fillRect(x, y, w, Sq); }
    if (f.flo) { ctx.fillStyle = '#6d6470'; ctx.fillRect(x, y, w + 0.6, Math.max(2, Math.round(S * 0.06))); ctx.fillStyle = 'rgba(255,240,220,0.35)'; ctx.fillRect(x, y, w + 0.6, Math.max(1, Math.round(S * 0.02))); }   // пол комнаты: светлая кромка по верху толщи
    if (f.kind === 'plat') { /* у платформы своя кромка */ }
    else if (f.top && f.kind !== 'core') { ctx.fillStyle = 'rgba(255,244,225,0.5)'; ctx.fillRect(x, y, w + 0.6, Math.max(2, S * 0.045)); }
    else if (f.top) { ctx.fillStyle = 'rgba(255,244,225,0.22)'; ctx.fillRect(x, y, w + 0.6, Math.max(2, S * 0.03)); }
    if (ghostPass) { ctx.fillStyle = 'rgba(150,190,205,0.3)'; ctx.fillRect(x, y, w, Sq); continue; }   // вторая нога: без мелочей, в дымке
    if (f.pool) { const dp = Math.round(Sq / 3), g2 = Math.max(2, Math.round(S * 0.04)); ctx.fillStyle = '#35303a'; ctx.fillRect(x, y, w + 0.6, dp); ctx.fillStyle = '#2a262e'; ctx.fillRect(x, y, w + 0.6, g2);   // верхняя треть уступа срезана: видно заднюю стенку чаши
      ctx.fillStyle = 'rgba(255,244,225,0.4)'; ctx.fillRect(x, y + dp, w + 0.6, Math.max(2, S * 0.04)); }
    if (false && f.cap && !f.pool && f._w > 0.3 && img.props && img.props.width) {   // старые моховые шапки убраны — мох теперь сплошной (drawMoss)   // моховая шапка поверх верхнего края, по краям уступа чуть свисает вбок
      const ap = S / APX, kx = w / S, r = PROPS['cap' + (f.cap - 1)], sx = [9, 33, 56, 80][f.capS], sw = [24, 23, 24, 23][f.capS], yy = Math.round(y - 7 * ap);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img.props, r[0] + sx, r[1], sw, r[3], x, yy, w + 0.6, r[3] * ap);
      if (f.capL) ctx.drawImage(img.props, r[0] + 6, r[1], 3, r[3], x - 3 * ap * kx, yy, 3 * ap * kx + 0.5, r[3] * ap);
      if (f.capR) ctx.drawImage(img.props, r[0] + (f.capS === 3 ? 103 : 103), r[1], 2, r[3], x + w, yy, 2 * ap * kx + 0.5, r[3] * ap);
      ctx.imageSmoothingEnabled = true;
      if (f.h % 5 === 1) { const g = Math.max(2, Math.round(ap)), gx = Math.round(x + w * (0.2 + (f.h % 7) / 11)), y0 = Math.round(y - ap); ctx.fillStyle = '#e8e2d0'; ctx.fillRect(gx, y0 - 3 * g, g, g * 3); ctx.fillStyle = '#c0392b'; ctx.fillRect(gx - g, y0 - 5 * g, g * 3, g * 2); ctx.fillStyle = '#fff4e1'; ctx.fillRect(gx, y0 - 5 * g, g, g); }   // гриб
    }
  }
}
const tmpC = document.createElement('canvas'), tmpX = tmpC.getContext('2d');
const tintCache = new Map();
// рисует fn сжатым, растянутым или наклонённым вокруг точки под ступнями
function squash(u, yFeet, sx, sy, rot, fn) {
  const px = W / 2 + u * S, py = H / 2 - (yFeet - cam.y) * S;
  ctx.save(); ctx.translate(px, py); if (rot) ctx.rotate(rot); ctx.scale(sx, sy); ctx.translate(-px, -py); fn(); ctx.restore();
}
function drawSpriteRot(name, u, y, ang, alpha) { const s = SP[name], c = cut[name]; if (!s || !c) return; const sc = S / s[7]; ctx.save(); ctx.translate(W / 2 + u * S, H / 2 - (y - cam.y) * S); ctx.rotate(ang); if (alpha !== undefined) ctx.globalAlpha = alpha; ctx.drawImage(c, -(s[5] + 1) * sc, -(s[4] - s[6] + 1) * sc, (s[3] + 2) * sc, (s[4] + 2) * sc); ctx.restore(); }
function drawSprite(name, u, y, flip, alpha, dark, tint) {
  const s = SP[name]; if (!s) return;
  let c = cut[name]; if (!c) return;
  if (dark > 0.02) {                    // тень или дымка: красим только сам спрайт; готовые окрашенные кадры — в кэше (раньше перекрашивали каждый кадр — это тормозило)
    const dq = Math.round(dark * 20) / 20, key = name + '|' + (tint || '') + '|' + dq; let t = tintCache.get(key);
    if (!t) { t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(' + (tint || '6,18,26') + ',' + dq.toFixed(3) + ')'; x.fillRect(0, 0, c.width, c.height);
      if (tintCache.size > 900) tintCache.delete(tintCache.keys().next().value); tintCache.set(key, t); }
    c = t;
  }
  const sc = S / s[7];
  const px = W / 2 + u * S, py = H / 2 - (y - cam.y) * S;
  ctx.save(); ctx.translate(px, py); if (flip) ctx.scale(-1, 1);
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.drawImage(c, -(s[5] + 1) * sc, -(s[4] - s[6] + 1) * sc, (s[3] + 2) * sc, (s[4] + 2) * sc);
  ctx.restore();
}
// Тень: тёмная полоска на кромке опоры под героем или роботом. Чем выше над опорой — тем уже и бледнее;
// у робота, который падает сверху, наоборот: растёт на месте падения, пока он летит
function shadowFloor(e, sh) {
  if (view.rotating) return null; const U = Math.round(toU(e) + (sh || 0)), d = toD(e);
  for (let Y = Math.floor(e.y + 0.05) - 1, n = 0; n < 16; Y--, n++) { const c = floorCube(U, Y, d); if (c) return Y + 1; }
  return null;
}
function drawShadow(b, e, sh, fy, wide, k, dark) {
  const g = Math.max(2, Math.round(S * 0.04)), cx = Math.round(W / 2 + (relU(e, b) + (sh || 0)) * S), py = Math.round(H / 2 - (fy - cam.y) * S), hw = Math.max(2, Math.round(wide * S * (0.45 + 0.55 * k) / g / 2)) * g, al = dark ? 0.8 : 0.5 * k;
  ctx.fillStyle = 'rgba(6,10,18,' + (al * 0.7).toFixed(3) + ')'; ctx.fillRect(cx - hw + g, py - g, hw * 2 - g * 2, g);
  ctx.fillStyle = 'rgba(6,10,18,' + al.toFixed(3) + ')'; ctx.fillRect(cx - hw, py, hw * 2, g);
  ctx.fillStyle = 'rgba(6,10,18,' + (al * 0.6).toFixed(3) + ')'; ctx.fillRect(cx - hw + g, py + g, hw * 2 - g * 2, g);
}
function drawHandKnife(px, py, flip) {   // px, py — точка привязки кадра на экране
  const nm = hero.anim.sprite(), hp = hand[nm]; if (!hp || Math.abs(hp[0]) < 0.2) return;
  const hx = flip ? -hp[0] : hp[0], sg = Math.sign(hx), q = S / 100, ang = Math.atan2(-(hp[1] + 0.05), Math.abs(hx) - 0.04) * 0.85;
  ctx.save(); ctx.translate(Math.round(px + hx * S - sg * 2 * q), Math.round(py - hp[1] * S)); ctx.scale(sg, 1); ctx.rotate(ang);
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x * q), Math.round(y * q), Math.ceil(w * q), Math.ceil(h * q)); };
  R(0, -2, 2, 4, '#241a1e'); R(2, -3, 1, 6, '#3a2c30');                                  // рукоять в кулаке и гарда — в тёмных тонах героя
  R(3, -2, 8, 3, '#2a2226'); R(3, -2, 7, 2, '#8f9ca5'); R(3, -2, 6, 1, '#cfd9de'); R(10, -1, 2, 1, '#8f9ca5'); R(11, -1, 1, 1, '#cfd9de');   // клинок: свет сверху, тень снизу, острый кончик
  ctx.restore();
}
function drawHero(b, alpha) {
  const sw = hero.burstT > 0 || hero.state === 'dead' ? 0 : Math.min(1, (hero.wetT || 0) / 6), sw2 = sw * sw;   // накопилась вода — заметно пухнет
  const hy = hero.y + hero.hangPop - (hero.ride ? hero.ride.r.dip || 0 : hero.rip ? hero.rip.r.dip || 0 : hero.dip || 0), breathe = hero.st === 'Stay' ? 0.014 * Math.sin(game.time * 2.8) : 0, sy = 1 + hero.sq + breathe + 0.1 * sw2 + 0.02 * sw2 * Math.sin(game.time * 11);
  squash(relU(hero, b), hy, 1 - hero.sq * 0.55 + 0.34 * sw2, sy, hero.lean, () => { drawSprite(hero.anim.sprite(), relU(hero, b), hy + 0.39 + (yFix[hero.anim.sprite()] || 0), hero.anim.flip, alpha < 1 ? alpha : undefined, hero.hideN && !hero.hideJ ? 0.62 : hero.hideN ? 0.3 : hero.wetDrip > 0 && hero.state !== 'dead' ? 0.1 * Math.min(1, hero.wetDrip) : 0, hero.hideN ? '8,6,16' : '70,150,255'); if (hero.knife && /^(HandAttack|SitAttack)/.test(hero.st) && hero.state !== 'dead') drawHandKnife(W / 2 + relU(hero, b) * S, H / 2 - (hy + 0.39 + (yFix[hero.anim.sprite()] || 0) - cam.y) * S, hero.anim.flip); });
}
function relU(e, b) { return (e.x - cam.x) * b.r[0] + (e.z - cam.z) * b.r[1]; }

const BG_RISE = 0.6, BG_RISE_HI = 0.17, BG_RISE_Y0 = 4;   // v232: выше 4 фон опускается медленнее — до таза видны горы и лес (Алексей 14.10: «очень быстро перестаёшь видеть фон»)
const BG = [ // слой, ширина плитки, высота, низ относительно земли, параллакс
  { t: 'BgFar', w: 16, h: 9, y: -2.2, p: 0.05, s: 0.03, fill: null, mirror: true },   // дальний план автора: руины в лесу и горы; тайлы чередуются с зеркальными — шов не виден
  // { t: 'BgNew1', w: 16, h: 2, y: -0.1, p: 0.2, s: 0.25, fill: 'rgb(54,138,142)' },
  // { t: 'BgNew2', w: 16, h: 1.6, y: -0.5, p: 0.3, s: 0.45, fill: 'rgb(0,96,95)' },
  { t: 'ForestMid', w: 15, h: 4, y: -1.6, p: 0.42, s: 0.7, fill: 'rgb(30,76,76)', mirror: true },   // второй план: лес автора за ногой — нога стоит в нём
  { t: 'ForestFar', w: 374 / 30, h: 66 / 30, y: -2.6, p: 0.42, s: 0.7, fill: (D.forest3 && D.forest3.farBottom) || 'rgb(22,44,50)', mirror: true, crisp: true, rows: 5 },   // v233: ели автора 14.10 на месте ровной заливки под лесом за ногой (Алексей: «на дальний план, где была дырка из заливки»), мельче и рядами вниз
  // { t: 'Bg7', w: 16, h: 2, y: -0.9, p: 0.42, s: 0.7, fill: 'rgb(0,18,30)' },
];
// tools/ledge5_build.py: плитки платформ в атласе ledge4.png — [x, y, ширина, высота] в пикселях листа
const LEDGE5 = [[0, 0, 125, 243, 31.0], [127, 0, 162, 241, 25.3], [291, 0, 210, 241, 30.2], [0, 245, 27, 241, 35.0], [29, 245, 23, 241, 26.5], [54, 245, 57, 216, 49.8], [113, 245, 64, 216, 24.1], [179, 245, 116, 216, 35.8], [297, 245, 66, 215, 28.5], [365, 245, 70, 215, 42.8], [437, 245, 40, 215, 42.0], [0, 488, 82, 215, 35.0], [84, 488, 232, 215, 40.8], [318, 488, 57, 200, 50.6], [377, 488, 70, 199, 43.5], [449, 488, 40, 191, 41.3], [0, 705, 23, 160, 19.3], [25, 705, 27, 138, 23.8], [54, 705, 125, 132, 31.2], [181, 705, 17, 129, 23.0], [200, 705, 127, 129, 40.5], [329, 705, 54, 129, 46.4], [385, 705, 24, 129, 16.7], [411, 705, 38, 129, 13.4], [0, 867, 88, 113, 25.4], [90, 867, 39, 113, 12.9], [131, 867, 125, 113, 25.3], [258, 867, 64, 112, 16.0], [324, 867, 66, 112, 20.2], [392, 867, 38, 109, 51.9], [0, 982, 208, 109, 46.8], [210, 982, 242, 109, 47.6], [0, 1093, 82, 94, 37.1], [84, 1093, 82, 72, 27.3], [168, 1093, 24, 66, 10.4], [194, 1093, 24, 64, 15.1], [220, 1093, 64, 62, 17.7], [286, 1093, 88, 61, 10.2], [376, 1093, 66, 60, 22.0], [0, 1189, 116, 57, 36.0], [118, 1189, 208, 57, 43.8], [328, 1189, 94, 57, 49.5], [424, 1189, 27, 54, 43.1], [0, 1248, 88, 53, 30.7], [90, 1248, 66, 50, 43.0], [158, 1248, 64, 49, 36.0], [224, 1248, 82, 45, 30.6], [308, 1248, 23, 42, 31.5], [0, 1303, 208, 38, 52.8], [210, 1303, 148, 38, 52.1], [360, 1303, 64, 38, 52.1], [0, 1343, 116, 36, 32.6], [118, 1343, 27, 36, 54.5], [147, 1343, 38, 35, 41.8], [187, 1343, 38, 35, 41.7], [227, 1343, 38, 34, 48.0], [267, 1343, 23, 31, 15.7], [292, 1343, 57, 28, 39.2], [351, 1343, 70, 28, 34.1], [423, 1343, 40, 26, 39.1], [465, 1343, 27, 25, 32.7], [0, 1381, 208, 22, 47.1], [210, 1381, 28, 22, 57.5], [240, 1381, 47, 22, 44.2], [289, 1381, 120, 22, 42.9], [411, 1381, 61, 22, 51.7], [0, 1405, 116, 22, 15.7], [118, 1405, 88, 22, 40.8], [208, 1405, 82, 18, 39.2], [292, 1405, 38, 16, 41.3]], LEDGE5L = [[0, 1429], [194, 1429]];   // LEDGE5L — уголки Г 2x2 куба: стойка справа, стойка слева
// ↓ из 09_robotsc_pixelGlow.js
function pixelGlow(cx, cy, rad, al, col) {
  const q = Math.max(2, Math.round(S * 0.026)) * 2, R = Math.max(2, Math.round(rad * S / q)), x0 = Math.round(cx / q), y0 = Math.round(cy / q), key = q + '|' + R + '|' + (col || ''); if (al <= 0.002) return;
  let c = glowCache.get(key);
  if (!c) { c = document.createElement('canvas'); c.width = c.height = (2 * R + 1) * q; const x = c.getContext('2d'); x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(' + (col || '255,176,84') + ',0.25)';   // четыре вложенных круга по четверти яркости: где их больше, там светлее
    for (const k of [1, 0.72, 0.46, 0.24]) { const r = Math.max(1, Math.round(R * k)); for (let yy = -r; yy <= r; yy++) { const hw2 = Math.floor(Math.sqrt(r * r - yy * yy + r * 0.5)); x.fillRect((R - hw2) * q, (R + yy) * q, (hw2 * 2 + 1) * q, q); } }
    glowCache.set(key, c); }
  ctx.globalCompositeOperation = 'lighter'; const ga = ctx.globalAlpha; ctx.globalAlpha = Math.min(1, al * 4); ctx.drawImage(c, (x0 - R) * q, (y0 - R) * q); ctx.globalAlpha = ga; ctx.globalCompositeOperation = 'source-over';
}
// ↓ из 16_loop.js
function drawSole(b) {                  // полоса на подошве и куски под ней; рисуется до переднего леса — лес их закрывает
  const y0 = soleBase(), gq = Math.max(2, Math.round(S * 0.026)), fc = 1; ctx.imageSmoothingEnabled = false;
  { const cu = W / 2 + relU({ x: 0, z: 0 }, b) * S, x0 = Math.round(cu - FOOT_HALF * S), x1 = Math.round(cu + FOOT_HALF * S), yb = Math.round(H / 2 - (y0 - cam.y) * S);
    if (yb > -S && yb - S * 0.5 < H) { const sh = gq; ctx.fillStyle = '#040805'; ctx.fillRect(x0, yb - sh, x1 - x0, sh);   // почти чёрная зелёная полоса по низу подошвы
         // рваный верхний край — мох
 } }
  const ybs = Math.round(H / 2 - (y0 - cam.y) * S), up = gq * 4;   /* верх куска заходит на подошву: прилип к полосе и грязи, а не висит под ней */
  for (const c of soleChunks) { const px = Math.round((W / 2 + relU(c, b) * S) / gq) * gq, py = ybs - up + Math.round((y0 - c.y) * S), w = c.spr.width * gq;
    if (py > H + S || py < -S * 3) continue; const sh = c.hold > 0 && c.hold < 0.35 && Math.sin(game.time * 50 + c.x) > 0 ? gq : 0;   // перед тем как оторваться — дрожит
    ctx.drawImage(c.spr, px - Math.round(w / 2 / gq) * gq + sh, py, w, c.spr.height * gq); }
}
// ↓ из 16_loop.js
function soleBase() { if (LEVEL.soleY === undefined) { let m = 1e9; for (const c of cubes.values()) if (c.y < m && Math.abs(c.x) <= 11 && Math.abs(c.z) <= 11) m = c.y; LEVEL.soleY = m === 1e9 ? 0 : m; } return LEVEL.soleY; }
// ↓ из 08_hero_movesb_plogTick.js
function drawArcs(b) {                  // молнии как на листе вилки: тонкая белая ломаная в пиксель героя, острые зубцы вверх-вниз, мерцает и каждые пару кадров рисуется заново
  if (!arcs.length) return; const g = Math.max(1, Math.round(S / 100)); ctx.fillStyle = '#ffffff';
  const line = (x0, y0, x1, y1) => { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / g)); for (let q = 0; q <= n; q++) ctx.fillRect(Math.round((x0 + (x1 - x0) * q / n) / g) * g, Math.round((y0 + (y1 - y0) * q / n) / g) * g, g, g); };
  for (const A of arcs) { const tq = Math.floor(A.t * 30), rs = n => { const v = Math.sin(A.seed * 12.9898 + n * 78.233 + tq * 37.719) * 43758.5453; return v - Math.floor(v); }, k = 1 - A.t / A.life;
    if (k < 0.25 && rs(999) < 0.5) continue;   // под конец мигает
    const ox = W / 2 + relU(A, b) * S, oy = H / 2 - (A.y - cam.y) * S;
    for (let i = 0; i < A.n; i++) { const sd = A.dir ? A.dir * (i % 3 === 2 ? -1 : 1) : (i % 2 ? 1 : -1), ang = (rs(i + 1) - 0.5) * 0.7 + (A.low ? 0.25 : 0), len = (0.35 + rs(i + 2) * 0.65) * A.span * S * (0.6 + 0.4 * k);
      const ca = Math.cos(ang) * sd, sa = Math.sin(ang); let px = ox + (rs(i + 3) - 0.5) * 6 * g, py = oy + (rs(i + 4) - 0.5) * 6 * g, d = 0, m = 0;
      while (d < len && m++ < 40) { const st = (3 + rs(i * 37 + m) * 5) * g; d += st; let nx = ox + ca * d, ny = oy + sa * d + (rs(i * 53 + m) - 0.5) * 4 * g;
        if (rs(i * 71 + m) < 0.2) { const h = (6 + rs(i * 91 + m) * 16) * g * (rs(i * 13 + m) < 0.5 ? -1 : 1), mx = (px + nx) / 2; line(px, py, mx, ny + h); line(mx, ny + h, nx, ny); }   // острый зубец
        else line(px, py, nx, ny);
        px = nx; py = ny; }
      for (let q = 0; q < 2; q++) ctx.fillRect(Math.round((ox + ca * len * rs(i * 7 + q) + (rs(q + i) - 0.5) * 10 * g) / g) * g, Math.round((oy + (rs(i * 5 + q + 1) - 0.5) * 14 * g) / g) * g, g, g); } }   // пара белых искр рядом
}
// ↓ из 08_hero_movesc_startGrab.js
function drawDashTrail(b) {            // шлейф выпада: ровная голубая полоса от глаз и белая — от клинка, без переходов; хвост просто укорачивается
  if (dashTrail.length < 2) return; const g = Math.max(2, Math.round(S * 0.03));
  for (let i = 1; i < dashTrail.length; i++) { const p = dashTrail[i - 1], q = dashTrail[i]; if (q.t > 0.26 || Math.abs(q.y - p.y) > 0.8) continue; const x0 = W / 2 + relU(p, b) * S, x1 = W / 2 + relU(q, b) * S, xa = Math.round(Math.min(x0, x1)), w = Math.max(g, Math.round(Math.abs(x1 - x0)) + g);
    const ye = Math.round(H / 2 - (q.y + 0.43 - cam.y) * S), yk = Math.round(H / 2 - (q.y + 0.27 - cam.y) * S);
    if (q.fire) { const kf = 1 - q.t / 0.26, yf = Math.round(H / 2 - (q.y + 0.3 - cam.y) * S); ctx.fillStyle = '#e8501a'; ctx.fillRect(xa, yf - g * 2, w, g * 4); ctx.fillStyle = '#ff7014'; ctx.fillRect(xa, yf - Math.round(g * 1.5 * kf), w, Math.max(1, Math.round(g * 3 * kf))); ctx.fillStyle = '#ffce46'; ctx.fillRect(xa, yf - Math.round(g * 0.5 * kf), w, Math.max(1, Math.round(g * kf))); }   // огненная полоса за рывком
    if (q.t < 0.1 && !q.fork) { ctx.fillStyle = '#3fc1d6'; ctx.fillRect(xa, ye, w, Math.max(1, Math.round(g / 2))); }   /* след от глаз — едва заметный и короткий */ if (!q.fist) { ctx.fillStyle = '#ffffff'; ctx.fillRect(xa, yk, w, g); } }
}
// ↓ из 08_hero_movesc_startGrab.js
function drawDiveTrail(b) {            // белый шлейф от ноги: ровная полоса по пути удара
  if (diveTrail.length < 2) return; const g = Math.max(2, Math.round(S * 0.03)); ctx.fillStyle = '#ffffff';
  for (let i = 1; i < diveTrail.length; i++) { const p = diveTrail[i - 1], q = diveTrail[i]; if (q.t > 0.24 || Math.hypot(q.y - p.y, relU(q, b) - relU(p, b)) > 1) continue;
    const x0 = W / 2 + relU(p, b) * S, y0 = H / 2 - (p.y - cam.y) * S, x1 = W / 2 + relU(q, b) * S, y1 = H / 2 - (q.y - cam.y) * S, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / g));
    for (let k = 0; k <= n; k++) ctx.fillRect(Math.round((x0 + (x1 - x0) * k / n) / g) * g - g, Math.round((y0 + (y1 - y0) * k / n) / g) * g - g, g * 2, g * 2); }
}
// ↓ из 08_hero_movesa_fireHook.js
function drawGuide(b) {                 // стрелка у героя: показывает на выход; если выход на другой стороне ноги — клавиша поворота
  const T = waterGuide() || exitGuide(); if (!T || view.rotating) return;
  const FNg = [[0, 1], [1, 0], [0, -1], [-1, 0]], f = T.f !== undefined ? T.f : [0, 1, 2, 3].reduce((m, q) => FNg[q][0] * T.x + FNg[q][1] * T.z > FNg[m][0] * T.x + FNg[m][1] * T.z ? q : m, 0), dk = (f - view.k + 4) % 4;
  const g = Math.max(3, Math.round(S * 0.05)), hx = W / 2 + relU(hero, b) * S, hy = H / 2 - (hero.y + 0.45 - cam.y) * S, pulse = 0.5 + 0.5 * Math.sin(game.time * 6), col = T.what === 'key' ? '#ff5a3a' : T.what === 'water' ? '#5ab4ff' : '#ffd27a', R2 = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  if (dk !== 0) {                       // выход за углом: клавиша поворота над головой и стрелка-дуга в ту сторону
    const right = dk !== 3, kx = hx + (right ? 1 : -1) * S * 0.95, ky = hy - S * 0.95 + Math.round(Math.sin(game.time * 5) * g), s2 = g * 7;
    drawKeycap(kx, ky - g * 2, Math.max(2, Math.round(g * 0.75)), right ? 'E' : 'Q', false);
    const sx = right ? 1 : -1, ax = kx + sx * (s2 / 2 + g * 2), ay = ky + s2 / 2; for (let i = 0; i < 3; i++) { R2(ax + sx * i * g * 2 - g, ay - g * (3 - i) , g * 2, g * 2 * (3 - i), '#1a0f14'); } for (let i = 0; i < 3; i++) R2(ax + sx * i * g * 2 - g / 2, ay - g * (2.5 - i), g, g * (5 - i * 2), col);
    return; }
  const tx = W / 2 + relU(T, b) * S, ty = H / 2 - (T.y - cam.y) * S, dx = tx - hx, dy = ty - hy, dist = Math.hypot(dx, dy); if (dist < S * (T.what === 'water' ? 0.5 : 1.3)) return;
  const ux = dx / dist, uy = dy / dist, r0 = S * (1.05 + 0.12 * pulse), px = -uy, py = ux, sq = (k, w, c, pad) => { const cx = hx + ux * (r0 + k * g * 1.5) , cy = hy + uy * (r0 + k * g * 1.5); for (let j = -w; j <= w; j++) R2(Math.round((cx + px * j * g) / g) * g - pad, Math.round((cy + py * j * g) / g) * g - pad, g + pad * 2, g + pad * 2, c); };
  const shape = [[0, 0], [1, 0], [2, 0], [3, 2], [4, 1], [5, 0]];   // древко и наконечник
  for (const q of shape) sq(q[0], q[1], '#1a0f14', Math.max(1, Math.round(g * 0.5))); for (const q of shape) sq(q[0], q[1], col, 0);
}
// ↓ из 08_hero_movesa_fireHook.js
function waterGuide() {                 // горит — ближайшая струя воды на его высоте
  if (!(hero.burn > 0) || hero.state === 'dead') return null; let best = null, bd = 1e9;
  for (const w of waters) { if (w.cloud || !(w.tail > w.head + 0.5) || hero.y + 0.5 < w.head - 0.2 || hero.y > w.tail + 0.2) continue; const d = Math.abs(w.x - hero.x) + Math.abs(w.z - hero.z); if (d < bd) { bd = d; best = w; } }
  return best ? { x: best.x, y: hero.y + 0.45, z: best.z, what: 'water' } : null;
}
// ↓ из 08_hero_movesa_fireHook.js
function exitGuide() {                  // куда вести: нет красного ключа — к нему; есть — к лифту выхода, а наверху — к двери
  if (!game.guideOn || hero.state === 'dead' || hero.inDoor || game.finishT > 0) return null;
  if (inRoom()) { const C = complexAt(hero.y); if (C && C.boss) { const d = doors.find(q => q.final); return d ? { x: d.x, y: d.y + 0.5, z: d.z, f: d.f, what: 'door' } : null; } const d = C && doors[C.outD !== undefined ? C.outD : C.inD]; return d ? { x: d.x, y: d.y + 0.5, z: d.z, f: d.f, what: 'door' } : null; }   // внутри — к выходу из помещения
  if (hero.y > LEVEL.pelY + 1) { const d = doors.find(q => q.cabin || q.final); return d ? { x: d.x, y: d.y + 0.5, z: d.z, f: d.f, what: 'door' } : null; }   // на торсе — к кабине
  if (!hero.redKey) { const k = keyItems.find(o => o.red && !o.got); if (k) return { x: k.x, y: k.y, z: k.z, what: 'key' }; }
  const d = doors.find(q => q.exit); if (!d) return null; const L = lifts.find(q => q.exit);
  if (L && hero.y < d.y - 0.6 && hero.standOn !== L) return { x: L.x, y: L.y + 0.5, z: L.z, f: L.f, what: 'lift' };
  return { x: d.x, y: d.y + 0.5, z: d.z, f: d.f, what: 'door' };
}
// ↓ из 08_hero_movesa_fireHook.js
function drawDodge(b) {                 // клавиша F над головой героя и полоска оставшегося времени
  const D = game.dodge; if (!D) return; const g = Math.max(3, Math.round(S * 0.05)), px = Math.round(W / 2 + relU(hero, b) * S), py = Math.round(H / 2 - (hero.y + 1.22 - cam.y) * S), k = Math.max(0, Math.min(1, D.tti / D.span)), s2 = g * 9;
  const y0 = py - s2; drawKeycap(px, y0 - g * 2, g, 'F', true);
  ctx.fillStyle = '#1a0f14'; ctx.fillRect(px - s2 / 2 - g, y0 + s2 + g * 2, s2 + g * 2, g * 2); ctx.fillStyle = k > 0.35 ? '#7fd1b0' : '#e0402a'; ctx.fillRect(px - s2 / 2, y0 + s2 + g * 2, Math.round(s2 * k), g);
}
// ↓ из 08_hero_movesa_fireHook.js
function drawCastBar(b) {             // полоска каста огненного шара над героем
  const k = hero.chg > 0.15 ? Math.min(1, hero.chg) : 0; if (!k) return; const g = Math.max(3, Math.round(S * 0.05)), px = Math.round(W / 2 + relU(hero, b) * S), py = Math.round(H / 2 - (hero.y + 1.05 - cam.y) * S), w = g * 14;
  ctx.fillStyle = '#1a0f14'; ctx.fillRect(px - w / 2 - g, py - g, w + g * 2, g * 3); ctx.fillStyle = '#5a2a10'; ctx.fillRect(px - w / 2, py, w, g);
  ctx.fillStyle = k < 1 ? '#ff7014' : '#ffe08a'; ctx.fillRect(px - w / 2, py, Math.round(w * k), g); ctx.fillStyle = '#ffe08a'; ctx.fillRect(px - w / 2 + Math.round(w * k) - g, py, g, g);
}
// ↓ из 09_robotsc_pixelGlow.js
function drawLamp(L, b, glow) {
  const N = FACE_N[L.f], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < 0.3 || L.gone) return;
  const g = Math.max(2, Math.round(S * 0.026)), ax = W / 2 + relU(L, b) * S, ay = H / 2 - (L.y - cam.y) * S, ln = (L.len + L.bob) * S;
  const bx = ax + Math.sin(L.th) * ln * fc, by = ay + Math.cos(L.th) * ln, fl = 0.85 + 0.15 * Math.sin(game.time * 11 + L.ph) * Math.sin(game.time * 5.3);
  if (glow) { pixelGlow(bx, by + g, L.red ? 1.6 : 1.25, (L.red ? 0.12 : 0.075) * fl, L.red ? '255,40,30' : '255,200,120'); return; }
  const n = Math.max(2, Math.round(ln / g)); ctx.fillStyle = '#1c1719';
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round((ax + (bx - ax) * i / n) / g) * g, Math.round((ay + (by - ay) * i / n) / g) * g, g, g);
  const X = Math.round(bx / g) * g, Y = Math.round(by / g) * g;
  { const AX = Math.round(ax / g) * g, AY = Math.round(ay / g) * g; ctx.fillRect(AX - g, AY - g, g * 3, g); } ctx.fillRect(X - g, Y, g * 3, g * 2);                              // крепление и патрон
  ctx.fillStyle = L.red ? '#e0281e' : '#ffb347'; ctx.fillRect(X - g, Y + g * 2, g * 3, g * 3); ctx.fillRect(X, Y + g * 5, g, g);       // колба
  ctx.fillStyle = L.red ? '#ffb0a0' : '#fff3c4'; ctx.fillRect(X, Y + g * 2, g, g * 2); ctx.fillRect(X - g, Y + g * 3, g, g);
}
// ====================== ПРЕДМЕТЫ ИЗ КАРТИНОК АЛЕКСЕЯ (ядро, v249–v250) ======================
// Залил картинку в редакторе → она очищена и лежит в библиотеке (общая: db 'lib' + вложение) → поставил на карту.
// В файле карты такой предмет — запись props {lib: 'user/<id>', asset, sec, cw, ratio, look, x, y, z, f, …}; всё нужное для
// рисования — в самой записи (карта работает и без библиотеки). Уровень хранит их в LEVEL.userProps.
// v250, как в World Editor — два уровня настроек:
//   КАРТОЧКА (библиотека, для всех копий): asset, cw (ширина в кубах), look {hue, bri, con, sat}, glow (0..1), sway (0..1).
//     Если библиотека загружена (USERLIB), её карточка главнее записи — правка в библиотеке видна сразу на всех картах.
//   КОПИЯ (запись на карте): flip, scale (×размер), tint (сдвиг оттенка, градусы), vary (разброс тона/яркости от места).
// Разделы: 'wall' — плоское на стене (видно со своей стороны f, к ребру сужается и гаснет — edgeFade); 'hang' — висячее, верхом на y;
// 'stand' — стоит на полу, низом на y. Перекраска — по цветам палитры картинки (пиксели чёткие, без полупрозрачности), с кэшем.
const USERIMG = new Map(), USERLOOK = new Map(), USERLIB = {};
function userImg(asset) {
  if (!asset) return null; let im = USERIMG.get(asset); if (im) return im.complete && im.naturalWidth ? im : null;
  im = new Image(); im.src = String(asset).startsWith('data:') ? asset : '/_blob/' + asset; USERIMG.set(asset, im); return null;
}
// v251: поля карточки, которые копируются в каждую запись на карте (карта самодостаточна) — один список для ядра и редактора.
// solid — «можно встать» (верх картинки держит героя); hp — «разбивается» (0 — нет, 1..3 — со скольких ударов); grab — «крюком схватиться».
const USER_CARD_KEYS = ['asset', 'sec', 'cw', 'ratio', 'look', 'glow', 'sway', 'glowCol', 'solid', 'hp', 'grab', 'loot'];   /* v253: loot — что выпадает {shard, heart, boom, water: % } */
function userCard(o) {   // карточка: из библиотеки (если есть) поверх записи
  const id = typeof o.lib === 'string' && o.lib.startsWith('user/') ? o.lib.slice(5) : null, L = id && USERLIB[id], C = {};
  for (const k of USER_CARD_KEYS) C[k] = L && L[k] !== undefined && L[k] !== null && L[k] !== '' ? L[k] : o[k];
  return C;
}
function userHash(o) { let h = Math.imul(Math.round(o.x * 7) + 101, 0x9e3779b1) ^ Math.imul(Math.round(o.y * 7) + 31, 0x85ebca6b) ^ Math.imul(Math.round(o.z * 7) + 17, 0xc2b2ae35); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; }
function userLookOf(o, C) {   // итоговый вид копии: карточка + копия + разброс
  const L = C.look || {}, v = o.vary ? userHash(o) : 0.5;
  return { hue: (L.hue || 0) + (o.tint || 0) + (o.vary ? (v - 0.5) * 24 : 0), bri: (L.bri || 0) + (o.vary ? (userHash({ x: o.z, y: o.x, z: o.y }) - 0.5) * 16 : 0), con: L.con || 0, sat: L.sat || 0 };
}
function userRecolor(im, lk) {   // перекраска по цветам: оттенок (°), яркость (−100..100), контраст (−100..100), насыщенность (−100..100)
  const hue = Math.round(lk.hue) % 360, bri = Math.round(lk.bri), con = Math.round(lk.con), sat = Math.round(lk.sat);
  if (!hue && !bri && !con && !sat) return im;
  const key = im.src.length > 120 ? im.src.slice(-80) + im.src.length : im.src, k2 = key + '|' + hue + '|' + bri + '|' + con + '|' + sat; let c = USERLOOK.get(k2); if (c) return c;
  c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data, memo = new Map(), cf = (100 + con) / 100, sf = (100 + sat) / 100;
  for (let i = 0; i < p.length; i += 4) { if (!p[i + 3]) continue; const kk = (p[i] << 16) | (p[i + 1] << 8) | p[i + 2]; let o = memo.get(kk);
    if (!o) { let r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
      if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h /= 6; }
      h = ((h + hue / 360) % 1 + 1) % 1; s = Math.max(0, Math.min(1, s * sf)); l = Math.max(0, Math.min(1, (l - 0.5) * cf + 0.5 + bri / 200));
      const f = (n, q2, t) => { t = (t + 1) % 1; return t < 1 / 6 ? n + (q2 - n) * 6 * t : t < 1 / 2 ? q2 : t < 2 / 3 ? n + (q2 - n) * (2 / 3 - t) * 6 : n; };
      if (!s) r = g = b = l; else { const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s, n = 2 * l - q2; r = f(n, q2, h + 1 / 3); g = f(n, q2, h); b = f(n, q2, h - 1 / 3); }
      o = [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]; memo.set(kk, o); }
    p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2]; }
  x.putImageData(d, 0, 0); USERLOOK.set(k2, c); return c;
}
function drawUserProp(o, b) {
  const rt = USERRT.get(o); if (rt && rt.broken) return;
  const C = userCard(o), im0 = userImg(C.asset); if (!im0) return; const im = userRecolor(im0, userLookOf(o, C));
  const w0 = (C.cw || 1) * (o.scale || 1) * S, h = w0 * (C.ratio || im0.naturalHeight / im0.naturalWidth);
  let w = w0, a = 1;
  if (C.sec === 'wall') { const N = FACE_N[((o.f || 0) % 4 + 4) % 4], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < 0.03) return; a = edgeFade(fc); w = w0 * fc; }
  const sh = rt && game.time - rt.hitT < 0.18 ? Math.sin((game.time - rt.hitT) * 90) * 0.04 * S : 0;   /* ударили — дрожит */
  const sx = W / 2 + relU(o, b) * S + sh, sy = H / 2 - (o.y - cam.y) * S, top = C.sec === 'hang' ? sy : C.sec === 'stand' ? sy - h : sy - h / 2;
  if (C.glow > 0) { const fl = 0.85 + 0.15 * Math.sin(game.time * 7 + userHash(o) * 40) * (Math.sin(game.time * 23 + userHash(o) * 9) > 0.6 ? 1 : 0.3);
    pixelGlow(sx, top + h / 2, Math.max(0.6, (C.cw || 1) * (o.scale || 1) * 1.1), 0.05 + 0.1 * C.glow * fl * a, C.glowCol || '255,190,110'); }
  const ga = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled; ctx.globalAlpha = ga * a; ctx.imageSmoothingEnabled = false;
  const sw = C.sec === 'hang' && C.sway > 0 ? Math.sin(game.time * 1.3 + userHash(o) * 6.28) * 0.09 * C.sway : 0;
  ctx.save(); ctx.translate(Math.round(sx), Math.round(C.sec === 'hang' ? sy : top)); if (sw) ctx.rotate(sw); if (o.flip) ctx.scale(-1, 1);
  ctx.drawImage(im, Math.round(-w / 2), C.sec === 'hang' ? 0 : 0, Math.round(w), Math.round(h)); ctx.restore();
  ctx.globalAlpha = ga; ctx.imageSmoothingEnabled = sm;
}

// ---------- v251: поведение в игре (карточка: «можно встать», «разбивается», «крюком схватиться») ----------
// Состояние на время забега — USERRT (запись карты → {hp, broken, hitT, ring}); в редакторе предметы не ломаются.
// Рамка предмета в кубах: ширина cw×scale, высота по пропорции картинки; 'stand' — низом на y, 'hang' — верхом на y, 'wall' — серединой.
const USERRT = new Map(), USERPAL = new Map();
function userBox(o) {
  const C = userCard(o), w = (C.cw || 1) * (o.scale || 1), h = w * (C.ratio || 1), y0 = C.sec === 'stand' ? o.y : C.sec === 'hang' ? o.y - h : o.y - h / 2;
  return { C, w, h, y0, y1: y0 + h, u: toU(o) };
}
function userLive(o, C) {   // предмет сейчас «есть» для героя: не разбит, не за кубом; на стене — только если стена к нам лицом
  const rt = USERRT.get(o); if (rt && rt.broken) return false; if (propHidden(o)) return false;
  if (C.sec === 'wall') { const N = FACE_N[((o.f || 0) % 4 + 4) % 4]; if (N[0] * view.n[0] + N[1] * view.n[1] < 0.3) return false; }
  return true;
}
function userSpawn() {
  USERRT.clear(); rings = rings.filter(q => !q.user);
  for (const o of LEVEL.userProps || []) { const B = userBox(o), C = B.C; if (!(C.hp > 0) && !C.solid && !C.grab) continue;
    const rt = { hp: C.hp || 0, broken: false, hitT: -9, ring: null }; USERRT.set(o, rt);
    if (C.grab) { rt.ring = { x: o.x, y: B.y0 + B.h * 0.5, z: o.z, t: 0, user: o }; rings.push(rt.ring); } }
}
function userSupport(u, yFeet, depth, best) {   // «можно встать»: верх картинки — пол, как у ящика (сбоку не держит)
  for (const [o, rt] of USERRT) { const B = userBox(o), C = B.C; if (!C.solid || !userLive(o, C)) continue;
    if (Math.abs(toD(o) - depth) > (C.sec === 'wall' ? 1.2 : 0.7) || Math.abs(u - B.u) > B.w * 0.45) continue;
    const top = B.y1; if (top <= yFeet + STEP_UP + 0.001 && top > yFeet - 0.6 && (!best || top > best.top)) best = { top, r: o }; }
  return best;
}
function userStepUp() {   // идёшь в низкий предмет по полу — шагаешь на него сам (до 0.46 куба), выше — запрыгивай
  if (!USERRT.size || !hero.onGround || hero.hang || hero.ladder || hero.ride || hero.state === 'dead' || Math.abs(hero.vx) < 0.3) return; const hu = toU(hero), d = toD(hero);
  for (const [o] of USERRT) { const B = userBox(o), C = B.C; if (!C.solid || !userLive(o, C) || Math.abs(toD(o) - d) > (C.sec === 'wall' ? 1.2 : 0.7)) continue;
    const du = B.u - hu, rise = B.y1 - hero.y; if (Math.abs(du) < B.w * 0.45 + 0.1 && du * hero.vx > 0 && rise > 0.05 && rise <= 0.46 && !overlapsDepth(hu, B.y1 + 0.02, hero.hw, hero.h - 0.04, d)) { hero.y = B.y1; hero.vy = 0; hero.standOn = o; return; } }
}
function userPal(C) {   // цвета осколков — самые частые цвета картинки
  let p = USERPAL.get(C.asset); if (p) return p; const im = userImg(C.asset); if (!im) return ['#8a8a92', '#55555c', '#c9d2d8'];
  try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data, n = new Map();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { const k = '#' + ((1 << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).slice(1); n.set(k, (n.get(k) || 0) + 1); }
    p = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]); } catch (e) { p = []; }
  if (!p.length) p = ['#8a8a92', '#55555c', '#c9d2d8']; USERPAL.set(C.asset, p); return p;
}
function userHit(o, dir) {   // удар по предмету: дрожит; кончились удары — рассыпается на осколки своих цветов
  const rt = USERRT.get(o); if (!rt || rt.broken || !(rt.hp > 0)) return false; const B = userBox(o), cols = userPal(B.C), cy = B.y0 + B.h / 2;
  rt.hp--; rt.hitT = game.time; sfx('RobotHit3', 0.4, 0.8); burst(o.x, cy, o.z, { n: 6, cols, dir, sp: [1, 3], life: 0.5 });
  if (rt.hp > 0) return true;
  rt.broken = true; sfx('RobotHit5', 0.5, 0.7); burst(o.x, cy, o.z, { n: Math.round(10 + 10 * Math.min(3, B.w * B.h)), cols, sp: [1, 3.6], life: 0.7, size: 2 });
  if (rt.ring) { rings = rings.filter(q => q !== rt.ring); if (hero.hook && hero.hook.ring === rt.ring) hero.hook = null; }
  if (hero.standOn === o) hero.onGround = false;
  if (B.C.loot) { const c = { x: o.x, y: B.y0, z: o.z }, nearH = hero.state !== 'dead' && !hero.inDoor && Math.abs(toD(hero) - toD(o)) <= 1.1 && Math.abs(toU(hero) - B.u) < 1.4 && Math.abs(hero.y - B.y0) < 1.3; dropLoot(c, B.C.loot, nearH, B.u); }
  return true;
}
function userHitBox(ul, ur, yb, yt, dir, done) {   // удар рукой/ногой: рамка удара задела рамку предмета
  let any = false; for (const [o, rt] of USERRT) { if (!(rt.hp > 0) || rt.broken || (done && done.has(o))) continue; const B = userBox(o); if (!userLive(o, B.C)) continue;
    if (ul < B.u + B.w * 0.45 && ur > B.u - B.w * 0.45 && yb < B.y1 && yt > B.y0) { if (done) done.add(o); userHit(o, dir); any = true; } }
  return any;
}
function userHitAt(u, y, dir) {   // точка (кунай)
  for (const [o, rt] of USERRT) { if (!(rt.hp > 0) || rt.broken) continue; const B = userBox(o); if (!userLive(o, B.C)) continue;
    if (Math.abs(u - B.u) < B.w * 0.45 && y > B.y0 && y < B.y1) { userHit(o, dir); return true; } }
  return false;
}
// ====================== ПЕРЕРИСОВАННЫЕ КАДРЫ (ядро, v259) ======================
// Редактор «Юниты» (editor/60_units.js) перерисовывает кадры анимаций героя и роботов. Перерисованный кадр — картинка того же
// размера, что кадр в листе; хранится в общей библиотеке (db 'lib', запись {kind:'frame', sprite, asset}) или в этом браузере
// (localStorage 'grk_frames' {кадр: data URL}). Ядро подменяет вырезанный кадр (cut[имя]) и пересчитывает его границы (попадания).
// Порядок: cutSprites режет листы → frameReapply() накладывает всё, что уже известно; пришло позже — накладывается сразу.
const FRAMEOV = {};   // имя кадра → источник (asset id или data URL)
function frameCanvasFrom(name, im) {   // холст кадра с каймой в 1 точку (как в cutSprites) + границы рисунка
  const s = SP[name]; if (!s) return null; const c = document.createElement('canvas'); c.width = s[3] + 2; c.height = s[4] + 2;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; if (im) x.drawImage(im, 0, 0, im.width || im.naturalWidth, im.height || im.naturalHeight, 1, 1, s[3], s[4]);
  return c;
}
function frameBounds(name) {
  const s = SP[name], c = cut[name]; if (!s || !c) return; delete colTops[name]; delete rowEdges[name];
  try { const d = c.getContext('2d').getImageData(1, 1, s[3], s[4]).data; let x0 = s[3], x1 = -1, y0 = s[4], y1 = -1;
    for (let yy = 0; yy < s[4]; yy++) for (let xx = 0; xx < s[3]; xx++) if (d[(yy * s[3] + xx) * 4 + 3] > 60) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    if (x1 >= 0) bounds[name] = [x0, y0, x1 + 1, y1 + 1]; } catch (e) {}
}
function frameSet(name, canvasOrImg) {   // готовая картинка кадра (w×h) → в игру
  const c = frameCanvasFrom(name, canvasOrImg); if (!c) return; cut[name] = c; frameBounds(name); tintCache.clear(); if (typeof frameHook === 'function') frameHook(name);   /* редактор узнаёт, что кадр пришёл */
}
function frameApply(name, src) {   // источник — asset id или data URL; null — вернуть кадр из листа
  if (!src) { delete FRAMEOV[name]; frameRestore(name); return; } FRAMEOV[name] = src; if (!SP[name] || !Object.keys(cut).length) return;
  const im = new Image(); im.onload = () => { if (FRAMEOV[name] === src) frameSet(name, im); }; im.src = String(src).startsWith('data:') ? src : '/_blob/' + src;
}
function frameRestore(name) { const s = SP[name], im = s && img[s[0]]; if (!s || !im || !im.width) return; const c = document.createElement('canvas'); c.width = s[3] + 2; c.height = s[4] + 2; c.getContext('2d').drawImage(im, s[1], s[2], s[3], s[4], 1, 1, s[3], s[4]); cut[name] = c; frameBounds(name); tintCache.clear(); if (typeof frameHook === 'function') frameHook(name); }
function frameReapply() { for (const n of Object.keys(FRAMEOV)) frameApply(n, FRAMEOV[n]); }
function frameLocal(v) { if (v === undefined) { try { return JSON.parse(localStorage.getItem('grk_frames') || '{}'); } catch (e) { return {}; } } try { localStorage.setItem('grk_frames', JSON.stringify(v)); return true; } catch (e) { return false; } }
function frameFromDocs(docs) {   // записи библиотеки → наложить (свои из браузера — поверх, если общих нет)
  animFromDocs(docs); const want = Object.assign({}, frameLocal()); for (const d of docs) if (d.kind === 'frame' && d.sprite) want[d.sprite] = d.asset;   /* v260: свои кадры и анимации — раньше */
  for (const n of Object.keys(FRAMEOV)) if (!(n in want) && !(SP[n] && SP[n][0] === '_user')) frameApply(n, null);
  for (const n of Object.keys(want)) if (FRAMEOV[n] !== want[n]) frameApply(n, want[n]);
}
// ---------- v260: свои кадры и анимации ----------
// Новый кадр (добавленный в анимацию, скопированный, «кадр между») — свой спрайт: SP[имя] = ['_user', 0, 0, w, h, точка X, точка Y, ppu],
// картинка — как у перерисованного (FRAMEOV). Анимация (клип) — список кадров с длительностями; правка заменяет CL[имя] (оригинал — в CLORIG),
// новая — CL[имя] с title/group/user. Хранение: db 'lib' {kind:'sprite', sprite, w, h, px, py, ppu, asset} и {kind:'clip', clip, frames, len, title, group, user};
// без хранилища — localStorage 'grk_anim' {sprites: {имя: {…, src}}, clips: {имя: {…}}}.
const CLORIG = {};
function spriteDef(name, d) { SP[name] = ['_user', 0, 0, d.w, d.h, d.px, d.py, d.ppu || 100]; }
function clipDef(name, d) {
  if (!(name in CLORIG)) CLORIG[name] = CL[name] || null;
  if (!d) { if (CLORIG[name]) CL[name] = CLORIG[name]; else delete CL[name]; return; }
  CL[name] = { len: d.len, frames: d.frames.map(f => Array.isArray(f) ? [f[0], f[1]] : [f.t, f.s]), events: (CLORIG[name] && CLORIG[name].events) || [], title: d.title, group: d.group, user: !!d.user };
}
function animLocal(v) { if (v === undefined) { try { return Object.assign({ sprites: {}, clips: {} }, JSON.parse(localStorage.getItem('grk_anim') || '{}')); } catch (e) { return { sprites: {}, clips: {} }; } } try { localStorage.setItem('grk_anim', JSON.stringify(v)); return true; } catch (e) { return false; } }
function animFromDocs(docs) {   // свои спрайты → кадры → анимации (порядок важен: кадру нужен SP)
  const L = animLocal(), sp = Object.assign({}, L.sprites), cl = Object.assign({}, L.clips);
  for (const d of docs) { if (d.kind === 'sprite' && d.sprite) sp[d.sprite] = Object.assign({}, d, { src: d.asset }); else if (d.kind === 'clip' && d.clip) cl[d.clip] = d; }
  for (const n of Object.keys(sp)) { spriteDef(n, sp[n]); if (FRAMEOV[n] !== sp[n].src) frameApply(n, sp[n].src); }
  for (const n of Object.keys(cl)) clipDef(n, cl[n]);
  for (const n of Object.keys(CLORIG)) if (!(n in cl) && CL[n] !== CLORIG[n] && !(typeof EUN !== 'undefined' && EUN.dclip && EUN.dclip.has(n))) clipDef(n, null);
}
// ====================== УХВАТЫ (ядро, v265) ======================
// Алексей 19.10: «новый тип пропсов „ухваты“ — детали, разбросанные по всему титану, за них можно ухватиться».
// Картинки — два его листа (рукояти, скобы, кольца, рычаги, вентили, колена…), вырезаны в tex/Grips.png (72 штуки, без полупрозрачности
// и светлой каймы, одна палитра). Ухват — запись LEVEL.grips {x, y, z, f (сторона), k (какая картинка), flip}; в файле карты — 'hang/grip'.
// Висит на стене лицом наружу; виден и «работает», когда его сторона к нам. Хватается рукой в прыжке/падении (tryHang, игра) — как за трубу:
// висит, прыжок — вверх (так по ухватам можно лезть), вниз — отпустить. Генератор раскладывает их по внешним стенам (свой ГСЧ — остальная карта та же).
const GRIPS = [[0, 0, 8, 21], [10, 0, 17, 18], [29, 0, 17, 17], [48, 0, 18, 17], [68, 0, 21, 15], [91, 0, 15, 15], [108, 0, 19, 13], [129, 0, 8, 22], [139, 0, 8, 22], [149, 0, 10, 19], [161, 0, 7, 17], [170, 0, 9, 18], [181, 0, 11, 16], [194, 0, 9, 20], [205, 0, 15, 12], [222, 0, 11, 17], [235, 0, 7, 16], [244, 0, 9, 14], [0, 24, 13, 13], [15, 24, 14, 13], [31, 24, 12, 13], [45, 24, 18, 10], [65, 24, 13, 9], [80, 24, 15, 9], [97, 24, 7, 18], [106, 24, 7, 16], [115, 24, 9, 14], [126, 24, 11, 15], [139, 24, 8, 14], [149, 24, 15, 14], [166, 24, 14, 11], [182, 24, 14, 10], [198, 24, 16, 10], [216, 24, 12, 16], [230, 24, 12, 16], [244, 24, 12, 13], [0, 44, 13, 15], [15, 44, 11, 12], [28, 44, 12, 13], [42, 44, 14, 9], [58, 44, 11, 9], [71, 44, 16, 10], [89, 44, 8, 21], [99, 44, 15, 20], [116, 44, 9, 22], [127, 44, 9, 21], [138, 44, 13, 18], [153, 44, 14, 14], [169, 44, 18, 14], [189, 44, 18, 8], [209, 44, 13, 17], [224, 44, 14, 14], [240, 44, 14, 13], [0, 68, 18, 9], [20, 68, 16, 14], [38, 68, 20, 10], [60, 68, 21, 7], [83, 68, 9, 18], [94, 68, 11, 18], [107, 68, 14, 15], [123, 68, 12, 13], [137, 68, 14, 12], [153, 68, 18, 8], [173, 68, 21, 8], [196, 68, 15, 20], [213, 68, 7, 18], [222, 68, 12, 17], [236, 68, 10, 17], [248, 68, 6, 18], [0, 90, 14, 16], [16, 90, 9, 14], [27, 90, 12, 11]];   // v266: лист вдвое меньше, тон под стены
const GRIP_PPU = 40;   // точек картинки на куб
// v303 (Алексей: «ухваты сделай по тону темнее, чтобы их было заметно»): лист один раз затемняется в холст
let gripDark = null;
const gripImg = () => { const I = img.Grips; if (!(I && I.width)) return null; if (gripDark) return gripDark;
  const c = document.createElement('canvas'); c.width = I.width; c.height = I.height; const x = c.getContext('2d'); x.drawImage(I, 0, 0);
  try { const d = x.getImageData(0, 0, c.width, c.height), a = d.data; for (let i = 0; i < a.length; i += 4) { a[i] = a[i] * 0.55; a[i + 1] = a[i + 1] * 0.53; a[i + 2] = a[i + 2] * 0.58; } x.putImageData(d, 0, 0); } catch (e) { return I; }
  return (gripDark = c); };
function gripFace(g, b) { const N = FACE_N[((g.f || 0) % 4 + 4) % 4]; return N[0] * (b || view).n[0] + N[1] * (b || view).n[1]; }
function gripBox(g) { const r = GRIPS[g.k] || GRIPS[0]; return { w: r[2] / GRIP_PPU, h: r[3] / GRIP_PPU }; }
function gripHand(g) { const B = gripBox(g); return g.y + B.h * 0.2; }   // где рука: чуть выше середины
let gripGlowC = null;
function gripGlow(I) { if (gripGlowC && gripGlowC.src === I) return gripGlowC.c; const c = document.createElement('canvas'); c.width = I.width; c.height = I.height; const x = c.getContext('2d');
  x.drawImage(I, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgb(255,226,170)'; x.fillRect(0, 0, c.width, c.height); gripGlowC = { src: I, c }; return c; }
function drawGrip(g, b) {
  const I = gripImg(); if (!I) return; const fc = gripFace(g, b); if (fc < 0.03) return; const r = GRIPS[g.k] || GRIPS[0], k = S / GRIP_PPU, a = edgeFade(fc);
  const sx = W / 2 + relU(g, b) * S, sy = H / 2 - (g.y - cam.y) * S, w = Math.round(r[2] * k * fc), h = Math.round(r[3] * k);
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a; ctx.imageSmoothingEnabled = false; ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); if (g.flip) ctx.scale(-1, 1);
  ctx.drawImage(I, r[0], r[1], r[2], r[3], -Math.round(w / 2), -Math.round(h / 2), w, h); ctx.restore(); ctx.globalAlpha = ga;
  if (g.lit > 0) { const G = gripGlow(I); ctx.save(); ctx.globalAlpha = ga * a * Math.min(1, 0.55 * g.lit); ctx.translate(Math.round(sx), Math.round(sy)); if (g.flip) ctx.scale(-1, 1);
    ctx.drawImage(G, r[0], r[1], r[2], r[3], -Math.round(w / 2), -Math.round(h / 2), w, h); ctx.restore(); }   // схватился — светится только сам ухват (v266)
}
function placeGrips() {   // по внешним стенам: куб, перед ним пусто (и ниже — место для висящего героя), далеко от лестниц, труб, дверей, ламп…
  const R = rng(((LEVEL.seed | 0) + 4242) >>> 0), N4 = [[0, 1], [1, 0], [0, -1], [-1, 0]], out = [], busy = [];
  const add = (x, y, z, r) => busy.push([x, y, z, r || 1.3]);
  for (const L of LEVEL.ladders || []) { const c = lanePosR(L.f, L.t, L.r || 8); for (let y = L.y0; y <= L.y1; y += 1) add(c[0], y, c[1], 1.4); }
  for (const q of LEVEL.pipes || []) for (const p of q.pts || []) if (Array.isArray(p)) add(p[0], p[1], p[2], 1.2);
  for (const k of ['doors', 'lamps', 'rings', 'steams', 'traps', 'crates', 'fires', 'vents', 'keys', 'bits', 'robots', 'wsprites', 'hearts', 'wgears']) for (const o of LEVEL[k] || []) if (o && o.x !== undefined) add(o.x, o.y, o.z, k === 'doors' ? 2 : 1.3);
  const free = (x, y, z) => !hasCube(x, y, z), cand = [];
  for (const c of cubes.values()) { if (c.y < 3 || c.y > 2500 || c.kind === 'plat' || c.kind === 'ledge' || c.bulge) continue;   // не на уступах/платформах (v266)
    for (let f = 0; f < 4; f++) { const N = N4[f]; if (c.x * N[0] + c.z * N[1] < 4) continue; const fx = c.x + N[0], fz = c.z + N[1];
      if (!free(fx, c.y, fz) || !free(fx, c.y - 1, fz) || !free(fx, c.y + 1, fz) || !free(fx + N[0], c.y, fz + N[1])) continue; cand.push([c, f]); } }
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }   // по всей высоте поровну
  for (const [c, f] of cand) { const N = N4[f];
    const g = { x: c.x + N[0] * 0.52, y: c.y + 0.5, z: c.z + N[1] * 0.52, f, k: Math.floor(R() * GRIPS.length), flip: R() < 0.5 };
    if (busy.some(q => Math.abs(q[0] - g.x) + Math.abs(q[2] - g.z) < q[3] + 0.5 && Math.abs(q[1] - g.y) < q[3] + 0.5)) continue;
    if (out.some(o => Math.hypot(o.x - g.x, o.z - g.z) < 3.2 && Math.abs(o.y - g.y) < 3.2)) continue;
    out.push(g); if (out.length >= 160) break; }
  LEVEL.grips = out;
}
// ====================== ШЕСТЕРНИ В СТЕНЕ (ядро, v269) ======================
// Алексей 19.10: «новый вид шестерёнки, механика такая же, но она всегда торчит из стены, пола или потолка; аккуратно вырежь,
// подогни под нашу стилистику, добавь в пропсы и размести по карте». Картинки — его лист (15 корпусов), вырезаны в tex/WallGears.png:
// 15 корпусов со ступицей (неподвижные, рисуются поверх колеса), перекрашены в палитру наших колёс. Само колесо — наше обычное (v269, Алексей:
// «делай максимально близко к тем шестерёнкам, что у нас есть») — рисуется тем же gearFrame, что и колёса на стенах.
// Запись LEVEL.wgears {x, y, z, f (сторона), k (корпус 0–14), w ('r' стена справа, 'l' слева, 'd' пол, 'u' потолок)}; в файле — 'mech/wallGear'.
// В игре это обычное колесо (gears, 11_propsh): встать сверху — везёт, у края съезжаешь, в прыжке хватаешься за зубец.
// Твёрдо и хватается только то, что торчит из стены; зубец ушёл в стену — сорвался.
const WGEAR = { R: 1.2,   // колесо — наше обычное (gearFrame, как у всех колёс на стенах), радиус как у больших
  h: [[0, 0, 54, 70, 27, 37], [56, 0, 52, 71, 26, 38], [110, 0, 53, 71, 28, 38], [165, 0, 53, 71, 25, 38], [220, 0, 50, 71, 26, 38], [272, 0, 53, 67, 26, 35], [327, 0, 51, 68, 25, 35], [380, 0, 53, 68, 28, 35], [435, 0, 49, 68, 25, 36], [486, 0, 51, 68, 25, 35], [539, 0, 55, 68, 28, 34], [596, 0, 53, 67, 26, 34], [651, 0, 50, 68, 27, 35], [703, 0, 52, 68, 24, 37], [757, 0, 50, 68, 25, 34]] };   // корпуса: [x, y, w, h, ось x, ось y] на листе; точка листа = точка колеса (GEAR_PX на куб)
const WG_EDGE = 0.1;   // край стены от оси колеса, кубов: дальше — колесо уходит в корпус
const wgImg = () => { const I = img.WallGears; return I && I.width ? I : null; };
// точка колеса (du вправо, dh вверх от оси) снаружи стены?
function wgOut(G, du, dh) { const w = G.w || 'r'; return w === 'r' ? du < -WG_EDGE : w === 'l' ? du > WG_EDGE : w === 'd' ? dh > WG_EDGE : dh < -WG_EDGE; }
// сторона: где ближний к нам куб (лицевая глубина) рядом с осью — там стена
function wgFront(f) {   // по стороне: лицевая глубина каждой клетки (u, y)
  const R = SKIN_R[f], N = SKIN_N[f], m = new Map();
  for (const c of cubes.values()) { if (c.y > 2500) continue; const u = c.x * R[0] + c.z * R[1], d = c.x * N[0] + c.z * N[1], k = u * 4096 + c.y, o = m.get(k); if (o === undefined || d > o) m.set(k, d); }
  return (u, y) => { const v = m.get(u * 4096 + y); return v === undefined ? -99 : v; };
}
function wgMountAt(F, u, y, D) {   // какая сторона подходит для оси в (u, y) на глубине стены D; ось на ребре клеток
  const wall = (uu, yy) => F(uu, yy) === D, air = (uu, yy) => F(uu, yy) <= D - 2;
  const cu = Math.round(u - 0.5), cy = Math.round(y - 0.5);
  // пол: ось на верхней грани (y целое), стена ниже
  if (Math.abs(y - Math.round(y)) < 0.01 && Math.abs(u - Math.round(u)) < 0.01) { const U = Math.round(u), Y = Math.round(y);
    if ([-1, 0, 1].every(t => wall(U + t, Y - 1) && air(U + t, Y) && air(U + t, Y + 1))) return 'd';
    if ([-1, 0, 1].every(t => wall(U + t, Y) && air(U + t, Y - 1) && air(U + t, Y - 2))) return 'u'; }
  if (Math.abs(u - Math.round(u) - 0.5) < 0.01 || Math.abs(u - Math.round(u) + 0.5) < 0.01) { const Y = Math.floor(y), L = Math.floor(u), Rr = L + 1;
    if ([-1, 0, 1].every(t => wall(Rr, Y + t) && air(L, Y + t))) return 'r';
    if ([-1, 0, 1].every(t => wall(L, Y + t) && air(Rr, Y + t))) return 'l'; }
  return null;
}
// мягкое правило для редактора (v274, Алексей: «выше в платформы не ставится — только над или по краям»): куб корпуса — любой, глубина
// корпуса — самый ближний из них; там, куда торчит колесо, — пусто хотя бы на 1 глубже (раньше требовалось ровно та же глубина и пусто на 2)
function wgMountLoose(F, u, y) {
  const S3 = [-1, 0, 1], has = v => v > -50, pick = (cells, airs) => { const ds = cells.map(c => F(c[0], c[1])); if (!ds.every(has)) return null; const D = Math.max(...ds); return airs.every(c => F(c[0], c[1]) <= D - 1) ? D : null; };
  const out = [];
  if (Math.abs(y - Math.round(y)) < 0.01 && Math.abs(u - Math.round(u)) < 0.01) { const U = Math.round(u), Y = Math.round(y);
    let D = pick(S3.map(t => [U + t, Y - 1]), S3.flatMap(t => [[U + t, Y], [U + t, Y + 1]])); if (D !== null) out.push({ w: 'd', D });
    D = pick(S3.map(t => [U + t, Y]), S3.flatMap(t => [[U + t, Y - 1], [U + t, Y - 2]])); if (D !== null) out.push({ w: 'u', D }); }
  if (Math.abs(Math.abs(u - Math.floor(u)) - 0.5) < 0.01) { const Y = Math.floor(y), L = Math.floor(u), Rr = L + 1;
    let D = pick(S3.map(t => [Rr, Y + t]), S3.map(t => [L, Y + t])); if (D !== null) out.push({ w: 'r', D });
    D = pick(S3.map(t => [L, Y + t]), S3.map(t => [Rr, Y + t])); if (D !== null) out.push({ w: 'l', D }); }
  return out;
}
// ближайшее к точке (u, y) ребро стороны f, куда встаёт колесо: {x, y, z, w} или null (редактор: клик у края; загрузка: притянуть)
function wgNearest(f, u, y, rad) {
  const R = SKIN_R[f], N = SKIN_N[f], F = wgFront(f); let best = null;
  for (let du = -rad; du <= rad; du += 0.5) for (let dy = -rad; dy <= rad; dy += 0.5) { const uu = Math.round((u + du) * 2) / 2, yy = Math.round((y + dy) * 2) / 2, s = Math.hypot(uu - u, yy - y); if (best && s >= best.s) continue;
    for (const m of wgMountLoose(F, uu, yy)) { best = { s, w: m.w, u: uu, y: yy, D: m.D }; break; } }
  if (!best) return null; const d = best.D + 0.55; return { x: best.u * R[0] + d * N[0], y: best.y, z: best.u * R[1] + d * N[1], w: best.w };
}
// сторона и точное место — по кубам рядом (поставленную в редакторе притягивает к ближайшему ребру); выбранная руками сторона (wHand) — как есть
function wgPrep(o) {
  if (o.w && o.wHand) return o; const f = ((o.f || 0) % 4 + 4) % 4, R = SKIN_R[f], n = wgNearest(f, o.x * R[0] + o.z * R[1], o.y, 1.5);
  if (n) { o.x = n.x; o.y = n.y; o.z = n.z; o.w = n.w; } else if (!o.w) o.w = 'r';
  return o;
}
function wgStand(F, u, y, D, w) {
  const floor = (uu, yy) => F(uu, yy - 1) === D && F(uu, yy) <= D - 2 && F(uu, yy + 1) <= D - 2;
  const lo = w === 'd' ? y - 0.1 : w === 'u' ? y - 4.2 : y - 3.2, hi = w === 'd' ? y + 0.1 : w === 'u' ? y - 1.9 : y - 0.4;
  const side = w === 'r' ? -1 : w === 'l' ? 1 : 0, U0 = Math.round(u + side * 0.5);
  for (let du = 0; du <= 4; du++) for (const sg of du ? [1, -1] : [1]) { const uu = U0 + sg * du; if (side && Math.sign(uu - u) !== side) continue;
    for (let yy = Math.ceil(lo); yy <= Math.floor(hi); yy++) if (floor(uu, yy)) return { u: uu, y: yy }; }
  return null;
}
function placeWallGears() {   // по лицевым стенам: колёса торчат из боковин столбов, из полов и потолков уступов
  const R0 = rng(((LEVEL.seed | 0) + 9191) >>> 0), out = [], busy = [];
  const add = (x, y, z, r) => busy.push([x, y, z, r || 2]);
  for (const L of LEVEL.ladders || []) { const c = lanePosR(L.f, L.t, L.r || 8); for (let y = L.y0; y <= L.y1; y += 1) add(c[0], y, c[1], 1.8); }
  for (const q of LEVEL.pipes || []) for (const p of q.pts || []) if (Array.isArray(p)) add(p[0], p[1], p[2], 1.6);
  for (const k of ['doors', 'lamps', 'rings', 'steams', 'traps', 'crates', 'fires', 'vents', 'keys', 'bits', 'robots', 'wsprites', 'hearts', 'items', 'engines', 'pistons', 'movers'])
    for (const o of LEVEL[k] || []) if (o && o.x !== undefined) add(o.x, o.y, o.z, k === 'robots' ? 4 : k === 'doors' ? 2.6 : 2);
  for (const G of LEVEL.gears || []) add(G.x, G.y, G.z, (G.R || 1) + 2);
  for (const L of LEVEL.lifts || []) if (L.x !== undefined) add(L.x, L.y || 0, L.z, 3);
  for (const L of (LEVEL.stairs || []).concat((LEVEL.walkways || []).map(w => ({ f: w.f, t0: w.t0, t1: w.t1, y0: w.y, y1: w.y, r: w.r })))) for (let k = 0; k <= 8; k++) { const t = L.t0 + (L.t1 - L.t0) * k / 8, c = lanePosR(L.f, t, L.r || 8); add(c[0], L.y0 + (L.y1 - L.y0) * k / 8, c[1], 1.6); }   // v291: колесо не на марше и не на переходе (герой вставал на колесо вместо ступеней)
  const cand = [];
  for (let f = 0; f < 4; f++) { const F = wgFront(f), R = SKIN_R[f], N = SKIN_N[f], seen = new Set();
    for (const c of cubes.values()) { if (c.y < 3 || c.y > 2500) continue; const u = c.x * R[0] + c.z * R[1], D = F(u, c.y); if (D !== c.x * N[0] + c.z * N[1] || D < 5) continue;
      for (const [uu, yy] of [[u, c.y + 1], [u, c.y], [u + 0.5, c.y + 0.5], [u - 0.5, c.y + 0.5]]) { const key = uu + '|' + yy; if (seen.has(key)) continue; seen.add(key);
        const w = wgMountAt(F, uu, yy, D); if (w && yy < 900 && wgStand(F, uu, yy, D, w)) cand.push({ f, u: uu, y: yy, D, w }); } } }
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(R0() * (i + 1)); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
  const cnt = { d: 0, u: 0, r: 0, l: 0 };
  for (const q of cand) { if (out.length >= 14) break; if (q.w === 'd' && cnt.d >= 4) continue;
    const d = q.D + 0.55, R = SKIN_R[q.f], N = SKIN_N[q.f], x = q.u * R[0] + d * N[0], z = q.u * R[1] + d * N[1], y = q.y;
    if (busy.some(b => Math.abs(b[0] - x) + Math.abs(b[2] - z) < b[3] + 1 && Math.abs(b[1] - y) < b[3] + 1)) continue;
    if (out.some(o => Math.hypot(o.x - x, o.z - z) < 7 && Math.abs(o.y - y) < 6)) continue;
    out.push({ x, y, z, f: q.f, k: Math.floor(R0() * WGEAR.h.length), w: q.w }); cnt[q.w]++; }
  LEVEL.wgears = out;
}
// в игре — обычное колесо (11_propsh), чуть медленнее своих
function wgSpawn() { return (LEVEL.wgears || []).map((o, i) => { wgPrep(o);
  return { x: o.x, y: o.y, z: o.z, f: o.f, R: WGEAR.R, rust: i % 4 === 1, wg: o, w: o.w, ang: (i * 1.7) % 6.28, om: 0, on: false, extra: 0, drive: (o.dir ? Math.sign(o.dir) : i % 2 ? -1 : 1) * (0.45 + (i % 3) * 0.1) }; }); }   // dir: +1 по часовой, −1 против (редактор)
const wgDiskC = new Map();
function wgDisk(R, sz) {   // сплошной диск под колесом (в точках колеса): тёмный металл вместо дыр облегчения — сквозь колесо в стене не видно стену и небо
  const key = R + '|' + sz; let c = wgDiskC.get(key); if (c) return c; c = document.createElement('canvas'); c.width = c.height = sz; const x = c.getContext('2d'), o = sz / 2, r = (R - 0.45) * GEAR_PX;
  x.fillStyle = '#4a433f'; for (let yy = 0; yy < sz; yy++) for (let xx = 0; xx < sz; xx++) if (Math.hypot(xx + 0.5 - o, yy + 0.5 - o) <= r) x.fillRect(xx, yy, 1, 1);
  wgDiskC.set(key, c); return c; }
function drawWGear(G, b) {
  const I = wgImg(); if (!I) return; const fc = gearFace(G); if (fc < 0.04) return; const o = G.wg, r = WGEAR.h[o.k] || WGEAR.h[0], k = S / GEAR_PX;
  const cx = W / 2 + relU(G, b) * S, cy = H / 2 - (G.y - cam.y) * S, w = G.w, e = 0, big = S * 4;   // v281 (Алексей 21.10: «пробел между текстурой и шестерёнкой; корпус слишком выделяется — оставим только половинку шестерни вплотную»): колесо срезано ровно по стене, корпуса нет
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.beginPath();   // колесо видно только снаружи стены
  if (w === 'r') ctx.rect(cx - big, cy - big, big - e * fc, 2 * big); else if (w === 'l') ctx.rect(cx + e * fc, cy - big, big, 2 * big); else if (w === 'd') ctx.rect(cx - big, cy - big, 2 * big, big - e); else ctx.rect(cx - big, cy + e, 2 * big, big);
  ctx.clip(); const st = ((Math.round(G.ang / (Math.PI * 2) * 32) % 32) + 32) % 32, fr = gearFrameNear(G.R, G.rust ? 1 : 0, st), gk = S / GEAR_PX, gw = fr.width * gk;
  { const dk = wgDisk(G.R, fr.width), dw = dk.width * gk; ctx.drawImage(dk, Math.round(cx - dw * fc / 2), Math.round(cy - dw / 2), Math.round(dw * fc), Math.round(dw)); }   // v273: окна в диске закрыты тёмным металлом — колесо не просвечивает
  ctx.drawImage(fr, Math.round(cx - gw * fc / 2), Math.round(cy - gw / 2), Math.round(gw * fc), Math.round(gw));
  ctx.restore();
}
// ====================== ПРЕДМЕТЫ НА РУКАХ (ядро, v278) ======================
// Алексей 20.10: «чтобы на руки можно было ставить платформы, двери и всё остальное; трубы тоже; роботы пусть магнитятся к платформам,
// когда рука бьёт». Руки качаются и бьют, поэтому их кубы — не мир: всё, что стоит на руке, прицеплено к своему куску руки
// (плечо 'u', предплечье 'f', ладонь 'p') — в записи arm: {side, seg, t (вдоль кости, от сустава), s (поперёк)} — и каждый кадр едет с ним.
// Работают: двери, лестницы, ухваты, лампы, ящики, декор, шестерни (и шестерни в стене), трубы (лазать по отвесным кускам, висеть
// под пологими), роботы (стоят на месте — примагничены). Видно и работает, когда видны руки (вид с востока или запада); иначе — убраны.
// Лестница: высота h в записи (y1 − y0). Труба: точки трубы — armPts [[t, s], …] (в записи), мировые точки считаются заново.
const ARM_KEYS = ['doors', 'ladders', 'grips', 'lamps', 'crates', 'decor', 'gears', 'wgears', 'pipes', 'robots'];
let armAtt = [], armBeams = [];
function armSegOf(o) { const A = arms.find(q => q.side === o.arm.side); if (!A) return null; const sg = armSegs(A, armPose(A)).find(q => q.k === o.arm.seg); return sg ? { A, sg } : null; }
function armPoint(o, t, s) { const r = armSegOf(o); if (!r) return null; return armWorld(r.sg, t !== undefined ? t : num0(o.arm.t), s !== undefined ? s : num0(o.arm.s)); }
const num0 = v => v === '-0' ? 0 : +v;
// в момент запуска уровня: что прицеплено, какие у него «двойники» в игре (ящики, двери, колёса, роботы — копии), лазы и балки
function armAttachInit() {
  armAtt = []; armBeams = []; if (!arms.length) return;
  for (const key of ARM_KEYS) (LEVEL[key] || []).forEach((o, i) => { if (!o || !o.arm) return; o.armP = true; const a = { key, o, rt: null };
    if (key === 'doors') a.rt = doors[i]; else if (key === 'gears') a.rt = gears[i]; else if (key === 'robots') a.rt = typeof robots !== 'undefined' ? robots[i] : null;
    else if (key === 'crates') a.rt = crates.find(c => c.src === o); else if (key === 'wgears') a.rt = gears.find(G => G.wg === o);
    if (a.rt) a.rt.armP = true;
    if (key === 'ladders') { a.h = Math.max(1, num0(o.y1) - num0(o.y0)); a.cl = { x: 0, z: 0, y0: 0, y1: 0, d: 0, armP: true }; dynClimbs.push(a.cl); }
    if (key === 'lamps') a.cl = dynClimbs.find(c => c.lamp === o);
    if (key === 'pipes' && o.armPts) { a.cls = []; a.bms = [];
      for (let k = 0; k + 1 < o.armPts.length; k++) {   // у каждого куска — и лаз, и балка: рука может лечь (ладонь-лифт), тогда отвесный кусок становится пологим — работает то, что подходит сейчас
        const c = { x: 0, z: 0, y0: 0, y1: 0, pipe: true, d: 0, armP: true }; dynClimbs.push(c); a.cls.push([k, c]); const bm = [[0, 0, 0], [0, 0, 0]]; bm.armP = true; armBeams.push(bm); a.bms.push([k, bm]); } }
    armAtt.push(a); });
  armAttachTick(true);
}
function armAttachTick(force) {
  if (!armAtt.length) return; const vk = view.k === 1 || view.k === 3 ? view.k : 1, r1 = vk === 1 ? -1 : 1, FAR = -9999;
  const live = armVisible() || force;
  for (const a of armAtt) { const o = a.o, hideFar = !live && (a.key === 'crates' || a.key === 'pipes'), P = hideFar ? null : armPoint(o), y = P ? P.y : FAR, z = P ? P.z : 0, u = z * r1, tgt = a.rt || o;   // двери, лестницы и пр. невидимы сами (не своей стороной); ящики и трубы — прячем
    if (a.key === 'robots' && !live) continue;   // робот замирает, пока рук не видно (и спрятан, robotHidden)
    switch (a.key) {
      case 'doors': case 'crates': case 'decor': case 'grips': tgt.x = 0; tgt.z = z; tgt.y = y; if ('f' in tgt || a.key !== 'crates') tgt.f = vk; break;
      case 'lamps': o.x = 0; o.z = z; o.y = y; o.f = vk; if (a.cl) { a.cl.x = 0; a.cl.z = z; a.cl.y0 = y - (o.len || 1) - 0.55; a.cl.y1 = y - 0.05; } break;
      case 'gears': case 'wgears': tgt.x = 0; tgt.z = z; tgt.y = y; tgt.f = vk; break;
      case 'robots': if (tgt) { tgt.x = 0; tgt.z = z; tgt.y = y; tgt.baseY = y; tgt.tx = 0; tgt.tz = z; tgt.vy = 0; } o.x = 0; o.z = z; o.y = y; break;
      case 'ladders': o.f = vk; o.t = u; o.r = 0.001; o.y0 = y; o.y1 = y + a.h; a.cl.x = 0; a.cl.z = z; a.cl.y0 = y; a.cl.y1 = y + a.h; break;
      case 'pipes': if (o.armPts) { const W = o.armPts.map(p => P ? armPoint(o, num0(p[0]), num0(p[1])) : { y: FAR, z: 0 });
        o.pts.forEach((p, k) => { if (!W[k]) return; p[0] = 0; p[1] = W[k].y; p[2] = W[k].z; }); if (o.vpts) o.vpts.forEach((p, k) => { if (!W[k]) return; p[0] = 0; p[1] = W[k].y; p[2] = W[k].z; });
        for (const [k, c] of a.cls) { const A2 = W[k], B2 = W[k + 1], vert = Math.abs(A2.y - B2.y) > Math.abs(A2.z - B2.z); c.x = 0; c.z = (A2.z + B2.z) / 2; c.y0 = vert ? Math.min(A2.y, B2.y) : FAR; c.y1 = vert ? Math.max(A2.y, B2.y) + 0.13 : FAR; }
        for (const [k, bm] of a.bms) { const A2 = W[k], B2 = W[k + 1], vert = Math.abs(A2.y - B2.y) > Math.abs(A2.z - B2.z), y2 = (A2.y + B2.y) / 2; bm[0][0] = 0; bm[0][1] = vert ? FAR : y2; bm[0][2] = A2.z; bm[1][0] = 0; bm[1][1] = vert ? FAR : y2; bm[1][2] = B2.z; } } break; } }
}
// для редактора: что под точкой (u, y) на руке — кусок, местные координаты; и верх площадки руки под ней (для напольного)
function armHit(u, y, floor) {
  if (!arms.length || !(view.k === 1 || view.k === 3)) return null; const r1 = view.k === 1 ? -1 : 1, z = u * r1; let best = null;
  for (const A of arms) { const pose = armPose(A);
    if (floor) { for (const L of A.ledges) { const q = armLedgePos(A, L, pose); if (Math.abs(z - q.z) > L.w / 2 + 0.1 || y < q.y - 0.6 || y > q.y + 2.2) continue; const sg = armSegs(A, pose).find(s => s.k === L.seg); if (!sg) continue;
        const Lc = armLocal(sg, z, q.y), d = Math.abs(y - q.y); if (!best || d < best.d) best = { d, side: A.side, seg: L.seg, t: Math.round(Lc.t * 100) / 100, s: Math.round(Lc.s * 100) / 100, z, y: q.y }; } }
    else for (const sg of armSegs(A, pose)) { const Lc = armLocal(sg, z, y), F = Lc.F, out = Math.max(0, Math.abs(Lc.s) - sg.w / 2); if (Lc.t < 0 || Lc.t > F.len || out > 1.2) continue;
      if (!best || out < best.d) best = { d: out, side: A.side, seg: sg.k, t: Math.round(Lc.t * 100) / 100, s: Math.round(Lc.s * 100) / 100, z, y }; } }
  return best;
}
// ====================== РУКИ КАК НОГИ (ядро, v280) ======================
// Алексей 21.10: «давай сделаем руки по той же механике, что и ноги: лазать как по ногам, платформы, шестерёнки, трубы; рука бьёт перса,
// но пока он на ней — не бьёт, а немного машет, и надо бежать по плоскости, чтобы не упасть, или зацепиться за уступ».
// Каждый кусок руки (плечо, предплечье, ладонь) — маленькая «нога» из кубов далеко над миром (LEVEL.armGroups, y от 1000), которую
// рисуют повёрнутой на своём месте. Когда герой прыгает в руку, он ПЕРЕХОДИТ в этот кусок: ходит, лезет, висит там по тем же правилам,
// что и на ногах (уступы, лестницы, ухваты, шестерни, трубы, лампы — всё, что стоит на кубах куска). Рука качается — кусок с героем
// поворачивается на экране, а наклон тянет героя вниз по плоскости (съезжает; круче — сильнее). Ушёл за край куска — снова в мире.
// Перевод: точка куска (z, y) → мир: поворот на угол куска φ вокруг его шарнира (у плеча — плечо, у предплечья — локоть, у ладони — запястье).
const armPk = y => +y >= 900 && +y < 2400;
const pkSkip = y => armPass ? !armPk(y) : armPk(y);   // в проходе руки — только её вещи; в мире — без них
const heroHere = () => armPass ? !!(hero.arm && hero.arm.w === armPass) : !hero.arm;
let armW = [], armPass = null;
function armWInit() {
  armW = []; hero.arm = null; armFlipK = -1; if (!arms.length || !LEVEL.armGroups) return;
  for (const A of arms) for (const k of ['upper', 'fore', 'palm']) { const G = LEVEL.armGroups.find(g => g.part === k + A.side); if (G) armW.push({ A, G, k: k[0], zmin: 1e9, zmax: -1e9, xs: [] }); }
  for (const c of cubes.values()) { if (!armPk(c.y)) continue; for (const w of armW) if (c.y < w.G.gy && c.y >= w.G.gy - w.G.rows - 1) { w.zmin = Math.min(w.zmin, c.z); w.zmax = Math.max(w.zmax, c.z); w.xs.push(c); } }
  armW = armW.filter(w => w.xs.length);
  // всё, что стоит в кусках руки, — «на руке»: видно и работает, пока руки видны (с востока и запада), правило «дальше 7 — не видно» не для них
  const mark = o => { if (!o || typeof o !== 'object' || Array.isArray(o)) return; const y = o.y !== undefined ? o.y : o.y0 !== undefined ? o.y0 : o.pts && o.pts[0] ? o.pts[0][1] : NaN; if (armPk(y)) o.armP = true; };
  for (const k of Object.keys(LEVEL)) if (Array.isArray(LEVEL[k]) && k !== 'armGroups') LEVEL[k].forEach(mark);
  for (const q of [gears, doors, crates, dynClimbs, typeof traps !== 'undefined' ? traps : [], robots]) (q || []).forEach(mark);
  for (const bm of LEVEL.beams || []) if (bm && bm[0] && armPk(bm[0][1])) bm.armP = true;
  // v280 (Алексей 21.10: «большая шестерня рядом не работает, нет физического тела»): колёса-шарниры (плечо, локоть) живут в мире, а герой
  // на руке — в куске. В куске у шарнира — его двойник (там же, тот же размер и ход): стать, схватиться за зубец; рисуется только мировой
  for (const w of armW) { const pv = w.k === 'u' ? [[0, w.G.gy], [1, w.G.gy - ARM_CFG.L1]] : w.k === 'f' ? [[1, w.G.gy]] : [];
    for (const [ji, y] of pv) { const src = w.A.jg && w.A.jg[ji]; if (!src) continue; const G = { x: 0, y, z: 0, f: 1, R: src.R, rust: 1, armP: true, armJP: src, ang: src.ang, om: 0, on: false, extra: 0, drive: src.drive }; gears.push(G); } }
}
const armJSrc = G => G && G.armJP ? G.armJP : G;
function armWAt(y) { return armW.find(w => y >= w.G.gy - w.G.rows - 6 && y <= w.G.gy + 6) || null; }
function armWFrame(w) { const A = w.A, P = armPose(A), th = w.k === 'u' ? A.a1 : w.k === 'f' ? P.a : armTh3(A, P), p = w.k === 'u' ? P.S : w.k === 'f' ? P.E : P.Wr, phi = A.side * th;
  return { z: p.z, y: p.y, c: Math.cos(phi), s: Math.sin(phi), phi }; }
function armWP2W(w, zp, yp, F) { F = F || armWFrame(w); const ly = yp - w.G.gy; return { z: F.z + zp * F.c - ly * F.s, y: F.y + zp * F.s + ly * F.c }; }
function armWW2P(w, zw, yw, F) { F = F || armWFrame(w); const dz = zw - F.z, dy = yw - F.y; return { z: dz * F.c + dy * F.s, y: w.G.gy - dz * F.s + dy * F.c }; }
// насколько точка (в координатах куска) внутри куска: > 0 — внутри, < 0 — снаружи на столько
function armWScore(w, p) { return Math.min(p.z - (w.zmin - 0.8), (w.zmax + 0.8) - p.z, p.y - (w.G.gy - w.G.rows - 0.6), (w.G.gy + 0.6) - p.y); }
function armWFront(w) { let m = -1e9; for (const c of w.xs) m = Math.max(m, c.x * view.n[0] + c.z * view.n[1]); return m + 1; }
// где герой в мире (для камеры, роботов, рук): в куске — переведённый
function heroWorld() { if (!hero.arm) return hero; const w = hero.arm.w, c = armWP2W(w, hero.z, hero.y + hero.h / 2); return { x: 0, y: c.y - hero.h / 2, z: c.z }; }
function armWShift(dy) { if (hero.gY !== undefined) hero.gY += dy; if (hero.levelY !== undefined) hero.levelY += dy; if (hero.boostY !== undefined) hero.boostY += dy; if (cam.gy !== null && cam.gy !== undefined) cam.gy += 0; }
// скорость героя (по экрану u и вверх) из одной системы в другую
function armWVel(F, toPk) { const r1 = view.r[1], vz = hero.vx * r1, vy = hero.vy, s = toPk ? F.s : -F.s; hero.vx = (vz * F.c + vy * s) * r1; hero.vy = -vz * s + vy * F.c; }
function armWPlace(w, F, wz, wy, keepLad) {
  const p = armWW2P(w, wz, wy + hero.h / 2, F), y0 = hero.y, lad = hero.ladder;
  setUD(hero, p.z * view.r[1], armWFront(w)); hero.y = p.y - hero.h / 2; armWShift(hero.y - y0); hero.arm = { w }; hero.standOn = null; hero.hook = null; hero.armSv = 0;
  if (lad && keepLad) {   // лез по лестнице через локоть — та же лестница в соседнем куске
    const u = toU(hero), L2 = LEVEL.climbs.concat(dynClimbs).find(L => L.armP && armWAt(L.y0) === w && Math.abs(ladderU(L) - u) < 0.7 && hero.y >= L.y0 - 0.6 && hero.y <= L.y1 - 0.2);
    if (L2) { hero.ladder = L2; hero.ladPL = null; setUD(hero, ladderU(L2), L2.d || toD(hero)); } else { hero.ladder = null; hero.ladPL = null; go('Fly'); } }
}
function armWEnter(w) { const F = armWFrame(w); armWVel(F, true); armWPlace(w, F, hero.z, hero.y, false); hero.onGround = false; }
function armWExit() {
  const w = hero.arm.w, F = armWFrame(w), c = armWP2W(w, hero.z, hero.y + hero.h / 2, F), y0 = hero.y;
  if (hero.armSv) { hero.vx += hero.armSv; hero.armSv = 0; } armWVel(F, false);
  hero.arm = null; setUD(hero, c.z * view.r[1], 0); hero.y = c.y - hero.h / 2; armWShift(hero.y - y0);
  if (hero.hang && hero.hang.gear && hero.hang.gear.armJP) { const g2 = hero.hang.gear.armJP; hero.hang.gear = g2; setUD(hero, toU(hero), toD(hero)); hero.standOn = null; hero.frontT = 1.0; return; }   // висел на двойнике шарнира — теперь на самом колесе
  if (hero.ladder || hero.hang) { hero.ladder = null; hero.ladPL = null; hero.hang = null; go('Fly'); } hero.standOn = null; hero.onGround = false; hero.hangCool = Math.max(hero.hangCool || 0, 0.2);
  heroToFront(); hero.frontT = 1.0;
}
function armWMove(w2) {   // из куска в соседний (плечо ↔ предплечье ↔ ладонь), через мир
  const w = hero.arm.w, F = armWFrame(w), c = armWP2W(w, hero.z, hero.y + hero.h / 2, F), F2 = armWFrame(w2);
  armWVel(F, false); armWVel(F2, true); armWPlace(w2, F2, c.z, c.y - hero.h / 2, true);
}
function armWTick(dt) {
  if (!armW.length) { if (hero.arm) hero.arm = null; return; }
  armWFlip();
  // роботы рук, упавшие с куска (сбросили, оглушили, погибли), — пропадают ниже куска, а не летят сквозь мир
  for (let i = robots.length - 1; i >= 0; i--) { const r = robots[i]; if (!r.armP) continue; const w = armWAt(r.baseY !== undefined ? Math.max(r.y, 900) : r.y);
    if (!w || r.y < w.G.gy - w.G.rows - 8) { if (hero.ride && hero.ride.r === r) hero.ride = null; if (hero.standOn === r) hero.standOn = null; robots.splice(i, 1); } }
  for (const G of gears) if (G.armJP) { G.ang = G.armJP.ang; G.om = G.armJP.om; if (view.k === 1 || view.k === 3) G.f = view.k; }
  const can = armVisible() && hero.state !== 'dead' && !hero.inDoor && !hero.ride && !(game.finishT > 0);
  if (hero.arm) {
    if (!can) { armWExit(); return; }
    const cur = hero.arm.w, F = armWFrame(cur), held = hero.ladder || hero.hang;
    // наклон: вдоль плоскости тянет вниз — съезжаешь; круче 45° — не устоять
    if (hero.onGround && !held) { const st = Math.abs(F.phi) > 0.75 ? 5 : 1, au = -view.r[1] * CFG.gravity * 0.35 * Math.sin(F.phi) * st;   /* v284: на малом наклоне — легко, круче 45° — не устоять */
      hero.armSv = ((hero.armSv || 0) + au * dt) * Math.exp(-dt * 0.9);
      const u = toU(hero), nu = u + hero.armSv * dt, d = toD(hero); if (!overlapsDepth(nu, hero.y + 0.02, hero.hw, hero.h - 0.04, d)) setUD(hero, nu, d); else hero.armSv = 0; }
    else if (hero.armSv) { if (!held) hero.vx += hero.armSv; hero.armSv = 0; }
    const sc = armWScore(cur, { z: hero.z, y: hero.y + hero.h / 2 }), wc = armWP2W(cur, hero.z, hero.y + hero.h / 2, F); let best = null, bs = -1e9;
    for (const w of armW) { if (w === cur || w.A !== cur.A) continue; const Fw = armWFrame(w), s = armWScore(w, armWW2P(w, wc.z, wc.y, Fw)); if (s > bs) { bs = s; best = w; } }
    if (best && bs > sc + 0.25 && bs > -0.4) armWMove(best);
    else if (sc < -1.2) armWExit();
    return;
  }
  // в мире: в прыжке/падении влетел в кусок руки — переходит в него
  if (!can || hero.onGround || hero.hang || hero.ladder || view.rotating || hero.inDoor) return;
  let best = null, bs = 0.15;
  for (const w of armW) { const F = armWFrame(w); if (Math.abs(F.phi) > 0.9) continue; const s = armWScore(w, armWW2P(w, hero.z, hero.y + hero.h / 2, F)); if (s > bs) { bs = s; best = w; } }
  if (best) armWEnter(best);
}
// ---- рисование: всё, что стоит на куске (и герой в нём), — тем же списком, что и мир, но повёрнутым вместе с куском
// нарисовать fn() так, будто камера внутри куска w: тот же список рисовалок, повёрнутый вместе с куском (clip — только этот кусок)
function armWWith(w, b, fn, clip) {
  const F = armWFrame(w), r1 = b.r[1] > 0 ? 1 : -1, cp = armWW2P(w, cam.z, cam.y, F), Wd = Math.ceil(Math.hypot(W, H)) + 8, Hd = Wd, W0 = W, H0 = H, cy0 = cam.y, cz0 = cam.z, sv = armPass;
  ctx.save();
  try {
    ctx.translate(W0 / 2, H0 / 2); ctx.transform(F.c, -r1 * F.s, r1 * F.s, F.c, 0, 0); ctx.translate(-Wd / 2, -Hd / 2);
    if (clip !== false) { const X = z => Wd / 2 + (z - cp.z) * r1 * S, Y = y => Hd / 2 - (y - cp.y) * S, xa = X(w.zmin - 3), xb = X(w.zmax + 3);
      ctx.beginPath(); ctx.rect(Math.min(xa, xb), Y(w.G.gy + 3.5), Math.abs(xb - xa), (w.G.rows + 7) * S); ctx.clip(); }
    W = Wd; H = Hd; cam.y = cp.y; cam.z = cp.z; armPass = w; fn();
  } finally { armPass = sv; W = W0; H = H0; cam.y = cy0; cam.z = cz0; ctx.restore(); }
}
function armWDraw(w, b) {
  const F = armWFrame(w), r1 = b.r[1] > 0 ? 1 : -1, ctr = armWP2W(w, 0, w.G.gy - w.G.rows / 2, F), R = (w.G.rows / 2 + 8) * S;
  const sx = W / 2 + (ctr.z - cam.z) * r1 * S, sy = H / 2 - (ctr.y - cam.y) * S; if (sx < -R || sx > W + R || sy < -R || sy > H + R) return;
  armWWith(w, b, () => { const relD = e => (e.x - cam.x) * b.n[0] + (e.z - cam.z) * b.n[1], acts = []; buildActors(b, relD, acts); acts.sort((p, q) => p._d - q._d); for (const a of acts) a.draw(); });
}
function armWDrawAll(A, b, al) {
  if (view.rotating || Math.abs(b.r[1]) < 0.99 || armPass) return; armWFlip(); const g0 = ctx.globalAlpha; ctx.globalAlpha = al;
  const mine = armW.filter(w => w.A === A).sort((p, q) => (hero.arm && hero.arm.w === p ? 1 : 0) - (hero.arm && hero.arm.w === q ? 1 : 0));
  for (const w of mine) armWDraw(w, b);
  ctx.globalAlpha = g0;
}

// ---- v283: наряд рук как у ног (Алексей 21.10: «на руках платформы, шестерёнки, трубы и тп») — генератор, после шестерён в стене
// плечо и предплечье: под средним уступом — половинка шестерни (висит с потолка уступа: за зубец хватаются); снаружи предплечья —
// труба от нижнего уступа до верхнего (по ней лезут, наверху колено уходит в руку). Всё на кубах куска, в координатах куска.
function armDress() {
  if (!LEVEL.armGroups) return; LEVEL.wgears = LEVEL.wgears || []; const R = rng(((LEVEL.seed | 0) + 7373) >>> 0);
  for (const G of LEVEL.armGroups) { const k = G.part.replace(/-?1$/, ''), sd = /-1$/.test(G.part) ? -1 : 1, hw = r => typeof G.hw === 'function' ? G.hw(r) : G.hw;
    if (k !== 'upper' && k !== 'fore') continue;
    const L = G.ledges[1]; if (L) LEVEL.wgears.push({ x: 1.55, y: G.gy - L.r, z: sd * L.o * (hw(L.r) + 1.5), f: 1, k: Math.floor(R() * WGEAR.h.length), w: 'u', wHand: true, ak: 1 });
    // v284 (Алексей 20.10: «роботы пускай магнитятся к платформам»): на нижнем уступе плеча и на среднем уступе предплечья — робот-сторож:
    // ходит по уступу (как на ноге), просыпается, когда герой в этом куске, бьёт; сброшенный с руки — пропадает внизу
    { const L2 = k === 'upper' ? G.ledges[2] : G.ledges[1]; if (L2) LEVEL.robots.push({ x: 0, y: G.gy - L2.r + 1, z: sd * L2.o * (hw(L2.r) + 1), h: [0, sd * L2.o], R: 9, F: 7.5, ak: 1 }); }
    if (k === 'fore') { const lo = G.ledges.filter(l => l.o === 1).sort((a, b) => b.r - a.r), z = sd * 3.7, x = 3.9;
      if (lo.length >= 2) { const y0 = G.gy - lo[0].r + 1, y1 = G.gy - lo[lo.length - 1].r + 1.6;
        LEVEL.pipes.push({ pin: true, n: [1, 0], ak: 1, pts: [[x, y0, z], [x, y1, z], [x, y1, z - sd * 1.2]] }); } } }
}
// у кусков руки две лицевые стороны (с востока и с запада): ухваты, шестерни, трубы, лампы — на той, что к нам (как перевернуть монету)
let armFlipK = -1;
function armWFlip() {
  const k = view.k; if (view.rotating || !(k === 1 || k === 3) || k === armFlipK) return; armFlipK = k; const n0 = view.n[0];
  const fx = o => { if (o && typeof o.x === 'number' && armPk(o.y !== undefined ? o.y : o.y0)) { o.x = Math.abs(o.x) * n0; if ('f' in o) o.f = k; } };
  for (const key of ['grips', 'lamps', 'decor', 'wgears']) (LEVEL[key] || []).forEach(fx);
  for (const G of gears) if (G.armP && !G.armJP) fx(G);
  for (const c of crates) fx(c); if (typeof traps !== 'undefined') traps.forEach(fx);
  for (const q of LEVEL.pipes || []) { const P = q.pts || []; if (!P.length || !armPk(P[0][1])) continue; for (const pp of P) pp[0] = Math.abs(pp[0]) * n0; if (q.vpts) for (const pp of q.vpts) pp[0] = Math.abs(pp[0]) * n0; if (q.n) q.n = [n0, 0]; }
  for (const c of LEVEL.climbs.concat(dynClimbs)) if (c.pipe && armPk(c.y0)) { c.x = Math.abs(c.x) * n0; c.d = Math.abs(c.d || 0); }
  for (const bm of LEVEL.beams || []) if (bm && bm[0] && armPk(bm[0][1])) for (const pp of bm) pp[0] = Math.abs(pp[0]) * n0;
}
// ====================== СТУПЕНЧАТЫЕ ЛЕСТНИЦЫ (ядро, v287) ======================
// Алексей 24.10: «новый вид пропсов — ступенчатые лестницы, которые идут по диагонали от платформы до платформы иногда».
// Лестница-марш висит перед стеной на своей стороне (f), от края одной площадки (t0, y0 — высота ног) до края другой (t1, y1); глубина r (8 — как у
// дорожек ноги). Идти по ней можно, когда её сторона к нам (как ступени: шагом вверх и вниз, без прыжка). Ступень — полкуба высоты.
// В файле карты — 'climb/stairs' (LEVEL.stairs). Генератор иногда ставит марш между двумя площадками одной стороны пути, если между ними пусто.
const STAIR_STEP = 0.5;
function stairFace(L, b) { const N = FACE_N[((L.f || 0) % 4 + 4) % 4]; return N[0] * (b || view).n[0] + N[1] * (b || view).n[1]; }
function stairEnds(L, b) { const B = b || view, r = L.r || 8, a = lanePosR(L.f, num0s(L.t0), r), c = lanePosR(L.f, num0s(L.t1), r);
  return { ua: a[0] * B.r[0] + a[1] * B.r[1], ub: c[0] * B.r[0] + c[1] * B.r[1], ya: num0s(L.y0), yb: num0s(L.y1), x: (a[0] + c[0]) / 2, z: (a[1] + c[1]) / 2 }; }
const num0s = v => v === '-0' ? 0 : +v;
function stairTopAt(L, u) {   // высота ног на марше в точке u (или null): ровная наклонная — ступени рисуются вокруг неё
  const e = stairEnds(L), lo = Math.min(e.ua, e.ub), hi = Math.max(e.ua, e.ub); if (u < lo - 0.15 || u > hi + 0.15) return null;
  const k = hi - lo < 1e-3 ? 0 : (Math.max(lo, Math.min(hi, u)) - e.ua) / (e.ub - e.ua); return e.ya + (e.yb - e.ya) * k;
}
function stairSupport(u, yFeet, best) {
  for (const L of LEVEL.stairs || []) { if (stairFace(L) < 0.5 || L.y0 > 900 && L.y0 < 2400) continue; const top = stairTopAt2(L, u); if (top === null) continue;
    if (top <= yFeet + STEP_UP + 0.02 && top > yFeet - 0.6 && (!best || top > best.top)) best = { top, r: L }; }
  return best;
}
const onStairs = () => !!(hero.standOn && ((LEVEL.stairs || []).includes(hero.standOn) || (LEVEL.walkways || []).includes(hero.standOn)));
// ---- v288: переходы (Алексей 24.10, лист лестниц: «нравятся платформы типа переходов — тоже как пропс»): ровный настил с перилами
// от края одной площадки до края другой на той же высоте (или балкон в 3 клетки от края). LEVEL.walkways {f, t0, t1, y, r}; в файле — 'plat/walkway'.
const walkAsStair = W2 => ({ f: W2.f, t0: W2.t0, t1: W2.t1, y0: W2.y, y1: W2.y, r: W2.r });
function walkSupport(u, yFeet, best) {
  for (const W2 of LEVEL.walkways || []) { const L = walkAsStair(W2); if (stairFace(L) < 0.5 || W2.y > 900 && W2.y < 2400) continue; const top = stairTopAt(L, u); if (top === null) continue;
    if (top <= yFeet + STEP_UP + 0.02 && top > yFeet - 0.6 && (!best || top > best.top)) best = { top, r: W2 }; }
  return best;
}
// v290: свободно ли герою идти по маршу: blk(t, y) — куб на дорожке марша в клетке t (вдоль стороны), высота y
function stairClear(L, blk) {
  const lo = Math.min(num0s(L.t0), num0s(L.t1)), hi = Math.max(num0s(L.t0), num0s(L.t1)), tp = t => stairTopAt2f(L, t);
  for (let t = Math.ceil(lo); t <= Math.floor(hi); t++) { const a = tp(t - 0.45), c = tp(t + 0.45), y0 = Math.floor(Math.min(a, c) + 0.02), y1 = Math.ceil(Math.max(a, c) + 1.6);
    for (let y = y0; y <= y1; y++) if (blk(t, y)) return false; }
  return true;
}
const stairTopAt2f = (L, t) => { const B = basis(((L.f || 0) % 4) * 90), r = L.r || 8, c = lanePosR(L.f, t, r); return stairTopAt2(L, c[0] * B.r[0] + c[1] * B.r[1], B) ?? Math.min(num0s(L.y0), num0s(L.y1)); };
function stairPickLand(L, blk) {   // площадка внизу или вверху — где ступени проходят; нигде — null
  const lands = Math.abs(Math.abs(num0s(L.t1) - num0s(L.t0)) - Math.abs(num0s(L.y1) - num0s(L.y0))) < 0.05 ? ['lo'] : ['lo', 'hi'];
  for (const ld of lands) { const M = Object.assign({}, L, { land: ld }); if (stairClear(M, blk)) return ld; } return null;
}
// v291 (Алексей: «первый раз, когда пытался подняться по лестнице, упал вниз»): под площадкой марша стояло колесо — герой вставал на колесо
const stGearHit = (c, y) => (LEVEL.gears || []).some(G => Math.hypot(c[0] - G.x, c[1] - G.z, y + 0.5 - G.y) < (G.R || 1) + 0.9);
// генератор: между площадками одной стороны пути, где между ними пусто (по глубине дорожки) — иногда марш
function placeStairs() {
  LEVEL.stairs = LEVEL.stairs || []; const R = rng(((LEVEL.seed | 0) + 4646) >>> 0), P = (LEVEL.path || []).filter(q => q.f >= 0 && q.f < 4), out = [];
  const lane8 = (f, t) => [[t, 8], [8, -t], [-t, -8], [-8, t]][f], H = q => q.top;   // top дорожки — высота ног (куб площадки на top − 1)
  const busy = (f, t, y) => (LEVEL.ladders || []).some(L => L.f % 4 === f && Math.abs(L.t - t) < 1.5 && y > L.y0 - 1 && y < L.y1 + 1) || (LEVEL.doors || []).some(d => d.y < 2500 && Math.abs(d.y - y) < 2.5 && Math.hypot(d.x - lane8(f, t)[0], d.z - lane8(f, t)[1]) < 1.6);
  for (const p of P) for (const q of P) { if (p === q || p.f !== q.f || q.a <= p.b) continue; const f = p.f, dy = H(q) - H(p), t0 = p.b + 0.5, t1 = q.a - 0.5, run = t1 - t0;
    if (Math.abs(dy) < 1 || Math.abs(dy) > 4 || run < Math.max(2, Math.abs(dy)) || run > 6) continue;
    let ok = true; for (let t = Math.ceil(t0); t <= Math.floor(t1) && ok; t++) { const c = lane8(f, t), yc = H(p) + dy * (t - t0) / run; for (let y = Math.floor(Math.min(H(p), H(q))) - 1; y <= Math.ceil(yc) + 2 && ok; y++) if (y >= Math.floor(yc) && hasCube(c[0], y, c[1])) ok = false; if (busy(f, t, yc)) ok = false; }
    if (!ok || out.some(s => s.f === f && Math.abs((s.t0 + s.t1) / 2 - (t0 + t1) / 2) < 4 && Math.abs((s.y0 + s.y1) / 2 - (H(p) + H(q)) / 2) < 4)) continue;
    if (R() < 0.8) { const S2 = { f, t0, y0: H(p), t1, y1: H(q), r: 8 }, ld = stairPickLand(S2, (t, y) => { const c = lane8(f, t); return hasCube(c[0], y, c[1]) || stGearHit(c, y); }); if (ld) out.push(Object.assign(S2, { land: ld })); } if (out.length >= 8) break; }
  LEVEL.stairs = LEVEL.stairs.concat(out);
  // переходы: на дорожке стороны (глубина 8) — два места, где можно стоять, на одной высоте, между ними 2–6 пустых клеток — иногда мостик
  LEVEL.walkways = LEVEL.walkways || []; const wk = [], top8 = (LEVEL.pelY || 32) - 1;
  const stand = (f, t, y) => { const c = lane8(f, t); return hasCube(c[0], y - 1, c[1]) && !hasCube(c[0], y, c[1]) && !hasCube(c[0], y + 1, c[1]); }, empty = (f, t, y) => { const c = lane8(f, t); for (let yy = y - 1; yy <= y + 2; yy++) if (hasCube(c[0], yy, c[1]) || stGearHit(c, yy)) return false; return true; };
  for (let f = 0; f < 4; f++) for (let y = 3; y <= top8; y++) for (let t = -8; t <= 8; t++) { if (!stand(f, t, y) || stand(f, t + 1, y)) continue;   // t — правый край площадки
    let g2 = 0; while (g2 < 7 && empty(f, t + 1 + g2, y)) g2++; if (g2 < 2 || g2 > 6 || !stand(f, t + 1 + g2, y)) continue; const t0 = t + 0.5, t1 = t + g2 + 0.5;
    let ok = true; for (let tt = t + 1; tt <= t + g2; tt++) if (busy(f, tt, y)) ok = false;
    if (!ok || out.concat(wk).some(s2 => s2.f === f && Math.abs((s2.t0 + s2.t1) / 2 - (t0 + t1) / 2) < 4 && Math.abs((s2.y0 !== undefined ? s2.y0 : s2.y) - y) < 4)) continue;
    if (R() < 0.5) wk.push({ f, t0, t1, y, r: 8 }); if (wk.length >= 4) break; }
  LEVEL.walkways = LEVEL.walkways.concat(wk);
  const n0 = out.length;
  // v289 (Алексей 24.10: «больше ступенчатых лестниц, на первых уровнях тоже»): ещё и по самим кубам дорожки (как у переходов) — от края
  // места, где можно стоять, до другого такого места выше или ниже на 1–4 и вбок на 2–6, если между ними пусто; чаще и до 12 на карту
  { const st8 = (f, t, y) => { const c = lane8(f, t); return hasCube(c[0], y - 1, c[1]) && !hasCube(c[0], y, c[1]) && !hasCube(c[0], y + 1, c[1]); };
    const clear = (f, t, y0, y1) => { const c = lane8(f, t); for (let yy = Math.min(y0, y1) - 1; yy <= Math.max(y0, y1) + 2; yy++) if (hasCube(c[0], yy, c[1])) return false; return true; };
    for (let f = 0; f < 4; f++) for (let y = 2; y <= (LEVEL.pelY || 32) - 1; y++) for (let t = -8; t <= 8; t++) for (const d of [1, -1]) {
      if (out.length >= 12) break; if (!st8(f, t, y) || st8(f, t + d, y)) continue;
      let best = null; for (let k = 3; k <= 7 && !best; k++) { if (!clear(f, t + d * (k - 1), y, y)) break; for (const dy of [1, 2, 3, 4, -1, -2, -3, -4]) { if (k - 1 < Math.max(2, Math.abs(dy))) continue; if (st8(f, t + d * k, y + dy) && !st8(f, t + d * (k - 1), y + dy)) { best = { k, dy }; break; } } }
      if (!best) continue; const t0 = t + d * 0.5, t1 = t + d * (best.k - 0.5), lo = Math.min(t0, t1), hi = Math.max(t0, t1);
      let ok = true; for (let tt = Math.ceil(lo); tt <= Math.floor(hi) && ok; tt++) { if (!clear(f, tt, y, y + best.dy)) ok = false; if (busy(f, tt, y)) ok = false; }
      if (!ok || out.concat(wk.map(w => ({ f: w.f, t0: w.t0, t1: w.t1, y0: w.y, y1: w.y }))).some(s2 => s2.f === f && Math.abs((s2.t0 + s2.t1) / 2 - (t0 + t1) / 2) < 3.5 && Math.abs((s2.y0 + s2.y1) / 2 - (y + best.dy / 2)) < 3.5)) continue;
      if (R() < 0.7) { const S2 = { f, t0, y0: y, t1, y1: y + best.dy, r: 8 }, ld = stairPickLand(S2, (t2, y2) => { const c = lane8(f, t2); return hasCube(c[0], y2, c[1]) || stGearHit(c, y2); }); if (ld) out.push(Object.assign(S2, { land: ld })); } } }
  LEVEL.stairs = LEVEL.stairs.concat(out.slice(n0));
}
// ---- рисование (v288b, Алексей 24.10: «не похожа на референс, контур убрать, не совпадает с тайлами»): куски вырезаны с его листа
// (tex/Stairs.png, перекрашены под камень наших плиток): марш — один пролёт листа (ступень с куском перил и косоура), повторённый по диагонали;
// переход — левый край с кронштейном, середина (повторяется), правый край с кронштейном. Масштаб: точка листа = S/66 (ступень — треть куба).
const STAIRS_PX = { step: [0, 0, 7, 54], wL: [9, 0, 52, 56], wM: [63, 0, 22, 33], wR: [87, 0, 29, 49] };
const ST_TREAD = 26, ST_DX = 7, ST_DY = 7, WK_TOP = 14, ST_K = 1 / 33;   // v288c: пиксели нашего размера (куб — 33 точки), 3 тона   // где верх ступени в куске; шаг пролёта в точках листа; где верх настила
const stImg = () => { const I = img.Stairs; return I && I.width ? I : null; };
function stairGeom(L, b) {   // v290 (Алексей: «ступеньки по-идиотски стоят и поручень не в одну линию»): ступени всегда ровно 45°, как на листе —
  // пролёт ступеней = высоте; остаток пролёта — ровная площадка внизу (иногда с оранжевым огоньком: «пусть иногда будет, стильно»)
  const e = stairEnds(L, b), lowA = e.ya <= e.yb, uLo = lowA ? e.ua : e.ub, uHi = lowA ? e.ub : e.ua, yLo = Math.min(e.ya, e.yb), yHi = Math.max(e.ya, e.yb), dir = Math.sign(uHi - uLo) || 1, D = yHi - yLo;
  const run = Math.abs(uHi - uLo), sr = Math.min(run, D), n = Math.max(1, Math.round(sr / (ST_DX * ST_K))), flat = Math.max(0, run - sr);
  const hi = L.land === 'hi';   // площадка вверху (у верхней платформы) или внизу — генератор и редактор выбирают, где ступеням не мешают кубы
  return { e, uLo, uHi, yLo, yHi, dir, D, n, dxc: sr / n, dyc: D / n, flat, hi, sr, uS: hi ? uLo : uLo + dir * flat };
}
const stairSup = L => { const h = ((L.f | 0) * 7919 + Math.round(Math.min(num0s(L.y0), num0s(L.y1))) * 104729 + (L.r | 0) * 31) >>> 0; return (h % 5) < 2; };   // огонёк на площадке — у ~40% маршей
function stairTopAt2(L, u, b) {   // ровно внизу (площадка), дальше — наклон
  const g = stairGeom(L, b), lo = Math.min(g.uLo, g.uHi), hi = Math.max(g.uLo, g.uHi); if (u < lo - 0.15 || u > hi + 0.15) return null;
  const s = (Math.max(lo, Math.min(hi, u)) - g.uS) * g.dir; if (s <= 0) return g.yLo; return g.yLo + g.D * Math.min(1, (s + 0.5 * g.dxc) / Math.max(1e-6, g.sr));   // v291: наклон по серединам ступеней
}
function drawStairs(L, b) {
  const fc = stairFace(L, b); if (fc < 0.08) return; const I = stImg(); if (!I) return; const G = stairGeom(L, b), cu = cam.x * b.r[0] + cam.z * b.r[1], k = S * ST_K, X = u => W / 2 + (u - cu) * S, Y = y => H / 2 - (y - cam.y) * S;
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, fc / 0.4); ctx.save(); ctx.imageSmoothingEnabled = false;
  if (G.flat > 0.05) drawStairLanding(G, L, b, k, X, Y);
  const q = STAIRS_PX.step, P = G.dxc * S, sw = Math.ceil(P) + 1, sh = Math.round(q[3] * k);
  const bx = Math.round(G.dir > 0 ? X(G.uS) : X(G.uS) - sw), by = Math.round(Y(G.yLo + G.dyc) - ST_TREAD * k);   // v291 (Алексей: «где сверху лестница доходит до платформы, не хватает куска»): ступень i — на высоте (i+1) ступеней, верхняя вровень с площадкой   // v290: шаг по экрану — одно и то же целое вбок и вверх, перила в одну линию
  ctx.save(); ctx.beginPath(); ctx.rect(-10, -10, W + 20, Math.round(Y(G.yLo) + k) + 10);   /* v308 (Алексей: «у лестниц снизу торчат углы»): ниже пола — только над самой площадкой */
  if (G.flat > 0.05 && !G.hi) { const la = X(G.uLo), lb = X(G.uS); ctx.rect(Math.round(Math.min(la, lb)), Math.round(Y(G.yLo)), Math.round(Math.abs(lb - la)), Math.round(19 * k) + 1); }
  { const xs = X(G.uS), w1 = Math.ceil(P * 1.6) + 2; ctx.rect(Math.round(G.dir > 0 ? xs - 2 : xs - w1), Math.round(Y(G.yLo)), w1, sh + 2); }   /* v311 (Алексей: «снизу нет куска лестницы»): первая ступень целиком — срезаем только то, что дальше */
  ctx.clip();   // v291 (Алексей: «снизу лестница не стыкуется с платформой»): косоур не торчит ниже настила/пола
  for (let i = 0; i < G.n; i++) { const iP = Math.round(i * P), x0 = bx + G.dir * iP, y0 = by - iP;
    if (G.dir > 0) ctx.drawImage(I, q[0], q[1], q[2], q[3], x0, y0, sw, sh);
    else { ctx.save(); ctx.translate(x0 + sw, y0); ctx.scale(-1, 1); ctx.drawImage(I, q[0], q[1], q[2], q[3], 0, 0, sw, sh); ctx.restore(); } }
  ctx.restore();
  const covered = (u, y) => typeof stRails !== 'undefined' && stRails.some(q => q.f === ((L.f | 0) % 4 + 4) % 4 && Math.abs(q.y - y) < 0.2 && Math.abs(q.d - (L.r || 8)) < 0.6 && ((q.u0 - u) * (q.u1 - u) <= 0.01 || Math.min(Math.abs(q.u0 - u), Math.abs(q.u1 - u)) < 0.6) && Math.abs(stairFace(L, b)) > 0);
  if (!covered(G.uHi, G.yHi)) stairRailStub(G.uHi, G.yHi, G.dir, k, X, Y); if (!covered(G.uLo, G.yLo)) stairRailStub(G.uLo, G.yLo, -G.dir, k, X, Y);   // v291: «поручень на платформе, на которую приходит, резко обрывается» — продолжаем его на площадку
  drawStairMoss(G, L, b, k, X, Y, cu, by, P);
  ctx.restore(); ctx.globalAlpha = ga;
}
// v290 (Алексей 24.10: «на лестницах иногда должен быть мох, мох может быть соединителем»): у части маршей — мох на стыках
// (марш — площадка, марш — настил внизу/вверху): пиксельный ком в 2 тона по ступеням и краю площадки, с подтёками вниз
const ST_MOSS = ['#4a542a', '#707e3a'];
function stairHash(L, s) { let h = ((L.f | 0) * 73856093) ^ (Math.round(num0s(L.t0) * 2) * 19349663) ^ (Math.round(num0s(L.y0) * 2) * 83492791) ^ (s * 2654435761); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function drawStairMoss(G, L, b, k, X, Y, cu, by, P) {
  if (stairHash(L, 1) > 0.55) return;   // мох — примерно у половины маршей
  const pk = Math.max(1, Math.round(k)), surf = u => { const s = (u - G.uS) * G.dir; if (s < 0) return Y(G.yLo); if (s > G.sr) return Y(G.yHi);
    const i = Math.min(G.n - 1, Math.floor(s / G.dxc)); return by + ST_TREAD * k - Math.round(i * P); };
  const joins = []; joins.push(G.hi || G.flat < 0.05 ? G.uLo : G.uS); if (stairHash(L, 2) < 0.6) joins.push(G.hi ? G.uS + G.dir * G.sr : G.uHi); if (G.flat > 0.05 && stairHash(L, 3) < 0.5) joins.push(G.hi ? G.uHi : G.uLo);
  joins.forEach((u, j) => { const xc = Math.round(X(u) / pk) * pk, wL = 4 + Math.floor(stairHash(L, 10 + j) * 7), wR = 4 + Math.floor(stairHash(L, 20 + j) * 7);
    for (let c = -wL; c <= wR; c++) { const x = xc + c * pk, u2 = cu + (x + pk / 2 - W / 2) / S, ys = Math.round(surf(u2)), r = stairHash(L, 100 + j * 50 + c), edge = c === -wL || c === wR;
      const top = edge ? 1 : r < 0.3 ? 0 : 1; ctx.fillStyle = ST_MOSS[1]; ctx.fillRect(x, ys - top * pk, pk, pk);   // светлый верх (кое-где на пиксель выше)
      ctx.fillStyle = ST_MOSS[0]; const dn = edge ? 1 : 1 + (r > 0.75 ? 2 + Math.floor(r * 9) % 3 : r > 0.45 ? 1 : 0); ctx.fillRect(x, ys + (1 - top) * pk, pk, dn * pk); } });   // тёмный низ и подтёки
}
function drawStairRailRun(q, b, w) {   // v308: перила марша (поручень листа) вдоль уступа, стойки по краям — как на настиле
  const I = stImg(); if (!I) return; const k = S * ST_K, M = STAIRS_PX.wM, o = 4, N = SKIN_N[q.f], R2 = SKIN_R[q.f], P = u => ({ x: u * R2[0] + q.d * N[0], z: u * R2[1] + q.d * N[1] });
  const xa = Math.round(W / 2 + relU(P(q.u0), b) * S), xb = Math.round(W / 2 + relU(P(q.u1), b) * S), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), yT = Math.round(H / 2 - (q.y - cam.y) * S - (12 + o) * k), h = Math.round(12 * k), mw = M[2] * k;
  ctx.save(); ctx.globalAlpha *= Math.min(1, w / 0.4); ctx.imageSmoothingEnabled = false; ctx.beginPath(); ctx.rect(x0, yT - 2, x1 - x0, h + Math.round(o * k) + 4); ctx.clip();
  for (let x = x0 - 2; x < x1; x += mw - 1) ctx.drawImage(I, M[0], M[1], M[2], 12, Math.round(x), yT, Math.ceil(mw) + 1, h);
  const px = Math.max(1, Math.round(k)); for (const xp of [x0 + px, x1 - Math.round(3 * k)]) { ctx.fillStyle = 'rgb(84,77,82)'; ctx.fillRect(xp, yT + h - px, Math.round(2 * k), Math.round(o * k) + px); ctx.fillStyle = 'rgb(59,54,58)'; ctx.fillRect(xp + Math.round(2 * k), yT + h - px, px, Math.round(o * k) + px); }
  ctx.restore(); }
function stairRailStub(u, y, out, k, X, Y) {   // кусок перил настила (поручень и стойка на дальнем конце) на площадке у конца марша, вровень с поручнем марша
  const I = stImg(), M = STAIRS_PX.wM, o = 4, w = Math.round(M[2] * k), x = Math.round(X(u)), yT = Math.round(Y(y) - (12 + o) * k), h = Math.round(12 * k);
  ctx.save(); if (out < 0) { ctx.translate(2 * x, 0); ctx.scale(-1, 1); }
  ctx.drawImage(I, M[0], M[1], M[2], 12, x, yT, w, h);
  const px = Math.max(1, Math.round(k)), xp = x + Math.round(19 * k); ctx.fillStyle = 'rgb(84,77,82)'; ctx.fillRect(xp, yT + h - px, Math.round(2 * k), Math.round(o * k) + px);   // стойка до пола
  ctx.fillStyle = 'rgb(59,54,58)'; ctx.fillRect(xp + Math.round(2 * k), yT + h - px, px, Math.round(o * k) + px);
  ctx.restore();
}
function drawStairLanding(G, L, b, k, X, Y) {   // ровная площадка внизу марша: настил с перилами; иногда снаружи — край с оранжевым огоньком
  const I = stImg(), P2 = STAIRS_PX, len = G.flat * S, yTop = Math.round(Y(G.hi ? G.yHi : G.yLo) - WK_TOP * k), ua = G.hi ? G.uS + G.dir * G.sr : G.uLo, ub = G.hi ? G.uHi : G.uS, xa = Math.round(Math.min(X(ua), X(ub))), sup = stairSup(L);
  ctx.save(); ctx.beginPath(); ctx.rect(xa - 1, yTop - S, Math.round(len) + 2, S * 4); ctx.clip();
  if ((G.dir < 0) !== G.hi) { ctx.translate(2 * xa + Math.round(len), 0); ctx.scale(-1, 1); }   // марш вниз влево — площадка справа, зеркально
  const mw = P2.wM[2] * k, mh = Math.round(P2.wM[3] * k); for (let x = xa - 2; x < xa + len + 2; x += mw - 1) ctx.drawImage(I, P2.wM[0], P2.wM[1], P2.wM[2], P2.wM[3], Math.round(x), yTop, Math.ceil(mw) + 1, mh);
  if (sup) { const lw = Math.min(P2.wL[2] * k, len); ctx.drawImage(I, P2.wL[0], P2.wL[1], lw / k, P2.wL[3], xa, yTop, Math.round(lw), Math.round(P2.wL[3] * k)); }
  ctx.restore();
}
function drawWalkSpan(u0, len, y, b, noBr) {   // настил от u0 на len кубов, верх — y
  const I = stImg(); if (!I) return; const cu = cam.x * b.r[0] + cam.z * b.r[1], k = S * ST_K, X = u => W / 2 + (u - cu) * S, yTop = H / 2 - (y - cam.y) * S - WK_TOP * k, L = len * S;
  const P = STAIRS_PX, wl = P.wL[2] * k, wr = P.wR[2] * k, x0 = X(u0), x1 = x0 + L; ctx.save(); ctx.beginPath(); ctx.rect(x0 - 1, yTop - S, L + 2, S * 4); ctx.clip();
  for (let x = x0 + Math.min(wl, L / 2) - 2; x < x1 - (noBr ? 0 : Math.min(wr, L / 2)) + 2; x += P.wM[2] * k - 1) ctx.drawImage(I, P.wM[0], P.wM[1], P.wM[2], P.wM[3], Math.round(x), Math.round(yTop), Math.ceil(P.wM[2] * k) + 1, Math.round(P.wM[3] * k));
  const lw = Math.min(wl, noBr ? L : L / 2 + 2), rw = Math.min(wr, L / 2 + 2);   // края: короткий переход — края обрезаны посередине
  ctx.drawImage(I, P.wL[0], P.wL[1], lw / k, noBr ? P.wM[3] : P.wL[3], Math.round(x0), Math.round(yTop), Math.round(lw), Math.round((noBr ? P.wM[3] : P.wL[3]) * k));
  if (!noBr) ctx.drawImage(I, P.wR[0] + P.wR[2] - rw / k, P.wR[1], rw / k, P.wR[3], Math.round(x1 - rw), Math.round(yTop), Math.round(rw), Math.round(P.wR[3] * k));   // площадка у марша — без правого края (там ступени)
  ctx.restore();
}
function drawWalkway(W2, b) {
  const L = walkAsStair(W2), fc = stairFace(L, b); if (fc < 0.08) return; const e = stairEnds(L, b), ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, fc / 0.4);
  ctx.save(); ctx.imageSmoothingEnabled = false; drawWalkSpan(Math.min(e.ua, e.ub), Math.abs(e.ub - e.ua), num0s(W2.y), b, false); ctx.restore(); ctx.globalAlpha = ga;
}
// ====================== ЭКРАНЫ И ШЕСТЕРЁНКИ (ядро, v301) ======================
// Алексей 25.10: «новый вид пропсов — экраны, как ящики разбросаны вокруг, в 60% из них падает шестерёнка; при разбивании — искры и немного молнии,
// изнутри выпадает шестерёнка; из ботов — с таким же шансом; экраны, пока не разобьёшь, не статичны — шум в цвете того, что есть; из телика,
// как из лампочки, идёт свет; дым убрать». Лист автора вырезан tools/screens_cut.py → tex/Screens.png: 13 пар «целый / разбитый», 4 тона корпуса.
// Экран — это ящик (crates) с полем tv (номер вида): бьётся, как ящик, лежит в файле карты как ящик.
const TVD = {"rects":[{"i":[0,0,31,32],"b":[0,55,30,34]},{"i":[33,0,48,39],"b":[33,55,43,32]},{"i":[83,0,30,50],"b":[83,55,32,46]},{"i":[117,0,57,42],"b":[117,55,53,43]},{"i":[176,0,52,52],"b":[176,55,51,48]},{"i":[230,0,24,28],"b":[230,55,26,30]},{"i":[258,0,21,53],"b":[258,55,23,46]},{"i":[283,0,30,35],"b":[283,55,31,36]},{"i":[316,0,29,35],"b":[316,55,25,36]},{"i":[347,0,40,38],"b":[347,55,37,32]},{"i":[389,0,28,49],"b":[389,55,30,40]},{"i":[421,0,37,28],"b":[421,55,35,30]},{"i":[460,0,51,38],"b":[460,55,42,39]}],"scr":[[[5,6,14,13,0]],[[6,6,12,9,0],[24,6,12,9,0]],[[5,6,13,14,0],[6,29,8,8,2]],[[15,9,15,13,1],[47,20,3,4,2]],[[23,6,9,9,0],[21,22,9,9,1],[19,38,8,7,2]],[[6,7,8,8,0]],[[4,6,8,12,0]],[[5,9,12,12,0]],[[6,14,8,8,2]],[[8,10,11,11,0]],[[5,5,10,13,0]],[[7,7,7,7,0]],[[5,20,8,9,0],[19,20,8,7,0],[32,20,7,8,0]]]};
const TV_K = 1 / 42;   // точка листа = S/42
const TV_FAM = [['#5c1e4e', '#8e2a6e', '#c23a6a', '#e6504a', '#6d3196', '#b8306e'], ['#8e3a22', '#c8622a', '#ee9a36', '#ffd06a', '#b8452a'], ['#2e5a26', '#4f8a32', '#86c246', '#b8e070', '#3c7030']];
const TV_GLOW = ['230,70,120', '255,150,60', '140,220,90'];
const tvImg = () => { const I = img.Screens; return I && I.width ? I : null; };
const tvFrames = new Map();   // вид → 6 кадров шума (готовые картинки целого экрана)
function tvNoise(v) {
  let F = tvFrames.get(v); if (F) return F; const I = tvImg(); if (!I) return null; const R = TVD.rects[v].i; F = [];
  for (let f = 0; f < 6; f++) { const c = document.createElement('canvas'); c.width = R[2]; c.height = R[3]; const x = c.getContext('2d'); x.drawImage(I, R[0], R[1], R[2], R[3], 0, 0, R[2], R[3]);
    let d; try { d = x.getImageData(0, 0, R[2], R[3]); } catch (e) { F.push(c); continue; }
    const p = d.data;
    for (const s of TVD.scr[v]) { const P = TV_FAM[s[4]];
      for (let yy = s[1]; yy < s[1] + s[3]; yy++) { const band = Math.random(), lit = band < 0.2 ? 2 : band < 0.75 ? 1 : 0;   // полосы строк — как помехи
        for (let xx = s[0]; xx < s[0] + s[2]; xx++) { const k = (yy * R[2] + xx) * 4; if (!p[k + 3]) continue; const r0 = p[k], g0 = p[k + 1], b0 = p[k + 2]; if (Math.max(r0, g0, b0) - Math.min(r0, g0, b0) < 38) continue;   // только сам экран (не рамка)
          const q = Math.random(), hex = P[Math.min(P.length - 1, Math.floor((q * 0.6 + lit * 0.25) * P.length))]; p[k] = parseInt(hex.slice(1, 3), 16); p[k + 1] = parseInt(hex.slice(3, 5), 16); p[k + 2] = parseInt(hex.slice(5, 7), 16); } } }
    x.putImageData(d, 0, 0); F.push(c); }
  tvFrames.set(v, F); return F;
}
// v303 (Алексей: «пусть светит как лампочка, но свет ограничен экраном, а не снизу»): мягкое свечение вокруг самого экрана, размером с экран; на пол не ложится
function tvBeam(c, b, sx, sy, sw, sh, fy, fl, col) {
  const q = Math.max(2, Math.round(S * 0.026)) * 2, cx = sx + sw / 2, cy = sy + sh / 2;
  pixelGlow(cx, cy, Math.max(sw, sh) / S * 0.6 + 0.06, 0.05 * fl, col);   // ореол не шире экрана
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgb(' + col + ')'; ctx.globalAlpha = 0.14 * fl; ctx.fillRect(Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh));   // сам экран светится
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
const TV_SINK = 0.13;   // v302 (Алексей: «телики висят в воздухе»): ножками в мох у кромки пола
function drawTV(c, b) {
  const I = tvImg(); if (!I) return;
  { const fi = c.y > 2500 ? 0 : Math.abs(c.z) >= Math.abs(c.x) ? (c.z > 0 ? 0 : 2) : (c.x > 0 ? 1 : 3), N = FACE_N[fi], fc = N[0] * b.n[0] + N[1] * b.n[1];   // v302 (Алексей: «телевизоров не должно быть видно на краях карты»): только на стене лицом к нам
    if (fc < 0.7) return; ctx.globalAlpha = Math.min(1, (fc - 0.7) / 0.25); }
  const v = c.tv % TVD.rects.length, R = c.broken ? TVD.rects[v].b : TVD.rects[v].i, k = S * TV_K, w = Math.round(R[2] * k), h = Math.round(R[3] * k);
  const x0 = Math.round(W / 2 + relU(c, b) * S - w / 2 + (c.shake > 0 ? Math.sin(c.shake * 90) * k : 0)), y0 = Math.round(H / 2 - (c.y - cam.y) * S) - h + Math.round(TV_SINK * S);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  const clipF = () => { ctx.beginPath(); ctx.rect(0, 0, W, Math.round(H / 2 - (c.y - cam.y) * S)); ctx.clip(); };   /* v302 (Алексей: «телики наслаиваются на тайлы поверх, а должны позади»): низ уходит за кромку пола */
  if (!c.broken) { const s0 = TVD.scr[v][0]; 
    clipF(); const F = tvNoise(v); if (F) ctx.drawImage(F[(Math.floor(game.time * 11 + (c.ph || (c.ph = Math.abs(c.x * 3.7 + c.z * 1.3) % 6))) % 6 + 6) % 6], x0, y0, w, h); else ctx.drawImage(I, R[0], R[1], R[2], R[3], x0, y0, w, h);
    if (s0) { const fl = 0.85 + 0.15 * Math.sin(game.time * 23 + c.x * 3) * Math.sin(game.time * 7 + c.z), cx = x0 + (s0[0] + s0[2] / 2) * k, cy = y0 + (s0[1] + s0[3] / 2) * k;   // свет экрана — как от лампы, вперёд и вниз
      tvBeam(c, b, x0 + s0[0] * k, y0 + s0[1] * k, s0[2] * k, s0[3] * k, y0 + h - TV_SINK * S, fl, TV_GLOW[s0[4]]); } }
  else { clipF(); ctx.drawImage(I, R[0], R[1], R[2], R[3], x0, y0, w, h);
    if (c.zapT > 0 && Math.random() < 0.7) { const g = Math.max(1, Math.round(k));   // v302 (Алексей: «молнии звёздочкой из центра — по-идиотски; нужна парочка маленьких разрядов по бокам»): короткие дуги у боковых краёв корпуса
      for (const side of [-1, 1]) { if (Math.random() < 0.3) continue; let px = side < 0 ? x0 + 2 * g : x0 + w - 2 * g, py = y0 + h * (0.25 + Math.random() * 0.45); const n = 3 + Math.floor(Math.random() * 3);
        ctx.fillStyle = Math.random() < 0.5 ? '#e8f8ff' : '#7fd8ff';
        for (let s2 = 0; s2 < n; s2++) { const nx = px + side * (2 + Math.random() * 3) * g, ny = py + (Math.random() - 0.6) * 4 * g; const st = Math.max(1, Math.round(Math.hypot(nx - px, ny - py) / g));
          for (let q = 0; q <= st; q++) ctx.fillRect(Math.round(px + (nx - px) * q / st), Math.round(py + (ny - py) * q / st), g, g); px = nx; py = ny; }
        pixelGlow(px, py, 0.25, 0.12 * c.zapT, '140,220,255'); } } }
  ctx.restore(); ctx.globalAlpha = 1;
}
// v302 (Алексей: «когда телик разломан — через секунду и это можно разбить, чтобы не оставалось следов»)
function tvScrap(c, dir) { c.gone = true; c.zapT = 0; sfx('RobotHit5', 0.5, 0.9); sfx('RobotHit3', 0.4, 1.3);
  burst(c.x, c.y + 0.35, c.z, { n: 26, cols: ['#2a2630', '#3c3842', '#56525b', '#78747e', '#8e2a6e'], dir, sp: [1.2, 4.2], up: 1.6, life: 0.8, size: 2 });
  burst(c.x, c.y + 0.4, c.z, { n: 10, cols: ['#ffffff', '#ffd052', '#7fd8ff'], sp: [1, 3.5], up: 1, life: 0.35 }); }
function tvBreak(c) {   // экран разбит: искры, молнии, иногда шестерёнка
  c.brokeT = game.time; c.zapT = 0.6; if ((typeof dcHas === 'function' && dcHas('tvshock')) && hero.state !== 'dead' && Math.abs(toU(hero) - toU(c)) < 1.6 && Math.abs(hero.y - c.y) < 1.5) { if (!(hero.invuln > 0)) hurtHero(toU(c), 'экран бьёт током'); heroShock(0.7); }   /* v310 */ sfx('RobotHit5', 0.55, 1.4); sfx('RUN_1_13', 0.4, 2.4); if (typeof zapSound === 'function') zapSound(0.35, 0.25);
  burst(c.x, c.y + 0.45, c.z, { n: 22, cols: ['#ffffff', '#fff4c0', '#ffd052', '#7fd8ff', '#e8f8ff'], sp: [1.5, 5], up: 1.4, life: 0.5 });
  burst(c.x, c.y + 0.35, c.z, { n: 10, cols: ['#2a2630', '#4a4650', '#8e2a6e'], sp: [0.8, 2.6], up: 1, life: 0.6, size: 2 });
  if (Math.random() < (game.cogTest !== undefined ? game.cogTest : (typeof dcHas === 'function' && dcHas('cogs')) ? 0.3 : 0.6)) spawnCog(c.x, c.y + 0.5, c.z);
}
// ---- шестерёнки: валюта талантов. Крутится простая объёмная шестерёнка (как осколок), подлетает, падает, тянется к герою
let cogs = [];
// v303 (Алексей: «шестерёнки должны выпадать как осколки, только иконка шестерёнки; пусть персонаж их сам подбирает»): висит на месте, крутится плашкой, подбирается касанием
function spawnCog(x, y, z) { let yy = y; if (yy < 2500 || true) { const U = Math.round(toU({ x, z })), d = toD({ x, z }); for (let k = 0; k < 12; k++) { const fy = Math.floor(yy - 0.4) - k; if (floorCube(U, fy, d, 'any')) { yy = Math.min(yy, fy + 1 + 0.45); break; } } }
  cogs.push({ x, y: yy, z, t: 0, ph: Math.random() * 6, got: false }); }
function updateCogs(dt) { const hu = toU(hero), alive = hero.state !== 'dead' && !hero.inDoor;
  for (const o of cogs) { o.t += dt; if (o.got || !alive || o.t < 0.4) continue;
    if (Math.abs(toU(o) - hu) < 0.36 && Math.abs(toD(o) - toD(hero)) <= 1.1 && o.y > hero.y - 0.25 && o.y < hero.y + 0.9) { o.got = true; gotCog(o); } }
  cogs = cogs.filter(o => !o.got);
}
function gotCog(o) { if (typeof talAdd === 'function') talAdd(1); sfx('RUN_1_13', 0.45, 2.6); sfx('RobotHit3', 0.2, 2.4); burst(o.x, o.y, o.z, { n: 8, cols: ['#ffd06a', '#f2a63a', '#fff4c0'], sp: [0.8, 2.4], life: 0.4 }); popups.push({ x: o.x, y: o.y + 0.5, z: o.z, t: 0, text: '+1 ⚙', heal: true }); if (typeof updateHUD === 'function') updateHUD(); }
// v305 (Алексей: «меньше зубьев, примитивнее, вокруг круг, а не квадрат, светло-серая»): четыре зуба, толстый обод, круглое свечение
const COG_ICON = ['.....###.....', '.....###.....', '...#######...', '..#########..', '..###...###..', '####.....####', '####.....####', '####.....####', '..###...###..', '..#########..', '...#######...', '.....###.....', '.....###.....'];
function drawCog(o, b) {   // плоская иконка-шестерёнка, как осколок: появляется подскоком, покачивается и поворачивается плашкой
  const g = Math.max(2, Math.round(S * 0.019)), k = Math.abs(Math.cos(game.time * 3 + o.ph)), pop = o.t < 0.4 ? Math.sin(o.t / 0.4 * 3.1416) * 0.35 : 0;
  const px = Math.round(W / 2 + relU(o, b) * S), py = Math.round(H / 2 - (o.y + pop + 0.05 * Math.sin(game.time * 2.2 + o.ph) - cam.y) * S);
  pixelGlow(px, py, 0.32, 0.07 + 0.02 * Math.sin(game.time * 4 + o.ph), '230,232,240');
  const n = COG_ICON.length, c0 = (n - 1) / 2, sx = Math.max(1, Math.round(n * k)) / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (COG_ICON[y][x] !== '#') continue; const d = (x - c0) + (y - c0);
    ctx.fillStyle = d < -4 ? '#eceef2' : d > 4 ? '#8c8e98' : '#bfc2ca'; ctx.fillRect(px + Math.round((x - c0) * sx) * g - (g >> 1), py + (y - c0) * g - (g >> 1), g, g); }
}
// ---- генератор: экраны вдоль пути (как ящики), не у дверей, лестниц и ящиков
// v302 (Алексей: «не ставь телики у краёв — убого; пусть ближе к середине, особенно часто — внутри дверей»): снаружи — только где пол тянется
// минимум на куб в обе стороны и не дальше 5 от середины стены; внутри комнат (за дверями) — до 8 штук, снаружи — до 6
function placeScreens() { if (typeof window !== 'undefined' && window.__noTV) return;
  const R = rng(((LEVEL.seed | 0) + 7311) >>> 0), lane8 = (f, t) => [[t, 8], [8, -t], [-t, -8], [-8, t]][f % 4], out = [], inC = [], outC = [];
  const stand = (x, y, z) => hasCube(x, y - 1, z) && !hasCube(x, y, z) && !hasCube(x, y + 1, z);
  for (let f = 0; f < 4; f++) for (let y = 2; y <= (LEVEL.pelY || 32) - 1; y++) for (let t = -5; t <= 5; t++) { const c = lane8(f, t), a = lane8(f, t - 1), b = lane8(f, t + 1);
    if (stand(c[0], y, c[1]) && stand(a[0], y, a[1]) && stand(b[0], y, b[1])) outC.push([c[0], y, c[1], f, t]); }
  for (const k of cubes.values()) { if (k.y < 2500 || k.z !== ROOM_Z - 0 || k.kind === 'plat') continue; const x = k.x, y = k.y + 1, z = k.z;
    if (stand(x, y, z) && stand(x - 1, y, z) && stand(x + 1, y, z)) inC.push([x, y, z, 0, x]); }
  const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const near = (L, x, y, z, r, dy) => (L || []).some(o => o && o.x !== undefined && Math.abs(o.x - x) + Math.abs(o.z - z) < r && Math.abs(o.y - y) < dy);
  const ok = (x, y, z, f, t, room) => !out.some(o => Math.abs(o.x - x) + Math.abs(o.z - z) + Math.abs(o.y - y) < (room ? 3 : 4))
    && !near(LEVEL.crates, x, y, z, 1.5, 1.5) && !near(LEVEL.doors, x, y, z, 2, 2) && !near(LEVEL.grips, x, y, z, 1.5, 2) && !near(LEVEL.robots, x, y, z, 1.6, 1.5)
    && !near(LEVEL.traps, x, y, z, 1.6, 1.6) && !near(LEVEL.gears, x, y, z, 1.8, 2.5) && !near(LEVEL.keys, x, y, z, 1.2, 1.5) && !near(LEVEL.fires, x, y, z, 1.5, 1.5)
    && !(LEVEL.ladders || []).some(L => L.f % 4 === f && Math.abs(L.t - t) < 1.5 && y >= L.y0 - 1 && y <= L.y1 + 1 && (room ? 1 : 1))
    && !(LEVEL.stairs || []).some(L => L.f % 4 === f && t >= Math.min(L.t0, L.t1) - 1 && t <= Math.max(L.t0, L.t1) + 1 && y >= Math.min(L.y0, L.y1) - 1 && y <= Math.max(L.y0, L.y1) + 1);
  let nIn = 0, nOut = 0;
  { const per = new Map();   // v303 (Алексей: «внутри за дверями телики не нашёл — там их должно быть больше»): в каждом помещении 2–3
    for (const [x, y, z, f, t] of shuf(inC)) { const C = complexAt(y); if (!C || /Кабина/.test(C.name || '')) continue; const n = per.get(C) || 0, cap = /Таз|Шахта|Подошва/.test(C.name || '') ? 3 : 2; if (n >= cap) continue;
      if (!ok(x, y, z, f, t, true)) continue; out.push({ x, y, z, tv: Math.floor(R() * TVD.rects.length) }); per.set(C, n + 1); nIn++; } }
  for (const [x, y, z, f, t] of shuf(outC)) { if (nOut >= 6) break; if (!ok(x, y, z, f, t, false)) continue; out.push({ x, y, z, tv: Math.floor(R() * TVD.rects.length) }); nOut++; }
  LEVEL.crates.push(...out);
}

// v301: таланты, нужные ядру (сами таланты — 15e_talents.js, в игре)
const armorCap = () => Math.max(1, 4 + (typeof talHas === 'function' && talHas('s2') ? 1 : 0) - ((typeof dcHas === 'function' && dcHas('armor')) ? 2 : 0)), shardLife = () => (typeof talHas === 'function' && talHas('s3') ? 8 : 10);

// v303 (Алексей: «предметы и тайлы, которые не близко к краю или не на этой стороне карты, не должны быть видны — выходит мешанина»):
// у предмета у стены своя сторона — та, от которой за ним стена. Лицом к нам — виден; на боковой стороне — только у самого угла (стена в нашу сторону
// кончается за куб-два); дальше по боковой стене — не рисуем. Предметы в воздухе без стены и в комнатах — как раньше.
function objFaces(o) { if (o._F && o._F.x === o.x && o._F.y === o.y && o._F.z === o.z) return o._F.L; const X = Math.round(o.x), Y = Math.floor(o.y + 0.2), Z = Math.round(o.z), L = [];
  for (let f = 0; f < 4; f++) { const N = FACE_N[f]; if (hasCube(X - N[0], Y, Z - N[1]) || hasCube(X - N[0], Y + 1, Z - N[1])) L.push(f); }
  o._F = { x: o.x, y: o.y, z: o.z, L }; return L; }
function sideVis(o, b) { if (!o || o.y > 2500 || o.armP) return 1; const L = objFaces(o); if (!L.length) return 1; const B = b || view, X = Math.round(o.x), Y = Math.floor(o.y + 0.2), Z = Math.round(o.z);
  const A = Math.abs(B.n[0]) > Math.abs(B.n[1]) ? [Math.sign(B.n[0]), 0] : [0, Math.sign(B.n[1])]; let v = 0;
  for (const f of L) { const N = FACE_N[f], dot = N[0] * B.n[0] + N[1] * B.n[1];
    if (dot > 0.35) v = Math.max(v, Math.min(1, (dot - 0.35) / 0.3));
  }   /* v305 (Алексей: «ящик сбоку, ещё и левитирует; повернёшь — далеко, но виден с краю»): на боковой стороне не рисуем совсем, даже у угла */
  return v; }
// ====================== КАМЕРЫ-НАБЛЮДАТЕЛИ ======================
// v305 (Алексей 25.10: «новый моб — камера: висит в углах, чтобы усложнить проход; красным светом-треугольником светит, водит взглядом справа налево
// и слева направо, с задержками в разных местах; попал под свет — на героя напрыгивают 3 агрессивных бота»). Как камеры в Mark of the Ninja и Metal Gear:
// конус ходит туда-сюда, на краях и иногда посередине замирает; герой в конусе — короткое предупреждение (конус мигает, писк), не ушёл — тревога.
// После тревоги камера «остывает» 7 с (луч погашен). Лист автора вырезан tools/camera_cut.py → tex/Camera.png; кадры от взгляда влево до взгляда вправо.
const CAM_FR = [[0,0,32,48],[34,0,31,48],[100,0,31,48],[386,0,28,46],[292,0,31,46],[325,0,29,45],[165,0,30,48],[230,0,29,48]];
const CAM_K = 1 / 72, CAM_A = 1.05, CAM_HALF = 0.23, CAM_LEN = 7.5;   // масштаб (кубов на пиксель листа), размах взгляда (рад от «вниз»), полуширина конуса, дальность
let cams = [];
function spawnCams() { cams = (LEVEL.cams || []).map(c => ({ len: typeof dcHas === 'function' && dcHas('cams') ? CAM_LEN * 1.45 : CAM_LEN, x: c.x, y: c.y, z: c.z, f: c.f, ay: c.ay, lo: (c.s || 0) * 0.4 - 0.75, hi: (c.s || 0) * 0.4 + 0.75, a: (c.s || 0) * 0.4 + ((c.ph || 0) - 0.5), dir: 1, st: 'sweep', t: 0, hold: 0.5, see: 0, q: [], rays: null })); }
const camFace = (c, b) => { const N = FACE_N[c.f], B = b || view; return N[0] * B.n[0] + N[1] * B.n[1]; };
// лучи конуса в координатах экрана (u, y): от глаза до первого куба в ряду камеры или ближе к нам
// v306 (Алексей: «свет должен быть именно из „ока“, где оранжевое»): вершина конуса — в зрачке, а он поворачивается вместе со взглядом
function camEye(c) { const lon = Math.round(c.a * 12) / 12 * 0.95, lat = -0.32; return { u: toU(c) + Math.sin(lon) * Math.cos(lat) * 12 * CAM_K, y: c.y - Math.sin(-lat) * 12 * CAM_K }; }
function camRays(c) { const E = camEye(c), u0 = E.u, y0 = E.y, d = toD(c), R = [];
  for (let i = 0; i <= 8; i++) { const a = c.a - CAM_HALF + 2 * CAM_HALF * i / 8, du = Math.sin(a), dy = -Math.cos(a); let L = 0.35;
    for (; L < (c.len || CAM_LEN); L += 0.12) { const u = u0 + du * L, y = y0 + dy * L, cl = cellAt(Math.round(u), Math.floor(y)); if (cl && cl[0].dep >= d - 0.5) break; }
    R.push({ a, L, u: u0 + du * L, y: y0 + dy * L }); }
  return R; }
// v306 (Алексей: «свет пусть озаряет ботов и героя красным, когда они в зоне»): кто в конусе — подсвечен красным
function inCamCone(c, u, y, d) { const R = c.rays; if (!R || c.st === 'cool' || Math.abs(d - toD(c)) > 1.2) return false; const E = camEye(c), u0 = E.u, y0 = E.y, du = u - u0, dy = y - y0, dist = Math.hypot(du, dy), da = Math.atan2(du, -dy) - c.a;
  if (Math.abs(da) > CAM_HALF) return false; const i = Math.max(0, Math.min(8, Math.round((da + CAM_HALF) / (2 * CAM_HALF) * 8))); return dist < R[i].L + 0.1; }
function camLitAt(u, y, d) { for (const c of cams) if (inCamCone(c, u, y, d)) return c.st === 'sweep' ? 1 : 1.6; return 0; }
function drawCamLit(e, b, u, y, k) { const X = Math.round(W / 2 + relU(e, b) * S), Y = Math.round(H / 2 - (y - cam.y) * S); pixelGlow(X, Y, 0.5, 0.11 * k, '255,40,30'); pixelGlow(X, Y, 0.3, 0.1 * k, '255,70,50'); }
function camSees(c) { if (hero.state === 'dead' || hero.inDoor || hero.hideN || hero.sneakT > 0 || inRoom() || Math.abs(toD(hero) - toD(c)) > 1.2) return false;
  const R = c.rays; if (!R) return false; const E = camEye(c), u0 = E.u, y0 = E.y;
  for (const hy of [0.25, 0.75]) { const du = toU(hero) - u0, dy = hero.y + hy - y0, dist = Math.hypot(du, dy), a = Math.atan2(du, -dy), da = a - c.a;
    if (Math.abs(da) > CAM_HALF) continue; const i = Math.max(0, Math.min(8, Math.round((da + CAM_HALF) / (2 * CAM_HALF) * 8))); if (dist < R[i].L + 0.1) return true; }
  return false; }
function updateCams(dt) {
  for (const c of cams) {
    for (let i = c.q.length - 1; i >= 0; i--) { c.q[i] -= dt; if (c.q[i] <= 0) { c.q.splice(i, 1); if (typeof spawnHunter === 'function' && spawnHunter(true)) (c.rq = c.rq || []).push(robots[robots.length - 1]); } }   // боты тревоги — по очереди
    if (c.rq) for (let i = c.rq.length - 1; i >= 0; i--) { const r = c.rq[i]; if (r.dead) { c.rq.splice(i, 1); continue; } if (!r.atk && typeof enrage === 'function') { enrage(r); r.fierce = true; c.rq.splice(i, 1); } }   /* v306 (Алексей: «прибывают те, что агрессивные и потом взрываются»): приземлился — взбешён */
    const on = camFace(c) > 0.9 && !view.rotating && Math.abs(c.y - cam.y) < H / S / 2 + 4 && Math.abs(relU(c, view)) < W / S / 2 + 4;
    if (c.st === 'cool') { c.t -= dt; if (c.t <= 0) { c.st = 'sweep'; c.hold = 0.6; } continue; }
    if (c.st === 'sweep') {
      if (c.hold > 0) c.hold -= dt;
      else { const sp = 0.75 * dt; c.a += c.dir * sp;
        if (c.mid !== undefined && (c.a - c.mid) * c.dir >= 0) { c.hold = 0.45 + Math.random() * 0.5; c.mid = undefined; }   // замер посреди взмаха
        if (c.a >= c.hi || c.a <= c.lo) { c.a = Math.max(c.lo, Math.min(c.hi, c.a)); c.dir = c.a >= c.hi ? -1 : 1; c.hold = 0.6 + Math.random() * 0.8; if (Math.random() < 0.4) c.mid = c.lo + 0.2 + Math.random() * (c.hi - c.lo - 0.4); } } }
    c.rays = on ? camRays(c) : null;
    if (!on) { if (c.st === 'warn') c.st = 'sweep'; c.see = 0; continue; }
    const seen = camSees(c);
    if (c.st === 'sweep' && seen) { c.st = 'warn'; c.t = 0.45; c.hold = 9; if (typeof sfx === 'function') sfx('RobotHit3', 0.35, 2.6); }
    else if (c.st === 'warn') { c.t -= dt; if (!seen) { c.st = 'sweep'; c.hold = 0.5; }
      else if (c.t <= 0) { c.st = 'alarm'; c.t = 1.2; c.q = [0.05, 0.4, 0.75]; if (typeof sfx === 'function') { sfx('RobotHit5', 0.5, 2.2); sfx('RobotHit3', 0.5, 2.9); } if (typeof showCombo === 'function') showCombo('Камера тебя заметила!', true); if (typeof plog === 'function') plog('камера', 'тревога: 3 бота'); } }
    else if (c.st === 'alarm') { c.t -= dt; if (c.t <= 0) { c.st = 'cool'; c.t = 7; } }
  }
}
function drawCamCone(c, b) { if (!c.rays || c.st === 'cool') return; const bx = W / 2 + (relU(c, b) - toU(c)) * S, X = u => bx + u * S, Y = y => H / 2 - (y - cam.y) * S, R = c.rays, E = camEye(c), u0 = E.u, y0 = E.y;
  const fl = c.st === 'alarm' ? (Math.sin(game.time * 30) > 0 ? 1 : 0.45) : c.st === 'warn' ? (Math.sin(game.time * 40) > 0 ? 0.9 : 0.5) : 0.55 + 0.05 * Math.sin(game.time * 3);
  const col = c.st === 'sweep' ? '255,50,40' : '255,30,20';
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.moveTo(X(u0), Y(y0)); for (const r of R) ctx.lineTo(X(r.u), Y(r.y)); ctx.closePath();
  const gr = ctx.createRadialGradient(X(u0), Y(y0), 0, X(u0), Y(y0), (c.len || CAM_LEN) * S); gr.addColorStop(0, 'rgba(' + col + ',' + (0.4 * fl) + ')'); gr.addColorStop(1, 'rgba(' + col + ',' + (0.09 * fl) + ')'); ctx.fillStyle = gr; ctx.fill();
  const g = Math.max(1, Math.round(S / 50)); ctx.fillStyle = 'rgba(' + col + ',' + (0.35 * fl) + ')'; for (const r of [R[0], R[8]]) { const n = Math.ceil(r.L * S / (g * 2)); for (let k = 0; k < n; k++) { const t = k / n; ctx.fillRect(Math.round(X(u0 + (r.u - u0) * t)), Math.round(Y(y0 + (r.y - y0) * t)), g, g); } }   // край конуса — пунктиром
  for (const r of R) pixelGlow(X(r.u), Y(r.y), 0.2, 0.05 * fl, col);   // пятно там, куда упал свет
  ctx.restore(); }
// v305b (Алексей: «камеру обрезал кусками — это круг, а он жёваный; перерисуй на основе этих спрайтов»): камера рисуется сама, по мотивам листа —
// гладкая сфера с тенью, тёмный глазок с оранжевым зрачком поворачивается туда, куда смотрит конус; шов-меридиан, штырь сверху, гранёный хвост снизу
const CAM_W = 30, CAM_H = 46, camSprC = new Map();
function camSprite(a) { const key = Math.round(a * 12); let cv = camSprC.get(key); if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = CAM_W; cv.height = CAM_H; const x = cv.getContext('2d'), P = (px, py, col) => { x.fillStyle = col; x.fillRect(px, py, 1, 1); };
  const cx = 14.5, cy = 19.5, R = 12, lon = key / 12 * 0.95, lat = -0.32, ld = [Math.sin(lon) * Math.cos(lat), -Math.sin(lat), Math.cos(lon) * Math.cos(lat)], Lg = [-0.5, -0.62, 0.6];
  const TONE = ['#5e5662', '#8a8188', '#a89fa4'];
  for (let py = 0; py < 8; py++) { P(14, py, '#2c2632'); P(15, py, '#463e4c'); }   // штырь-крепление
  P(13, 7, '#2c2632'); P(16, 7, '#2c2632');
  for (let py = 29; py < CAM_H; py++) { const hw = Math.max(0.6, 7.5 * (1 - (py - 29) / 17)); for (let px = Math.floor(cx - hw); px <= Math.ceil(cx + hw - 1); px++) { const f = (px - (cx - hw)) / (2 * hw); P(px, py, f < 0.45 ? '#463e4c' : '#2c2632'); } }   // гранёный хвост
  for (let py = 0; py < CAM_H; py++) for (let px = 0; px < CAM_W; px++) { const dx = (px + 0.5 - cx) / R, dy = (py + 0.5 - cy) / R, r2 = dx * dx + dy * dy; if (r2 > 1) continue;
    const nz = Math.sqrt(1 - r2), n = [dx, dy, nz], dif = Math.max(0, n[0] * Lg[0] + n[1] * Lg[1] + n[2] * Lg[2]);
    let col = dif > 0.78 ? TONE[2] : dif > 0.4 ? TONE[1] : TONE[0];   /* v305c (Алексей: «слишком много градиента — у нас два-три тона»): три тона */
    const dl = n[0] * ld[0] + n[1] * ld[1] + n[2] * ld[2];
    const lonP = Math.atan2(n[0], n[2]), seam = Math.abs(Math.sin(lonP - lon)) > 0.985 && Math.abs(dy) < 0.93 && r2 < 0.8;   // шов поперёк взгляда
    if (seam) col = TONE[0];
    if (dl > 0.88) col = dl > 0.985 ? '#f07a28' : '#28202c';   // глазок: тёмное стекло и оранжевый зрачок — два тона
    P(px, py, col); }
  camSprC.set(key, cv); return cv; }
function drawCam(c, b) { const fc = camFace(c, b); if (fc < 0.6) return;
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, (fc - 0.6) / 0.3); ctx.imageSmoothingEnabled = false;
  const I = camSprite(c.a), k = S * CAM_K, w = Math.round(CAM_W * k), h = Math.round(CAM_H * k);
  const cx = Math.round(W / 2 + relU(c, b) * S), cy = Math.round(H / 2 - (c.y - cam.y) * S), top = cy - Math.round(19.5 * k), g = Math.max(1, Math.round(k));
  const ay = Math.round(H / 2 - (c.ay - cam.y) * S);   // крепление: штанга до потолка или кронштейн
  if (top > ay) { ctx.fillStyle = '#2a2430'; ctx.fillRect(cx - g, ay, 2 * g, top - ay + g); ctx.fillStyle = '#4a4250'; ctx.fillRect(cx - g, ay, g, top - ay); ctx.fillStyle = '#2a2430'; ctx.fillRect(cx - 3 * g, ay, 6 * g, 2 * g); }
  ctx.drawImage(I, 0, 0, CAM_W, CAM_H, cx - Math.round(w / 2), top, w, h);
  if (c.st !== 'cool') { const lit = c.st === 'sweep' ? 0.12 : 0.25, E = camEye(c); pixelGlow(Math.round(W / 2 + (relU(c, b) + E.u - toU(c)) * S), Math.round(H / 2 - (E.y - cam.y) * S), 0.12, lit, '255,110,40'); }
  ctx.globalAlpha = ga; }
// ---- генератор: в углах сторон ноги (у края, t = ±6..7) и на концах уступов груди; под камерой — дорожка, над ней — воздух
function placeCams() { if (typeof window !== 'undefined' && window.__noCam) return;
  const R = rng(((LEVEL.seed | 0) + 5151) >>> 0), lane8 = (f, t) => [[t, 8], [8, -t], [-t, -8], [-8, t]][f % 4], cand = [];
  const stand = (x, y, z) => hasCube(x, y - 1, z) && !hasCube(x, y, z) && !hasCube(x, y + 1, z), air = (x, y, z) => !hasCube(x, y + 2, z) && !hasCube(x, y + 3, z);
  for (let f = 0; f < 4; f++) for (let y = 5; y <= (LEVEL.pelY || 32) - 4; y++) for (const t of [-7, -6, 6, 7]) { const c = lane8(f, t), s = -Math.sign(t), n1 = lane8(f, t + s), n2 = lane8(f, t + 2 * s);
    if (stand(c[0], y, c[1]) && air(c[0], y, c[1]) && stand(n1[0], y, n1[1]) && stand(n2[0], y, n2[1])) cand.push({ x: c[0], y, z: c[1], f, t, leg: true, s }); }
  if (LEVEL.torsoPath) for (const q of LEVEL.torsoPath) { if (q.b - q.a < 2) continue; for (const t of [q.a, q.b]) if (stand(12, q.top, -t) && air(12, q.top, -t)) cand.push({ x: 12, y: q.top, z: -t, f: 1, t, leg: false, s: t === q.a ? 1 : -1 }); }
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const out = [], nLeg = Math.min(16, 3 + (game.level || 1) + (typeof dcHas === 'function' && dcHas('cams') ? 6 : 0)), nT = typeof dcHas === 'function' && dcHas('cams') ? 4 : 2; let a = 0, bT = 0;
  const near = (L, o, r, dy) => (L || []).some(q => q && q.x !== undefined && Math.abs(q.x - o.x) + Math.abs(q.z - o.z) < r && Math.abs(q.y - o.y) < dy);
  for (const o of cand) { if (o.leg ? a >= nLeg : bT >= nT) continue;
    if (out.some(q => Math.abs(q.x - o.x) + Math.abs(q.z - o.z) + Math.abs(q.y - o.y) < (typeof dcHas === 'function' && dcHas('cams') ? 4.5 : 8))) continue;
    if (near(LEVEL.doors, o, 2.5, 3) || near(LEVEL.lamps, { x: o.x, y: o.y + 2.5, z: o.z }, 1.6, 2) || near(LEVEL.grips, { x: o.x, y: o.y + 2.5, z: o.z }, 1.2, 1.5) || near(LEVEL.steams, o, 1.5, 4)) continue;
    if ((LEVEL.ladders || []).some(L => L.f % 4 === o.f && Math.abs(L.t - o.t) < 1.5 && o.y + 3 > L.y0 && o.y < L.y1 + 1)) continue;
    let ay = o.y + 3.4; for (let Y = o.y + 4; Y <= o.y + 6; Y++) if (hasCube(o.x, Y, o.z)) { ay = Y; break; }   // штанга до потолка, если он близко
    out.push({ x: o.x, y: o.y + 2.55, z: o.z, f: o.f, ay, ph: R(), s: o.s }); if (o.leg) a++; else bT++; }   // s — куда «внутрь» стороны: туда камера в основном и смотрит
  LEVEL.cams = out;
}
// ====================== ГИДРАНТЫ ======================
// v307 (Алексей 25.10: «гидранты (нижний ряд листа, кроме самого левого и не-гидрантов посередине); спавнится всегда рядом с огнём из трубы,
// не слишком близко, но так, чтобы можно было ударить; из него идёт горизонтальная струя и на время гасит огонь, через секунд пять огонь снова полыхает»).
// Лист вырезан tools/hydrants_cut.py → tex/Hydrants.png (7 видов). Гидрант — «ящик» с полем hyd: его бьют те же удары, но он не ломается.
const HYD_NOZ = [[1, 13.0, 31.5], [1, 13.0, 28.5], [1, 9.5, 33.5], [-1, 7.5, 35.0], [1, 7.5, 21.0], [1, 11.0, 27.3], [1, 6.5, 28.0]];   // v308: где у вида выход воды: сторона листа, от середины вбок и от низа вверх (пикс. листа)
const HYD_R = [[0, 1, 26, 49], [28, 3, 26, 47], [56, 0, 19, 50], [77, 7, 15, 43], [94, 17, 15, 33], [111, 4, 22, 46], [135, 13, 13, 37]], HYD_K = 1 / 46, HYD_OUT = 5;
// ---- генератор: у каждого огня на уступе — гидрант в 3 клетках (если нельзя — в 2) по той же стене, между ними пусто, чтобы струя дошла
function placeHydrants() { if (typeof window !== 'undefined' && window.__noHyd) return;
  const R = rng(((LEVEL.seed | 0) + 6262) >>> 0), out = [], stand = (x, y, z) => hasCube(x, y - 1, z) && !hasCube(x, y, z) && !hasCube(x, y + 1, z);
  const near = (L, x, y, z, r, dy) => (L || []).some(o => o && o.x !== undefined && Math.abs(o.x - x) + Math.abs(o.z - z) < r && Math.abs(o.y - y) < dy);
  for (const f of LEVEL.fires || []) { const X = Math.round(f.x), Y = Math.round(f.y), Z = Math.round(f.z), F = objFaces({ x: f.x, y: f.y, z: f.z }), axes = [];
    if (F.length) { for (const fi of F) { const N = FACE_N[fi]; axes.push([N[1], -N[0]]); } } else axes.push([1, 0], [0, 1]);
    let best = null;
    for (const [d, strict] of [[3, 1], [2, 1], [4, 1], [3, 0], [2, 0], [4, 0], [1, 1]]) { for (const A of axes) for (const sg of R() < 0.5 ? [1, -1] : [-1, 1]) { if (best) break; const x = X + A[0] * d * sg, z = Z + A[1] * d * sg;
        if (!stand(x, Y, z)) continue; let clear = true; for (let k = 1; k < d; k++) if (strict ? !stand(X + A[0] * k * sg, Y, Z + A[1] * k * sg) : hasCube(X + A[0] * k * sg, Y, Z + A[1] * k * sg)) clear = false;   /* между огнём и гидрантом — сплошной пол: можно подойти, струя идёт над полом */ if (!clear) continue;
        const plain = o => o.tv === undefined && o.hyd === undefined && !o.key && !o.loot && !o.item && !o.gate, blk = (LEVEL.crates || []).filter(o => Math.abs(o.x - x) + Math.abs(o.z - z) < 1.2 && Math.abs(o.y - Y) < 1.2);
        if (blk.some(o => !plain(o)) || near(out, x, Y, z, 1.2, 1.2) || near(LEVEL.doors, x, Y, z, 1.6, 2) || near(LEVEL.keys, x, Y, z, 1, 1.5)) continue;
        if ((LEVEL.ladders || []).some(L => Math.abs(L.y0 - Y) < 1.5 && Math.abs(lanePosR(L.f, L.t, L.r || 8)[0] - x) + Math.abs(lanePosR(L.f, L.t, L.r || 8)[1] - z) < 1.2)) continue;
        best = { kill: blk, x, y: Y, z, hyd: Math.floor(R() * HYD_R.length), hx: -A[0] * sg, hz: -A[1] * sg }; }
      if (best) break; }
    if (best) { if (best.kill.length) LEVEL.crates = LEVEL.crates.filter(o => !best.kill.includes(o)); delete best.kill; out.push(best); } }   // простой ящик на нужном месте уступает место гидранту
  LEVEL.crates.push(...out);
}
// ---- удар по гидранту: струя вбок, к огню
function hydSpray(c, hd) { c.kick = 0.9; c.kickDir = hd || 1; if (c.cd > 0) return; c.cd = 1.2; c.spray = { t: 0, L: 0 }; c.shake = 0.15; sfx('RUN_1_13', 0.5, 0.55); sfx('RobotHit3', 0.3, 0.8);
  burst(c.x, c.y + 0.5, c.z, { n: 8, cols: ['#bfeaf2', '#5fc3dc', '#eefcff'], sp: [1, 3], up: 1.2, life: 0.4 }); }
function hydDir(c) { return Math.sign(c.hx * view.r[0] + c.hz * view.r[1]) || 1; }   // куда бьёт струя на экране (по u)
function updateHydrants(dt) {
  for (const c of crates) { if (c.hyd === undefined) continue; if (c.cd > 0) c.cd -= dt; if (c.kick > 0) c.kick -= dt; const S0 = c.spray; if (!S0) continue; S0.t += dt;
    const NZ = HYD_NOZ[c.hyd % HYD_NOZ.length], dir = hydDir(c), u0 = toU(c) + dir * NZ[1] * HYD_K, d = toD(c), y = c.y + 0.06 + NZ[2] * HYD_K, along = Math.abs(c.hx * view.r[0] + c.hz * view.r[1]) > 0.5;
    if (S0.t < 1.3) { let L = Math.min(4.5, S0.t * 14); for (let s = 0.2; s <= L; s += 0.1) if (hasCube(Math.round(c.x + c.hx * s), Math.floor(y), Math.round(c.z + c.hz * s))) { L = s; break; } S0.L = L; }
    else S0.L = Math.max(0, S0.L - dt * 10);
    if (S0.t > 1.8) { c.spray = null; continue; }
    const tipX = c.x + c.hx * (S0.L + NZ[1] * HYD_K), tipZ = c.z + c.hz * (S0.L + NZ[1] * HYD_K);
    for (const f of fires) { if (!f.trap || f.delay > 0) continue; const k = (f.x - c.x) * c.hx + (f.z - c.z) * c.hz, side = Math.abs((f.x - c.x) * c.hz - (f.z - c.z) * c.hx);
      if (k > 0 && k <= S0.L + 0.5 && side < 0.6 && Math.abs(f.y - c.y) < 1) { f.delay = HYD_OUT; f.hydOut = true; sfx('RUN_1_13', 0.6, 0.45);   // погасил: пар и шипение
        burst(f.x, f.y + 0.4, f.z, { n: 18, cols: ['#d8dde2', '#b8c0c8', '#eef2f5', '#8a8f96'], sp: [0.4, 1.6], up: 1.8, g: 0, drag: 1.5, life: 1.1, size: 2 }); if (typeof showCombo === 'function') showCombo('Огонь потушен — ненадолго', true); } }
    if (hero.state !== 'dead' && S0.t < 1.3 && Math.hypot(hero.x - c.x, hero.z - c.z) < 1.25 && Math.abs(hero.y - c.y) < 0.8) { hero.wetDrip = Math.max(hero.wetDrip || 0, 2.5); if (typeof dcHas === 'function' && dcHas('poison')) heroPoison(6); }   /* v313 (Алексей: «гидрант не отравляет»): брызги задевают и того, кто ударил */
    if (hero.state !== 'dead' && along && Math.abs(toD(hero) - d) < 0.9) { const k = (toU(hero) - u0) * dir; if (k > -0.2 && k < S0.L && Math.abs(hero.y + 0.4 - y) < 0.6) { hero.wetDrip = Math.max(hero.wetDrip || 0, 2.5); if (typeof dcHas === 'function' && dcHas('poison')) heroPoison(6); if (hero.burn > 0) { hero.burn = 0; if (typeof showCombo === 'function') showCombo('Пламя сбито', true); } } }
    for (const r of robots) if (!r.dead && Math.abs(toD(r) - d) < 0.9) { const k = (toU(r) + (r.sh || 0) - u0) * dir; if (k > -0.2 && k < S0.L && Math.abs(r.y + 0.4 - y) < 0.7) { if (r.burn > 0) r.burn = 0; r.wet = 2.5; } }
    if (Math.random() < dt * 40 && S0.L > 0.3) parts.push({ x: tipX, y: y + rnd(-0.05, 0.08), z: tipZ, vx: c.hx * rnd(0.5, 2), vz: c.hz * rnd(0.5, 2), vy: rnd(0.3, 1.5), g: 9, drag: 1, t: 0, life: rnd(0.25, 0.5), size: Math.random() < 0.4 ? 2 : 1, col: pick(['#bfeaf2', '#5fc3dc', '#eefcff']) }); }
  for (const f of fires) if (f.hydOut && !(f.delay > 0)) { f.hydOut = false; sfx('RobotDeathD', 0.35, 1.6);   // через 5 с — снова полыхает
    burst(f.x, f.y + 0.3, f.z, { n: 16, cols: ['#ffce46', '#ff7014', '#fff3c4', '#e8501a'], sp: [1, 3.2], up: 1.6, life: 0.5 }); }
}
function drawHydrant(c, b) { const I = img.Hydrants; if (!I || !I.width) return; const r = HYD_R[c.hyd % HYD_R.length], k = S * HYD_K, w = Math.round(r[2] * k), h = Math.round(r[3] * k);
  const fl0 = Math.round(H / 2 - (c.y - cam.y) * S), dir = hydDir(c), S0 = c.spray, on = S0 && S0.t < 1.3;
  // v308 (Алексей: «когда бьёшь — сделай явнее, что он двигается»): от удара сплющивается, качается и подпрыгивает; пока бьёт струя — дрожит и откатывается отдачей
  // v309 (Алексей: «пусть шевелится не весь — низ неподвижен, удар гнёт его по направлению удара, он привязан фундаментом»): низ стоит, верх качается как пружина
  const t = 0.9 - Math.max(0, c.kick || 0), amp = c.kick > 0 ? 0.2 * S * Math.exp(-t * 5) * Math.sin(t * 22 + 1.2) * (c.kickDir || 1) : 0;
  const rec = on ? -dir * Math.min(1, S0.t * 6) * 0.05 * S + (Math.random() - 0.5) * 1.5 * Math.max(1, k) : 0, top = amp + rec;   // отдача струи гнёт верх назад
  const bx = Math.round(W / 2 + relU(c, b) * S), by = fl0 + Math.round(0.06 * S), NZ0 = HYD_NOZ[c.hyd % HYD_NOZ.length], mir = dir * NZ0[0] < 0;
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.beginPath(); ctx.rect(0, 0, W, fl0); ctx.clip();
  for (let yy = 0; yy < r[3]; yy++) { const f = (r[3] - yy) / r[3], off = Math.round(top * f * f), y1 = by - h + Math.round(yy * h / r[3]), y2 = by - h + Math.round((yy + 1) * h / r[3]); if (y2 <= y1) continue;
    if (mir) { ctx.save(); ctx.translate(bx + off, 0); ctx.scale(-1, 1); ctx.drawImage(I, r[0], r[1] + yy, r[2], 1, -Math.round(w / 2), y1, w, y2 - y1); ctx.restore(); }
    else ctx.drawImage(I, r[0], r[1] + yy, r[2], 1, bx + off - Math.round(w / 2), y1, w, y2 - y1); }
  const sy = 1, ftop = NZ0[2] / r[3], nozOff = Math.round(top * ftop * ftop);
  ctx.restore();
  if (S0 && S0.L > 0.05) {   // струя — та же вода, что льётся из труб, только вбок
    const NZ = HYD_NOZ[c.hyd % HYD_NOZ.length], g = Math.max(2, Math.round(S * 0.03)), X = Math.round(bx + nozOff + dir * (NZ[1] - 1) * k), Y = Math.round(by - NZ[2] * k * sy),   /* v308 (Алексей: «вода бьёт не из трубы гидранта, а из воздуха рядом»): из его выхода */ fake = { temp: 0, cloud: false, tail: 0, y: 1, head: 1, bottom: 0 };
    ctx.save(); ctx.translate(X, Y); ctx.rotate(dir > 0 ? -Math.PI / 2 : Math.PI / 2); stream(fake, 0, 0, Math.round(S0.L * S), g * 6, g, true); ctx.restore(); } }
// ====================== ПЛАТФОРМЫ-ВЕНТИЛЯТОРЫ ======================
// v309 (Алексей 26.10: «дополнительные тайлы — платформы, анимированы: крутится вентилятор и т. п., добавь их»). Лист вырезан tools/fans_cut.py → tex/Fans.png.
// Часть парящих платформ (куб «plat») одета в эти блоки: на лицевую грань каждого куба — свой блок. Вентилятор из первого ряда листа крутится (4 кадра),
// с решёткой — 2 кадра, размытый — мерцает, жалюзи и сетки стоят; лампочки на боку мигают.
const FAN_R = [[0,0,42,36],[44,0,42,36],[88,0,42,36],[132,0,42,36],[176,0,41,36],[219,0,41,36],[262,0,43,37],[307,0,43,36],[352,0,41,36],[395,0,42,35],[439,0,42,35],[483,0,40,38],[525,0,42,36],[569,0,41,37],[612,0,41,36],[655,0,45,32],[702,0,43,32],[747,0,38,36],[787,0,42,36],[831,0,39,35],[872,0,23,41],[897,0,61,27],[960,0,57,31]];   // v311: перевырезано tools/fans_cut2.py — без серой каймы, у кадров анимации общий корпус
// виды: кадры и скорость (кадров в секунду); вес — как часто встречается
const FAN_KINDS = [{ f: [0, 1, 2, 3], fps: 14, w: 4 }, { f: [4, 5], fps: 6, w: 2 }, { f: [8, 14], fps: 9, w: 1 }, { f: [9], w: 1 }, { f: [10], w: 1 }, { f: [15], w: 1 }, { f: [16], w: 1 }, { f: [11], w: 1 }, { f: [17], w: 1 }, { f: [6], w: 1 }, { f: [7], w: 1 }, { f: [12], w: 1 }, { f: [13], w: 1 }];
let fanTiles = [], fanKey = '';
function fanBuild() { const key = (LEVEL.seed | 0) + '|' + cubes.size; if (key === fanKey) return; fanKey = key; fanTiles = [];
  const R = rng(((LEVEL.seed | 0) + 8181) >>> 0), seen = new Set(), tot = FAN_KINDS.reduce((a, k) => a + k.w, 0), pickK = () => { let r = R() * tot; for (let i = 0; i < FAN_KINDS.length; i++) { r -= FAN_KINDS[i].w; if (r <= 0) return i; } return 0; };
  for (const c of cubes.values()) { if (c.kind !== 'plat' || seen.has(c)) continue;   // платформа целиком: соседние кубы того же ряда
    const grp = [c], q = [c]; seen.add(c); while (q.length) { const a = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = cubes.get(ckey(a.x + dx, a.y, a.z + dz)); if (n && n.kind === 'plat' && !seen.has(n)) { seen.add(n); grp.push(n); q.push(n); } } }
    if (R() > 0.55) continue; const same = R() < 0.6, k0 = pickK();   // половина платформ — в вентиляторах; чаще одного вида, иногда вперемешку
    for (const g of grp) fanTiles.push({ c: g, k: same ? k0 : pickK(), ph: R() * 10 }); }
}
function pushFans(actors, b, relD) { if (!img.Fans || !img.Fans.width) return; fanBuild(); if (!fanTiles.length) return;
  const A = Math.abs(b.n[0]) > Math.abs(b.n[1]) ? [Math.sign(b.n[0]), 0] : [0, Math.sign(b.n[1])], fc = Math.max(Math.abs(b.n[0]), Math.abs(b.n[1]));
  for (const t of fanTiles) { const c = t.c; if (Math.abs(c.y - cam.y) > H / S / 2 + 2 || hasCube(c.x + A[0], c.y, c.z + A[1])) continue; const fx = { x: c.x + A[0] * 0.5, z: c.z + A[1] * 0.5 }; if (Math.abs(relU(fx, b)) > W / S / 2 + 2) continue;
    actors.push({ _d: relD(fx) + 0.01, draw: () => drawFanTile(t, fx, b, fc) }); }
}
function drawFanTile(t, fx, b, fc) { const K = FAN_KINDS[t.k], fi = K.f[K.fps ? Math.floor(game.time * K.fps + t.ph) % K.f.length : 0], r = FAN_R[fi], I = img.Fans;
  const w = Math.round(S * fc), h = Math.round(S), x = Math.round(W / 2 + relU(fx, b) * S - w / 2), y = Math.round(H / 2 - (t.c.y + 1 - cam.y) * S);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(I, r[0], r[1], r[2], r[3], x, y, w, h);
  if (K.f.length === 2 && K.fps === 9) { ctx.globalAlpha = 0.12 + 0.08 * Math.sin(game.time * 31 + t.ph); ctx.fillStyle = '#9aa0a8'; ctx.fillRect(x + Math.round(w * 0.15), y + Math.round(h * 0.15), Math.round(w * 0.55), Math.round(h * 0.7)); }   // размытый — дрожит
  ctx.restore();
  if (Math.sin(game.time * 2.3 + t.ph * 3) > 0.6) pixelGlow(x + Math.round(w * 0.9), y + Math.round(h * 0.62), 0.1, 0.12, '120,230,255');   // огонёк на боку
}
// ====================== КАРТЫ СМЕРТИ (состояние и список) ======================
// v310 (Алексей 26.10: «каждую смерть выбираешь карту — что в игре станет хуже; каждый раз разные; дизайн близкий к талантам»).
// Взятые карты действуют до конца забега; новая игра (запуск, R) снимает все — как и таланты. Выбор — 15f_deathcards.js.
const DC = { own: new Set(), open: false, offer: [], sel: 1, pend: false };
const dcHas = id => DC.own.has(id);
// col — цвет рамки (три семьи, как у примера: олива, охра, лёд); ico — значок 9×9
const DC_CARDS = [
  { id: 'poison', name: 'Отравленная вода', desc: 'Любая вода отравлена — трубы, дождь, лужи, гидранты: пока отравлен — теряешь жизни', col: '#8a9a4a', ico: ['....X....', '...XXX...', '..XXXXX..', '.XX.X.XX.', '.XXXXXXX.', '.X.X.X.X.', '..XXXXX..', '...X.X...', '.........'] },
  { id: 'noladder', name: 'Пропадают лестницы', desc: 'Часть лестниц и маршей исчезает', col: '#c8883a', ico: ['X.....X..', 'XXXXXXX..', 'X.....X..', 'XXX.XXX..', 'X.....X..', 'X..X..X.X', 'X...X.X.X', 'X....XX..', 'X.....X..'] },
  { id: 'burst', name: 'Хрупкая оболочка', desc: 'Шанс внезапно лопнуть выше на 10%', col: '#c8883a', ico: ['.X.....X.', '..X...X..', '...XXX...', 'X.XXXXX.X', '..XXXXX..', 'X.XXXXX.X', '...XXX...', '..X...X..', '.X.....X.'] },
  { id: 'hunters', name: 'Охотники', desc: 'Злые боты прыгают сверху втрое чаще', col: '#c85a3a', ico: ['...XXX...', '..X.X.X..', '..XXXXX..', '...XXX...', '.XXXXXXX.', 'X..XXX..X', '...X.X...', '..X...X..', '..X...X..'] },
  { id: 'bombs', name: 'Бомбёжка', desc: 'Бомбёжки ботами вдвое чаще', col: '#c85a3a', ico: ['......X..', '.....X...', '...XXX...', '..XXXXX..', '.XXXXXXX.', '.XX.XXXX.', '.XXXXXXX.', '..XXXXX..', '...XXX...'] },
  { id: 'tough', name: 'Бронированные', desc: 'Боты вдвое прочнее', col: '#7aa0c8', ico: ['XXXXXXXXX', 'X.......X', 'X.XXXXX.X', 'X.X...X.X', 'X.X.X.X.X', 'X.X...X.X', 'X.XXXXX.X', 'X.......X', 'XXXXXXXXX'] },
  { id: 'shield', name: 'Щиты', desc: 'У всех ботов щит', col: '#7aa0c8', ico: ['.XXXXXXX.', 'XX.....XX', 'X..XXX..X', 'X.XX.XX.X', 'X..XXX..X', '.X.....X.', '..X...X..', '...X.X...', '....X....'] },
  { id: 'tvshock', name: 'Под напряжением', desc: 'Экраны бьют током, когда их разбиваешь', col: '#7aa0c8', ico: ['XXXXXXXXX', 'X....X..X', 'X...X...X', 'X..XXX..X', 'X....X..X', 'X...X...X', 'XXXXXXXXX', '...X.X...', '..XXXXX..'] },
  { id: 'rage', name: 'Вспыльчивые', desc: 'Ботов втрое легче разозлить', col: '#c85a3a', ico: ['X...X...X', '.X..X..X.', '..XXXXX..', '.XX.X.XX.', 'XXXXXXXXX', '.XX...XX.', '..XXXXX..', '.X.....X.', 'X.......X'] },
  { id: 'height', name: 'Выше — злее', desc: 'Боты сильнее растут с высотой и раньше учатся приёмам', col: '#c8883a', ico: ['....X....', '...XXX...', '..XXXXX..', '....X....', '..X.X.X..', '....X....', '.X..X..X.', '....X....', 'XXXXXXXXX'] },
  { id: 'clone', name: 'Клон', desc: 'По титану бегает твой клон и ищет тебя', col: '#8a9a4a', ico: ['...XXX...', '..X.X.X..', '..XXXXX..', '...XXX...', '..XXXXX..', '.X.XXX.X.', '...XXX...', '..XX.XX..', '.XX...XX.'] },
  { id: 'twolives', name: 'Две жизни', desc: 'У героя всего две жизни', col: '#c85a3a', ico: ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....', '.........', 'XX.....XX'] },
  { id: 'fasthero', name: 'Разгон', desc: 'Герой бежит слишком быстро', col: '#8a9a4a', ico: ['.....XX..', '....XXX..', 'XXX..X...', '...XXXXX.', 'XX..X....', '...X.X...', 'XX.X...X.', '..X.....X', '.........'] },
  { id: 'fastbots', name: 'Быстрые боты', desc: 'Боты бегают в полтора раза быстрее', col: '#c85a3a', ico: ['...XXX...', '..XXXXX..', 'XX.XXX...', '..XXXXX..', 'XX.XXX...', '...X.X...', '..X...X..', '.X.....X.', '.........'] },
  { id: 'cams', name: 'Глаза повсюду', desc: 'Камер больше, луч длиннее', col: '#7aa0c8', ico: ['....X....', '...XXX...', '..XXXXX..', '..XX.XX..', '...XXX...', '..X...X..', '.X.....X.', 'X.......X', '.........'] },
  { id: 'traps', name: 'Частые разряды', desc: 'Электроловушки бьют чаще', col: '#7aa0c8', ico: ['....XX...', '...XX....', '..XX.....', '.XXXXXX..', '....XX...', '...XX....', '..XX.....', '.XX......', 'XXXXXXXXX'] },
  { id: 'nohyd', name: 'Сухо', desc: 'Гидрантов больше нет', col: '#c8883a', ico: ['...XXX...', '..XXXXX..', 'XXXXXXXXX', '..XXXXX..', '..XXXXX..', '..XXXXX..', '.XXXXXXX.', 'X.......X', '.X.....X.'] },
  { id: 'dark', name: 'Темнота', desc: 'Видно только то, что рядом с героем', col: '#8a9a4a', ico: ['..XXXX...', '.XXX.....', 'XXX......', 'XXX......', 'XXX......', 'XXX......', '.XXX.....', '..XXXX...', '.........'] },
  { id: 'cogs', name: 'Скупость', desc: 'Шестерёнки выпадают вдвое реже', col: '#c8883a', ico: ['...X.X...', '..XXXXX..', '.XX...XX.', 'XX.....XX', '.X.....X.', 'XX.....XX', '.XX...XX.', '..XXXXX..', '...X.X...'] },
  { id: 'kunai', name: 'Меньше кунаев', desc: 'Кунаев на один меньше', col: '#8a9a4a', ico: ['........X', '.......X.', '......X..', '.....X...', '....X....', '..XX.....', '.XX......', 'X........', '.........'] },
  { id: 'hook', name: 'Тугой крюк', desc: 'Крюк перезаряжается дольше', col: '#8a9a4a', ico: ['....XXX..', '...X...X.', '...X...X.', '....X..X.', '.......X.', '......X..', '.....X...', '....X....', 'XXXX.....'] },
  { id: 'raid', name: 'Облава раньше', desc: 'Таймер облавы на 40% короче', col: '#c85a3a', ico: ['..XXXXX..', '.X..X..X.', 'X...X...X', 'X...X...X', 'X...XXX.X', 'X.......X', '.X.....X.', '..XXXXX..', '.........'] },
  { id: 'armor', name: 'Тонкая броня', desc: 'Брони можно набрать на 2 меньше', col: '#7aa0c8', ico: ['.XXXXXXX.', 'XX.X.X.XX', 'X.......X', 'X...X...X', 'X..X.X..X', '.X.....X.', '..X...X..', '...X.X...', '....X....'] },
  { id: 'nojump', name: 'Без прыжков', desc: 'Прыгать нельзя — только крюком', col: '#c85a3a', ico: ['....X....', '...XXX...', '..X.X.X..', '....X....', 'XX.....XX', '.XX...XX.', '..XX.XX..', '...XXX...', '..XX.XX..'] },
];
const dcCard = id => DC_CARDS.find(c => c.id === id);
function dcReset() { DC.own.clear(); DC.open = false; DC.pend = false; }
// ---- что меняют карты в мире (вызывается при выборе и в начале каждого уровня)
function dcApplyLevel() {
  if (dcHas('noladder')) { const keep = (o, k) => { if (o.y0 > 900 || o.y > 900 || o.armP || o.y0 < 3) return true;   /* v313 (Алексей: «не убирать первую лестницу, чтобы выйти с подошвы»): всё, что начинается с подошвы, остаётся */ const h = Math.abs(Math.sin((o.t || o.t0 || 0) * 12.9898 + (o.y0 || o.y || 0) * 78.233 + k) * 43758.5453) % 1; return h > 0.45; };
    LEVEL.ladders = (LEVEL.ladders || []).filter(L => keep(L, 1)); LEVEL.stairs = (LEVEL.stairs || []).filter(L => keep({ t: num0s(L.t0), y0: Math.min(num0s(L.y0), num0s(L.y1)) }, 2)); }
  if (dcHas('nohyd') && typeof crates !== 'undefined') { crates = crates.filter(c => c.hyd === undefined); LEVEL.crates = LEVEL.crates.filter(c => c.hyd === undefined); }
}
// вне кадра (с запасом m кубов) — не рисуем
const offView = (o, m) => { const u = (o.x - cam.x) * view.r[0] + (o.z - cam.z) * view.r[1]; return Math.abs(u) > W / S / 2 + m || Math.abs(o.y - cam.y) > H / S / 2 + m; };
// ====================== ОБЛАКА ======================
// Формы облаков — из нарисованного листа (и склеенные из них новые). Каждое облако — мягкое поле: по нему собраны четыре варианта
// с разным рваным краем, и они всё время перетекают один в другой, так что пиксели по краям живут.
const cloudSpr = [], sky = []; let cloudT = 0;
function buildClouds() {
  const im = img.clouds; if (!im || !im.width || !D.clouds) return;
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  let data; try { data = x.getImageData(0, 0, c.width, c.height).data; } catch (err) { return; }
  const hs = (a, b2, f) => { let n = (Math.imul(a, 374761393) + Math.imul(b2, 668265263) + Math.imul(f + 1, 1442695041)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  // маски облаков: рисунки автора (обрезанные половинки не берём) и новые, склеенные из двух-трёх авторских с разной растяжкой
  const skip = new Set(D.cloudSkip || []), rareSet = new Set(D.cloudRare || []), masks = [], good = [];
  D.clouds.forEach((r, i) => { if (skip.has(i)) return; const v = new Float32Array(r[2] * r[3]); for (let yy = 0; yy < r[3]; yy++) for (let xx = 0; xx < r[2]; xx++) v[yy * r[2] + xx] = data[((r[1] + yy) * c.width + r[0] + xx) * 4] / 255 * Math.min(1, (xx + 0.5) / 5, (r[2] - xx - 0.5) / 5);   // к краям рисунка сходит на нет: обрезанных краёв не бывает
    const m = { w: r[2], h: r[3], v, rare: rareSet.has(i) }; masks.push(m); if (!m.rare) good.push(m); });
  let sd = 23; const R = () => (sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648;
  const stamp = (dst, m, ox, lift, flip, sx) => { const w = Math.round(m.w * sx), oy = dst.h - m.h - lift; for (let yy = 0; yy < m.h; yy++) for (let xx = 0; xx < w; xx++) { const X = ox + xx, Y = oy + yy; if (X < 0 || X >= dst.w || Y < 0 || Y >= dst.h) continue; const sxx = Math.min(m.w - 1, Math.floor(xx / sx)), val = m.v[yy * m.w + (flip ? m.w - 1 - sxx : sxx)]; if (val > dst.v[Y * dst.w + X]) dst.v[Y * dst.w + X] = val; } };
  for (let k = 0; k < 14 && good.length > 1; k++) { const parts = [good[Math.floor(R() * good.length)], good[Math.floor(R() * good.length)]]; if (R() < 0.35) parts.push(good[Math.floor(R() * good.length)]);
    const sx = parts.map(() => 0.75 + R() * 0.55), ov = parts.map(() => 0.3 + R() * 0.3), lift = parts.map((q, i) => i ? Math.floor(R() * 5) : 0), fl = parts.map(() => R() < 0.5); let wsum = 0; const ox = [];
    parts.forEach((q, i) => { const w = Math.round(q.w * sx[i]); ox.push(i ? Math.max(0, Math.round(wsum - w * ov[i])) : 0); wsum = Math.max(wsum, ox[i] + w); });
    const dst = { w: Math.min(250, wsum), h: Math.max(...parts.map((q, i) => q.h + lift[i])), rare: false }; dst.v = new Float32Array(dst.w * dst.h); parts.forEach((q, i) => stamp(dst, q, ox[i], lift[i], fl[i], sx[i])); for (let yy = 0; yy < dst.h; yy++) for (let xx = dst.w - 5; xx < dst.w; xx++) dst.v[yy * dst.w + xx] *= (dst.w - xx - 0.5) / 5; masks.push(dst); }
  for (const m of masks) {
    const frames = [];
    for (let f = 0; f < 4; f++) {
      const cv = document.createElement('canvas'); cv.width = m.w; cv.height = m.h; const cx = cv.getContext('2d'), id = cx.createImageData(m.w, m.h);
      for (let yy = 0; yy < m.h; yy++) for (let xx = 0; xx < m.w; xx++) {
        const v = m.v[yy * m.w + xx], o = (yy * m.w + xx) * 4;
        if (v + (hs(xx, yy, f) - 0.5) * 0.46 <= 0.5) continue;
        const sh = yy > m.h * 0.62 && hs(xx, yy, 9) < 0.6 ? 0.9 : 1;   // низ облака чуть темнее
        id.data[o] = 246 * sh; id.data[o + 1] = 244 * sh; id.data[o + 2] = 236 * sh; id.data[o + 3] = 255;
      }
      cx.putImageData(id, 0, 0); frames.push(cv);
      if (f === 0) { var bot = []; for (let xx = 0; xx < m.w; xx++) { let b2 = -1; for (let yy = m.h - 1; yy >= 0; yy--) if (id.data[(yy * m.w + xx) * 4 + 3]) { b2 = yy; break; } bot.push(b2); } }
    }
    cloudSpr.push({ w: m.w, h: m.h, frames, bot, rare: m.rare });
  }
  const common = [], rares = []; cloudSpr.forEach((q, i) => (q.rare ? rares : common).push(i));
  const pickI = () => rares.length && Math.random() < 0.012 ? rares[Math.floor(Math.random() * rares.length)] : common[Math.floor(R() * common.length)];   // изредка в небе проплывает особенное облако
  for (let i = 0; i < 44; i++) sky.push({ i: pickI(), x: R() * 110, y: 3 + R() * 52, sp: 0.12 + R() * 0.3, ph: R() * 4, front: false, flip: R() < 0.5 });
  for (let i = 0; i < 26; i++) sky.push({ i: pickI(), x: R() * 110, y: 4.5 + R() * 5, sp: 0.12 + R() * 0.25, ph: R() * 4, front: false, flip: R() < 0.5 });   // низкие дальние облака — видны над дальним планом прямо с земли
  for (let i = 0; i < 10; i++) sky.push({ i: pickI(), x: R() * 110, y: i < 7 ? 3 + i * 7 + R() * 5 : 4 + R() * 44, sp: 0.5 + R() * 0.5, ph: R() * 4, front: true, flip: R() < 0.5, solid: R() < 0.3, push: R() < 0.3, rain: R() < 0.3, dead: true, lift: true });
  { const fr = sky.filter(c => c.front); fr.forEach((c, k) => { c.solid = k === 0 || k === 3 || k === 5; c.push = false; c.rain = false; }); const rest = fr.filter(c => !c.solid); if (rest.length) { const pc = rest[Math.floor(R() * rest.length)]; pc.push = true; pc.y = 33.2 + R() * 0.8; }   // сдувающее облако ходит на высоте галереи под тазом { const dry = rest.filter(c => !c.push); if (dry.length) dry[Math.floor(R() * dry.length)].rain = true; }   // плотные облака, на которых можно ехать, есть всегда: внизу, в середине и под тазом
    for (const c of fr) if (c.solid) { c.rain = false; for (const r of [13, 23]) if (c.y > r - 7 && c.y < r + 1) c.y = r + 1.6 + R() * 2.5; } }
  { const TY = LEVEL.torsoY || [48, 70]; for (let i = 0; i < 4; i++) sky.push({ i: common[Math.floor(R() * common.length)], x: R() * 110, y: TY[0] + 3 + i * 5 + R() * 2, sp: 0.5 + R() * 0.5, ph: R() * 4, front: true, flip: R() < 0.5, solid: i === 1, push: false, rain: i === 0 || i === 2, dead: true, lift: true }); }   /* v303: у груди — облака, два с дождём (Алексей: «больше воды выше») */   // на облаке кольцо не объехать: такое облако идёт уже над кольцом
}
function cloudAnomaly() {
  const fr = sky.filter(c => c.front); for (const c of fr) { if (c.solid0 === undefined) { c.solid0 = !!c.solid; c.rain0 = !!c.rain; c.push0 = !!c.push; } c.solid = c.solid0; c.rain = c.rain0; c.push = c.push0; }
  LEVEL.anom = (game.level || 1) >= 2 ? (Math.random() < 0.45 ? 'clouds' : null) : (Math.random() < 0.25 ? 'clouds' : null);
  if (LEVEL.anom === 'clouds') { for (const c of fr) if (c.y > 12 || Math.random() < 0.5) { c.solid = true; c.rain = false; c.push = false; } }   // аномалия: облака почти все плотные, наверху — все
}
function cloudBox(c) {                  // где сейчас переднее облако: середина по экрану, низ, ширина и высота (в кубах)
  const sp = cloudSpr[c.i]; if (!sp) return null; const camU = cam.x * view.r[0] + cam.z * view.r[1], ux = (((c.x - cloudT * c.sp * 1.6 - camU) % 110) + 110) % 110 - 55;
  return { u: camU + ux, y: c.y, w: sp.w * 0.05, h: sp.h * 0.05 };
}
function updateClouds(dt) {             // плотное облако везёт героя, ветреное — сдвигает, дождевое — льёт воду, как труба
  const alive = hero.state !== 'dead' && !hero.inDoor && !(hero.burstT > 0), hu = toU(hero);
  for (const c of sky) { if (!c.front) continue; const bx = cloudBox(c); if (!bx) continue;
    const du = c.lastU === undefined || Math.abs(bx.u - c.lastU) > 2 ? 0 : bx.u - c.lastU; c.lastU = bx.u;
    if (!alive || hero.ladder || hero.hang || hero.ride) continue;
    const move = d => { const nu = toU(hero) + d, dd = toD(hero); if (!overlapsDepth(nu, hero.y + 0.03, hero.hw, hero.h - 0.06, dd)) setUD(hero, nu, dd); };
    if (c.solid && hero.standOn === c) { move(du);
      const toLeg = Math.abs(view.r[1]) > 0.5 && hero.z * game.gSide > 0 && Math.abs(hero.x) < 10 && hero.y < LEVEL.pelY;   // плывёт ко второй ноге — это не побег
      if (Math.abs(toU(hero)) > 26 && !game.finale) { game.levelT = Math.max(game.levelT || 0, CFG.finaleAfter); showCombo('Улетел слишком далеко — облава!', true); }
      if (!c.raid && !toLeg && Math.abs(toU(hero)) > 12.5) { c.raid = true; showCombo('ПРИКОНЧИТЬ НАРУШИТЕЛЯ', true); sfx('RobotDeathD', 0.8, 0.5);
        for (let i = 0; i < 5; i++) { const off = (i - 2) * bx.w * 0.16, top = bx.y + bx.h * 0.55, r = makeRobot({ x: hero.x, y: top, z: hero.z, h: [1, 0], R: 9, F: 7.5 }); r.hunter = true; r.rage = 1e9; r.hp = Math.round(r.hp * 0.6); r.onCloud = { c, off }; r.fa = view.k * 90; r.dropT = 0.5 + i * 0.25; robots.push(r); } } }
    else if (c.raid && hero.standOn !== c && (hero.onGround || hero.state === 'dead')) c.raid = false;
    else if (c.push && !onGateLift() && Math.abs(hu - bx.u) < bx.w * 0.42 && hero.y + hero.h > bx.y + bx.h * 0.15 && hero.y < bx.y + bx.h * 0.85) move(-(1.2 + c.sp * 4.2) * dt);
  }
}
function drawSky(front, pan) {         // часть облаков далеко позади, несколько изредка проходят полупрозрачными перед героем
  ctx.imageSmoothingEnabled = false;
  for (const c of sky) {
    if (c.front !== front) continue; const sp = cloudSpr[c.i]; if (!sp) continue;
    const g = Math.max(1, Math.round(S * (front ? 0.05 : 0.036))), w = sp.w * g, h = sp.h * g;
    const off = cloudT * c.sp * (front ? 1.6 : 1) + pan * (front ? 1 : 0.12);   // плывут сами по себе, шаг ноги на них не влияет
    const ux = (((c.x - off) % 110) + 110) % 110 - 55, px = Math.round(W / 2 + ux * S - w / 2), py = Math.round(H / 2 - (c.y - cam.y * (front ? 1 : 0.5) - (front ? 0 : 3)) * S - h);
    if (px > W || px + w < 0 || py > H || py + h < 0) continue;
    const t = cloudT * 0.8 + c.ph, fa = Math.floor(t) % 4, fb = (fa + 1) % 4, k = t - Math.floor(t), al = front ? (c.solid ? 0.96 : c.rain ? 0.85 : 0.62) : 1;
    ctx.save(); if (c.flip) { ctx.translate(px + w, py); ctx.scale(-1, 1); } else ctx.translate(px, py);
    ctx.globalAlpha = al * (1 - k * 0.999); ctx.drawImage(sp.frames[fa], 0, 0, w, h); ctx.globalAlpha = al * k; ctx.drawImage(sp.frames[fb], 0, 0, w, h);
    if (front && c.rain) { if (!sp.dark) { const cv = document.createElement('canvas'); cv.width = sp.w; cv.height = sp.h; const cx = cv.getContext('2d'); cx.drawImage(sp.frames[0], 0, 0); cx.globalCompositeOperation = 'source-atop'; cx.fillStyle = '#3a4a66'; cx.fillRect(0, 0, sp.w, sp.h); sp.dark = cv; }
      const y0 = Math.floor(sp.h * 0.45); ctx.globalAlpha = 0.34; ctx.drawImage(sp.dark, 0, y0, sp.w, sp.h - y0, 0, y0 * g, w, (sp.h - y0) * g); }   // дождевое — с тёмным брюхом
    ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
}
const darkC = document.createElement('canvas');
function drawDarkness(b) {              // полумрак с пятнами света: рисуется в четверть размера, чтобы свет ложился крупным пикселем
  const q = 6, w = Math.ceil(W / q), h = Math.ceil(H / q); if (darkC.width !== w || darkC.height !== h) { darkC.width = w; darkC.height = h; }
  const x = darkC.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h); const inside = cam.y > 2500; x.fillStyle = inside ? 'rgba(6,5,12,0.8)' : 'rgba(10,10,26,0.42)'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'destination-out';   // внутри робота темно: светят герой, лампы, огонь
  const spot = (e, yy, r, k) => { const px = (W / 2 + relU(e, b) * S) / q, py = (H / 2 - (yy - cam.y) * S) / q, R = r * S / q; if (px < -R || px > w + R || py < -R || py > h + R) return; const g = x.createRadialGradient(px, py, R * 0.25, px, py, R); g.addColorStop(0, 'rgba(0,0,0,' + k + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - R, py - R, R * 2, R * 2); };
  if (hero.state !== 'dead') spot(hero, hero.y + 0.4, inside ? (hero.prom || hero.burn > 0 ? 5.6 : 4.2) : 4.6, 1);
  for (const L of LEVEL.lamps) { if (L.gone) continue; const N = FACE_N[L.f]; if (N[0] * b.n[0] + N[1] * b.n[1] < 0.3) continue; spot({ x: L.x + Math.sin(L.th) * L.len * b.r[0], z: L.z + Math.sin(L.th) * L.len * b.r[1] }, L.y - L.len, inside ? 3.4 : 2.6, inside ? 1 : 0.85); }
  for (const f of fires) if (!(f.delay > 0) && !f.cull) spot(f, f.y + 0.4, 2.4, 0.8);
  for (const r of robots) if (!r.dead && (r.rage > 0 || r.burn > 0) && !robotHidden(r)) spot(r, r.y + 0.4, 2, 0.6);
  for (const d of doors) if (d.exit && d.f === view.k) spot(d, d.y + 0.6, 2.2, 0.7);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(darkC, 0, 0, w, h, 0, 0, w * q, h * q); ctx.imageSmoothingEnabled = true;
}
// заранее отмасштабированные копии больших картинок фона: масштабировать огромную картинку каждый кадр дорого
const preCache = new Map();
function preScaled(im, w, h, flip, crisp) { w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h)); if (S !== S0) return preDirect(im, w, h, flip, crisp);
  const key = (im.src || im.width) + '|' + w + '|' + h + '|' + (flip ? 1 : 0) + (crisp ? 'c' : ''); let c = preCache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = !crisp; x.imageSmoothingQuality = 'high'; if (flip) { x.translate(w, 0); x.scale(-1, 1); } x.drawImage(im, 0, 0, w, h);
  if (preCache.size > 14) preCache.delete(preCache.keys().next().value); preCache.set(key, c); return c; }
function preDirect(im, w, h, flip, crisp) { const c = preDirect.c || (preDirect.c = document.createElement('canvas')); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = !crisp; x.clearRect(0, 0, w, h); if (flip) { x.translate(w, 0); x.scale(-1, 1); } x.drawImage(im, 0, 0, w, h); return c; }
function drawBackground() {
  if (cam.y > 2500) { ctx.fillStyle = '#0d0b12'; ctx.fillRect(0, 0, W, H); return; }   // внутри титана — темнота разреза
  ctx.drawImage(preScaled(img.Bg1, W, H, false), 0, 0);
  const b = basis(view.angle);
  const pan = cam.x * b.r[0] + cam.z * b.r[1] + (game.pan + (view.rotating ? view.angle - view.from : 0)) * 0.11 - (game.sway || 0) * b.r[1];   /* корпус переваливается — земля и лес уходят вбок */
  for (const L of BG) {
    if (L === BG[1] && !L.skyDone) drawSky(false, cam.x * b.r[0] + cam.z * b.r[1] + (game.pan + (view.rotating ? view.angle - view.from : 0)) * 0.11);   // облака игры — поверх дальнего плана (картинка их не закрывает)
    const im = img[L.t]; if (!im || !im.width) continue;
    const baseY = 1.2 + (Math.min(cam.y, BG_RISE_Y0) - 1.2) * BG_RISE + Math.max(0, cam.y - BG_RISE_Y0) * BG_RISE_HI;   // общий для всех слоёв: лес уходит вниз целиком, слои не разъезжаются
    const yTop = H / 2 - (L.y - game.lift * (0.4 + 0.6 * L.s) + L.h - baseY) * S, tw = L.w * S, th = L.h * S;
    if (L.mirror) { const o = (pan * L.p + game.scroll * L.s) * S, i0 = Math.floor(o / tw); ctx.imageSmoothingEnabled = true;
      for (let r = (L.rows || 1) - 1; r >= 0; r--) { const ro = o + r * tw * 0.37, j0 = Math.floor(ro / tw), yy = Math.round(yTop + r * th * 0.62);   // v233: несколько рядов вниз (ближний ряд рисуется последним)
        for (let k = 0, x = -(ro - j0 * tw); x < W; k++, x += tw) ctx.drawImage(preScaled(im, Math.ceil(tw) + 1, th, (j0 + k) % 2 !== 0, L.crisp), Math.floor(x), yy); }   /* слой заранее отмасштабирован (и отражён) — каждый кадр только копируется */
      { const yb = yTop + th * (1 + ((L.rows || 1) - 1) * 0.62) - 1; if (L.fill && yb < H) { ctx.fillStyle = L.fill; ctx.fillRect(0, yb, W, H - yb); } } continue; }
    let x0 = (-((pan * L.p + game.scroll * L.s) * S) % tw + tw) % tw - tw;
    { const pc = preScaled(im, tw, th, false); for (let x = x0; x < W; x += tw - 1) ctx.drawImage(pc, Math.round(x), Math.round(yTop)); }
    if (L.fill && yTop + th - 1 < H) { ctx.fillStyle = L.fill; ctx.fillRect(0, yTop + th - 1, W, H - (yTop + th - 1)); }
  }
}
let rustleC = null, forDarkC = null, leafFx = [], leafCols = null;
function forestCols(im) { if (leafCols) return leafCols; const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 64, 32); const d = x.getImageData(0, 0, 64, 32).data, out = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] + d[i + 1] + d[i + 2] > 60) out.push('rgb(' + d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ')'); return leafCols = out.length ? out : ['#2e5a3a']; }
let forShadeC = null; function forestShade(im) { if (forShadeC && forShadeC.src === im) return forShadeC; const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.filter = 'brightness(0.28) saturate(0.7)'; x.drawImage(im, 0, 0); c.src = im; return forShadeC = c; }   // кроны в тени ступни
function darkForest(im) { if (forDarkC && forDarkC.src === im) return forDarkC; const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.filter = 'brightness(0.62)'; x.drawImage(im, 0, 0); c.src = im; return forDarkC = c; }
function rustleCanvas(im) {   // шелест: светлые пиксели листвы отдельным слоем — его рябят полосами, будто кроны шевелит ветер
  if (rustleC && rustleC.src === im) return rustleC; const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data; for (let i = 0; i < a.length; i += 4) { const l = a[i] + a[i + 1] + a[i + 2]; if (a[i + 3] < 200 || l < 75 || a[i + 1] < a[i + 2] - 4) a[i + 3] = 0; else { a[i] = Math.min(255, a[i] * 1.5 + 6); a[i + 1] = Math.min(255, a[i + 1] * 1.4 + 10); a[i + 2] = Math.min(255, a[i + 2] * 1.25); a[i + 3] = 150; } }
  x.putImageData(d, 0, 0); c.src = im; return rustleC = c; }
function drawForeground(b) {            // передний лес перед ступнями титана: плотный, тёмный, бежит быстрее фона; кроны шелестят
  const im2 = img.Forest2, nw = im2 && im2.width, im = nw ? im2 : img.Bg7; if (!im || !im.width) return;
  const pan = cam.x * b.r[0] + cam.z * b.r[1] - (game.sway || 0) * b.r[1] * 1.6;
  const th = (nw ? 3.4 : 2.5) * S, tw = nw ? th * im.width / im.height : 20 * S, yTop = H / 2 - ((nw ? 2.1 : 1.45) + soleBase() + (game.sink || 0) - game.lift - cam.y) * S;   // ступня утоплена в заросли, а в момент удара уходит ещё глубже
  const off = (pan + game.scroll * 1.6) * S; ctx.imageSmoothingEnabled = !!nw;
  const strip = (o, dy, k) => { let x0 = (-o % tw + tw) % tw - tw; for (let x = x0; x < W; x += tw - 1) ctx.drawImage(im, x, yTop + dy, tw * k, th * k); };
  if (nw) {   // v232: ели автора 14.10 позади крон переднего леса — закрывают просветы; пиксель как у переднего леса, без размытия, тайлы чередуются с зеркальными
    const px = th / 124, bot = yTop + th * 0.9; ctx.imageSmoothingEnabled = false;
    for (const [nm, k, sh] of []) {   /* v233: ели позади крон убраны — оба ряда елей внизу, перед лесом */ const P = img[nm]; if (!P || !P.width) continue; const pw = Math.round(P.width * px), ph = Math.round(P.height * px), o = off * k + pw * sh, i0 = Math.floor(o / pw);
      for (let j = 0, x = -(o - i0 * pw); x < W; j++, x += pw) { const X = Math.floor(x), Y = Math.round(bot - ph); if ((i0 + j) % 2) { ctx.save(); ctx.translate(X + pw, Y); ctx.scale(-1, 1); ctx.drawImage(P, 0, 0, pw + 1, ph); ctx.restore(); } else ctx.drawImage(P, X, Y, pw + 1, ph); } }
    ctx.imageSmoothingEnabled = !!nw; }
  if (nw) { const D = darkForest(im); let x0 = (-(off * 0.96 + tw * 0.47) % tw + tw) % tw - tw; for (let x = x0; x < W; x += tw - 1) ctx.drawImage(D, x, yTop + th * 0.12, tw, th); }   // второй ряд крон чуть ниже и в тени — лес гуще
  strip(off, 0, 1);
  if (false) { const k = Math.max(0, 1 - Math.max(0, game.lift) / (CFG.stepLift * 0.9)), cu = W / 2 + relU({ x: 0, z: 0 }, b) * S, hw = (FOOT_HALF + 1.2 + (1 - k) * 2) * S;   // тень ступни на кронах: чем ниже нога, тем гуще и чётче
    if (k > 0.02) { const SH = forestShade(im); ctx.save(); ctx.beginPath(); const gq = Math.max(2, Math.round(S * 0.026)); for (let x = Math.floor((cu - hw) / gq) * gq; x < cu + hw; x += gq) { const e = Math.min(1, Math.min(x - (cu - hw), cu + hw - x) / (1.4 * S)), dep = th * (0.25 + 0.5 * e) + ((x / gq * 7) % 5) * gq; ctx.rect(x, yTop - S, gq, dep + S); } ctx.clip();
      ctx.globalAlpha = Math.min(0.92, 0.35 + 0.6 * k); let x0 = (-off % tw + tw) % tw - tw; for (let x = x0; x < W; x += tw - 1) ctx.drawImage(SH, x, yTop, tw, th); ctx.globalAlpha = 1; ctx.restore(); } }
  if (nw && game.leafBurst) { game.leafBurst = false; const C = forestCols(im), gq = Math.max(2, Math.round(S * 0.035));   // ступня ударила: листва и труха летят с крон
    for (let i = 0; i < 160; i++) leafFx.push({ x: Math.random() * W, y: yTop + Math.random() * th * 0.45, vx: rnd(-1, 1) * S * 0.9, vy: -rnd(0.6, 2.6) * S, t: 0, life: rnd(0.8, 1.8), c: C[Math.floor(Math.random() * C.length)], s: gq * (Math.random() < 0.3 ? 2 : 1) }); }
  if (leafFx.length) { const dt = 1 / 60; for (const q of leafFx) { q.t += dt; q.vy += S * 3.2 * dt; q.vx *= 0.985; q.x += q.vx * dt + Math.sin(q.t * 7 + q.y) * 0.6; q.y += q.vy * dt; } leafFx = leafFx.filter(q => q.t < q.life);
    for (const q of leafFx) { ctx.globalAlpha = Math.min(1, (q.life - q.t) * 2); ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x / q.s) * q.s, Math.round(q.y / q.s) * q.s, q.s, q.s); } ctx.globalAlpha = 1; }
  if (nw) { const R = rustleCanvas(im), bands = 18, bh = im.height / bands, t = game.time, g = Math.max(1, Math.round(S * 0.03));   // шелест: полосы светлой листвы покачиваются на пиксель-два
    let x0 = (-off % tw + tw) % tw - tw; ctx.imageSmoothingEnabled = false;
    for (let x = x0; x < W; x += tw - 1) for (let k = 0; k < bands * 0.75; k++) { const th2 = game.treeHit || 0, sx = Math.round(Math.sin(t * 2.3 + k * 0.9 + x * 0.002) * (1.4 + th2 * 4) + Math.sin(t * (5.1 + th2 * 14) + k * 2.1) * (0.6 + th2 * 3)) * g; ctx.globalAlpha = Math.min(0.9, 0.22 + 0.16 * Math.sin(t * 3.7 + k * 1.3) + th2 * 0.45);
      ctx.drawImage(R, 0, k * bh, im.width, bh, x + sx, yTop + k * bh * th / im.height, tw, bh * th / im.height); }
    ctx.globalAlpha = 1; }
  if (yTop + th - 4 < H) { ctx.fillStyle = nw ? 'rgb(12,41,41)' : 'rgb(0,18,30)'; ctx.fillRect(0, yTop + th - (nw ? 4 : 1), W, H - (yTop + th - (nw ? 4 : 1))); }   // низ ленты с запасом закрыт сплошным цветом
  for (const [nm, k, sh, dy] of [['ForestFront2', 1.05, 0.31, 1.2], ['ForestFront1', 1.12, 0.73, 2.4]]) { const P = img[nm]; if (!(nw && P && P.width)) continue;   // v233: два ряда детальных елей автора внизу переднего плана — закрывают ровную заливку под передним лесом
    const px = th / 124, pw = Math.round(P.width * px), ph = Math.round(P.height * px), bot = Math.round(yTop + th + dy * S), o = off * k + pw * sh, i0 = Math.floor(o / pw); ctx.imageSmoothingEnabled = false;
    for (let j = 0, x = -(o - i0 * pw); x < W; j++, x += pw) { const X = Math.floor(x); if ((i0 + j) % 2) { ctx.save(); ctx.translate(X + pw, bot - ph); ctx.scale(-1, 1); ctx.drawImage(P, 0, 0, pw + 1, ph); ctx.restore(); } else ctx.drawImage(P, X, bot - ph, pw + 1, ph); }
    if (bot - 2 < H) { ctx.fillStyle = (D.forest3 && D.forest3.front1Bottom) || 'rgb(16,30,30)'; ctx.fillRect(0, bot - 2, W, H - bot + 2); } }
}
function drawEye(b) {                  // «лицо» титана на южной стене корпуса
  const e = LEVEL.eye, f = b.n[1]; if (f < 0.05) return;          // видно только со стороны лица
  const px = W / 2 + relU(e, b) * S, py = H / 2 - (e.y - cam.y) * S, w = 2.2 * S * f, h = 2.6 * S;
  ctx.fillStyle = 'rgb(18,26,36)'; ctx.beginPath(); ctx.moveTo(px - w / 2, py + h / 2); ctx.lineTo(px - w / 2, py - h * 0.15); ctx.lineTo(px, py - h / 2); ctx.lineTo(px + w / 2, py - h * 0.15); ctx.lineTo(px + w / 2, py + h / 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,244,225,0.35)'; ctx.lineWidth = Math.max(2, S * 0.05); ctx.stroke();
  const pulse = 0.8 + 0.2 * Math.sin(game.time * 1.7), R = 0.5 * S;
  const g = ctx.createRadialGradient(px, py, 0, px, py, R * 2.2); g.addColorStop(0, 'rgba(190,255,246,' + pulse.toFixed(2) + ')'); g.addColorStop(0.3, 'rgba(90,220,210,' + (0.9 * pulse).toFixed(2) + ')'); g.addColorStop(0.5, 'rgba(54,138,142,0.55)'); g.addColorStop(1, 'rgba(54,138,142,0)');
  ctx.save(); ctx.translate(px, py); ctx.scale(f, 1); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 2.2, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgb(6,18,26)'; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.16, R * 0.5, 0, 0, 7); ctx.fill(); ctx.restore();
}
function drawDoor(b) { }
// глаз титана (картинка автора) на лице кабины — рядом с дверью к мозгу, виден с востока
function eyeSpot() { if (LEVEL.eyeSpot !== undefined) return LEVEL.eyeSpot; const d = LEVEL.doors.find(q => q.cabin); if (!d) return (LEVEL.eyeSpot = null);
  let X = null; for (let x = d.x + 2; x > d.x - 6; x--) if (hasCube(x, d.y + 2, d.z - 4)) { X = x; break; } return (LEVEL.eyeSpot = X === null ? null : { x: X + 0.5, y: d.y - 0.05, z: d.z - 3.8 }); }
function drawEyeBig(e, b) { const I = img.Eye; if (!I || !I.width) return; const fc = b.n[0]; if (fc < 0.05) return;
  const gg = Math.max(1, Math.round(S / 40)), w = I.width * gg, h = I.height * gg, px = Math.round(W / 2 + relU(e, b) * S), py = Math.round(H / 2 - (e.y - cam.y) * S);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(px, 0); ctx.scale(fc, 1); ctx.drawImage(I, -Math.round(w / 2), py - h, w, h);
  { // v306 (Алексей: «второй огромный глаз слева, и пусть зрачками наблюдает за героем»): зрачок закрашен заново и смещён к герою
    const ex = (133 - I.width / 2) * gg, ey = py - h + 83 * gg, hx = (W / 2 + relU(hero, b) * S - px) / Math.max(0.2, fc), hy = H / 2 - (hero.y + 0.5 - cam.y) * S - ey, L = Math.hypot(hx - ex, hy) || 1, m = Math.min(5, L / gg / 14);
    const ox = Math.round((hx - ex) / L * m), oy = Math.round(hy / L * m), disk = (cx, cy, r, col) => { ctx.fillStyle = col; for (let y = -r; y <= r; y++) { const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.4)); ctx.fillRect(Math.round(ex + (cx - hw) * gg), Math.round(ey + (cy + y) * gg), (2 * hw + 1) * gg, gg); } };
    disk(0, 0, 26, '#1a2830'); disk(ox, oy, 21, '#07060a'); ctx.fillStyle = '#7fd1d8'; ctx.fillRect(Math.round(ex + (ox - 12) * gg), Math.round(ey + (oy - 12) * gg), 4 * gg, 4 * gg); ctx.fillRect(Math.round(ex + (ox - 6) * gg), Math.round(ey + (oy - 13) * gg), gg, gg); }   /* v306b (Алексей: «зрачок не как у людей — крупнее, к краям, без радужки») */
  ctx.restore();
  const k = 0.5 + 0.5 * Math.sin(game.time * 1.3); pixelGlow(px + Math.round(0.03 * w * fc), py - Math.round(h * 0.53), 0.6, 0.025 + 0.025 * k, '120,220,230'); }
const lanePos = (f, t) => [[t, 8], [8, -t], [-t, -8], [-8, t]][f % 4], lanePosR = (f, t, r) => [[t, r], [r, -t], [-t, -r], [-r, t]][f % 4];
const FLAGS = ['#e0702e', '#c9b79c', '#7fd1b0', '#c0392b', '#8f7fb8'];
function drawWire(w, b) {              // верёвка с флажками над пролётом
  const N = FACE_N[w.f % 4], fc = N[0] * b.n[0] + N[1] * b.n[1]; if (fc < -0.5) return;   // v240: гирлянда натянута в воздухе — объёмная, видна и сбоку (за ногой её закрывает нога)
  const A = lanePos(w.f, w.a), B = lanePos(w.f, w.b), g = Math.max(2, Math.round(S * 0.022));
  const ax = W / 2 + relU({ x: A[0], z: A[1] }, b) * S, ay = H / 2 - (w.ya - cam.y) * S, bx = W / 2 + relU({ x: B[0], z: B[1] }, b) * S, by = H / 2 - (w.yb - cam.y) * S;
  const n = Math.max(2, Math.round(Math.abs(bx - ax) / g)), sag = 0.3 * S, AX = Math.round(ax / g) * g, AY = Math.round(ay / g) * g, dX = Math.round(bx - ax), dY = Math.round(by - ay), wk = g + '|' + dX + '|' + dY + '|' + Math.round(sag);
  let cv = wireCache.get(wk); const pad = Math.ceil(sag) + 4 * g, L0 = Math.min(0, dX) - 2 * g, T0 = Math.min(0, dY) - 2 * g;
  if (!cv) { cv = document.createElement('canvas'); cv.width = Math.abs(dX) + 4 * g; cv.height = Math.abs(dY) + pad + 2 * g; const x = cv.getContext('2d'); x.fillStyle = '#2b2226';   // верёвка одной картинкой
    for (let i = 0; i <= n; i++) { const t = i / n; x.fillRect(Math.round((dX * t) / g) * g - L0, Math.round((dY * t + sag * 4 * t * (1 - t)) / g) * g - T0, g, g); }
    if (wireCache.size > 200) wireCache.clear(); wireCache.set(wk, cv); }
  ctx.drawImage(cv, AX + L0, AY + T0);
  for (let i = 4; i <= n; i += 9) {
    const t = i / n, px = Math.round((ax + (bx - ax) * t) / g) * g, py = Math.round((ay + (by - ay) * t + sag * 4 * t * (1 - t)) / g) * g;
    { const k = Math.floor(i / 9) + w.f, sw = Math.round(Math.sin(game.time * 2 + k) * 1); ctx.fillStyle = FLAGS[k % FLAGS.length]; ctx.fillRect(px - g + sw, py + g, g * 4, g * 5); ctx.fillStyle = 'rgba(6,18,26,0.25)'; ctx.fillRect(px - g + sw, py + g * 4, g * 4, g * 2); }
  }
}
// v263: трубы с листа Алексея (19.10, tex/PipeKit.png: прямые, муфты, пластины, колени, тройники, крестовины — вырезаны и сведены к одной палитре).
// Прямой кусок — тайл тела трубы (тело 14 точек, центр 8), муфта и пластина — вставки; колено — картинка, повёрнутая отражениями,
// ставится точкой пересечения осей рукавов на угол ломаной; длинные колени — только если рукава помещаются в соседние куски.
const PIPEKIT = {"tileH": {"r": [0, 0, 34, 16]}, "ringH": {"r": [36, 0, 9, 16]}, "plateH": {"r": [47, 0, 12, 16]}, "tileV": {"r": [61, 0, 16, 34]}, "ringV": {"r": [79, 0, 16, 9]}, "plateV": {"r": [97, 0, 16, 12]}, "elbowS1": {"r": [115, 0, 27, 28], "h": 1, "v": 1, "cx": 7.5, "cy": 6.5, "th": 12.0}, "elbowS2": {"r": [144, 0, 27, 29], "h": -1, "v": 1, "cx": 19.5, "cy": 6.5, "th": 12.0}, "elbowL": {"r": [173, 0, 43, 47], "h": 1, "v": -1, "cx": 8.0, "cy": 38.0, "th": 15.0}, "elbowLJ": {"r": [218, 0, 43, 47], "h": -1, "v": -1, "cx": 34.5, "cy": 38.0, "th": 15.5}, "elbowR": {"r": [263, 0, 43, 48], "h": 1, "v": -1, "cx": 6.5, "cy": 38.0, "th": 12.5}, "elbowRJ": {"r": [308, 0, 43, 48], "h": -1, "v": -1, "cx": 35.0, "cy": 38.5, "th": 14.5}, "teeA": {"r": [353, 0, 39, 27]}, "teeB": {"r": [394, 0, 36, 27]}, "cross1": {"r": [432, 0, 36, 37]}, "cross2": {"r": [470, 0, 35, 37]}, "body": {"top": 1, "bot": 15}};
const pkImg = () => { const I = img.PipeKit; return I && I.width ? I : null; };
function pkStraight(x0, y0, lw, lh, hsh, dull) {   // прямая труба по ките; true — нарисовано
  const I = pkImg(); if (!I) return false; const T2 = Math.round(S * 0.26), k = T2 / 14, vert = lh > lw, g = Math.max(2, Math.round(S * 0.03)); ctx.imageSmoothingEnabled = false;
  const t = PIPEKIT[vert ? 'tileV' : 'tileH'].r, L = Math.max(2, Math.round((vert ? t[3] : t[2]) * k)), th = Math.round(16 * k), off = Math.round(8 * k);
  if (vert) { for (let yy = y0; yy < y0 + lh; yy += L) { const hh = Math.min(L, y0 + lh - yy); ctx.drawImage(I, t[0], t[1], t[2], t[3] * hh / L, x0 - off, yy, th, hh); } }
  else if (lw > 2) { for (let xx = x0; xx < x0 + lw; xx += L) { const ww = Math.min(L, x0 + lw - xx); ctx.drawImage(I, t[0], t[1], t[2] * ww / L, t[3], xx, y0 - off, ww, th); } }
  else return true;
  const len = vert ? lh : lw, step = (3 + (hsh % 3)) * S; let j = 0;   // муфты, иногда пластина с болтами
  for (let p = (1.2 + (hsh % 4) * 0.4) * S; p < len - 0.6 * S; p += step, j++) { const kind = (hsh + j) % 5 === 0 ? 'plate' : 'ring', r = PIPEKIT[kind + (vert ? 'V' : 'H')].r, wv = Math.round(r[2] * k), hv = Math.round(r[3] * k);
    if (vert) ctx.drawImage(I, r[0], r[1], r[2], r[3], x0 - off, Math.round(y0 + p - hv / 2), wv, hv); else ctx.drawImage(I, r[0], r[1], r[2], r[3], Math.round(x0 + p - wv / 2), y0 - off, wv, hv); }
  if (!vert && hsh % 2 === 0 && !dull) for (let xx = x0 + g * 3, j2 = 0; xx < x0 + lw - g * 3; xx += g * (2 + (hsh + j2) % 4), j2++) if ((hsh * 7 + j2 * 13) % 5 < 3) { ctx.fillStyle = j2 % 2 ? '#7a8840' : '#56632f'; ctx.fillRect(xx, y0 - off, g * (1 + (j2 % 2)), g); }   // мох сверху
  if (dull) { ctx.fillStyle = 'rgba(100,104,118,0.55)'; if (vert) ctx.fillRect(x0 - T2 / 2 - 2 * g, y0 - T2, T2 + 4 * g, lh + 2 * T2); else ctx.fillRect(x0 - T2, y0 - T2 / 2 - 2 * g, lw + 2 * T2, T2 + 4 * g); }
  return true;
}
function pkCap(p, o, b) {   // муфта на видимом конце трубы
  const I = pkImg(); if (!I) return; const T2 = Math.round(S * 0.26), k = T2 / 14, x = Math.round(W / 2 + relU({ x: p[0], z: p[2] }, b) * S), y = Math.round(H / 2 - (p[1] - cam.y) * S), ox = W / 2 + relU({ x: o[0], z: o[2] }, b) * S, oy = H / 2 - (o[1] - cam.y) * S;
  if (Math.hypot(ox - x, oy - y) < 3) return; const vert = Math.abs(oy - y) > Math.abs(ox - x), r = PIPEKIT[vert ? 'ringV' : 'ringH'].r, wv = Math.round(r[2] * k), hv = Math.round(r[3] * k), off = Math.round(8 * k); ctx.imageSmoothingEnabled = false;
  if (vert) ctx.drawImage(I, r[0], r[1], r[2], r[3], x - off, oy > y ? y : y - hv, wv, hv); else ctx.drawImage(I, r[0], r[1], r[2], r[3], ox > x ? x : x - wv, y - off, wv, hv);
}
function pkElbow(cx, cy, hz, vt, hsh) {   // колено: hz/vt — до соседних точек по горизонтали/вертикали (экран); true — нарисовано
  const I = pkImg(); if (!I) return false; const T2 = Math.round(S * 0.26), H = Math.sign(hz[0]) || 1, V = Math.sign(vt[1]) || 1, lh = Math.abs(hz[0]), lv = Math.abs(vt[1]);
  const fits = n => { const m = PIPEKIT[n], ks = T2 / m.th, r = m.r, ah = (m.h > 0 ? r[2] - m.cx : m.cx) * ks, av = (m.v > 0 ? r[3] - m.cy : m.cy) * ks; return ah <= lh + T2 * 0.3 && av <= lv + T2 * 0.3; };
  const L = ['elbowS1', 'elbowS2', 'elbowL', 'elbowLJ', 'elbowR', 'elbowRJ'].filter(fits), big = L.filter(n => !/S\d$/.test(n)), pool = big.length && hsh % 3 !== 0 ? big : L.length ? L.filter(n => /S\d$/.test(n)) : ['elbowS1'];
  const n = pool[hsh % pool.length] || 'elbowS1', m = PIPEKIT[n], r = m.r, ks = T2 / m.th; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(cx), Math.round(cy)); ctx.scale(H / m.h, V / m.v);
  ctx.drawImage(I, r[0], r[1], r[2], r[3], Math.round(-m.cx * ks), Math.round(-m.cy * ks), Math.round(r[2] * ks), Math.round(r[3] * ks)); ctx.restore(); return true;
}
// колено: дуга из поперечного среза трубы — тот же цвет и блики, что у прямых кусков
function pipeElbow(a, c, n, b) {   // колено — картинка автора с листа паровой машины (вход слева, выход вниз), повёрнутая отражениями; v263: сначала — с листа труб (pkElbow)
  const SP = img.Steam, M = typeof STEAMP !== 'undefined' ? STEAMP : null; if (!pkImg() && (!SP || !SP.width || !M || !M.elbow)) return; const r = M.elbow, T2 = Math.round(S * 0.26), k = T2 / 30, sp = p => [W / 2 + relU({ x: p[0], z: p[2] }, b) * S, H / 2 - (p[1] - cam.y) * S];
  const [ax, ay] = sp(a), [cx, cy] = sp(c), [nx, ny] = sp(n), ds = [[ax - cx, ay - cy], [nx - cx, ny - cy]], hz = ds.find(d => Math.abs(d[0]) > Math.abs(d[1])), vt = ds.find(d => Math.abs(d[1]) >= Math.abs(d[0])); if (!hz || !vt) return;
  if (pkElbow(cx, cy, hz, vt, Math.abs(Math.round(c[0] * 7 + c[1] * 13 + c[2] * 31)))) return;   /* v263: колено с листа Алексея */
  const fx = hz[0] > 0 ? -1 : 1, fy = vt[1] < 0 ? -1 : 1; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(cx), Math.round(cy)); ctx.scale(fx, fy);
  ctx.drawImage(SP, r[0], r[1], r[2], r[3], Math.round(-87.5 * k), Math.round(-17 * k), Math.round(r[2] * k), Math.round(r[3] * k)); ctx.restore();
}
// труба уходит в стену: клёпаный фланец поперёк трубы
function heroBeam() {   // горизонтальная труба под ногами героя (верх трубы = ноги, герой над самой трубой в пространстве); end — видна с торца
  if (hero.state === 'dead' || !hero.onGround || hero.ladder || hero.hang || cam.y > 2500) return null;
  for (const bm of LEVEL.beams || []) { const a = bm[0], c = bm[1]; if (Math.abs(a[1] + 0.13 - hero.y) > 0.06) continue;
    const dx = c[0] - a[0], dz = c[2] - a[2], L2 = dx * dx + dz * dz || 1, s = Math.max(0, Math.min(1, ((hero.x - a[0]) * dx + (hero.z - a[2]) * dz) / L2));
    if (Math.hypot(hero.x - a[0] - dx * s, hero.z - a[2] - dz * s) > 0.5) continue;
    const along = Math.abs(dx * view.r[0] + dz * view.r[1]) / Math.sqrt(L2); return { a, c, end: along < 0.5 && !view.rotating, p: [a[0] + dx * s, a[1], a[2] + dz * s] }; }
  return null; }
// v294 (Алексей: «чтобы хук больше напоминал верёвку с крюком, а не палку»): верёвка провисает, пока крюк летит или возвращается,
// натягивается с дрожью, когда впился; пиксельная, в два тона (свита из волокон); на конце — кошка с тремя зубьями
function drawHookRope(h, hx, hy, tx, ty, o) {
  const px = Math.max(2, Math.round(S * 0.026)), L = Math.hypot(tx - hx, ty - hy), pulled = h.state === 'pullHero' || h.state === 'latch' || h.state === 'pullRobot' || h.state === 'toRobot';
  const sl = h.state === 'back' ? 0.9 : pulled ? 0 : (h.slack !== undefined ? h.slack : 0.5), wob = pulled ? Math.sin(h.t * 26) * Math.exp(-h.t * 6) * 0.08 : 0;
  const nx = -(ty - hy) / (L || 1), ny = (tx - hx) / (L || 1), sag = L * (0.22 * sl), mx = (hx + tx) / 2 + nx * wob * L, my = (hy + ty) / 2 + sag + ny * wob * L;
  const n = Math.max(2, Math.ceil(L / (px * 0.5))); ctx.save();
  for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), bq = 2 * (1 - t) * t, c = t * t, x = Math.round((a * hx + bq * mx + c * tx) / px) * px, y = Math.round((a * hy + bq * my + c * ty) / px) * px;
    ctx.fillStyle = (i >> 2) % 2 ? '#6b5560' : '#2a1a20'; ctx.fillRect(x - (px >> 1), y - (px >> 1), px, px); }
  // кошка: угол — по последнему отрезку верёвки
  const t2 = 0.9, ex = (1 - t2) * (1 - t2) * hx + 2 * (1 - t2) * t2 * mx + t2 * t2 * tx, ey = (1 - t2) * (1 - t2) * hy + 2 * (1 - t2) * t2 * my + t2 * t2 * ty, ang = Math.atan2(ty - ey, tx - ex);
  ctx.translate(Math.round(tx), Math.round(ty)); ctx.rotate(ang); const cp = Math.max(2, Math.round(S * 0.032)), P = (x, y, w, hh, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x * cp), Math.round(y * cp), Math.round(w * cp), Math.round(hh * cp)); };
  P(-3, -0.5, 3, 1, '#4a4248'); P(-1, -1, 1, 2, '#8a8088');   // стержень и кольцо
  P(0, -0.5, 1, 1, '#b8b0b4'); P(0, -2, 1, 1.5, '#8a8088'); P(-1, -3, 1, 1, '#b8b0b4'); P(0, 0.5, 1, 1.5, '#8a8088'); P(-1, 2, 1, 1, '#b8b0b4'); P(1, -0.5, 1, 1, '#d8d0d4');   // зубья назад-в-стороны и острие
  ctx.restore();
}
function drawPipeEnd(B, b) {   // труба с торца: круглый срез с ободом, цвета трубы
  const g = Math.max(2, Math.round(S * 0.03)), R = g * 4, x = Math.round(W / 2 + relU({ x: B.p[0], z: B.p[2] }, b) * S), y = Math.round(H / 2 - (B.p[1] - cam.y) * S);
  // v291 (Алексей: «игра лагает»): срез рисовался заново по ~60 квадратикам на каждый торец каждый кадр (до 1800 вызовов за кадр) — теперь готовая картинка на размер
  const key = g + ':' + R; let c = PIPE_END_C.get(key);
  if (!c) { c = document.createElement('canvas'); c.width = c.height = 2 * R; const x2 = c.getContext('2d');
    for (let j = -R; j < R; j += g) for (let i = -R; i < R; i += g) { const r = Math.hypot(i + g / 2, j + g / 2); if (r > R) continue; x2.fillStyle = r > R - g * 1.2 ? '#231d21' : r > R - g * 2.2 ? (j < 0 ? '#5a4f55' : '#3a3237') : '#120e10'; x2.fillRect(R + i, R + j, g, g); }
    PIPE_END_C.set(key, c); }
  ctx.drawImage(c, x - R, y - R);
}
const PIPE_END_C = new Map();
function pipeFlange(p, o, b) {
  const SP = img.Steam, M = typeof STEAMP !== 'undefined' ? STEAMP : null; const T2 = Math.round(S * 0.26), x = W / 2 + relU({ x: p[0], z: p[2] }, b) * S, y = H / 2 - (p[1] - cam.y) * S, ox = W / 2 + relU({ x: o[0], z: o[2] }, b) * S, oy = H / 2 - (o[1] - cam.y) * S;
  const vert = Math.abs(oy - y) > Math.abs(ox - x), d = T2 * 1.45, t = Math.max(3, T2 * 0.4); ctx.imageSmoothingEnabled = false;
  if (SP && SP.width && M) { const r = M.flange; if (vert) ctx.drawImage(SP, r[0], r[1] + r[3] * 0.3, r[2], r[3] * 0.4, Math.round(x - d / 2), Math.round(y - t / 2), Math.round(d), Math.round(t)); else ctx.drawImage(SP, r[0] + r[2] * 0.3, r[1], r[2] * 0.4, r[3], Math.round(x - t / 2), Math.round(y - d / 2), Math.round(t), Math.round(d)); }
  else { ctx.fillStyle = '#4a4248'; if (vert) ctx.fillRect(Math.round(x - d / 2), Math.round(y - t / 2), Math.round(d), Math.round(t)); else ctx.fillRect(Math.round(x - t / 2), Math.round(y - d / 2), Math.round(t), Math.round(d)); }
}
function drawPipeSeg(a, c, b, hsh, dull, tA, tC, bent) {    // один прямой кусок трубы между двумя точками в пространстве, с муфтами на концах
  const g = Math.max(2, Math.round(S * 0.03)), wd = g * 8, C0 = dull ? '#857d82' : '#3a3237', C1 = dull ? '#958d91' : '#5a4f55', C2 = dull ? '#766e74' : '#231d21';   // труба не на этой стороне — блёклая, под цвет стены
  const ax = Math.round(W / 2 + relU({ x: a[0], z: a[2] }, b) * S), ay = Math.round(H / 2 - (a[1] - cam.y) * S), cx = Math.round(W / 2 + relU({ x: c[0], z: c[2] }, b) * S), cy = Math.round(H / 2 - (c[1] - cam.y) * S);
  { const rr = Math.round(S * 0.26 * 0.5), dx = Math.sign(cx - ax), dy = Math.sign(cy - ay); let ax2 = ax, ay2 = ay, cx2 = cx, cy2 = cy;   // у колена труба короче: дугу рисует pipeElbow
    if (tA) { ax2 += dx * rr; ay2 += dy * rr; } if (tC) { cx2 -= dx * rr; cy2 -= dy * rr; } if (tA || tC) return drawPipeSegPx(ax2, ay2, cx2, cy2, b, hsh, dull, bent); }
  return drawPipeSegPx(ax, ay, cx, cy, b, hsh, dull, bent);
}
let steamPipeT = null;
function steamPipeTiles() { if (steamPipeT) return steamPipeT; const SP = img.Steam, M = typeof STEAMP !== 'undefined' ? STEAMP : null; if (!SP || !SP.width || !M || !M.elbow) return null; const r = M.elbow;
  const h = document.createElement('canvas'); h.width = 32; h.height = 31; { const x = h.getContext('2d'); for (let i = 0; i < 32; i++) x.drawImage(SP, r[0] + 20, r[1] + 2, 1, 31, i, 0, 1, 31); }   // горизонталь: один срез рукава колена — ровная, без стыков
  const v = document.createElement('canvas'); v.width = 28; v.height = 22; { const x = v.getContext('2d'); for (let j = 0; j < 28; j++) x.drawImage(SP, r[0] + 20, r[1] + 2 + Math.floor(j * 31 / 28), 1, 1, j, 0, 1, 22); }   /* вертикаль — тот же срез, повёрнутый: один и тот же металл */   // вертикаль: нижний рукав колена
  return (steamPipeT = { h, v }); }
function drawPipeSegPx(ax, ay, cx, cy, b, hsh, dull, bent) {
  const g = Math.max(2, Math.round(S * 0.03)), wd = g * 8, C0 = dull ? '#857d82' : '#3a3237', C1 = dull ? '#958d91' : '#5a4f55', C2 = dull ? '#766e74' : '#231d21';
  if (Math.max(ax, cx) < -wd || Math.min(ax, cx) > W + wd || Math.max(ay, cy) < -wd || Math.min(ay, cy) > H + wd) return;
  const x0 = Math.min(ax, cx), y0 = Math.min(ay, cy), lw = Math.abs(ax - cx), lh = Math.abs(ay - cy);
  if (!dull) { ctx.fillStyle = 'rgba(8,6,16,0.2)'; if (lh > lw) ctx.fillRect(x0 - wd / 2 + g * 3, y0 + g * 2, wd, lh); else if (lw > 2) ctx.fillRect(x0 + g * 2, y0 - wd / 2 + g * 3, lw, wd); }   // тень трубы на стене
  if (pkStraight(x0, y0, lw, lh, hsh, dull)) return;   /* v263: труба с листа Алексея (и с коленями, и без) */
  if (bent && steamPipeTiles()) { const t = steamPipeT, T2 = Math.round(S * 0.26), k = T2 / 30, vert = lh > lw; ctx.imageSmoothingEnabled = false;   /* труба с коленями: тот же металл, та же толщина, что у колена */
    if (vert) { const L = Math.max(2, Math.round(22 * k)), w = Math.round(28 * k); for (let yy = y0; yy < y0 + lh; yy += L) { const hh = Math.min(L, y0 + lh - yy); ctx.drawImage(t.v, 0, 0, 28, 22 * hh / L, Math.round(x0 + (88 - 87.5 - 14) * k), yy, w, hh); } }
    else if (lw > 2) { const L = Math.max(2, Math.round(32 * k)), h = Math.round(31 * k); for (let xx = x0; xx < x0 + lw; xx += L) { const ww = Math.min(L, x0 + lw - xx); ctx.drawImage(t.h, 0, 0, 32 * ww / L, 31, xx, Math.round(y0 + (2 - 17) * k), ww, h); } }
    if (dull) { ctx.fillStyle = 'rgba(100,104,118,0.55)'; if (vert) ctx.fillRect(x0 - T2 / 2 - 2 * g, y0 - T2, T2 + 4 * g, lh + 2 * T2); else ctx.fillRect(x0 - T2, y0 - T2 / 2 - 2 * g, lw + 2 * T2, T2 + 4 * g); }
    return; }
  { const P2 = img.pipe2, vert = lh > lw; ctx.imageSmoothingEnabled = false; if (P2 && P2.width) {   // труба с референса автора: сегменты с муфтами, чуть холоднее стен
      const T2 = Math.round(S * 0.26), k2 = T2 / 50, L2 = Math.max(4, Math.round(48 * k2)), C2 = Math.max(2, Math.round(14 * k2));   // цельная труба; муфта — редко, раз в несколько кубов
      const collars = len => { const out = []; for (let p = (1.6 + (hsh % 3)) * S; p < len - 0.7 * S; p += (4 + (hsh % 2) * 1.5) * S) out.push(Math.round(p)); return out; };
      if (vert) { for (let yy = y0 + lh; yy > y0; yy -= L2) { const hh = Math.min(L2, yy - y0); ctx.drawImage(P2, 0, 48 - 48 * hh / L2, 50, 48 * hh / L2, x0 - T2 / 2, yy - hh, T2, hh); }
      }
      else if (lw > 2) { for (let xx = x0; xx < x0 + lw; xx += L2) { const ww = Math.min(L2, x0 + lw - xx); ctx.drawImage(P2, 0, 52, 48 * ww / L2, 50, xx, y0 - T2 / 2, ww, T2); }

        if (hsh % 2 === 0 && !dull) for (let xx = x0 + g * 3, j = 0; xx < x0 + lw - g * 3; xx += g * (2 + (hsh + j) % 4), j++) if ((hsh * 7 + j * 13) % 5 < 3) { ctx.fillStyle = j % 2 ? '#7a8840' : '#56632f'; ctx.fillRect(xx, y0 - T2 / 2 - g, g * (1 + (j % 2)), g); } }
      // стыков нет: на углах труба просто продолжается — кусок соседнего сегмента закрывает угол
      if (dull) { ctx.fillStyle = 'rgba(100,104,118,0.55)'; if (vert) ctx.fillRect(x0 - T2 / 2 - 2 * g, y0 - T2, T2 + 4 * g, lh + 2 * T2); else ctx.fillRect(x0 - T2, y0 - T2 / 2 - 2 * g, lw + 2 * T2, T2 + 4 * g); }
      return; }
  }
  const P3 = img.props3; if (P3 && P3.width) {   // труба автора: тайл вдоль длины, муфты на концах; дальняя — в дымке
    const k = S / 40, T = Math.round(10 * k), vert = lh > lw; ctx.imageSmoothingEnabled = false;
    if (vert) { const q = PROPS3.pipeV, L = Math.round(q[3] * k); for (let yy = y0; yy < y0 + lh; yy += L) { const hh = Math.min(L, y0 + lh - yy); ctx.drawImage(P3, q[0], q[1], q[2], q[3] * hh / L, x0 - T / 2, yy, T, hh); } }
    else if (lw > 2) { const q = PROPS3.pipeH, L = Math.round(q[2] * k); for (let xx = x0; xx < x0 + lw; xx += L) { const ww = Math.min(L, x0 + lw - xx); ctx.drawImage(P3, q[0], q[1], q[2] * ww / L, q[3], xx, y0 - T / 2, ww, T); }
      if (hsh % 2 === 0 && !dull) for (let xx = x0 + g * 3, j = 0; xx < x0 + lw - g * 3; xx += g * (2 + (hsh + j) % 4), j++) if ((hsh * 7 + j * 13) % 5 < 3) { ctx.fillStyle = j % 2 ? '#7a8840' : '#56632f'; ctx.fillRect(xx, y0 - T / 2 - g, g * 2, g * (1 + (j + hsh) % 2)); } }
    for (const q of [[ax, ay], [cx, cy]]) { const m = T / 2 + g; ctx.fillStyle = '#18141c'; ctx.fillRect(q[0] - m - g, q[1] - m - g, 2 * m + 2 * g, 2 * m + 2 * g); ctx.fillStyle = '#6e6a70'; ctx.fillRect(q[0] - m, q[1] - m, 2 * m, 2 * m); ctx.fillStyle = '#928f8a'; ctx.fillRect(q[0] - m, q[1] - m, 2 * m, g); ctx.fillStyle = '#32303a'; ctx.fillRect(q[0] - m, q[1] + m - g, 2 * m, g); }
    if (dull) { ctx.fillStyle = 'rgba(100,104,118,0.55)'; if (vert) ctx.fillRect(x0 - T / 2 - 2 * g, y0 - T, T + 4 * g, lh + 2 * T); else ctx.fillRect(x0 - T, y0 - T / 2 - 2 * g, lw + 2 * T, T + 4 * g); }
    return; }
  if (lh > lw) {                        // вертикальный
    ctx.fillStyle = C0; ctx.fillRect(x0 - wd / 2, y0, wd, lh); ctx.fillStyle = C1; ctx.fillRect(x0 - wd / 2 + g, y0, g * 2, lh); ctx.fillStyle = C2; ctx.fillRect(x0 + wd / 2 - g, y0, g, lh);
    for (let yy = y0 + lh - 1.3 * S; yy > y0 + S * 0.5; yy -= 2 * S) { ctx.fillStyle = C0; ctx.fillRect(x0 - wd / 2 - g, Math.round(yy), wd + 2 * g, 4 * g); ctx.fillStyle = C1; ctx.fillRect(x0 - wd / 2 - g, Math.round(yy), wd + 2 * g, g); }
  } else if (lw > 2) {                  // горизонтальный; на некоторых сверху мох
    ctx.fillStyle = C0; ctx.fillRect(x0, y0 - wd / 2, lw, wd); ctx.fillStyle = C1; ctx.fillRect(x0, y0 - wd / 2 + g, lw, g * 2); ctx.fillStyle = C2; ctx.fillRect(x0, y0 + wd / 2 - g, lw, g);
    if (hsh % 2 === 0 && !dull) for (let xx = x0 + g * 3, j = 0; xx < x0 + lw - g * 3; xx += g * (2 + (hsh + j) % 4), j++) if ((hsh * 7 + j * 13) % 5 < 3) { ctx.fillStyle = j % 2 ? '#6d7a3a' : '#4e5a2c'; ctx.fillRect(xx, y0 - wd / 2 - g, g * 2, g * (1 + (j + hsh) % 2)); if ((j + hsh) % 6 === 0) { ctx.fillStyle = '#9a9c56'; ctx.fillRect(xx, y0 - wd / 2 - g * 3, g, g * 2); } }
  }
  for (const q of [[ax, ay], [cx, cy]]) { ctx.fillStyle = C0; ctx.fillRect(q[0] - wd / 2 - g, q[1] - wd / 2 - g, wd + 2 * g, wd + 2 * g); ctx.fillStyle = C1; ctx.fillRect(q[0] - wd / 2 - g, q[1] - wd / 2 - g, wd + 2 * g, g); ctx.fillStyle = C2; ctx.fillRect(q[0] - wd / 2 - g, q[1] + wd / 2, wd + 2 * g, g); }
}
const ghostC = { c: null, n: 0 };
// v280: что рисуется среди граней — общий список (основной проход и проход «внутри руки»: armPass — кусок руки, тогда только то, что бывает на руке)
function buildActors(b, relD, actors) {
  if (!armPass) if (LEVEL.door) actors.push({ _d: relD(LEVEL.door) - 8.4, draw: () => drawDoor(b) });
  if (!armPass) if (LEVEL.eye) actors.push({ _d: relD(LEVEL.eye) + 0.2, draw: () => drawEye(b) });
  if (!armPass) { const e = eyeSpot(); if (e && Math.abs(e.y - cam.y) < H / S) { actors.push({ _d: relD(e) + 0.02, draw: () => drawEyeBig(e, b) }); const e2 = { x: e.x - b.r[0] * 7.2, y: e.y + 0.6, z: e.z - b.r[1] * 7.2 }; actors.push({ _d: relD(e) + 0.02, draw: () => drawEyeBig(e2, b) }); } }   /* v306: второй глаз слева */
  if (heroHere() && hero.state !== 'dead' && !hero.inDoor && !hero.ladder && !hero.hang && !hero.ride && !(hero.standOn && robots.indexOf(hero.standOn) >= 0) && !(hero.standOn && gears.includes(hero.standOn))) { const fy = hero.onGround ? hero.y : shadowFloor(hero, 0); if (fy !== null) { const k = 1 - (hero.y - fy) / 3.2; if (k > 0.12) actors.push({ _d: relD(hero) + 0.53, draw: () => drawShadow(b, hero, 0, fy, 0.5, k) }); } }
  for (const r of robots) { if (pkSkip(r.y)) continue;   /* v284: роботы на руках — в проходе своего куска */
    const d = relD(r);
    if (!r.dead && !r.lift && (r.atk && r.atk.drop || !robotHidden(r) || r.vis > 0.3)) { const A = r.atk;
      if (A && A.drop && !A.done) { const k = Math.min(1, Math.max(0, (A.t + 0.75) / 1.5)); actors.push({ _d: relD(A.land) + 0.53, draw: () => drawShadow(b, A.land, 0, A.land.y, 1.5, k, true) }); }   // место падения: густая тень растёт, пока робот летит
      else { const air = (A && A.type === 'jump') || r.drop || r.onCloud, fy = air ? shadowFloor(r, r.sh) : r.y; if (fy !== null && fy <= r.y + 0.05) { const k = 1 - (r.y - fy) / 4; if (k > 0.12) actors.push({ _d: d + 0.53, draw: () => drawShadow(b, r, r.sh, fy, 0.8, k) }); } } }
    if (!r.dead && !(r.vis > 0.02) && robotHidden(r)) continue;
    if (r.clone && !r.dead && typeof drawClone === 'function') { actors.push({ _d: d + 0.6, draw: () => drawClone(r, b) }); continue; }   /* v310: клон героя */
    actors.push({ rb: r.y > LEVEL.pelY - 3 && r.y < LEVEL.pelY + 17, _d: (hero.forkP && hero.forkP.r === r) || (hero.hideN && !r.dead && Math.abs(toU(r) - toU(hero)) < 1.4) ? Math.max(relD(hero) + 0.7, d + 0.6) : d + (r.dead ? 0.55 : 0.6), draw: () => {   /* робот, идущий мимо ниши, всегда перед героем */ const va = r.dead || r.vis === undefined ? 1 : Math.min(1, r.vis); if (va < 0.999) ctx.globalAlpha = va;
      const rs = robotSprite(r), name = rs.name, flip = rs.flip, ch = r.dead ? 0 : r.charge || 0, rg = !r.dead && r.rage > 0, fog0 = rg ? 0.1 + (r.rage < 2 ? 0.12 * Math.max(0, Math.sin(game.time * 26)) : 0) : ch > 0 ? 0.08 * Math.min(1, ch / 0.25) + 0.03 * Math.max(0, Math.sin(ch * 22)) * ch : 0, tint0 = rg || ch > 0 ? '255,30,10' : undefined, wetK = r.wet > 0 ? Math.min(1, r.wet) : 0, fogA = fog0 > 0.02 ? fog0 : r.rust ? 0.36 + 0.06 * wetK : 0.1 * wetK, tintA = fog0 > 0.02 ? tint0 : r.rust ? (wetK > 0 ? '52,40,38' : '58,36,24') : '70,150,255', chK = 0.88 * (r.char || 0), fog = chK > fogA ? chK : fogA, tint = chK > fogA ? '14,10,10' : tintA;   // обугливается: чем дольше в огне, тем чернее   // перед выстрелом секунду краснеет
      const ru = relU(r, b) + rs.ox + (r.dead ? 0 : (r.sh || 0) + (r.ash || 0)) + (r.shockT > 0 ? (Math.sin(game.time * 97 + r.tx) > 0 ? 1 : -1) * 0.04 : 0),   /* шок: робота трясёт */ q = r.dead ? 0 : (r.sq || 0), ry = r.y - (r.dip || 0) + 0.39;   // идёт вглубь — покачивается в такт шагам
      if (rg) pixelGlow(W / 2 + ru * S, H / 2 - (r.y + 0.4 - cam.y) * S, 1.05, 0.085 * (0.8 + 0.2 * Math.sin(game.time * 9)) * (r.rage < 2 ? 1.5 : 1), '255,40,30');   // красная аура, как свет от лампы
      const clipped = robotClip(r, b);   /* v298: за углом — обрезан краем стены */
      squash(ru, r.y + (r.dead ? 0 : r.kh || 0), 1 - q * 0.5, 1 + q, r.dead ? 0 : r.tilt || 0, () => { ctx.translate(0, -(r.dead ? 0 : r.kh || 0) * S); const crb = r.dead && r.crumb > 0; if (crb) { const cy0 = Math.round(H / 2 - (r.y + 0.62 * (1 - r.crumb) - cam.y) * S); ctx.save(); ctx.beginPath(); ctx.rect(0, cy0, W, H - cy0); ctx.clip(); }
        if (r.headless && !r.dead) { const ny = Math.round(H / 2 - (r.y + 0.64 - cam.y) * S); ctx.save(); ctx.beginPath(); ctx.rect(0, ny, W, H - ny); ctx.clip(); drawSprite(name, ru, ry, flip, undefined, fog, tint); ctx.restore();
          const g = Math.max(2, Math.round(S * 0.03)), nx = Math.round(W / 2 + ru * S); ctx.fillStyle = '#1c1719'; ctx.fillRect(nx - 2 * g, ny - g, 4 * g, g); ctx.fillStyle = Math.sin(game.time * 40) > 0 ? '#ffce46' : '#ff7014'; ctx.fillRect(nx - g, ny - 2 * g, g, g); }
        else if (r.dead && r.noHead) {     // труп без головы: в кадрах смерти голова лежит рядом — её не рисуем, она улетела
          const bo = ((game.time - r.diedAt < 0.35 ? 45 : 33) - 82.46) / 100, X = Math.round(W / 2 + (ru + (flip ? -bo : bo)) * S); ctx.save(); ctx.beginPath(); if (flip) ctx.rect(0, 0, X, H); else ctx.rect(X, 0, W - X, H); ctx.clip(); drawSprite(name, ru, ry, flip, undefined, fog, tint); ctx.restore(); }
        else if (r.headWreck) { const cx = Math.round(W / 2 + (ru + (flip ? 0.37 : -0.37)) * S); ctx.save(); ctx.beginPath(); if (flip) ctx.rect(0, 0, cx, H); else ctx.rect(cx, 0, W - cx, H); ctx.clip(); drawSprite(name, ru, ry, flip, undefined, fog, tint); ctx.restore(); }
        else drawSprite(name, ru, ry, flip, undefined, fog, tint);
        if (r.shield && !r.dead && !r.headless) { const oy = r.y + 1.2 + 0.04 * Math.sin(game.time * 3 + r.tx), fr = (Math.floor(game.time * 10 + r.hx * 3 + r.tz) % 8 + 8) % 8, g1 = Math.max(1, Math.round(S * 0.022));   // знак щитоносца: щиток вертится внутри кольца
          drawShieldCoin(Math.round(W / 2 + ru * S), Math.round(H / 2 - (oy - 0.215 - cam.y) * S), g1, Math.cos(game.time * 4 + r.tx)); drawSprite('RING_' + fr, ru, oy, false); }
        if ((r.flashT > 0 || (r.shT > 0 && Math.sin(game.time * 70) > -0.2) || (r.shockT > 0 && Math.sin(game.time * 55) > 0)) && !r.headless) { ctx.globalCompositeOperation = 'lighter'; drawSprite(name, ru, ry, flip, 0.7); ctx.globalCompositeOperation = 'source-over'; }
        if (crb) ctx.restore();
      }); if (clipped) ctx.restore(); ctx.globalAlpha = 1;
    } });
  }
  if (!armPass) for (const h of heads) actors.push({ _d: relD(h) + 0.72, draw: () => drawHead(h, b) });
  if (!armPass) for (const q of bolts) actors.push({ _d: relD(q) + 0.7, draw: () => drawBolt(q, b) });
  if (!armPass) for (const q of jets) actors.push({ _d: relD(q.robot) + 0.7, draw: () => drawSteam(q, b) });
  for (const L of LEVEL.lamps) { if (offView(L, 3)) continue; const ra = L.armP ? 1 : reachA(L.x, L.z, b); if (ra <= 0) continue; actors.push({ _d: relD(L) + 0.25, draw: () => withA(ra, () => drawLamp(L, b, false)) }); actors.push({ _d: relD(L) + 0.95, draw: () => withA(ra, () => drawLamp(L, b, true)) }); }   /* v266: далеко — не видно */
  if (!armPass) for (const r of robots) if (!r.dead && r.burn > 0 && !r.away) actors.push({ _d: relD(r) + 0.58, draw: () => drawFire(HERO_FL, relU(r, b) + (r.sh || 0), r.y + 0.05, 1) });
  let heroAct = null; if (heroHere() && !(hero.state === 'dead' && hero.deadT > 0.5 && !hero.burstDead) && !hero.inDoor) actors.push(heroAct = { _d: relD(hero) + 0.62, draw: () => drawHero(b, 1) });
  if (!armPass) if (LEVEL.exit) actors.push({ _d: relD(LEVEL.exit) + 0.06, draw: () => drawRecess(b) });
  for (const d of doors) { if (offView(d, 3)) continue; const N = FACE_N[d.f]; actors.push({ _d: relD({ x: d.x - N[0] * 0.44, z: d.z - N[1] * 0.44 }), draw: () => drawDoorAt(d, b) }); }
  if (!armPass) for (const r of robots) if (r.key && !r.dead && !r.keyDone && !offView(r, 2) && !robotHidden(r)) actors.push({ _d: relD(r) + 0.62, draw: () => drawKey({ x: r.x + (r.sh || 0) * view.r[0], y: r.y + 1.35, z: r.z + (r.sh || 0) * view.r[1], ph: 0, small: true }, b) });   // над роботом с ключом — крутящийся ключ
  for (const o of keyItems) if (!o.got && !o.hid && !offView(o, 2)) { const sv = sideVis(o, b); if (sv > 0) actors.push({ _d: relD(o) + 0.58, draw: () => withA(sv, () => drawKey(o, b)) }); }
  if (!armPass) for (const L of lifts) { const ab = hero.standOn === L && hero.state !== 'dead'; actors.push({ _d: ab ? Math.max(relD(L), relD(hero)) + 0.3 : relD(L) + 0.28, draw: () => drawLift(L, b) }); }   // сбоку люлька висит у угла ноги перед кубами
  if (!armPass) for (const M of movers) actors.push({ _d: relD(M) + 0.55, draw: () => drawMover(M, b) });
  for (const o of LEVEL.decor) if (!offView(o, 3)) { const sv = sideVis(o, b); if (sv > 0) actors.push({ _d: relD(o) + 0.3, draw: () => withA(sv, () => drawDecor(o, b)) }); }
  if (LEVEL.userProps) for (const o of LEVEL.userProps) if (!offView(o, 3)) actors.push({ _d: relD(o) + (o.sec === 'wall' ? 0.3 : 0.5), draw: () => drawUserProp(o, b) });   /* v249: предметы из картинок Алексея (13d_userprops.js) */
  for (const q of LEVEL.steams) { const ra = offView(q, 4) ? 0 : reachA(q.x, q.z, b); if (ra > 0) actors.push({ _d: relD(q) + 0.68, draw: () => withA(ra, () => drawSteam(q, b)) }); }
  for (const L of LEVEL.stairs || []) { if (pkSkip(L.y0) || stairFace(L, b) < 0.08) continue; const e = stairEnds(L, b); if (Math.abs(Math.min(e.ya, e.yb) - cam.y) > H / S / 2 + 6) continue; actors.push({ _d: relD({ x: e.x, z: e.z }) + 2.5, draw: () => drawStairs(L, b) }); }   /* v289: марш — перед стеной своих клеток (не пропадает за кубами) */   /* v287: ступенчатые марши */
  for (const W2 of LEVEL.walkways || []) { const L = walkAsStair(W2); if (pkSkip(W2.y) || stairFace(L, b) < 0.08) continue; const e = stairEnds(L, b); if (Math.abs(W2.y - cam.y) > H / S / 2 + 6) continue; actors.push({ _d: relD({ x: e.x, z: e.z }) + 2.5, draw: () => drawWalkway(W2, b) }); }   /* v288: переходы */
  for (const L of LEVEL.ladders) { if (pkSkip(L.y0)) continue; const c = lanePosR(L.f, L.t, L.r || 8), ra = L.armP ? 1 : reachA(c[0], c[1], b, L.pin && L.d !== undefined ? L.d - 0.5 : undefined); if (ra > 0) actors.push({ _d: relD({ x: c[0], z: c[1] }) + 0.45, draw: () => withA(ra, () => drawLadder(L.vy0 !== undefined ? Object.assign({}, L, { y0: L.vy0, y1: L.vy1 }) : L, b)) }); }   /* v281: vy0/vy1 — видимая часть (лестница руки у локтя) */
  if (!armPass) for (const w of LEVEL.wires) actors.push({ _d: relD({ x: lanePos(w.f, (w.a + w.b) / 2)[0], z: lanePos(w.f, (w.a + w.b) / 2)[1] }) + 0.3, draw: () => drawWire(w, b) });
  LEVEL.pipes.forEach((q, pi) => { const QP = q.vpts || q.pts; if (!QP.length || pkSkip(QP[0][1])) return;
    // v239 (Алексей 18.10: «при повороте трубы меняют текстуру на текстуру других труб»): колено/фланец — по форме трубы на её родной стороне, а не по длине на экране (при повороте она менялась)
    const home = (() => { let m = null; for (const p of QP) { const r = Math.max(Math.abs(p[0]), Math.abs(p[2])); if (!m || r > m.r) m = { r, p }; } const f = Math.abs(m.p[2]) >= Math.abs(m.p[0]) ? (m.p[2] > 0 ? 0 : 2) : (m.p[0] > 0 ? 1 : 3); return [[1, 0], [0, -1], [-1, 0], [0, 1]][f]; })();
    const PS = QP.map(p => [(p[0] * home[0] + p[2] * home[1]) * S, p[1] * S]), sl = i => Math.hypot(PS[i + 1][0] - PS[i][0], PS[i + 1][1] - PS[i][1]);
    const kind = QP.map((p, i) => i === 0 || i === QP.length - 1 ? 0 : sl(i - 1) > 2 && sl(i) > 2 ? 1 : (sl(i - 1) > 2) !== (sl(i) > 2) ? 2 : 0);   // 1 — колено, 2 — труба уходит в стену: фланец
    const bent = kind.some(k => k === 1);   /* труба с коленями — отдельный вид: прямые куски из той же картинки, что и колено */
    // v263 (Алексей 19.10: «колена нет, труба уходит в воздух»): колено — по тому, как труба видна СЕЙЧАС: кусок, что на родной стороне уходил в стену,
    // при повороте виден вбок — на углу тоже нужно колено. Угол = два видимых куска (длиннее 3 точек), один по горизонтали, другой по вертикали.
    const sv = i => { const a = QP[i], c = QP[i + 1], du = ((c[0] - a[0]) * b.r[0] + (c[2] - a[2]) * b.r[1]) * S, dy = (c[1] - a[1]) * S; return [du, dy]; };
    const vk = QP.map((p, i) => { if (i === 0 || i === QP.length - 1) return 0; const A = sv(i - 1), C = sv(i); if (Math.hypot(A[0], A[1]) < 3 || Math.hypot(C[0], C[1]) < 3) return 0; const hA = Math.abs(A[0]) > Math.abs(A[1]), hC = Math.abs(C[0]) > Math.abs(C[1]); return hA !== hC ? 1 : 0; });
    // v266: кусок трубы на боковой стороне дальше 7 по глубине — не виден (и не работает). Кусок, идущий прямо вглубь, виден по ближнему концу
    const segA = QP.slice(0, -1).map((a, i) => { const c = QP[i + 1], endOn = Math.abs((c[0] - a[0]) * b.r[0] + (c[2] - a[2]) * b.r[1]) * S < 3 && Math.abs(c[1] - a[1]) < 0.05, ra = reachA(a[0], a[2], b), rc = reachA(c[0], c[2], b); return q.armP ? 1 : endOn ? Math.max(ra, rc) : Math.min(ra, rc); });
    for (let i = 0; i + 1 < QP.length; i++) { const a = QP[i], c = QP[i + 1], sa = segA[i]; if (sa <= 0) continue; actors.push({ _d: Math.max(relD({ x: a[0], z: a[2] }), relD({ x: c[0], z: c[2] })) + 0.03, draw: () => {   // v240 (Алексей 18.10: «мыслить в 3D: сбоку труба — кусок трубы»): рисуется с любой стороны; что за стеной — закрывает стена (порядок по глубине)
        const du = Math.abs((c[0] - a[0]) * b.r[0] + (c[2] - a[2]) * b.r[1]), dh = Math.abs(c[1] - a[1]);
        if (du * S < 3 && dh < 0.05) { const near = relD({ x: a[0], z: a[2] }) > relD({ x: c[0], z: c[2] }) ? a : c; drawPipeEnd({ p: near }, b); return; }   // идёт прямо вглубь — виден срез
        withA(sa, () => { drawPipeSeg(a, c, b, pi * 5 + i, false, vk[i] === 1 && segA[i - 1] > 0, vk[i + 1] === 1 && segA[i + 1] > 0, bent);
          if (pkImg()) { if (i === 0 || !(segA[i - 1] > 0)) pkCap(a, c, b); if (i + 1 === QP.length - 1 || !(segA[i + 1] > 0)) pkCap(c, a, b); } }); } }); }   /* v266: обрезана дальняя часть — на конце муфта */   /* v263: свободный конец — муфта, а не обрез */
    for (let i = 1; i + 1 < QP.length; i++) if (vk[i] === 1 && segA[i - 1] > 0 && segA[i] > 0) {  /* фланцев на концах больше нет — только колени */ const p = QP[i];
      actors.push({ _d: relD({ x: p[0], z: p[2] }) + 0.031, draw: () => withA(Math.min(segA[i - 1], segA[i]), () => pipeElbow(QP[i - 1], p, QP[i + 1], b)) }); } });   /* v265: было «kind[i] === 1 ? …» — на боковых сторонах угол уходил в «фланец», колена не было */   /* трубы не на этой стороне (сбоку) не рисуем — с ребра они выглядят обрубками; во время поворота — в дымке */   // труба не на ближней стороне — по ней не полезешь, она в дымке
  if (!armPass) for (const w of waters) if (w.tail > w.head + 0.02 && (w.cloud || reachA(w.x, w.z, b) > 0)) actors.push({ _d: w.cut !== null && w.cut !== undefined && w.cut > w.head ? relD(hero) + 0.61 : relD(w) + 0.3, draw: () => withA(w.cloud ? 1 : reachA(w.x, w.z, b), () => drawWater(w, b)) });
  if (!armPass) for (const q of booms) actors.push({ _d: relD(q) + 0.7, draw: () => drawBoom(q, b) });
  if (!armPass) { const seen = new Set(); for (const f of fires.slice().sort((p, q) => relD(q) - relD(p))) { if (f.delay > 0) continue; const k = Math.round(toU(f) * 4) + '|' + Math.round(f.y * 4); f.cull = seen.has(k) || propHidden(f) || Math.abs(relU(f, b)) > W / S / 2 + 1.5 || Math.abs(f.y - cam.y) > H / S / 2 + 1.5; seen.add(k); } }   // с этой стороны огни, стоящие друг за другом вглубь, сливаются: рисуем один — ближний, а спрятанные за стеной не рисуем вовсе
  if (!armPass) for (const f of fires) if (f.prom && !(f.delay > 0) && !f.cull) { if (f.gph == null) { f.gv = Math.floor(Math.random() * 4); f.gflip = Math.random() < 0.5; f.gph = Math.floor(Math.random() * 72); f.life0 = f.life; }   // свечение всех огней следа — одним слоем позади их тел
    { const sv = f.s == null ? 1 : f.s; f.gs = f.big ? (sv > 0.5 ? 6 : 4) : Math.min(5, Math.floor(sv * 6)); if (f.big) { f.gv = f.gv % 2; f.cp = f.gs === 6 ? [0] : [-0.42, 0.42]; } else f.cp = [0]; f.ps = f.back ? 4 : sv > 0.75 ? 7 : 4; f.hid = f.plain ? sv < (f.back ? 0.5 : f.thin ? 0.55 : 0.35) : f.thin === 2 ? sv < 0.6 : false; }
    if (f.hid) continue;
    f.al = Math.min(1, f.life / 0.8) * Math.min(1, (f.life0 - f.life) / 0.15 + 0.35); f.nm = f.plain ? 'FIREY' + f.ps + '_' + (Math.floor(game.time * 7) + f.gph) % 9 : 'GFIRE_' + (f.gs == null ? 1 : f.gs) + '_' + f.gv + '_' + (Math.floor(game.time * 11) + f.gph) % 8;
    actors.push({ _d: relD(f) + 0.4, draw: () => { if (!f.plain && (f.big || f.gph % 2 === 0)) pixelGlow(W / 2 + relU(f, b) * S, H / 2 - (f.y + (f.big ? 0.4 : 0.2) - cam.y) * S, f.big ? 1.3 : 0.55, (f.big ? 0.14 : 0.1) * f.al, '255,110,40'); f.cp.forEach((du, ci) => drawSprite(f.nm + 'h', relU(f, b) + du, f.y + 0.07, ci % 2 ? !f.gflip : f.gflip, f.al)); } }); }
  if (!armPass) for (const f of fires) if (!(f.delay > 0) && !f.cull) actors.push({ _d: relD(f) + (f.back ? 0.42 : f.plain ? 0.52 : 0.5), draw: () => { if (f.prom) { if (!f.hid && f.nm) f.cp.forEach((du, ci) => drawSprite(f.nm, relU(f, b) + du, f.y + 0.07, ci % 2 ? !f.gflip : f.gflip, f.al)); return; } if (f.trap) drawBurner(relU(f, b), f.y); drawFire(f.fl, relU(f, b), f.y + (f.trap ? 0.1 : 0), Math.min(1, f.life / 1.5)); } });   // огонь врагов и горелок — пиксельные языки в стиле огня на руках героя, стоят на полу   // огонь врагов и ловушек — пиксельные языки, как пламя на руках героя   // чуть дальше обломков: пламя встаёт из-за них
  if (heroHere() && hero.dash && hero.dash.fire && hero.state !== 'dead') actors.push({ _d: relD(hero) + 0.66, draw: () => { pixelGlow(W / 2 + relU(hero, b) * S, H / 2 - (hero.y + 0.4 - cam.y) * S, 0.9, 0.14, '255,150,50'); drawSprite('FBALL_' + Math.floor(game.time * 18) % 15, relU(hero, b) + hero.dash.dir * 0.25, hero.y + 0.38, hero.dash.dir < 0, 0.22); } });
  if (heroHere() && (hero.burn > 0 || (hero.prom && !hero.hideN)) && hero.state !== 'dead' && !hero.inDoor) actors.push({ _d: relD(hero) + 0.6, draw: () => drawFire(HERO_FL, relU(hero, b) - hero.face * 0.04, hero.y + 0.02, 1) });
  for (const g of LEVEL.grips || []) if (!offView(g, 2)) { const sv = sideVis(g, b); if (sv > 0) actors.push({ _d: relD(g) + 0.3, draw: () => withA(sv, () => drawGrip(g, b)) }); }   /* v265: ухваты */
  for (const q of rings) if (!q.user && reachA(q.x, q.z, b) > 0) actors.push({ _d: relD(q) + 0.59, draw: () => { const g0 = ctx.globalAlpha; ctx.globalAlpha = g0 * reachA(q.x, q.z, b);
    const g = Math.max(2, Math.round(S * 0.03)), px = Math.round(W / 2 + relU(q, b) * S), py = Math.round(H / 2 - (q.y - cam.y) * S), lit = q.t > 0;
    ctx.fillStyle = '#1a0f14'; ctx.fillRect(px - g * 4, py - g * 4, g * 8, g * 8);
    ctx.fillStyle = lit ? '#fff4e1' : '#e0702e'; ctx.fillRect(px - g * 3, py - g * 3, g * 6, g * 6);
    ctx.fillStyle = '#1a0f14'; ctx.fillRect(px - g * 2, py - g * 2, g * 4, g * 4);
    ctx.fillStyle = lit ? '#ffd27a' : '#7a3a1c'; ctx.fillRect(px - g, py - g * 6, g * 2, g * 2);   // скоба, на которой кольцо висит
    ctx.globalAlpha = g0; } });
  for (const v of vents) if (!offView(v, 2)) { const sv = sideVis(v, b); if (sv > 0) actors.push({ _d: relD(v) + 0.56, draw: () => withA(sv, () => drawVent(v, b)) }); }
  for (const p of puddles) actors.push({ _d: relD(p) + 0.78, draw: () => drawPuddle(p, b) });
  for (const p of wetSpots) actors.push({ _d: relD(p) + 0.56, draw: () => drawPuddle({ x: p.x, y: p.y, z: p.z, f: view.k, t: p.t }, b, true) });
  for (const c of crates) if (c.tv !== undefined ? !c.gone && !offView(c, 2) : !c.broken && !offView(c, 2)) { const sv = sideVis(c, b); if (sv > 0) actors.push({ _d: relD(c) + 0.57, draw: () => withA(sv, () => c.tv !== undefined ? drawTV(c, b) : c.hyd !== undefined ? drawHydrant(c, b) : drawCrate(c, b)) }); }
  if (cams.length) { const hk = hero.state !== 'dead' && !hero.inDoor ? camLitAt(toU(hero), hero.y + 0.45, toD(hero)) : 0; if (hk) actors.push({ _d: relD(hero) + 0.635, draw: () => drawCamLit(hero, b, toU(hero), hero.y + 0.45, hk) });
    for (const r of robots) { if (r.dead || offView(r, 2)) continue; const rk = camLitAt(toU(r) + (r.sh || 0), r.y + 0.5, toD(r)); if (rk) actors.push({ _d: relD(r) + 0.6, draw: () => drawCamLit({ x: r.x + (r.sh || 0) * view.r[0], z: r.z + (r.sh || 0) * view.r[1] }, b, 0, r.y + 0.5, rk) }); } }   /* v306: красная подсветка в луче */
  for (const c of cams) if (!offView(c, 9) && camFace(c, b) > 0.6) { actors.push({ _d: relD(c) + 0.2, draw: () => drawCamCone(c, b) }); actors.push({ _d: relD(c) + 0.69, draw: () => drawCam(c, b) }); }   /* v305: камеры */
  for (const o of cogs) if (!offView(o, 2)) { const sv = sideVis(o, b); if (sv > 0) actors.push({ _d: relD(o) + 0.66, draw: () => withA(sv, () => drawCog(o, b)) }); }   /* v301: шестерёнки */
  if (!armPass) if (tutor && cam.y > 2500) actors.push({ _d: relD(tutor) + 0.55, draw: () => drawTutor() });   /* как ящики: перед стеной туннеля */
  if (!armPass) if (boss && cam.y > 2500) { actors.push({ _d: relD(boss) - 0.4, draw: () => drawBoss(b) }); actors.push({ _d: relD(boss) - 0.35, draw: () => drawTurrets(b) }); actors.push({ _d: 1e6 + 1, draw: () => drawTurretFx(b) }); actors.push({ _d: 1e6, draw: () => drawBossFloor() }); }
  for (const G of gears) if (!G.armJ && !G.armJP && !offView(G, G.R + 1.5)) actors.push({ rb: !!G.wg && G.y > LEVEL.pelY - 3 && G.y < LEVEL.pelY + 17, _d: relD(G) + (G.wg ? 0.1 : -0.3), draw: () => drawGear(G, b) });   /* v269: шестерня в стене у таза — поверх таза, как роботы */
  if (!armPass) for (const E of LEVEL.engines || []) if (!offView(E, 6)) actors.push({ _d: relD(E) + 0.15, draw: () => drawEngine(E, b) });
  for (const Tp of traps) if (!offView(Tp, 3) && sideVis(Tp, b) > 0.5) actors.push({ _d: relD(Tp) + (Tp.kind === 'wall' ? 0.5 : 0.45), draw: () => drawTrap(Tp, b) });
  if (!armPass) for (const P of pistons) if (!offView({ x: P.gx, y: P.gy, z: P.gz }, 6)) actors.push({ _d: relD(P) - 0.2, draw: () => drawPiston(P, b) });
  if (!armPass) drawWireSprites(actors, b, relD);
  if (!armPass) pushKit2(actors, b, relD);
  if (!armPass) pushFans(actors, b, relD);
  if (!armPass && typeof pushDC === 'function') pushDC(actors, b, relD);   /* v310: отрава, ток, темнота */   /* v309: платформы-вентиляторы */   // щиты и перила из пака автора (v221)
  if (!armPass) if (LEVEL.wruns && LEVEL.wruns.length && cam.y > 2500) actors.push({ _d: relD({ x: cam.x, z: ROOM_Z + 0.01 }), draw: () => drawWireRuns(b) });
  if (!armPass) if (LEVEL.cables && LEVEL.cables.length && cam.y > 2500) actors.push({ _d: relD({ x: cam.x, z: ROOM_Z - 0.3 }), draw: () => drawCables(b) });   // провода у задней стены комнат   // поршень — поверх своей шестерни   // шестерня у самой стены, за героем
  if (!armPass) if (knifeItem && !knifeItem.got) actors.push({ _d: relD(knifeItem) + 0.58, draw: () => drawKnife(knifeItem, b) });
  for (const o of itemsOnMap) if (!o.got && !propHidden(o)) { const sv = sideVis(o, b); if (sv > 0) actors.push({ _d: relD(o) + 0.58, draw: () => withA(sv, () => drawItem(o, b)) }); }
  if (!armPass) if (forkItem && !forkItem.got && !propHidden(forkItem)) actors.push({ _d: relD(forkItem) + 0.58, draw: () => drawItem(Object.assign(forkItem, { kind: 'fork' }), b) });
  if (!armPass) if (forkPulls.length) actors.push({ _d: relD(hero) + 0.7, draw: () => drawForkPulls(b) });
  /* куски из листов поверх стен убраны: вместо них — новый набор плиток */
  if (!armPass) if (Math.abs(b.r[1]) > 0.3) for (const A of arms) actors.push({ _d: 1e5, draw: () => drawArm(A, b) });   /* v280: руки висят снаружи корпуса — с востока и запада всегда поверх ног и корпуса */
  if (!armPass) if (fBolts.length || hero.fork) actors.push({ _d: relD(hero) + 0.95, draw: () => drawFBolts(b) });
  if (!armPass) drawWBlobs(actors, b, relD);
  if (!armPass) if (promItem && !promItem.got) actors.push({ _d: relD(promItem) + 0.58, draw: () => drawProm(promItem, b) });
  if (heroHere() && hero.prom && hero.state !== 'dead' && !hero.inDoor && !hero.hideN) { const atk = /^(HandAttack|SitAttack|KnifeAttack|JumpKnife)/.test(hero.st) || !!hero.dash, hy = hero.y + hero.hangPop - (hero.ride ? hero.ride.r.dip || 0 : hero.dip || 0);   // кулаки горят: огонёк на каждой кисти, на ударе — крупнее
    if (!hero.dash) actors.push({ _d: relD(hero) + 0.44, draw: () => { heroHands().forEach((q, i) => { const large = (atk && i === 1) || (i === 1 && hero.chg > 0.55) || hero.fistBoost > 0.09; drawSpriteRot((large ? 'HFLBh_' : 'HFLh_') + (Math.floor(game.time * 14) + i * 6) % 15, relU(hero, b) + q[0], hy + q[1], hero.flAng || 0, 0.9); }); } });   // свечение пламени — под героем и под его огненным взмахом
    actors.push({ _d: relD(hero) + 0.64, draw: () => { const hs = heroHands(); hs.forEach((q, i) => { const front = i === 1, big = atk && front, c = Math.max(front && hero.chg > 0.25 ? Math.min(1, hero.chg) : 0, hero.fistBoost > 0 ? Math.min(1, hero.fistBoost / 0.3) : 0, hero.dash ? 0.45 : 0); { const large = big || c > 0.3, hx = relU(hero, b) + q[0], hyy = hy + q[1]; pixelGlow(W / 2 + hx * S, H / 2 - (hyy + 0.12 - cam.y) * S, large ? 0.5 + 0.2 * c : 0.36, large ? 0.13 : 0.09, '255,110,40'); { const nm = (large ? 'HFLB_' : 'HFL_') + (Math.floor(game.time * 14) + i * 6) % 15; if (!hero.dash) { const tx = -hero.vx * 0.8 - (atk ? hero.face * 4 : 0), ty = Math.max(0.25, 1 - hero.vy * 0.25), want = Math.atan2(tx, ty), now = game.time, dtA = Math.min(0.1, now - (hero.flT || 0)); if (i === 0) { hero.flAng = (hero.flAng || 0) + (want - (hero.flAng || 0)) * (1 - Math.exp(-dtA * 14)); hero.flT = now; } drawSpriteRot(nm, hx, hyy, hero.flAng || 0, 0.9); } } } if (hero.rocketT > 0) { const rk = Math.min(1, hero.rocketT / 0.25); drawPixFlame(W / 2 + (relU(hero, b) + q[0]) * S, H / 2 - (hy + q[1] - cam.y) * S, 9 + Math.round(rk * 5), 12 + Math.round(rk * 26), i * 5.1 + 2, true, true); } }); } }); }
  for (const o of hearts) if (!o.got && !offView(o, 1)) { const sv = sideVis(o, b); if (sv > 0) actors.push({ _d: relD(o) + 0.58, draw: () => withA(sv, () => drawHeart(o, b)) }); }
  for (const o of bits) if (!o.got && !offView(o, 1)) { const sv = sideVis(o, b); if (sv > 0) actors.push({ _d: relD(o) + 0.58, draw: () => withA(sv, () => drawBit(o, b)) }); }
  return heroAct;
}
function render() {
  if (game.deathT > 0) S = S0 / (1 + 5.5 * (1 - Math.exp(-game.deathT * 0.9)));
  else { const zt = game.zoom ? zcam.s : S0; S += (zt - S) * 0.12; if (Math.abs(zt - S) < 0.3) S = zt; }   /* Z — отдалить камеру: виден весь титан */   // после смерти камера уезжает далеко
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
  const b = basis(view.angle);
  drawBackground();
  if (game.zoom && S < S0 * (game.lodAt || 0.45)) { drawLOD(b); ctx.imageSmoothingEnabled = true; drawForeground(b); return; }   /* издалека — упрощённая модель, обе ноги шагают */
  const relD = e => (e.x - cam.x) * b.n[0] + (e.z - cam.z) * b.n[1];
  const actors = [];
  const sh = game.shake > 0 ? game.shake * S : 0;
  game.nudge *= 0.86;
  ctx.save(); ctx.translate(Math.round(game.nudge * S + (sh ? (Math.random() - 0.5) * sh : 0)), Math.round(game.bob * S + (sh ? (Math.random() - 0.5) * sh : 0)));   // сдвиг только на целые пиксели: при дробном края граней сглаживались и между кубами проступала светлая сетка   // титан покачивается на каждом шаге
  const heroAct = buildActors(b, relD, actors);
  { // вторая нога видна сбоку (с востока и запада), во время поворота и на экране смерти; с юга и севера камера стоит между ногами
    const V = game.gv, behind = V.x * b.n[0] + V.z * b.n[1] <= 0, show = game.deathT > 0 || Math.abs(b.r[1]) > 0.25 || behind;   /* сзади (с юга) вторую ногу видно за нашей: видно, как она шагает */
    const ghost0 = () => { const cx = cam.x, cy = cam.y, cz = cam.z; cam.x = V.x - cx; cam.y = cy - V.y; cam.z = V.z - cz; ghostPass = true; drawWorld({ r: [-b.r[0], -b.r[1]], n: [-b.n[0], -b.n[1]] }, []); ghostPass = false; cam.x = cx; cam.y = cy; cam.z = cz; };
    const ghostOld = () => {   // вторая нога — целый второй проход по граням; рисуем её в запасной холст раз в несколько кадров, между ними — сдвигаем готовую картинку
      const G = ghostC, M = Math.round(S * 3), Wd = W + 2 * M, Hd = H + 2 * M;
      const dxy = () => [Math.round((-((cam.x - G.cx) * b.r[0] + (cam.z - G.cz) * b.r[1]) + ((V.x - G.vx) * b.r[0] + (V.z - G.vz) * b.r[1])) * S), Math.round(((cam.y - G.cy) - (V.y - G.vy)) * S)];
      let fresh = !G.c || G.c.width !== Wd || G.c.height !== Hd || G.ang !== view.angle || G.S !== S || ++G.n >= 6 || game.deathT > 0;
      if (!fresh) { const d = dxy(); if (Math.abs(d[0]) > M * 0.8 || Math.abs(d[1]) > M * 0.8) fresh = true; }
      if (fresh) { if (!G.c) { G.c = document.createElement('canvas'); G.x = G.c.getContext('2d'); } if (G.c.width !== Wd || G.c.height !== Hd) { G.c.width = Wd; G.c.height = Hd; }
        G.x.setTransform(1, 0, 0, 1, 0, 0); G.x.clearRect(0, 0, Wd, Hd); const w0 = W, h0 = H; W = Wd; H = Hd; ctx = G.x; ctx.imageSmoothingEnabled = false; try { ghost0(); } finally { ctx = ctx0; W = w0; H = h0; }
        Object.assign(G, { cx: cam.x, cy: cam.y, cz: cam.z, vx: V.x, vy: V.y, vz: V.z, ang: view.angle, S, n: 0 }); }
      const d = dxy(); ctx.imageSmoothingEnabled = false; ctx.drawImage(G.c, d[0] - M, d[1] - M); }; void ghostOld; const ghost = ghost0;
    if (show && behind) ghost();
    drawWorld(b, actors);
    if (show && !behind) ghost();
    pelPass = true; drawWorld(b, (heroAct && hero.y > LEVEL.pelY - 3 && hero.y < LEVEL.pelY + 17 ? [heroAct] : []).concat(actors.filter(a => a.rb))); pelPass = false;   /* герой перед тазом — поверх таза */
  }
  if (!(game.deathT > 0) && !game.noDark) drawDarkness(b);
  ctx.imageSmoothingEnabled = true;
  if (Math.abs(cam.y - (LEVEL.soleY || 0)) < H / S) drawSole(b);
  drawForeground(b);
  for (const k of kunais) {
    // кунай повёрнут по направлению полёта и так же торчит, когда воткнулся
    if (k.in && robotHidden(k.in)) continue;   // робот с кунаем ушёл за стену
    const kn = k.state === 'fly' && !k.drop ? k.anim.sprite() : 'hamekunai_0', ku = relU(k, b) + (k.in ? k.in.sh || 0 : 0), ka = k.flat || k.drop ? 0 : (k.ang || 0) * (k.dir < 0 ? 1 : -1);
    squash(ku, k.y, 1.25, 1.25, ka, () => drawSprite(kn, ku, k.y, k.dir < 0, undefined, 0.5, '205,205,214'));   // кунай светлее, чтобы торчащий не резал глаз
    if (k.state !== 'fly' && k.fx > 0) drawSprite(k.fxAnim.sprite(), ku, k.y, k.dir < 0);
  }
  drawArcs(b);
  for (const k of kunais) if (k.state === 'fly' && !k.drop) { drawRibbon(k.tr, b, k.fire ? 0.3 : 0.22, k.fire); if (k.fire) drawPixFlame(W / 2 + relU(k, b) * S, H / 2 - (k.y - cam.y) * S, 7, 9, k.x, false); }
  for (const q of fbolts) { const px = W / 2 + relU(q, b) * S, py = H / 2 - (q.y - cam.y) * S; pixelGlow(px, py, 1.3, 0.16, '255,110,40'); drawSprite('FBALL_' + Math.floor(q.t * 16) % 15, relU(q, b), q.y, q.dir < 0, 0.6); }
  for (const q of cshots) { drawRibbon(q.tr, b, q.fire ? 0.3 : 0.22, q.fire); const g = Math.max(2, Math.round(S * 0.03)), px = W / 2 + relU(q, b) * S, py = H / 2 - (q.y - cam.y) * S, cx = Math.cos(q.a), sy = Math.sin(q.a); for (let i = -3; i <= 3; i++) { ctx.fillStyle = i > 1 ? '#ffffff' : i > -2 ? '#c9d2d8' : '#6b4a3a'; ctx.fillRect(Math.round((px + cx * i * g) / g) * g, Math.round((py + sy * i * g) / g) * g, g, g); } }
  for (const q of kickArcs) drawSprite('ARC_' + (q.t < 0.075 ? 0 : q.t < 0.14 ? 1 : 2), relU(q, b), q.y, q.dir < 0);
  for (const q of slashes) { const k = q.t / 0.16, g = Math.max(2, Math.round(S * 0.026)), x0 = W / 2 + relU(q, b) * S, y0 = Math.round((H / 2 - (q.y - cam.y) * S) / g) * g, len = (0.5 + 2.2 * Math.min(1, k * 2.2)) * S, tail = Math.max(0, k - 0.35) / 0.65 * len;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * (1 - k)).toFixed(2) + ')'; ctx.fillRect(q.dir > 0 ? x0 + tail : x0 - len, y0, len - tail, g); ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - k)).toFixed(2) + ')'; ctx.fillRect(q.dir > 0 ? x0 + tail + (len - tail) * 0.35 : x0 - len, y0 - g, (len - tail) * 0.65, g); }
  if (hero.hook) {                      // верёвка — простая линия в один «пиксель», на конце кунай
    const h = hero.hook, o = hookHand(), hx = W / 2 + (relU(hero, b) + o.u - toU(hero)) * S, hy = H / 2 - (o.y - cam.y) * S;
    const tx = W / 2 + (relU(hero, b) + (h.u - toU(hero))) * S, ty = H / 2 - (h.y - cam.y) * S;
    drawHookRope(h, hx, hy, tx, ty, o);
  }
  if (hero.state !== 'dead' && !hero.inDoor && heroHiddenAt(toU(hero), hero.y, toD(hero))) drawHero(b, 0.62);   // за стеной: еле заметный силуэт, чтобы не потерять героя
  drawFx(b);
  if (hero.prom && hero.state !== 'dead' && !hero.inDoor) { const k = Math.min(1, (4 - hero.promOrb) / 0.35); drawSprite('FORB_' + Math.floor(game.time * 10) % 8, relU(hero, b), hero.y + 0.95 + 0.22 * k + 0.03 * Math.sin(game.time * 4), false); }   // вспыхнуло над головой и через несколько секунд гаснет
  drawGuide(b); drawDodge(b); drawCastBar(b); drawTakeHint(b);
  if (hero.counter && hero.kunai > 0 && hero.state !== 'dead') drawKeycap(Math.round(W / 2 + relU(hero, b) * S), Math.round(H / 2 - (hero.y + 1.55 - cam.y) * S), Math.max(3, Math.round(S * 0.045)), 'L', true);
  if (hero.ride && hero.ride.mode === 'hang' && !hero.rip && !game.dodge && hero.state !== 'dead' && (typeof talOK !== 'function' || talOK('rip'))) { const g = Math.max(2, Math.round(S * 0.036)); drawKeycap(Math.round(W / 2 + relU(hero, b) * S), Math.round(H / 2 - (hero.y + 1.45 - cam.y) * S), g, 'F', (hero.ripN || 0) > 0); }
  if (popups.length) {
    ctx.textAlign = 'center'; ctx.font = Math.round(S * 0.3) + 'px "Russo One", "Arial Black", sans-serif';
    for (const q of popups) {
      const px = W / 2 + relU(q, b) * S, py = H / 2 - (q.y + q.t * 0.7 - cam.y) * S;
      ctx.globalAlpha = Math.max(0, 1 - q.t / 0.9); ctx.lineWidth = Math.max(3, S * 0.05); ctx.strokeStyle = '#06121a'; ctx.strokeText(q.text, px, py); ctx.fillStyle = q.hp ? '#ff5a3c' : q.heal ? '#8dffb0' : '#ffd9a8'; ctx.fillText(q.text, px, py);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  drawSky(true, cam.x * b.r[0] + cam.z * b.r[1]);
  if (game.hurtT > 0) { const k = game.hurtT / 0.7, g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72); g.addColorStop(0, 'rgba(200,20,20,0)'); g.addColorStop(1, 'rgba(210,25,20,' + (0.6 * k).toFixed(3) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); if (k > 0.8) { ctx.fillStyle = 'rgba(255,60,40,' + ((k - 0.8) * 1.2).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); } }
  if (game.flashT > 0) drawMemory();
  if (game.finishT > 0) { ctx.fillStyle = 'rgba(10,6,14,' + Math.min(0.9, (1.8 - game.finishT) * 0.75).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); }
  if (game.finale && game.deathT <= 0 && game.finishT <= 0) {   // облава: красная надпись сверху, первые секунды — крупно посередине
    const t = game.finaleT || 0, big = Math.max(0, 1 - t / 2.6), fs = Math.round(Math.min(H * (0.045 + 0.06 * big), W * (0.04 + 0.05 * big))), yy = H * (0.115 + 0.3 * big), bl = 0.75 + 0.25 * Math.sin(game.time * 7);
    ctx.fillStyle = 'rgba(120,10,10,' + (0.1 + 0.05 * Math.sin(game.time * 3)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, yy - fs * 0.85, W, fs * 1.7);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = fs + 'px "Russo One", "Arial Black", sans-serif'; ctx.globalAlpha = bl;
    ctx.lineWidth = Math.max(3, fs * 0.09); ctx.strokeStyle = '#0d0a0e'; ctx.strokeText('ПРИКОНЧИТЬ НАРУШИТЕЛЯ', W / 2, yy); ctx.fillStyle = '#e0301e'; ctx.fillText('ПРИКОНЧИТЬ НАРУШИТЕЛЯ', W / 2, yy);
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }
  if (game.deathT > 0) {                 // экран смерти: всё тускнеет, посередине тёмная полоса и надпись
    const t = game.deathT, a = Math.min(1, t / 0.8);
    ctx.fillStyle = 'rgba(28,24,30,' + (0.5 * a).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
    const bh = H * 0.2; ctx.fillStyle = 'rgba(0,0,0,' + (0.62 * a).toFixed(3) + ')'; ctx.fillRect(0, H / 2 - bh / 2, W, bh);
    const k = 1 + 0.9 * Math.exp(-t * 5), fs = Math.round(Math.min(H * 0.13, W * 0.11) * k);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = fs + 'px "Russo One", "Arial Black", sans-serif';
    ctx.globalAlpha = a; ctx.lineWidth = Math.max(4, fs * 0.09); ctx.strokeStyle = '#0d0a0e'; ctx.strokeText('ТЫ СОСЁШ', W / 2, H / 2); ctx.fillStyle = '#c0392b'; ctx.fillText('ТЫ СОСЁШ', W / 2, H / 2);
    if (t > 1.6) { ctx.font = Math.round(H * 0.026) + 'px "PT Mono", monospace'; ctx.fillStyle = 'rgba(255,244,225,' + (0.6 + 0.3 * Math.sin(t * 4)).toFixed(2) + ')'; ctx.fillText('пробел — ещё раз', W / 2, H / 2 + bh * 0.72); }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }
}

// ====================== ОСМОТР ТИТАНА (Z) ======================
// Z — игра на паузе, камера отъезжает: виден весь титан. Мышь: тянуть — вертеть вокруг и двигать вверх-вниз, колесо — приблизить туда, куда наведён курсор;
// правой кнопкой (или с Shift) — сдвигать. Q / E — повернуть на четверть. Z ещё раз — назад к герою.
const zcam = { on: false, x: 0, y: 40, z: -12, ang: 0, s: 11, k0: 0, drag: null };
function inspectToggle(on) {
  if (on) { Object.assign(zcam, { on: true, x: cam.x, y: 46, z: cam.z, ang: view.angle, s: S0 * 0.085, k0: view.k }); showCombo('Осмотр титана: тянуть мышью — вертеть, колесо — ближе, Z — назад', true); }
  else { zcam.on = false; setView(zcam.k0); showCombo('', true); }
}
function inspectTick(dt) {             // пока смотрим титана: время стоит, Q/E поворачивают на четверть
  if (pressed.has('rotR')) zcam.ang += 90; if (pressed.has('rotL')) zcam.ang -= 90;
  view.angle += (zcam.ang - view.angle) * Math.min(1, dt * 8);
  cam.x = zcam.x; cam.y = zcam.y; cam.z = zcam.z;
}
{ const cv = canvas;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  const panU = du => { const b = basis(view.angle); zcam.x += du * b.r[0]; zcam.z += du * b.r[1]; };
  if (cv) {
    cv.addEventListener('wheel', e => { if (!zcam.on) return; e.preventDefault(); const [mx, my] = pos(e), b = basis(view.angle);
      const u = (mx - W / 2) / S, y = zcam.y - (my - H / 2) / S, ns = Math.max(S0 * 0.06, Math.min(S0 * 1.5, S * Math.pow(1.0018, -e.deltaY)));
      panU(u - (mx - W / 2) / ns); zcam.y = y + (my - H / 2) / ns; zcam.s = ns; S = ns; void b; }, { passive: false });
    cv.addEventListener('mousedown', e => { if (!zcam.on) return; e.preventDefault(); zcam.drag = { x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey }; });
    cv.addEventListener('contextmenu', e => { if (zcam.on) e.preventDefault(); });
    addEventListener('mouseup', () => { zcam.drag = null; });
    addEventListener('mousemove', e => { const D = zcam.drag; if (!zcam.on || !D) return; const r = cv.getBoundingClientRect(), k = cv.width / r.width, dx = (e.clientX - D.x) * k, dy = (e.clientY - D.y) * k; D.x = e.clientX; D.y = e.clientY;
      if (D.pan) panU(-dx / S); else { zcam.ang += dx * 0.35; view.angle = zcam.ang; } zcam.y += dy / S; });
  } }
// ====================== ТИТАН ИЗДАЛЕКА (осмотр, Z) ======================
// Издалека рисуем не тысячи плиток, а упрощённую модель: кубы, сложенные по 2x2x2, — плоские грани с оттенком и редкими огнями окон.
// В ней обе ноги шагают по-настоящему: каждая поднимается и проносится вперёд, корпус переваливается; руки качаются.
const LOD = { parts: null, src: null };
function buildLOD() {
  const K = 1, cells = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
  for (const c of cubes.values()) { if (c.y >= 900) continue; const leg = c.y < LEVEL.pelY && Math.abs(c.z) <= 9 && Math.abs(c.x) <= 10; const P = leg ? 'leg' : 'body';
    const k = key(Math.floor(c.x / K), Math.floor(c.y / K), Math.floor(c.z / K)); const q = cells.get(k); if (!q) cells.set(k, { P, x: Math.floor(c.x / K), y: Math.floor(c.y / K), z: Math.floor(c.z / K), lit: false, k: c.kind }); else if (P === 'body') q.P = 'body'; }
  const parts = { leg: [], body: [] }, NS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (const c of cells.values()) for (const N of NS) { const nb = cells.get(key(c.x + N[0], c.y, c.z + N[1])); if (nb && nb.P === c.P) continue;
    const h = Math.abs((c.x * 73856093) ^ (c.y * 19349663) ^ (c.z * 83492791) ^ (N[0] * 31 + N[1] * 7)) % 100;
    const ph = Math.abs((Math.floor(c.x / 3) * 92821) ^ (Math.floor(c.y / 2) * 68917) ^ (Math.floor(c.z / 3) * 19349)) % 100;   // плиты обшивки по 3x2 куба — у каждой свой оттенок
    const top = !cells.has(key(c.x, c.y + 1, c.z)), along = N[0] ? c.z : c.x;
    parts[c.P].push({ cx: (c.x + 0.5 + N[0] * 0.5) * K, cz: (c.z + 0.5 + N[1] * 0.5) * K, y: c.y * K, nx: N[0], nz: N[1], tone: c.k === 'plat' ? 70 : c.k === 'ledge' ? 58 : 56 + (ph % 11), lit: h < 2 && c.k === 'core', moss: top && (c.k === 'ledge' || h % 3 === 0), seamB: c.y % 2 === 0, seamL: ((along % 3) + 3) % 3 === 0, k: c.k }); }
  LOD.parts = parts; LOD.src = cubes.size;
}
function drawLOD(b) {
  if (!LOD.parts || LOD.src !== cubes.size) buildLOD();
  const G = game.gait || { fA: 0, fB: 0, lA: 0, lB: 0 }, L = CFG.stepLift, sw = game.sway || 0, K = 1, list = [];
  const add = (f, ox, oy, oz, mir, pc) => { const nx = mir ? -f.nx : f.nx, nz = mir ? -f.nz : f.nz, w = nx * b.n[0] + nz * b.n[1]; if (w < 0.02) return;
    const cx = (mir ? -f.cx : f.cx) + ox, cz = (mir ? -f.cz : f.cz) + oz, u = (cx - cam.x) * b.r[0] + (cz - cam.z) * b.r[1];
    list.push({ u, d: (cx - cam.x) * b.n[0] + (cz - cam.z) * b.n[1], y: f.y + oy, w, f, pc }); };
  const V = game.gv || { z: -24 };
  // наша нога: в мире она тоже шагает; корпус — опора, обе ноги ходят под ним; вторая нога — та же, развёрнутая на пол-оборота
  for (const f of LOD.parts.leg) add(f, G.fA, G.lA * L, -sw, false, 0);
  for (const f of LOD.parts.leg) add(f, G.fB, G.lB * L, V.z - sw, true, 1);
  for (const f of LOD.parts.body) add(f, 0, 0, -sw, false, 2);
  list.sort((p, q) => p.d - q.d);
  const halfW = W / S / 2 + 2, halfH = H / S / 2 + 2;
  for (const q of list) { if (q.u < -halfW || q.u > halfW || q.y + K < cam.y - halfH || q.y > cam.y + halfH) continue;
    const ww = q.w * K * S, x = Math.round(W / 2 + q.u * S - ww / 2), y = Math.round(H / 2 - (q.y + K - cam.y) * S), w = Math.max(1, Math.round(ww)), h = Math.round(K * S) + 1;
    const t = q.f.tone - (1 - q.w) * 22 - (q.pc === 1 ? 6 : 0) + Math.min(10, q.y * 0.15); ctx.fillStyle = 'rgb(' + Math.round(t * 1.05) + ',' + Math.round(t * 0.98) + ',' + Math.round(t * 1.12) + ')'; ctx.fillRect(x, y, w, h);
    if (q.f.seamB && h > 5) { ctx.fillStyle = 'rgba(24,20,30,0.18)'; ctx.fillRect(x, y + h - 1, w, 1); }   // швы плит — едва заметные
    if (q.f.seamL && w > 5) { ctx.fillStyle = 'rgba(24,20,30,0.14)'; ctx.fillRect(x, y, 1, h); }
    if (q.f.moss) { ctx.fillStyle = q.f.k === 'ledge' ? '#7a8840' : '#56632f'; ctx.fillRect(x, y, w, Math.max(1, Math.round(h * 0.16))); }
    if (q.f.lit && w > 2) { ctx.fillStyle = '#ffce46'; ctx.fillRect(x + Math.round(w * 0.35), y + Math.round(h * 0.3), Math.max(1, Math.round(w * 0.3)), Math.max(1, Math.round(h * 0.3))); } }
  // где герой: мигающая метка — так осмотр работает как карта
  { const u = (hero.x - cam.x) * b.r[0] + (hero.z - cam.z) * b.r[1], X = Math.round(W / 2 + u * S), Y = Math.round(H / 2 - (hero.y + 0.5 - cam.y) * S), r = Math.max(3, Math.round(S * 0.6));
    if (Math.sin(game.time * 8) > -0.3) { ctx.fillStyle = '#fff4e1'; ctx.fillRect(X - r, Y - r, r * 2, r * 2); ctx.fillStyle = '#ff7014'; ctx.fillRect(X - r + 2, Y - r + 2, r * 2 - 4, r * 2 - 4); } }
  // руки: простые толстые сегменты с дисками в суставах
  if (Math.abs(b.r[1]) > 0.2) for (const A of arms) { const P = armPose(A), C = ARM_CFG, al = Math.min(1, (Math.abs(b.r[1]) - 0.2) / 0.4);
    const seg = (p0, p1, wid) => { const X0 = W / 2 + ((0 - cam.x) * b.r[0] + (p0.z - sw - cam.z) * b.r[1]) * S, Y0 = H / 2 - (p0.y - cam.y) * S, X1 = W / 2 + ((0 - cam.x) * b.r[0] + (p1.z - sw - cam.z) * b.r[1]) * S, Y1 = H / 2 - (p1.y - cam.y) * S;
      ctx.strokeStyle = 'rgb(62,58,68)'; ctx.lineWidth = wid * S * Math.abs(b.r[1]); ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke(); };
    ctx.save(); ctx.globalAlpha = al; ctx.lineCap = 'butt'; seg(P.S, P.E, C.w1); seg(P.E, P.Wr, C.w2);
    const th = P.a, cu = A.curl, PB = (lz, ly) => armTW(A, P.Wr, th, lz, ly); seg(P.Wr, PB(0, -C.palm), C.wp);   // ладонь
    for (let f = 0; f < 3; f++) { const b0 = PB(-4 + f * 4, -C.palm), t1 = th - cu * (0.45 + f * 0.1), m = armTW(A, b0, t1, 0, -4), t2 = t1 - cu * 0.6; seg(b0, m, 2.6); seg(m, armTW(A, m, t2, 0, -3), 2.3); }   // пальцы
    seg(PB(-5.5, -2), armTW(A, PB(-5.5, -2), th - 0.7 - cu * 0.6, 0, -4), 2.4);   // большой палец
    for (const J of [[P.E, 3.4], [P.S, 5.2]]) { const X = W / 2 + ((0 - cam.x) * b.r[0] + (J[0].z - sw - cam.z) * b.r[1]) * S, Y = H / 2 - (J[0].y - cam.y) * S; const fr = gearFrameNear(J[1], 1, 0); if (fr && fr.width) { const w = fr.width * S / GEAR_PX, sx = Math.abs(b.r[1]); ctx.imageSmoothingEnabled = false; ctx.drawImage(fr, Math.round(X - w * sx / 2), Math.round(Y - w / 2), Math.round(w * sx), Math.round(w)); const f2 = gearFrameNear(Math.round(J[1] * 3.6) / 10, 0, 0); if (f2 && f2.width) { const w2 = f2.width * S / GEAR_PX; ctx.drawImage(f2, Math.round(X - w2 * sx / 2), Math.round(Y - w2 / 2), Math.round(w2 * sx), Math.round(w2)); } } }   // суставы — шестерни, в середине ещё одна
    ctx.restore(); }
}
