# WhatsApp Operacional

O modulo WhatsApp gera mensagens prontas para motoristas, sem envio automatico por API.

## Cadastro de contatos

Use a aba `Motoristas` para cadastrar:

```text
Nome
CPF opcional
Placa
WhatsApp
```

O telefone pode ser digitado como `(21) 99999-9999`; o sistema normaliza para o formato do WhatsApp:

```text
5521999999999
```

## Regra de alerta das 18h

O sistema calcula:

```text
pendentes = CTEs - realizadas
```

Motoristas com mais de 5 pendencias entram na lista de alerta.

Mensagem gerada:

```text
Boa noite, {primeiro_nome}. Consta em nosso acompanhamento {pendentes} conhecimento(s) sem baixa. Preciso que a baixa dos conhecimentos seja realizada o quanto antes, desde ja agradeco.
```

## Uso

1. Carregue os dados do dia.
2. Abra a aba `Pendentes`.
3. Revise a area `Alertas WhatsApp - 18h`.
4. Clique em `Abrir WhatsApp`.
5. Confira a mensagem e envie manualmente.

Se o motorista nao tiver contato cadastrado, use o botao `Cadastrar contato`.
