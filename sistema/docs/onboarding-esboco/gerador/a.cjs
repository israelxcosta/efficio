// Variação A — minimalista branco, preto, azul acinzentado e mostarda (inspirada no modelo do dono).
const fs = require('fs');
const path = require('path');
const D = require('./data.cjs');
const { md, CLI } = D;
const OUT = path.join(__dirname, '../onboarding/slides-a.html');

const chev = (n) => `<svg class="chev" viewBox="0 0 156 120" aria-hidden="true"><path d="M58 4 152 60 58 116" fill="none" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M30 4 124 60 30 116" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M2 2 98 60 2 118Z" fill="#111"/><text x="16" y="72" fill="#fff">${String(n).padStart(2, '0')}</text></svg>`;
const brand = `<p class="brand">Efficio Contabilidade · ${CLI}</p>`;
const logo = `<div class="logo"><svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="6" fill="#152b61"/><path d="M11 12h18M11 20h13M11 28h18" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg><b>Efficio</b><span>Contabilidade</span></div>`;
const slide = (n, cls, inner, opts = {}) => `<section class="slide ${cls}" id="s${n}" aria-label="Slide ${n} de ${D.total}">${inner}${opts.noChev ? '' : chev(n)}${opts.noBrand ? '' : brand}</section>`;
const hblock = (t, lead) => `<header class="hb"><h2 class="d blk">${t}</h2><p class="cap">${lead}</p></header>`;

const IC = {
  cycle: '<path d="M62 150a88 88 0 0 1 150-62"/><path d="M214 42v48h-48"/><path d="M238 150a88 88 0 0 1-150 62"/><path d="M86 258v-48h48"/>',
  cal: '<rect x="40" y="62" width="220" height="196" rx="20"/><path d="M40 116h220M96 34v52M204 34v52"/><text x="150" y="226" text-anchor="middle">10</text>',
  warn: '<path d="M150 42 268 248H32Z" stroke-linejoin="round"/><path d="M150 112v72"/><circle cx="150" cy="218" r="6" fill="currentColor"/>',
  chat: '<path d="M64 66h172a22 22 0 0 1 22 22v104a22 22 0 0 1-22 22H128l-52 42v-42H64a22 22 0 0 1-22-22V88a22 22 0 0 1 22-22Z" stroke-linejoin="round"/><circle cx="104" cy="140" r="5" fill="currentColor"/><circle cx="150" cy="140" r="5" fill="currentColor"/><circle cx="196" cy="140" r="5" fill="currentColor"/>',
};
const icon = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 300 300" aria-hidden="true">${IC[k]}</svg>`;
const sq = (k, label = '', mod = '') => `<div class="sq ${mod}" aria-hidden="true"><div class="b">${label ? `<span class="d">${label}</span>` : ''}</div>${icon(k)}<div class="m"></div></div>`;

const table = (o, mod) => `<div class="tbl ${mod}" role="table"><div class="tr th" role="row"><span></span>${o.head.map((h) => `<span role="columnheader">${h}</span>`).join('')}</div>${o.rows.map((r, i) => `<div class="tr" role="row"${r[4] ? ` data-cond="${r[4]}"` : ''}><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="a">${r[0]}${r[3] ? `<em class="${r[4] ? 'tag' : 'sub'}">${r[3]}</em>` : ''}</span><span class="b">${md(r[1])}</span><span class="c">${md(r[2])}</span></div>`).join('')}</div>`;

const S = [];
// 1 Capa
S.push(slide(1, 's1', `<div class="l">${logo}<h1 class="d">On<br>boar<br>ding</h1><div class="bar"></div><p class="who d">${CLI}</p><ul class="cap">${D.cover.data.map(([k, v]) => `<li>${k === 'Regime' || k === 'Equipe' ? '' : k + ' '}${v}</li>`).join('')}</ul></div>
<div class="art" aria-hidden="true"><svg viewBox="0 0 960 1080" preserveAspectRatio="xMidYMid slice"><rect width="960" height="1080" fill="#23262b"/><rect x="560" y="0" width="300" height="600" fill="#7aa6bf" opacity=".78"/>
<rect x="110" y="700" width="300" height="300" fill="#f3d488"/>
<g fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"><path d="M250 400H690L726 486H214Z"/><path d="M214 486a51.5 40 0 0 0 103 0a51.5 40 0 0 0 103 0a51.5 40 0 0 0 103 0a51.5 40 0 0 0 103 0a51.5 40 0 0 0 103 0"/><path d="M244 520V860M696 520V860"/><rect x="290" y="620" width="130" height="240"/><rect x="480" y="620" width="170" height="140"/><path d="M506 726q0-52 59-52t59 52Z"/><path d="M548 690l-10 22M572 686l-8 26M596 690l-6 22"/><path d="M380 330h180v70H380z"/><path d="M150 860H810"/></g>
</svg></div>`, { noChev: true, noBrand: true }));

// 2 Sumário
S.push(slide(2, 's2 g2', `<div><div class="duo" aria-hidden="true"><div class="b"></div><div class="m"></div></div><h2 class="d over">Sumário</h2><p class="cap">${D.sumario.lead}</p></div>
<ol class="sum">${D.sumario.items.map((t, i) => `<li><span class="d n">${String(i + 1).padStart(2, '0')}</span><span class="d t">${t}</span></li>`).join('')}</ol>`));

// 3 Como trabalhamos
S.push(slide(3, 's3 g2', `${sq('cycle')}<div><h2 class="d">Como trabalhamos juntos</h2><p class="cap lead">${D.como.lead}</p>
<ul class="items">${D.como.items.map(([a, b]) => `<li><b class="d">${a}</b><span>${b}</span></li>`).join('')}</ul></div>`));

// 4 Time e canais
const T = D.time;
S.push(slide(4, 's4', `<div class="left"><div class="band"><h2 class="d">Seu time<br>e canais</h2></div><div class="av av-main" aria-hidden="true">${icon('chat')}</div>
<p class="cap lead">${T.lead}</p><div class="card main"><b class="d">WhatsApp do escritório</b><span class="big">${T.whats}</span><hr><span>${T.email}</span><span>Atendimento: ${T.horario}</span></div></div>
<ul class="depts">${T.depts.map(([ini, n, d], i) => `<li><span class="av d av${i}" aria-hidden="true">${ini}</span><div><b class="d">${n}</b><hr><span>${d}</span></div></li>`).join('')}</ul>`));

// 5 Números
S.push(slide(5, 's5', `<header><h2 class="d">Suas obrigações em números</h2><p class="cap">${D.numeros.lead}</p></header>
<ul class="nums">${D.numeros.items.map(([n, l, d], i) => `<li class="${i === 3 ? 'hl' : ''}"><span class="d big">${n}</span><b class="d">${l}</b><span>${d}</span></li>`).join('')}</ul>`));

// 6-8 tabelas
for (const [n, k] of [[6, 'fiscal'], [7, 'contabil'], [8, 'pessoal']]) S.push(slide(n, 'st', hblock(D[k].title, D[k].lead) + table(D[k], 't3')));

// 9 Mês
S.push(slide(9, 's9', `<header><h2 class="d">Seu mês em uma linha</h2><p class="cap">${D.mes.lead}</p></header>
<ol class="tl">${D.mes.items.map(([pre, big, post, who, what, w], i) => `<li class="${i % 2 ? 'dn' : 'up'} ${w}" style="grid-column:${i + 1}"><b class="d dt">${pre} ${big}${post ? ' ' + post : ''}</b><div class="box"><b class="d">${who}</b><span>${what}</span></div></li>`).join('')}</ol>`));

// 10 Documentos
S.push(slide(10, 'st', hblock(D.docs.title, D.docs.lead) + table(D.docs, 'tdocs')));

// 11 Registro
S.push(slide(11, 's11 g2', `<div><h2 class="d">Registro de empregado</h2><p class="cap lead">${D.registro.lead}</p></div>
<ol class="vf">${D.registro.items.map(([a, b], i) => `<li class="${i === 2 ? 'hl' : ''}"><b class="d">${a}</b><span>${b}</span></li>`).join('')}</ol>`));

// 12 Férias
S.push(slide(12, 's12', hblock('Férias', D.ferias.lead) + `<ol class="trio">${D.ferias.trio.map(([n, t], i) => `<li class="${i === 2 ? 'hl' : ''}"><span class="d big">${n}</span><b class="d">dias antes</b><span>${t}</span></li>`).join('')}</ol>
<div class="rules">${D.ferias.rules.map(([a, b]) => `<div><b class="d">${a}</b><span>${b}</span></div>`).join('')}</div>`));

// 13 Rescisão
S.push(slide(13, 's13 g2', `${sq('cal', 'Rescisão', 'lbl')}<div><h2 class="d st2">${D.rescisao.lead}</h2>
<ul class="items sm">${D.rescisao.items.map(([a, b]) => `<li><b class="d">${a}</b><span>${b}</span></li>`).join('')}</ul></div>`));

// 14 eSocial
S.push(slide(14, 'st', hblock(D.esocial.title, D.esocial.lead) + table(D.esocial, 'tes')));

// 15 Multas
S.push(slide(15, 's15 g2', `<div><h2 class="d">Atenção:<br>multas</h2><p class="cap lead">${D.multas.lead}</p>${sq('warn', '', 'alert')}</div>
<ul class="mul">${D.multas.rows.map(([a, b, p]) => `<li><div><b class="d">${a}</b><span>${b}</span></div><strong class="d pen">${p}</strong></li>`).join('')}</ul>`));

// 16 Primeiros passos
S.push(slide(16, 's16 g2', `<div><h2 class="d">Primeiros passos</h2><p class="cap lead">${D.passos.lead}</p><div class="duo sm" aria-hidden="true"><div class="b"></div><div class="m"></div></div></div>
<ul class="chk">${D.passos.items.map(([a, b]) => `<li><label><input type="checkbox"><span class="box" aria-hidden="true"></span><span><b class="d">${a}</b> ${b}</span></label></li>`).join('')}</ul>`));

// 17 Fim
S.push(slide(17, 's17', `${logo}<div class="band"><p class="d">Bem-vindos!</p></div><div class="r"><h2 class="d">Li e entendi</h2><p class="cap lead">${D.fim.lead}</p>
<button type="button" class="btn d">Confirmar leitura</button><p class="ct"><b>Dúvidas?</b> WhatsApp ${T.whats} · ${T.email}</p><p class="ct">Atendimento de ${T.horario}</p><p class="cap sig">Efficio Contabilidade · ${D.fim.crc}</p></div>`, { noBrand: true }));

const F = (w) => `url(fonts/barlow-condensed-latin-${w}-normal.woff2) format('woff2')`;
const css = `
${[300, 400, 600, 700, 800, 900].map((w) => `@font-face{font-family:BC;src:${F(w)};font-weight:${w};font-display:block}`).join('')}
@font-face{font-family:PJS;src:url(fonts/plus-jakarta-sans-latin-wght-normal.woff2) format('woff2');font-weight:200 800;font-display:block}
:root{--ink:#111;--g:#474c55;--bl:#7aa6bf;--bar:#2f6f94;--mu:#f3d488;--line:#8d9096;--red:#cc3333;--navy:#152b61}
*{box-sizing:border-box;margin:0;padding:0}
html{background:#d9dbdf}
body{font-family:PJS,system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.deck{width:1920px;zoom:var(--z,1)}
.slide{position:relative;width:1920px;height:1080px;overflow:hidden;background:#fff;padding:104px 260px 120px 120px;margin-bottom:24px}
ul,ol{list-style:none}
.d{font-family:BC,sans-serif;font-weight:800;text-transform:uppercase;line-height:.9;letter-spacing:0}
.cap{font-family:BC,sans-serif;font-weight:300;text-transform:uppercase;letter-spacing:.02em;line-height:1.28;font-size:30px;color:#1d1f23}
h2.d{font-size:112px}
strong{white-space:nowrap;font-weight:700;background:linear-gradient(transparent 58%,var(--mu) 58%);padding:0 2px}
.chev{position:absolute;right:52px;top:480px;width:156px;height:120px}
.chev text{font:800 34px BC,sans-serif}
.brand{position:absolute;left:120px;bottom:44px;font:400 19px BC,sans-serif;text-transform:uppercase;letter-spacing:.14em;color:var(--g)}
.logo{display:flex;align-items:center;gap:12px;font-size:26px;letter-spacing:-.01em}
.logo svg{width:40px;height:40px}.logo b{font-weight:800;color:var(--navy)}.logo span{color:var(--g)}
.g2{display:grid;grid-template-columns:620px 1fr;column-gap:100px;align-items:center}
.lead{margin-top:28px}
.var{}
/* quadrados sobrepostos + ícone */
.sq{position:relative;width:600px;height:640px}
.sq .b{position:absolute;left:0;top:0;width:410px;height:410px;background:var(--bl)}
.sq .b span{position:absolute;left:34px;top:30px;font-size:60px}
.sq .ic{position:absolute;left:120px;top:150px;width:330px;height:330px;fill:none;stroke:var(--ink);stroke-width:22;stroke-linecap:round;color:var(--ink)}
.sq .ic text{font:800 92px BC,sans-serif;fill:var(--ink);stroke:none}
.sq .m{position:absolute;left:220px;top:300px;width:340px;height:340px;background:var(--mu);opacity:.85;mix-blend-mode:multiply}
.sq.alert{width:420px;height:400px;margin-top:56px}
.sq.alert .b{display:none}.sq.alert .ic{left:0;top:30px;width:300px;height:300px;stroke:var(--red);color:var(--red)}.sq.alert .m{left:150px;top:120px;width:250px;height:250px}
.duo{position:relative;width:560px;height:460px}
.duo .b{position:absolute;left:0;top:0;width:420px;height:400px;background:var(--bl)}
.duo .m{position:absolute;left:280px;top:220px;width:280px;height:240px;background:var(--mu);opacity:.85;mix-blend-mode:multiply}
.duo.sm{width:360px;height:250px;margin-top:70px}.duo.sm .b{width:220px;height:200px}.duo.sm .m{left:140px;top:100px;width:200px;height:150px}
/* 1 capa */
.s1{padding:0;display:grid;grid-template-columns:960px 960px}
.s1 .l{position:relative;padding:76px 80px 0 120px;display:flex;flex-direction:column;align-items:flex-end;text-align:right}
.s1 .logo{align-self:flex-start}
.s1 h1{font-size:200px;line-height:.84;margin-top:46px}
.s1 .bar{align-self:stretch;height:9px;background:var(--bar);margin:40px -80px 0 -120px;width:auto}
.s1 .who{font-size:54px;margin-top:40px}
.s1 ul{margin-top:18px;font-size:29px;line-height:1.36}
.s1 .art svg{display:block;width:960px;height:1080px}
/* 2 sumário */
.s2 .duo{margin-bottom:-170px}
.s2 .over{position:relative;font-size:150px;margin-left:36px}
.s2 .cap{margin-top:120px;max-width:560px}
.sum li{display:grid;grid-template-columns:130px 1fr;align-items:baseline;padding:30px 0;border-top:3px dotted var(--ink)}
.sum li:last-child{border-bottom:3px dotted var(--ink)}
.sum .n{font-size:84px}.sum .t{font-size:50px;font-weight:700;line-height:1}
/* 3 e 13 */
.s3 h2{font-size:104px}
.items{margin-top:44px}
.items li{display:flex;flex-direction:column;gap:6px;padding:16px 0}
.items b{font-size:40px}.items span{font-size:26px;line-height:1.35;color:#2a2d33}
.items.sm{margin-top:36px}.items.sm li{padding:12px 0}.items.sm b{font-size:34px}.items.sm span{font-size:24px}
.s13 .st2{font-size:88px;line-height:.92}
/* 4 time */
.s4{padding:0}
.s4 .left{position:absolute;left:0;top:0;width:960px;height:1080px}
.s4 .band{position:absolute;left:0;top:290px;width:620px;height:330px;background:var(--bl);display:flex;align-items:flex-end;justify-content:flex-end;padding:0 36px 28px 0}
.s4 .band h2{font-size:104px;text-align:right}
.s4 .av-main{position:absolute;left:620px;top:290px;width:330px;height:330px;background:var(--mu);display:grid;place-items:center}
.s4 .av-main .ic{width:230px;height:230px;fill:none;stroke:var(--ink);stroke-width:18;color:var(--ink)}
.s4 .lead{position:absolute;left:120px;top:660px;width:440px;margin:0;font-size:28px}
.s4 .card{position:absolute;left:620px;top:660px;width:330px;display:flex;flex-direction:column;gap:6px;font-size:22px;line-height:1.35}
.card b{font-size:36px}.card .big{font-size:30px;font-weight:800;margin-top:4px}
hr{border:0;border-top:2px solid var(--ink);margin:10px 0 6px}
.depts{position:absolute;left:1060px;top:190px;width:600px;display:flex;flex-direction:column;gap:64px}
.depts li{display:grid;grid-template-columns:170px 1fr;column-gap:36px;align-items:center}
.depts .av{width:170px;height:170px;display:grid;place-items:center;font-size:76px}
.av0{background:var(--bl)}.av1{background:var(--mu)}.av2{background:#23262b;color:#fff}
.depts b{font-size:44px}.depts span{font-size:23px;line-height:1.35}
/* 5 números */
.s5 .cap{margin-top:24px}
.nums{display:grid;grid-template-columns:repeat(4,1fr);column-gap:28px;margin-top:84px}
.nums li{display:flex;flex-direction:column;gap:14px;padding:6px 28px 36px;border-left:3px dotted var(--ink)}
.nums .big{font-size:300px;line-height:.8;font-weight:900}
.nums b{font-size:42px;margin-top:22px}.nums span:last-child{font-size:24px;line-height:1.35}
.nums .hl{background:var(--mu);border:0;padding-top:30px}
/* tabelas */
.hb{display:flex;align-items:flex-end;gap:56px}
.blk{background:var(--bl);padding:30px 46px 22px;font-size:96px;flex:none}
.hb .cap{max-width:780px;padding-bottom:6px}
.tbl{margin-top:56px}
.tr{display:grid;grid-template-columns:64px 390px 440px 1fr;column-gap:36px;align-items:baseline;padding:25px 0;border-top:3px dotted var(--ink)}
.tr:last-child{border-bottom:3px dotted var(--ink)}
.th{border:0;padding:0 0 12px;font:400 20px BC,sans-serif;text-transform:uppercase;letter-spacing:.14em;color:var(--g)}
.tr .n{font:800 30px BC,sans-serif}
.tr .a{font:800 40px/1 BC,sans-serif;text-transform:uppercase}
.tr .b{font:600 31px/1.15 BC,sans-serif;text-transform:uppercase}
.tr .c{font-size:26px;line-height:1.35}
.sub{display:block;font:400 22px BC,sans-serif;font-style:normal;color:var(--g);margin-top:6px}
.tag{display:inline-block;font:600 18px BC,sans-serif;font-style:normal;letter-spacing:.06em;border:2px solid var(--ink);padding:3px 10px 2px;margin-top:10px}
.tdocs .tr{grid-template-columns:64px 400px 1fr 300px}
.tdocs .c{font:800 36px/1 BC,sans-serif;text-transform:uppercase}
.tdocs .b{font:26px/1.35 PJS,sans-serif;text-transform:none}
.tes .tr{grid-template-columns:64px 520px 380px 1fr}
.tes .b{font:600 25px BC,sans-serif;letter-spacing:.04em}
.tes .c{font:600 29px/1.15 BC,sans-serif;text-transform:uppercase}
/* 9 linha do tempo */
.s9 .cap{margin-top:24px}
.tl{position:relative;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:auto auto;column-gap:24px;row-gap:150px;margin-top:40px}
.tl::before{content:"";position:absolute;left:0;right:20px;top:calc(50% - 2px);border-top:3px dotted var(--ink)}
.tl::after{content:"";position:absolute;right:4px;top:calc(50% - 10px);border:9px solid transparent;border-left:16px solid var(--ink)}
.tl li{position:relative;display:flex;flex-direction:column;gap:12px}
.tl .up{grid-row:1;justify-content:flex-end}.tl .dn{grid-row:2}
.tl li::before{content:"";position:absolute;left:40px;height:75px;border-left:3px dotted var(--ink)}
.tl .up::before{bottom:-75px}.tl .dn::before{top:-75px}
.tl li::after{content:"";position:absolute;left:34px;width:15px;height:15px;border-radius:50%;background:var(--ink)}
.tl .up::after{bottom:-83px}.tl .dn::after{top:-83px}
.tl .dt{font-size:46px}
.tl .box{border:2px solid var(--line);padding:22px 24px 24px;display:flex;flex-direction:column;gap:10px;height:184px}
.tl .box b{font-size:31px}.tl .box span{font-size:24px;line-height:1.35}
.tl .nos .box{background:var(--mu);border-color:var(--mu)}
/* 11 vertical */
.s11 h2{font-size:124px}
.vf{position:relative;padding-left:56px;border-left:3px dotted var(--ink);margin-left:10px}
.vf li{position:relative;display:flex;flex-direction:column;gap:8px;padding:22px 0}
.vf li::before{content:"";position:absolute;left:-66px;top:30px;width:17px;height:17px;border-radius:50%;background:var(--ink)}
.vf::after{content:"";position:absolute;left:-12px;bottom:-14px;border:10px solid transparent;border-top:16px solid var(--ink)}
.vf b{font-size:40px}.vf span{font-size:25px;line-height:1.35}
.vf .hl{background:var(--mu);padding:26px 34px;margin:10px 0}
.vf .hl::before{left:-66px;top:34px}
/* 12 férias */
.trio{position:relative;display:grid;grid-template-columns:repeat(3,1fr);column-gap:28px;margin-top:64px;padding-top:34px;border-top:3px dotted var(--ink)}
.trio::after{content:"";position:absolute;right:-4px;top:-11px;border:9px solid transparent;border-left:16px solid var(--ink)}
.trio li{display:flex;flex-direction:column;gap:8px;padding:0 28px 28px 0}
.trio .big{font-size:210px;line-height:.82;font-weight:900}
.trio b{font-size:40px;margin-top:10px}.trio span:last-child{font-size:24px;line-height:1.35}
.trio .hl{background:var(--mu);padding:24px 28px 28px}
.rules{display:grid;grid-template-columns:1fr 1fr;column-gap:28px;margin-top:40px}
.rules div{border:2px solid var(--line);padding:24px 28px;display:flex;flex-direction:column;gap:8px}
.rules b{font-size:32px}.rules span{font-size:23px;line-height:1.35}
.alert{color:var(--red);font-style:normal;font-weight:700}
/* 15 multas */
.s15{align-items:start}
.s15 h2{font-size:150px}
.mul li{display:grid;grid-template-columns:1fr 290px;column-gap:28px;align-items:center;padding:22px 0;border-top:3px dotted var(--ink)}
.mul li:last-child{border-bottom:3px dotted var(--ink)}
.mul li div{display:flex;flex-direction:column;gap:6px}
.mul b{font-size:34px}.mul span{font-size:22px;line-height:1.35}
.pen{background:none;padding:0;color:var(--red);font-size:42px;font-weight:800;text-align:right;line-height:1;white-space:nowrap}
/* 16 checklist */
.s16 h2{font-size:136px}
.chk li{border-top:3px dotted var(--ink)}.chk li:last-child{border-bottom:3px dotted var(--ink)}
.chk label{display:grid;grid-template-columns:52px 1fr;column-gap:26px;align-items:start;padding:26px 0;font-size:25px;line-height:1.35;cursor:pointer}
.chk input{position:absolute;opacity:0}
.chk .box{width:44px;height:44px;border:3px solid var(--ink);margin-top:2px}
.chk input:checked+.box{background:var(--ink)}
.chk input:focus-visible+.box{outline:3px solid var(--bar);outline-offset:3px}
.chk b{font-size:34px;margin-right:6px}
/* 17 fim */
.s17 .logo{position:absolute;left:120px;top:76px}
.s17 .band{position:absolute;left:0;top:380px;width:1060px;height:320px;background:var(--bl);display:flex;align-items:center;justify-content:flex-end;padding-right:64px}
.s17 .band p{font-size:170px}
.s17 .r{position:absolute;left:1140px;top:240px;width:520px}
.s17 h2{font-size:124px}
.btn{margin-top:40px;background:var(--ink);color:#fff;border:0;font-size:34px;padding:22px 40px 20px;cursor:pointer}
.btn:focus-visible{outline:4px solid var(--bar);outline-offset:4px}
.ct{font-size:22px;line-height:1.4;margin-top:16px}.ct+.ct{margin-top:4px}
.sig{font-size:22px;margin-top:40px;color:var(--g)}
/* celular */
@media (max-width:760px){
  html{background:#fff}
  .deck{width:auto;zoom:1!important}
  .slide{width:auto;height:auto;padding:48px 22px 44px;margin:0;border-bottom:1px solid #e3e4e7}
  .slide>*{position:static!important}
  .g2,.s1,.s15{display:block}
  .chev{position:absolute!important;right:14px;top:16px;width:52px;height:40px}
  .brand{display:none}
  .d{line-height:.92}h2.d,.s3 h2,.s11 h2,.s16 h2,.s15 h2{font-size:46px}
  .cap{font-size:17px}.lead{margin-top:14px}
  .logo{font-size:16px;gap:8px}.logo svg{width:26px;height:26px}
  .s1 .l{padding:22px 22px 30px;align-items:flex-end}
  .s1 h1{font-size:92px;margin-top:26px}
  .s1 .bar{height:6px;margin:22px -22px 0}
  .s1 .who{font-size:28px;margin-top:22px}.s1 ul{font-size:16px;margin-top:10px}
  .s1{padding:0!important}.s1 .art svg{width:100%;height:340px}
  .sq{width:300px;height:300px;margin:0 0 22px}.sq .b{width:200px;height:200px}.sq .b span{font-size:30px;left:16px;top:14px}
  .sq .ic{left:58px;top:72px;width:165px;height:165px}.sq .m{left:110px;top:140px;width:170px;height:160px}
  .sq.alert{width:200px;height:190px;margin-top:24px}.sq.alert .ic{width:150px;height:150px;top:10px}.sq.alert .m{left:76px;top:60px;width:124px;height:124px}
  .duo{width:260px;height:200px}.duo .b{width:190px;height:180px}.duo .m{left:130px;top:100px;width:130px;height:100px}
  .s2 .duo{margin-bottom:-90px}.s2 .over{font-size:64px;margin-left:16px}.s2 .cap{margin:52px 0 14px}
  .sum .n{font-size:34px}.sum .t{font-size:22px}.sum li{grid-template-columns:56px 1fr;padding:14px 0;border-width:2px}
  .items{margin-top:18px}.items li{padding:9px 0}.items b,.items.sm b{font-size:20px}.items span,.items.sm span{font-size:15px}
  .s13 .st2{font-size:34px}
  .s4 .band{width:auto;height:auto;margin:0 -22px;padding:60px 22px 16px}.s4 .band h2{font-size:46px}
  .s4 .av-main{width:120px;height:120px;margin-top:-60px;margin-left:auto}.s4 .av-main .ic{width:84px;height:84px}
  .s4 .lead{width:auto;font-size:17px}.s4 .card{width:auto;margin-top:16px;font-size:15px}.card b{font-size:22px}.card .big{font-size:20px}
  .depts{width:auto;margin-top:26px;gap:18px}.depts li{grid-template-columns:72px 1fr;column-gap:16px}.depts .av{width:72px;height:72px;font-size:32px}.depts b{font-size:22px}.depts span{font-size:15px}
  .nums{grid-template-columns:1fr 1fr;gap:18px 12px;margin-top:26px}.nums li{padding:4px 12px 14px;gap:6px}.nums .big{font-size:96px}.nums b{font-size:20px;margin-top:6px}.nums span:last-child{font-size:14px}
  .hb{display:block}.blk{display:inline-block;font-size:44px;padding:14px 20px 10px}.hb .cap{margin-top:14px}
  .tbl{margin-top:22px}.th{display:none}
  .tr,.tdocs .tr,.tes .tr{grid-template-columns:34px 1fr;column-gap:10px;row-gap:5px;padding:14px 0;border-width:2px}
  .tr>span:not(.n){grid-column:2}.tr .n{grid-row:1/span 3;font-size:17px}
  .tr .a,.tdocs .c{font-size:21px}.tr .b,.tes .c{font-size:17px}.tr .c,.tdocs .b{font-size:15px}.tes .b{font-size:15px}
  .tag{font-size:13px}.sub{font-size:15px}
  .tl{display:block;margin-top:22px}.tl::before,.tl::after,.tl li::before,.tl li::after{display:none}
  .tl li{margin-bottom:16px}.tl .dt{font-size:24px}.tl .box{height:auto;padding:14px 16px}.tl .box b{font-size:18px}.tl .box span{font-size:15px}
  .vf{margin:22px 0 0 6px;padding-left:28px}.vf li{padding:12px 0}.vf li::before{left:-37px;top:18px;width:13px;height:13px}.vf .hl{padding:14px 16px}.vf .hl::before{left:-37px;top:20px}.vf b{font-size:22px}.vf span{font-size:15px}
  .trio{grid-template-columns:repeat(3,1fr);column-gap:8px;margin-top:24px;padding-top:16px}.trio li{padding:0 4px 10px 0}.trio .hl{padding:10px}
  .trio .big{font-size:80px}.trio b{font-size:16px}.trio span:last-child{font-size:13px}
  .rules{grid-template-columns:1fr;row-gap:12px;margin-top:20px}.rules div{padding:14px 16px}.rules b{font-size:19px}.rules span{font-size:15px}
  .mul{margin-top:10px}.mul li{grid-template-columns:1fr 92px;column-gap:10px;padding:14px 0}.mul b{font-size:20px}.mul span{font-size:14px}.pen{font-size:21px}
  .chk{margin-top:12px}.chk label{grid-template-columns:30px 1fr;column-gap:12px;padding:14px 0;font-size:15px}.chk .box{width:26px;height:26px}.chk b{font-size:20px}
  .duo.sm{display:none}
  .s17 .logo{margin-bottom:24px}.s17 .band{width:auto;height:auto;margin:0 -22px;padding:30px 22px;justify-content:flex-end}.s17 .band p{font-size:56px}
  .s17 .r{width:auto;margin-top:26px}.s17 h2{font-size:52px}.btn{font-size:20px;padding:14px 22px 12px;margin-top:20px}.ct{font-size:15px}.sig{font-size:15px;margin-top:20px}
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
<!-- Variação A · minimalista branco/preto com azul acinzentado e mostarda. Campos do cliente: span.var[data-campo]; linhas condicionais: [data-cond]. Fontes locais: Barlow Condensed (OFL) e Plus Jakarta Sans (OFL). -->
<style>${css}</style>
</head>
<body>
<main class="deck">
${S.join('\n')}
</main>
<script>(function(){function z(){var w=innerWidth;document.documentElement.style.setProperty('--z',w>760&&w<1920?w/1920:1)}z();addEventListener('resize',z)})();</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log('ok', OUT, html.length);
