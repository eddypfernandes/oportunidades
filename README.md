# Oportunidades — GUIA COMERCIAL

Módulo experimental de oportunidades de emprego para o GUIA COMERCIAL.

## Protótipo navegável

- Página inicial com carrossel de cartões: `prototipo/index.html`
- Página de detalhes: `prototipo/oportunidade.html`
- Os cartões consultam `data/oportunidades.json` diretamente do repositório.
- Se o JSON estiver vazio ou indisponível, são exibidos exemplos genéricos claramente identificados como demonstração.
- Para oportunidades reais, a página de detalhes mostra o link para a publicação original quando o item contém uma URL HTTP/HTTPS válida.

## Automação de dados

- `config.json`: regiões, termos geográficos, quantidade máxima e fontes.
- `scripts/oportunidades.js`: coleta inicial e triagem.
- `data/oportunidades.json`: dados consumidos pelo protótipo.
- `.github/workflows/oportunidades.yml`: execução da coleta.
- `.github/workflows/pages.yml`: publicação do protótipo no GitHub Pages.

A estrutura geográfica segue a configuração usada pelo repositório [radar-ticker](https://github.com/eddypfernandes/radar-ticker). A lista `termos_ampliados` foi copiada para este repositório, portanto ainda não existe sincronização automática entre os dois arquivos de configuração.

## Estado experimental

As fontes de vagas permanecem desativadas até a configuração de páginas específicas e a validação da coleta. O JSON está vazio no momento; por isso, o protótipo apresenta exemplos genéricos, não vagas reais.

Antes de ativar a coleta, é necessário validar as páginas de origem e melhorar a extração para confirmar a localidade no conteúdo completo da vaga. Não publicar dados inventados, links de busca genéricos ou detalhes não confirmados.

## Publicação do protótipo

O workflow `.github/workflows/pages.yml` publica a pasta `prototipo` no GitHub Pages. Se necessário, em **Settings → Pages**, selecione **GitHub Actions** como fonte de publicação. Depois, execute o workflow em **Actions → Publicar protótipo no GitHub Pages → Run workflow**.
