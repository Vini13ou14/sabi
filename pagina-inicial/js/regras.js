'use strict';

(function () {
  const categorias = [
    { nome: 'Monstros', texto: 'As informações e regras sobre monstros serão adicionadas aqui.' },
    { nome: 'Poderes', texto: 'As informações e regras sobre poderes serão adicionadas aqui.' },
    { nome: 'Raças', texto: 'As informações e regras sobre raças serão adicionadas aqui.' },
    { nome: 'Itens', texto: 'As informações e regras sobre itens serão adicionadas aqui.' },
    { nome: 'Nascimento', texto: 'As informações e regras sobre nascimento serão adicionadas aqui.' },
    { nome: 'Classes', texto: 'As informações e regras sobre classes serão adicionadas aqui.' },
    { nome: 'Deuses', texto: 'As informações e regras sobre deuses serão adicionadas aqui.' }
  ];

  const lista = document.querySelector('#regrasLista');

  if (!lista) return;

  categorias.forEach(categoria => {
    const item = document.createElement('details');
    item.className = 'regra-item';

    const resumo = document.createElement('summary');
    resumo.textContent = categoria.nome;

    const conteudo = document.createElement('div');
    conteudo.className = 'regra-item-conteudo';

    const descricao = document.createElement('p');
    descricao.textContent = categoria.texto;

    conteudo.appendChild(descricao);
    item.append(resumo, conteudo);
    lista.appendChild(item);
  });
})();
