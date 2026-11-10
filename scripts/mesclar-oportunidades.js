const fs = require("fs");

const DATA_PATH = "data/oportunidades.json";
const COLLECTED_PATH = "/tmp/oportunidades-coletadas.json";
const VERSAO_ESTRUTURA = 4;
const LIMITE = 40;
const RETENCAO_HORAS = 72;
const RETENCAO_EXPIRADAS_DIAS = 90;

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

function dataValida(valor) {
  const data = Date.parse(valor || "");
  return Number.isFinite(data) ? data : null;
}

function mesclarRegistro(anterior, novo) {
  const resultado = { ...(anterior || {}) };
  for (const [campo, valor] of Object.entries(novo || {})) {
    if (campo === "adicionado_em") continue;
    if (valor !== null && valor !== undefined && String(valor).trim() !== "") {
      resultado[campo] = valor;
    } else if (!(campo in resultado)) {
      resultado[campo] = null;
    }
  }
  resultado.adicionado_em = anterior.adicionado_em;
  return resultado;
}

function executar() {
  const agora = new Date();
  const agoraISO = agora.toISOString();
  const limiteIdade = agora.getTime() - RETENCAO_HORAS * 60 * 60 * 1000;
  const limiteHistorico = agora.getTime() - RETENCAO_EXPIRADAS_DIAS * 86400000;
  const atual = lerJson(DATA_PATH, { items: [], expiradas: [] });
  const coleta = lerJson(COLLECTED_PATH, { items: [] });
  const registros = new Map();
  const expiradas = new Map();

  for (const registro of Array.isArray(atual.expiradas) ? atual.expiradas : []) {
    const url = typeof registro === "string" ? registro : registro.url;
    const expiradaEm = typeof registro === "string" ? agoraISO : (registro.expirada_em || agoraISO);
    if (url && dataValida(expiradaEm) >= limiteHistorico) {
      expiradas.set(url, { url, expirada_em: expiradaEm });
    }
  }

  const dataMigracao = dataValida(atual.atualizado_em)
    ? atual.atualizado_em
    : agoraISO;

  for (const item of Array.isArray(atual.items) ? atual.items : []) {
    const id = chave(item);
    if (!id) continue;
    registros.set(id, {
      ...item,
      adicionado_em: item.adicionado_em || dataMigracao
    });
  }

  let entradasNovas = 0;
  let registrosAtualizados = 0;
  let ignoradasExpiradas = 0;

  const dataColeta = dataValida(coleta.atualizado_em)
    ? coleta.atualizado_em
    : agoraISO;

  for (const item of Array.isArray(coleta.items) ? coleta.items : []) {
    const id = chave(item);
    if (!id) continue;

    if (expiradas.has(id)) {
      ignoradasExpiradas++;
      continue;
    }

    if (!registros.has(id)) {
      registros.set(id, { ...item, adicionado_em: dataColeta });
      entradasNovas++;
    } else {
      const anterior = registros.get(id);
      const mesclado = mesclarRegistro(anterior, item);
      if (JSON.stringify(mesclado) !== JSON.stringify(anterior)) registrosAtualizados++;
      registros.set(id, mesclado);
    }
  }

  const validos = [];
  for (const [id, item] of registros.entries()) {
    const adicionado = dataValida(item.adicionado_em);
    if (!adicionado || adicionado < limiteIdade || adicionado > agora.getTime()) {
      expiradas.set(id, { url: id, expirada_em: agoraISO });
      continue;
    }
    validos.push(item);
  }

  validos.sort((a, b) =>
    (dataValida(b.adicionado_em) - dataValida(a.adicionado_em))
    || String(b.publicado_em || "").localeCompare(String(a.publicado_em || ""))
  );

  const items = validos.slice(0, LIMITE);
  for (const item of validos.slice(LIMITE)) {
    const id = chave(item);
    if (id) expiradas.set(id, { url: id, expirada_em: agoraISO });
  }

  const expiradasFinais = [...expiradas.values()]
    .filter(item => dataValida(item.expirada_em) >= limiteHistorico);

  const estruturaAnterior = Number(atual.versao_estrutura) || 1;
  const resultado = {
    versao_estrutura: Math.max(VERSAO_ESTRUTURA, estruturaAnterior, Number(coleta.versao_estrutura) || 1),
    atualizado_em: coleta.atualizado_em || agoraISO,
    items,
    expiradas: expiradasFinais
  };

  fs.writeFileSync(DATA_PATH, JSON.stringify(resultado, null, 2) + "\n", "utf8");

  console.log("Estrutura publicada:", resultado.versao_estrutura);
  console.log("Registros mantidos:", items.length);
  console.log("Novas oportunidades:", entradasNovas);
  console.log("Registros atualizados:", registrosAtualizados);
  console.log("Oportunidades expiradas/descartadas:", expiradasFinais.length);
  console.log("Reapresentações bloqueadas:", ignoradasExpiradas);
  console.log("Retenção máxima: 72 horas após entrada no site");
}

executar();
