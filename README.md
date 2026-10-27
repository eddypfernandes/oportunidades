# Oportunidades — GUIA COMERCIAL

Módulo experimental de oportunidades de emprego para o GUIA COMERCIAL.

## Protótipo navegável

- Página inicial com carrossel de cartões: `prototipo/index.html`
- Página de detalhes: `prototipo/oportunidade.html`
- Os cartões consultam `data/oportunidades.json` diretamente do repositório.
- Se o JSON estiver vazio ou indisponível, são exibidos exemplos genéricos claramente identificados como demonstração.
- Para oportunidades reais, a página de detalhes mostra o link para a publicação original quando o item contém uma URL HTTP/HTTPS válida.

## Automação de dados

- `config.json`: localidades, quantidade máxima e catálogo de fontes oficiais.
- `scripts/oportunidades.js`: coleta páginas de origem, verifica título/conteúdo e exige correspondência com as localidades configuradas.
- `data/oportunidades.json`: dados consumidos pelo protótipo.
- `.github/workflows/oportunidades.yml`: execução agendada e manual da coleta.

### Fontes configuradas

- Agência Brasília — notícias sobre as Agências do Trabalhador.
- IEL Distrito Federal — estágios e aprendizagem.
- CIEE — estágios, aprendizagem, PCD e processos públicos.
- Secretaria de Economia do DF — concursos distritais.
- Portal do Servidor Federal — concursos e provimento.
- Emprega Brasil — link de consulta manual; não participa da raspagem automática porque o acesso depende de serviços/perfil do trabalhador.

A coleta automática depende do HTML que cada portal disponibiliza e pode precisar de ajustes específicos se um site mudar a estrutura, exigir JavaScript ou bloquear requisições. A presença de uma fonte na configuração não significa que todas as vagas desse portal foram capturadas. O coletor deve manter somente páginas com evidência de oportunidade e localidade encontrada no conteúdo.

## Publicação do protótipo

O workflow `.github/workflows/pages.yml` publica a pasta `prototipo` no GitHub Pages. Se necessário, em **Settings → Pages**, selecione **GitHub Actions** como fonte de publicação. Depois, execute o workflow em **Actions → Publicar protótipo no GitHub Pages → Run workflow**.
