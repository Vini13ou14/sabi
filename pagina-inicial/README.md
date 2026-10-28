# Página inicial

No Windows, clique duas vezes em `Iniciar Sabi.bat` na pasta principal do projeto. O iniciador abre o servidor e o navegador automaticamente. A janela do servidor deve permanecer aberta enquanto o aplicativo estiver em uso. Depois de atualizar os arquivos do projeto, feche a janela antiga do servidor e execute o iniciador novamente.

É necessário Node.js 22.13 ou superior, sem outras dependências. Para iniciar manualmente o servidor, abra um terminal nesta pasta e execute:

```powershell
npm start
```

Depois, acesse `http://localhost:3000`. As contas, fichas, mesas, membros e solicitações ficam no banco SQLite em `.local/mesas.sqlite` (na raiz do projeto).

```
pagina-inicial/
├── index.html
├── css/style.css   (mobile-first, temas claro/escuro)
├── js/script.js
├── pages/          (páginas internas, incluindo a loja)
└── img/            (coloque aqui o mapa: Capturar.PNG)
```

- Tema: segue o sistema do usuário; o interruptor do topo sobrescreve e salva a escolha.
- Menu lateral: abre pelo botão hambúrguer; fecha com X, clique fora ou Esc.
- Guia do sistema: a página “visualizar sistema” lista monstros, poderes, raças, itens, nascimento, classes e deuses. Clique no cartão para expandir e ler o texto; os exemplos editáveis ficam em `js/regras.js`.
- Fichas: cada conta vê e cria apenas as próprias fichas; elas ficam salvas no banco SQLite e continuam disponíveis após sair e entrar novamente na mesma conta. Para criar uma ficha, selecione ao menos uma mesa da qual participe; uma ficha pode ser vinculada a várias mesas.
- Rotas dos botões: objeto `rotas` em `js/script.js`; as páginas internas ficam em `pages/`.
- Contas: entre e crie sua conta pelo botão no topo, sem sair da página. Cadastre-se com nome, e-mail e senha de pelo menos 12 caracteres; senhas são armazenadas com scrypt e as sessões usam cookies HttpOnly.
- Mesas: cada conta pode criar mesas com ID compartilhável. A busca encontra o ID exato ou parte do nome. Em “suas mesas”, use “acessar mesa” para abrir a página da sala e ver criador, código/ID e todos os participantes; o criador pode remover participantes e excluir a mesa, e cada membro pode sair dela. Ao sair ou ser removido, as fichas do jogador são desvinculadas daquela mesa. Também pode aprovar/rejeitar pedidos; a API impede pedidos de quem já participa.
- Offline: o servidor, a base SQLite e a interface não dependem de serviços externos. Após iniciar o servidor e abrir o site uma vez, as páginas e recursos da interface ficam em cache para abrir offline. O service worker usa a rede primeiro e o cache só como reserva, então alterações nos arquivos aparecem sem precisar mudar a versão do cache. Para entrar, criar mesas ou enviar/analisar pedidos, o servidor local ainda precisa estar em execução no computador.
- Segurança: login e cadastro têm limite de tentativas (429 após muitas falhas) e o servidor só entrega as pastas `pages/`, `css/`, `js/`, `img/` e os arquivos `index.html`, `sw.js` e `manifest.webmanifest`.
- Comentários da página inicial ficam salvos só no navegador de quem os escreveu.
- A aplicação ouve apenas em `127.0.0.1` por padrão. Para uso por outros dispositivos, hospede-a atrás de HTTPS; não exponha o servidor local em uma rede não confiável.
