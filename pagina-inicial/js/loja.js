'use strict';

(() => {
  const categorias = document.querySelector('#categoriasLoja');
  const conteudo = document.querySelector('#conteudoLoja');

  if (!categorias || !conteudo) return;

  categorias.addEventListener('click', event => {
    const botao = event.target.closest('.loja-categoria');
    if (!botao || !categorias.contains(botao)) return;

    categorias.querySelectorAll('.loja-categoria').forEach(categoria => {
      categoria.setAttribute('aria-pressed', String(categoria === botao));
    });

    const mensagem = document.createElement('p');
    mensagem.textContent = `produtos de ${botao.textContent} aparecerão aqui`;
    conteudo.replaceChildren(mensagem);
  });
})();
