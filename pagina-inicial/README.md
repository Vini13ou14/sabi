# Página inicial

Abra `index.html` no navegador.

```
pagina-inicial/
├── index.html
├── css/style.css   (mobile-first, temas claro/escuro)
├── js/script.js
├── pages/          (páginas internas)
└── img/            (coloque aqui o mapa: Capturar.PNG)
```

- Tema: segue o sistema do usuário; o interruptor do topo sobrescreve e salva a escolha.
- Menu lateral: abre pelo botão hambúrguer; fecha com X, clique fora ou Esc.
- Rotas dos botões: objeto `rotas` em `js/script.js`; as páginas internas ficam em `pages/`.
- Login Google: simulado, falta integrar o Google Identity Services.
