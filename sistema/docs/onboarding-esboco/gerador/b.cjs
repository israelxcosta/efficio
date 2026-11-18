// Variação B — moderno roxo, gradientes suaves, formas orgânicas, tom de boas-vindas.
const fs = require('fs');
const path = require('path');
const D = require('./data.cjs');
const { md, CLI } = D;
const OUT = path.join(__dirname, '../onboarding/slides-b.html');
const p2 = (n) => String(n).padStart(2, '0');
const SEC = { 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 3, 11: 4, 12: 4, 13: 4, 14: 4, 15: 5, 16: 5 };
const SECN = ['', 'Como trabalhamos juntos', 'Suas obrigações e prazos', 'Documentos e extratos', 'Seus empregados', 'Multas e primeiros passos'];
const DK = [1, 2, 9, 17], ALT = [4, 5, 12];

const logo = `<div class="logo"><svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" class="lm"/><path d="M12 12h16M12 20h11M12 28h16" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg><b>Efficio</b><span>Contabilidade</span></div>`;
const decoL = `<svg class="deco dl" viewBox="0 0 520 520" aria-hidden="true"><circle cx="300" cy="200" r="210" fill="url(#gl)"/><circle cx="120" cy="380" r="64" fill="none" stroke="#b9a6ff" stroke-width="3"/><circle cx="96" cy="140" r="22" fill="#6d4ce0" opacity=".9"/></svg>`;
const decoD = `<svg class="deco dd" viewBox="0 0 1000 1000" aria-hidden="true"><path d="M520 90c190-40 390 80 410 300s-110 420-330 470-430-50-500-250S330 130 520 90Z" fill="url(#gd)"/><circle cx="820" cy="160" r="46" fill="#b9a6ff"/></svg>`;
const slide = (n, cls, body) => {
  const dk = DK.includes(n), alt = ALT.includes(n);
  const sec = SEC[n] ? `<span class="sec"><b>${p2(SEC[n])}</b>${SECN[SEC[n]]}</span>` : '';
  return `<section class="slide ${cls}${dk ? ' dk' : ''}${alt ? ' alt' : ''}" id="s${n}" aria-label="Slide ${n} de ${D.total}">${dk ? decoD : decoL}<header class="top">${logo}${sec}</header><div class="body">${body}</div><footer class="foot"><span>${CLI} · Onboarding do cliente</span><span class="pg"><b>${p2(n)}</b> / ${D.total}</span></footer></section>`;
};
const head = (t, lead) => `<div class="head"><h2>${t}</h2><p class="lead">${lead}</p></div>`;
const table = (o, mod) => `<div class="tbl ${mod}" role="table"><div class="tr th" role="row"><span></span>${o.head.map((h) => `<span role="columnheader">${h}</span>`).join('')}</div>${o.rows.map((r, i) => `<div class="tr" role="row"${r[4] ? ` data-cond="${r[4]}"` : ''}><span class="n">${i + 1}</span><span class="a">${r[0]}${r[3] ? `<em class="${r[4] ? 'tag' : 'sub'}">${r[3]}</em>` : ''}</span><span class="b">${md(r[1])}</span><span class="c">${md(r[2])}</span></div>`).join('')}</div>`;
const list = (items) => `<ul class="items">${items.map(([a, b], i) => `<li><span class="n">${i + 1}</span><div><b>${a}</b><span>${b}</span></div></li>`).join('')}</ul>`;

const S = [];
S.push(slide(1, 's1', `<p class="pill">Onboarding do cliente</p><h1>${CLI}</h1><p class="from">com a Efficio Contabilidade</p>
<dl class="data">${D.cover.data.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`));
S.push(slide(2, 'split s2', `<div><h2>Sumário</h2><p class="lead">${D.sumario.lead}</p></div><ol class="sum">${D.sumario.items.map((t, i) => `<li><span class="n">${p2(i + 1)}</span><span>${t}</span></li>`).join('')}</ol>`));
S.push(slide(3, 'split', `<div><h2>Como trabalhamos juntos</h2><p class="lead">${D.como.lead}</p></div>${list(D.como.items)}`));
const T = D.time;
S.push(slide(4, 's4', head('Seu time e canais', T.lead) + `<ul class="depts">${T.depts.map(([ini, n, d], i) => `<li class="c${i}"><span class="av" aria-hidden="true">${ini}</span><b>${n}</b><span>${d}</span></li>`).join('')}</ul>
<div class="contact"><div><small>WhatsApp</small><b>${T.whats}</b></div><div><small>E-mail</small><b>${T.email}</b></div><div><small>Atendimento</small><b>${T.horario}</b></div></div>`));
S.push(slide(5, 's5', head('Suas obrigações em números', D.numeros.lead) + `<ul class="nums">${D.numeros.items.map(([n, l, d], i) => `<li class="c${i}"><span class="big">${n}</span><b>${l}</b><span>${d}</span></li>`).join('')}</ul>`));
for (const [n, k] of [[6, 'fiscal'], [7, 'contabil'], [8, 'pessoal']]) S.push(slide(n, 'st', head(D[k].title, D[k].lead) + table(D[k], 't3')));
S.push(slide(9, 's9', head('Seu mês em uma linha', D.mes.lead) + `<ol class="month">${D.mes.items.map(([pre, big, post, who, what, w]) => `<li class="${w}"><small>${pre}</small><span class="day">${big}${post ? `<i>${post}</i>` : ''}</span><b class="who">${who}</b><span>${what}</span></li>`).join('')}</ol>`));
S.push(slide(10, 'st', head(D.docs.title, D.docs.lead) + table(D.docs, 'tdocs')));
S.push(slide(11, 's11', head('Registro de empregado', D.registro.lead) + `<ol class="steps">${D.registro.items.map(([a, b], i) => `<li><span class="dot">${i + 1}</span><b>${a}</b><span>${b}</span></li>`).join('')}</ol>`));
S.push(slide(12, 's12', head('Férias', D.ferias.lead) + `<ol class="trio">${D.ferias.trio.map(([n, t], i) => `<li class="c${i}"><span class="circ"><span class="big">${n}</span><small>dias antes</small></span><span>${t}</span></li>`).join('')}</ol>
<div class="rules">${D.ferias.rules.map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>`));
S.push(slide(13, 'split', `<div><h2>Rescisão</h2><p class="lead">${D.rescisao.lead}</p></div>${list(D.rescisao.items)}`));
S.push(slide(14, 'st', head(D.esocial.title, D.esocial.lead) + table(D.esocial, 'tes')));
S.push(slide(15, 'st s15', head('<span class="warn" aria-hidden="true"></span>Atenção: multas', D.multas.lead) + `<div class="tbl tmul">${D.multas.rows.map(([a, b, pn], i) => `<div class="tr"><span class="n">${i + 1}</span><span class="a">${a}</span><span class="b">${b}</span><strong class="pen">${pn}</strong></div>`).join('')}</div>`));
S.push(slide(16, 'split', `<div><h2>Primeiros passos</h2><p class="lead">${D.passos.lead}</p></div><ul class="chk">${D.passos.items.map(([a, b]) => `<li><label><input type="checkbox"><span class="box" aria-hidden="true"></span><span><b>${a}</b> ${b}</span></label></li>`).join('')}</ul>`));
S.push(slide(17, 's17', `<p class="pill">Bem-vindos!</p><h2>Li e entendi</h2><p class="lead">${D.fim.lead}</p><button type="button" class="btn">Confirmar leitura</button>
<p class="ct"><b>Dúvidas?</b> WhatsApp ${T.whats} · ${T.email}</p><p class="ct">Atendimento de ${T.horario}</p><p class="sig">Efficio Contabilidade · ${D.fim.crc}</p>`));

const css = `
@font-face{font-family:PJS;src:url(fonts/plus-jakarta-sans-latin-wght-normal.woff2) format('woff2');font-weight:200 800;font-display:block}
:root{--p9:#2b1b5a;--p7:#4a2fa8;--p6:#6d4ce0;--p3:#b9a6ff;--p1:#ede8ff;--p0:#f6f3ff;--ink:#1d1438;--g:#564e72;--navy:#152b61;--red:#cc3333;--reds:#fdeeee}
*{box-sizing:border-box;margin:0;padding:0}
html{background:#1b1238}
body{font-family:PJS,system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
ul,ol{list-style:none}
.deck{width:1920px;zoom:var(--z,1)}
.slide{position:relative;width:1920px;height:1080px;overflow:hidden;display:flex;flex-direction:column;padding:0 120px;background:var(--p0);isolation:isolate;margin-bottom:24px}
.slide.alt{background:#fff}
.slide.dk{background:radial-gradient(900px 700px at 85% 15%,rgba(185,166,255,.35),transparent 60%),linear-gradient(135deg,#2b1b5a 0%,#4a2fa8 58%,#6d4ce0 100%);color:#fff}
.deco{position:absolute;z-index:-1;pointer-events:none}
.dl{right:-150px;top:-190px;width:520px;height:520px}
.dd{right:-260px;top:40px;width:1000px;height:1000px}
.top{height:120px;flex:none;display:flex;align-items:center;gap:28px}
.body{flex:1;display:flex;flex-direction:column;min-height:0}
.foot{height:96px;flex:none;display:flex;align-items:center;justify-content:space-between;font-size:20px;color:var(--g)}
.dk .foot{color:#d9cfff}
.pg b{color:var(--p6);font-weight:800}.dk .pg b{color:#fff}
.logo{display:flex;align-items:center;gap:12px;font-size:26px;letter-spacing:-.01em}
.logo svg{width:40px;height:40px}.lm{fill:var(--navy)}.dk .lm{fill:#fff}.dk .logo path{stroke:var(--p7)}
.logo b{font-weight:800;color:var(--navy)}.logo span{color:var(--g)}.dk .logo b{color:#fff}.dk .logo span{color:#e4dcff}
.sec{display:flex;align-items:center;gap:12px;background:#fff;color:var(--p7);border-radius:999px;padding:10px 24px 10px 10px;font-size:19px;font-weight:700}
.alt .sec{background:var(--p1)}
.sec b{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--p6);color:#fff;font-size:16px}
h1,h2{font-weight:800;letter-spacing:-.035em;line-height:1.02;text-wrap:balance}
h2{font-size:84px}
.lead{font-size:30px;line-height:1.4;color:var(--g);margin-top:20px;max-width:1300px;font-weight:500}
.dk .lead{color:#ece6ff}
strong{font-weight:800;color:var(--p6)}
.head{margin-top:30px}
.pill{align-self:flex-start;display:inline-block;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:12px 28px;font-size:24px;font-weight:700}
/* capa */
.s1 .body{justify-content:center}
.s1 h1{font-size:150px;margin-top:34px;max-width:1300px;line-height:.98}
.s1 .from{font-size:34px;margin-top:22px;color:#ece6ff;font-weight:500}
.data{display:flex;justify-content:space-between;gap:40px;margin-top:70px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:36px;padding:32px 40px;backdrop-filter:blur(6px)}
.data dt{font-size:17px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#d9cfff}
.data dd{white-space:nowrap;font-size:25px;font-weight:700;margin-top:8px;line-height:1.3}
/* split */
.split .body{display:grid;grid-template-columns:600px 1fr;column-gap:110px;align-items:center}
.split h2{font-size:92px}
.items{display:flex;flex-direction:column;gap:14px}
.items li{display:grid;grid-template-columns:56px 1fr;column-gap:24px;align-items:center;background:#fff;border-radius:28px;padding:22px 30px}
.n{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--p1);color:var(--p7);font-size:20px;font-weight:800}
.items b{display:block;font-size:30px;font-weight:800;letter-spacing:-.01em}
.items div span{display:block;font-size:24px;line-height:1.4;color:var(--g);margin-top:4px}
.sum{display:flex;flex-direction:column;gap:16px}
.sum li{display:grid;grid-template-columns:96px 1fr;align-items:center;column-gap:28px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:30px;padding:20px 30px 20px 20px;font-size:36px;font-weight:700;line-height:1.2}
.sum .n{width:96px;height:96px;border-radius:26px;background:var(--p3);color:var(--p9);font-size:36px}
/* time */
.depts{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:56px;flex:1}
.depts li{border-radius:40px;padding:40px 44px;display:flex;flex-direction:column;justify-content:flex-end;gap:10px}
.depts .av{margin-bottom:auto!important}
.depts .av{display:grid;place-items:center;width:84px;height:84px;border-radius:50%;font-size:28px;font-weight:800;margin-bottom:14px}
.depts b{font-size:44px;font-weight:800;letter-spacing:-.02em}.depts span:last-child{font-size:25px;line-height:1.4}
.c0{background:var(--p6);color:#fff}.c0 .av{background:#fff;color:var(--p6)}
.c1{background:var(--p9);color:#fff}.c1 .av{background:var(--p3);color:var(--p9)}
.c2{background:var(--p3);color:var(--ink)}.c2 .av{background:#fff;color:var(--p7)}
.c3{background:var(--p1);color:var(--ink)}
.contact{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:28px;margin:28px 0 36px;background:var(--p1);border-radius:40px;padding:30px 40px}
.contact small{display:block;font-size:17px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--p7)}
.contact b{display:block;font-size:30px;font-weight:800;margin-top:6px;letter-spacing:-.01em}
/* números */
.nums{display:grid;grid-template-columns:repeat(4,1fr);gap:28px;margin-top:auto;margin-bottom:36px}
.nums li{border-radius:44px;padding:40px 40px 44px;display:flex;flex-direction:column;gap:10px;min-height:480px}
.nums .big{font-size:230px;font-weight:800;line-height:.9;letter-spacing:-.06em}
.nums b{font-size:38px;font-weight:800;margin-top:auto;letter-spacing:-.01em;line-height:1.1}.nums span:last-child{font-size:24px;line-height:1.4}
/* tabelas */
.tbl{margin-top:auto;margin-bottom:24px}
.tr{display:grid;grid-template-columns:52px 380px 500px 1fr;column-gap:36px;align-items:center;background:#fff;border-radius:28px;padding:20px 32px;margin-top:12px;font-size:25px;line-height:1.35}
.th{background:none;padding:0 32px 2px;margin:0;font-size:17px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--p7)}
.tr .a{font-size:29px;font-weight:800;letter-spacing:-.01em;line-height:1.2}
.tr .b{font-weight:600;color:var(--p9)}.tr .c{color:var(--g)}
.sub{display:block;font-size:19px;font-style:normal;font-weight:600;color:var(--g);margin-top:2px}
.tag{display:inline-block;font-size:16px;font-style:normal;font-weight:700;background:var(--p1);color:var(--p7);border-radius:999px;padding:5px 14px;margin-top:8px}
.tdocs .tr{grid-template-columns:52px 380px 1fr 280px}.tdocs .c{font-size:28px;font-weight:800;color:var(--p6)}.tdocs .b{font-weight:500;color:var(--g)}
.tes .tr{grid-template-columns:52px 560px 380px 1fr}.tes .b{font-weight:700;color:var(--p7)}.tes .c{font-weight:600;color:var(--p9)}
/* mês */
.month{display:grid;grid-template-columns:repeat(5,1fr);gap:24px;margin-top:auto;margin-bottom:36px}
.month li{display:flex;flex-direction:column;gap:10px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:36px;padding:34px 30px;min-height:430px}
.month small{font-size:20px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#d9cfff}
.month .day{font-size:150px;font-weight:800;line-height:.9;letter-spacing:-.05em}
.month .day i{display:block;font-style:normal;font-size:26px;letter-spacing:0;margin-top:8px;font-weight:700}
.who{align-self:flex-start;margin-top:auto;border-radius:999px;padding:8px 20px;font-size:22px;font-weight:800;background:#fff;color:var(--p7)}
.nos .who{background:var(--p3);color:var(--p9)}
.month li>span:last-child{font-size:24px;line-height:1.4;color:#f1edff;min-height:2.8em}
.month .nos{background:rgba(185,166,255,.22)}
/* passos */
.steps{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:32px;margin-top:auto;margin-bottom:60px}
.steps::before{content:"";position:absolute;left:40px;right:40px;top:40px;border-top:4px dashed var(--p3)}
.steps li{position:relative;display:flex;flex-direction:column;gap:12px}
.dot{display:grid;place-items:center;width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,var(--p6),var(--p3));color:#fff;font-size:30px;font-weight:800;margin-bottom:22px;box-shadow:0 0 0 10px var(--p0)}
.steps b{font-size:32px;font-weight:800;letter-spacing:-.01em;line-height:1.15}.steps span:last-child{font-size:24px;line-height:1.4;color:var(--g)}
.steps li:nth-child(3) .dot{background:var(--p9)}
/* férias */
.trio{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:44px}
.trio li{display:grid;grid-template-columns:230px 1fr;column-gap:30px;align-items:center}
.circ{width:230px;height:230px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center}
.trio .c0 .circ,.trio .circ{background:var(--p1);color:var(--p7)}
.trio li.c0,.trio li.c1,.trio li.c2{background:none;color:inherit}
.trio .c1 .circ{background:var(--p3);color:var(--p9)}.trio .c2 .circ{background:linear-gradient(135deg,var(--p9),var(--p6));color:#fff}
.circ .big{font-size:108px;font-weight:800;line-height:.9;letter-spacing:-.05em}.circ small{font-size:20px;font-weight:700;margin-top:6px}
.trio li>span:last-child{font-size:25px;line-height:1.4;color:var(--g)}
.rules{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:auto;margin-bottom:36px}
.rules div{background:var(--p0);border-radius:36px;padding:32px 38px;display:flex;flex-direction:column;gap:8px}
.rules b{font-size:32px;font-weight:800;letter-spacing:-.01em}.rules span{font-size:25px;line-height:1.4;color:var(--g)}
.alert{color:var(--red);font-style:normal;font-weight:700}
/* multas */
.warn{display:inline-block;width:30px;height:30px;border-radius:50%;background:var(--red);margin-right:26px;vertical-align:.18em}
.tmul .tr{grid-template-columns:52px 400px 1fr 270px}
.tmul .n{background:var(--reds);color:var(--red)}
.tmul .b{font-weight:500;color:var(--g)}
.pen{justify-self:end;background:var(--reds);color:var(--red);border-radius:999px;padding:10px 22px;font-size:26px;white-space:nowrap}
/* checklist */
.chk{display:flex;flex-direction:column;gap:14px}
.chk label{display:grid;grid-template-columns:48px 1fr;column-gap:24px;align-items:center;background:#fff;border-radius:28px;padding:24px 30px;font-size:25px;line-height:1.4;color:var(--g);cursor:pointer}
.chk input{position:absolute;opacity:0}
.chk .box{width:44px;height:44px;border-radius:50%;border:3px solid var(--p6)}
.chk input:checked+.box{background:var(--p6)}
.chk input:focus-visible+.box{outline:3px solid var(--p9);outline-offset:3px}
.chk b{color:var(--ink);font-weight:800;font-size:28px}
/* fim */
.s17 .body{justify-content:center}
.s17 h2{font-size:150px;margin-top:30px}
.btn{align-self:flex-start;margin-top:44px;background:#fff;color:var(--p7);border:0;border-radius:999px;font:800 34px PJS,sans-serif;padding:26px 56px;cursor:pointer;box-shadow:0 18px 40px rgba(20,8,60,.25)}
.btn:focus-visible{outline:4px solid var(--p3);outline-offset:4px}
.ct{font-size:26px;margin-top:40px;color:#f1edff}.ct+.ct{margin-top:6px}
.sig{font-size:22px;margin-top:36px;color:#d9cfff;font-weight:600}
/* celular */
@media (max-width:760px){
  html{background:var(--p0)}
  .deck{width:auto;zoom:1!important}
  .slide{width:auto;height:auto;padding:0 20px 36px;margin:0;border-radius:0}
  .dl{width:200px;height:200px;right:-70px;top:-80px}.dd{width:420px;height:420px;right:-160px;top:20px}
  .top{height:64px;gap:10px}.logo{font-size:16px;gap:8px}.logo svg{width:26px;height:26px}
  .logo span{display:none}.sec{font-size:11px;padding:5px 12px 5px 5px;gap:6px;white-space:nowrap}.sec b{width:22px;height:22px;font-size:10px}
  .foot{display:none}
  .head{margin-top:12px}h2,.split h2{font-size:34px}.lead{font-size:16px;margin-top:10px}
  .pill{font-size:14px;padding:7px 14px}
  .s1 .body{padding-top:30px}.s1 h1{font-size:46px;margin-top:18px}.s1 .from{font-size:17px}
  .data{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 20px;border-radius:22px;margin-top:28px}.data dt{font-size:11px}.data dd{font-size:15px;white-space:normal}.data div:nth-child(1),.data div:nth-child(4){grid-column:1/-1}
  .split .body{display:block}.split .body>div:first-child{margin:12px 0 18px}
  .items li,.chk label{padding:14px 16px;border-radius:20px;grid-template-columns:34px 1fr;column-gap:12px}
  .n{width:32px;height:32px;font-size:14px}.items b{font-size:17px}.items div span{font-size:14px}
  .sum{gap:10px}.sum li{grid-template-columns:48px 1fr;column-gap:14px;font-size:17px;padding:10px 14px 10px 10px;border-radius:20px}.sum .n{width:48px;height:48px;border-radius:14px;font-size:18px}
  .depts{grid-template-columns:1fr;gap:12px;margin-top:20px}.depts li{min-height:0;padding:20px;border-radius:24px}.depts .av{width:48px;height:48px;font-size:17px;margin:0}.depts b{font-size:22px}.depts span:last-child{font-size:15px}
  .contact{grid-template-columns:1fr;gap:12px;padding:18px 20px;border-radius:24px}.contact small{font-size:11px}.contact b{font-size:17px}
  .nums{grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}.nums li{min-height:0;padding:20px;border-radius:24px}.nums .big{font-size:76px}.nums b{font-size:17px}.nums span:last-child{font-size:13px}
  .tbl{margin-top:18px}.th{display:none}
  .tr,.tdocs .tr,.tes .tr,.tmul .tr{grid-template-columns:32px 1fr;column-gap:12px;row-gap:4px;padding:14px 16px;border-radius:20px;margin-top:10px;font-size:14px}
  .tr>*:not(.n){grid-column:2}.tr .n{grid-row:1/span 3;align-self:start}.tr .a{font-size:17px}.tdocs .c{font-size:16px}.sub,.tag{font-size:12px}
  .pen{justify-self:start;font-size:15px;padding:5px 12px}
  .month{grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}.month li{min-height:0;padding:16px;border-radius:22px;gap:6px}.month small{font-size:11px}.month .day{font-size:56px}.month .day i{font-size:14px}.who{font-size:13px;padding:4px 10px;margin-top:6px}.month li>span:last-child{font-size:13px;min-height:0}
  .steps{grid-template-columns:1fr;gap:14px;margin-top:20px}.steps::before{left:25px;right:auto;top:20px;bottom:20px;border-top:0;border-left:3px dashed var(--p3)}
  .steps li{display:grid;grid-template-columns:52px 1fr;column-gap:14px;gap:2px 14px}.dot{grid-row:1/span 2;width:52px;height:52px;font-size:18px;margin:0;box-shadow:0 0 0 6px var(--p0)}.steps b{font-size:17px}.steps span:last-child{font-size:14px}
  .trio{grid-template-columns:1fr;gap:12px;margin-top:18px}.trio li{grid-template-columns:96px 1fr;column-gap:14px}.circ{width:96px;height:96px}.circ .big{font-size:42px}.circ small{font-size:10px}.trio li>span:last-child{font-size:14px}
  .rules{grid-template-columns:1fr;gap:10px;margin-top:16px}.rules div{padding:16px 18px;border-radius:22px}.rules b{font-size:17px}.rules span{font-size:14px}
  .warn{width:16px;height:16px;margin-right:10px}
  .chk{gap:10px}.chk label{font-size:14px}.chk .box{width:28px;height:28px}.chk b{font-size:16px}
  .s17 .body{padding:20px 0}.s17 h2{font-size:52px;margin-top:16px}.btn{font-size:18px;padding:14px 28px;margin-top:22px}.ct{font-size:14px;margin-top:20px}.sig{font-size:13px;margin-top:18px}
}
@page{size:1920px 1080px;margin:0}
@media print{html{background:#fff}.deck{zoom:1!important}.slide{margin:0;break-after:page;page-break-after:always}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Onboarding · Padaria Pão Quente Ltda · Efficio Contabilidade</title>
<!-- Variação B · moderno roxo. Campos do cliente: span.var[data-campo]; linhas condicionais: [data-cond]. Fonte local: Plus Jakarta Sans (OFL). -->
<style>${css}</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9a6ff"/><stop offset="1" stop-color="#ede8ff"/></linearGradient>
<linearGradient id="gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9a6ff" stop-opacity=".55"/><stop offset="1" stop-color="#6d4ce0" stop-opacity=".15"/></linearGradient>
</defs></svg>
<main class="deck">
${S.join('\n')}
</main>
<script>(function(){function z(){var w=innerWidth;document.documentElement.style.setProperty('--z',w>760&&w<1920?w/1920:1)}z();addEventListener('resize',z)})();</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log('ok', OUT, html.length);
