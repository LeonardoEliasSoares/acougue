const state={products:[],cart:[],config:{},pix:null,payment:null};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const qtyNorm=v=>Number(String(v||"").replace(",", "."))||1;
function total(){return state.cart.reduce((a,i)=>a+i.preco*i.quantidade,0)}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json",...(opt.headers||{})},...opt});if(!r.ok){let e={};try{e=await r.json()}catch{};throw new Error(e.error||"Erro na operação")}return r.status===204?null:r.json()}
function renderCart(){
 const t=total(), peso=state.cart.filter(i=>i.unidade==="kg").reduce((a,i)=>a+i.quantidade,0);
 $("#total").textContent=brl(t);$("#summary").textContent=`${state.cart.length} ${state.cart.length===1?"item":"itens"} · ${peso.toFixed(3).replace(".",",")} kg`;
 $("#payPix").disabled=$("#payCard").disabled=$("#payCash").disabled=t<=0;$("#payPix").innerHTML=`PIX <strong>${brl(t)}</strong>`;
 const c=$("#cart");
 if(!state.cart.length){c.innerHTML='<div class="hint" style="text-align:center;padding:28px">Nenhum item. Bipe o primeiro produto.</div>';return}
 c.innerHTML=state.cart.map((i,n)=>`<div class="row"><div><strong>${esc(i.nome)}</strong><small>${esc(i.codigo_barras)}</small></div><span class="num">${i.unidade==="kg"?i.quantidade.toFixed(3).replace(".",",")+" kg":i.quantidade+" un"}</span><span class="num">${brl(i.preco)}</span><strong class="num">${brl(i.preco*i.quantidade)}</strong><button class="remove" onclick="removeItem(${n})">×</button></div>`).join("");
}
window.removeItem=n=>{state.cart.splice(n,1);state.pix=null;state.payment=null;$("#pixBox").classList.add("hidden");renderCart();focusBarcode()}
function addProduct(p,q){state.cart.push({...p,quantidade:q});$("#scanMessage").textContent=`${p.nome} · ${brl(p.preco)}/${p.unidade}`;$("#barcode").value="";$("#qty").value="";renderCart();focusBarcode()}
function focusBarcode(){setTimeout(()=>$("#barcode")?.focus(),50)}
$("#scanForm").addEventListener("submit",e=>{e.preventDefault();const code=$("#barcode").value.trim();if(!code)return;const p=state.products.find(x=>x.codigo_barras===code);if(!p){$("#scanMessage").textContent=`Código ${code} não cadastrado`;$("#scanMessage").style.color="var(--danger)";$("#barcode").select();return}$("#scanMessage").style.color="";addProduct(p,qtyNorm($("#qty").value))});
async function loadProducts(){state.products=await api("/api/produtos");renderQuick();renderProducts()}
function renderQuick(){const ps=state.products.slice(0,6);$("#quickProducts").innerHTML=ps.map((p,i)=>`<button onclick='addProduct(state.products[${state.products.indexOf(p)}],qtyNorm($("#qty").value))'><b>F${i+1}</b> · ${esc(p.nome)}<small>${brl(p.preco)}/${p.unidade}</small></button>`).join("")}
function renderProducts(){
 const q=($("#productSearch")?.value||"").toLowerCase();const ps=state.products.filter(p=>(p.nome+" "+p.codigo_barras+" "+(p.categoria||"")).toLowerCase().includes(q));
 $("#productsTable").innerHTML=`<div class="product-row" style="color:var(--muted);font-size:10px;font-weight:800;text-transform:uppercase"><span>Código</span><span>Nome</span><span>Categoria</span><span>Preço</span><span>Un.</span><span></span></div>`+
 ps.map(p=>`<div class="product-row"><span>${esc(p.codigo_barras)}</span><strong>${esc(p.nome)}</strong><span>${esc(p.categoria||"—")}</span><span>${brl(p.preco)}</span><span>${p.unidade}</span><button class="small-btn" onclick="deleteProduct('${p.id}')">Excluir</button></div>`).join("");
}
$("#productSearch").addEventListener("input",renderProducts);
$("#productForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/api/produtos",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});e.target.reset();toast("Produto cadastrado");await loadProducts()}catch(err){$("#productMsg").textContent=err.message}});
window.deleteProduct=async id=>{if(!confirm("Desativar este produto?"))return;await api("/api/produtos/"+id,{method:"DELETE"});await loadProducts();toast("Produto desativado")}
async function openPix(){
 const t=total();if(t<=0)return;
 try{state.pix=await api("/api/pix/qrcode",{method:"POST",body:JSON.stringify({valor:t})});$("#qr").src=state.pix.dataUrl;$("#pixPayload").value=state.pix.payload;$("#pixValue").textContent=brl(t);$("#pixBox").classList.remove("hidden");state.payment="pix";focusBarcode()}
 catch(e){toast(e.message)}
}
$("#payPix").addEventListener("click",openPix);
async function finishSale(forma,status="pago"){
 if(total()<=0)return;try{
  await api("/api/vendas",{method:"POST",body:JSON.stringify({total:total(),forma_pagamento:forma,status_pagamento:status,pix_txid:state.pix?.txid||null,itens:state.cart})});
  toast("Venda registrada");state.cart=[];state.pix=null;state.payment=null;$("#pixBox").classList.add("hidden");renderCart();await loadDashboard();focusBarcode();
 }catch(e){toast(e.message)}
}
$("#payCard").addEventListener("click",()=>finishSale("cartao"));$("#payCash").addEventListener("click",()=>finishSale("dinheiro"));
$("#confirmPix").addEventListener("click",()=>finishSale("pix","pago"));
$("#copyPix").addEventListener("click",async()=>{await navigator.clipboard.writeText($("#pixPayload").value);toast("Pix Copia e Cola copiado")});
async function loadConfig(){state.config=await api("/api/config");$("#storeTitle").textContent=state.config.nome_loja||"Açougue";const f=$("#configForm");f.nome_loja.value=state.config.nome_loja||"";f.cidade.value=state.config.cidade||"";f.chave_pix.value=state.config.chave_pix||""}
$("#configForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);try{state.config=await api("/api/config",{method:"PUT",body:JSON.stringify(Object.fromEntries(f))});$("#storeTitle").textContent=state.config.nome_loja;$("#configMsg").textContent="Configuração salva.";toast("Configuração salva")}catch(err){$("#configMsg").textContent=err.message}});
async function loadSales(){const vs=await api("/api/vendas?limit=100");$("#salesTable").innerHTML=`<div class="product-row"><b>Data</b><b>Forma</b><b>Status</b><b>Total</b><span></span><span></span></div>`+vs.map(v=>`<div class="product-row"><span>${new Date(v.criado_em).toLocaleString("pt-BR")}</span><span>${esc(v.forma_pagamento)}</span><span>${esc(v.status_pagamento)}</span><strong>${brl(v.total)}</strong><span>${v.pix_txid?esc(v.pix_txid):""}</span><span></span></div>`).join("")}
$("#refreshSales").addEventListener("click",loadSales);
async function loadDashboard(){const d=await api("/api/dashboard");$("#dashboard").innerHTML=`<div class="metric"><span>Vendas hoje</span><b>${d.vendas_hoje}</b></div><div class="metric"><span>Faturamento</span><b>${brl(d.faturamento_hoje)}</b></div><div class="metric"><span>Pix hoje</span><b>${brl(d.pix_hoje)}</b></div><div class="metric"><span>Canceladas</span><b>${d.canceladas_hoje}</b></div>`}
$$(".nav").forEach(b=>b.addEventListener("click",async()=>{ $$(".nav").forEach(x=>x.classList.remove("active"));b.classList.add("active");$$(".view").forEach(x=>x.classList.remove("active"));$("#view-"+b.dataset.view).classList.add("active");if(b.dataset.view==="historico")await loadSales();if(b.dataset.view==="config")await loadDashboard();if(b.dataset.view==="produtos")await loadProducts();if(b.dataset.view==="caixa")focusBarcode()}));
async function health(){try{await api("/api/health");$("#health").textContent="● online"}catch{$("#health").textContent="● banco indisponível";$("#health").style.color="var(--danger)"}}
(async()=>{try{await Promise.all([loadConfig(),loadProducts(),loadDashboard(),health()]);renderCart();focusBarcode()}catch(e){toast(e.message)}})();
document.addEventListener("keydown",e=>{if(e.key==="F2"){e.preventDefault();$("#barcode").focus()}});
