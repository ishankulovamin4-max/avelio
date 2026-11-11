(() => {
  "use strict";

  // Вид сцены — вариант A «Картина в галерее» (выбран 10.11). now/b/c остаются данными, переключаются только window.__founders.variant(name) для замеров.
  const DEFAULT_VARIANT = "a";

  // Сцена «Комната с фотографии» — content/avelio-concept/team/room-photo/spec.md.
  // Весь анимируемый мир рисуется на одном canvas: точное наложение поз
  // (lighter = предумноженное смешение), маски пальцев и ладони, экран с рамкой,
  // тенями и растворением. Подписи имён и нажатие на корпус — кнопки поверх.
  // Цвета рамки и теней задаёт founders.css переменными --fr-* на .founder-stage.

  const root = document.getElementById("founders");
  const phoneQuery = matchMedia("(max-width: 699px)");

  // Раскладка телефона не ждёт данных и картинок.
  function syncShellClass() {
    if (!root) return;
    root.classList.toggle("is-shell", phoneQuery.matches);
    const start = document.getElementById("avelio-start");
    if (start && start.contains(root)) {
      start.classList.toggle("is-founders-shell", phoneQuery.matches);
    }
  }

  syncShellClass();

  const hero = document.getElementById("hero");
  const pin = root && root.querySelector(".founders-pin");
  const actions = hero && hero.querySelector(".hero-actions");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const tabletQuery = matchMedia("(min-width: 700px) and (max-width: 1099px)");

  const ROOM_DIR = "founders/room/";
  const KEYS = ["amin", "roman"];

  const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const radians = degrees => degrees * Math.PI / 180;

  // Решаем x(t), а не подставляем прогресс вместо параметра кривой.
  function bezier(x1, y1, x2, y2) {
    const coordinate = (t, a, b) =>
      3 * (1 - t) * (1 - t) * t * a +
      3 * (1 - t) * t * t * b + t * t * t;

    return value => {
      const x = clamp(value);
      if (x === 0 || x === 1) return x;
      let low = 0;
      let high = 1;
      for (let index = 0; index < 22; index++) {
        const middle = (low + high) / 2;
        if (coordinate(middle, x1, x2) < x) low = middle;
        else high = middle;
      }
      return coordinate((low + high) / 2, y1, y2);
    };
  }

  // §7: E — позы, прозрачность, реакции; M — карточка и диван; D — уход экрана вниз.
  const E = value => variant.curves.e(value);
  const M = value => variant.curves.m(value);
  const D = value => variant.curves.d(value);
  const span = (value, a, b, curve) => curve(clamp((value - a) / (b - a)));

  // §4. Доли ширины W и высоты H области анимации.
  // screen — (x/W, y/H, ширина/W, высота/H); sofa — внешний диван (x/W, y/H, ширина/W),
  // высота рамки дивана всегда ширина / 2,5; card — ширина карточки / W.
  const LAYOUTS = {
    wide: { amin: 0.18, roman: 0.82, screen: [0.29, 0.20, 0.42, 0.43], sofa: [0.25, 0.50, 0.50], card: 0.075 },
    tablet: { amin: 0.20, roman: 0.80, screen: [0.15, 0.28, 0.70, 0.44], sofa: [0.10, 0.59, 0.80], card: 0.11 },
    phone: { amin: 0.18, roman: 0.82, screen: [0.27, 0.24, 0.46, 0.43], sofa: [0.25, 0.58982, 0.50], card: 0.09 }
  };

  // §3: видимая высота фигуры 0,68H, ступни на 0,80H.
  const FIGURE_HEIGHT = 0.68;
  const FEET_Y = 0.80;

  // §7.1. Сегменты поз по возрастанию q: [начало, конец, из, в]. Между сегментами
  // держится последняя поза. Моргание отдельно, по времени; жесты остаются функциями q.
  const TRACKS = {
    amin: [
      [0.20, 0.23, "calm", "apply"],
      [0.28, 0.36, "apply", "calm"],
      [0.80, 0.86, "calm", "pleased"],
      [0.86, 0.92, "pleased", "calm"]
    ],
    roman: [
      [0.30, 0.34, "calm", "push"],
      [0.65, 0.69, "push", "switch"],
      [0.83, 0.89, "switch", "pleased"],
      [0.92, 0.98, "pleased", "calm"]
    ]
  };

  // Всё ниже — в единицах рамки поз 1024×1536 (manifest.frame).
  // Корпус для нажатия: §3, спокойный корпус x 300…724 от волос до подошв.
  const BODY = [300, 108, 724, 1428];
  // Щепоть Амина держит карточку за нижнюю кромку: точка захвата лежит на (0; 0,44)
  // размера карточки от её центра (в белой кайме) и поворачивается вместе с наклоном.
  const CARD_HOLD = [0, 0.44];
  // Участок пальцев поверх карточки — мягкий круг вокруг текущей точки захвата:
  // на полпути карточка закрывает обе гаснущие руки, двух щепотей поверх фото нет.
  const FINGERS = { radius: 46, core: 0.62 };
  // Кисть Романа поверх спинки: мягкий эллипс от точки руки к запястью.
  const PALMS = [
    { pose: "calm", dx: 8, dy: -42, rx: 64, ry: 92 },
    { pose: "push", dx: 12, dy: -26, rx: 80, ry: 62 }
  ];
  // Кивок Амина (§3, §7.1): наклон головы до 2,5° вокруг шеи, только на весе позы pleased.
  const NOD = { degrees: 2.5, pivot: [512, 362], feather: [352, 384], half: 140 };
  // Овалы лиц (cx, cy, rx, ry) — те же, что в tools/room-photo-pose.py; для проверки.
  const FACES = { amin: [523, 272, 82, 78], roman: [528, 285, 72, 78] };
  // Высота головы с волосами и подбородком (§3): 108…348.
  const HEAD = { top: 108, bottom: 348, half: 118 };

  // Горизонтальный разрез корпуса — в координатах manifest.frame.
  // У Романа опущенная рука продлевает верхний спрайт слева от корпуса.
  const LIFE = {
    amin: { waist: 820, breathPeriod: 4600 },
    roman: { waist: 840, breathPeriod: 5700, armRight: 362, armBottom: 1120 },
    poses: {
      amin: {
        calm: { lean: -2.1, lift: 0 },
        apply: { lean: 2.5, lift: 0 },
        pleased: { lean: -2.1, lift: 0.45 }
      },
      roman: {
        calm: { lean: 2.1, lift: 0 },
        push: { lean: -2.5, lift: 0 },
        switch: { lean: 2.1, lift: 0.65 },
        pleased: { lean: -2.1, lift: 0.45 }
      }
    },
    prepareMs: 100,
    peakMs: 250,
    poseMs: 950,
    snap: 0.05
  };
  const randomBetween = (a, b) => a + Math.random() * (b - a);
  const identityLifeTransform = () => ({ tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 });
  const lifePeople = Object.fromEntries(KEYS.map(key => [key, {
    phase: randomBetween(0, Math.PI * 2),
    pose: null,
    blink: false,
    blinks: 0,
    nextBlink: randomBetween(2500, 6000),
    closeUntil: 0,
    doubleAt: null,
    shift: 0,
    accent: false,
    accents: 0,
    event: null,
    nextAccent: randomBetween(7000, 11000),
    lean: 0,
    nod: 0,
    transform: identityLifeTransform()
  }]));
  let lifeClock = 0;
  let lifeLastTime = null;
  let lifeLastPaint = -Infinity;
  let lifeSleeping = false;
  let lifeDebug = false;
  let blinkOwner = null;
  let blinkReservedUntil = 0;
  let lastIdleAccent = -Infinity;
  let lifeRecording = false;
  let lifeJournal = [];
  let lifeTimes = [];
  let layerCache = null;
  let drawingLife = false;
  let drawnCardShift = { dx: 0, dy: 0 };
  const drawnColumns = { amin: false, roman: false };

  const LOOK_DEFAULTS = {
    frame: "#efe8dd",
    frameEdge: "rgba(140, 118, 92, 0.30)",
    frameInner: "rgba(140, 118, 92, 0.22)",
    screenShadow: "rgba(58, 44, 26, 0.14)",
    screenShadowBlur: 0.07,
    screenShadowY: 0.035,
    contactShadow: "rgba(48, 36, 20, 0.20)",
    roomShadow: "rgba(84, 58, 28, 0.30)",
    cardShadow: "rgba(40, 30, 15, 0.18)",
    cardShadowBlur: 0.02
  };
  const LOOK_VARS = {
    frame: "--fr-frame",
    frameEdge: "--fr-frame-edge",
    frameInner: "--fr-frame-inner",
    screenShadow: "--fr-screen-shadow",
    screenShadowBlur: "--fr-screen-shadow-blur",
    screenShadowY: "--fr-screen-shadow-y",
    contactShadow: "--fr-contact-shadow",
    roomShadow: "--fr-room-shadow",
    cardShadow: "--fr-card-shadow",
    cardShadowBlur: "--fr-card-shadow-blur"
  };

  const smoothPose = t => t * t * (3 - 2 * t);
  const softPose = t => t * t * t * (t * (6 * t - 15) + 10);
  const VARIANTS = {
    now: {
      title: "Текущая подача",
      tau: 110,
      travelMs: 600,
      poseFadeMs: 160,
      poseCurve: smoothPose,
      feather: 0.45,
      light: 0,
      vignette: 0,
      curves: {
        e: bezier(0.42, 0, 0.58, 1),
        m: bezier(0.33, 0, 0.20, 1),
        d: bezier(0.40, 0, 0.60, 1),
        fade: bezier(0.42, 0, 0.58, 1)
      },
      look: {}
    },
    a: {
      title: "Картина в галерее",
      tau: 150,
      travelMs: 800,
      poseFadeMs: 220,
      poseCurve: softPose,
      feather: 0.65,
      light: 0,
      vignette: 0,
      curves: {
        e: bezier(0.38, 0, 0.62, 1),
        m: bezier(0.30, 0, 0.20, 1),
        d: bezier(0.36, 0, 0.50, 1),
        fade: bezier(0.32, 0, 0.40, 1)
      },
      look: {
        presentation: "gallery",
        surround: 0.065,
        frame: "#fffefa",
        frameEdge: "rgba(104, 97, 86, 0.22)",
        frameInner: "rgba(104, 97, 86, 0.30)",
        screenShadow: "rgba(58, 51, 42, 0.30)",
        screenShadowBlur: 0.13,
        screenShadowY: 0.055,
        contactShadow: "rgba(54, 49, 42, 0.16)",
        roomShadow: "rgba(54, 49, 42, 0.22)",
        cardShadow: "rgba(40, 30, 15, 0.12)",
        cardShadowBlur: 0.012
      }
    },
    b: {
      title: "Парящий экран",
      tau: 125,
      travelMs: 680,
      poseFadeMs: 190,
      poseCurve: bezier(0.35, 0, 0.65, 1),
      feather: 0.50,
      light: 0,
      vignette: 0,
      curves: {
        e: bezier(0.45, 0, 0.55, 1),
        m: bezier(0.36, 0, 0.30, 1),
        d: bezier(0.42, 0, 0.58, 1),
        fade: bezier(0.42, 0, 0.58, 1)
      },
      look: {
        presentation: "floating",
        frame: "transparent",
        frameEdge: "transparent",
        frameInner: "transparent",
        screenShadow: "rgba(65, 61, 54, 0.30)",
        screenShadowBlur: 0,
        screenShadowY: 0,
        contactShadow: "rgba(54, 51, 46, 0.19)",
        roomShadow: "rgba(54, 51, 46, 0.24)",
        cardShadow: "rgba(40, 30, 15, 0.12)",
        cardShadowBlur: 0.010
      }
    },
    c: {
      title: "Светлая ниша",
      tau: 190,
      travelMs: 1050,
      poseFadeMs: 260,
      poseCurve: softPose,
      feather: 0.85,
      light: 0,
      vignette: 0,
      curves: {
        e: bezier(0.48, 0, 0.52, 1),
        m: bezier(0.28, 0, 0.12, 1),
        d: bezier(0.32, 0, 0.42, 1),
        fade: bezier(0.28, 0, 0.30, 1)
      },
      look: {
        presentation: "niche",
        surround: 0.085,
        frame: "#eee5d8",
        frameEdge: "rgba(117, 102, 82, 0.16)",
        frameInner: "rgba(117, 102, 82, 0.24)",
        screenShadow: "rgba(101, 85, 62, 0.20)",
        screenShadowBlur: 0.06,
        screenShadowY: 0.025,
        contactShadow: "rgba(98, 80, 57, 0.15)",
        roomShadow: "rgba(98, 80, 57, 0.22)",
        cardShadow: "rgba(40, 30, 15, 0.12)",
        cardShadowBlur: 0.012
      }
    }
  };
  let variantName = DEFAULT_VARIANT;
  let variant = VARIANTS[variantName];

  let ready = false;
  let sceneFailed = false;
  let shellResizeObserver;
  let visible = false;
  let canvasVisible = false;
  let forced = null;
  let p = 0;
  let q = 0;
  let filtered = 0;
  let raf = 0;
  let lastFrame = null;
  let recording = false;
  let journal = [];
  let lastKey = "";

  let manifest;
  let texts;
  let stage;
  let canvas;
  let ctx;
  let track;
  let group;
  let probe;
  let dialog;
  let mode = "wide";
  let staticMode = false;
  let scroll = null;
  let geo = null;
  let look = { ...LOOK_DEFAULTS };
  let resizeObserver;
  let intersectionObserver;
  let canvasObserver;
  let measurePending = 0;
  let opener = null;
  let ownsLock = false;
  let backdropDown = false;

  const images = {};
  const people = {};
  const work = {};

  window.__founders = {
    setProgress(value) {
      if (value === null) {
        forced = null;
        filtered = q;
        lastFrame = null;
        updateTarget();
        wake();
        return;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      forced = clamp(value);
      p = q = filtered = forced;
      lastFrame = null;
      if (ready) render(true);
    },
    state() {
      const st = currentState();
      return {
        ready,
        mode,
        static: staticMode,
        reduced: motion.matches,
        p,
        q,
        forced,
        scroll: scroll ? { ...scroll } : null,
        mFit: geo ? geo.mFit : null,
        poses: { amin: { ...st.amin }, roman: { ...st.roman } },
        card: { ...st.card },
        reveal: st.reveal,
        move: st.move,
        swap: st.swap,
        down: st.down,
        fade: st.fade,
        nod: st.nod
      };
    },
    life() {
      return describeLife();
    },
    lifeLog(enabled) {
      if (enabled === true) {
        lifeJournal = [];
        lifeRecording = true;
        return true;
      }
      if (enabled === false) lifeRecording = false;
      return lifeJournal.map(entry => ({
        ...entry,
        amin: { ...entry.amin },
        roman: { ...entry.roman }
      }));
    },
    geometry(value) {
      return ready && geo ? describe(value) : null;
    },
    layers(value) {
      return ready && geo ? debugLayers(value) : null;
    },
    journal(enabled) {
      if (enabled === true) {
        journal = [];
        recording = true;
        return true;
      }
      if (enabled === false) {
        recording = false;
        return journal;
      }
      return journal;
    },
    variant(name) {
      if (name === undefined) return variantName;
      return selectVariant(name);
    }
  };

  if (!root || !hero || !pin || !actions) return;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function decorative(node) {
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function selectVariant(name) {
    if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(VARIANTS, name)) return variantName;
    variantName = name;
    variant = VARIANTS[name];
    POSE_FADE_MS = variant.poseFadeMs;
    layerCache = null;
    if (ready) {
      readLook();
      for (const key of KEYS) {
        people[key].cache = "";
        people[key].shown = null;
        people[key].fade = null;
      }
      lastKey = "";
      render(true);
      wake();
    }
    return variantName;
  }

  function scratch() {
    const node = document.createElement("canvas");
    const context = node.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    return { canvas: node, ctx: context };
  }

  function sizeCanvas(target, width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (target.canvas.width !== w) target.canvas.width = w;
    if (target.canvas.height !== h) target.canvas.height = h;
    target.ctx.imageSmoothingEnabled = true;
    target.ctx.imageSmoothingQuality = "high";
  }

  // Для холстов, у которых размер меняется каждый кадр (кисть, щепоть, смена дивана):
  // холст только растёт с запасом и не пересоздаётся; рисуется участок w×h в левом верхнем углу.
  function fitCanvas(target, width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (target.canvas.width < w || target.canvas.height < h) {
      target.canvas.width = Math.max(target.canvas.width, Math.ceil(w / 64) * 64);
      target.canvas.height = Math.max(target.canvas.height, Math.ceil(h / 64) * 64);
      target.ctx.imageSmoothingEnabled = true;
      target.ctx.imageSmoothingQuality = "high";
    }
    return { w, h };
  }

  // Две повторные попытки, включая ошибки чтения JSON и декодирования.
  async function retryLoad(load) {
    const delays = [1500, 4000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await load();
      } catch (error) {
        if (attempt >= delays.length) throw error;
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }
    }
  }

  async function fetchJSON(url) {
    return retryLoad(async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response.json();
    });
  }

  async function loadImage(file) {
    return retryLoad(async () => {
      const image = new Image();
      image.decoding = "async";
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`Не загружено: ${file}`));
      });
      image.src = ROOM_DIR + file;
      await loaded;
      await image.decode();
      return image;
    });
  }

  function validateData() {
    const positive = value => Number.isFinite(value) && value > 0;
    const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
    const rect = value => Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) &&
      value[2] > 0 && value[3] > 0;
    const text = value => typeof value === "string" && value.length > 0;
    const frame = manifest.frame;
    const poses = { amin: ["calm", "blink", "apply", "pleased"], roman: ["calm", "blink", "push", "switch", "pleased"] };

    const ok = frame && positive(frame.w) && positive(frame.h) &&
      Number.isFinite(frame.hairTop) && Number.isFinite(frame.soles) && frame.soles > frame.hairTop &&
      Number.isFinite(frame.axis) &&
      KEYS.every(key => {
        const data = manifest.people && manifest.people[key];
        const copy = texts.people && texts.people[key];
        return data && rect(data.crop) && data.poses && poses[key].every(pose => text(data.poses[pose])) &&
          copy && text(copy.name) && text(copy.role) && text(copy.aria) &&
          Array.isArray(copy.bio) && copy.bio.length > 0 && copy.bio.every(text);
      }) &&
      point(manifest.people.amin.grip && manifest.people.amin.grip.calm) &&
      point(manifest.people.amin.grip.apply) &&
      point(manifest.people.roman.hand && manifest.people.roman.hand.calm) &&
      point(manifest.people.roman.hand.push) &&
      manifest.sofa && text(manifest.sofa.a && manifest.sofa.a.file) && text(manifest.sofa.b && manifest.sofa.b.file) &&
      positive(manifest.sofa.w) && positive(manifest.sofa.h) &&
      Math.abs(manifest.sofa.w / manifest.sofa.h - 2.5) < 0.01 &&
      manifest.room && text(manifest.room.file) && text(manifest.room.sketch) &&
      manifest.card && text(manifest.card.file) && positive(manifest.card.w) && positive(manifest.card.h) &&
      texts.stage && text(texts.stage.eyebrow) &&
      texts.dialog && text(texts.dialog.cta) && text(texts.dialog.close);

    if (!ok) throw new Error("founders/room/manifest.json или texts.json не соответствует сцене");
  }

  async function loadImages() {
    const jobs = [];
    for (const key of KEYS) {
      for (const [pose, file] of Object.entries(manifest.people[key].poses)) {
        jobs.push(loadImage(file).then(image => { images[`${key}-${pose}`] = image; }));
      }
    }
    jobs.push(loadImage(manifest.sofa.a.file).then(image => { images.sofaA = image; }));
    jobs.push(loadImage(manifest.sofa.b.file).then(image => { images.sofaB = image; }));
    jobs.push(loadImage(manifest.room.file).then(image => { images.room = image; }));
    jobs.push(loadImage(manifest.room.sketch).then(image => { images.sketch = image; }));
    jobs.push(loadImage(manifest.card.file).then(image => { images.card = image; }));
    await Promise.all(jobs);
  }

  function buildSceneFrame() {
    stage = element("div", "founder-stage");

    // §4.3: на телефоне закрепляется только группа «сцена → кнопка → ссылка → факты».
    // На компьютере и планшете обе обёртки — display: contents, сетка первого экрана прежняя.
    track = element("div", "founder-track");
    group = element("div", "founder-group");
    actions.before(track);
    group.append(stage, actions);
    track.append(group);

    // Замер 100svh и нижнего безопасного поля для проверки «группа помещается».
    probe = decorative(element("div", "founder-probe"));
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;box-sizing:border-box;visibility:hidden;pointer-events:none;" +
      "height:100vh;height:100svh;padding:0 0 env(safe-area-inset-bottom, 0px) 0;";
    document.body.append(probe);
  }

  function prepareShell() {
    if (ready) return;
    if (!phoneQuery.matches) {
      if (track) teardownScene();
      setStatic(false);
      scroll = null;
      root.classList.remove("is-reduced");
      return;
    }
    if (sceneFailed) return;

    root.classList.toggle("is-reduced", motion.matches);
    if (!stage) {
      // Пустая сцена имеет те же размеры, что и готовая, включая область имён.
      buildSceneFrame();
      shellResizeObserver = new ResizeObserver(scheduleMeasure);
      shellResizeObserver.observe(stage);
      shellResizeObserver.observe(group);
      shellResizeObserver.observe(root);
    }
    measure();
  }

  function buildScene() {
    if (!stage) buildSceneFrame();
    stage.setAttribute("role", "group");
    stage.setAttribute("aria-label", texts.stage.eyebrow);

    canvas = decorative(element("canvas", "founder-canvas"));
    ctx = canvas.getContext("2d");
    stage.append(canvas);

    for (const key of KEYS) {
      const copy = texts.people[key];

      // Неподвижный корпус: нажатие мышью или пальцем. С клавиатуры — подпись имени.
      const body = decorative(element("button", `founder-body founder-body--${key}`));
      body.type = "button";
      body.tabIndex = -1;

      const name = element("button", `founder-name founder-name--${key}`);
      name.type = "button";
      name.setAttribute("aria-label", copy.aria);
      name.setAttribute("aria-haspopup", "dialog");
      name.append(
        element("span", "founder-name-title", copy.name),
        element("span", "founder-name-role", copy.role)
      );

      body.addEventListener("click", () => openDialog(key, name));
      name.addEventListener("click", () => openDialog(key, name));
      stage.append(body, name);

      const art = scratch();
      people[key] = { key, body, name, art, cache: "" };
    }

    for (const name of ["screen", "reveal", "blend", "overlay", "mask", "occluder", "head", "headMask", "variantFrame", "variantLight", "lifeLower", "lifeSofa", "lifeCard", "lifeTop"]) {
      work[name] = scratch();
    }
  }

  function teardownScene() {
    if (shellResizeObserver) shellResizeObserver.disconnect();
    shellResizeObserver = null;
    if (track && track.isConnected) {
      track.before(actions);
      track.remove();
    }
    if (probe) probe.remove();
    stage = null;
    track = null;
    group = null;
    probe = null;
    if (dialog) dialog.remove();
  }

  function buildDialog() {
    dialog = element("dialog", "founder-dialog");
    dialog.setAttribute("aria-labelledby", "founder-dialog-title");
    dialog.setAttribute("aria-describedby", "founder-dialog-role");

    const card = element("div", "founder-dialog-card");
    const photo = element("img", "founder-dialog-photo");
    photo.alt = "";
    photo.decoding = "async";

    const body = element("div", "founder-dialog-body");
    const title = element("h2", "founder-dialog-title");
    title.id = "founder-dialog-title";

    const role = element("p", "founder-dialog-role");
    role.id = "founder-dialog-role";

    const bio = element("div", "founder-dialog-bio");
    const cta = element("a", "button founder-dialog-cta", texts.dialog.cta);
    cta.href = "#send";

    const close = element("button", "founder-dialog-close", texts.dialog.close);
    close.type = "button";
    close.autofocus = true;
    close.addEventListener("click", () => dialog.close());
    cta.addEventListener("click", () => dialog.close());

    body.append(title, role, bio, cta);
    card.append(photo, body, close);
    dialog.append(card);
    root.append(dialog);

    function outside(event) {
      const box = dialog.getBoundingClientRect();
      return event.clientX < box.left || event.clientX > box.right ||
        event.clientY < box.top || event.clientY > box.bottom;
    }

    dialog.addEventListener("pointerdown", event => {
      backdropDown = event.target === dialog && outside(event);
    });
    dialog.addEventListener("click", event => {
      if (backdropDown && event.target === dialog && outside(event)) dialog.close();
      backdropDown = false;
    });

    dialog.addEventListener("close", () => {
      if (ownsLock) document.documentElement.classList.remove("f-plan-locked");
      ownsLock = false;
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
      wake();
    });
  }

  function openDialog(key, button) {
    if (!dialog || dialog.open) return;

    const copy = texts.people[key];
    const photo = dialog.querySelector(".founder-dialog-photo");
    photo.src = `founders/img/${key}-photo.webp`;
    photo.alt = copy.name;
    photo.width = key === "amin" ? 640 : 749;
    photo.height = key === "amin" ? 640 : 1000;

    dialog.querySelector(".founder-dialog-title").textContent = copy.name;
    dialog.querySelector(".founder-dialog-role").textContent = copy.role;
    dialog.querySelector(".founder-dialog-bio").replaceChildren(
      ...copy.bio.map(text => element("p", "", text))
    );

    opener = button;
    dialog.showModal();
    ownsLock = !document.documentElement.classList.contains("f-plan-locked");
    document.documentElement.classList.add("f-plan-locked");
  }

  // ---------- Состояние сцены как функция q (§7.1) ----------

  function poseAt(segments, value) {
    let pose = "calm";
    for (const [a, b, from, to] of segments) {
      if (value < a) break;
      if (value < b) return { from, to, w: E((value - a) / (b - a)) };
      pose = to;
    }
    return { from: pose, to: pose, w: 0 };
  }

  function weightOf(pose, name) {
    if (pose.from === name && pose.to === name) return 1;
    if (pose.to === name) return pose.w;
    if (pose.from === name) return 1 - pose.w;
    return 0;
  }

  function stateAt(value) {
    const amin = poseAt(TRACKS.amin, value);
    const roman = poseAt(TRACKS.roman, value);
    return {
      q: value,
      amin,
      roman,
      nod: weightOf(amin, "pleased"),
      romanNod: weightOf(roman, "pleased"),
      card: { t: span(value, 0.10, 0.26, M), alpha: 1 - span(value, 0.26, 0.32, E) },
      reveal: span(value, 0.24, 0.36, E),
      move: span(value, 0.38, 0.64, M),
      swap: span(value, 0.72, 0.80, E),
      down: span(value, 0.88, 0.98, D),
      fade: 1 - span(value, 0.90, 0.98, variant.curves.fade)
    };
  }

  // §10: один кадр результата до финального ухода экрана.
  function restingState() {
    const calm = { from: "calm", to: "calm", w: 0 };
    return {
      q: null,
      amin: { ...calm },
      roman: { ...calm },
      nod: 0,
      romanNod: 0,
      card: { t: 0, alpha: 0 },
      reveal: 1,
      move: 1,
      swap: 1,
      down: 0,
      fade: 1
    };
  }

  function isResting() {
    return motion.matches || staticMode;
  }

  function currentState() {
    return isResting() ? restingState() : stateAt(q);
  }

  function stateKey(st) {
    const pose = value => `${value.from}${value.to}${value.w.toFixed(5)}`;
    return [
      pose(st.amin), pose(st.roman), st.nod, st.romanNod, st.card.t, st.card.alpha,
      st.reveal, st.move, st.swap, st.down, st.fade
    ].map(value => typeof value === "number" ? value.toFixed(5) : value).join("|");
  }

  // ---------- Жизнь по времени, отдельно от проверяемого состояния q ----------

  function lifeReason() {
    if (!ready || !geo) return "not-ready";
    if (forced !== null) return "forced";
    if (motion.matches) return "reduced-motion";
    if (staticMode) return "static";
    if (lifeDebug) return "layers";
    if (document.hidden) return "hidden";
    if (!visible || !canvasVisible) return "offscreen";
    if (lifeSleeping) return "sleep";
    return null;
  }

  function describeLife() {
    const reason = lifeReason();
    const now = performance.now();
    const recent = lifeTimes.filter(t => t >= now - 2000);
    const st = currentState();
    return {
      active: reason === null,
      reason,
      fps: recent.length > 1 ? (recent.length - 1) * 1000 / Math.max(1, now - recent[0]) : 0,
      people: Object.fromEntries(KEYS.map(key => {
        const item = lifePeople[key];
        const pose = st[key].w >= 0.5 ? st[key].to : st[key].from;
        return [key, {
          pose: reason === null ? (item.blink ? "blink" : people[key].shown || item.pose) : pose,
          blink: reason === null && item.blink,
          blinks: item.blinks,
          shift: reason === null ? item.shift : 0,
          accent: reason === null && item.accent,
          accents: item.accents,
          lean: reason === null ? item.lean : 0,
          nod: key === "amin" ? st.nod : st.romanNod
        }];
      }))
    };
  }

  function resetLife() {
    lifeLastTime = null;
    blinkOwner = null;
    blinkReservedUntil = 0;
    lastIdleAccent = -Infinity;
    for (const key of KEYS) {
      const item = lifePeople[key];
      item.blink = false;
      item.doubleAt = null;
      item.nextBlink = lifeClock + randomBetween(2500, 6000);
      item.nextAccent = lifeClock + randomBetween(7000, 11000);
      item.event = null;
      item.accent = false;
      item.lean = 0;
      item.pose = null;
      item.shift = 0;
      item.transform = identityLifeTransform();
    }
  }

  function updateBlink(key, now, allowed) {
    const item = lifePeople[key];
    if (!allowed) {
      if (item.blink || item.doubleAt !== null) {
        item.nextBlink = now + randomBetween(2500, 6000);
      }
      item.blink = false;
      item.doubleAt = null;
      return;
    }
    if (item.blink && now >= item.closeUntil) item.blink = false;
    if (item.blink) return;

    const second = item.doubleAt !== null;
    const due = second ? item.doubleAt : item.nextBlink;
    if (now < due) return;
    // Резервируем всю двойную серию: другой герой не вклинивается между закрытиями.
    if (blinkOwner !== key && now < blinkReservedUntil) return;

    item.blink = true;
    item.blinks++;
    item.closeUntil = now + randomBetween(90, 105);
    blinkOwner = key;
    if (!second && Math.random() < 0.22) {
      item.doubleAt = item.closeUntil + randomBetween(150, 215);
      blinkReservedUntil = item.doubleAt + 340;
    } else {
      item.doubleAt = null;
      item.nextBlink = now + randomBetween(2500, 6000);
      blinkReservedUntil = now + 340;
    }
  }

  function romanArmColumn() {
    const person = people.roman;
    return !(person.shown === "pleased" ||
      (person.fade && (person.fade.from === "pleased" || person.shown === "pleased")));
  }

  // Все координаты здесь — на сетке готового растра фигуры.
  function lifeFigureGeometry(key) {
    const person = people[key];
    const crop = person.cropFrame;
    const art = person.art.canvas;
    const config = LIFE[key];
    const fx = value => (value - crop[0]) * art.width / crop[2];
    const fy = value => (value - crop[1]) * art.height / crop[3];
    const waist = clamp(Math.round(fy(config.waist)), 1, art.height - 1);
    const push = key === "roman" && lifePeople[key].pose === "push";
    const pivot = push ? manifest.people.roman.hand.push : [manifest.frame.axis, config.waist];
    const column = key === "roman" && romanArmColumn();
    const armX = !column || config.armRight === undefined ? 0 : clamp(Math.round(fx(config.armRight)), 0, art.width);
    const armY = !column || config.armBottom === undefined ? waist : clamp(Math.round(fy(config.armBottom)), waist, art.height);
    return {
      w: art.width,
      h: art.height,
      waist,
      armX,
      armY,
      px: fx(pivot[0]),
      py: fy(pivot[1]),
      faceX: fx(FACES[key][0]),
      faceY: fy(FACES[key][1])
    };
  }

  function startLifeAccent(item, kind, lean, lift, duration) {
    item.event = {
      kind,
      start: lifeClock,
      duration,
      lean,
      lift,
      fromRot: item.transform.rot,
      fromSy: item.transform.sy
    };
    item.accents++;
    if (kind === "idle") {
      lastIdleAccent = lifeClock;
      item.nextAccent = lifeClock + randomBetween(7000, 13000);
    }
  }

  function accentEnvelope(event, age) {
    if (age >= event.duration) return 0;
    if (event.kind === "idle") {
      return Math.sin(Math.PI * clamp(age / event.duration)) ** 2;
    }
    if (age < LIFE.prepareMs) {
      return -0.22 * softPose(clamp(age / LIFE.prepareMs));
    }
    if (age < LIFE.peakMs) {
      return lerp(-0.22, 1, softPose((age - LIFE.prepareMs) / (LIFE.peakMs - LIFE.prepareMs)));
    }
    return 1 - softPose((age - LIFE.peakMs) / (event.duration - LIFE.peakMs));
  }

  function updateLife(st, now) {
    const elapsed = lifeLastTime === null ? 0 : Math.min(64, Math.max(0, now - lifeLastTime));
    lifeLastTime = now;
    lifeClock += elapsed;

    for (const key of KEYS) {
      const item = lifePeople[key];
      const config = LIFE[key];
      const pose = st[key].w >= 0.5 ? st[key].to : st[key].from;
      if (item.pose !== pose) {
        if (item.pose !== null) {
          const action = LIFE.poses[key][pose] || { lean: 0, lift: 0 };
          startLifeAccent(item, "pose", action.lean, action.lift, LIFE.poseMs);
        }
        item.pose = pose;
      }

      if (item.event && lifeClock - item.event.start >= item.event.duration) item.event = null;
      const calm = pose === "calm" || pose === "pleased";
      const settled = people[key].shown === pose && !people[key].fade &&
        Math.abs(p - q) <= 0.0005 && Math.abs(p - filtered) <= 0.0005;
      if (!item.event && calm && settled && lifeClock >= item.nextAccent &&
          lifeClock - lastIdleAccent >= 1600) {
        startLifeAccent(
          item, "idle",
          randomBetween(1, 1.5) * (Math.random() < 0.5 ? -1 : 1),
          0, randomBetween(1200, 1600)
        );
      }

      const allowed = pose === "calm" && people[key].shown === "calm" && !people[key].fade;
      updateBlink(key, lifeClock, allowed);
      const amplitude = Math.max(1, Math.round(geo.dpr));
      item.shift = Math.round(amplitude * (
        1 + Math.sin(lifeClock * Math.PI * 2 / config.breathPeriod + item.phase)
      ) / 2);
      item.nod = key === "amin" ? st.nod : st.romanNod;

      const g = lifeFigureGeometry(key);
      const height = Math.max(1, (g.py - g.faceY) / geo.ky);
      let rot = 0;
      let sy = 1;
      if (item.event) {
        const age = lifeClock - item.event.start;
        const envelope = accentEnvelope(item.event, age);
        const carry = item.event.kind === "pose"
          ? 1 - softPose(clamp(age / LIFE.peakMs))
          : 0;
        rot = item.event.lean * envelope / height + item.event.fromRot * carry;
        sy = 1 + item.event.lift * envelope / height + (item.event.fromSy - 1) * carry;
      }

      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const x = (g.faceX - g.px) / geo.kx;
      const y = (g.faceY - g.py) / geo.ky;
      const dx = cos * x - sin * sy * y - x;
      const dy = sin * x + cos * sy * y - y;
      // Консервативная граница для всей головы, а не только её центра.
      const radius = Math.hypot(
        (Math.abs(g.faceX - g.px) + HEAD.half * geo.s * geo.kx) / geo.kx,
        (Math.abs(g.faceY - g.py) + (HEAD.bottom - HEAD.top) * geo.s * geo.ky) / geo.ky
      );
      const bound = radius * (Math.abs(rot) * Math.max(1, sy) + Math.abs(sy - 1)) *
        Math.max(geo.kx, geo.ky);
      item.accent = bound >= LIFE.snap;
      item.lean = item.accent ? dx : 0;
      item.transform = {
        tx: 0,
        ty: (item.accent ? dy : 0) - item.shift / geo.ky,
        rot: item.accent ? rot : 0,
        sx: 1,
        sy: item.accent ? sy : 1
      };
    }
  }

  // ---------- Геометрия (§3–§5) ----------

  function computeGeometry(W, H, layoutName, kx, ky) {
    const layout = LAYOUTS[layoutName];
    const frame = manifest.frame;
    const s = FIGURE_HEIGHT * H / (frame.soles - frame.hairTop);
    const feetY = FEET_Y * H;
    const g = { W, H, kx, ky, dpr: Math.min(window.devicePixelRatio || 1, 2), mode: layoutName, s, feetY, people: {} };

    for (const key of KEYS) {
      const cx = layout[key] * W;
      const crop = manifest.people[key].crop;
      const map = (fx, fy) => [cx + (fx - frame.axis) * s, feetY + (fy - frame.soles) * s];
      const [bx, by] = map(BODY[0], BODY[1]);
      g.people[key] = {
        cx,
        map,
        crop,
        rect: { x: cx + (crop[0] - frame.axis) * s, y: feetY + (crop[1] - frame.soles) * s, w: crop[2] * s, h: crop[3] * s },
        body: { x: bx, y: by, w: (BODY[2] - BODY[0]) * s, h: (BODY[3] - BODY[1]) * s }
      };
    }

    const [sx, sy, sw, sh] = [layout.screen[0] * W, layout.screen[1] * H, layout.screen[2] * W, layout.screen[3] * H];
    const small = Math.min(sw, sh);
    g.screen = { x: sx, y: sy, w: sw, h: sh, r: 0.04 * small };
    g.inner = { x: sx + 0.02 * sw, y: sy + 0.02 * sh, w: 0.96 * sw, h: 0.96 * sh, r: Math.max(0, 0.02 * small) };

    const outerWidth = layout.sofa[2] * W;
    g.sofaOut = { x: layout.sofa[0] * W, y: layout.sofa[1] * H, w: outerWidth, h: outerWidth / 2.5 };
    const innerWidth = 0.68 * g.inner.w;
    g.sofaIn = {
      x: g.inner.x + 0.16 * g.inner.w,
      y: g.inner.y + 0.88 * g.inner.h - innerWidth / 2.5,
      w: innerWidth,
      h: innerWidth / 2.5
    };
    g.mFit = findFit(g);

    const cardWidth = layout.card * W;
    g.card = { w: cardWidth, h: cardWidth * manifest.card.h / manifest.card.w };
    const grip = manifest.people.amin.grip;
    g.grip = { calm: g.people.amin.map(...grip.calm), apply: g.people.amin.map(...grip.apply) };

    const hand = manifest.people.roman.hand;
    g.palms = PALMS.filter(item => hand[item.pose]).map(item => {
      const [hx, hy] = hand[item.pose];
      const [x, y] = g.people.roman.map(hx + item.dx, hy + item.dy);
      return { x, y, rx: item.rx * s, ry: item.ry * s };
    });

    // Центр раскрытия цвета — место приложенной карточки, внутри окна экрана.
    const applied = cardPlacement(g, 1);
    g.reveal = {
      x: clamp(applied.cx - g.inner.x, 0, g.inner.w),
      y: clamp(applied.cy - g.inner.y, 0, g.inner.h)
    };
    const corners = [[0, 0], [g.inner.w, 0], [0, g.inner.h], [g.inner.w, g.inner.h]];
    g.reveal.far = Math.max(...corners.map(([x, y]) => Math.hypot(x - g.reveal.x, y - g.reveal.y)));

    return g;
  }

  function sofaRect(g, m) {
    const a = g.sofaOut;
    const b = g.sofaIn;
    const w = lerp(a.w, b.w, m);
    const cx = lerp(a.x + a.w / 2, b.x + b.w / 2, m);
    const cy = lerp(a.y + a.h / 2, b.y + b.h / 2, m);
    return { x: cx - w / 2, y: cy - w / 5, w, h: w / 2.5 };
  }

  function insideInner(g, r, tolerance = 0.5) {
    return r.x >= g.inner.x - tolerance && r.y >= g.inner.y - tolerance &&
      r.x + r.w <= g.inner.x + g.inner.w + tolerance && r.y + r.h <= g.inner.y + g.inner.h + tolerance;
  }

  // Первый m, с которого рамка дивана целиком во внутреннем окне (§6): с этой точки
  // диван живёт в слое экрана, а копия перед героями плавно гаснет к m = 1.
  function findFit(g) {
    if (insideInner(g, sofaRect(g, 0))) return 0;
    let low = 0;
    let high = 1;
    for (let index = 0; index < 30; index++) {
      const middle = (low + high) / 2;
      if (insideInner(g, sofaRect(g, middle))) high = middle;
      else low = middle;
    }
    return Math.min(1, high);
  }

  function frontAlpha(g, m) {
    if (m < g.mFit) return 1;
    if (m >= 1) return 0;
    return 1 - E((m - g.mFit) / Math.max(1e-6, 1 - g.mFit));
  }

  function cardPlacement(g, t) {
    const pinchX = lerp(g.grip.calm[0], g.grip.apply[0], t);
    const pinchY = lerp(g.grip.calm[1], g.grip.apply[1], t);
    const angle = radians(lerp(-8, 0, t));
    const hx = CARD_HOLD[0] * g.card.w;
    const hy = CARD_HOLD[1] * g.card.h;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      cx: pinchX - (hx * cos - hy * sin),
      cy: pinchY - (hx * sin + hy * cos),
      angle,
      pinch: [pinchX, pinchY]
    };
  }

  // ---------- Рисование ----------

  function parseColor(value) {
    const probeCtx = work.mask.ctx;
    probeCtx.fillStyle = "#000";
    probeCtx.fillStyle = value;
    const normalized = probeCtx.fillStyle;
    if (normalized.startsWith("#")) {
      const hex = normalized.slice(1);
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
    }
    const parts = normalized.match(/[\d.]+/g) || ["0", "0", "0", "1"];
    return [Number(parts[0]), Number(parts[1]), Number(parts[2]), parts[3] === undefined ? 1 : Number(parts[3])];
  }

  function rgba(color, factor) {
    const [r, g, b, a] = color;
    return `rgba(${r}, ${g}, ${b}, ${clamp(a * factor)})`;
  }

  function readLook() {
    root.dataset.foundersVariant = variantName;
    const style = getComputedStyle(stage);
    const next = { ...LOOK_DEFAULTS };
    for (const [key, name] of Object.entries(LOOK_VARS)) {
      const raw = style.getPropertyValue(name).trim();
      if (!raw) continue;
      if (typeof LOOK_DEFAULTS[key] === "number") {
        const number = parseFloat(raw);
        if (Number.isFinite(number) && number >= 0) next[key] = number;
      } else {
        next[key] = raw;
      }
    }
    Object.assign(next, variant.look);
    for (const key of ["contactShadow", "roomShadow"]) next[`${key}Color`] = parseColor(next[key]);
    look = next;
    work.variantFrame.geometry = null;
    work.variantLight.geometry = null;
  }

  function roundRect(c, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + w, y, x + w, y + h, radius);
    c.arcTo(x + w, y + h, x, y + h, radius);
    c.arcTo(x, y + h, x, y, radius);
    c.arcTo(x, y, x + w, y, radius);
    c.closePath();
  }

  function drawCover(c, image, box) {
    const iw = image.naturalWidth;
    const ih = image.naturalHeight;
    const scale = Math.max(box.w / iw, box.h / ih);
    const sw = box.w / scale;
    const sh = box.h / scale;
    c.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
  }

  // Мягкий эллипс: ровный цвет до core, затем спад к прозрачному краю; альфа больше 0 только внутри.
  function softEllipse(c, cx, cy, rx, ry, color, alpha, core = 0) {
    if (alpha <= 0.001 || rx <= 0 || ry <= 0) return;
    c.save();
    c.translate(cx, cy);
    c.scale(rx, ry);
    const gradient = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, rgba(color, alpha));
    if (core > 0) gradient.addColorStop(core, rgba(color, alpha));
    const middle = core > 0 ? core + (1 - core) * 0.5 : 0.55;
    gradient.addColorStop(middle, rgba(color, alpha * (core > 0 ? 0.5 : 0.55)));
    gradient.addColorStop(1, rgba(color, 0));
    c.fillStyle = gradient;
    c.beginPath();
    c.arc(0, 0, 1, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function setScene(c, g) {
    c.setTransform(g.kx, 0, 0, g.ky, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  function clearCanvas(target) {
    const c = target.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, target.canvas.width, target.canvas.height);
  }

  // Оформление вокруг неизменного экрана: один растр на размер/вариант.
  // В кадре прокрутки используются только готовый холст и прежние уход/растворение.
  function variantFrameArt() {
    const target = work.variantFrame;
    if (target.geometry === geo) return target.canvas;
    sizeCanvas(target, canvas.width, canvas.height);
    clearCanvas(target);
    const c = target.ctx;
    const screen = geo.screen;
    setScene(c, geo);

    if (look.presentation === "floating") {
      // Между нижней кромкой изображения и тенью остаётся видимый воздух.
      // Никакой заливки или обводки вокруг inner: экран действительно без рамки.
      softEllipse(
        c, screen.x + screen.w * 0.57, geo.H * 0.765,
        screen.w * 0.57, geo.H * 0.035,
        parseColor(look.screenShadow), 1, 0.15
      );
    } else if (look.presentation === "niche") {
      const pad = Math.min(screen.w, screen.h) * look.surround;
      const left = screen.x - pad;
      const right = screen.x + screen.w + pad;
      const top = screen.y - pad * 1.8;
      const base = Math.max(screen.y + screen.h + pad, geo.H * 0.735);
      const depth = Math.min(pad * 0.65, geo.H * 0.025);

      // Светлый архитектурный объём позади экрана, не новая геометрия контента.
      c.save();
      c.shadowColor = look.screenShadow;
      c.shadowBlur = look.screenShadowBlur * screen.h * geo.dpr;
      c.shadowOffsetY = look.screenShadowY * screen.h * geo.dpr;
      c.fillStyle = "#e9dfd0";
      roundRect(c, left, top, right - left, base - top, pad * 0.25);
      c.fill();
      c.restore();

      const recess = c.createLinearGradient(left, top, right, base);
      recess.addColorStop(0, "#d9cdbb");
      recess.addColorStop(0.16, "#f5eee2");
      recess.addColorStop(0.56, "#fffaf0");
      recess.addColorStop(1, "#e7dac6");
      c.fillStyle = recess;
      c.fillRect(left + pad * 0.4, top + pad * 0.4, right - left - pad * 0.8, base - top - pad * 0.4);

      // Верхний откос и боковые грани читаются даже на маленьком экране.
      c.fillStyle = "#fffaf2";
      c.beginPath();
      c.moveTo(left, top);
      c.lineTo(right, top);
      c.lineTo(right - pad * 0.4, top + pad * 0.4);
      c.lineTo(left + pad * 0.4, top + pad * 0.4);
      c.closePath();
      c.fill();

      c.fillStyle = "#d8cbb8";
      c.fillRect(left, top + pad * 0.4, pad * 0.4, base - top - pad * 0.4);
      c.fillStyle = "#fdf7ed";
      c.fillRect(right - pad * 0.4, top + pad * 0.4, pad * 0.4, base - top - pad * 0.4);

      // Широкая полка-подиум с отдельной передней гранью.
      c.fillStyle = "#fffaf2";
      c.beginPath();
      c.moveTo(left, base - depth);
      c.lineTo(right, base - depth);
      c.lineTo(right + pad * 0.55, base);
      c.lineTo(left - pad * 0.55, base);
      c.closePath();
      c.fill();

      const front = c.createLinearGradient(0, base, 0, base + depth);
      front.addColorStop(0, "#d9cbb6");
      front.addColorStop(1, "#eee4d5");
      c.fillStyle = front;
      c.fillRect(left - pad * 0.55, base, right - left + pad * 1.1, depth);

      c.fillStyle = look.frame;
      roundRect(c, screen.x, screen.y, screen.w, screen.h, screen.r);
      c.fill();
    } else {
      // Широкий белый багет добавляется снаружи: окно комнаты не уменьшается.
      const pad = Math.min(screen.w, screen.h) * look.surround;
      const x = screen.x - pad;
      const y = screen.y - pad;
      const w = screen.w + pad * 2;
      const h = screen.h + pad * 2;
      c.save();
      c.shadowColor = look.screenShadow;
      c.shadowBlur = look.screenShadowBlur * screen.h * geo.dpr;
      c.shadowOffsetY = look.screenShadowY * screen.h * geo.dpr;
      roundRect(c, x, y, w, h, screen.r * 0.65);
      c.fillStyle = look.frame;
      c.fill();
      c.restore();

      c.lineWidth = Math.max(1, pad * 0.12);
      c.strokeStyle = "#d9d3c9";
      roundRect(c, x, y, w, h, screen.r * 0.65);
      c.stroke();
      c.lineWidth = Math.max(1, pad * 0.18);
      c.strokeStyle = "#f0ece5";
      roundRect(c, x + pad * 0.4, y + pad * 0.4, w - pad * 0.8, h - pad * 0.8, screen.r * 0.5);
      c.stroke();
    }

    target.geometry = geo;
    return target.canvas;
  }

  // Статичный свет внутри комнаты: одинаков до, во время и после раскрытия, без вспышки.
  function variantLightArt() {
    const target = work.variantLight;
    if (target.geometry === geo) return target.canvas;
    const inner = geo.inner;
    sizeCanvas(target, inner.w * geo.kx, inner.h * geo.ky);
    clearCanvas(target);
    const c = target.ctx;
    c.save();
    c.scale(target.canvas.width, target.canvas.height);
    const light = c.createRadialGradient(0.04, 0.18, 0, 0.04, 0.18, 1.05);
    light.addColorStop(0, `rgba(255, 255, 255, ${variant.light})`);
    light.addColorStop(0.45, `rgba(255, 255, 255, ${variant.light * 0.4})`);
    light.addColorStop(1, "rgba(255, 255, 255, 0)");
    c.fillStyle = light;
    c.fillRect(0, 0, 1, 1);
    const shade = c.createRadialGradient(0.45, 0.40, 0.15, 0.45, 0.40, 0.85);
    shade.addColorStop(0, "rgba(24, 24, 24, 0)");
    shade.addColorStop(0.5, `rgba(24, 24, 24, ${variant.vignette * 0.2})`);
    shade.addColorStop(1, `rgba(24, 24, 24, ${variant.vignette})`);
    c.fillStyle = shade;
    c.fillRect(0, 0, 1, 1);
    c.restore();
    target.geometry = geo;
    return target.canvas;
  }

  // Поза героя на его собственном холсте: две соседние картинки в общей рамке,
  // (1 − w)·A + w·B в предумноженном виде (§7.2). Там, где альфа поз совпадает,
  // фигура не просвечивает ни на одном весе.
  // Фаза 17 Task 2: на экране всегда одна поза — та, к которой ближе прокрутка. Переход через
  // середину — наплыв по времени POSE_FADE_MS, поэтому полупрозрачные «вторые руки» не зависают,
  // когда прокрутка стоит посреди смены позы. При setProgress (проверка) и без анимаций — сразу.
  let POSE_FADE_MS = variant.poseFadeMs;
  function shownPose(person, pose, now) {
    // Разбор слоёв для проверки (debugLayers) рисует позу ровно по прокрутке и не трогает показ.
    if (now === undefined) return pose;
    const target = pose.w >= 0.5 ? pose.to : pose.from;
    if (!person.shown || forced !== null || motion.matches || staticMode || lifeDebug) {
      person.shown = target;
      person.fade = null;
    } else if (target !== person.shown) {
      const previous = person.shown;
      let from = previous;
      let start = now;
      if (person.fade) {
        const t = clamp((now - person.fade.start) / POSE_FADE_MS);
        const weight = variant.poseCurve(t);
        if (target === person.fade.from) {
          // Разворот сохраняет текущую смесь, включая нелинейную кривую наплыва.
          let low = 0;
          let high = 1;
          for (let index = 0; index < 24; index++) {
            const middle = (low + high) / 2;
            if (variant.poseCurve(middle) < 1 - weight) low = middle;
            else high = middle;
          }
          start = now - (low + high) / 2 * POSE_FADE_MS;
        } else {
          from = weight >= 0.5 ? previous : person.fade.from;
        }
      }
      person.fade = from === target ? null : { from, start };
      person.shown = target;
    }
    if (person.fade) {
      const t = clamp((now - person.fade.start) / POSE_FADE_MS);
      if (t >= 1) person.fade = null;
      else return { from: person.fade.from, to: person.shown, w: variant.poseCurve(t) };
    }
    return { from: person.shown, to: person.shown, w: 0 };
  }

  function fading() {
    return KEYS.some(key => people[key].fade);
  }

  function renderPerson(key, scrollPose, nod, now) {
    const person = people[key];
    let pose = shownPose(person, scrollPose, now);
    if (drawingLife && lifePeople[key].blink && pose.from === "calm" && pose.to === "calm" && !person.fade) {
      pose = { from: "blink", to: "blink", w: 0 };
    }
    const cacheKey = `${pose.from}|${pose.to}|${pose.w.toFixed(5)}|${nod.toFixed(5)}`;
    if (person.cache === cacheKey) return;
    person.cache = cacheKey;

    const art = person.art;
    clearCanvas(art);
    const c = art.ctx;
    const w = art.canvas.width;
    const h = art.canvas.height;
    const a = poseArt(person, pose.from, w, h);
    const b = poseArt(person, pose.to, w, h);

    if (pose.from === pose.to || pose.w <= 0) {
      c.drawImage(a, 0, 0);
    } else if (pose.w >= 1) {
      c.drawImage(b, 0, 0);
    } else {
      c.globalAlpha = 1 - pose.w;
      c.drawImage(a, 0, 0);
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = pose.w;
      c.drawImage(b, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
    }

    if (nod > 0.0001) applyNod(person, nod);
  }

  // Фаза 17 Task 1: каждая поза уменьшается до размера на экране один раз (при смене размера окна),
  // затем мягкое повышение резкости — браузерное уменьшение в 2–3 раза мылит лицо и ткань.
  // В кадре поза рисуется готовой, 1:1, без пересчёта.
  const SHARPEN = 0.22;
  function poseArt(person, name, w, h) {
    const sizeKey = `${w}x${h}`;
    if (person.posesSize !== sizeKey) {
      person.poses = {};
      person.posesSize = sizeKey;
    }
    let ready = person.poses[name];
    if (ready) return ready;
    // Резкость считается на холсте для чтения (он в обычной памяти), а в кадр идёт копия
    // на обычном холсте: иначе браузер перекладывает позу в видеокарту каждый кадр.
    const src = document.createElement("canvas");
    src.width = w;
    src.height = h;
    const c = src.getContext("2d", { willReadFrequently: true });
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(images[`${person.key}-${name}`], 0, 0, w, h);
    if (SHARPEN > 0 && w > 2 && h > 2) sharpen(c, w, h, SHARPEN);
    const node = document.createElement("canvas");
    node.width = w;
    node.height = h;
    node.getContext("2d").drawImage(src, 0, 0);
    person.poses[name] = node;
    return node;
  }

  // Готовим все позы по одной в паузах браузера, чтобы первая смена позы при прокрутке не тормозила кадр.
  let prewarmHandle = 0;
  function prewarmPoses() {
    const idle = window.requestIdleCallback || (callback => setTimeout(() => callback({ timeRemaining: () => 8 }), 50));
    const cancel = window.cancelIdleCallback || clearTimeout;
    if (prewarmHandle) cancel(prewarmHandle);
    const queue = [];
    for (const key of KEYS) {
      const person = people[key];
      // Веки готовы до запуска таймера; первая серия не считает резкость в кадре.
      poseArt(person, "blink", person.art.canvas.width, person.art.canvas.height);
      for (const name of Object.keys(manifest.people[key].poses)) {
        if (name !== "blink") queue.push([person, name]);
      }
    }
    const step = deadline => {
      prewarmHandle = 0;
      while (queue.length && deadline.timeRemaining() > 4) {
        const [person, name] = queue.shift();
        poseArt(person, name, person.art.canvas.width, person.art.canvas.height);
      }
      if (queue.length) prewarmHandle = idle(step, { timeout: 500 });
    };
    prewarmHandle = idle(step, { timeout: 500 });
  }

  // Нерезкая маска 3×3 по премультиплицированным каналам — без тёмных ореолов на краю фигуры.
  function sharpen(c, w, h, k) {
    const data = c.getImageData(0, 0, w, h);
    const px = data.data;
    const n = w * h;
    const pre = new Float32Array(n * 4);
    for (let i = 0; i < n; i += 1) {
      const a = px[i * 4 + 3] / 255;
      pre[i * 4] = px[i * 4] * a;
      pre[i * 4 + 1] = px[i * 4 + 1] * a;
      pre[i * 4 + 2] = px[i * 4 + 2] * a;
      pre[i * 4 + 3] = px[i * 4 + 3];
    }
    // Альфу не трогаем — без просветов внутри и без новых краёв.
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = (y * w + x) * 4;
        const alpha = pre[i + 3];
        if (alpha <= 0) continue;
        const unpremultiply = 255 / alpha;
        for (let ch = 0; ch < 3; ch += 1) {
          const centre = pre[i + ch];
          const around = pre[i - 4 + ch] + pre[i + 4 + ch] + pre[i - w * 4 + ch] + pre[i + w * 4 + ch];
          const value = (centre + k * (4 * centre - around)) * unpremultiply;
          px[i + ch] = value < 0 ? 0 : value > 255 ? 255 : value;
        }
      }
    }
    c.putImageData(data, 0, 0);
  }

  // Голова поворачивается вокруг шеи; полоса шеи смешивается lighter, поэтому
  // сумма весов там ровно 1 и шва нет. Смещение у шеи меньше 0,5 точки.
  function applyNod(person, nod) {
    const art = person.art;
    const crop = person.cropFrame;
    const w = art.canvas.width;
    const h = art.canvas.height;
    const k = w / crop[2];
    const toX = fx => (fx - crop[0]) * k;
    const toY = fy => (fy - crop[1]) * k;
    const dx = FACES[person.key][0] - FACES.amin[0];
    const dy = FACES[person.key][1] - FACES.amin[1];
    const pivotX = toX(NOD.pivot[0] + dx);
    const pivotY = toY(NOD.pivot[1] + dy);

    const mask = work.headMask;
    sizeCanvas(mask, w, h);
    clearCanvas(mask);
    const gradient = mask.ctx.createLinearGradient(0, toY(NOD.feather[0] + dy), 0, toY(NOD.feather[1] + dy));
    gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    mask.ctx.fillStyle = gradient;
    mask.ctx.fillRect(toX(manifest.frame.axis + dx - NOD.half), 0, 2 * NOD.half * k, toY(NOD.feather[1] + dy) + 1);

    const head = work.head;
    sizeCanvas(head, w, h);
    clearCanvas(head);
    head.ctx.drawImage(art.canvas, 0, 0);
    head.ctx.globalCompositeOperation = "destination-in";
    head.ctx.drawImage(mask.canvas, 0, 0);
    head.ctx.globalCompositeOperation = "source-over";

    const c = art.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "destination-out";
    c.drawImage(mask.canvas, 0, 0);
    c.globalCompositeOperation = "lighter";
    c.translate(pivotX, pivotY);
    c.rotate(radians((person.key === "roman" ? 1.8 : NOD.degrees) * nod));
    c.translate(-pivotX, -pivotY);
    c.drawImage(head.canvas, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-over";
  }

  function drawFigure(c, key) {
    const r = geo.people[key].rect;
    const m = c.getTransform();
    const art = people[key].art.canvas;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (!drawingLife) {
      drawnColumns[key] = false;
      // Базовый путь оставлен без изменений, в том числе для debugLayers.
      c.drawImage(art, Math.round(m.a * r.x + m.e), Math.round(m.d * r.y + m.f));
      c.restore();
      return;
    }

    const item = lifePeople[key];
    const g = lifeFigureGeometry(key);
    drawnColumns[key] = g.armX > 0;
    // Локальные холсты накладок имеют целое начало на сетке основного canvas.
    const x = Math.round(geo.kx * r.x) + m.e;
    const y = Math.round(geo.ky * r.y) + m.f;
    const k = item.shift;

    // У корпуса горизонтальный разрез; слева у Романа верх включает опущенную
    // руку. Прямоугольники не перекрываются и в покое копируются строго 1:1.
    const columns = g.armX > 0
      ? [[0, g.armX, g.armY], [g.armX, g.w - g.armX, g.waist]]
      : [[0, g.w, g.waist]];
    c.imageSmoothingEnabled = false;
    if (item.accent) {
      const transform = item.transform;
      const Ayx = geo.ky * Math.sin(transform.rot) * transform.sx / geo.kx;
      const Ayy = Math.cos(transform.rot) * transform.sy;
      let maxRise = -Infinity;
      for (const [left, width, split] of columns) {
        for (const u of [left, left + width]) {
          const rise = (split + k - g.py) * (1 - Ayy) - Ayx * (u - g.px);
          maxRise = Math.max(maxRise, rise);
        }
      }
      // Запас — округлённый вверх максимальный подъём разреза по обоим краям
      // всех колонок плюс три строки, с ограничением от трёх до 64 пикселей растра.
      const M = Math.min(64, Math.max(3, Math.ceil(maxRise) + 3));
      const hT = Math.max(...columns.map(([, , split]) => split + k + Math.min(M, g.h - split)));
      const top = work.lifeTop;
      fitCanvas(top, g.w, hT);
      const tc = top.ctx;
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.imageSmoothingEnabled = false;
      // Холст общий и только растёт: чистим целиком, иначе сглаживание при повороте
      // берёт строку под hT, где остался верх другого героя (серая черта у Амина).
      tc.clearRect(0, 0, top.canvas.width, top.canvas.height);
      for (const [left, width, split] of columns) {
        if (width <= 0) continue;
        tc.drawImage(art, left, 0, width, split, left, 0, width, split);
        if (k > 0) {
          tc.drawImage(art, left, split - 1, width, 1,
            left, split, width, k);
        }
        const Mc = Math.min(M, g.h - split);
        if (Mc > 0) {
          tc.drawImage(art, left, split, width, Mc,
            left, split + k, width, Mc);
        }
      }
      // Только верх: ступни и нижняя часть не проходят через эту матрицу.
      // В push опора — кисть, поэтому акцент не отводит руку от спинки.
      c.translate(x + g.px + transform.tx, y + g.py - k);
      c.scale(geo.kx, geo.ky);
      c.rotate(transform.rot);
      c.scale(transform.sx, transform.sy);
      c.scale(1 / geo.kx, 1 / geo.ky);
      c.translate(-g.px, -g.py);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(work.lifeTop.canvas, 0, 0, g.w, hT, 0, 0, g.w, hT);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.imageSmoothingEnabled = false;
      for (const [left, width, split] of columns) {
        if (split < g.h && width > 0) {
          c.drawImage(art, left, split, width, g.h - split,
            x + left, y + split, width, g.h - split);
        }
      }
    } else {
      for (const [left, width, split] of columns) {
        if (width <= 0) continue;
        if (split < g.h) {
          c.drawImage(art, left, split, width, g.h - split,
            x + left, y + split, width, g.h - split);
        }
        if (k > 0) {
          c.drawImage(art, left, split - 1, width, 1,
            x + left, y + split - k, width, k);
        }
      }

      for (const [left, width, split] of columns) {
        if (width > 0) {
          c.drawImage(art, left, 0, width, split, x + left, y - k, width, split);
        }
      }
    }
    c.restore();
  }

  // Слой 2: мягкие контактные тени у ступней и под внешним диваном.
  function drawGroundShadows(c, st) {
    const g = geo;
    const color = look.contactShadowColor;
    for (const key of KEYS) {
      softEllipse(c, g.people[key].cx, g.feetY - 0.004 * g.H, 175 * g.s, 0.014 * g.H, color, 1);
    }
    const r = sofaRect(g, st.move);
    const alpha = 1 - st.move;
    if (alpha > 0) {
      const bottom = r.y + r.h * (556 / 560);
      softEllipse(c, r.x + r.w / 2, bottom - 0.004 * g.H, 0.47 * r.w, Math.min(0.016 * g.H, 0.06 * r.w), color, alpha);
    }
  }

  function drawSofa(c, r, swap) {
    if (swap <= 0) {
      c.drawImage(images.sofaA, r.x, r.y, r.w, r.h);
      return;
    }
    if (swap >= 1) {
      c.drawImage(images.sofaB, r.x, r.y, r.w, r.h);
      return;
    }
    // Смена А → Б в одной посадочной рамке: точное наложение, без «дыры» на 50 %.
    const blend = work.blend;
    const { w, h } = fitCanvas(blend, r.w * geo.kx, r.h * geo.ky);
    clearCanvas(blend);
    const b = blend.ctx;
    b.globalAlpha = 1 - swap;
    b.drawImage(images.sofaA, 0, 0, w, h);
    b.globalCompositeOperation = "lighter";
    b.globalAlpha = swap;
    b.drawImage(images.sofaB, 0, 0, w, h);
    b.globalCompositeOperation = "source-over";
    b.globalAlpha = 1;
    c.drawImage(blend.canvas, 0, 0, w, h, r.x, r.y, r.w, r.h);
  }

  // Слои 2–4 экрана в отдельном холсте: тень, рамка, комната, внутренний диван и его тень.
  // Потом весь экран уходит вниз, растворяется и режется нижней маской (§7.1, 0,88–0,98).
  function renderScreenLayer(st) {
    const g = geo;
    const target = work.screen;
    sizeCanvas(target, canvas.width, canvas.height);
    clearCanvas(target);
    const c = target.ctx;
    setScene(c, g);

    const offset = st.down * 0.10 * g.H;
    const screen = g.screen;
    const inner = g.inner;
    c.save();
    c.translate(0, offset);

    if (variantName === "now") {
      c.save();
      c.shadowColor = look.screenShadow;
      c.shadowBlur = look.screenShadowBlur * screen.h * g.dpr;
      c.shadowOffsetY = look.screenShadowY * screen.h * g.dpr;
      roundRect(c, screen.x, screen.y, screen.w, screen.h, screen.r);
      c.fillStyle = look.frame;
      c.fill();
      c.restore();
    } else {
      c.drawImage(variantFrameArt(), 0, 0, g.W, g.H);
    }

    c.save();
    roundRect(c, inner.x, inner.y, inner.w, inner.h, inner.r);
    c.clip();
    if (st.reveal < 1) drawCover(c, images.sketch, inner);
    if (st.reveal >= 1) {
      drawCover(c, images.room, inner);
    } else if (st.reveal > 0) {
      const reveal = work.reveal;
      sizeCanvas(reveal, inner.w * g.kx, inner.h * g.ky);
      clearCanvas(reveal);
      const rc = reveal.ctx;
      rc.setTransform(g.kx, 0, 0, g.ky, 0, 0);
      drawCover(rc, images.room, { x: 0, y: 0, w: inner.w, h: inner.h });
      const feather = variant.feather * g.reveal.far;
      const outer = st.reveal * (g.reveal.far + feather);
      const core = Math.max(0, outer - feather);
      rc.globalCompositeOperation = "destination-in";
      const gradient = rc.createRadialGradient(g.reveal.x, g.reveal.y, core, g.reveal.x, g.reveal.y, Math.max(core + 0.01, outer));
      gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      rc.fillStyle = gradient;
      rc.fillRect(0, 0, inner.w, inner.h);
      rc.globalCompositeOperation = "source-over";
      c.drawImage(reveal.canvas, 0, 0, reveal.canvas.width, reveal.canvas.height, inner.x, inner.y, inner.w, inner.h);
    }

    if (variant.light > 0 || variant.vignette > 0) {
      c.drawImage(variantLightArt(), inner.x, inner.y, inner.w, inner.h);
    }

    const r = sofaRect(g, st.move);
    if (st.move > 0) {
      softEllipse(c, r.x + r.w / 2, r.y + r.h * 0.985, 0.47 * r.w, 0.09 * r.h, look.roomShadowColor, st.move);
    }
    if (st.move >= g.mFit) drawSofa(c, r, st.swap);
    c.restore();

    c.lineWidth = 1;
    c.strokeStyle = look.frameEdge;
    roundRect(c, screen.x + 0.5, screen.y + 0.5, screen.w - 1, screen.h - 1, screen.r);
    c.stroke();
    c.strokeStyle = look.frameInner;
    roundRect(c, inner.x - 0.5, inner.y - 0.5, inner.w + 1, inner.h + 1, inner.r);
    c.stroke();
    c.restore();

    // Полная видимость до 0,78H, ноль на 0,84H — экран не доходит до подписей.
    c.globalCompositeOperation = "destination-in";
    const fade = c.createLinearGradient(0, 0.78 * g.H, 0, 0.84 * g.H);
    fade.addColorStop(0, "rgba(0, 0, 0, 1)");
    fade.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = fade;
    c.fillRect(0, 0, g.W, g.H);
    c.globalCompositeOperation = "source-over";
  }

  function drawScreen(c, st) {
    if (st.fade <= 0) return;
    renderScreenLayer(st);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = st.fade;
    c.drawImage(work.screen.canvas, 0, 0);
    c.restore();
  }

  function drawFrontSofa(c, st) {
    if (st.move >= 1) return;
    const alpha = frontAlpha(geo, st.move);
    if (alpha <= 0) return;
    c.save();
    c.globalAlpha = alpha;
    drawSofa(c, sofaRect(geo, st.move), 0);
    c.restore();
  }

  function drawCardImage(c, st, withShadow) {
    const g = geo;
    const place = cardPlacement(g, st.card.t);
    c.save();
    c.globalAlpha = st.card.alpha;
    c.translate(place.cx, place.cy);
    c.rotate(place.angle);
    if (withShadow) {
      const blur = look.cardShadowBlur * g.H * g.dpr;
      c.shadowColor = look.cardShadow;
      c.shadowBlur = blur;
      c.shadowOffsetY = 0.35 * blur;
    }
    c.drawImage(images.card, -g.card.w / 2, -g.card.h / 2, g.card.w, g.card.h);
    c.restore();
  }

  function drawCard(c, st) {
    if (st.card.alpha <= 0) return;
    drawCardImage(c, st, true);
  }

  function lifeOverlaySpot(key, spot) {
    if (!drawingLife) return spot;
    const item = lifePeople[key];
    const g = lifeFigureGeometry(key);
    const r = geo.people[key].rect;
    const baseX = Math.round(r.x * geo.kx);
    const baseY = Math.round(r.y * geo.ky);
    const x = spot.x * geo.kx - baseX;
    const y = spot.y * geo.ky - baseY;
    const split = x < g.armX ? g.armY : g.waist;
    if (y >= split) return spot;
    const t = item.transform;
    const vx = (x - g.px) / geo.kx;
    const vy = (y - g.py) / geo.ky;
    const cos = Math.cos(t.rot);
    const sin = Math.sin(t.rot);
    return {
      ...spot,
      x: (baseX + g.px + t.tx) / geo.kx + cos * t.sx * vx - sin * t.sy * vy,
      y: (baseY + g.py - item.shift) / geo.ky + sin * t.sx * vx + cos * t.sy * vy
    };
  }

  function lifeCardShift(st) {
    if (!drawingLife || st.card.alpha <= 0) return { dx: 0, dy: 0 };
    const [x, y] = cardPlacement(geo, st.card.t).pinch;
    const moved = lifeOverlaySpot("amin", { x, y });
    const dx = Math.round((moved.x - x) * geo.kx);
    const dy = Math.round((moved.y - y) * geo.ky);
    return { dx: dx || 0, dy: dy || 0 };
  }

  // Участок героя поверх заслоняющего слоя: (холст героя) ∩ (мягкая маска кисти) ∩
  // (альфа заслонителя). Где заслонителя нет, ничего не рисуется — без двойной кисти.
  function drawOverlay(c, key, spots, occlude) {
    const g = geo;
    if (drawingLife) spots = spots.map(spot => lifeOverlaySpot(key, spot));
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const spot of spots) {
      left = Math.min(left, spot.x - spot.rx);
      top = Math.min(top, spot.y - spot.ry);
      right = Math.max(right, spot.x + spot.rx);
      bottom = Math.max(bottom, spot.y + spot.ry);
    }
    left = Math.max(0, Math.floor(left));
    top = Math.max(0, Math.floor(top));
    right = Math.min(Math.ceil(g.W), Math.ceil(right));
    bottom = Math.min(Math.ceil(g.H), Math.ceil(bottom));
    if (right <= left || bottom <= top) return;

    // В живом пути накладка тоже копируется 1:1: иначе локальная маска
    // повторно интерполирует уже сдвинутую кисть на дробном DPR.
    let width;
    let height;
    if (drawingLife) {
      const x0 = Math.floor(left * g.kx);
      const y0 = Math.floor(top * g.ky);
      const x1 = Math.ceil(right * g.kx);
      const y1 = Math.ceil(bottom * g.ky);
      width = x1 - x0;
      height = y1 - y0;
      left = x0 / g.kx;
      top = y0 / g.ky;
      right = x1 / g.kx;
      bottom = y1 / g.ky;
    } else {
      width = Math.round((right - left) * g.kx);
      height = Math.round((bottom - top) * g.ky);
    }
    const local = target => {
      fitCanvas(target, width, height);
      clearCanvas(target);
      target.ctx.setTransform(
        g.kx, 0, 0, g.ky,
        drawingLife ? -Math.round(left * g.kx) : -left * g.kx,
        drawingLife ? -Math.round(top * g.ky) : -top * g.ky
      );
      return target.ctx;
    };

    const overlay = local(work.overlay);
    drawFigure(overlay, key);

    const mask = local(work.mask);
    for (const spot of spots) softEllipse(mask, spot.x, spot.y, spot.rx, spot.ry, [0, 0, 0, 1], 1, spot.core || 0.5);

    const occluder = local(work.occluder);
    occlude(occluder);

    overlay.setTransform(1, 0, 0, 1, 0, 0);
    overlay.globalCompositeOperation = "destination-in";
    overlay.drawImage(work.mask.canvas, 0, 0);
    overlay.drawImage(work.occluder.canvas, 0, 0);
    overlay.globalCompositeOperation = "source-over";

    if (drawingLife) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(work.overlay.canvas, 0, 0, width, height,
        Math.round(left * g.kx), Math.round(top * g.ky), width, height);
      c.restore();
    } else {
      c.drawImage(work.overlay.canvas, 0, 0, width, height, left, top, right - left, bottom - top);
    }
  }

  // Слой 7: кисть Романа поверх спинки, пока диван перед героями.
  function drawPalm(c, st) {
    if (st.move >= 1) return;
    const alpha = frontAlpha(geo, st.move);
    if (alpha <= 0) return;
    const r = sofaRect(geo, st.move);
    const spots = geo.palms.filter(spot =>
      spot.x + spot.rx > r.x && spot.x - spot.rx < r.x + r.w &&
      spot.y + spot.ry > r.y && spot.y - spot.ry < r.y + r.h);
    if (!spots.length) return;
    drawOverlay(c, "roman", spots, occluder => {
      occluder.globalAlpha = alpha;
      occluder.drawImage(images.sofaA, r.x, r.y, r.w, r.h);
      occluder.globalAlpha = 1;
    });
  }

  // Слой 9: щепоть Амина поверх карточки.
  function drawFingers(c, st, shift = { dx: 0, dy: 0 }) {
    if (st.card.alpha <= 0) return;
    const g = geo;
    const radius = FINGERS.radius * g.s;
    const [x, y] = cardPlacement(g, st.card.t).pinch;
    const spots = [{ x, y, rx: radius, ry: radius, core: FINGERS.core }];
    drawOverlay(c, "amin", spots, occluder => {
      occluder.save();
      const m = occluder.getTransform();
      occluder.setTransform(m.a, m.b, m.c, m.d, m.e + shift.dx, m.f + shift.dy);
      drawCardImage(occluder, st, false);
      occluder.restore();
    });
  }

  function prepareFigures(st, now) {
    renderPerson("amin", st.amin, st.nod, now);
    renderPerson("roman", st.roman, st.romanNod, now);
  }

  // §6, снизу вверх: фон и свечение (CSS) → тени → экран с комнатой и внутренним
  // диваном → герои → внешний диван → ладонь Романа → карточка → пальцы Амина.
  function draw(target, st, now) {
    drawnCardShift = { dx: 0, dy: 0 };
    const c = target.ctx;
    clearCanvas(target);
    setScene(c, geo);
    prepareFigures(st, now);
    drawGroundShadows(c, st);
    drawScreen(c, st);
    setScene(c, geo);
    drawFigure(c, "amin");
    drawFigure(c, "roman");
    drawFrontSofa(c, st);
    drawPalm(c, st);
    drawCard(c, st);
    drawFingers(c, st);
  }

  function cacheLifeLayers(st, key) {
    if (layerCache && layerCache.key === key && layerCache.geometry === geo &&
        layerCache.variant === variantName && layerCache.width === canvas.width &&
        layerCache.height === canvas.height && layerCache.dpr === geo.dpr) return;

    for (const name of ["lifeLower", "lifeSofa", "lifeCard"]) {
      sizeCanvas(work[name], canvas.width, canvas.height);
      clearCanvas(work[name]);
      setScene(work[name].ctx, geo);
    }
    drawGroundShadows(work.lifeLower.ctx, st);
    drawScreen(work.lifeLower.ctx, st);
    drawFrontSofa(work.lifeSofa.ctx, st);
    drawCard(work.lifeCard.ctx, st);
    layerCache = {
      key,
      geometry: geo,
      variant: variantName,
      width: canvas.width,
      height: canvas.height,
      dpr: geo.dpr
    };
  }

  function drawLife(st, key, now) {
    cacheLifeLayers(st, key);
    prepareFigures(st, now);
    const shift = lifeCardShift(st);
    drawnCardShift = shift;
    clearCanvas({ canvas, ctx });
    ctx.drawImage(work.lifeLower.canvas, 0, 0);
    setScene(ctx, geo);
    drawFigure(ctx, "amin");
    drawFigure(ctx, "roman");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(work.lifeSofa.canvas, 0, 0);
    ctx.restore();
    drawPalm(ctx, st);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(work.lifeCard.canvas, shift.dx, shift.dy);
    ctx.restore();
    drawFingers(ctx, st, shift);
  }

  function render(force = false, now = performance.now()) {
    if (!ready || !geo) return;
    const st = currentState();
    const key = stateKey(st);
    const active = lifeReason() === null;
    const full = force || key !== lastKey || fading();
    const accenting = active && KEYS.some(name => lifePeople[name].event);
    const paint = full || (active && now - lifeLastPaint >= (accenting ? 16 : 32));
    if (key !== lastKey) layerCache = null;
    if (paint) {
      const started = performance.now();
      drawingLife = active;
      if (active) {
        updateLife(st, now);
        drawLife(st, key, now);
      } else {
        resetLife();
        draw({ canvas, ctx }, st, now);
      }
      lastKey = key;
      lifeLastPaint = now;
      const cost = performance.now() - started;
      if (active) {
        lifeTimes.push(now);
        lifeTimes = lifeTimes.filter(t => t >= now - 2000);
      }
      if (lifeRecording && lifeJournal.length < 3000) {
        lifeJournal.push({
          t: now,
          kind: full ? "full" : "life",
          cost,
          card: { ...drawnCardShift },
          ...Object.fromEntries(KEYS.map(name => [name, {
            column: drawnColumns[name],
            shift: active ? lifePeople[name].shift : 0,
            accent: active && lifePeople[name].accent,
            ...(active ? lifePeople[name].transform : identityLifeTransform()),
            blink: active && lifePeople[name].blink,
            pose: active && lifePeople[name].blink ? "blink" : people[name].shown
          }]))
        });
      }
      drawingLife = false;
    }
    if (recording && journal.length < 4000) {
      journal.push({ t: now, p, q, key: st.q === null ? "rest" : key });
    }
  }

  // ---------- Для проверки (§11): геометрия и слои по отдельности ----------

  function rectOf(r) {
    return { x: r.x, y: r.y, w: r.w, h: r.h };
  }

  function describe(value) {
    const g = geo;
    const st = typeof value === "number" ? stateAt(clamp(value)) : currentState();
    const offset = st.down * 0.10 * g.H;
    const sofa = sofaRect(g, st.move);
    const place = cardPlacement(g, st.card.t);
    const cos = Math.cos(place.angle);
    const sin = Math.sin(place.angle);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const x = u * g.card.w / 2;
      const y = v * g.card.h / 2;
      return [place.cx + x * cos - y * sin, place.cy + x * sin + y * cos];
    });
    const stageBox = stage.getBoundingClientRect();
    const labels = {};
    const faces = {};
    const heads = {};
    for (const key of KEYS) {
      const box = people[key].name.getBoundingClientRect();
      labels[key] = { x: box.left - stageBox.left, y: box.top - stageBox.top, w: box.width, h: box.height };
      const map = g.people[key].map;
      const [fx, fy, frx, fry] = FACES[key];
      const [cx, cy] = map(fx, fy);
      faces[key] = { cx, cy, rx: frx * g.s, ry: fry * g.s };
      const [hx, hy] = map(manifest.frame.axis - HEAD.half, HEAD.top);
      heads[key] = { x: hx, y: hy, w: 2 * HEAD.half * g.s, h: (HEAD.bottom - HEAD.top) * g.s };
    }
    return {
      q: st.q,
      W: g.W,
      H: g.H,
      mode: g.mode,
      scale: g.s,
      mFit: g.mFit,
      screen: { x: g.screen.x, y: g.screen.y + offset, w: g.screen.w, h: g.screen.h, visible: st.fade },
      inner: { x: g.inner.x, y: g.inner.y + offset, w: g.inner.w, h: g.inner.h },
      sofa: {
        rect: { x: sofa.x, y: sofa.y + (st.move >= g.mFit ? offset : 0), w: sofa.w, h: sofa.h },
        inScreen: st.move >= g.mFit,
        front: st.move >= 1 ? 0 : frontAlpha(g, st.move),
        swap: st.swap
      },
      sofaOut: rectOf(g.sofaOut),
      sofaIn: rectOf(g.sofaIn),
      card: { alpha: st.card.alpha, center: [place.cx, place.cy], angle: place.angle, corners },
      grips: { calm: g.grip.calm, apply: g.grip.apply },
      palms: g.palms.map(spot => ({ ...spot })),
      people: Object.fromEntries(KEYS.map(key => [key, {
        rect: rectOf(g.people[key].rect),
        body: rectOf(g.people[key].body),
        feet: [g.people[key].cx, g.feetY]
      }])),
      faces,
      heads,
      labels
    };
  }

  function debugLayers(value) {
    const previousDebug = lifeDebug;
    const previousDrawing = drawingLife;
    lifeDebug = true;
    drawingLife = false;
    try {
      const st = typeof value === "number" ? stateAt(clamp(value)) : currentState();
      const make = () => {
        const target = scratch();
        sizeCanvas(target, canvas.width, canvas.height);
        clearCanvas(target);
        setScene(target.ctx, geo);
        return target;
      };
      prepareFigures(st);
      const layers = {
        shadows: make(),
        screen: make(),
        amin: make(),
        roman: make(),
        sofa: make(),
        palm: make(),
        card: make(),
        fingers: make(),
        all: make()
      };
      drawGroundShadows(layers.shadows.ctx, st);
      drawScreen(layers.screen.ctx, st);
      drawFigure(layers.amin.ctx, "amin");
      drawFigure(layers.roman.ctx, "roman");
      drawFrontSofa(layers.sofa.ctx, st);
      drawPalm(layers.palm.ctx, st);
      drawCard(layers.card.ctx, st);
      drawFingers(layers.fingers.ctx, st);
      draw(layers.all, st);
      return {
        kx: geo.kx,
        ky: geo.ky,
        W: geo.W,
        H: geo.H,
        canvases: Object.fromEntries(Object.entries(layers).map(([name, target]) => [name, target.canvas]))
      };
    } finally {
      lifeDebug = previousDebug;
      drawingLife = previousDrawing;
      // Основной холст возвращается к текущему состоянию.
      lastKey = "";
      render(true);
      wake();
    }
  }

  // ---------- Размеры, прокрутка, кадр ----------

  function setStatic(next) {
    if (staticMode === next) return;
    staticMode = next;
    root.classList.toggle("is-static", next);
  }

  function measureScroll() {
    if (mode === "phone") {
      if (motion.matches) {
        setStatic(false);
        scroll = null;
        return;
      }
      const svh = probe.getBoundingClientRect().height || window.innerHeight;
      const safeBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      const groupHeight = group.offsetHeight;
      const top = staticMode ? NaN : parseFloat(getComputedStyle(group).top);
      const pinTop = Number.isFinite(top) ? top : Math.max(56, (svh - 504) / 2);
      // §4.3: группа не помещается между y=56 и нижним краем — без закрепления, кадр §10.
      setStatic(pinTop + groupHeight > svh - safeBottom + 0.5);
      if (staticMode) {
        scroll = null;
        return;
      }
      const trackTop = track.getBoundingClientRect().top + window.scrollY;
      const distance = track.offsetHeight - group.offsetHeight;
      if (distance < 1) {
        setStatic(true);
        scroll = null;
        return;
      }
      scroll = { start: trackTop - pinTop, distance, top: pinTop, group: groupHeight };
    } else {
      setStatic(false);
      if (motion.matches) {
        scroll = null;
        return;
      }
      const rootTop = root.getBoundingClientRect().top + window.scrollY;
      scroll = { start: rootTop, distance: Math.max(1, root.offsetHeight - pin.offsetHeight) };
    }
  }

  function measure() {
    measurePending = 0;
    if (!ready) {
      if (phoneQuery.matches && stage && !sceneFailed) {
        mode = "phone";
        measureScroll();
      }
      return;
    }
    mode = phoneQuery.matches ? "phone" : tabletQuery.matches ? "tablet" : "wide";
    root.dataset.layout = mode;
    const box = stage.getBoundingClientRect();
    const W = Math.max(1, box.width);
    const H = Math.max(1, box.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(W * dpr));
    const height = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    // Фаза 17 Task 1: холст ровно по сетке точек экрана — иначе браузер растягивает его на доли точки
    // при выводе и сцена мылится (на 1440×900 место 810,8×594,7 с левого края 565,2).
    const pageTop = box.top + (window.scrollY || 0);
    Object.assign(canvas.style, {
      left: `${Math.round(box.left * dpr) / dpr - box.left}px`,
      top: `${Math.round(pageTop * dpr) / dpr - pageTop}px`,
      width: `${width / dpr}px`,
      height: `${height / dpr}px`
    });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    readLook();
    geo = computeGeometry(W, H, mode, width / W, height / H);
    layerCache = null;

    for (const key of KEYS) {
      const person = people[key];
      const r = geo.people[key].rect;
      person.cropFrame = geo.people[key].crop;
      sizeCanvas(person.art, r.w * geo.kx, r.h * geo.ky);
      person.cache = "";
      const body = geo.people[key].body;
      Object.assign(person.body.style, {
        left: `${body.x}px`,
        top: `${body.y}px`,
        width: `${body.w}px`,
        height: `${body.h}px`
      });
    }

    prewarmPoses();
    measureScroll();
    updateTarget();
    if (mode === "phone" || forced !== null || isResting()) q = filtered = p;
    lastKey = "";
    render(true);
    wake();
  }

  function scheduleMeasure() {
    if (measurePending) return;
    measurePending = requestAnimationFrame(measure);
  }

  function updateTarget() {
    if (forced !== null) {
      p = forced;
      return;
    }
    if (!scroll || isResting()) {
      p = 0;
      return;
    }
    p = clamp((window.scrollY - scroll.start) / scroll.distance);
  }

  function frame(now) {
    raf = 0;
    if (!ready || !visible || document.hidden) {
      lastFrame = null;
      lifeLastTime = null;
      return;
    }
    if (geo.dpr !== Math.min(window.devicePixelRatio || 1, 2)) {
      measure();
      return;
    }

    const dt = lastFrame === null ? 0 : Math.max(0, now - lastFrame);
    lastFrame = now;
    updateTarget();

    if (forced !== null || isResting() || mode === "phone") {
      // Телефон: q — ровно нормированный вход §4.3, концы точные, хвоста нет.
      q = filtered = p;
    } else if (dt > 0) {
      // Тот же каскад двух фильтров; τ и потолок скорости задаёт вариант.
      // У now сохранены τ=110 мс и проход всей сцены не быстрее 0,6 с.
      const ratio = dt / variant.tau;
      const decay = Math.exp(-ratio);
      const previous = filtered;
      const before = q;
      filtered = p + (previous - p) * decay;
      q = clamp(p + ((q - p) + (previous - p) * ratio) * decay);
      const maxStep = dt / variant.travelMs;
      q = before + Math.max(-maxStep, Math.min(maxStep, q - before));
    }

    const following = Math.abs(p - q) > 0.0005 || Math.abs(p - filtered) > 0.0005;
    if (!following) q = filtered = p;
    render(false, now);

    if (following || fading() || lifeReason() === null) raf = requestAnimationFrame(frame);
    else lastFrame = null;
  }

  function wake() {
    lifeSleeping = false;
    if (!ready || !visible || document.hidden || raf) return;
    raf = requestAnimationFrame(frame);
  }

  function sleep() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = null;
    lifeLastTime = null;
    lifeSleeping = true;
  }

  function motionChanged() {
    root.classList.toggle("is-reduced", motion.matches);
    sleep();
    q = filtered = p = 0;
    measure();
  }

  async function init() {
    try {
      prepareShell();

      [manifest, texts] = await Promise.all([
        fetchJSON(`${ROOM_DIR}manifest.json`),
        fetchJSON("founders/texts.json")
      ]);
      validateData();
      await loadImages();

      buildScene();
      buildDialog();

      root.classList.toggle("is-reduced", motion.matches);
      root.classList.add("is-ready");
      ready = true;
      visible = true;
      canvasVisible = true;
      if (shellResizeObserver) shellResizeObserver.disconnect();
      shellResizeObserver = null;
      measure();
      q = filtered = p;
      lastKey = "";
      render(true);

      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(stage);
      resizeObserver.observe(group);
      resizeObserver.observe(root);

      intersectionObserver = new IntersectionObserver(entries => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) wake();
        else sleep();
      });
      intersectionObserver.observe(root);
      canvasObserver = new IntersectionObserver(entries => {
        canvasVisible = entries[entries.length - 1].isIntersecting;
        if (canvasVisible) wake();
      });
      canvasObserver.observe(canvas);

      window.addEventListener("scroll", () => {
        updateTarget();
        wake();
      }, { passive: true });
      motion.addEventListener("change", motionChanged);
      tabletQuery.addEventListener("change", scheduleMeasure);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) sleep();
        else wake();
      });
      if (document.fonts) document.fonts.ready.then(scheduleMeasure);
    } catch (error) {
      sleep();
      ready = false;
      sceneFailed = true;
      root.classList.remove("is-ready", "is-reduced", "is-static");
      root.classList.add("is-scene-unavailable");
      staticMode = false;
      scroll = null;
      if (resizeObserver) resizeObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();
      if (canvasObserver) canvasObserver.disconnect();
      teardownScene();
      console.warn("Сцена основателей не включена:", error);
    }
  }

  window.addEventListener("resize", scheduleMeasure, { passive: true });
  phoneQuery.addEventListener("change", () => {
    syncShellClass();
    prepareShell();
    scheduleMeasure();
  });
  motion.addEventListener("change", () => {
    if (!ready && phoneQuery.matches) prepareShell();
  });
  if (document.fonts) {
    document.fonts.ready.then(() => {
      if (!ready && phoneQuery.matches) scheduleMeasure();
    });
  }

  init();
})();
