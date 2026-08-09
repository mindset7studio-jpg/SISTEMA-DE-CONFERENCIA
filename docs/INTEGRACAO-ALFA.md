# Integracao Alfa Entregas

Esta integracao elimina a importacao manual da planilha usando o portal de acompanhamento da Alfa como fonte operacional.

## Arquitetura inicial

```text
Portal Alfa aberto e autenticado
-> Tampermonkey coleta placas/motoristas
-> Tampermonkey busca as entregas de cada motorista
-> Tampermonkey grava snapshot no Firestore
-> Portal de Conferencia escuta o Firestore
-> Dashboard carrega automaticamente
```

## Origem dos dados

Tela inicial:

```text
/acompanhamento/placas-entregas/?data=AAAA-MM-DD&unidade=231&tipo=entregas
```

Tabela `#id_tabela`:

```text
Placa
Motorista
Qtd. CTE's
Qtd. Realizadas
Qtd. Auditada/Veiculo
Opcoes
```

Cada linha possui um link `Ver entregas`, por exemplo:

```text
/acompanhamento/entregas/?placa=ELQ-1349&entregador=BRUNO...&data=2026-08-07&unidade=231
```

Tela de detalhe:

```text
Auditada
CTe
Destinatario
Status
Data/Hora
Documento
Recebedor
ACR
BO
Caixa
Pago a Vista
Acessos
```

## Destino no Firestore

Colecao:

```text
alfaEntregas
```

Documento:

```text
AAAA-MM-DD_231
```

Exemplo:

```text
2026-08-07_231
```

## Instalacao do Tampermonkey

1. Abra `integrations/tampermonkey/alfa-entregas-sync.user.js`.
2. Copie o conteudo para um novo script no Tampermonkey.
3. Preencha o bloco `CONFIG.firebase` com os dados do Firebase Web.
4. Salve o script.
5. Abra a pagina `Placas de Entregas` da Alfa.
6. Use o botao `Sincronizar agora` ou aguarde a sincronizacao automatica.

## Comportamento

- Sincroniza automaticamente a cada 5 minutos.
- Tambem exibe um botao manual no canto inferior direito.
- Le apenas `tipo=entregas`.
- Usa unidade `231` por padrao.
- Altera a tabela para `Todos` quando a pagina disponibiliza essa opcao.
- Grava um snapshot unico por data/unidade.

## Cuidados

- Nao versionar cookies, tokens ou `csrfmiddlewaretoken`.
- Nao colar credenciais reais do Firebase no Git.
- Se a Alfa alterar o HTML, os seletores podem precisar de ajuste.
- Esta abordagem depende da sessao autenticada no navegador da empresa.
