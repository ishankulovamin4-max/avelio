/* Рейки: смена мебели прямо на картинках комнат. Перенесено из пробы swap/demo (FX.slats, табличка, барабан).
   Данные — swap/data.json (swap/layers/page_data.py build): слоты с вариантами, слои каждой картинки по глубине,
   места табличек, группы пересекающихся слотов. Выбор слота один на всю квартиру: сменили диван на одной
   картинке — он меняется на всех, где есть его куски. Пока в группе всё по умолчанию, видна исходная картинка. */
(() => {
    const root = document.querySelector(".apartment");
    if (!root || !window.fetch) return;

    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    const hasMask = CSS.supports("mask-image", "linear-gradient(#000,#000)")
        || CSS.supports("-webkit-mask-image", "linear-gradient(#000,#000)");
    const rich = Boolean(CSS.registerProperty) && hasMask;
    const link = document.createElement("a");
    const cssUrl = (path) => { link.href = path; return `url("${link.href}")`; };
    const pct = (v) => `${(v * 100).toFixed(2)}%`;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const slatCount = (w) => Math.max(12, Math.min(20, Math.round(w / 24)));
    const file = (t, kind, code) => `swap/${t.view}/${t.id}/${kind}-${code}.webp`;

    let slots = {};
    const wanted = {};
    const scenes = [];
    let openScene = null;

    /* Загрузка. Куски по нажатию; силуэты и контуры лёгкие и нужны сразу. */
    const cache = new Map();
    function load(path) {
        if (!cache.has(path)) {
            const img = new Image();
            img.src = path;
            const ready = img.decode().then(() => img);
            ready.catch(() => cache.delete(path));
            cache.set(path, ready);
        }
        return cache.get(path);
    }
    function shape(t, code) {
        const path = file(t, "shape", code);
        return load(path).then((img) => {
            if (!maps.has(path)) buildMap(path, img);
            return img;
        });
    }
    const assets = (t, code) => Promise.all([load(file(t, "piece", code)), shape(t, code), load(file(t, "line", code))]);
    async function layerOf(t, code) {
        const layer = new Image();
        layer.className = "swap-piece";
        layer.alt = "";
        layer.decoding = "sync";
        layer.src = file(t, "piece", code);
        await layer.decode();
        return layer;
    }

    /* Силуэт в уменьшенном виде: попадание по вещи. */
    const maps = new Map();
    function buildMap(path, img) {
        const w = 160;
        const h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const paint = canvas.getContext("2d", { willReadFrequently: true });
        paint.drawImage(img, 0, 0, w, h);
        try {
            const data = paint.getImageData(0, 0, w, h).data;
            const alpha = new Uint8Array(w * h);
            for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
            maps.set(path, { w, h, alpha });
        } catch { /* без карты попаданием служит вся зона */ }
    }
    const topCode = (t) => (t.runs.length ? t.runs[t.runs.length - 1].code : t.shownCode);
    function onThing(t, u, v) {
        if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
        const map = maps.get(file(t, "shape", topCode(t))) || maps.get(file(t, "shape", wanted[t.slot]));
        if (!map) return true;
        return map.alpha[Math.floor(v * map.h) * map.w + Math.floor(u * map.w)] > 127;
    }
    // Ближняя вещь под точкой; x, y — доли картинки.
    function thingAt(sc, x, y) {
        for (let i = sc.tracks.length - 1; i >= 0; i--) {
            const t = sc.tracks[i];
            const b = t.box;
            if (onThing(t, (x - b[0]) / (b[2] - b[0]), (y - b[1]) / (b[3] - b[1]))) return t;
        }
        return null;
    }
    function toImage(sc, event) {
        const r = sc.scene.getBoundingClientRect();
        return [(event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height];
    }

    /* Слои одной смены. Всё, что появилось на её время, записано в run и снимается вместе с ней. */
    function node(run, cls, parent) {
        const el = document.createElement("div");
        el.className = cls;
        parent.append(el);
        run.nodes.push(el);
        return el;
    }
    function anim(run, el, frames, options) {
        const a = el.animate(frames, { fill: "both", ...options });
        run.anims.push(a);
        return a;
    }
    function setVars(el, vars) {
        for (const key in vars) el.style.setProperty(key, vars[key]);
    }

    // Рейки поворачиваются волной от места нажатия: старая вещь уходит, на обороте новая, ребро ловит свет.
    function slats(run, how) {
        const t = run.track;
        const { width: w, height: h } = t.zone.getBoundingClientRect();
        const count = slatCount(w);
        const sw = w / count;
        const o = how.x ?? (t.sweep = 1 - t.sweep);
        const reach = Math.max(o, 1 - o);
        const SPREAD = 620, D = 640, EDGE_ON = 250;
        const backUrl = cssUrl(file(t, "piece", run.code));
        const frontUrl = t.runs.length > 1 ? "" : cssUrl(file(t, "piece", run.from));
        const band = { "--o": pct(o), "--sw": `${sw.toFixed(2)}px` };
        const bandMove = { duration: SPREAD * (reach + .12), delay: EDGE_ON, easing: "linear" };

        const gap = rich ? node(run, "swap-fx swap-masked swap-gap", t.zone) : null;
        if (gap) setVars(gap, { ...band, "--shape": cssUrl(file(t, "shape", run.from)) });
        const box = node(run, "swap-fx swap-slats", t.zone);
        box.style.setProperty("--depth", `${Math.round(w * 1.15)}px`);
        run.layer.style.opacity = "0";
        for (let i = 0; i < count; i++) {
            const c = (i + .5) / count, side = c < o ? -1 : 1;
            const slat = document.createElement("i");
            slat.className = "swap-slat";
            slat.style.left = `${(i * sw).toFixed(2)}px`;
            slat.style.width = `${(sw + 1).toFixed(2)}px`;
            const face = (cls, url) => {
                const el = document.createElement("b");
                el.className = cls;
                el.style.backgroundImage = url;
                el.style.backgroundSize = `${w}px ${h}px`;
                el.style.backgroundPosition = `${(-i * sw).toFixed(2)}px 0`;
                slat.append(el);
            };
            if (frontUrl) face("", frontUrl);
            face("back", backUrl);
            box.append(slat);
            anim(run, slat, [
                { transform: "rotateY(0deg)", easing: "cubic-bezier(.45, .02, .35, 1)" },
                { transform: `rotateY(${side * 188}deg)`, offset: .78, easing: "ease-in-out" },
                { transform: `rotateY(${side * 180}deg)` },
            ], { duration: D, delay: Math.abs(c - o) * SPREAD });
        }
        if (gap) {
            const comb = node(run, "swap-fx swap-masked swap-comb", t.zone);
            setVars(comb, { ...band, "--shape": cssUrl(file(t, "shape", run.code)) });
            for (const el of [gap, comb]) anim(run, el, { "--p": ["0%", pct(reach + .12)] }, bandMove);
        }
    }

    /* Смена на одном слое. Новый кусок ложится поверх, нижние снимаются только когда верхний встал полностью. */
    function start(t, code, layer, how) {
        while (t.runs.length >= 3) {
            const old = t.runs.shift();
            strip(old, false);
            if (t.shown) t.shown.remove();
            t.shown = old.layer;
            t.shownCode = old.code;
        }
        const run = { track: t, code, from: topCode(t), layer, nodes: [], anims: [] };
        t.zone.insertBefore(layer, t.outline);
        t.runs.push(run);
        t.zone.setAttribute("data-busy", "");
        stopIdle();
        if (calm.matches) anim(run, layer, { opacity: [0, 1] }, { duration: 200, easing: "ease" });
        else slats(run, how);
        // Слои эффекта идут выше куска и ниже контура.
        run.nodes.forEach((n) => { if (n.parentNode === t.zone) t.zone.insertBefore(n, t.outline); });
        Promise.allSettled(run.anims.map((a) => a.finished)).then(() => land(run));
    }
    function strip(run, dropLayer) {
        run.anims.forEach((a) => a.cancel());
        run.anims.length = 0;
        run.nodes.forEach((n) => n.remove());
        run.nodes.length = 0;
        run.layer.className = "swap-piece";
        run.layer.removeAttribute("style");
        if (dropLayer) run.layer.remove();
    }
    function land(run) {
        const t = run.track;
        const at = t.runs.indexOf(run);
        if (at < 0) return;
        strip(run, false);
        if (at < t.runs.length - 1) return;   // выше идёт другая смена, этот кусок пока подложка
        t.runs.slice(0, at).forEach((r) => strip(r, true));
        if (t.shown) t.shown.remove();
        t.shown = run.layer;
        t.shownCode = run.code;
        t.runs.length = 0;
        t.zone.removeAttribute("data-busy");
        rest(t.scene, t.scene.groupOf[t.slot]);
        armIdle();
    }

    /* Группа пересекающихся вещей картинки: выбрано не по умолчанию хоть что-то — видны куски всех её слоёв. */
    const isDefault = (slot, code) => slots[slot].options[0].code === code;
    function baseSrc(sc) {
        const src = sc.img.hasAttribute("data-swapped") || root.dataset.mode === "clean" ? sc.img.dataset.clean : sc.img.dataset.marked;
        if (sc.img.getAttribute("src") !== src) sc.img.setAttribute("src", src);
    }
    function activate(sc, group, tracks, layers) {
        group.active = true;
        tracks.forEach((t, i) => {
            if (t.shown || t.runs.length) return;
            t.shown = layers[i];
            t.shownCode = topCode(t);
            t.zone.insertBefore(layers[i], t.zone.firstChild);
        });
        // Подписи с картинки ушли бы вместе со старой вещью, поэтому под кусками всегда картинка без подписей.
        sc.img.setAttribute("data-swapped", "");
        baseSrc(sc);
    }
    function rest(sc, group) {
        const tracks = group.slots.flatMap((s) => sc.bySlot[s]);
        if (!group.active || tracks.some((t) => t.runs.length || !isDefault(t.slot, t.shownCode))) return;
        if (group.slots.some((s) => !isDefault(s, wanted[s]))) return;
        group.active = false;
        tracks.forEach((t) => {
            if (t.shown) t.shown.remove();
            t.shown = null;
        });
        sc.img.removeAttribute("data-swapped");
        baseSrc(sc);
    }

    async function change(sc, slot, code, how) {
        const group = sc.groupOf[slot];
        const own = sc.bySlot[slot];
        const others = group.slots.filter((s) => s !== slot).flatMap((s) => sc.bySlot[s]);
        const loads = [load(sc.img.dataset.clean)];
        own.forEach((t) => loads.push(assets(t, code), assets(t, topCode(t))));
        if (!group.active) others.forEach((t) => loads.push(assets(t, topCode(t))));
        await Promise.all(loads);
        const layers = await Promise.all(own.map((t) => layerOf(t, code)));
        const under = group.active ? [] : await Promise.all(others.map((t) => layerOf(t, topCode(t))));
        if (wanted[slot] !== code) return;
        if (!group.active) activate(sc, group, others, under);
        own.forEach((t, i) => { if (code !== topCode(t)) start(t, code, layers[i], how); });
    }

    function showWait(sc, text) {
        clearTimeout(sc.waitClear);
        sc.wait.textContent = text;
        sc.wait.hidden = !text;
    }
    async function pick(slot, code, how, from) {
        if (code === wanted[slot]) return;
        wanted[slot] = code;
        paint(slot);
        for (const sc of scenes) {
            if (sc !== from && sc.bySlot[slot]) change(sc, slot, code, {}).catch(() => {});
        }
        const token = {};
        from.waitToken = token;
        clearTimeout(from.waitTimer);
        showWait(from, "");
        from.waitTimer = setTimeout(() => showWait(from, "Загружаю"), 150);
        try {
            await change(from, slot, code, how);
        } catch {
            if (wanted[slot] !== code) return;
            clearTimeout(from.waitTimer);
            wanted[slot] = topCode(from.bySlot[slot][0]);
            paint(slot);
            showWait(from, "Не загрузилось. Нажмите ещё раз.");
            from.waitClear = setTimeout(() => showWait(from, ""), 4000);
            return;
        }
        if (from.waitToken !== token) return;
        clearTimeout(from.waitTimer);
        showWait(from, "");
    }

    /* Что выбрано: барабаны и счёт на всех табличках слота, контуры, список. */
    const live = document.createElement("div");
    live.className = "swap-live";
    live.setAttribute("aria-live", "polite");
    let liveTimer = 0;
    function paint(slot) {
        const options = slots[slot].options;
        const n = options.length;
        const at = options.findIndex((o) => o.code === wanted[slot]);
        for (const sc of scenes) {
            const p = sc.plates[slot];
            if (!p) continue;
            p.turn += (at - p.turn % n + n) % n;
            p.drum.style.transform = `translateZ(${(-p.r).toFixed(2)}px) rotateX(${(-p.turn * 360 / n).toFixed(2)}deg)`;
            [...p.ticks.children].forEach((tick, i) => tick.toggleAttribute("data-on", i === at));
            sc.bySlot[slot].forEach((t) => setVars(t.outline, { "--line": cssUrl(file(t, "line", wanted[slot])) }));
            if (sc.panelSlot === slot) {
                sc.opts.querySelectorAll(".swap-opt").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.code === wanted[slot])));
            }
        }
        const o = options[at];
        clearTimeout(liveTimer);
        liveTimer = setTimeout(() => { live.textContent = `На картинке ${o.code}, ${o.name}, ${o.size}`; }, 300);
    }
    function next(slot) {
        const options = slots[slot].options;
        const at = options.findIndex((o) => o.code === wanted[slot]);
        return options[(at + 1) % options.length].code;
    }

    /* Список вариантов под картинкой: таблички переворачиваются на месте, как рейки. */
    function renderPanel(sc, slot) {
        sc.panelSlot = slot;
        sc.title.textContent = slots[slot].pick;
        sc.opts.innerHTML = slots[slot].options.map((o) => `<button class="swap-opt" type="button" data-code="${o.code}" aria-pressed="${o.code === wanted[slot]}">
            ${o.photo ? `<img src="${o.photo}" alt="">` : "<span class=\"swap-opt-ph\"></span>"}
            <span class="swap-opt-tx"><b>${o.code}</b><span>${o.name}</span><span class="swap-opt-size">${o.size}</span></span>
        </button>`).join("");
    }
    function stopPanelMotion(sc) {
        sc.panel.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    }
    function openPanel(sc, slot) {
        if (openScene && openScene !== sc) closePanel(openScene, false, true);
        if (sc.open && sc.panelSlot === slot) return;
        const fresh = !sc.open;
        sc.open = true;
        openScene = sc;
        stopPanelMotion(sc);
        renderPanel(sc, slot);
        sc.panel.hidden = false;
        for (const s in sc.plates) sc.plates[s].button.setAttribute("aria-expanded", String(s === slot));
        if (calm.matches) sc.panel.animate({ opacity: [0, 1] }, { duration: 200 });
        else {
            [sc.head, ...sc.opts.children].forEach((b, i) => b.animate([
                { transform: "perspective(420px) rotateX(-84deg)", opacity: 0 },
                { transform: "perspective(420px) rotateX(7deg)", opacity: 1, offset: .68 },
                { transform: "perspective(420px) rotateX(0deg)", opacity: 1 },
            ], { duration: 400, delay: i * 62, easing: "ease-out", fill: "backwards" }));
        }
        if (fresh) {
            const over = sc.panel.getBoundingClientRect().bottom + 12 - innerHeight;
            if (over > 0) scrollBy({ top: Math.min(over, sc.scene.getBoundingClientRect().top - 8), behavior: calm.matches ? "auto" : "smooth" });
        }
        stopIdle();
    }
    function hidePanel(sc) {
        stopPanelMotion(sc);
        sc.panel.hidden = true;
    }
    function closePanel(sc, returnFocus, instant) {
        if (instant) hidePanel(sc);
        if (!sc.open) return;
        sc.open = false;
        if (openScene === sc) openScene = null;
        const plate = sc.plates[sc.panelSlot].button;
        for (const s in sc.plates) sc.plates[s].button.setAttribute("aria-expanded", "false");
        armIdle();
        const done = () => {
            if (sc.open) return;
            hidePanel(sc);
            if (returnFocus) plate.focus({ preventScroll: true });
        };
        if (instant) { done(); return; }
        stopPanelMotion(sc);
        sc.panel.animate({ opacity: [1, 0] }, { duration: 170, easing: "ease-out", fill: "forwards" }).finished.then(done).catch(() => {});
    }

    /* Покой: раз в несколько секунд вещь на картинке перед глазами показывает, что её можно менять. */
    let idleTimer = 0;
    let idleRun = null;
    function stopIdle() {
        clearTimeout(idleTimer);
        if (!idleRun) return;
        idleRun.anims.forEach((a) => a.cancel());
        idleRun.nodes.forEach((n) => n.remove());
        idleRun = null;
    }
    function armIdle() {
        clearTimeout(idleTimer);
        if (!calm.matches && rich) idleTimer = setTimeout(idle, 4600);
    }
    function idle() {
        const sc = scenes
            .filter((s) => s.ratio >= .5 && !s.tracks.some((t) => t.runs.length))
            .sort((a, b) => b.ratio - a.ratio)[0];
        if (document.hidden || openScene || !sc) { armIdle(); return; }
        stopIdle();
        const order = Object.keys(sc.plates);
        const slot = order[sc.idleAt++ % order.length];
        const run = { nodes: [], anims: [] };
        idleRun = run;
        for (const t of sc.bySlot[slot]) {
            const { width } = t.zone.getBoundingClientRect();
            const comb = node(run, "swap-fx swap-masked swap-comb", t.zone);
            setVars(comb, { "--shape": cssUrl(file(t, "shape", topCode(t))), "--o": "0%", "--sw": `${(width / slatCount(width)).toFixed(2)}px` });
            t.zone.insertBefore(comb, t.outline);
            anim(run, comb, { "--p": ["0%", "130%"] }, { duration: 1300, easing: "ease-in-out" });
            anim(run, comb, { opacity: [.75, .75, 0] }, { duration: 1300 });
        }
        Promise.allSettled(run.anims.map((a) => a.finished)).then(() => {
            if (idleRun === run) stopIdle();
            armIdle();
        });
    }

    /* Нажатия: каждое ставит следующий вариант и открывает список. */
    function hot(sc, slot) {
        sc.scene.toggleAttribute("data-hot", Boolean(slot));
        sc.tracks.forEach((t) => t.zone.toggleAttribute("data-hot", t.slot === slot));
    }
    function intent(slot) {
        const code = next(slot);
        for (const sc of scenes) (sc.bySlot[slot] || []).forEach((t) => assets(t, code).catch(() => {}));
    }
    function press(sc, slot, x) {
        openPanel(sc, slot);
        pick(slot, next(slot), { x }, sc);
    }

    // Таблички не выходят за края картинки, сколько бы ни было ширины.
    function fitPlates(sc) {
        const s = sc.scene.getBoundingClientRect();
        for (const slot in sc.plates) {
            const b = sc.plates[slot].button;
            b.style.removeProperty("--dx");
            b.style.removeProperty("--dy");
            if (getComputedStyle(b).position !== "absolute") continue;
            const r = b.getBoundingClientRect();
            const dx = r.left < s.left + 6 ? s.left + 6 - r.left : (r.right > s.right - 6 ? s.right - 6 - r.right : 0);
            const dy = r.bottom > s.bottom - 6 ? s.bottom - 6 - r.bottom : 0;
            if (dx) b.style.setProperty("--dx", `${dx.toFixed(1)}px`);
            if (dy) b.style.setProperty("--dy", `${dy.toFixed(1)}px`);
        }
    }

    /* Сборка одной картинки. */
    function el(tag, cls) {
        const e = document.createElement(tag);
        e.className = cls;
        return e;
    }
    function mount(img, view, v) {
        const figure = img.closest("figure");
        if (!figure) return;
        const sc = { view, img, tracks: [], bySlot: {}, groupOf: {}, plates: {}, open: false, panelSlot: null, idleAt: 0, ratio: 0 };
        figure.classList.add("swap-figure");
        const stage = el("div", "swap-stage");
        sc.scene = el("div", "swap-scene");
        img.replaceWith(stage);
        stage.append(sc.scene);
        sc.scene.append(img);

        for (const layer of v.layers) {
            const b = layer.box;
            const t = { scene: sc, view, id: layer.id, slot: layer.slot, box: b, shown: null, shownCode: slots[layer.slot].options[0].code, runs: [], sweep: 1 };
            t.zone = el("div", "swap-zone");
            Object.assign(t.zone.style, { left: pct(b[0]), top: pct(b[1]), width: pct(b[2] - b[0]), height: pct(b[3] - b[1]) });
            t.outline = el("div", "swap-fx swap-outline");
            t.zone.append(t.outline);
            sc.scene.append(t.zone);
            sc.tracks.push(t);
            (sc.bySlot[layer.slot] ||= []).push(t);
        }
        for (const members of v.groups) {
            const group = { slots: members, active: false };
            members.forEach((s) => { sc.groupOf[s] = group; });
        }
        sc.hit = el("div", "swap-hit");
        sc.wait = el("div", "swap-wait");
        sc.wait.setAttribute("role", "status");
        sc.wait.hidden = true;
        sc.scene.append(sc.hit, sc.wait);

        const panelId = `swap-panel-${view}`;
        const row = el("div", "swap-plates");
        stage.append(row);
        for (const slot of Object.keys(sc.bySlot)) {
            const meta = slots[slot];
            const [x, y] = v.plates[slot];
            const button = el("button", "swap-plate");
            button.type = "button";
            setVars(button, { "--x": x, "--y": y });
            button.setAttribute("aria-expanded", "false");
            button.setAttribute("aria-controls", panelId);
            button.setAttribute("aria-label", meta.next);
            button.innerHTML = `<span class="swap-plate-lab">${meta.next}</span><span class="swap-plate-row"><span class="swap-drum-win" aria-hidden="true"><span class="swap-drum"></span></span><span class="swap-ticks" aria-hidden="true"></span></span>`;
            row.append(button);
            const n = meta.options.length;
            // Грани барабана по кругу: угол 360/N, радиус — чтобы грань высотой в строку касалась соседних.
            const rowHeight = button.querySelector(".swap-drum-win").offsetHeight || 18;
            const r = n > 2 ? rowHeight / 2 / Math.tan(Math.PI / n) : 0;
            const drum = button.querySelector(".swap-drum");
            drum.innerHTML = meta.options.map((o, i) => `<span class="swap-face" style="transform:rotateX(${(i * 360 / n).toFixed(2)}deg) translateZ(${r.toFixed(2)}px)">${o.code}</span>`).join("");
            const ticks = button.querySelector(".swap-ticks");
            ticks.innerHTML = meta.options.map(() => "<i></i>").join("");
            sc.plates[slot] = { button, drum, ticks, r, turn: 0 };

            button.addEventListener("pointerenter", () => { intent(slot); hot(sc, slot); });
            button.addEventListener("pointerleave", () => hot(sc, null));
            button.addEventListener("pointerdown", () => intent(slot));
            button.addEventListener("focus", () => intent(slot));
            button.addEventListener("click", () => press(sc, slot));
        }

        sc.panel = el("div", "swap-panel");
        sc.panel.id = panelId;
        sc.panel.setAttribute("role", "group");
        sc.panel.hidden = true;
        sc.panel.innerHTML = `<div class="swap-panel-head"><span class="swap-panel-title"></span>
            <button class="swap-close" type="button" aria-label="Закрыть выбор"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12"></path></svg></button></div>
            <div class="swap-opts"></div>`;
        stage.after(sc.panel);
        sc.head = sc.panel.querySelector(".swap-panel-head");
        sc.title = sc.panel.querySelector(".swap-panel-title");
        sc.opts = sc.panel.querySelector(".swap-opts");
        sc.panel.setAttribute("aria-label", "Выбор варианта");
        sc.panel.querySelector(".swap-close").addEventListener("click", () => closePanel(sc, true));
        sc.opts.addEventListener("click", (event) => {
            const b = event.target.closest(".swap-opt");
            if (b) pick(sc.panelSlot, b.dataset.code, {}, sc);
        });

        sc.hit.addEventListener("click", (event) => {
            const [x, y] = toImage(sc, event);
            const t = thingAt(sc, x, y);
            if (!t) { closePanel(sc, false); return; }
            press(sc, t.slot, clamp((x - t.box[0]) / (t.box[2] - t.box[0])));
        });
        sc.hit.addEventListener("pointermove", (event) => {
            if (event.pointerType !== "mouse") return;
            const t = thingAt(sc, ...toImage(sc, event));
            if (t && !sc.scene.hasAttribute("data-hot")) intent(t.slot);
            hot(sc, t ? t.slot : null);
        });
        sc.hit.addEventListener("pointerleave", () => hot(sc, null));
        sc.hit.addEventListener("pointerdown", (event) => {
            const t = thingAt(sc, ...toImage(sc, event));
            if (t) intent(t.slot);
        });

        for (const t of sc.tracks) {
            shape(t, t.shownCode).catch(() => {});
            setVars(t.outline, { "--line": cssUrl(file(t, "line", wanted[t.slot])) });
        }
        new ResizeObserver(() => fitPlates(sc)).observe(stage);
        scenes.push(sc);
    }

    function init(data) {
        slots = data.slots;
        for (const slot in slots) wanted[slot] = slots[slot].options[0].code;
        for (const img of root.querySelectorAll("img[data-marked][data-clean]")) {
            const view = (img.dataset.clean.match(/img\/(\w+)\.clean\.jpg$/) || [])[1];
            if (view && data.views[view]) mount(img, view, data.views[view]);
        }
        if (!scenes.length) return;
        root.append(live);
        for (const slot in slots) paint(slot);
        clearTimeout(liveTimer);

        const seen = new IntersectionObserver((entries) => {
            for (const e of entries) {
                const sc = scenes.find((s) => s.scene === e.target);
                if (sc) sc.ratio = e.intersectionRatio;
            }
        }, { threshold: [0, .25, .5, .75, 1] });
        scenes.forEach((sc) => seen.observe(sc.scene));

        addEventListener("keydown", (event) => {
            if (event.key === "Escape" && openScene) closePanel(openScene, true);
        });
        // Нажатие мимо: по отпусканию и без сдвига, иначе список закрывался бы при прокрутке.
        let down = null;
        addEventListener("pointerdown", (event) => { down = { x: event.clientX, y: event.clientY, el: event.target }; }, true);
        addEventListener("pointercancel", () => { down = null; }, true);
        addEventListener("pointerup", (event) => {
            const p = down;
            down = null;
            if (!p || !openScene || Math.hypot(event.clientX - p.x, event.clientY - p.y) > 12) return;
            if (p.el.closest && p.el.closest(".swap-panel, .swap-plate, .swap-hit")) return;
            closePanel(openScene, false);
        }, true);
        armIdle();
    }

    fetch("swap/data.json")
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => { if (data && data.slots && data.views) init(data); })
        .catch(() => {});
})();
