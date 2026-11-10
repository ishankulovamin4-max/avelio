(function () {
  "use strict";

  var video = document.getElementById("hero-video");
  if (!video) {
    return;
  }

  var frame = video.closest(".video-frame");
  if (!frame) {
    return;
  }

  var soundToggle = document.getElementById("sound-toggle");
  var soundOff = document.getElementById("sound-off");
  var playButton = document.createElement("button");
  var gestureEvents = ["pointerdown", "touchend", "click", "keydown", "scroll", "wheel"];
  var gestureOptions = { capture: true, passive: true };
  var listening = false;
  var rejected = false;
  var pending = false;
  var attempt = 0;
  var legacyFailure = null;

  playButton.type = "button";
  playButton.className = "hero-video-play";
  playButton.hidden = true;
  playButton.setAttribute("aria-label", "Смотреть ролик со звуком");
  playButton.innerHTML =
    '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
    '<path d="M11 6 L27 16 L11 26 Z" fill="currentColor"/></svg>';
  frame.appendChild(playButton);

  function setSound(on) {
    video.muted = !on;
    video.defaultMuted = !on;
    video.loop = !on;

    if (on) {
      video.removeAttribute("muted");
    } else {
      video.setAttribute("muted", "");
    }

    if (soundToggle) {
      soundToggle.hidden = on;
    }
    if (soundOff) {
      soundOff.hidden = !on;
    }
  }

  function focusPlate(on) {
    var target = on ? soundOff : soundToggle;
    if (target) {
      target.focus({ preventScroll: true });
    }
  }

  function announce(on, source) {
    var event;
    var detail = { on: on, source: source };

    if (typeof window.CustomEvent === "function") {
      event = new CustomEvent("avelio:sound", { detail: detail });
    } else {
      event = document.createEvent("CustomEvent");
      event.initCustomEvent("avelio:sound", false, false, detail);
    }

    video.dispatchEvent(event);
  }

  function removeGestures() {
    if (!listening) {
      return;
    }

    gestureEvents.forEach(function (name) {
      document.removeEventListener(name, retryFromGesture, true);
    });
    listening = false;
  }

  function addGestures() {
    if (listening) {
      return;
    }

    gestureEvents.forEach(function (name) {
      document.addEventListener(name, retryFromGesture, gestureOptions);
    });
    listening = true;
  }

  function markPlaying() {
    if (video.paused) {
      return;
    }

    rejected = false;
    pending = false;
    legacyFailure = null;
    playButton.hidden = true;
    removeGestures();
  }

  function markRejected() {
    rejected = true;
    playButton.hidden = false;
    addGestures();
  }

  function requestPlay(withSound) {
    var id = ++attempt;
    var result;

    pending = true;
    legacyFailure = null;

    function failed(error) {
      if (id !== attempt) {
        return;
      }

      pending = false;
      legacyFailure = null;

      // pause()/load() могут прервать ещё ожидающий play().
      // Это не отказ политики автозапуска и не повод показывать кнопку.
      if (error && error.name === "AbortError") {
        return;
      }

      if (withSound) {
        setSound(false);
        announce(false, "fail");
        focusPlate(false);
        markRejected();
        requestPlay(false);
      } else {
        markRejected();
      }
    }

    try {
      result = video.play();
    } catch (error) {
      failed(error);
      return;
    }

    if (result && typeof result.then === "function") {
      result.then(function () {
        if (id !== attempt) {
          return;
        }

        pending = false;

        // При play() уже играющего ролика нового playing может не быть.
        if (!video.paused && !video.seeking && video.readyState >= 3) {
          markPlaying();
        }
      }, failed);
    } else {
      // Старый play() возвращает undefined. Не принимаем paused или
      // отсутствие playing по таймеру за отказ: сеть может быть медленной.
      legacyFailure = failed;

      if (!video.paused && !video.seeking && video.readyState >= 3) {
        markPlaying();
      }
    }
  }

  function retryFromGesture(event) {
    if (event.isTrusted === false || !rejected || !video.muted) {
      return;
    }

    // Пока play() ждёт сеть, не создаём дополнительные запросы.
    // Для старого play() без Promise повторная реальная попытка допустима.
    if (pending && !legacyFailure) {
      return;
    }

    setSound(false);
    requestPlay(false);
  }

  function startWithSound(source) {
    // Инвалидируем результаты предыдущих, ещё ожидающих попыток.
    ++attempt;
    pending = false;
    legacyFailure = null;

    // На каждый запрос звука — с начала, не только на первый.
    try {
      video.currentTime = 0;
    } catch (error) {
      // Старые движки могут запрещать seek до loadedmetadata.
      // У ещё не загруженного ролика начальная позиция и так нулевая.
    }

    setSound(true);
    announce(true, source);
    focusPlate(true);
    requestPlay(true);
  }

  function autoSoundOff(source) {
    if (video.muted !== false) {
      return;
    }

    var restoreFocus = document.activeElement === soundOff;
    var wasPending = pending || Boolean(legacyFailure);

    ++attempt;
    pending = false;
    legacyFailure = null;
    setSound(false);
    announce(false, source);

    // Звуковой play() ещё не ответил: его отказ уже не обработается — запускаем без звука заново.
    if (source === "away" && wasPending) {
      requestPlay(false);
    }

    if (restoreFocus) {
      focusPlate(false);
    }
  }

  video.addEventListener("ended", function () {
    if (video.muted !== false) {
      return;
    }

    autoSoundOff("ended");

    try {
      video.currentTime = 0;
    } catch (error) {
      // Старые движки могут запрещать seek до loadedmetadata.
      // У ещё не загруженного ролика начальная позиция и так нулевая.
    }

    requestPlay(false);
  });

  video.addEventListener("playing", markPlaying);

  video.addEventListener("error", function () {
    if (legacyFailure) {
      legacyFailure(video.error);
    }
  });

  // Capture на родителе выполняется раньше click-обработчика на video,
  // независимо от порядка подключения двух файлов.
  frame.addEventListener("click", function (event) {
    if (event.target !== video) {
      return;
    }

    if (video.muted || video.paused || video.ended) {
      event.preventDefault();
      event.stopPropagation();
      startWithSound("video");
    }
  }, true);

  playButton.addEventListener("click", function () {
    startWithSound("play");
  });

  if (soundToggle) {
    soundToggle.addEventListener("click", function () {
      startWithSound("plate");
    });
  }

  if (soundOff) {
    soundOff.addEventListener("click", function () {
      ++attempt;
      pending = false;
      legacyFailure = null;
      setSound(false);
      announce(false, "off");
      focusPlate(false);
    });
  }

  if (typeof window.IntersectionObserver === "function") {
    var visibilityObserver = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.intersectionRatio < 0.5) {
          autoSoundOff("away");
        }
      });
    }, { threshold: [0, 0.5] });

    visibilityObserver.observe(frame);
  } else {
    var visibilityScheduled = false;
    var scheduleVisibilityCheck = function () {
      if (visibilityScheduled) {
        return;
      }

      visibilityScheduled = true;
      window.requestAnimationFrame(function () {
        visibilityScheduled = false;

        var rect = frame.getBoundingClientRect();
        var height = rect.bottom - rect.top;
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        var visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));

        if (height > 0 && visibleHeight / height < 0.5) {
          autoSoundOff("away");
        }
      });
    };

    window.addEventListener("scroll", scheduleVisibilityCheck, { passive: true });
    window.addEventListener("resize", scheduleVisibilityCheck, { passive: true });
    scheduleVisibilityCheck();
  }

  // Все свойства и атрибуты выставляются до первого явного play().
  setSound(false);
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("x5-playsinline", "");
  requestPlay(false);
})();
