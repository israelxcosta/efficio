(function () {
  var P = window.PontoCalc;
  var fmt = P.formatar;
  var WHATSAPP = "5519996859637";
  var STORAGE = "efficio-ponto-v1";
  var NOMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  var CAMPOS = ["tipo", "e1", "s1", "e2", "s2", "previsto"];

  var form = document.getElementById("ponto-form");
  var lista = document.getElementById("dias");
  var tpl = document.getElementById("tpl-dia");
  var linhas = [];

  NOMES.forEach(function (nome, i) {
    var linha = tpl.content.firstElementChild.cloneNode(true);
    linha.querySelector(".dia__nome").textContent = nome;
    linha.querySelectorAll("[data-campo]").forEach(function (el) {
      el.id = "d" + i + "-" + el.dataset.campo;
    });
    lista.appendChild(linha);
    linhas.push(linha);
  });

  function campo(i, nome) { return linhas[i].querySelector('[data-campo="' + nome + '"]'); }

  // Modelos de jornada ------------------------------------------------
  function dia(tipo, e1, s1, e2, s2, previsto) {
    return { tipo: tipo, e1: e1 || "", s1: s1 || "", e2: e2 || "", s2: s2 || "", previsto: previsto || "" };
  }
  var FOLGA = dia("folga");
  var MODELOS = {
    "44-5": { limite: 44, dias: repetir(dia("trabalho", "08:00", "12:00", "13:00", "17:48", "08:48"), 5, [FOLGA, FOLGA]) },
    "44-6": { limite: 44, dias: repetir(dia("trabalho", "08:00", "12:00", "13:00", "17:00", "08:00"), 5,
      [dia("trabalho", "08:00", "12:00", "", "", "04:00"), FOLGA]) },
    "40-5": { limite: 40, dias: repetir(dia("trabalho", "08:00", "12:00", "13:00", "17:00", "08:00"), 5, [FOLGA, FOLGA]) },
    "36-6": { limite: 36, dias: repetir(dia("trabalho", "08:00", "12:00", "12:15", "14:15", "06:00"), 6, [FOLGA]) },
    "noturno": { limite: 44, dias: repetir(dia("trabalho", "22:00", "02:00", "03:00", "06:00", "08:00"), 5, [FOLGA, FOLGA]) },
    "vazio": { limite: 44, dias: repetir(dia("trabalho"), 5, [FOLGA, FOLGA]) }
  };
  function repetir(d, n, resto) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(d);
    return out.concat(resto);
  }

  function preencherDias(dias) {
    dias.forEach(function (d, i) {
      CAMPOS.forEach(function (c) { campo(i, c).value = d[c] || (c === "tipo" ? "trabalho" : ""); });
    });
  }

  function aplicarModelo(chave) {
    var m = MODELOS[chave];
    preencherDias(m.dias);
    form.limiteSemanal.value = m.limite;
    form.divisor.value = m.limite * 5;
    atualizar();
  }

  // Leitura e gravação do estado --------------------------------------
  function lerDias() {
    return linhas.map(function (_, i) {
      var d = {};
      CAMPOS.forEach(function (c) { d[c] = campo(i, c).value; });
      return d;
    });
  }

  function numero(txt) {
    if (txt === null || txt === undefined) return 0;
    var s = String(txt).trim().replace(/[R$\s]/g, "");
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function lerOpcoes() {
    return {
      tipoTrabalhador: form.tipoTrabalhador.value,
      tolerancia: form.tolerancia.checked,
      prorrogacao: form.prorrogacao.checked,
      intervaloReduzido: form.intervaloReduzido.checked,
      limiteSemanal: Math.round(numero(form.limiteSemanal.value) * 60),
      nomesDias: NOMES
    };
  }

  function lerValores() {
    return {
      salario: numero(form.salario.value),
      divisor: numero(form.divisor.value),
      he50: numero(form.he50.value),
      he100: numero(form.he100.value),
      noturno: numero(form.noturno.value),
      intervalo: numero(form.intervalo.value)
    };
  }

  var GERAIS = ["modelo", "limiteSemanal", "tipoTrabalhador", "tolerancia", "prorrogacao", "intervaloReduzido",
    "salario", "divisor", "he50", "he100", "noturno", "intervalo"];

  function salvar() {
    var estado = { dias: lerDias(), gerais: {} };
    GERAIS.forEach(function (n) {
      var el = document.getElementById(n);
      estado.gerais[n] = el.type === "checkbox" ? el.checked : el.value;
    });
    try { localStorage.setItem(STORAGE, JSON.stringify(estado)); } catch (e) { /* armazenamento indisponível */ }
  }

  function carregar() {
    var estado = null;
    try { estado = JSON.parse(localStorage.getItem(STORAGE)); } catch (e) { estado = null; }
    if (!estado || !estado.dias || estado.dias.length !== 7) return false;
    preencherDias(estado.dias);
    GERAIS.forEach(function (n) {
      var el = document.getElementById(n);
      if (!(n in estado.gerais)) return;
      if (el.type === "checkbox") el.checked = !!estado.gerais[n];
      else el.value = estado.gerais[n];
    });
    return true;
  }

  // Renderização -------------------------------------------------------
  var moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var ultimo = null;

  function card(rotulo, valor, detalhe, destaque) {
    return '<div class="card' + (destaque ? " card--destaque" : "") + '">' +
      '<span class="card__rotulo">' + rotulo + "</span>" +
      '<strong class="card__valor">' + valor + "</strong>" +
      (detalhe ? '<span class="card__detalhe">' + detalhe + "</span>" : "") +
      "</div>";
  }

  function escapar(txt) {
    return String(txt).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function atualizar() {
    var opcoes = lerOpcoes();
    var r = P.calcularSemana(lerDias(), opcoes);
    var t = r.totais;
    var valores = P.calcularValores(t, lerValores());
    ultimo = { r: r, valores: valores, opcoes: opcoes };

    // Linhas dos dias
    r.dias.forEach(function (d, i) {
      var linha = linhas[i];
      linha.classList.toggle("dia--folga", d.tipo !== "trabalho");
      linha.classList.toggle("dia--erro", d.erros.length > 0);
      var partes = [];
      if (d.erros.length) {
        partes.push('<span class="tag tag--erro">Verifique os horários</span>');
      } else if (d.relogio > 0) {
        partes.push('<span class="dia__total">' + fmt(d.computado) + "</span>");
        if (d.extras50 > 0) partes.push('<span class="tag tag--extra">+' + fmt(d.extras50) + " extra</span>");
        if (d.extras100 > 0) partes.push('<span class="tag tag--extra">' + fmt(d.extras100) + " a 100%</span>");
        if (d.faltantes > 0) partes.push('<span class="tag">-' + fmt(d.faltantes) + "</span>");
        if (d.noturnoComputado > 0) partes.push('<span class="tag tag--noite">' + fmt(d.noturnoComputado) + " noturna</span>");
        if (d.intervaloSuprimido > 0) partes.push('<span class="tag tag--alerta">intervalo -' + fmt(d.intervaloSuprimido) + "</span>");
        if (d.interjornadaSuprimida > 0) partes.push('<span class="tag tag--alerta">interjornada -' + fmt(d.interjornadaSuprimida) + "</span>");
      } else {
        partes.push('<span class="dia__vazio">' + (d.tipo === "trabalho" ? "Sem horários" : "Descanso") + "</span>");
      }
      linha.querySelector(".dia__resumo").innerHTML = partes.join("");
      linhas[i].querySelectorAll("input[type=time]").forEach(function (inp) {
        if (inp.dataset.campo !== "previsto") inp.classList.toggle("is-invalid", d.erros.length > 0);
      });
      campo(i, "previsto").disabled = d.tipo !== "trabalho";
    });

    // Cards de resumo
    var noturnaDetalhe = t.noturnoRelogio > 0 && Math.abs(t.noturnoComputado - t.noturnoRelogio) > 0.5
      ? fmt(t.noturnoRelogio) + " de relógio (hora reduzida)" : "período noturno";
    document.getElementById("cards").innerHTML =
      card("Horas trabalhadas", fmt(t.computado), t.diasTrabalhados + (t.diasTrabalhados === 1 ? " dia" : " dias") + " na semana") +
      card("Horas normais", fmt(t.normais), "limite de " + fmt(t.limiteSemanal)) +
      card("Horas extras 50%", fmt(t.extras50),
        t.extrasSemanais > 0 ? fmt(t.extrasSemanais) + " pelo limite semanal" : "excedente da jornada", t.extras50 > 0) +
      card("Horas extras 100%", fmt(t.extras100), "folgas e feriados", t.extras100 > 0) +
      card("Horas noturnas", fmt(t.noturnoComputado), noturnaDetalhe, t.noturnoComputado > 0) +
      card("Intervalo suprimido", fmt(t.intervaloSuprimido), "intrajornada (art. 71)", t.intervaloSuprimido > 0) +
      card("Interjornada suprimida", fmt(t.interjornadaSuprimida), "descanso menor que 11h", t.interjornadaSuprimida > 0) +
      card("Horas a menos", fmt(t.faltantes), "abaixo da jornada prevista");

    // Valores
    var boxValores = document.getElementById("valores");
    if (valores) {
      var linhasHtml = valores.linhas.filter(function (l) { return l.valor > 0.004; }).map(function (l) {
        return "<tr><td>" + escapar(l.rotulo) + "<small>" + fmt(l.horas) + " h</small></td>" +
          "<td>" + moeda.format(l.valor) + "</td><td>" + moeda.format(l.valor * 30 / 7) + "</td></tr>";
      }).join("");
      boxValores.innerHTML =
        "<h3>Valores estimados</h3>" +
        '<p class="valores__hora">Valor da hora normal: <strong>' + moeda.format(valores.hora) + "</strong></p>" +
        (linhasHtml
          ? '<table><thead><tr><th>Verba</th><th>Semana</th><th>Mês*</th></tr></thead><tbody>' + linhasHtml +
            '</tbody><tfoot><tr><th>Total</th><th>' + moeda.format(valores.total) + "</th><th>" +
            moeda.format(valores.total * 30 / 7) + "</th></tr></tfoot></table>" +
            '<p class="nota">* Média de 4,29 semanas por mês. Sem reflexos em DSR, férias, 13º e FGTS.</p>'
          : '<p class="nota">Nenhum adicional a pagar na jornada informada.</p>');
      boxValores.hidden = false;
    } else {
      boxValores.hidden = true;
      boxValores.innerHTML = "";
    }

    // Alertas
    var alertas = document.getElementById("alertas");
    if (r.alertas.length) {
      alertas.innerHTML = r.alertas.map(function (a) {
        return '<li class="alerta alerta--' + a.nivel + '">' + escapar(a.texto) + "</li>";
      }).join("");
    } else {
      alertas.innerHTML = '<li class="alerta alerta--ok">Nenhuma irregularidade encontrada na jornada informada.</li>';
    }

    salvar();
  }

  // Resumo em texto para WhatsApp --------------------------------------
  function resumoTexto() {
    var r = ultimo.r, t = r.totais;
    var txt = ["Olá! Fiz um cálculo de ponto pelo site da Efficio:", ""];
    r.dias.forEach(function (d, i) {
      var linha = NOMES[i] + ": ";
      if (!d.periodos.length || d.erros.length) {
        linha += d.tipo === "trabalho" ? "sem horários" : (d.tipo === "folga" ? "folga" : "feriado");
      } else {
        linha += d.periodos.map(function (p) { return fmt(p.inicio % 1440) + "-" + fmt(p.fim % 1440); }).join(" / ") +
          " (" + fmt(d.computado) + ")" + (d.tipo !== "trabalho" ? " em " + d.tipo : "");
      }
      txt.push(linha);
    });
    txt.push("",
      "Horas trabalhadas: " + fmt(t.computado),
      "Horas extras 50%: " + fmt(t.extras50),
      "Horas extras 100%: " + fmt(t.extras100),
      "Horas noturnas: " + fmt(t.noturnoComputado),
      "Intervalo suprimido: " + fmt(t.intervaloSuprimido),
      "Interjornada suprimida: " + fmt(t.interjornadaSuprimida));
    if (ultimo.valores) txt.push("Total estimado na semana: " + moeda.format(ultimo.valores.total));
    txt.push("", "Gostaria de ajuda com o departamento pessoal.");
    return txt.join("\n");
  }

  // Eventos -----------------------------------------------------------
  form.addEventListener("input", atualizar);
  form.addEventListener("change", atualizar);
  form.addEventListener("submit", function (e) { e.preventDefault(); });

  document.getElementById("aplicar-modelo").addEventListener("click", function () {
    aplicarModelo(form.modelo.value);
  });

  form.limiteSemanal.addEventListener("change", function () {
    var h = numero(form.limiteSemanal.value);
    if (h > 0) form.divisor.value = Math.round(h * 5);
    atualizar();
  });

  form.tipoTrabalhador.addEventListener("change", function () {
    form.noturno.value = P.NOTURNO[form.tipoTrabalhador.value].adicional;
    atualizar();
  });

  document.getElementById("copiar-segunda").addEventListener("click", function () {
    for (var i = 1; i <= 4; i++) {
      CAMPOS.forEach(function (c) { campo(i, c).value = campo(0, c).value; });
    }
    atualizar();
  });

  document.getElementById("limpar").addEventListener("click", function () {
    aplicarModelo("vazio");
  });

  document.getElementById("imprimir").addEventListener("click", function () { window.print(); });

  document.getElementById("whatsapp").addEventListener("click", function () {
    window.open("https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(resumoTexto()), "_blank", "noopener");
  });

  if (!carregar()) aplicarModelo("44-5");
  else atualizar();
})();
