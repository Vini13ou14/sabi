'use strict';

(function () {
  const $ = selector => document.querySelector(selector);
  const lista = $('#listaParticipantes');
  const aviso = $('#salaAviso');
  const mesaId = new URLSearchParams(location.search).get('id');
  let avisoTimer;

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

  function mostrarAviso(message) {
    aviso.textContent = message;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { aviso.textContent = ''; }, 4500);
  }

  function renderizarParticipantes(mesa) {
    lista.replaceChildren();
    mesa.members.forEach(participante => {
      const item = document.createElement('li');
      item.className = 'sala-participante';
      const info = document.createElement('div');
      info.className = 'sala-participante-info';
      const nome = document.createElement('strong');
      nome.textContent = participante.name;
      const papel = document.createElement('small');
      papel.textContent = participante.role === 'dono' ? 'criador' : 'membro';
      info.append(nome, papel);
      item.appendChild(info);

      if (mesa.role === 'dono' && participante.role === 'membro') {
        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'mesa-acao-secundaria';
        remover.textContent = 'remover';
        remover.setAttribute('aria-label', `Remover ${participante.name} da mesa`);
        remover.addEventListener('click', async () => {
          if (!confirm(`Remover ${participante.name} desta mesa?`)) return;
          remover.disabled = true;
          try {
            await api(`/api/mesas/${encodeURIComponent(mesa.id)}/membros/${encodeURIComponent(participante.id)}`, {
              method: 'DELETE'
            });
            mostrarAviso(`${participante.name} foi removido da mesa.`);
            await carregarMesa();
          } catch (error) {
            mostrarAviso(error.message);
            remover.disabled = false;
          }
        });
        item.appendChild(remover);
      }
      lista.appendChild(item);
    });
  }

  async function carregarMesa() {
    const { mesa } = await api(`/api/mesas/${encodeURIComponent(mesaId)}`);
    $('#salaNome').textContent = mesa.name;
    $('#salaCriador').textContent = mesa.creator.name;
    $('#salaQuantidade').textContent = String(mesa.members_count);
    $('#salaId').textContent = mesa.id;
    document.title = `${mesa.name} · Sabi`;
    $('#sairMesa').hidden = mesa.role === 'dono';
    $('#excluirMesa').hidden = mesa.role !== 'dono';
    renderizarParticipantes(mesa);
  }

  $('#copiarId').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#salaId').textContent);
      mostrarAviso('ID da mesa copiado.');
    } catch (error) {
      console.error('Não foi possível copiar o ID da mesa.', error);
      mostrarAviso('Não foi possível copiar automaticamente. Selecione o ID para copiá-lo.');
    }
  });

  $('#sairMesa').addEventListener('click', async () => {
    if (!confirm('Sair desta mesa? Suas fichas serão desvinculadas dela.')) return;
    const botaoSair = $('#sairMesa');
    botaoSair.disabled = true;
    try {
      const { user } = await api('/api/me');
      await api(`/api/mesas/${encodeURIComponent(mesaId)}/membros/${encodeURIComponent(user.id)}`, {
        method: 'DELETE'
      });
      location.href = 'mesa.html';
    } catch (error) {
      mostrarAviso(error.message);
      botaoSair.disabled = false;
    }
  });

  $('#excluirMesa').addEventListener('click', async () => {
    if (!confirm('Excluir esta mesa para todos? Participantes, pedidos e vínculos das fichas serão removidos. Esta ação não pode ser desfeita.')) return;
    const botaoExcluir = $('#excluirMesa');
    botaoExcluir.disabled = true;
    try {
      await api(`/api/mesas/${encodeURIComponent(mesaId)}`, { method: 'DELETE' });
      location.href = 'mesa.html';
    } catch (error) {
      mostrarAviso(error.message);
      botaoExcluir.disabled = false;
    }
  });

  if (!mesaId) {
    $('#salaNome').textContent = 'mesa não informada';
    mostrarAviso('Volte para suas mesas e escolha uma mesa para acessar.');
    return;
  }

  carregarMesa().catch(error => {
    $('#salaNome').textContent = 'não foi possível acessar a mesa';
    lista.replaceChildren();
    mostrarAviso(error.message);
  });
})();
