import express from "express";
import pg from "pg";
import QRCode from "qrcode";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000
});

function money(v) { return Number(v || 0).toFixed(2); }
function cleanPixText(v, max) {
  return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, max).toUpperCase();
}
function tlv(id, value) { return id + String(value.length).padStart(2, "0") + value; }
function crc16(payload) {
  let crc = 0xffff;
  for (let i=0;i<payload.length;i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j=0;j<8;j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function pixPayload({ chave, nome, cidade, valor, txid }) {
  const merchant = tlv("00","br.gov.bcb.pix") + tlv("01",chave);
  const body = tlv("00","01") + tlv("26",merchant) + tlv("52","0000") +
    tlv("53","986") + tlv("54",money(valor)) + tlv("58","BR") +
    tlv("59",cleanPixText(nome,25) || "ACOUGUE") +
    tlv("60",cleanPixText(cidade,15) || "SAO PAULO") +
    tlv("62",tlv("05",txid || "***")) + "6304";
  return body + crc16(body);
}

async function waitDb() {
  for (let i=0;i<30;i++) {
    try { await pool.query("SELECT 1"); return; }
    catch { await new Promise(r=>setTimeout(r,1000)); }
  }
  throw new Error("Banco de dados indisponível");
}

app.get("/api/health", async (_req,res) => {
  try { await pool.query("SELECT 1"); res.json({ok:true}); }
  catch { res.status(503).json({ok:false}); }
});

app.get("/api/config", async (_req,res) => {
  const { rows } = await pool.query("SELECT nome_loja,chave_pix,cidade FROM configuracao WHERE id=1");
  res.json(rows[0] || {});
});
app.put("/api/config", async (req,res) => {
  const { nome_loja, chave_pix, cidade } = req.body;
  if (!nome_loja || !cidade) return res.status(400).json({error:"Nome da loja e cidade são obrigatórios."});
  const { rows } = await pool.query(
    `UPDATE configuracao SET nome_loja=$1,chave_pix=$2,cidade=$3,atualizado_em=now()
     WHERE id=1 RETURNING nome_loja,chave_pix,cidade`,
    [nome_loja.trim(), String(chave_pix||"").trim(), cidade.trim()]
  );
  res.json(rows[0]);
});

app.get("/api/produtos", async (_req,res) => {
  const { rows } = await pool.query(
    "SELECT id,codigo_barras,nome,categoria,preco,unidade,ativo FROM produtos WHERE ativo=true ORDER BY nome"
  );
  res.json(rows);
});
app.post("/api/produtos", async (req,res) => {
  const { codigo_barras,nome,categoria,preco,unidade } = req.body;
  if (!codigo_barras || !nome || !["kg","un"].includes(unidade)) return res.status(400).json({error:"Preencha código, nome e unidade."});
  try {
    const { rows } = await pool.query(
      `INSERT INTO produtos(codigo_barras,nome,categoria,preco,unidade)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [String(codigo_barras).trim(),String(nome).trim(),String(categoria||"").trim()||null,Number(preco)||0,unidade]
    );
    res.status(201).json(rows[0]);
  } catch(e) {
    if (e.code === "23505") return res.status(409).json({error:"Código de barras já cadastrado."});
    res.status(500).json({error:"Não foi possível cadastrar o produto."});
  }
});
app.put("/api/produtos/:id", async (req,res) => {
  const { nome,categoria,preco,unidade,codigo_barras } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE produtos SET codigo_barras=$1,nome=$2,categoria=$3,preco=$4,unidade=$5,atualizado_em=now()
       WHERE id=$6 RETURNING *`,
      [String(codigo_barras).trim(),String(nome).trim(),String(categoria||"").trim()||null,Number(preco)||0,unidade,req.params.id]
    );
    if (!rows[0]) return res.status(404).json({error:"Produto não encontrado."});
    res.json(rows[0]);
  } catch(e) { res.status(500).json({error:"Não foi possível atualizar o produto."}); }
});
app.delete("/api/produtos/:id", async (req,res) => {
  await pool.query("UPDATE produtos SET ativo=false,atualizado_em=now() WHERE id=$1",[req.params.id]);
  res.status(204).end();
});

app.post("/api/pix/qrcode", async (req,res) => {
  const { valor } = req.body;
  const amount = Number(valor);
  if (!(amount > 0)) return res.status(400).json({error:"Valor inválido."});
  const { rows } = await pool.query("SELECT nome_loja,chave_pix,cidade FROM configuracao WHERE id=1");
  const cfg=rows[0];
  if (!cfg?.chave_pix) return res.status(400).json({error:"Cadastre a chave Pix em Configurações."});
  const txid = crypto.randomBytes(8).toString("hex").toUpperCase();
  const payload = pixPayload({chave:cfg.chave_pix,nome:cfg.nome_loja,cidade:cfg.cidade,valor:amount,txid});
  const dataUrl = await QRCode.toDataURL(payload,{margin:1,width:520,errorCorrectionLevel:"M"});
  res.json({payload, dataUrl, txid, valor:amount});
});

app.post("/api/vendas", async (req,res) => {
  const { total, forma_pagamento, itens, status_pagamento="pago", pix_txid=null } = req.body;
  if (!(Number(total)>0) || !["pix","cartao","dinheiro"].includes(forma_pagamento) || !Array.isArray(itens))
    return res.status(400).json({error:"Venda inválida."});
  const status = ["pendente","pago","cancelado"].includes(status_pagamento) ? status_pagamento : "pago";
  const { rows } = await pool.query(
    `INSERT INTO vendas(total,forma_pagamento,status_pagamento,pix_txid,itens,pago_em)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id,total,forma_pagamento,status_pagamento,pix_txid,criado_em,pago_em`,
    [Number(total),forma_pagamento,status,pix_txid,JSON.stringify(itens),status==="pago"?new Date():null]
  );
  res.status(201).json(rows[0]);
});

app.get("/api/vendas", async (req,res) => {
  const limit=Math.min(Math.max(Number(req.query.limit)||50,1),200);
  const { rows }=await pool.query(
    `SELECT id,total,forma_pagamento,status_pagamento,pix_txid,criado_em,pago_em,itens
     FROM vendas ORDER BY criado_em DESC LIMIT $1`,[limit]);
  res.json(rows);
});

app.get("/api/dashboard", async (_req,res) => {
  const { rows }=await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE criado_em::date=CURRENT_DATE AND status_pagamento='pago')::int AS vendas_hoje,
      COALESCE(SUM(total) FILTER (WHERE criado_em::date=CURRENT_DATE AND status_pagamento='pago'),0)::numeric AS faturamento_hoje,
      COUNT(*) FILTER (WHERE criado_em::date=CURRENT_DATE AND status_pagamento='cancelado')::int AS canceladas_hoje,
      COALESCE(SUM(total) FILTER (WHERE criado_em::date=CURRENT_DATE AND forma_pagamento='pix' AND status_pagamento='pago'),0)::numeric AS pix_hoje
    FROM vendas`);
  res.json(rows[0]);
});

app.post("/api/pix/webhook", async (req,res) => {
  // Endpoint preparado para integração com um PSP/banco.
  // Nunca marque Pix como pago somente pelo conteúdo enviado pelo navegador.
  const { txid, status }=req.body;
  if (!txid) return res.status(400).json({error:"txid obrigatório"});
  if (status==="paid" || status==="pago") {
    await pool.query(
      `UPDATE vendas SET status_pagamento='pago',pago_em=COALESCE(pago_em,now())
       WHERE pix_txid=$1`,[txid]);
  }
  res.json({ok:true});
});

app.use(express.static(path.join(__dirname,"../public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"../public/index.html")));

waitDb().then(()=>{
  const port=Number(process.env.PORT)||3000;
  app.listen(port,()=>console.log(`Açougue PDV rodando na porta ${port}`));
}).catch(err=>{console.error(err);process.exit(1);});
