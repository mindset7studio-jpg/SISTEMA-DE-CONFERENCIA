# Portal de Conferência Oficial

Portal web/desktop para conferência de entregas, com painel de operação, sincronização com Firebase e relatórios de execução.

## Tecnologias

- HTML, CSS e JavaScript vanilla
- Firebase Hosting / Firestore
- Electron para desktop
- Firebase admin/client SDK

## Execução local

```bash
npm install
npm start
```

## Deploy Firebase

```bash
npm run firebase:deploy
```

## Observações

Os arquivos com chaves locais e configurações sensíveis devem ficar fora do Git. Os arquivos de exemplo e as variáveis compatíveis com `window.__FB_*` estão nos scripts públicos.
