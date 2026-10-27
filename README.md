# Oportunidades — GUIA COMERCIAL

Módulo de coleta e publicação de vagas de emprego para o GUIA COMERCIAL, seguindo a arquitetura de automação do repositório [radar-ticker](https://github.com/eddypfernandes/radar-ticker).

## Objetivo

- Coletar oportunidades de fontes públicas configuradas.
- Publicar somente vagas cuja localidade corresponda a uma entrada de `localidades.txt`.
- Evitar duplicidades e preservar o link direto para a vaga original.
- Gerar um JSON para consumo pelo site.
- Permitir exibir chamadas resumidas na home e uma página com detalhes e link de candidatura externo.

## Arquivos

- `localidades.txt`: lista central de regiões permitidas, uma por linha.
- `config.json`: fontes e parâmetros da coleta.
- `scripts/oportunidades.js`: coleta, validação e geração do JSON.
- `data/oportunidades.json`: saída consumida pelo site.
- `.github/workflows/oportunidades.yml`: execução automática pelo GitHub Actions.

## Segredos

Configure `GEMINI_API_KEY` em **Settings → Secrets and variables → Actions** caso a curadoria com Gemini esteja habilitada.

## Critérios editoriais

A localidade do emprego deve ser confirmada no conteúdo da vaga; uma menção incidental a uma região não é suficiente. O link publicado deve apontar para a vaga ou candidatura original, nunca para uma página de busca genérica. A automação não deve inventar vagas, detalhes, datas ou URLs.

## Estado

Estrutura inicial do repositório. Antes de considerar a automação pronta para produção, validar fontes, formato de `localidades.txt`, campos de saída e execução completa do workflow.
