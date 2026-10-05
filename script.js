(function () {
  var WHATSAPP = "5519996859637";

  // Ano atual no rodapé
  document.getElementById("ano").textContent = new Date().getFullYear();

  // Sombra no cabeçalho ao rolar
  var header = document.querySelector(".header");
  function onScroll() {
    header.classList.toggle("is-scrolled", window.scrollY > 10);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Menu mobile
  var toggle = document.querySelector(".header__toggle");
  var nav = document.getElementById("menu");
  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  }
  toggle.addEventListener("click", function () {
    setMenu(!nav.classList.contains("is-open"));
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) setMenu(false);
  });

  // Animação de entrada dos elementos
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    items.forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 80 + "ms";
      observer.observe(el);
    });
  } else {
    items.forEach(function (el) { el.classList.add("is-visible"); });
  }

  // Formulário: monta a mensagem e abre o WhatsApp
  var form = document.getElementById("contato-form");
  if (!form) return;
  var error = form.querySelector(".form__error");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var nome = form.nome.value.trim();
    var empresa = form.empresa.value.trim();
    var assunto = form.assunto.value;
    var mensagem = form.mensagem.value.trim();

    form.nome.classList.toggle("is-invalid", !nome);
    form.mensagem.classList.toggle("is-invalid", !mensagem);
    if (!nome || !mensagem) {
      error.hidden = false;
      (nome ? form.mensagem : form.nome).focus();
      return;
    }
    error.hidden = true;

    var texto = "Olá! Meu nome é " + nome +
      (empresa ? " (" + empresa + ")" : "") + ".\n" +
      "Assunto: " + assunto + "\n\n" + mensagem;

    window.open("https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(texto), "_blank", "noopener");
    form.reset();
  });
})();
