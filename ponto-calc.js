/* ==========================================================
   Efficio - Cálculo de ponto (regras da CLT)
   Funções puras, sem acesso ao DOM. Tempos em minutos.
   ========================================================== */
(function (root) {
  var DIA = 1440;

  // Períodos noturnos por tipo de trabalhador
  // urbano: art. 73 CLT (22h às 5h, hora de 52min30s, adicional 20%)
  // rural:  art. 7º da Lei 5.889/73 (hora de 60 min, adicional 25%)
  var NOTURNO = {
    urbano:   { inicio: 22 * 60, fim: 5 * 60, reduzida: true,  adicional: 20 },
    lavoura:  { inicio: 21 * 60, fim: 5 * 60, reduzida: false, adicional: 25 },
    pecuaria: { inicio: 20 * 60, fim: 4 * 60, reduzida: false, adicional: 25 }
  };

  var FATOR_REDUZIDA = 60 / 52.5; // 52min30s de relógio = 1 hora noturna

  function paraMinutos(hhmm) {
    if (!hhmm) return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
    if (!m) return null;
    var h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function formatar(min, comSinal) {
    var neg = min < 0;
    var total = Math.round(Math.abs(min));
    var h = Math.floor(total / 60);
    var m = total % 60;
    var txt = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    if (neg) return "-" + txt;
    return comSinal && total > 0 ? "+" + txt : txt;
  }

  function ehNoturno(min, cfg) {
    var r = ((min % DIA) + DIA) % DIA;
    return r >= cfg.inicio || r < cfg.fim;
  }

  // Monta os períodos trabalhados do dia em minutos absolutos a partir
  // das 00:00 do dia. Marcações menores que a anterior viram o dia seguinte.
  function montarPeriodos(dia) {
    var marcas = [dia.e1, dia.s1, dia.e2, dia.s2].map(paraMinutos);
    var periodos = [];
    var erros = [];
    var anterior = null;

    for (var i = 0; i < 4; i += 2) {
      var e = marcas[i], s = marcas[i + 1];
      if (e === null && s === null) continue;
      if (e === null || s === null) {
        erros.push("Preencha entrada e saída do " + (i === 0 ? "1º" : "2º") + " período.");
        continue;
      }
      if (anterior !== null) while (e < anterior) e += DIA;
      while (s <= e) s += DIA;
      periodos.push({ inicio: e, fim: s });
      anterior = s;
    }

    if (periodos.length === 2 && periodos[0].inicio === periodos[1].inicio) {
      erros.push("Os períodos não podem começar no mesmo horário.");
    }
    var ultimo = periodos[periodos.length - 1];
    if (ultimo && ultimo.fim - periodos[0].inicio > DIA) {
      erros.push("A jornada não pode passar de 24 horas.");
    }
    return { periodos: periodos, erros: erros };
  }

  function calcularDia(dia, opcoes) {
    var cfgNot = NOTURNO[opcoes.tipoTrabalhador] || NOTURNO.urbano;
    var montagem = montarPeriodos(dia);
    var periodos = montagem.periodos;
    var r = {
      tipo: dia.tipo,
      erros: montagem.erros,
      periodos: periodos,
      previsto: dia.tipo === "trabalho" ? (paraMinutos(dia.previsto) || 0) : 0,
      relogio: 0,          // tempo real trabalhado
      computado: 0,        // tempo com hora noturna reduzida
      noturnoRelogio: 0,
      noturnoComputado: 0,
      prorrogacao: false,
      normais: 0,
      extras50: 0,
      extras100: 0,
      extrasNoturnas50: 0,
      extrasNoturnas100: 0,
      faltantes: 0,
      toleranciaAplicada: false,
      intervaloGozado: 0,
      intervaloMinimo: 0,
      intervaloSuprimido: 0,
      intervaloExcedido: false
    };
    if (!periodos.length || r.erros.length) return r;

    periodos.forEach(function (p) { r.relogio += p.fim - p.inicio; });

    // Prorrogação da jornada noturna (Súmula 60, II, TST e OJ 388 SDI-1):
    // se a jornada foi cumprida (total ou predominantemente) no período
    // noturno e avança após o fim dele, as horas prorrogadas também são noturnas.
    var minNoturnoPuro = 0;
    periodos.forEach(function (p) {
      for (var m = p.inicio; m < p.fim; m++) if (ehNoturno(m, cfgNot)) minNoturnoPuro++;
    });
    var duracaoJanela = DIA - cfgNot.inicio + cfgNot.fim;
    var inicioProrrogacao = null;
    if (opcoes.prorrogacao && minNoturnoPuro >= duracaoJanela / 2) {
      periodos.forEach(function (p) {
        for (var m = p.inicio; m < p.fim; m++) {
          var r1 = ((m % DIA) + DIA) % DIA;
          if (r1 === cfgNot.fim && m > p.inicio && inicioProrrogacao === null) {
            inicioProrrogacao = m;
          }
        }
      });
    }

    // Percorre minuto a minuto para separar normais, extras e noturnas
    var acumulado = 0;
    var minutos = [];
    periodos.forEach(function (p) {
      for (var m = p.inicio; m < p.fim; m++) {
        var noturno = ehNoturno(m, cfgNot) ||
          (inicioProrrogacao !== null && m >= inicioProrrogacao);
        var peso = noturno && cfgNot.reduzida ? FATOR_REDUZIDA : 1;
        if (noturno) {
          r.noturnoRelogio += 1;
          r.noturnoComputado += peso;
          if (!ehNoturno(m, cfgNot)) r.prorrogacao = true;
        }
        acumulado += peso;
        minutos.push({ peso: peso, noturno: noturno, acumulado: acumulado });
      }
    });
    r.computado = acumulado;

    if (dia.tipo !== "trabalho") {
      // Trabalho em folga (DSR) ou feriado sem compensação: 100%
      // (Lei 605/49, art. 9º e Súmula 146 TST)
      r.extras100 = r.computado;
      r.extrasNoturnas100 = r.noturnoComputado;
    } else {
      var excesso = r.computado - r.previsto;
      // Tolerância de até 5 min por marcação e 10 min diários
      // (art. 58, §1º CLT; Súmula 366 TST). Passou disso, conta tudo.
      var tolerado = opcoes.tolerancia && Math.abs(excesso) <= 10 + 1e-9;
      if (tolerado && Math.abs(excesso) > 1e-9) r.toleranciaAplicada = true;
      if (excesso > 1e-9 && !tolerado) {
        r.extras50 = excesso;
        minutos.forEach(function (mm) {
          if (!mm.noturno) return;
          var inicioMin = mm.acumulado - mm.peso;
          var parteExtra = Math.max(0, mm.acumulado - Math.max(inicioMin, r.previsto));
          r.extrasNoturnas50 += parteExtra;
        });
      }
      if (excesso < -1e-9 && !tolerado) r.faltantes = -excesso;
      r.normais = Math.min(r.computado, r.previsto);
    }

    // Intervalo intrajornada (art. 71 CLT)
    if (r.relogio > 6 * 60) {
      r.intervaloMinimo = opcoes.intervaloReduzido ? 30 : 60;
    } else if (r.relogio > 4 * 60) {
      r.intervaloMinimo = 15;
    }
    for (var i = 1; i < periodos.length; i++) {
      r.intervaloGozado += periodos[i].inicio - periodos[i - 1].fim;
    }
    r.intervaloSuprimido = Math.max(0, r.intervaloMinimo - r.intervaloGozado);
    r.intervaloExcedido = r.relogio > 6 * 60 && r.intervaloGozado > 120;

    return r;
  }

  function calcularSemana(dias, opcoes) {
    var resultado = dias.map(function (d) { return calcularDia(d, opcoes); });
    var limiteSemanal = Number(opcoes.limiteSemanal) > 0 ? Number(opcoes.limiteSemanal) : 44 * 60;

    // Intervalo interjornada (art. 66 CLT): 11h entre o fim de uma jornada
    // e o início da seguinte. A semana se repete, então domingo liga à segunda.
    var trabalhados = [];
    resultado.forEach(function (r, i) {
      r.interjornada = null;
      r.interjornadaSuprimida = 0;
      if (r.periodos.length && !r.erros.length) trabalhados.push(i);
    });
    var maiorDescanso = 0;
    trabalhados.forEach(function (i, k) {
      var j = trabalhados[(k + 1) % trabalhados.length];
      var a = resultado[i], b = resultado[j];
      var fim = i * DIA + a.periodos[a.periodos.length - 1].fim;
      var inicio = j * DIA + b.periodos[0].inicio;
      while (inicio <= fim) inicio += 7 * DIA;
      var descanso = inicio - fim;
      maiorDescanso = Math.max(maiorDescanso, descanso);
      b.interjornada = descanso;
      b.interjornadaSuprimida = Math.max(0, 11 * 60 - descanso);
    });

    var t = {
      relogio: 0, computado: 0, normais: 0,
      extrasDiarias: 0, extrasSemanais: 0, extras50: 0, extras100: 0,
      noturnoRelogio: 0, noturnoComputado: 0,
      extrasNoturnas50: 0, extrasNoturnas100: 0,
      faltantes: 0, intervaloSuprimido: 0, interjornadaSuprimida: 0,
      previsto: 0, diasTrabalhados: trabalhados.length,
      limiteSemanal: limiteSemanal, maiorDescanso: maiorDescanso
    };
    resultado.forEach(function (r) {
      t.relogio += r.relogio;
      t.computado += r.computado;
      t.normais += r.normais;
      t.extrasDiarias += r.extras50;
      t.extras100 += r.extras100;
      t.noturnoRelogio += r.noturnoRelogio;
      t.noturnoComputado += r.noturnoComputado;
      t.extrasNoturnas50 += r.extrasNoturnas50;
      t.extrasNoturnas100 += r.extrasNoturnas100;
      t.faltantes += r.faltantes;
      t.intervaloSuprimido += r.intervaloSuprimido;
      t.interjornadaSuprimida += r.interjornadaSuprimida;
      t.previsto += r.previsto;
    });

    // Módulo semanal (art. 7º, XIII CF): horas normais acima do limite
    // semanal também são extras, sem contar duas vezes as já pagas no dia.
    t.extrasSemanais = Math.max(0, t.normais - limiteSemanal);
    t.normais -= t.extrasSemanais;
    t.extras50 = t.extrasDiarias + t.extrasSemanais;

    return { dias: resultado, totais: t, alertas: gerarAlertas(resultado, t, opcoes) };
  }

  function gerarAlertas(dias, t, opcoes) {
    var nomes = opcoes.nomesDias || [];
    var alertas = [];
    function nome(i) { return nomes[i] || "Dia " + (i + 1); }
    var porDia = [];
    var agrupados = {};
    // Alertas iguais em vários dias viram um só ("Segunda e Terça: ...")
    function doDia(i, nivel, texto) {
      var chave = nivel + "|" + texto;
      if (!agrupados[chave]) {
        agrupados[chave] = { nivel: nivel, texto: texto, dias: [] };
        porDia.push(agrupados[chave]);
      }
      agrupados[chave].dias.push(nome(i));
    }
    function juntar(lista) {
      return lista.length > 1 ? lista.slice(0, -1).join(", ") + " e " + lista[lista.length - 1] : lista[0];
    }

    dias.forEach(function (r, i) {
      r.erros.forEach(function (e) { doDia(i, "erro", e); });
      if (r.extras50 > 120 + 1e-9) {
        doDia(i, "aviso", formatar(r.extras50) +
          " de horas extras. O limite legal é de 2 horas extras por dia (art. 59 da CLT).");
      }
      if (r.intervaloSuprimido > 0) {
        doDia(i, "aviso", "intervalo de " + formatar(r.intervaloGozado) +
          " para mínimo de " + formatar(r.intervaloMinimo) + ". O período suprimido (" +
          formatar(r.intervaloSuprimido) + ") deve ser pago com acréscimo de 50% (art. 71, §4º da CLT).");
      }
      if (r.intervaloExcedido) {
        doDia(i, "info", "intervalo maior que 2 horas só é permitido com acordo escrito ou norma coletiva (art. 71 da CLT).");
      }
      if (r.interjornadaSuprimida > 0) {
        doDia(i, "aviso", "descanso de apenas " + formatar(r.interjornada) +
          " desde a jornada anterior. O mínimo é de 11 horas (art. 66 da CLT); as " +
          formatar(r.interjornadaSuprimida) + " suprimidas são pagas como extras (OJ 355 SDI-1 do TST).");
      }
      if (r.prorrogacao) {
        doDia(i, "info", "jornada noturna prorrogada após o fim do período noturno; as horas prorrogadas também receberam adicional noturno (Súmula 60, II do TST).");
      }
      if (r.extras100 > 0) {
        doDia(i, "info", "trabalho em " + (r.tipo === "feriado" ? "feriado" : "dia de folga") +
          " sem compensação é pago em dobro (Lei 605/49, art. 9º e Súmula 146 do TST).");
      }
    });

    porDia.forEach(function (a) {
      alertas.push({ nivel: a.nivel, texto: juntar(a.dias) + ": " + a.texto });
    });

    if (t.diasTrabalhados === 7) {
      alertas.push({ nivel: "aviso", texto: "Não há dia de folga na semana. O descanso semanal remunerado de 24 horas é obrigatório, preferencialmente aos domingos (art. 67 da CLT); o 7º dia seguido de trabalho é pago em dobro (OJ 410 SDI-1 do TST)." });
    } else if (t.diasTrabalhados > 0 && t.maiorDescanso < 35 * 60) {
      alertas.push({ nivel: "aviso", texto: "O maior descanso da semana é de " + formatar(t.maiorDescanso) +
        ". O descanso semanal deve ter ao menos 35 horas (24h de DSR + 11h de interjornada, Súmula 110 do TST)." });
    }
    if (t.extrasSemanais > 0) {
      alertas.push({ nivel: "info", texto: formatar(t.extrasSemanais) + " de horas extras por ultrapassar o limite semanal de " +
        formatar(t.limiteSemanal) + " (art. 7º, XIII da Constituição Federal)." });
    }
    if (t.previsto > t.limiteSemanal) {
      alertas.push({ nivel: "aviso", texto: "A jornada prevista na semana (" + formatar(t.previsto) +
        ") é maior que o limite semanal de " + formatar(t.limiteSemanal) + "." });
    }
    return alertas;
  }

  // Valores em reais a partir do salário (opcional)
  function calcularValores(totais, v) {
    var salario = Number(v.salario) || 0;
    var divisor = Number(v.divisor) || 0;
    if (salario <= 0 || divisor <= 0) return null;
    var hora = salario / divisor;
    var pHe50 = (Number(v.he50) || 0) / 100;
    var pHe100 = (Number(v.he100) || 0) / 100;
    var pNot = (Number(v.noturno) || 0) / 100;
    var pInt = (Number(v.intervalo) || 0) / 100;
    var h = function (min) { return min / 60; };

    var linhas = [
      { chave: "he50", rotulo: "Horas extras (" + v.he50 + "%)", horas: totais.extras50,
        valor: h(totais.extras50) * hora * (1 + pHe50) },
      { chave: "he100", rotulo: "Horas extras em folga/feriado (" + v.he100 + "%)", horas: totais.extras100,
        valor: h(totais.extras100) * hora * (1 + pHe100) },
      { chave: "noturno", rotulo: "Adicional noturno (" + v.noturno + "%)", horas: totais.noturnoComputado,
        valor: h(totais.noturnoComputado) * hora * pNot },
      { chave: "heNoturna", rotulo: "Adicional noturno sobre as horas extras noturnas (OJ 97)",
        horas: totais.extrasNoturnas50 + totais.extrasNoturnas100,
        valor: h(totais.extrasNoturnas50) * hora * pNot * pHe50 +
               h(totais.extrasNoturnas100) * hora * pNot * pHe100 },
      { chave: "intervalo", rotulo: "Intervalo intrajornada suprimido (+" + v.intervalo + "%)", horas: totais.intervaloSuprimido,
        valor: h(totais.intervaloSuprimido) * hora * (1 + pInt) },
      { chave: "interjornada", rotulo: "Interjornada suprimida (" + v.he50 + "%)", horas: totais.interjornadaSuprimida,
        valor: h(totais.interjornadaSuprimida) * hora * (1 + pHe50) }
    ];
    var total = linhas.reduce(function (s, l) { return s + l.valor; }, 0);
    return { hora: hora, linhas: linhas, total: total };
  }

  var api = {
    NOTURNO: NOTURNO,
    paraMinutos: paraMinutos,
    formatar: formatar,
    montarPeriodos: montarPeriodos,
    calcularDia: calcularDia,
    calcularSemana: calcularSemana,
    calcularValores: calcularValores
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PontoCalc = api;
})(this);
