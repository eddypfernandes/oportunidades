const fs = require("fs");
const https = require("https");

const CONFIG_PATH = "config.json";
const OUTPUT_PATH = "data/oportunidades.json";
const MAX_ARTIGOS_POR_FONTE = 30;

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
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
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

function dataPublicacao(html, texto) {
  const meta = html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|date|datePublished)["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if (meta) return meta[1].slice(0, 10);
  const data = texto.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (data) return `${data[3]}-${data[2].padStart(2,"0")}-${data[1].padStart(2,"0")}`;
  return "";
}

function urlAbsoluta(url, origem) {
  try { return new URL(url, origem).href; } catch { return ""; }
}

function pareceConteudoDeVaga(texto) {
  return /\b(vagas? de emprego|oportunidades? de emprego|vagas? abertas|processo seletivo|oportunidades? profissionais|ag[eê]ncias? do trabalhador|mercado de trabalho|contrata[cç][aã]o)\b/i.test(texto);
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
  for (const link of html.matchAll(regex)) {
    const titulo = textoLimpo(link[2]);
    const url = urlAbsoluta(link[1], fonte.url);
    if (!titulo || titulo.length < 15 || !/^https?:\/\//i.test(url)) continue;
    if (!pareceConteudoDeVaga(titulo)) continue;
    if (new URL(url).hostname !== new URL(fonte.url).hostname) continue;
    if (/\/topicos|\/busca|\/buscar|\/tag\/|\/categoria\//i.test(new URL(url).pathname)) continue;
    if (!encontrados.has(url)) encontrados.set(url, { titulo, url, fonte: fonte.nome });
  }
  return [...encontrados.values()].slice(0, MAX_ARTIGOS_POR_FONTE);
}

function resumir(texto, titulo) {
  const limpo = texto.replace(titulo, " ").replace(/\s+/g, " ").trim();
  const termos = /\b(vagas?|sal[aá]rio|remunera[cç][aã]o|oportunidades?|curr[ií]culo|experi[eê]ncia|trabalhador)\b/i;
  const frases = limpo.split(/(?<=[.!?])\s+/).filter(frase => frase.length > 35 && termos.test(frase));
  return (frases.slice(0, 3).join(" ").slice(0, 420) || limpo.slice(0, 320)).trim();
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
          const texto = textoLimpo(artigo);
          if (!pareceConteudoDeVaga(titulo + " " + texto)) continue;

          const regioes = localizarRegioes(texto, localidades);
          if (!regioes.length) continue;

          const chave = link.url.replace(/\/$/, "");
          if (candidatos.has(chave)) continue;

          candidatos.set(chave, {
            titulo,
            empresa: "Agência Brasília / Agências do Trabalhador",
            localidade: regioes.join(", "),
            resumo: resumir(texto, titulo),
            publicado_em: dataPublicacao(artigo, texto),
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
