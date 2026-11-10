const fs = require("fs");

const DATA_PATH = "data/oportunidades.json";
const COLLECTED_PATH = "/tmp/oportunidades-coletadas.json";
const VERSAO_ESTRUTURA = 3;
const LIMITE = 40;

function lerJson(caminho, padrao) {
  try {
    return JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch (erro) {
    if (erro.code === "ENOENT") return padrao;
    throw erro;
  }
}

function chave(item) {
  return String(item && (item.link_original || item.url) || "").trim();
}

function mesclarRegistro(anterior, novo) {
  const resultado = { ...(anterior || {}) };
  for (const [campo, valor] of Object.entries(novo || {})) {
    if (valor !== null && valor !== undefined && String(valor).trim() !== "") {
      resultado[campo] = valor;
    } else if (!(campo in resultado)) {
      resultado[campo] = null;
    }
  }
  return resultado;
}

function executar() {
  const atual = lerJson(DATA_PATH, { items: [] });
  const coleta = lerJson(COLLECTED_PATH, { items: [] });
  const registros = new Map();

  for (const item of Array.isArray(atual.items) ? atual.items : []) {
    const id = chave(item);
    if (id) registros.set(id, item);
  }

  let entradasNovas = 0;
  let registrosAtualizados = 0;

  for (const item of Array.isArray(coleta.items) ? coleta.items : []) {
    const id = chave(item);
    if (!id) continue;

    if (!registros.has(id)) {
      registros.set(id, item);
      entradasNovas++;
    } else {
      const anterior = registros.get(id);
      const mesclado = mesclarRegistro(anterior, item);
      if (JSON.stringify(mesclado) !== JSON.stringify(anterior)) registrosAtualizados++;
      registros.set(id, mesclado);
    }
  }

  const items = [...registros.values()]
    .sort((a, b) => String(b.publicado_em || "").localeCompare(String(a.publicado_em || "")))
    .slice(0, LIMITE);

  const estruturaAnterior = Number(atual.versao_estrutura) || 1;
  const resultado = {
    versao_estrutura: Math.max(VERSAO_ESTRUTURA, estruturaAnterior, Number(coleta.versao_estrutura) || 1),
    atualizado_em: atual.atualizado_em || null,
    items
  };

  const mudou = JSON.stringify(items) !== JSON.stringify(Array.isArray(atual.items) ? atual.items : [])
    || resultado.versao_estrutura !== estruturaAnterior;

  if (mudou) resultado.atualizado_em = coleta.atualizado_em || new Date().toISOString();
  else resultado.atualizado_em = atual.atualizado_em || new Date().toISOString();

  fs.writeFileSync(DATA_PATH, JSON.stringify(resultado, null, 2) + "\n", "utf8");

  console.log("Estrutura publicada:", resultado.versao_estrutura);
  console.log("Registros mantidos:", items.length);
  console.log("Novas oportunidades:", entradasNovas);
  console.log("Registros atualizados:", registrosAtualizados);
  console.log("Alterações para publicar:", mudou ? "sim" : "não");
}

executar();
