'use strict';

(function () {
  const $ = selector => document.querySelector(selector);
  const lista = $('#listaMesas');
  if (!lista) return;

  const minhasMesas = $('#listaMinhasMesas');
  const solicitacoes = $('#listaSolicitacoes');
  const btnEntrar = $('#entrar');
  const busca = $('#buscarMesa');
  const dlg = $('#dlgMesa');
  const form = $('#formMesa');
  const campo = $('#nomeMesa');
  const aviso = $('#avisoMesa');
  let selecionada = null;
  let mesasEncontradas = [];
  let debounceBusca;
  let timerAviso;
  let numeroBusca = 0;

  async function api(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers
        }
      });
    } catch {
      throw new Error('Não foi possível conectar ao servidor. Verifique se o Sabi está em execução.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
    return result;
  }

  function mostrarAviso(texto) {
    aviso.textContent = texto;
    aviso.classList.add('visivel');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => aviso.classList.remove('visivel'), 4500);
  }

  function exibirVazio(container, texto) {
    const vazio = document.createElement('li');
    vazio.className = 'mesa-sem-mesas';
    vazio.textContent = texto;
    container.replaceChildren(vazio);
  }

  function criarTexto(tag, texto) {
    const elemento = document.createElement(tag);
    elemento.textContent = texto;
    return elemento;
  }

  function renderizarMinhasMesas(mesas) {
    minhasMesas.replaceChildren();
    if (!mesas.length) {
      exibirVazio(minhasMesas, 'Você ainda não criou ou entrou em uma mesa.');
      return;
    }

    mesas.forEach(mesa => {
      const item = document.createElement('li');
      item.className = 'mesa-item mesa-item-gerenciar';
      const card = document.createElement('article');
      card.className = 'mesa-gerenciar-card';
      card.append(
        criarTexto('strong', mesa.name),
        criarTexto('small', `ID: ${mesa.id}`),
        criarTexto('small', `${mesa.members_count} participantes · ${mesa.role === 'dono' ? 'criador' : 'membro'}`)
      );
      const acessar = document.createElement('a');
      acessar.className = 'mesa-acao-primaria';
      acessar.href = `sala.html?id=${encodeURIComponent(mesa.id)}`;
      acessar.textContent = 'acessar mesa';
      card.appendChild(acessar);

      item.appendChild(card);
      minhasMesas.appendChild(item);
    });
  }

  function renderizarSolicitacoes(requests) {
    solicitacoes.replaceChildren();
    if (!requests.length) {
      exibirVazio(solicitacoes, 'Não há solicitações pendentes para suas mesas.');
      return;
    }

    requests.forEach(request => {
      const item = document.createElement('li');
      item.className = 'mesa-item';
      const card = document.createElement('article');
      card.className = 'mesa-solicitacao-card';
      card.append(
        criarTexto('strong', request.requester_name),
        criarTexto('small', `${request.requester_email} · mesa: ${request.mesa_name}`),
        criarTexto('small', `ID da mesa: ${request.mesa_id}`)
      );
      const actions = document.createElement('div');
      actions.className = 'mesa-solicitacao-acoes';
      [['aprovar', 'aprovar'], ['rejeitar', 'rejeitar']].forEach(([action, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = action === 'aprovar' ? 'mesa-acao-primaria' : 'mesa-acao-secundaria';
        button.textContent = label;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await api(`/api/solicitacoes/${encodeURIComponent(request.id)}/${action}`, { method: 'POST' });
            mostrarAviso(action === 'aprovar' ? 'Solicitação aprovada.' : 'Solicitação rejeitada.');
            await carregarPainel();
          } catch (error) {
            mostrarAviso(error.message);
            button.disabled = false;
          }
        });
        actions.appendChild(button);
      });
      card.appendChild(actions);
      item.appendChild(card);
      solicitacoes.appendChild(item);
    });
  }

  function atualizarBotaoEntrar() {
    const mesa = mesasEncontradas.find(resultado => resultado.id === selecionada);
    if (!mesa) {
      btnEntrar.disabled = true;
      btnEntrar.textContent = 'solicitar entrada';
      btnEntrar.title = 'Selecione uma mesa disponível';
      return;
    }
    if (mesa.is_member) {
      btnEntrar.disabled = true;
      btnEntrar.textContent = 'você já faz parte';
      btnEntrar.title = 'Você já é membro ou dono desta mesa';
      return;
    }
    if (mesa.request_pending) {
      btnEntrar.disabled = true;
      btnEntrar.textContent = 'solicitação pendente';
      btnEntrar.title = 'Aguarde a resposta do dono da mesa';
      return;
    }
    btnEntrar.disabled = false;
    btnEntrar.textContent = 'solicitar entrada';
    btnEntrar.title = 'Enviar uma solicitação ao dono da mesa';
  }

  function renderizarMesas(mesas) {
    mesasEncontradas = mesas;
    if (!mesas.length) {
      exibirVazio(lista, busca.value.trim()
        ? 'Nenhuma mesa encontrada. Confira o ID ou tente outra parte do nome.'
        : 'Ainda não existem mesas disponíveis.');
      selecionada = null;
      atualizarBotaoEntrar();
      return;
    }

    if (!mesas.some(mesa => mesa.id === selecionada)) selecionada = null;
    const idFocado = document.activeElement && document.activeElement.dataset
      ? document.activeElement.dataset.mesaId
      : null;
    lista.replaceChildren();
    mesas.forEach(mesa => {
      const item = document.createElement('li');
      item.className = 'mesa-item';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mesa-card';
      card.setAttribute('aria-pressed', String(mesa.id === selecionada));
      card.textContent = mesa.name;
      card.dataset.mesaId = mesa.id;
      if (mesa.last_request_status === 'rejected' && !mesa.is_member && !mesa.request_pending) {
        card.appendChild(criarTexto('small', 'seu último pedido foi rejeitado'));
      }
      card.addEventListener('click', () => {
        selecionada = mesa.id;
        renderizarMesas(mesasEncontradas);
      });
      item.appendChild(card);
      lista.appendChild(item);
    });
    if (idFocado) {
      const cartaoFocado = [...lista.querySelectorAll('.mesa-card')]
        .find(cartao => cartao.dataset.mesaId === idFocado);
      if (cartaoFocado) cartaoFocado.focus();
    }
    atualizarBotaoEntrar();
  }

  async function carregarMinhasMesas() {
    const { mesas } = await api('/api/minhas-mesas');
    renderizarMinhasMesas(mesas);
  }

  async function carregarSolicitacoes() {
    const { requests } = await api('/api/solicitacoes/recebidas');
    renderizarSolicitacoes(requests);
  }

  async function carregarBusca() {
    const numero = ++numeroBusca;
    try {
      const { mesas } = await api(`/api/mesas?search=${encodeURIComponent(busca.value.trim())}`);
      if (numero === numeroBusca) renderizarMesas(mesas);
    } catch (error) {
      if (numero === numeroBusca) mostrarAviso(error.message);
    }
  }

  async function carregarPainel() {
    await Promise.all([carregarMinhasMesas(), carregarSolicitacoes(), carregarBusca()]);
  }

  busca.addEventListener('input', () => {
    clearTimeout(debounceBusca);
    debounceBusca = setTimeout(carregarBusca, 180);
  });

  $('#novaMesa').addEventListener('click', () => {
    form.reset();
    dlg.showModal();
    campo.focus();
  });

  $('#cancelarMesa').addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = campo.value.trim();
    if (!name) return;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const { mesa } = await api('/api/mesas', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      dlg.close();
      busca.value = '';
      selecionada = null;
      mostrarAviso(`Mesa criada. ID para compartilhar: ${mesa.id}`);
      await carregarPainel();
    } catch (error) {
      mostrarAviso(error.message);
    } finally {
      submit.disabled = false;
    }
  });

  btnEntrar.addEventListener('click', async () => {
    const mesa = mesasEncontradas.find(resultado => resultado.id === selecionada);
    if (!mesa || mesa.is_member || mesa.request_pending) return;
    btnEntrar.disabled = true;
    try {
      await api(`/api/mesas/${encodeURIComponent(mesa.id)}/solicitacoes`, { method: 'POST' });
      mostrarAviso('Solicitação enviada ao dono da mesa.');
      await carregarBusca();
    } catch (error) {
      mostrarAviso(error.message);
      await carregarBusca();
    }
  });

  let atualizador;

  function iniciarAtualizacao() {
    clearInterval(atualizador);
    atualizador = setInterval(() => {
      if (document.hidden || dlg.open) return;
      carregarPainel().catch(() => {});
    }, 15000);
  }

  async function iniciar() {
    try {
      const { user } = await api('/api/me');
      if (!user) {
        mostrarAviso('Entre ou crie uma conta para ver e gerenciar mesas.');
        minhasMesas.replaceChildren();
        solicitacoes.replaceChildren();
        lista.replaceChildren();
        btnEntrar.disabled = true;
        $('#novaMesa').disabled = true;
        exibirVazio(lista, 'Entre ou crie uma conta pelo botão no topo para acessar as mesas.');
        return;
      }
      await carregarPainel();
      iniciarAtualizacao();
    } catch (error) {
      mostrarAviso(`Não foi possível conectar ao servidor: ${error.message}`);
      $('#novaMesa').disabled = true;
      btnEntrar.disabled = true;
    }
  }

  iniciar();
})();
