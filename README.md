# Sabi

Aplicação de mesas compartilhadas com contas, solicitações de entrada e temas claro/escuro.

## Iniciar localmente

No Windows, clique duas vezes em [`Iniciar Sabi.bat`](./Iniciar%20Sabi.bat). Ele inicia o servidor local e abre o navegador. A janela "Sabi - servidor local" precisa continuar aberta enquanto usar o sistema.

Requer Node.js 22.13 ou superior. Alternativamente, no terminal, execute:

```powershell
cd pagina-inicial
npm start
```

O iniciador abre `http://127.0.0.1:3000`. Os dados SQLite são armazenados em `.local/mesas.sqlite`.
Para instruções e detalhes do fluxo, consulte [pagina-inicial/README.md](./pagina-inicial/README.md).

Depois de abrir o site uma vez, a interface é armazenada em cache para abrir sem internet. O servidor local ainda precisa estar rodando para fazer login ou alterar mesas.
Login e criação de conta aparecem em um pop-up, sem navegar para outra página.