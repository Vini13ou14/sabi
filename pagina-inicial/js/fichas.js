'use strict';

(() => {
  const lista = document.querySelector('#listaFichas');
  const aviso = document.querySelector('#avisoFichas');
  const botaoCriar = document.querySelector('#abrirCriacaoFicha');
  const dialogo = document.querySelector('#dialogoFicha');
  const formulario = document.querySelector('#formFicha');
  const botaoCancelar = document.querySelector('#cancelarFicha');
  const opcoesMesas = document.querySelector('#opcoesMesasFicha');
  const avisoFormulario = document.querySelector('#avisoFormularioFicha');
  const linkMesas = document.querySelector('#linkMesasFicha');

  async function chamarApi(url, options = {}) {
    try {
      return await fetch(url, { credentials: 'same-origin', ...options });
    } catch {
      throw new Error('Não foi possível conectar ao servidor. Verifique se o Sabi está em execução.');
    }
  }

  async function lerRespostaApi(response) {
    const resultado = await response.json().catch(() => ({}));
    if (response.status === 404 && resultado.error === 'Recurso da API não encontrado.') {
      throw new Error('A API de fichas não está disponível nesta versão do servidor. Feche a janela antiga do Sabi e execute “Iniciar Sabi.bat” novamente.');
    }
    if (!response.ok) throw new Error(resultado.error || 'Não foi possível concluir a operação.');
    return resultado;
  }

  function criarLinha(rotulo, valor) {
    const linha = document.createElement('div');
    linha.className = 'ficha-card-linha';
    const titulo = document.createElement('span');
    titulo.textContent = rotulo;
    linha.appendChild(titulo);
    const texto = document.createElement('span');
    texto.textContent = valor || '—';
    linha.appendChild(texto);
    return linha;
  }

  function renderizarFicha(ficha) {
    const card = document.createElement('li');
    card.className = 'ficha-card';
    card.append(
      criarLinha('nome da ficha', ficha.name),
      criarLinha('rpg', ficha.rpg),
      criarLinha('mesa', ficha.mesa_names),
      criarLinha('raça', ficha.race),
      criarLinha('classe', ficha.character_class)
    );
    return card;
  }

  async function carregarMesasDisponiveis() {
    const response = await chamarApi('/api/minhas-mesas');
    const resultado = await lerRespostaApi(response);
    opcoesMesas.replaceChildren();

    resultado.mesas.forEach(mesa => {
      const label = document.createElement('label');
      label.className = 'ficha-mesa-opcao';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'mesaIds';
      checkbox.value = mesa.id;
      checkbox.addEventListener('change', () => {
        avisoFormulario.textContent = '';
      });
      const nome = document.createElement('span');
      nome.textContent = mesa.name;
      label.append(checkbox, nome);
      opcoesMesas.appendChild(label);
    });

    return resultado.mesas;
  }

  async function carregarFichas() {
    try {
      const response = await chamarApi('/api/fichas');
      if (response.status === 401) {
        botaoCriar.disabled = true;
        aviso.textContent = 'Entre na sua conta para ver ou criar suas fichas.';
        return;
      }
      const resultado = await lerRespostaApi(response);

      lista.replaceChildren(...resultado.fichas.map(renderizarFicha));
      const mesas = await carregarMesasDisponiveis();
      botaoCriar.disabled = mesas.length === 0;
      linkMesas.hidden = mesas.length !== 0;
      aviso.textContent = mesas.length === 0
        ? 'Participe de pelo menos uma mesa para criar fichas:'
        : resultado.fichas.length
          ? ''
          : 'Você ainda não tem fichas nesta conta.';
    } catch (error) {
      console.error('Não foi possível carregar as fichas.', error);
      aviso.textContent = error.message || 'Não foi possível carregar suas fichas.';
    }
  }

  botaoCriar.addEventListener('click', () => {
    formulario.reset();
    avisoFormulario.textContent = '';
    dialogo.showModal();
    document.querySelector('#nomeFicha').focus();
  });

  botaoCancelar.addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', event => {
    if (event.target === dialogo) dialogo.close();
  });

  formulario.addEventListener('submit', async event => {
    event.preventDefault();
    const enviar = formulario.querySelector('[type="submit"]');
    const dados = new FormData(formulario);
    const mesaIds = dados.getAll('mesaIds');
    if (mesaIds.length === 0) {
      avisoFormulario.textContent = 'Escolha pelo menos uma mesa para criar esta ficha.';
      opcoesMesas.querySelector('input')?.focus();
      return;
    }

    enviar.disabled = true;
    try {
      const response = await chamarApi('/api/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dados.get('nome').trim(),
          rpg: (dados.get('rpg') || '').trim(),
          race: dados.get('raca').trim(),
          characterClass: dados.get('classe').trim(),
          mesaIds
        })
      });
      const resultado = await lerRespostaApi(response);
      lista.prepend(renderizarFicha(resultado.ficha));
      aviso.textContent = '';
      formulario.reset();
      dialogo.close();
    } catch (error) {
      avisoFormulario.textContent = error.message || 'Não foi possível salvar a ficha.';
    } finally {
      enviar.disabled = false;
    }
  });

  carregarFichas();
})();
