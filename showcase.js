(() => {
  "use strict";

  const ITEMS = [
    {
      code: "SF-050",
      section: "Диваны",
      category: "sofas",
      name: "Диван",
      sizes: ["170 × 95 × 70 см"],
      text: "Для разговора вдвоём — в гостиной или отдельном уголке дома."
    },
    {
      code: "PB-187",
      section: "Прикроватные тумбы",
      category: "cabinets",
      name: "Прикроватная тумба",
      sizes: ["65 × 50 × 58 см"],
      text: "У изголовья — для последних страниц перед сном."
    },
    {
      code: "PB-103",
      section: "Кровати",
      category: "beds",
      name: "Кровать",
      sizes: ["200 × 220 × 140 см"],
      text: "В спальне — для тихого пробуждения в выходной."
    },
    {
      code: "AR-083",
      section: "Кресла",
      category: "armchairs",
      name: "Кресло",
      sizes: ["80 × 80 × 66 см"],
      text: "В уголке гостиной — для книги и вечера без спешки и суеты."
    },
    {
      code: "PL-413",
      section: "ТВ-тумбы, буфеты и консоли",
      category: "cabinets",
      name: "ТВ-тумба",
      sizes: ["200 × 45 × 80 см"],
      text: "Напротив дивана — для вечера с любимым фильмом."
    },
    {
      code: "PL-358",
      section: "Приставные столики",
      category: "coffee",
      name: "Приставной столик",
      sizes: ["65 × 65 × 53 см"],
      text: "Возле кресла — для чашки чая между главами."
    },
    {
      code: "PD-002",
      section: "Обеденные столы",
      category: "tables",
      name: "Обеденный стол",
      sizes: ["135 × 135 × 79 см"],
      text: "В обеденной зоне — для ужина вдвоём и разговоров о планах дома."
    },
    {
      code: "AR-082",
      section: "Кресла",
      category: "armchairs",
      name: "Кресло",
      sizes: ["100 × 92 × 70 см"],
      text: "Для отдыха в спальне и вечера, когда можно никуда не спешить."
    },
    {
      code: "PB-156",
      section: "Туалетные столики",
      category: "desks",
      name: "Туалетный столик",
      sizes: ["160 × 54 × 75 см"],
      text: "В спальне — несколько минут для себя перед началом дня."
    },
    {
      code: "TB-093",
      section: "Журнальные столики",
      category: "coffee",
      name: "Столик",
      sizes: ["130 × 130 × 30 см"],
      text: "Рядом с диваном — для утреннего кофе и вечерней беседы."
    },
    {
      code: "SF-056",
      section: "Диваны",
      category: "sofas",
      name: "Диван",
      sizes: ["283 × 135 × 70 см"],
      text: "Центр гостиной, где вечер собирает всех вместе."
    },
    {
      code: "AR-086",
      section: "Стулья",
      category: "chairs",
      name: "Стул",
      sizes: ["65 × 65 × 75 см"],
      text: "За обеденным столом или у окна — место для неспешного утра."
    },
    {
      code: "PB-284",
      section: "Банкетки",
      category: "poufs",
      name: "Банкетка",
      sizes: ["120 × 40 × 40 см"],
      text: "В прихожей — для короткой паузы перед выходом."
    },
    {
      code: "PL-178",
      section: "Кресла",
      category: "armchairs",
      name: "Кресло",
      sizes: ["115 × 105 × 115 см"],
      text: "В домашней библиотеке — для любимого альбома и тихой музыки."
    }
  ];

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const imagePath = item => `showcase/${item.code}.webp`;
  const wrap = index => ((index % ITEMS.length) + ITEMS.length) % ITEMS.length;
  const number = value => String(value).padStart(2, "0");
  const initialized = new WeakSet();
  const AUTO_DELAY = 6000;
  const PAUSE_DELAY = 8000;
  const DURATION = 1120;
  const EASE = "cubic-bezier(.16, 1, .22, 1)";
  const EXIT_EASE = "cubic-bezier(.4, 0, .7, 1)";

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Два кадра дают браузеру возможность подготовить видимый слой до подлёта.
  // Таймер не оставляет ожидание зависшим в фоновой вкладке.
  function frame() {
    return new Promise(resolve => {
      let requestId = 0;
      const timer = window.setTimeout(() => {
        cancelAnimationFrame(requestId);
        resolve();
      }, 80);
      requestId = requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async function painted() {
    await frame();
    await frame();
  }

  function init(root) {
    if (initialized.has(root)) return;
    initialized.add(root);

    const stage = root.querySelector(".sc-stage");
    const track = root.querySelector(".sc-track");
    const info = root.querySelector(".sc-info");
    const copy = root.querySelector(".sc-copy");
    const put = root.querySelector(".sc-put");
    const marksBox = root.querySelector(".sc-marks");
    const counter = root.querySelector(".sc-counter");
    const live = root.querySelector(".sc-live");

    let current = 0;
    let wanted = 0;
    let picked = 0;
    let direction = 1;
    let busy = false;
    let runId = 0;
    let transition = null;
    let liveTimer = 0;
    let visible = !("IntersectionObserver" in window);
    let nearby = visible;
    let hovering = false;
    let focused = false;
    let pauseUntil = 0;
    let nextAuto = Date.now() + AUTO_DELAY;
    let autoTimer = 0;
    let autoVersion = 0;
    let markVersion = 0;
    let drag = null;
    let snap = null;
    let trackOffset = 0;
    let settling = false;
    let activeAnimations = [];
    let idleScheduled = false;
    let idleWorking = false;
    let firstReady = false;
    let sceneDone = false; // сцена основателей отпустила очередь (afterScene) — до этого автолистание не качает
    let stageWidth = 450;
    const pointers = new Set();
    const loading = new Map();

    const slides = ITEMS.map((item, index) => {
      const slide = element("div", "sc-slide");
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "слайд");
      slide.setAttribute("aria-label", `${index + 1} из ${ITEMS.length}`);
      slide.setAttribute("aria-hidden", String(index !== 0));
      slide.hidden = index !== 0;

      const visual = element("div", "sc-visual");
      const image = element("img", "sc-image");
      image.alt = `${item.name} Avelio ${item.code}`;
      image.decoding = "async";
      image.draggable = false;
      image.hidden = true;

      const missing = element("p", "sc-missing", "Фото пока недоступно");
      missing.hidden = true;

      visual.append(image, missing);
      slide.append(visual);
      track.append(slide);

      return { slide, visual, image, missing, ready: false };
    });

    const marks = ITEMS.map((item, index) => {
      const button = element("button", "sc-mark");
      button.type = "button";
      button.setAttribute(
        "aria-label",
        `${item.name} ${item.code}, ${index + 1} из ${ITEMS.length}`
      );
      button.addEventListener("click", () => {
        interact();
        request(index, index >= wanted ? 1 : -1);
      });
      marksBox.append(button);
      return button;
    });

    /*
     * Декодируется тот же img, который будет показан.
     * Источники уже обрезаны снаружи: без canvas, копий и промежуточных URL.
     */
    function load(index) {
      if (loading.has(index)) return loading.get(index);

      const record = slides[index];
      const promise = (async () => {
        try {
          record.image.src = imagePath(ITEMS[index]);
          await record.image.decode();

          if (!record.image.naturalWidth || !record.image.naturalHeight) {
            throw new Error("Empty image");
          }

          record.image.width = record.image.naturalWidth;
          record.image.height = record.image.naturalHeight;
          record.ready = true;
          record.image.hidden = false;
          record.missing.hidden = true;
          return true;
        } catch {
          // Нераскодированное фото не участвует в переходе.
          record.ready = false;
          record.image.hidden = true;
          record.missing.hidden = false;
          return false;
        }
      })();

      loading.set(index, promise);
      return promise;
    }

    // Сначала ближайшие соседи текущей вещи, затем остальные по кругу.
    function preloadOrder() {
      const order = [];
      for (let distance = 1; distance < ITEMS.length; distance++) {
        for (const index of [wrap(current + distance), wrap(current - distance)]) {
          if (index !== current && !order.includes(index)) order.push(index);
        }
      }
      return order;
    }

    /*
     * До трёх фоновых загрузок с decode за раз.
     * Условия запуска прежние: рядом с экраном, не в фоне и не во время перехода.
     */
    function scheduleIdle() {
      if (
        !firstReady ||
        !nearby ||
        document.hidden ||
        busy ||
        idleScheduled ||
        idleWorking
      ) return;

      if (!preloadOrder().some(index => !loading.has(index))) return;

      idleScheduled = true;
      const work = deadline => {
        idleScheduled = false;

        if (!nearby || document.hidden || busy) return;
        if (deadline && !deadline.didTimeout && deadline.timeRemaining() < 8) {
          scheduleIdle();
          return;
        }

        const batch = preloadOrder().filter(index => !loading.has(index)).slice(0, 3);
        if (!batch.length) return;

        idleWorking = true;
        void Promise.all(batch.map(load)).finally(() => {
          idleWorking = false;
          scheduleIdle();
        });
      };

      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(work, { timeout: 1500 });
      } else {
        window.setTimeout(() => work(null), 200);
      }
    }

    /*
     * Измерения полосы точек отделены от записи текста двумя кадрами.
     * В самом начале подлёта измерений раскладки нет.
     */
    async function revealMark(index) {
      const version = ++markVersion;
      await painted();
      if (version !== markVersion) return;

      const button = marks[index];
      const left = button.offsetLeft - marks[0].offsetLeft;
      const right = left + button.offsetWidth;
      const viewLeft = marksBox.scrollLeft;
      const width = marksBox.clientWidth;
      let scroll = viewLeft;

      if (left < viewLeft) scroll = left;
      else if (right > viewLeft + width) scroll = right - width;

      if (scroll !== viewLeft) marksBox.scrollLeft = scroll;
    }

    // Управление показывает запрос, а не окончание анимации подписи.
    function select(index) {
      counter.textContent = `${number(index + 1)} / ${number(ITEMS.length)}`;
      marks.forEach((button, at) => {
        if (at === index) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      void revealMark(index);
    }

    function paint(index) {
      const item = ITEMS[index];
      picked = index;

      const name = element("h3", "sc-name", item.name);
      const description = element("p", "sc-description", item.text);
      const size = element("p", "sc-size");
      item.sizes.forEach(value => size.append(element("span", "sc-dimension", value)));
      const code = element("p", "sc-code", item.code);
      copy.replaceChildren(name, description, size, code);

      put.dataset.itemCode = item.code;
      put.setAttribute("aria-label", `Примерить в моей комнате: ${item.name} ${item.code}`);
    }

    function announce(index) {
      clearTimeout(liveTimer);
      liveTimer = window.setTimeout(() => {
        const item = ITEMS[index];
        live.textContent = `${item.name} ${item.code}. ${index + 1} из ${ITEMS.length}.`;
      }, 400);
    }

    function motion(node, frames, options = {}) {
      const animation = node.animate(frames, {
        duration: DURATION,
        easing: EASE,
        fill: "both",
        ...options,
        ...(settling || reduced.matches ? { duration: 0, delay: 0 } : {})
      });
      activeAnimations.push(animation);
      return animation;
    }

    function finished(animation) {
      return animation.finished.catch(() => {});
    }

    function resetTrack() {
      if (snap) {
        snap.cancel();
        snap = null;
      }
      trackOffset = 0;
      if (drag) {
        drag.locked = true;
        drag.offset = 0;
      }
      track.style.transform = "";
      track.style.willChange = "";
    }

    function snapBack(from) {
      resetTrack();
      if (
        from !== 0 &&
        !reduced.matches &&
        typeof track.animate === "function"
      ) {
        track.style.willChange = "transform";
        snap = track.animate([
          { transform: `translateX(${from}px)` },
          { transform: "translateX(0)" }
        ], { duration: 360, easing: EASE });

        const returning = snap;
        finished(returning).then(() => {
          if (snap !== returning) return;
          snap = null;
          track.style.willChange = "";
        });
      }
    }

    function finishMotion() {
      settling = true;
      activeAnimations.forEach(animation => {
        if (animation.playState !== "finished" && animation.playState !== "idle") {
          animation.finish();
        }
      });
      resetTrack();
    }

    function clearMotion(index) {
      slides.forEach((record, at) => {
        record.slide.hidden = at !== index;
        record.slide.setAttribute("aria-hidden", String(at !== index));
        record.visual.style.opacity = "";
        record.visual.style.transform = "";
        record.visual.style.willChange = "";
      });
      activeAnimations.forEach(animation => animation.cancel());
      activeAnimations = [];
      info.style.willChange = "";
    }

    function commit(index) {
      clearMotion(index);
      current = index;
      nextAuto = Date.now() + AUTO_DELAY;
    }

    /*
     * Инвалидация предшествует finish/cancel: продолжения старых await уже
     * не могут записать состояние. Подготовленный, но ещё не летящий слой
     * убирается без изменения current.
     */
    function interrupt() {
      if (!busy) return;

      const previous = transition;
      ++runId;

      if (previous && previous.phase === "animating") {
        activeAnimations.forEach(animation => {
          if (animation.playState !== "finished" && animation.playState !== "idle") {
            animation.finish();
          }
        });
        // В том числе случай перехвата до замены уходящих строк.
        paint(previous.target);
        commit(previous.target);
        resetTrack();
      } else {
        clearMotion(current);
        // Смещение незавершённого свайпа сохраняется для snapBack в run().
      }

      transition = null;
      busy = false;
      settling = false;
    }

    async function changeCopy(index, dir, id) {
      // Старые строки уходят вслед за вещью; управление остаётся неподвижным.
      const outgoing = Array.from(copy.children, node => motion(node, [
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
        { opacity: 0, transform: `translate3d(${-dir * 12}px, 0, 0)` }
      ], { duration: 140, easing: EXIT_EASE }));

      await Promise.all(outgoing.map(finished));
      if (id !== runId) return;
      paint(index);

      // Лёгкая лесенка на входе, но общее окончание движения у всех строк.
      const incoming = Array.from(copy.children, (node, at) => {
        const delay = at * 40;
        return motion(node, [
          { opacity: 0, transform: `translate3d(${dir * 28}px, 0, 0)` },
          { opacity: 1, transform: "translate3d(0, 0, 0)" }
        ], { duration: 900 - delay, delay, easing: EASE });
      });

      // Завершённые анимации очищаются вместе с мебелью в run().
      await Promise.all(incoming.map(finished));
      if (id !== runId) return;
    }

    function fly(from, to, dir, offset) {
      const old = slides[from];
      const next = slides[to];

      // 100% ширины сцены полностью выносит за край даже новую широкую коробку.
      // Проценты относятся к сцене; чтение её размеров здесь не требуется.
      const outgoing = motion(old.visual, [
        { opacity: 1, transform: `translate3d(${offset}px, 0, 0)` },
        { opacity: 0, transform: `translate3d(${-dir * 100}%, 0, 0)` }
      ], { duration: 560, easing: EXIT_EASE });

      const incoming = motion(next.visual, [
        { opacity: 0, transform: `translate3d(${dir * 100}%, 0, 0)` },
        { opacity: 1, transform: "translate3d(0, 0, 0)" }
      ]);

      return Promise.all([finished(outgoing), finished(incoming)]);
    }

    async function run() {
      if (busy) return;

      if (wanted === current) {
        if (trackOffset !== 0 && !(drag && !drag.locked)) {
          // Выбор вернулся к текущей вещи до подлёта — возвращаем ленту.
          snapBack(trackOffset);
        }
        armAuto();
        scheduleIdle();
        return;
      }

      const id = ++runId;
      const target = wanted;
      const from = current;
      const dir = direction;
      transition = { target, phase: "waiting" };
      busy = true;
      settling = false;
      armAuto();

      try {
        // Загрузка может закончиться позднее перехвата; она не владеет run().
        // Ждём только цель: неготовая текущая картинка не держит нажатия (load не бросает).
        load(from);
        await load(target);
        if (id !== runId) return;

        transition.phase = "preparing";
        const old = slides[from];
        const next = slides[target];
        next.visual.style.opacity = "0";
        next.slide.hidden = false;

        if (!reduced.matches && typeof stage.animate === "function") {
          old.visual.style.willChange = "transform, opacity";
          next.visual.style.willChange = "transform, opacity";
          info.style.willChange = "transform, opacity";
          await frame();
          if (id !== runId) return;
          await frame();
          if (id !== runId) return;
        }

        const offset = trackOffset;
        resetTrack();

        if (
          reduced.matches ||
          settling ||
          document.hidden ||
          typeof stage.animate !== "function"
        ) {
          paint(target);
        } else {
          transition.phase = "animating";
          await Promise.all([
            fly(from, target, dir, offset),
            changeCopy(target, dir, id)
          ]);
          if (id !== runId) return;
        }

        commit(target);
      } finally {
        // Старый переход не освобождает busy и не трогает новый трек.
        if (id === runId) {
          transition = null;
          busy = false;
          settling = false;
          armAuto();
          scheduleIdle();
        }
      }
    }

    function request(index, dir) {
      wanted = wrap(index);
      direction = dir;
      select(wanted);
      announce(wanted);
      interrupt();
      void run();
    }

    function step(dir) {
      request(wanted + dir, dir);
    }

    function canAuto() {
      return !(
        reduced.matches ||
        document.hidden ||
        !visible ||
        hovering ||
        focused ||
        pointers.size ||
        busy ||
        drag
      );
    }

    /*
     * Таймер появляется только после успешного decode текущей и следующей вещи.
     * Версия отменяет устаревшее ожидание после жеста, фокуса или нового выбора.
     */
    function armAuto() {
      clearTimeout(autoTimer);
      const version = ++autoVersion;
      if (!sceneDone || !canAuto()) return;

      const index = current;
      void Promise.all([load(index), load(wrap(index + 1))]).then(results => {
        if (
          version !== autoVersion ||
          index !== current ||
          !canAuto() ||
          !results.every(Boolean)
        ) return;

        const delay = Math.max(0, nextAuto - Date.now(), pauseUntil - Date.now());
        autoTimer = window.setTimeout(() => {
          if (version !== autoVersion || !canAuto()) return;
          step(1);
        }, delay);
      });
    }

    function interact() {
      pauseUntil = Date.now() + PAUSE_DELAY;
      armAuto();
    }

    root.querySelector(".sc-prev").addEventListener("click", () => {
      interact();
      step(-1);
    });

    root.querySelector(".sc-next").addEventListener("click", () => {
      interact();
      step(1);
    });

    root.addEventListener("keydown", event => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.target.closest("input, textarea, select, [contenteditable='true']")
      ) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      interact();
      step(event.key === "ArrowRight" ? 1 : -1);
    });

    put.addEventListener("click", () => {
      const item = ITEMS[picked];
      document.dispatchEvent(new CustomEvent("avelio-pick", {
        detail: {
          name: item.name,
          code: item.code,
          image: imagePath(item)
        }
      }));
    });

    root.addEventListener("pointerenter", event => {
      if (event.pointerType !== "mouse") return;
      hovering = true;
      interact();
    });

    root.addEventListener("pointerleave", event => {
      if (event.pointerType !== "mouse") return;
      hovering = false;
      interact();
    });

    root.addEventListener("pointermove", () => {
      if (hovering || pointers.size) interact();
    }, { passive: true });

    root.addEventListener("pointerdown", event => {
      pointers.add(event.pointerId);
      interact();
    }, { passive: true });

    root.addEventListener("focusin", () => {
      focused = true;
      interact();
    });

    root.addEventListener("focusout", () => {
      queueMicrotask(() => {
        focused = root.contains(document.activeElement);
        interact();
      });
    });

    // Захват указателя — только после определения горизонтального жеста.
    stage.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      interrupt();
      resetTrack();

      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dx: 0,
        offset: 0,
        locked: false,
        axis: ""
      };
      armAuto();
    });

    window.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;

      if (!drag.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          drag.axis = "y";
        } else if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          drag.axis = "x";
          stage.setPointerCapture(event.pointerId);
          stage.setAttribute("data-dragging", "");
        } else {
          return;
        }
      }

      if (drag.axis !== "x") return;
      event.preventDefault();
      drag.dx = dx;
      drag.offset = drag.locked || busy || reduced.matches ? 0 : 80 * Math.tanh(dx / 180);

      if (!drag.locked && !busy && !reduced.matches) {
        trackOffset = drag.offset;
        track.style.willChange = "transform";
        track.style.transform = `translateX(${trackOffset}px)`;
      }
      interact();
    }, { passive: false });

    function release(event, cancelled) {
      if (pointers.delete(event.pointerId)) interact();
      if (!drag || event.pointerId !== drag.id) return;

      const gesture = drag;
      drag = null;
      stage.removeAttribute("data-dragging");

      if (stage.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }

      const threshold = Math.min(72, stageWidth * .16);
      const advance = !cancelled && gesture.axis === "x" && Math.abs(gesture.dx) >= threshold;

      if (!busy && !advance) {
        if (!gesture.locked && gesture.offset) {
          snapBack(gesture.offset);
        } else {
          resetTrack();
        }
      }

      if (advance) {
        step(gesture.dx < 0 ? 1 : -1);
      } else if (!busy && wanted !== current) {
        // Короткий/отменённый жест не теряет ранее запрошенную загрузку.
        void run();
      }
      interact();
    }

    window.addEventListener("pointerup", event => release(event, false));
    window.addEventListener("pointercancel", event => release(event, true));

    stage.addEventListener("lostpointercapture", event => {
      if (event.target === stage && drag && drag.id === event.pointerId) {
        release(event, true);
      }
    });

    window.addEventListener("blur", () => {
      if (drag) release({ pointerId: drag.id }, true);
      pointers.clear();
      hovering = false;
      interact();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) finishMotion();
      nextAuto = Date.now() + AUTO_DELAY;
      armAuto();
      scheduleIdle();
    });

    reduced.addEventListener("change", () => {
      if (reduced.matches) finishMotion();
      nextAuto = Date.now() + AUTO_DELAY;
      armAuto();
    });

    if ("IntersectionObserver" in window) {
      const visibilityObserver = new IntersectionObserver(entries => {
        const entry = entries[0];
        const wasVisible = visible;
        visible = entry.isIntersecting && entry.intersectionRatio >= .35;
        if (visible && !wasVisible) nextAuto = Date.now() + AUTO_DELAY;
        armAuto();
      }, { threshold: [0, .35, 1] });
      visibilityObserver.observe(root);

      const preloadObserver = new IntersectionObserver(entries => {
        nearby = entries[0].isIntersecting;
        scheduleIdle();
      }, { rootMargin: "400px 0px", threshold: 0 });
      // Пока сцена основателей не готова, страница короче и витрина кажется близкой — ждём её.
      afterScene(() => preloadObserver.observe(root));
    }

    if ("ResizeObserver" in window) {
      let previousWidth = null;
      let previousHeight = null;
      const observer = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        stageWidth = width;
        if (
          previousWidth !== null &&
          (width !== previousWidth || height !== previousHeight)
        ) {
          finishMotion();
        }
        previousWidth = width;
        previousHeight = height;
        void revealMark(wanted);
      });
      observer.observe(stage);
    }

    paint(0);
    select(0);

    // Первые две начинают загрузку и decode сразу после сцены основателей, независимо от положения блока.
    afterScene(() => {
      sceneDone = true;
      void load(0).then(() => {
        // Медленный сосед не блокирует фоновую подготовку остальных вещей.
        firstReady = true;
        if (!busy && current === 0) nextAuto = Date.now() + AUTO_DELAY;
        armAuto();
        scheduleIdle();
      });
      void load(1);
    });
  }

  // Сцена основателей грузится первой: index.html, window.avelioAfterScene.
  function afterScene(run) {
    if (typeof window.avelioAfterScene === "function") window.avelioAfterScene(run);
    else run();
  }

  function start() {
    document.querySelectorAll("section.sc").forEach(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
