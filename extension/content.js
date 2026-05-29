// Brief — content script
// 1. On INJECT_BAR message, creates the floating bar iframe overlay
// 2. During recording, captures user events (click/key/scroll) on this tab

(() => {
  if (window.__briefInjected) return;
  window.__briefInjected = true;

  let active = false;
  let startedAt = 0;
  let iframeEl = null;

  // ---------- Message router ----------
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === 'INJECT_BAR') {
      injectBar(message.streamId, message.lang || 'en-US', message.intent || 'issue', message.mode || 'ship');
    } else if (message?.type === 'BRIEF_START') {
      active = true;
      startedAt = message.startedAt || Date.now();
    } else if (message?.type === 'BRIEF_STOP') {
      active = false;
    } else if (message?.type === 'CLOSE_BAR') {
      removeBar();
    }
    return false;
  });

  // ---------- Iframe injection ----------
  function injectBar(streamId, lang, intent, mode) {
    // If a bar is already on-screen, ignore — recording's in progress
    if (iframeEl) return;
    const hashParts = [
      `streamId=${encodeURIComponent(streamId)}`,
      `lang=${encodeURIComponent(lang)}`,
      `intent=${encodeURIComponent(intent)}`,
      `mode=${encodeURIComponent(mode || 'ship')}`,
    ];
    const url = chrome.runtime.getURL('bar.html') + '#' + hashParts.join('&');

    iframeEl = document.createElement('iframe');
    iframeEl.id = '__brief_iframe__';
    iframeEl.src = url;
    iframeEl.allow = 'microphone; camera; display-capture; clipboard-write';
    iframeEl.scrolling = 'no';
    setIframeSize(388, 80);
    Object.assign(iframeEl.style, {
      position: 'fixed',
      bottom: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
      border: '0',
      background: 'transparent',
      zIndex: '2147483647',
      colorScheme: 'normal',
      pointerEvents: 'auto',
      overflow: 'hidden',
      boxShadow: 'none',
      transition: 'opacity 0.18s ease',
    });
    (document.body || document.documentElement).appendChild(iframeEl);

    // Restore previous position if saved
    try {
      chrome.storage.local.get('barPos', ({ barPos }) => {
        if (barPos && typeof barPos.left === 'number' && typeof barPos.top === 'number') {
          // Wait a tick so the iframe has dimensions before we clamp
          requestAnimationFrame(() => applyIframePosition(barPos.left, barPos.top));
        }
      });
    } catch {}

    window.addEventListener('message', onIframeMessage);
  }

  function setIframeSize(w, h) {
    if (!iframeEl) return;
    iframeEl.style.width = `${w}px`;
    iframeEl.style.height = `${h}px`;
  }

  // ---------- Drag state ----------
  let dragOrigin = null; // {left, top, mouseX, mouseY} when drag started

  function onPageMouseMove(e) {
    if (!dragOrigin) return;
    const dx = e.clientX - dragOrigin.mouseX;
    const dy = e.clientY - dragOrigin.mouseY;
    applyIframePosition(dragOrigin.left + dx, dragOrigin.top + dy);
  }

  function onPageMouseUp() {
    if (!dragOrigin) return;
    if (iframeEl) {
      iframeEl.style.transition = 'opacity 0.18s ease';
      iframeEl.style.pointerEvents = 'auto';
    }
    dragOrigin = null;
    persistPosition();
    document.removeEventListener('mousemove', onPageMouseMove, true);
    document.removeEventListener('mouseup', onPageMouseUp, true);
  }

  function applyIframePosition(left, top) {
    if (!iframeEl) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = iframeEl.offsetWidth || 400;
    const h = iframeEl.offsetHeight || 80;
    const clampedLeft = Math.max(0, Math.min(vw - w, left));
    const clampedTop = Math.max(0, Math.min(vh - h, top));
    iframeEl.style.left = `${clampedLeft}px`;
    iframeEl.style.top = `${clampedTop}px`;
    iframeEl.style.right = '';
    iframeEl.style.bottom = '';
    iframeEl.style.transform = '';
  }

  function persistPosition() {
    if (!iframeEl) return;
    const rect = iframeEl.getBoundingClientRect();
    try {
      chrome.storage.local.set({
        barPos: { left: rect.left, top: rect.top },
      });
    } catch {}
  }

  function onIframeMessage(e) {
    if (!iframeEl || e.source !== iframeEl.contentWindow) return;
    const msg = e.data;
    if (!msg || msg.app !== 'brief') return;
    if (msg.type === 'layout' || msg.type === 'resize') {
      const w = Number(msg.width) || 388;
      const h = Number(msg.height) || 80;
      setIframeSize(Math.max(220, Math.min(640, w)), Math.max(50, Math.min(640, h)));
    } else if (msg.type === 'close') {
      fadeOutAndRemove();
    } else if (msg.type === 'dragStart') {
      const rect = iframeEl.getBoundingClientRect();
      dragOrigin = {
        left: rect.left,
        top: rect.top,
        mouseX: rect.left + (msg.localX || 0),
        mouseY: rect.top + (msg.localY || 0),
      };
      iframeEl.style.transition = 'none';
      // Disable iframe pointer-events so cursor stays at page level during drag
      iframeEl.style.pointerEvents = 'none';
      document.addEventListener('mousemove', onPageMouseMove, true);
      document.addEventListener('mouseup', onPageMouseUp, true);
    }
  }

  function fadeOutAndRemove() {
    if (!iframeEl) return;
    iframeEl.style.opacity = '0';
    setTimeout(removeBar, 280);
  }

  function removeBar() {
    if (iframeEl) {
      window.removeEventListener('message', onIframeMessage);
      iframeEl.remove();
      iframeEl = null;
    }
  }

  // ---------- Event capture ----------
  function describeElement(el) {
    if (!el || el.nodeType !== 1) return null;
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls =
      el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
        : '';
    const text = (el.innerText || el.value || '').trim().slice(0, 80);
    return { tag, selector: `${tag}${id}${cls}`, text };
  }

  function report(eventType, detail) {
    if (!active) return;
    chrome.runtime
      .sendMessage({
        type: 'EVENT',
        payload: {
          type: eventType,
          tMs: Date.now() - startedAt,
          url: location.href,
          ...detail,
        },
      })
      .catch(() => {});
  }

  document.addEventListener(
    'click',
    (e) => {
      // Ignore clicks inside the bar iframe (different document, won't bubble here anyway)
      const el = describeElement(e.target);
      if (el) report('click', { element: el, x: e.clientX, y: e.clientY });
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target?.tagName || '').toUpperCase());
      report('key', {
        key: e.key.length === 1 ? '<char>' : e.key,
        isInput,
      });
    },
    true,
  );

  let scrollTimer = null;
  document.addEventListener(
    'scroll',
    () => {
      if (scrollTimer) return;
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        report('scroll', { y: window.scrollY });
      }, 250);
    },
    { capture: true, passive: true },
  );

  // ---------- Page-world console capture forwarding ----------
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d.__brief !== 'string') return;
    if (d.__brief === 'console-error') {
      report('console-error', { args: d.args });
    } else if (d.__brief === 'js-error') {
      report('js-error', {
        message: d.message,
        filename: d.filename,
        lineno: d.lineno,
        colno: d.colno,
      });
    } else if (d.__brief === 'promise-rejection') {
      report('promise-rejection', { reason: d.reason });
    }
  });
})();
