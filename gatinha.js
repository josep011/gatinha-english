// Gatinha doutora — componente 3D para web (three.js).
// Uso:
//   import { montarGatinha } from './gatinha.js';
//   const gata = await montarGatinha(document.getElementById('gata'), { url: '/gatinha_doutora.glb' });
//   gata.humor('feliz');   // tchau normal feliz falando triste chorando brava irritada surpresa
//                          // apaixonada tonta sono dormindo marota envergonhada
//
// Requer o pacote "three" (npm i three) ou o importmap mostrado em exemplo-threejs.html.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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
    humor,       // 'tchau' ou um dos HUMORES acima
    humores: ['tchau', ...Object.keys(HUMORES)],
    expressao,   // (olhos, boca, extras) à mão
    modelo: gata, cena, camera, renderer,
    destruir() {
      renderer.setAnimationLoop(null); obs.disconnect(); controles?.dispose(); mixer.stopAllAction();
      ambiente.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
