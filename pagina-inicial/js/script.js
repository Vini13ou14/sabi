const $ = s => document.querySelector(s);
const raiz = document.documentElement;

/* ===== Tema: sistema do usuário + escolha manual salva ===== */
const chkTema = $('#tema');
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

function aplicarTema(claro) {
  raiz.dataset.tema = claro ? 'claro' : 'escuro';
  if (chkTema) chkTema.checked = claro;
}

if (chkTema) {
  aplicarTema(raiz.dataset.tema === 'claro');
  chkTema.addEventListener('change', () => {
    aplicarTema(chkTema.checked);
    try { localStorage.setItem('tema', chkTema.checked ? 'claro' : 'escuro'); } catch (e) {}
  });
}

if (mq && typeof mq.addEventListener === 'function') {
  mq.addEventListener('change', e => {
    let salvo = null;
    try { salvo = localStorage.getItem('tema'); } catch (err) {}
    if (!salvo) aplicarTema(e.matches);
  });
}

/* ===== Menu lateral ===== */
const drawer = $('#drawer');
const fundo = $('#fundoMenu');
const btnAbrir = $('#abrirMenu');

function menu(abrir) {
  if (!drawer || !fundo || !btnAbrir) return;
  drawer.classList.toggle('aberto', abrir);
  drawer.setAttribute('aria-hidden', String(!abrir));
  fundo.hidden = !abrir;
  btnAbrir.setAttribute('aria-expanded', String(abrir));
  (abrir ? $('#fecharMenu') : btnAbrir).focus();
}

if (btnAbrir) {
  btnAbrir.addEventListener('click', () => menu(true));
}

const btnFechar = $('#fecharMenu');
if (btnFechar) btnFechar.addEventListener('click', () => menu(false));
if (fundo) fundo.addEventListener('click', () => menu(false));
document.addEventListener('keydown', e => {
  if (drawer && e.key === 'Escape' && drawer.classList.contains('aberto')) menu(false);
});

/* ===== Login (simulado: troque pelo Google Identity Services) ===== */
const botaoLogin = $('#login');
if (botaoLogin) {
  botaoLogin.addEventListener('click', e => {
    const b = e.currentTarget;
    const logado = b.dataset.logado === '1';
    b.dataset.logado = logado ? '0' : '1';
    b.textContent = logado ? 'fazer login com google' : 'sair da conta';
  });
}

/* ===== Mapa em tela cheia (zoom, arrastar e pinça) ===== */
const cheio = $('#mapaCheio');
const imgCheia = $('#imgCheia');
const abrirMapaBtn = $('#abrirMapa');

if (cheio && imgCheia && abrirMapaBtn) {
  let zoom = 1, px = 0, py = 0;
  const pontos = new Map();
  let distIni = 0, zoomIni = 1;

  function desenhar() {
    if (zoom <= 1) { px = 0; py = 0; }
    imgCheia.style.transform = `translate(${px}px, ${py}px) scale(${zoom})`;
  }

  function setZoom(z) {
    zoom = Math.min(6, Math.max(1, z));
    desenhar();
  }

  function abrirMapa() {
    zoom = 1; px = 0; py = 0; desenhar();
    cheio.hidden = false;
    $('#fecharMapa')?.focus();
    if (cheio.requestFullscreen) cheio.requestFullscreen().catch(() => {});
  }

  function fecharMapa() {
    if (cheio.hidden) return;
    cheio.hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    abrirMapaBtn.focus();
  }

  abrirMapaBtn.addEventListener('click', e => {
    e.stopPropagation();
    abrirMapa();
  });

  const btnFecharMapa = $('#fecharMapa');
  if (btnFecharMapa) btnFecharMapa.addEventListener('click', fecharMapa);

  const zoomMais = $('#zoomMais');
  const zoomMenos = $('#zoomMenos');
  const zoomReset = $('#zoomReset');
  if (zoomMais) zoomMais.addEventListener('click', () => setZoom(zoom + 0.5));
  if (zoomMenos) zoomMenos.addEventListener('click', () => setZoom(zoom - 0.5));
  if (zoomReset) zoomReset.addEventListener('click', () => setZoom(1));

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) fecharMapa();
  });

  document.addEventListener('keydown', e => {
    if (cheio.hidden) return;
    if (e.key === 'Escape') fecharMapa();
    if (e.key === '+' || e.key === '=') setZoom(zoom + 0.5);
    if (e.key === '-') setZoom(zoom - 0.5);
  });

  cheio.addEventListener('wheel', e => {
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 0.3 : -0.3));
  }, { passive: false });

  imgCheia.addEventListener('dblclick', () => setZoom(zoom > 1 ? 1 : 2.5));

  cheio.addEventListener('pointerdown', e => {
    if (e.target.closest('.mapa-ferramentas')) return;
    cheio.setPointerCapture(e.pointerId);
    pontos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cheio.classList.add('arrastando');
    if (pontos.size === 2) {
      const [a, b] = [...pontos.values()];
      distIni = Math.hypot(a.x - b.x, a.y - b.y);
      zoomIni = zoom;
    }
  });

  cheio.addEventListener('pointermove', e => {
    const ant = pontos.get(e.pointerId);
    if (!ant) return;
    const atual = { x: e.clientX, y: e.clientY };
    if (pontos.size === 1) {
      if (zoom > 1) {
        px += atual.x - ant.x;
        py += atual.y - ant.y;
        desenhar();
      }
    } else if (pontos.size === 2) {
      pontos.set(e.pointerId, atual);
      const [a, b] = [...pontos.values()];
      setZoom(zoomIni * Math.hypot(a.x - b.x, a.y - b.y) / distIni);
      return;
    }
    pontos.set(e.pointerId, atual);
  });

  const soltar = e => {
    pontos.delete(e.pointerId);
    if (!pontos.size) cheio.classList.remove('arrastando');
  };

  cheio.addEventListener('pointerup', soltar);
  cheio.addEventListener('pointercancel', soltar);
}

/* ===== Botões principais ===== */
const rotas = {
  sistema: 'pages/sistema.html',
  tutorial: 'pages/tutorial.html',
  mesa: 'pages/mesa.html',
  ficha: 'pages/ficha.html'
};
document.querySelectorAll('.btn').forEach(b => {
  b.addEventListener('click', () => {
    const destino = rotas[b.dataset.acao];
    if (destino) window.location.href = destino;
  });
});

/* ===== Comentários ===== */
const caixa = $('#caixa');
const formComentario = $('#formComentario');
const novoComentario = $('#novoComentario');
if (caixa && formComentario && novoComentario) {
  let salvos = [];
  try { salvos = JSON.parse(localStorage.getItem('comentarios') || '[]'); } catch (e) {}

  const mostrar = texto => {
    const p = document.createElement('p');
    p.textContent = texto;
    caixa.appendChild(p);
  };

  salvos.forEach(mostrar);
  formComentario.addEventListener('submit', e => {
    e.preventDefault();
    const texto = novoComentario.value.trim();
    if (!texto) return;
    salvos.push(texto);
    try { localStorage.setItem('comentarios', JSON.stringify(salvos)); } catch (e) {}
    mostrar(texto);
    formComentario.reset();
    novoComentario.focus();
  });
}
