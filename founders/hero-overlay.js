(function () {
  "use strict";

  // В браузерах без :has сохраняем исходную шапку и её поведение.
  if (!window.CSS || !window.CSS.supports("selector(:has(*))")) {
    return;
  }

  const root = document.getElementById("avelio-start");
  const founders = document.getElementById("founders");
  const video = document.getElementById("hero-video");

  if (!root || !founders || !video) {
    return;
  }

  const header = root.querySelector(":scope > .site-header");

  if (!header || !root.contains(founders) || !founders.contains(video)) {
    return;
  }

  const phone = window.matchMedia("(max-width: 699px)");
  const hiddenClass = "is-chrome-hidden";
  const supportsInert = "inert" in header;
  const originalInert = header.hasAttribute("inert");
  const savedTabIndexes = new Map();

  function isEnabled() {
    return phone.matches && founders.matches(".founders.is-ready");
  }

  function setHidden(hidden) {
    if (hidden) {
      const activeElement = document.activeElement;

      if (activeElement && header.contains(activeElement)) {
        activeElement.blur();
      }

      // Блокируем фокус сразу, не дожидаясь конца затухания.
      if (supportsInert) {
        header.inert = true;
      } else {
        header.querySelectorAll("a[href], button, [tabindex]").forEach(function (element) {
          if (!savedTabIndexes.has(element)) {
            savedTabIndexes.set(element, element.getAttribute("tabindex"));
          }

          element.setAttribute("tabindex", "-1");
        });
      }
    } else {
      if (supportsInert) {
        header.inert = originalInert;
      }

      savedTabIndexes.forEach(function (value, element) {
        if (value === null) {
          element.removeAttribute("tabindex");
        } else {
          element.setAttribute("tabindex", value);
        }
      });

      savedTabIndexes.clear();
    }

    header.classList.toggle(hiddenClass, hidden);
  }

  function resetIfDisabled() {
    if (!isEnabled()) {
      setHidden(false);
    }
  }

  // Кнопки звука — соседние элементы, их клики сюда не попадают.
  video.addEventListener("click", function () {
    if (!isEnabled()) {
      setHidden(false);
      return;
    }

    setHidden(!header.classList.contains(hiddenClass));
  });

  phone.addEventListener("change", resetIfDisabled);

  // Готовность читаем из DOM, без обращения к коду или API founders.js.
  const readinessObserver = new MutationObserver(resetIfDisabled);
  readinessObserver.observe(founders, {
    attributes: true,
    attributeFilter: ["class"]
  });

  setHidden(false);
})();
