# Portal de Conferencia de Entregas

Sistema web/desktop para conferencia de entregas, acompanhamento operacional, ocorrencias, historico, relatorios e sincronizacao com Firebase.

## Tecnologias

- HTML, CSS e JavaScript vanilla
- Electron para app desktop
- Firebase Hosting, Authentication anonima e Firestore
- Gemini API para o assistente de IA
- Chart.js e SheetJS via CDN

## Requisitos

- Node.js 20 ou superior
- npm
- Projeto Firebase configurado
- Firebase CLI para deploy

## Instalacao

```bash
npm install
```

## Execucao local

```bash
npm start
```

O comando abre o app no Electron.

## Configuracao local

Arquivos reais de chave nao devem ir para o Git. Crie os arquivos locais a partir dos exemplos:

```text
public/js/firebase-keys.local.example.js -> public/js/firebase-keys.local.js
public/js/gemini-keys.local.example.js   -> public/js/gemini-keys.local.js
.firebaserc.example                      -> .firebaserc
```

Depois preencha:

- `firebase-keys.local.js` com as variaveis `window.__FB_*` do app Firebase Web.
- `firebase-keys.web.js` contem a configuracao publica usada pelo portal hospedado.
- `gemini-keys.local.js` com `window.__GEMINI_API_KEY__`.
- `.firebaserc` com o ID real do projeto Firebase.

Esses arquivos estao protegidos pelo `.gitignore`.

## Scripts

```bash
npm start
npm run build:dir
npm run build
npm run db:backup
npm run db:diagnose
npm run db:migrate:v2
npm run db:validate:v2
npm run firebase:deploy
npm run firebase:deploy:rules
```

Use `npm run build:dir` para validar o pacote Electron sem gerar instalador. Use `npm run build` para gerar o instalador Windows via NSIS.

## Integracao Alfa

A automacao inicial com o portal da Alfa fica em:

```text
integrations/tampermonkey/alfa-entregas-sync.user.js
docs/INTEGRACAO-ALFA.md
```

O script Tampermonkey coleta a tela de Placas de Entregas, le os links `Ver entregas`, grava um snapshot em `alfaEntregas/{AAAA-MM-DD_231}` no Firestore e o portal carrega esses dados automaticamente.

## WhatsApp Operacional

O modulo de WhatsApp gera mensagens prontas para motoristas com mais de 5 CTEs pendentes, sem envio automatico por API. A documentacao fica em:

```text
docs/WHATSAPP-OPERACIONAL.md
```

## Banco de dados

Ferramentas locais para backup, diagnostico e migracao segura do Firestore:

```bash
npm run db:backup
npm run db:diagnose
npm run db:migrate:v2
npm run db:validate:v2
```

O comando de migracao roda em modo simulacao por padrao. Para escrever a estrutura v2 no Firestore, use:

```bash
npm run db:migrate:v2 -- --write
```

Detalhes em `docs/MODELO-BANCO-V2.md`.

## Deploy Firebase

```bash
npm run firebase:deploy
```

Para publicar regras do Firestore:

```bash
npm run firebase:deploy:rules
```

Para publicar regras no projeto de dados usado pelo portal:

```bash
npm run firebase:deploy:rules:data
```

## Estrutura

```text
public/       Frontend do sistema
public/js/    Modulos JavaScript da aplicacao
public/css/   Estilos
electron/     Processo principal e preload do Electron
firebase/     Regras e indices do Firestore
docs/         Documentacao tecnica
```

## Seguranca

Antes de fazer commit, confirme que os arquivos abaixo nao aparecem no Git:

```text
.firebaserc
public/js/firebase-keys.local.js
public/js/gemini-keys.local.js
.env
```

Use `git status --ignored --short` para revisar arquivos ignorados.
