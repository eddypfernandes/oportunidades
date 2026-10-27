const fs = require("fs");
const https = require("https");

const CONFIG_PATH = "config.json";
const LOCALIDADES_PATH = "localidades.txt";
const OUTPUT_PATH = "data/oportunidades.json";

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function carregarLocalidades() {
  if (!fs.existsSync(LOCALIDADES_PATH)) {
    throw new Error("Arquivo localidades.txt não encontrado.");
  }

  return fs.readFileSync(LOCALIDADES_PATH, "utf8")
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function baixar(url) {
  return new Promise((resolve, reject) => {
    const requisicao = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 GUIA-COMERCIAL-Oportunidades/1.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    }, resposta => {
      let corpo = "";

      if (resposta.statusCode < 200 || resposta.statusCode >= 400) {
        resposta.resume();
        reject(new Error(`HTTP ${resposta.statusCode} em ${url}`));
        return;
      }

      resposta.setEncoding("utf8");
      resposta.on("data", parte => corpo += parte);
      resposta.on("end", () => resolve(corpo));
    });

    requisicao.setTimeout(20000, () => {
      requisicao.destroy(new Error("Tempo limite excedido"));
    });

    requisicao.on("error", reject);
  });
}

function limparTexto(texto) {
  return String(texto || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function urlAbsoluta(url, origem) {
  try {
    return new URL(url, origem).href;
  } catch {
    return "";
  }
}

function extrairLinks(html, fonte) {
  const encontrados = [];
  const links = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);

  for (const link of links) {
    const titulo = limparTexto(link[2]);
    const url = urlAbsoluta(link[1], fonte.url);

    if (!titulo || titulo.length < 8 || !/^https?:\/\//i.test(url)) continue;

    const ignorados = [
      "javascript:", "/login", "/entrar", "/busca", "/buscar",
      "/categoria/", "/tag/", "facebook.com", "instagram.com"
    ];

    if (ignorados.some(item => url.toLowerCase().includes(item))) continue;

    encontrados.push({
      titulo,
      url,
      fonte: fonte.nome
    });
  }

  return encontrados;
}

function mencionaLocalidade(texto, localidades) {
  const conteudo = normalizar(texto);
  return localidades.some(localidade => {
    const termo = normalizar(localidade);
    const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(conteudo);
  });
}

function pareceVaga(item) {
  const texto = normalizar(item.titulo + " " + item.url);
  const termos = [
    "vaga", "vagas", "emprego", "empregos", "contrata",
    "contratacao", "processo seletivo", "oportunidade de trabalho",
    "trabalhador", "trabalhadores", "curriculo", "candidato"
  ];
  return termos.some(termo => texto.includes(termo));
}

async function executar() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const localidades = carregarLocalidades();
  const fontes = (config.fontes || []).filter(fonte => fonte.ativo === true);
  const candidatos = [];

  console.log(`Localidades permitidas: ${localidades.length}`);
  console.log(`Fontes ativas: ${fontes.length}`);

  for (const fonte of fontes) {
    try {
      console.log(`Coletando: ${fonte.nome}`);
      const html = await baixar(fonte.url);
      candidatos.push(...extrairLinks(html, fonte));
    } catch (erro) {
      console.error(`Falha na fonte ${fonte.nome}: ${erro.message}`);
    }
  }

  const unicos = new Map();
  for (const item of candidatos) {
    const chave = item.url.replace(/\/$/, "");
    if (!unicos.has(chave)) unicos.set(chave, item);
  }

  /*
   * Esta primeira versão só faz triagem por título/URL.
   * Não publica resultados automaticamente porque a localidade e os
   * detalhes precisam ser confirmados no conteúdo da vaga, não apenas
   * no link. As fontes permanecem desativadas até serem configuradas
   * com páginas específicas de oportunidades e testadas.
   */
  const triagem = [...unicos.values()]
    .filter(pareceVaga)
    .filter(item => mencionaLocalidade(item.titulo, localidades));

  const resultado = {
    atualizado_em: new Date().toISOString(),
    items: triagem.slice(0, Number(config.quantidade) || 20).map(item => ({
      titulo: item.titulo,
      empresa: "",
      localidade: localidades.find(local => mencionaLocalidade(item.titulo, [local])) || "",
      resumo: "",
      publicado_em: "",
      url: item.url,
      fonte: item.fonte
    }))
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(resultado, null, 2) + "\n", "utf8");

  console.log(`Itens encontrados na triagem: ${resultado.items.length}`);
  console.log(`Arquivo gerado: ${OUTPUT_PATH}`);
}

executar().catch(erro => {
  console.error(erro.message);
  process.exit(1);
});
