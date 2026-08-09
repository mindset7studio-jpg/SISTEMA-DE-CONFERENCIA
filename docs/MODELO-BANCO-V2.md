# Modelo de Banco v2

Este modelo organiza o Firestore por entidades operacionais, evitando documentos com arrays grandes de linhas.

## Colecoes propostas

```text
operacaoDias/{data_unidade}
operacaoDias/{data_unidade}/motoristas/{motorista_id}
operacaoDias/{data_unidade}/ctes/{cte_id}
motoristas/{motorista_id}
retidos/{cte_id}
integracoes/alfa/dias/{data_unidade}
config/{docId}
```

## Comandos

Criar backup local:

```bash
npm run db:backup
```

Diagnosticar o banco atual:

```bash
npm run db:diagnose
```

Simular a migracao:

```bash
npm run db:migrate:v2
```

Executar a migracao:

```bash
npm run db:migrate:v2 -- --write
```

Validar a estrutura gravada:

```bash
npm run db:validate:v2
```

Tambem e possivel diagnosticar ou migrar a partir de um backup:

```bash
npm run db:diagnose -- --from backups/firestore-backup.json
npm run db:migrate:v2 -- --from backups/firestore-backup.json
```

## Estrategia segura

1. Gerar backup.
2. Rodar diagnostico.
3. Rodar migracao em modo simulacao.
4. Conferir contagens.
5. Rodar migracao com `--write`.
6. Validar com `npm run db:validate:v2`.
7. Ajustar o portal para ler o modelo v2.
8. Arquivar o modelo antigo apenas depois da validacao operacional.
