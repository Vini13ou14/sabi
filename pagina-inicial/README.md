# Página inicial

No Windows, clique duas vezes em `Iniciar Sabi.bat` na pasta principal do projeto. O iniciador abre o servidor e o navegador automaticamente. A janela do servidor deve permanecer aberta enquanto o aplicativo estiver em uso.

É necessário Node.js 22.13 ou superior, sem outras dependências. Para iniciar manualmente o servidor, abra um terminal nesta pasta e execute:

```powershell
npm start
```

Depois, acesse `http://localhost:3000`. As contas, mesas, membros e solicitações ficam no banco SQLite em `.local/mesas.sqlite` (na raiz do projeto).

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
- Guia do sistema: a página “visualizar sistema” lista monstros, poderes, raças, itens, nascimento, classes e deuses. Clique no cartão para expandir e ler o texto; os exemplos editáveis ficam em `js/regras.js`.
- Rotas dos botões: objeto `rotas` em `js/script.js`; as páginas internas ficam em `pages/`.
- Contas: entre e crie sua conta pelo pop-up do botão no topo, sem sair da página. Cadastre-se com nome, e-mail e senha de pelo menos 12 caracteres; senhas são armazenadas com scrypt e as sessões usam cookies HttpOnly.
- Mesas: cada conta pode criar mesas com ID compartilhável. A busca encontra o ID exato ou parte do nome. Em “suas mesas”, use “acessar mesa” para abrir a página da sala e ver criador, código/ID e todos os participantes; o criador pode remover participantes. Também pode aprovar/rejeitar pedidos; a API impede pedidos de quem já participa.
- Offline: o servidor, a base SQLite e a interface não dependem de serviços externos. Após iniciar o servidor e abrir o site uma vez, as páginas e recursos da interface ficam em cache para abrir offline. Para entrar, criar mesas ou enviar/analisar pedidos, o servidor local ainda precisa estar em execução no computador.
- A aplicação ouve apenas em `127.0.0.1` por padrão. Para uso por outros dispositivos, hospede-a atrás de HTTPS; não exponha o servidor local em uma rede não confiável.
