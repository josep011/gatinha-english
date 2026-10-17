// Gatinha doutora — componente 3D para web (three.js).
// Uso:
//   import { montarGatinha } from './gatinha.js';
//   const gata = await montarGatinha(document.getElementById('gata'), { url: '/gatinha_doutora.glb' });
//   gata.humor('feliz');   // tchau normal feliz falando triste chorando brava irritada surpresa
//                          // apaixonada tonta sono dormindo marota envergonhada
//   gata.acao('andar'); gata.parar();   // anda no lugar até parar (a caixa na tela é quem se move)
//   gata.acao('beijo');                 // inclina, segura as patinhas e levanta o pezinho
//   gata.virar(-Math.PI / 2);           // vira o corpo (radianos; 0 = de frente)
//   gata.ponto('boca_sorriso'); gata.cabecaTela();   // posições na tela, em fração da caixa
//
// O mesmo componente monta o gatinho de terno: montarGatinha(el, { url: 'gatinho_terno.glb' }).
// Ele tem a boca extra 'beijo': gata.expressao('felizes', 'beijo', ['bochechas']).
//
// Requer o pacote "three" (npm i three) ou o importmap mostrado em exemplo-threejs.html.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { esqueleto, criarCoreografia, matrizRaiz, ponto } from './beijo.js';

const CACHE = new Map();   // o .glb é baixado e lido uma vez só, mesmo com várias gatinhas na tela

export async function montarGatinha(elemento, opcoes = {}) {
  const {
    url = 'gatinha_doutora.glb',
    humorInicial = 'tchau',   // como ela começa
    girarComMouse = false,    // deixa o usuário girar a gatinha
    fundo = null,             // null = transparente; ou uma cor, ex. '#ffffff'
    pixelRatioMax = 2,
  } = opcoes;

  // ---------- cena, câmera e luz ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: fundo === null });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioMax));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = 'NeutralToneMapping' in THREE ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  elemento.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  const cena = new THREE.Scene();
  if (fundo !== null) cena.background = new THREE.Color(fundo);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.001, 10);
  // luz de estúdio suave (ambiente) + uma luz principal para dar volume
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; cena.environment = ambiente;
  const sol = new THREE.DirectionalLight(0xffffff, 0.8); sol.position.set(-0.6, 1.0, 1.2); cena.add(sol);

  // ---------- modelo ----------
  if (!CACHE.has(url)) CACHE.set(url, new GLTFLoader().loadAsync(url));
  const gltf = await CACHE.get(url);
  const gata = gltf.scene.clone(true);
  cena.add(gata);

  // nós de articulação (giram) e de expressão (desenhos do rosto que aparecem/somem)
  const no = (nome) => gata.getObjectByName(nome);
  const rosto = {};
  gata.traverse((o) => { if (/^(olhos|boca|extra)_/.test(o.name) && !o.isMesh) rosto[o.name] = o; });
  const EH_ROSTO = (o) => rosto[o.name] === o;
  const repouso = new Map();
  gata.traverse((o) => repouso.set(o, { q: o.quaternion.clone(), s: o.scale.clone() }));
  const voltarAoRepouso = () => repouso.forEach((r, o) => { o.quaternion.copy(r.q); if (!EH_ROSTO(o)) o.scale.copy(r.s); });

  // enquadra a gatinha inteira
  const caixa = new THREE.Box3().setFromObject(gata);
  const centro = caixa.getCenter(new THREE.Vector3()); const altura = caixa.max.y - caixa.min.y;
  const dist = (altura * 0.62) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(centro.x + dist * 0.25, centro.y + altura * 0.05, centro.z + dist);
  camera.lookAt(centro);
  let controles = null;
  if (girarComMouse) {
    controles = new OrbitControls(camera, renderer.domElement);
    controles.target.copy(centro); controles.enablePan = false; controles.enableDamping = true;
    controles.minDistance = dist * 0.5; controles.maxDistance = dist * 2;
  }

  // ---------- animação "tchau": separa corpo (rotações) de rosto (trocas de desenho) ----------
  const mixer = new THREE.AnimationMixer(gata);
  const clip = gltf.animations.find((a) => a.name === 'tchau') || gltf.animations[0];
  const clipCorpo = new THREE.AnimationClip('tchau_corpo', clip.duration, clip.tracks.filter((t) => !t.name.endsWith('.scale')));
  const clipRosto = new THREE.AnimationClip('tchau_rosto', clip.duration, clip.tracks.filter((t) => t.name.endsWith('.scale')));
  const acaoCorpo = mixer.clipAction(clipCorpo);
  const acaoRosto = mixer.clipAction(clipRosto);

  // mostra um rosto: olhos + boca + extras (bochechas, raiva, suor)
  function mostrar(olhos, boca, extras = []) {
    const vis = new Set(['olhos_' + olhos, 'boca_' + boca, ...extras.map((e) => 'extra_' + e)]);
    for (const [n, o] of Object.entries(rosto)) o.scale.setScalar(vis.has(n) ? 1 : 0);
  }

  // ---------- humores: rosto + jeito do corpo + cauda ----------
  //   olhos: abertos piscando felizes tristes chorando bravos surpresos piscadinha sonolentos apaixonados tontos
  //   boca:  sorriso aberta triste brava reta surpresa lingua (ou 'nenhuma')
  //   extras: bochechas raiva suor
  const HUMORES = {
    normal:       { olhos: 'abertos',     boca: 'sorriso' },
    feliz:        { olhos: 'felizes',     boca: 'aberta',   extras: ['bochechas'], pula: true,  cauda: 2.2 },
    falando:      { olhos: 'abertos',     boca: 'sorriso',  fala: true },
    triste:       { olhos: 'tristes',     boca: 'triste',   cabeca: 0.3, orelhas: 0.35, cauda: 0.4, caudaBaixa: true },
    chorando:     { olhos: 'chorando',    boca: 'triste',   cabeca: 0.3, orelhas: 0.4,  cauda: 0.3, caudaBaixa: true },
    brava:        { olhos: 'bravos',      boca: 'brava',    extras: ['raiva'], orelhas: -0.25, cauda: 4.0, treme: true },
    irritada:     { olhos: 'bravos',      boca: 'reta',     orelhas: -0.15, cauda: 2.8 },
    surpresa:     { olhos: 'surpresos',   boca: 'surpresa', cabeca: -0.12, orelhas: -0.1 },
    apaixonada:   { olhos: 'apaixonados', boca: 'sorriso',  extras: ['bochechas'], cabeca: 0.05, cauda: 1.4 },
    tonta:        { olhos: 'tontos',      boca: 'lingua',   tonta: true },
    sono:         { olhos: 'sonolentos',  boca: 'reta',     cabeca: 0.15, lento: 0.5, orelhas: 0.15 },
    dormindo:     { olhos: 'piscando',    boca: 'nenhuma',  cabeca: 0.22, lento: 0.45, orelhas: 0.2, cauda: 0.3, caudaBaixa: true },
    marota:       { olhos: 'piscadinha',  boca: 'lingua',   cabeca: -0.05 },
    envergonhada: { olhos: 'abertos',     boca: 'reta',     extras: ['bochechas', 'suor'], cabeca: 0.18, orelhas: 0.2 },
  };
  let humorAtual = null; let t0 = 0; let H = HUMORES.normal;
  const estado = { olhos: 'abertos', boca: 'sorriso', extras: [] };
  function humor(nome) {
    humorAtual = nome; t0 = relogio.elapsedTime;
    mixer.stopAllAction(); voltarAoRepouso();
    if (nome === 'tchau') { mostrar('abertos', 'sorriso'); acaoCorpo.reset().play(); acaoRosto.reset().play(); return; }
    H = HUMORES[nome] || HUMORES.normal;
    estado.olhos = H.olhos; estado.boca = H.boca; estado.extras = H.extras || [];
    mostrar(estado.olhos, estado.boca, estado.extras);
  }
  // monta um rosto à mão (ex.: expressao('bravos', 'reta', ['suor']))
  function expressao(olhos = 'abertos', boca = 'sorriso', extras = []) {
    if (humorAtual === 'tchau') humor('normal');
    estado.olhos = olhos; estado.boca = boca; estado.extras = extras; mostrar(olhos, boca, extras);
  }

  // ---------- laço de desenho ----------
  const relogio = new THREE.Clock();
  const tronco = no('tronco'), cabeca = no('cabeca'), cauda = no('cauda');
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();
  const gira = (o, eixo, ang) => { if (o) o.quaternion.copy(repouso.get(o).q).multiply(q.setFromAxisAngle(eixo, ang)); };

  // ---------- ações: animações do corpo inteiro pelas articulações ----------
  //   pular pulinhos comemorar dancar palmas espreguicar marchar girar reverencia pensar
  //   olhar espirro susto timida sacudir balancar acenar
  const J = { tr: tronco, cab: cabeca, bE: no('braco_esq'), bD: no('braco_dir'), aE: no('antebraco_esq'), aD: no('antebraco_dir'),
              pE: no('perna_esq'), pD: no('perna_dir'), cE: no('canela_esq'), cD: no('canela_dir'), oE: no('orelha_esq'), oD: no('orelha_dir') };
  const MEMBROS = ['bE', 'bD', 'aE', 'aD', 'pE', 'pD', 'cE', 'cD'];
  const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const env = (p, a = 0.15) => (p < a ? sm(p / a) : p > 1 - a ? sm((1 - p) / a) : 1);
  const qa = new THREE.Quaternion(), ea = new THREE.Euler();
  const poe = (o, r, soma) => {           // r = [x, y, z] em radianos, a partir do repouso (ou somando ao que já está)
    if (!o || !r) return;
    if (!soma) o.quaternion.copy(repouso.get(o).q);
    o.quaternion.multiply(qa.setFromEuler(ea.set(r[0] || 0, r[1] || 0, r[2] || 0)));
  };
  const agacha = (k) => ({ pE: [-0.55 * k, 0, 0], pD: [-0.55 * k, 0, 0], cE: [1.0 * k, 0, 0], cD: [1.0 * k, 0, 0], y: -0.0022 * k });
  const junta = (...ps) => { const o = {}; for (const p of ps) for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'number') o[k] = (o[k] || 0) + v; else o[k] = (o[k] || [0, 0, 0]).map((x, i) => x + (v[i] || 0)); } return o; };
  function pulo(p, alto = 0.022) {        // agacha, salta com os braços para cima, aterrissa dobrando os joelhos
    const k1 = p < 0.22 ? sm(p / 0.22) : p < 0.32 ? 1 - sm((p - 0.22) / 0.1) : 0;
    const k2 = p > 0.74 ? (p < 0.84 ? sm((p - 0.74) / 0.1) : 1 - sm((p - 0.84) / 0.16)) : 0;
    const ar = p >= 0.3 && p <= 0.78 ? Math.sin(Math.PI * (p - 0.3) / 0.48) : 0;
    const k = Math.max(k1, k2);
    return junta(agacha(k), {
      y: alto * ar, tr: [0.1 * k, 0, 0], cab: [0.12 * k - 0.12 * ar, 0, 0],
      pE: [-0.3 * ar, 0, 0], pD: [-0.3 * ar, 0, 0], cE: [0.6 * ar, 0, 0], cD: [0.6 * ar, 0, 0],
      bE: [0.5 * k, 0, -(0.15 + 2.4 * ar)], bD: [0.5 * k, 0, 0.15 + 2.4 * ar], aE: [-0.3 * ar, 0, 0], aD: [-0.3 * ar, 0, 0],
    });
  }
  const ACOES = {
    pular: { dur: 1.0, f: (p) => pulo(p) },
    pulinhos: { dur: 1.3, f: (p) => pulo((p * 2) % 1, 0.012) },
    comemorar: { dur: 1.9, f: (p, t) => { const e = env(p), h = Math.abs(Math.sin(p * 3 * Math.PI)) * e;
      return junta(agacha(0.35 * (1 - h) * e), { y: 0.009 * h, cab: [-0.12 * e, 0, 0.1 * Math.sin(t * 6) * e],
        bE: [0, 0, -(2.5 + 0.25 * Math.sin(t * 14)) * e], bD: [0, 0, (2.5 + 0.25 * Math.sin(t * 14 + 1)) * e],
        aE: [0, 0, -0.35 * Math.sin(t * 14) * e], aD: [0, 0, 0.35 * Math.sin(t * 14 + 1) * e] }); } },
    dancar: { dur: 2.8, f: (p, t) => { const e = env(p, 0.1), b = t * Math.PI * 2 * 1.6, s = Math.sin(b), c = Math.sin(b + Math.PI);
      return { y: 0.0015 * Math.abs(s) * e, tr: [0, 0.18 * Math.sin(b / 2) * e, 0.1 * s * e], cab: [0, 0.25 * Math.sin(b / 2) * e, 0.18 * s * e],
        pE: [-0.3 * Math.max(0, s) * e, 0, 0], cE: [0.6 * Math.max(0, s) * e, 0, 0], pD: [-0.3 * Math.max(0, c) * e, 0, 0], cD: [0.6 * Math.max(0, c) * e, 0, 0],
        bE: [-0.4 * e, 0, -(1.0 + 0.9 * s) * e], bD: [-0.4 * e, 0, (1.0 + 0.9 * c) * e], aE: [-1.2 * e, 0, 0.3 * s * e], aD: [-1.2 * e, 0, -0.3 * c * e] }; } },
    palmas: { dur: 1.8, f: (p, t) => { const e = env(p), o = 0.5 + 0.5 * Math.sin(t * 17);
      return { y: 0.001 * Math.abs(Math.sin(t * 8.5)) * e, cab: [-0.08 * e, 0, 0.08 * Math.sin(t * 4) * e],
        bE: [-1.0 * e, 0, (0.1 + 0.45 * o) * e], bD: [-1.0 * e, 0, -(0.1 + 0.45 * o) * e], aE: [-0.7 * e, 0, 0.4 * o * e], aD: [-0.7 * e, 0, -0.4 * o * e] }; } },
    espreguicar: { dur: 2.8, f: (p, t) => { const up = p < 0.35 ? sm(p / 0.35) : p < 0.72 ? 1 : 1 - sm((p - 0.72) / 0.28), tr = up * (1 + 0.04 * Math.sin(t * 20) * (p > 0.35 && p < 0.72));
      return { y: 0.0018 * up, tr: [-0.12 * up, 0, 0], cab: [-0.3 * up, 0, 0.1 * up], oE: [0, 0, 0.2 * up], oD: [0, 0, -0.2 * up],
        bE: [-0.2 * up, 0, -2.85 * tr], bD: [-0.2 * up, 0, 2.85 * tr], aE: [0, 0, -0.15 * up], aD: [0, 0, 0.15 * up],
        pE: [0.12 * up, 0, 0], pD: [0.12 * up, 0, 0], cE: [-0.05 * up, 0, 0], cD: [-0.05 * up, 0, 0] }; } },
    marchar: { dur: 2.6, f: (p, t) => { const e = env(p, 0.08), st = t * Math.PI * 2 * 1.7, s = Math.sin(st), c = -s;
      return { y: 0.0016 * Math.abs(s) * e, tr: [0, 0, 0.04 * s * e], cab: [0, 0, -0.06 * s * e],
        pE: [-0.55 * Math.max(0, s) * e, 0, 0], cE: [0.9 * Math.max(0, s) * e, 0, 0], pD: [-0.55 * Math.max(0, c) * e, 0, 0], cD: [0.9 * Math.max(0, c) * e, 0, 0],
        bE: [0.5 * s * e, 0, -0.12 * e], bD: [0.5 * c * e, 0, 0.12 * e], aE: [-0.5 * e, 0, 0], aD: [-0.5 * e, 0, 0] }; } },
    girar: { dur: 1.3, f: (p) => { const e = env(p, 0.2), ar = Math.sin(Math.PI * Math.min(1, Math.max(0, (p - 0.1) / 0.8)));
      return junta(agacha(0.4 * (1 - ar) * e), { ry: Math.PI * 2 * sm(p), y: 0.012 * ar, bE: [0, 0, -1.0 * e], bD: [0, 0, 1.0 * e], cab: [-0.1 * ar, 0, 0] }); } },
    reverencia: { dur: 2.0, f: (p) => { const e = env(p, 0.25);
      return { cab: [0.45 * e, 0, 0], tr: [0.08 * e, 0, 0], pE: [-0.08 * e, 0, 0], pD: [-0.08 * e, 0, 0], oE: [0, 0, 0.15 * e], oD: [0, 0, -0.15 * e],
        bD: [-0.7 * e, 0, -0.35 * e], aD: [-1.3 * e, 0, -0.2 * e], bE: [0.5 * e, 0, -0.1 * e], aE: [-0.3 * e, 0, 0] }; } },
    pensar: { dur: 2.6, f: (p, t) => { const e = env(p, 0.2);
      return { cab: [-0.1 * e, 0.12 * e, 0.16 * e + 0.03 * Math.sin(t * 3) * e], bD: [-0.85 * e, 0, -0.3 * e], aD: [-2.1 * e, 0, -0.15 * e],
        bE: [-0.4 * e, 0, 0.35 * e], aE: [-1.3 * e, 0, 0.25 * e] }; } },
    olhar: { dur: 2.8, f: (p) => { const e = env(p, 0.15), v = Math.sin(p * Math.PI * 2);
      return { cab: [-0.05 * e, 0.55 * v * e, 0.08 * v * e], tr: [0, 0.12 * v * e, 0], oE: [0, 0, -0.12 * e], oD: [0, 0, 0.12 * e] }; } },
    espirro: { dur: 1.1, f: (p) => { const a = p < 0.5 ? sm(p / 0.5) : 0, j = p >= 0.5 ? Math.exp(-(p - 0.5) * 9) * (p < 0.56 ? sm((p - 0.5) / 0.06) : 1) : 0;
      return { cab: [-0.25 * a + 0.45 * j, 0, 0], tr: [-0.05 * a + 0.1 * j, 0, 0], y: 0.003 * j,
        bE: [-0.6 * a, 0, 0.2 * a], bD: [-0.6 * a, 0, -0.2 * a], aE: [-1.2 * a, 0, 0], aD: [-1.2 * a, 0, 0] }; } },
    susto: { dur: 0.95, f: (p) => { const e = env(p, 0.12), ar = Math.sin(Math.PI * Math.min(1, p / 0.55));
      return { y: 0.01 * ar, cab: [-0.25 * e, 0, 0], oE: [0, 0, -0.2 * e], oD: [0, 0, 0.2 * e],
        bE: [-0.3 * e, 0, -1.5 * e], bD: [-0.3 * e, 0, 1.5 * e], aE: [-0.6 * e, 0, 0], aD: [-0.6 * e, 0, 0],
        pE: [-0.25 * ar, 0, 0], pD: [-0.25 * ar, 0, 0], cE: [0.5 * ar, 0, 0], cD: [0.5 * ar, 0, 0] }; } },
    timida: { dur: 2.4, f: (p, t) => { const e = env(p, 0.18), w = Math.sin(t * 4.5);
      return { tr: [0, 0.22 * w * e, 0], cab: [0.22 * e, -0.15 * w * e, 0.12 * e], pE: [0, 0, 0], cD: [0.25 * e, 0, 0], pD: [-0.12 * e, 0, 0],
        bE: [0.7 * e, 0, 0.25 * e], bD: [0.7 * e, 0, -0.25 * e], aE: [-0.5 * e, 0, 0.3 * e], aD: [-0.5 * e, 0, -0.3 * e] }; } },
    sacudir: { dur: 1.1, f: (p, t) => { const e = env(p, 0.15), v = Math.sin(t * 34);
      return { tr: [0, 0.35 * v * e, 0.04 * v * e], cab: [0, -0.3 * v * e, 0], oE: [0, 0, 0.3 * v * e], oD: [0, 0, 0.3 * v * e],
        bE: [0, 0, -(0.5 + 0.3 * v) * e], bD: [0, 0, (0.5 - 0.3 * v) * e] }; } },
    balancar: { dur: 2.8, f: (p, t) => { const e = env(p, 0.15), w = Math.sin(t * 3);
      return { tr: [0, 0, 0.07 * w * e], cab: [0, 0, 0.2 * e + 0.05 * w * e], cD: [0.3 * e, 0, 0], pD: [-0.15 * e, 0, 0],
        bE: [-0.75 * e, 0, 0.42 * e], bD: [-0.75 * e, 0, -0.42 * e], aE: [-0.95 * e, 0, 0.2 * e], aD: [-0.95 * e, 0, -0.2 * e] }; } },
    acenar: { dur: 2.3, f: (p, t) => { const e = env(p, 0.15);
      return { cab: [0, 0.1 * e, 0.12 * e], bD: [-0.2 * e, 0, 2.45 * e], aD: [0, 0, 0.45 * Math.sin(t * 11) * e], bE: [0, 0, -0.1 * e], tr: [0, 0, 0.03 * Math.sin(t * 5.5) * e] }; } },
    // andar: passo contínuo (dura até chamar parar()); a gatinha anda "no lugar", quem a leva é a caixa na tela
    andar: { dur: 600, f: (p, t) => { const e = sm(t / 0.3), st = t * Math.PI * 2 * 1.75, s = Math.sin(st), c = Math.cos(st);
      return { y: 0.0011 * Math.abs(c) * e, tr: [0.04 * e, 0.06 * s * e, 0.025 * s * e], cab: [-0.03 * e, -0.05 * s * e, -0.03 * s * e],
        pE: [-0.58 * s * e, 0, 0], pD: [0.58 * s * e, 0, 0], cE: [0.9 * Math.max(0, c) * e + 0.1 * e, 0, 0], cD: [0.9 * Math.max(0, -c) * e + 0.1 * e, 0, 0],
        bE: [0.6 * s * e, 0, -0.12 * e], bD: [-0.6 * s * e, 0, 0.12 * e], aE: [-0.35 * e, 0, 0], aD: [-0.35 * e, 0, 0] }; } },
    // beijo: inclina para a frente, segura com as patinhas e levanta um pezinho para trás
    beijo: { dur: 2.2, f: (p, t) => { const e = env(p, 0.18), w = Math.sin(t * 5);
      return { y: 0.0009 * e, tr: [0.1 * e, 0, 0], cab: [0.12 * e, 0, (0.14 + 0.03 * w) * e],
        bE: [-1.05 * e, 0, 0.3 * e], bD: [-1.05 * e, 0, -0.3 * e], aE: [-0.75 * e, 0, 0.35 * e], aD: [-0.75 * e, 0, -0.35 * e],
        pD: [0.22 * e, 0, 0], cD: [(1.25 + 0.12 * w) * e, 0, 0], pE: [-0.05 * e, 0, 0], oE: [0, 0, 0.12 * e], oD: [0, 0, -0.12 * e] }; } },
  };
  let A = null;
  const base = { y: gata.position.y, ry: gata.rotation.y };
  function acao(nome, dur) {
    const a = ACOES[nome]; if (!a) return 0;
    if (humorAtual === 'tchau') humor('normal');
    A = { nome, t0: relogio.elapsedTime, dur: dur || a.dur, f: a.f };
    return A.dur;
  }
  // termina a ação atual devagarinho (ex.: parar de andar)
  function parar(suave = 0.3) {
    if (!A) return;
    if (!suave) { A.dur = 1e-6; return; }
    if (A.fim == null) A.fim = relogio.elapsedTime, A.suave = suave;
  }
  const escala = (r, k) => { const o = {}; for (const [n, v] of Object.entries(r)) o[n] = typeof v === 'number' ? v * k : v.map((x) => x * k); return o; };
  function aplicarAcao(t) {
    if (!A) return;
    let p = (t - A.t0) / A.dur;
    let k = 1;
    if (A.fim != null) { k = 1 - sm((t - A.fim) / A.suave); if (k <= 0) p = 1; }
    for (const m of MEMBROS) poe(J[m], [0, 0, 0]);
    if (p >= 1) { A = null; gata.position.y = base.y; gata.rotation.y = base.ry; return; }
    let r = A.f(p, t - A.t0);
    if (k < 1) r = escala(r, k);
    for (const m of MEMBROS) if (r[m]) poe(J[m], r[m]);
    for (const m of ['tr', 'cab', 'oE', 'oD']) if (r[m]) poe(J[m], r[m], true);
    gata.position.y = base.y + (r.y || 0); gata.rotation.y = base.ry + (r.ry || 0);
  }
  let proximaPiscada = 2.5;
  function quadro() {
    const dt = Math.min(relogio.getDelta(), 0.1); const t = relogio.elapsedTime;
    mixer.update(dt);
    if (humorAtual !== 'tchau') {
      const tt = t - t0, lento = H.lento || 1;
      // corpo "vivo": balança, respira; pula de alegria, treme de raiva ou roda de tontura
      let rz = 0.035 * Math.sin(tt * 1.6 * lento);
      if (H.treme) rz += 0.012 * Math.sin(tt * 40);
      if (H.tonta) rz = 0.09 * Math.sin(tt * 2.2);
      gira(tronco, Z, rz);
      const pulo = H.pula ? 0.08 * Math.abs(Math.sin(tt * 6)) : 0;
      gira(cabeca, X, (H.cabeca || 0) + 0.05 * Math.sin(tt * 1.1 * lento + 1) + pulo + (H.tonta ? 0.06 * Math.cos(tt * 2.2) : 0));
      gira(no('orelha_esq'), Z, H.orelhas || 0); gira(no('orelha_dir'), Z, -(H.orelhas || 0));
      // cauda: balança para os lados (rápido quando brava, devagar e baixa quando triste)
      if (cauda) {
        const vel = H.cauda || 1.2;
        cauda.quaternion.copy(repouso.get(cauda).q).multiply(q.setFromAxisAngle(Y, 0.32 * Math.sin(tt * vel * 1.6)));
        if (H.caudaBaixa) cauda.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(X, -0.45));
      }
      let olhos = estado.olhos, boca = estado.boca;
      if (olhos === 'abertos') {                    // pisca sozinha de vez em quando
        if (t > proximaPiscada) proximaPiscada = t + 2.5 + Math.random() * 3;
        if (proximaPiscada - t > 2.35 && proximaPiscada - t < 2.5) olhos = 'piscando';
      }
      if (H.fala) boca = Math.floor(tt * 7) % 2 ? 'aberta' : 'sorriso';
      mostrar(olhos, boca, estado.extras);
    }
    aplicarAcao(t);
    controles?.update();
    renderer.render(cena, camera);
  }
  renderer.setAnimationLoop(quadro);

  // ---------- tamanho ----------
  const ajustar = () => {
    const w = elemento.clientWidth || 300, h = elemento.clientHeight || 400;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const obs = new ResizeObserver(ajustar); obs.observe(elemento); ajustar();

  humor(humorInicial);

  return {
    pausar() { renderer.setAnimationLoop(null); },                          // para de desenhar (gatinha guardada)
    retomar() { relogio.getDelta(); renderer.setAnimationLoop(quadro); },   // volta a desenhar
    humor,       // 'tchau' ou um dos HUMORES acima
    acao,        // animação de corpo: pular, comemorar, dancar, palmas... (ver ACOES); acao('andar') segue até parar()
    parar,       // encerra a ação atual com suavidade
    acoes: Object.keys(ACOES),
    virar(ang) { base.ry = ang; gata.rotation.y = ang; },   // gira o corpo todo (radianos; 0 = de frente)
    ponto(nome) {   // onde um nó aparece na tela, em fração da caixa (0..1): ex. ponto('boca_sorriso')
      const o = gata.getObjectByName(nome); if (!o) return null;
      gata.updateMatrixWorld(true); camera.updateMatrixWorld();
      const v = o.getWorldPosition(new THREE.Vector3()).project(camera);
      return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
    },
    cabecaTela() {  // círculo da cabeça na tela, em fração da caixa: { x, y, rx, ry }
      let m = null; gata.traverse((o) => { if (!m && o.isMesh && /^cabe(ç|c)a$/.test(o.name)) m = o; });
      if (!m) return null;
      gata.updateMatrixWorld(true); camera.updateMatrixWorld();
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const bs = m.geometry.boundingSphere, c = bs.center.clone().applyMatrix4(m.matrixWorld);
      const r = bs.radius * m.matrixWorld.getMaxScaleOnAxis() * 0.97;
      const dir = (i) => new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, i).multiplyScalar(r);
      const p0 = c.clone().project(camera), px = c.clone().add(dir(0)).project(camera), py = c.clone().add(dir(1)).project(camera);
      return { x: (p0.x + 1) / 2, y: (1 - p0.y) / 2, rx: (px.x - p0.x) / 2, ry: (p0.y - py.y) / -2 };
    },
    posar(nome, p) {             // mostra um quadro da ação (p de 0 a 1), útil para testes e prévias
      const a = ACOES[nome]; if (!a) return; for (const m of ['tr', 'cab', 'oE', 'oD']) poe(J[m], [0, 0, 0]); A = { nome, t0: 0, dur: a.dur, f: a.f }; aplicarAcao(Math.min(0.999, p) * a.dur); A = null; renderer.render(cena, camera);
    },
    humores: ['tchau', ...Object.keys(HUMORES)],
    expressao,   // (olhos, boca, extras) à mão
    modelo: gata, cena, camera, renderer,
    destruir() {
      renderer.setAnimationLoop(null); obs.disconnect(); controles?.dispose(); mixer.stopAllAction();
      ambiente.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}

// ======================================================================
// Beijo de cinema: os dois gatinhos numa cena só (um canvas por cima da tela).
//   const cena = await montarBeijo(document.getElementById('camada'));
//   await cena.tocar({ camRef, onde, aoComecar, aoEvento });
// camRef: a câmera da gatinha na caixa dela (a cena usa a mesma, ampliada para a camada inteira).
// onde(): { bw, bh, ox, oy } tamanho da caixa dela e onde ela está dentro da camada (px CSS).
// ======================================================================
function boneco(gltf) {
  const raiz = new THREE.Group(); raiz.matrixAutoUpdate = false;
  const m = gltf.scene.clone(true); raiz.add(m);
  const rest = new Map(); m.traverse((o) => rest.set(o, o.quaternion.clone()));
  const juntas = {}; m.traverse((o) => { if (!o.isMesh && o.name && !(o.name in juntas)) juntas[o.name] = o; });
  const rosto = {}; m.traverse((o) => { if (/^(olhos|boca|extra)_/.test(o.name) && !o.isMesh) rosto[o.name] = o; });
  const q = new THREE.Quaternion(), eu = new THREE.Euler();
  let usadas = [];
  function aplicar(st) {
    raiz.matrix.fromArray(matrizRaiz(st)); raiz.matrixWorldNeedsUpdate = true;
    for (const n of usadas) if (!(n in st.j) && juntas[n]) juntas[n].quaternion.copy(rest.get(juntas[n]));
    for (const [n, e] of Object.entries(st.j)) { const o = juntas[n]; if (o) o.quaternion.copy(rest.get(o)).multiply(q.setFromEuler(eu.set(e[0], e[1], e[2]))); }
    usadas = Object.keys(st.j);
    const vis = new Set(['olhos_' + st.olhos, 'boca_' + st.boca, ...(st.extras || []).map((x) => 'extra_' + x)]);
    for (const [n, o] of Object.entries(rosto)) o.scale.setScalar(vis.has(n) ? 1 : 0);
  }
  return { raiz, aplicar };
}

export async function montarBeijo(elemento, opcoes = {}) {
  const { urlEla = 'gatinha_doutora.glb', urlEle = 'gatinho_terno.glb', pixelRatioMax = 2 } = opcoes;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioMax));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = 'NeutralToneMapping' in THREE ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  elemento.appendChild(renderer.domElement);
  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; cena.environment = ambiente;
  const sol = new THREE.DirectionalLight(0xffffff, 0.8); sol.position.set(-0.6, 1.0, 1.2); cena.add(sol);
  for (const u of [urlEla, urlEle]) if (!CACHE.has(u)) CACHE.set(u, new GLTFLoader().loadAsync(u));
  const [gA, gO] = await Promise.all([CACHE.get(urlEla), CACHE.get(urlEle)]);
  const ela = boneco(gA), ele = boneco(gO); cena.add(ela.raiz, ele.raiz);
  const skA = esqueleto(gA.parser.json), skO = esqueleto(gO.parser.json);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.001, 10);
  const v = new THREE.Vector3();
  let W = 1, H = 1;
  function ajustar(o) {
    W = elemento.clientWidth || 300; H = elemento.clientHeight || 300;
    renderer.setSize(W, H, false);
    camera.aspect = o.bw / o.bh;
    camera.setViewOffset(o.bw, o.bh, -o.ox, -o.oy, W, H);   // a câmera da caixa dela, esticada para a camada toda
    camera.updateProjectionMatrix();
  }
  const naTela = (p) => { v.set(p[0], p[1], p[2]).project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };
  let parar = null;
  function tocar({ camRef, onde, aoComecar, aoEvento }) {
    return new Promise((resolve) => {
      camera.position.copy(camRef.position); camera.quaternion.copy(camRef.quaternion);
      camera.fov = camRef.fov; camera.zoom = camRef.zoom; camera.near = camRef.near; camera.far = camRef.far;
      camera.updateMatrixWorld();
      ajustar(onde());
      // onde ele entra (à direita, fora da tela) e onde sai (à esquerda, fora da tela)
      const p0 = naTela([0, 0, 0]), p1 = naTela([0.1, 0, 0]), pxPorUn = Math.max(1, (p1.x - p0.x) / 0.1);
      const xEntra = (W - p0.x) / pxPorUn + 0.05, xSai = -p0.x / pxPorUn - 0.06;
      const coreo = criarCoreografia(skA, skO, { xEntra, xSai });
      const pend = coreo.eventos.slice();
      let t0 = null, comecou = false, fim = false;
      const acabar = () => { if (fim) return; fim = true; renderer.setAnimationLoop(null); parar = null; resolve(); };
      parar = acabar;
      renderer.setAnimationLoop((agora) => {
        if (t0 === null) t0 = agora;
        const t = (agora - t0) / 1000;
        const o = onde(); if (!o) return acabar();
        ajustar(o);
        const st = coreo.estado(Math.min(t, coreo.duracao));
        ela.aplicar(st.ela); ele.aplicar(st.ele);
        renderer.render(cena, camera);
        if (!comecou) { comecou = true; aoComecar && aoComecar(); }
        while (pend.length && t >= pend[0].t) {
          const e = pend.shift();
          const cab = e.nome === 'coracao_ela' ? ponto(skA, st.ela, 'cabeca') : e.nome === 'coracao_ele' ? ponto(skO, st.ele, 'cabeca') : null;
          const alvo = cab ? [cab[0], cab[1] + 0.036, cab[2]] : st.beijoPt();   // corações saem de cima da cabeça
          const pt = naTela(alvo);
          try { aoEvento && aoEvento(e.nome, pt.x, pt.y); } catch (err) {}
        }
        if (t >= coreo.duracao) acabar();
      });
    });
  }
  return {
    tocar,
    parar() { parar && parar(); },
    destruir() { parar && parar(); ambiente.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
