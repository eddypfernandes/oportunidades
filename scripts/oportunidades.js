const fs = require("fs");
const https = require("https");

const CONFIG_PATH = "config.json";
const OUTPUT_PATH = "data/oportunidades.json";
const MAX_ARTIGOS_POR_FONTE = 80;

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escaparRegex(texto) {
  return normalizar(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function carregarLocalidades(config) {
  const termos = Array.isArray(config.termos_ampliados) ? config.termos_ampliados : [];
  if (!termos.length) throw new Error("A lista termos_ampliados não foi encontrada em config.json.");
  return termos;
}

function baixar(url) {
  return new Promise((resolve, reject) => {
    const requisicao = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GuiaComercialOportunidades/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      }
    }, resposta => {
      if (resposta.statusCode >= 300 && resposta.statusCode < 400 && resposta.headers.location) {
        resposta.resume();
        const redirecionada = new URL(resposta.headers.location, url).href;
        baixar(redirecionada).then(resolve, reject);
        return;
      }
      let corpo = "";
      if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
        resposta.resume();
        reject(new Error(`HTTP ${resposta.statusCode} em ${url}`));
        return;
      }
      resposta.setEncoding("utf8");
      resposta.on("data", parte => corpo += parte);
      resposta.on("end", () => resolve(corpo));
    });
    requisicao.setTimeout(25000, () => requisicao.destroy(new Error("Tempo limite excedido")));
    requisicao.on("error", reject);
  });
}

function decodificarEntidades(texto) {
  return String(texto || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&rsquo;/gi, "’")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function textoLimpo(html) {
  return decodificarEntidades(String(html || "")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(script|style|svg|noscript|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extrairConteudoPrincipal(html) {
  const secoes = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<div\b[^>]*(?:id|class)=["'][^"']*(?:content|conteudo|article|materia|texto-noticia|view-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  ];

  for (const regex of secoes) {
    const match = html.match(regex);
    if (match && textoLimpo(match[1]).length >= 180) return match[1];
  }
  return html;
}

function extrairParagrafos(html) {
  const limpos = [];
  const regex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  for (const match of String(html || "").matchAll(regex)) {
    const paragrafo = textoLimpo(match[1]);
    if (paragrafo.length < 45) continue;
    if (/ir para o conteudo|abrir menu|termos mais buscados|compartilhe nas redes sociais|voltar ao site|faça login|faca login/i.test(paragrafo)) continue;
    if (!limpos.includes(paragrafo)) limpos.push(paragrafo);
  }
  return limpos;
}

function limitarSemCortarPalavra(texto, limite) {
  const limpo = String(texto || "").replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  const trecho = limpo.slice(0, limite + 1);
  const corte = trecho.lastIndexOf(" ");
  return (trecho.slice(0, corte > 0 ? corte : limite).replace(/[.,;:!?-]+$/, "") + "…").trim();
}

function construirDescricao(html, titulo, textoFallback) {
  let paragrafos = extrairParagrafos(html).filter(p => normalizar(p) !== normalizar(titulo));
  if (!paragrafos.length) {
    const texto = String(textoFallback || "").replace(titulo, "").trim();
    paragrafos = texto.split(/(?<=[.!?])\s+/).filter(p => p.length >= 45);
  }

  const resumo = limitarSemCortarPalavra(paragrafos[0] || "", 240);
  const descricao = paragrafos.slice(0, 8);
  return {
    resumo,
    descricao: descricao.length ? descricao : (resumo ? [resumo] : [])
  };
}

function tituloGenerico(titulo, url) {
  const t = normalizar(titulo);
  const caminho = normalizar(url);
  const titulosBloqueados = [
    "ultimas noticias", "destaques", "noticias", "noticias recentes",
    "arquivo de quero uma vaga", "por que estagiar", "contrate com o ciee",
    "concursos publicos e provimento de pessoal", "portal do servidor",
    "servicos e informacoes do brasil", "pagina inicial", "home"
  ];

  if (titulosBloqueados.some(item => t === normalizar(item))) return true;
  if (/\/(categoria|categorias|tag|topicos|assuntos|busca|buscar|pagina|page)\//i.test(caminho)) return true;
  if (/\/noticias\/(educacao-e-pesquisa|saude|trabalho)\/?$/i.test(caminho)) return true;
  return false;
}

function tituloIndicaOportunidade(titulo, fonte, url) {
  const t = normalizar(titulo);
  const caminho = normalizar(url);
  if (tituloGenerico(titulo, url)) return false;

  const termos = /\b(vaga|vagas|emprego|empregos|oportunidade|oportunidades|estagio|aprendiz|aprendizagem|processo seletivo|concurso|concursos|edital|selecao publica|cadastro reserva|agencias do trabalhador|trabalhador|contratacao|bolsista|trainee|convocacao de aprovados)\b/;
  const tipo = normalizar(fonte.tipo || "");

  if (termos.test(t)) return true;
  if (tipo === "vagas" && /\/vaga\//i.test(caminho) && t.length > 12) return true;
  return false;
}

function tituloPagina(html) {
  const metas = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
    /<title\b[^>]*>([\s\S]*?)<\/title>/i
  ];
  for (const regex of metas) {
    const match = html.match(regex);
    if (match && textoLimpo(match[1])) return textoLimpo(match[1]);
  }
  return "";
}

function dataPublicacao(html, textoPrincipal, url = "") {
  const meta = html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|date)["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|datePublished|date)["']/i)
    || html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if (meta) {
    const dataMeta = meta[1].match(/^(\d{4}-\d{2}-\d{2})/);
    if (dataMeta) return dataMeta[1];
  }

  const dataIso = String(textoPrincipal || "").match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (dataIso) return dataIso[0];

  // Só considera datas no início do conteúdo principal, onde portais costumam exibir a publicação.
  const trechoInicial = String(textoPrincipal || "").slice(0, 500);
  const dataVisivel = trechoInicial.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!dataVisivel) return "";
  const dia = dataVisivel[1].padStart(2, "0");
  const mes = dataVisivel[2].padStart(2, "0");
  return `${dataVisivel[3]}-${mes}-${dia}`;
}

function urlAbsoluta(url, origem) {
  try { return new URL(url, origem).href; } catch { return ""; }
}

function pareceConteudoDeVaga(texto) {
  return /\b(vagas?(?: de emprego| abertas)?|oportunidades?(?: de emprego| profissionais)?|processo seletivo|est[aá]gio|aprendiz(?:agem)?|concursos? p[uú]blicos?|edital|ag[eê]ncias? do trabalhador|mercado de trabalho|contrata[cç][aã]o)\b/i.test(texto);
}

function localizarRegioes(texto, localidades) {
  const conteudo = normalizar(texto);
  return localidades
    .filter(local => {
      const termo = escaparRegex(local);
      return new RegExp(`(^|[^a-z0-9])${termo}([^a-z0-9]|$)`).test(conteudo);
    })
    .sort((a, b) => b.length - a.length);
}

function extrairLinks(html, fonte) {
  const encontrados = new Map();
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const hostFonte = new URL(fonte.url).hostname;
  const caminhosRelevantes = /vaga|oportun|estag|aprendiz|concurs|processo|trabalhador|emprego|noticia|notícia|\/w\//i;

  for (const link of html.matchAll(regex)) {
    const titulo = textoLimpo(link[2]);
    const url = urlAbsoluta(link[1], fonte.url);
    if (!titulo || titulo.length < 12 || !/^https?:\/\//i.test(url)) continue;

    let endereco;
    try { endereco = new URL(url); } catch { continue; }
    if (endereco.hostname !== hostFonte) continue;
    if (/\/topicos|\/busca|\/buscar|\/tag\/|\/categoria\//i.test(endereco.pathname)) continue;
    if (endereco.pathname === "/" || endereco.pathname === "/DF" || endereco.pathname === "/DF/") continue;

    const linkRelevante = caminhosRelevantes.test(endereco.pathname) || pareceConteudoDeVaga(titulo);
    if (!linkRelevante) continue;
    if (!encontrados.has(endereco.href)) encontrados.set(endereco.href, { titulo, url: endereco.href, fonte: fonte.nome });
  }

  return [...encontrados.values()].slice(0, MAX_ARTIGOS_POR_FONTE);
}

function resumir(texto, titulo) {
  const limpo = texto
    .replace(titulo, " ")
    .replace(/\b(ir para o conteudo|abrir menu principal de navegacao|menu principal|termos mais buscados|servicos e informacoes do brasil|buscar servicos por categorias)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const termos = /\b(vagas?|sal[aá]rio|remunera[cç][aã]o|oportunidades?|curr[ií]culo|experi[eê]ncia|trabalhador|est[aá]gio|aprendiz|edital|inscri[cç][aã]o|concurso|processo seletivo|requisitos?|bolsa)\b/i;
  const frases = limpo.split(/(?<=[.!?])\s+/).filter(frase =>
    frase.length > 45 &&
    termos.test(frase) &&
    !/termos mais buscados|abrir menu|fechar solucoes|nome do site|servicos e informacoes/i.test(frase)
  );

  const resumo = frases.slice(0, 3).join(" ").slice(0, 420).trim();
  if (resumo.length >= 60) return resumo;
  return limpo.length >= 60 ? limpo.slice(0, 260).trim() : "";
}

async function executar() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const localidades = carregarLocalidades(config);
  const fontes = (config.fontes || []).filter(fonte => fonte.ativo === true);
  const candidatos = new Map();

  console.log(`Localidades configuradas: ${localidades.length}`);
  console.log(`Fontes ativas: ${fontes.length}`);

  for (const fonte of fontes) {
    try {
      console.log(`\nConsultando índice: ${fonte.nome}`);
      const html = await baixar(fonte.url);
      const links = extrairLinks(html, fonte);
      console.log(`Links de notícias potencialmente relevantes: ${links.length}`);

      for (const link of links) {
        try {
          const artigo = await baixar(link.url);
          const titulo = tituloPagina(artigo) || link.titulo;
          if (!tituloIndicaOportunidade(titulo, fonte, link.url)) {
            console.log(`REJEITADO (título genérico ou sem sinal de oportunidade): ${titulo}`);
            continue;
          }

          const htmlPrincipal = extrairConteudoPrincipal(artigo);
          const texto = textoLimpo(htmlPrincipal);
          if (!pareceConteudoDeVaga(titulo + " " + texto)) continue;

          const regioes = localizarRegioes(titulo + " " + texto, localidades);
          if (!regioes.length) continue;

          const chave = link.url.replace(/\/$/, "");
          if (candidatos.has(chave)) continue;

          const descricao = construirDescricao(htmlPrincipal, titulo, texto);
          candidatos.set(chave, {
            titulo,
            empresa: fonte.nome,
            localidade: regioes.join(", "),
            resumo: descricao.resumo || resumir(texto, titulo),
            descricao: descricao.descricao,
            publicado_em: dataPublicacao(artigo, texto, link.url),
            url: link.url,
            fonte: fonte.nome
          });
          console.log(`ACEITO: ${titulo} [${regioes.join(", ")}]`);
        } catch (erro) {
          console.error(`Falha ao ler artigo ${link.url}: ${erro.message}`);
        }
      }
    } catch (erro) {
      console.error(`Falha na fonte ${fonte.nome}: ${erro.message}`);
    }
  }

  const items = [...candidatos.values()]
    .sort((a, b) => (b.publicado_em || "").localeCompare(a.publicado_em || ""))
    .slice(0, Number(config.quantidade) || 20);

  const resultado = { atualizado_em: new Date().toISOString(), items };
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(resultado, null, 2) + "\n", "utf8");
  console.log(`\nArtigos relevantes confirmados: ${items.length}`);
  console.log(`Arquivo gerado: ${OUTPUT_PATH}`);
}

executar().catch(erro => {
  console.error(erro.stack || erro.message);
  process.exit(1);
});
