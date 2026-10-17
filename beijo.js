// Coreografia do "beijo de cinema" do gatinho de terno na gatinha doutora.
// Arquivo puro (sem three.js): calcula, para cada instante, onde fica cada gatinho,
// quanto cada articulação gira, a inclinação do corpo e o rostinho.
// O gatinha.js usa isto para desenhar; os testes usam o mesmo arquivo.
//
// Unidades: as do modelo (a gatinha tem ~0,09 de altura); ela fica em x = 0, de pé no chão (y = 0).
// Ângulos em radianos. "lean" inclina o corpo todo em torno do quadril (+ = para a frente).

// ---------- matemática mínima (matrizes 4x4 em colunas, como no WebGL/three) ----------
const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function trs(t, q, s) {
  const [x, y, z, w] = q;
  return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
          2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
          2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
          t[0], t[1], t[2], 1];
}
function qEuler(e) {   // ordem XYZ, igual ao THREE.Euler padrão
  const c1 = Math.cos(e[0] / 2), s1 = Math.sin(e[0] / 2), c2 = Math.cos(e[1] / 2), s2 = Math.sin(e[1] / 2), c3 = Math.cos(e[2] / 2), s3 = Math.sin(e[2] / 2);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}
function qMul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const tr = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

export const QUADRIL = 0.0165;   // altura das articulações das pernas

// matriz da raiz do modelo: posição, giro (y) e inclinação em torno do quadril
export function matrizRaiz(m) {
  return mul(mul(mul(mul(tr(m.pos[0], m.pos[1], m.pos[2]), rotY(m.ry)), tr(0, QUADRIL, 0)), rotX(m.lean || 0)), tr(0, -QUADRIL, 0));
}

// ---------- esqueleto a partir do JSON do glTF ----------
export function esqueleto(json) {
  const nos = json.nodes.map((n) => ({ nome: n.name || '', t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1], filhos: n.children || [], malha: n.mesh !== undefined }));
  const pai = new Map(); nos.forEach((n, i) => n.filhos.forEach((c) => pai.set(c, i)));
  const porNome = {};
  nos.forEach((n, i) => { if (!(n.nome in porNome)) porNome[n.nome] = i; });   // as juntas vêm antes das malhas de mesmo nome
  const malha = (nome) => nos.findIndex((n) => n.nome === nome && n.malha);
  return { nos, pai, porNome, malha };
}
// posição no mundo de um nó, com a pose aplicada
function noMundo(sk, m, idx) {
  const cadeia = []; for (let i = idx; i !== undefined; i = sk.pai.get(i)) cadeia.unshift(i);
  let M = matrizRaiz(m);
  for (const i of cadeia) {
    const n = sk.nos[i], e = m.j[n.nome];
    const q = e && !n.malha ? qMul(n.r, qEuler(e)) : n.r;
    M = mul(M, trs(n.t, q, n.malha || n.nome.startsWith('olhos_') || n.nome.startsWith('boca_') || n.nome.startsWith('extra_') ? [1, 1, 1] : n.s));
  }
  return [M[12], M[13], M[14]];
}
export function ponto(sk, m, nome) { const i = sk.porNome[nome]; return i === undefined ? null : noMundo(sk, m, i); }
function centroCabeca(sk, m) { return noMundo(sk, m, sk.malha('cabeça')); }

// ---------- ajudantes de tempo ----------
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
// quadros-chave: [[t, valor], ...] com transição suave; valor pode ser número ou lista
function kf(t, chaves) {
  if (t <= chaves[0][0]) return chaves[0][1];
  for (let i = 1; i < chaves.length; i++) {
    const [t1, v1] = chaves[i];
    if (t <= t1) {
      const [t0, v0] = chaves[i - 1]; const u = sm((t - t0) / Math.max(1e-6, t1 - t0));
      return Array.isArray(v0) ? v0.map((x, k) => x + (v1[k] - x) * u) : v0 + (v1 - v0) * u;
    }
  }
  return chaves[chaves.length - 1][1];
}
const somaJ = (...js) => { const o = {}; for (const j of js) for (const [k, v] of Object.entries(j)) o[k] = o[k] ? o[k].map((x, i) => x + v[i]) : v.slice(); return o; };
const escJ = (j, k) => { const o = {}; for (const [n, v] of Object.entries(j)) o[n] = v.map((x) => x * k); return o; };
const PERNAS = ['perna_esq', 'perna_dir'];

// passo de caminhada (no lugar); t em segundos
function andar(t, k) {
  if (k <= 0) return {};
  const st = t * Math.PI * 2 * 1.75, s = Math.sin(st), c = Math.cos(st);
  return escJ({
    tronco: [0.04, 0.06 * s, 0.025 * s], cabeca: [-0.03, -0.05 * s, -0.03 * s],
    perna_esq: [-0.58 * s, 0, 0], perna_dir: [0.58 * s, 0, 0], canela_esq: [0.9 * Math.max(0, c) + 0.1, 0, 0], canela_dir: [0.9 * Math.max(0, -c) + 0.1, 0, 0],
    braco_esq: [0.6 * s, 0, -0.12], braco_dir: [-0.6 * s, 0, 0.12], antebraco_esq: [-0.35, 0, 0], antebraco_dir: [-0.35, 0, 0],
  }, k);
}
const pulinho = (t, k) => (k > 0 ? 0.0011 * Math.abs(Math.cos(t * Math.PI * 2 * 1.75)) * k : 0);

// ---------- a coreografia ----------
// cfg.xEntra / cfg.xSai: onde ele começa (direita, fora da tela) e termina (esquerda, fora da tela)
export function criarCoreografia(skEla, skEle, cfg) {
  const VEL = 0.085;                                  // velocidade do passo (unidades/s)
  const YAW_ELA = 0.85, YAW_ELA_D = 1.25;              // ela virada para ele; e no beijo
  const YAW_ELE = -1.15, YAW_ELE_D = -1.0;            // ele virado para ela; e no beijo
  const DIP = 0.95;                                   // quanto ela inclina para trás (≈ 55°)
  const CURVA = 0.3;                                 // quanto ele se curva sobre ela
  const DESLOCA = 0.05;                               // o casal anda para a direita no giro

  // poses fixas
  const ABRACO_ELE = { braco_esq: [-1.25, 0, 0.5], braco_dir: [-1.25, 0, -0.5], antebraco_esq: [-0.55, 0, 0.35], antebraco_dir: [-0.55, 0, -0.35], cabeca: [0.08, 0, 0] };
  const ABRACO_ELA = { braco_esq: [-1.15, 0, 0.35], braco_dir: [-2.2, 0, -0.35], antebraco_esq: [-0.6, 0, 0.2], antebraco_dir: [-0.7, 0, -0.3], cabeca: [-0.06, 0, 0] };
  // no beijo: braço de perto estendido para trás (como o buquê da foto), o outro no pescoço dele, perna de perto levantada
  const DIP_ELA = { braco_esq: [0.55, 0, -0.75], antebraco_esq: [-0.2, 0, -0.1], braco_dir: [-2.5, 0, -0.45], antebraco_dir: [-0.9, 0, -0.3],
    cabeca: [-0.38, 0, 0], perna_esq: [-1.0, 0, 0], canela_esq: [1.4, 0, 0], perna_dir: [0.12, 0, 0], canela_dir: [0.05, 0, 0] };
  const DIP_ELE = { braco_esq: [-1.45, 0, 0.55], braco_dir: [-1.1, 0, -0.35], antebraco_esq: [-0.7, 0, 0.45], antebraco_dir: [-0.4, 0, -0.3],
    cabeca: [0.3, 0, 0], perna_esq: [-0.3, 0, 0], canela_esq: [0.35, 0, 0], perna_dir: [0.28, 0, 0] };

  // encontra a inclinação e a posição dele para a boca dele ficar junto da boca dela
  function alcancar(ela, ele0, folga) {
    const boca = ponto(skEla, ela, 'boca_sorriso'), cab = centroCabeca(skEla, ela);
    let n = sub(boca, cab); n = scl(n, 1 / len(n));
    const alvo = add(boca, scl(n, folga));
    const labios = (lean) => { const m = { ...ele0, pos: [0, 0, 0], lean, j: comPernas(ele0.j, lean) }; return ponto(skEle, m, 'boca_beijo'); };
    let a = -0.25, b = 1.35;                           // busca binária: quanto mais inclina, mais baixa a boca
    for (let i = 0; i < 22; i++) { const mid = (a + b) / 2; if (labios(mid)[1] > alvo[1]) a = mid; else b = mid; }
    const lean = (a + b) / 2, l = labios(lean);
    return { lean, pos: [alvo[0] - l[0], 0, alvo[2] - l[2]] };
  }
  // ao inclinar o corpo no quadril, as pernas giram ao contrário para os pés ficarem no chão
  function comPernas(j, lean) {
    const o = { ...j };
    for (const p of PERNAS) o[p] = add(o[p] || [0, 0, 0], [-lean, 0, 0]);
    return o;
  }

  // ---- tempos ----
  const ela0 = { pos: [0, 0, 0], ry: YAW_ELA, lean: 0, j: ABRACO_ELA };
  const chegada = alcancar(ela0, { ry: YAW_ELE, j: ABRACO_ELE }, 0.012);   // onde ele para
  const xPara = chegada.pos[0] + 0.006, zPara = chegada.pos[2];
  const T_IN = Math.min(5, Math.max(2.4, (cfg.xEntra - xPara) / VEL));
  const t1 = T_IN, t2 = t1 + 0.5, t3 = t2 + 0.8, t4 = t3 + 1.4, t5 = t4 + 2.6, t6 = t5 + 1.2, t7 = t6 + 0.6, t8 = t7 + 0.45;
  // depois de soltar ela, ele dá um passo para a frente (fica na frente dela) e sai andando
  // ao soltar, ele está na mesma pose da chegada (mesmos ângulos e folga)
  const posSolta = { pos: chegada.pos };   // ao soltar, ele volta exatamente para onde chegou
  const Z_FRENTE = 0.024;
  const xFim = cfg.xSai;
  const T_OUT = Math.max(1.6, (chegada.pos[0] + 0.01 - xFim) / VEL);
  const dur = () => t8 + T_OUT + 0.2;

  // no beijo: com ele parado e curvado sobre ela, acha quanto ela inclina para trás (e para onde desliza)
  // para a boca dela encontrar a boca dele
  function inclinar(ele, elaBase, folga, wPose) {
    const lab = ponto(skEle, ele, 'boca_beijo'), cab = ponto(skEle, ele, 'cabeca');
    let n = sub(lab, cab); n = scl(n, 1 / len(n));
    const alvo = add(lab, scl(n, folga));
    const pose = (dip) => {
      const w = Math.min(1, dip / DIP) * wPose;
      let j = somaJ(escJ(ABRACO_ELA, 1 - w), escJ(DIP_ELA, w));
      return { pos: [0, 0, 0], ry: elaBase.ry, lean: -dip, j: comPernas(j, -dip) };
    };
    const bocaY = (dip) => ponto(skEla, pose(dip), 'boca_sorriso')[1];
    let a = 0, b = 1.45;
    if (bocaY(a) <= alvo[1]) b = a;                  // já está na altura certa
    else for (let i = 0; i < 22; i++) { const m = (a + b) / 2; if (bocaY(m) > alvo[1]) a = m; else b = m; }
    const dip = (a + b) / 2, e = pose(dip), bo = ponto(skEla, e, 'boca_sorriso');
    e.pos = [alvo[0] - bo[0], 0, alvo[2] - bo[2]];
    return e;
  }

  function estado(t) {
    // ---------- ela (fora do beijo) ----------
    const elaYaw = kf(t, [[t1 - 1.0, 0], [t1 - 0.4, YAW_ELA], [t3, YAW_ELA], [t4, YAW_ELA_D], [t5, YAW_ELA_D], [t6, YAW_ELA], [t8 + 1.3, YAW_ELA], [t8 + 2.0, 0]]);
    const wAbr = kf(t, [[t2, 0], [t3, 1], [t6, 1], [t7, 0]]);
    let ela = { pos: [0, 0, 0], ry: elaYaw, lean: 0, j: escJ(ABRACO_ELA, wAbr) };

    // ---------- ele ----------
    let ele;
    if (t < t1) {                                     // chegando, andando para a esquerda
      const u = t / T_IN, x = cfg.xEntra + (xPara - cfg.xEntra) * (1 - Math.pow(1 - u, 1.7));
      const kw = 1 - sm((t - (T_IN - 0.35)) / 0.35);
      ele = { pos: [x, pulinho(t, kw), zPara], ry: -Math.PI / 2, lean: 0, j: andar(t, kw * sm(t / 0.3)) };
    } else if (t < t3) {                              // vira para ela e abraça
      const yaw = kf(t, [[t1, -Math.PI / 2], [t2, YAW_ELE]]);
      const wA = kf(t, [[t1, 0], [t3, 1]]);
      const r = alcancar(ela, { ry: yaw, j: escJ(ABRACO_ELE, wA) }, 0.012);
      const w = sm((t - t1) / (t2 - t1));
      const pos = [xPara + (r.pos[0] - xPara) * w, 0, zPara + (r.pos[2] - zPara) * w];
      ele = { pos, ry: yaw, lean: r.lean * w, j: comPernas(escJ(ABRACO_ELE, wA), r.lean * w) };
    } else if (t < t6) {                              // curva-se sobre ela, inclina ela para trás e beija
      const p = kf(t, [[t3, 0], [t4, 1], [t5, 1], [t6, 0]]);
      const balanco = t > t4 && t < t5 ? 0.05 * Math.sin((t - t4) * 2.6) * sm((t - t4) / 0.5) * sm((t5 - t) / 0.5) : 0;
      const lean = chegada.lean + (CURVA - chegada.lean) * p + balanco;
      const j = somaJ(escJ(ABRACO_ELE, 1 - p), escJ(DIP_ELE, p));
      ele = { pos: chegada.pos.slice(), ry: YAW_ELE, lean, j: comPernas(j, lean) };
      const folga = kf(t, [[t3, 0.012], [t4 - 0.3, 0.004], [t4, 0.0012], [t5, 0.0012], [t5 + 0.35, 0.005], [t6, 0.012]]);
      ela = inclinar(ele, { ry: elaYaw }, folga, p);
      if (t > t4 && t < t5) ela.j.canela_esq = add(ela.j.canela_esq, [0.2 * Math.sin((t - t4) * 7), 0, 0]);   // pezinho balançando
    } else if (t < t8) {                              // solta, dá um passo à frente e vira para a esquerda
      const p0 = posSolta.pos;
      const u = sm((t - t6) / (t7 - t6));
      const pos = [p0[0] + 0.01 * u, 0, p0[2] + (Z_FRENTE - p0[2]) * u];
      const yaw = kf(t, [[t6, YAW_ELE], [t7, YAW_ELE], [t8, -Math.PI / 2]]);
      ele = { pos, ry: yaw, lean: 0, j: escJ(ABRACO_ELE, 1 - sm((t - t6) / 0.5)) };
    } else {                                          // vai embora pela esquerda
      const p0 = [posSolta.pos[0] + 0.01, 0, Z_FRENTE];
      const tt = t - t8, u = Math.min(1, tt / T_OUT);
      ele = { pos: [p0[0] + (xFim - p0[0]) * u, pulinho(tt, 1), Z_FRENTE], ry: -Math.PI / 2, lean: 0, j: andar(tt, sm(tt / 0.3)) };
    }
    ela.j.cauda = [0, 0.3 * Math.sin(t * 2.4 * (t > t1 - 1 ? 1.8 : 1)), 0];
    ele.j.cauda = add(ele.j.cauda || [0, 0, 0], [0, 0.3 * Math.sin(t * 3.4), 0]);

    // meio giro: o casal gira junto (em torno dela) e anda um pouco para a direita, para caber a inclinação
    const giro = kf(t, [[t3 - 0.2, 0], [t3 + 0.8, 0.75], [t4, 0.5], [t5, 0.5], [t5 + 0.6, 0.62], [t6, 0]]);
    const desl = kf(t, [[t3 - 0.2, 0], [t4, DESLOCA], [t5, DESLOCA], [t6, 0]]);
    if (giro || desl) {
      const c = Math.cos(giro), sn = Math.sin(giro);
      for (const m of [ela, ele]) { const [x, y, z] = m.pos; m.pos = [x * c + z * sn + desl, y, -x * sn + z * c]; m.ry += giro; }
    }

    // ---------- rostinhos ----------
    let fe = { olhos: 'abertos', boca: 'sorriso', extras: [] };
    if (t > t1 - 1.6) fe = { olhos: 'surpresos', boca: 'surpresa', extras: [] };
    if (t > t1 - 1.0) fe = { olhos: 'apaixonados', boca: 'sorriso', extras: ['bochechas'] };
    if (t > t3 + 0.9) fe = { olhos: 'felizes', boca: 'beijo', extras: ['bochechas'] };
    if (t > t5 + 0.2) fe = { olhos: 'apaixonados', boca: 'sorriso', extras: ['bochechas'] };
    if (t > t8 + 2.0) fe = { olhos: 'felizes', boca: 'sorriso', extras: ['bochechas'] };
    Object.assign(ela, fe);
    let fo = { olhos: 'abertos', boca: 'sorriso', extras: [] };
    if (t > t1 - 0.9) fo = { olhos: 'apaixonados', boca: 'sorriso', extras: ['bochechas'] };
    if (t > t3 + 0.9) fo = { olhos: 'felizes', boca: 'beijo', extras: ['bochechas'] };
    if (t > t5 + 0.2) fo = { olhos: 'felizes', boca: 'sorriso', extras: ['bochechas'] };
    if (t > t7 && t < t8 + 1.0) fo = { olhos: 'piscadinha', boca: 'sorriso', extras: ['bochechas'] };
    Object.assign(ele, fo);
    // ---------- efeitos (corações) ----------
    const beijoPt = () => ponto(skEla, ela, 'boca_sorriso');
    return { ela, ele, beijoPt };
  }

  // momentos para os efeitos na tela
  const eventos = [
    { t: t1 - 1.0, nome: 'coracao_ela' },
    { t: t1 - 0.6, nome: 'coracao_ele' },
    { t: t4 + 0.15, nome: 'beijo' },
    { t: t4 + 1.3, nome: 'coracoes' },
    { t: t6 + 0.2, nome: 'coracao_ela' },
  ];
  return { estado, eventos, get duracao() { return dur(); }, tempos: { t1, t2, t3, t4, t5, t6, t7, t8 } };
}
