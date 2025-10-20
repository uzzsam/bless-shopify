(function () {
  if (window.BlessChatSectionManager) {
    if (typeof window.BlessChatSectionManager.refresh === 'function') {
      window.BlessChatSectionManager.refresh();
    }
    return;
  }

  var SCRIPT_DATA_ATTR = 'data-bless-chat-src';
  var SECTION_ATTR = 'data-bless-chat-section';
  var manager = {
    sections: {},
    scriptNonce: null
  };

  function log(id, message) {
    if (window.console && typeof window.console.info === 'function') {
      window.console.info('[BlessChat][' + id + '] ' + message);
    }
  }

  function findNonce() {
    if (manager.scriptNonce) {
      return manager.scriptNonce;
    }

    var current = null;
    try {
      current = document.currentScript || null;
    } catch (_ignore) {
      current = null;
    }

    if (current) {
      var directNonce =
        (typeof current.getAttribute === 'function' && current.getAttribute('nonce')) ||
        current.nonce ||
        null;
      if (directNonce) {
        manager.scriptNonce = directNonce;
        return directNonce;
      }
    }

    var meta = null;
    if (typeof document.querySelector === 'function') {
      meta = document.querySelector('meta[name="csp-nonce"]');
    }
    if (meta && typeof meta.getAttribute === 'function') {
      var metaNonce = meta.getAttribute('content');
      if (metaNonce) {
        manager.scriptNonce = metaNonce;
        return metaNonce;
      }
    }

    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i += 1) {
      var candidate = scripts[i];
      if (!candidate || typeof candidate.getAttribute !== 'function') {
        continue;
      }
      var candidateNonce = candidate.getAttribute('nonce');
      if (candidateNonce) {
        manager.scriptNonce = candidateNonce;
        return candidateNonce;
      }
    }

    return null;
  }

  function ensureNonce(script) {
    var nonce = findNonce();
    if (nonce && script && !script.getAttribute('nonce')) {
      script.setAttribute('nonce', nonce);
    }
  }

  function setStatus(state, message) {
    if (!state || !state.statusEl) return;
    if (message) {
      state.statusEl.textContent = message;
      state.statusEl.hidden = false;
    } else {
      state.statusEl.textContent = '';
      state.statusEl.hidden = true;
    }
  }

  function tryMount(state, reason) {
    if (!state) return false;
    if (!window.BlessChat || typeof window.BlessChat.mount !== 'function') {
      if (reason) {
        log(state.id, 'BlessChat.mount unavailable (' + reason + ')');
      }
      return false;
    }

    log(state.id, 'Mounting widget');
    try {
      window.BlessChat.mount(state.targetSelector, {
        apiUrl: state.apiUrl || undefined,
        placeholder: state.placeholder || undefined,
        loadingText: state.loadingMessage || undefined
      });
    } catch (error) {
      log(state.id, 'Mount error: ' + error);
      return false;
    }

    return true;
  }

  function handleBlessingEvent(state) {
    return function (event) {
      if (!event || !event.detail) return;
      var detail = event.detail;
      var blessing = detail.blessing || detail.text;
      if (!blessing) return;

      setStatus(state, state.loadingMessage || 'Finalising your blessing...');

      if (!state.appProxyPath) {
        setStatus(state, '');
        window.dispatchEvent(
          new CustomEvent('blessing:update', { detail: { text: blessing } })
        );
        return;
      }

      fetch(state.appProxyPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blessing: blessing })
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('Proxy responded with ' + response.status);
          }
          return response.json();
        })
        .then(function (payload) {
          var text =
            (payload && typeof payload.blessingText === 'string'
              ? payload.blessingText
              : '') || blessing;
          setStatus(state, '');
          window.dispatchEvent(
            new CustomEvent('blessing:update', { detail: { text: text } })
          );
        })
        .catch(function (error) {
          log(state.id, 'Proxy error: ' + error);
          setStatus(
            state,
            state.errorText ||
              'We could not save your blessing. Please try again.'
          );
          window.dispatchEvent(
            new CustomEvent('blessing:error', {
              detail: {
                message:
                  state.errorText ||
                  'We could not save your blessing. Please try again.',
                error: String(error)
              }
            })
          );
        });
    };
  }

  function attachBlessingHandler(state) {
    if (state.blessingHandler) {
      window.removeEventListener('blessing:ready', state.blessingHandler);
    }
    state.blessingHandler = handleBlessingEvent(state);
    window.addEventListener('blessing:ready', state.blessingHandler);
  }

  function loadEmbed(state) {
    if (!state.embedUrl) {
      tryMount(state, 'no-embed-url');
      return;
    }

    var selector =
      'script[' + SCRIPT_DATA_ATTR + '="' + state.embedUrl + '"]';
    var script = document.querySelector(selector);

    if (!script) {
      log(state.id, 'Loading embed script');
      script = document.createElement('script');
      script.src = state.embedUrl;
      script.defer = true;
      script.setAttribute(SCRIPT_DATA_ATTR, state.embedUrl);
      ensureNonce(script);
      script.addEventListener('load', function () {
        script.setAttribute('data-bless-chat-ready', 'true');
        tryMount(state, 'script-load');
      });
      script.addEventListener('error', function (event) {
        var message =
          event && event.message ? event.message : 'Unknown error';
        log(state.id, 'Script failed to load: ' + message);
      });
      document.head.appendChild(script);
    } else {
      ensureNonce(script);
      if (script.getAttribute('data-bless-chat-ready') === 'true') {
        tryMount(state, 'script-ready');
      } else {
        var onScriptReady = function () {
          script.removeEventListener('load', onScriptReady);
          script.setAttribute('data-bless-chat-ready', 'true');
          tryMount(state, 'existing-script-load');
        };
        script.addEventListener('load', onScriptReady);
      }
    }

    if (!state.mountTimer) {
      state.mountTimer = window.setInterval(function () {
        state.mountAttempts += 1;
        if (tryMount(state, 'interval') || state.mountAttempts > 40) {
          window.clearInterval(state.mountTimer);
          state.mountTimer = null;
          if (state.mountAttempts > 40) {
            log(state.id, 'Stopped retrying after 40 attempts');
          }
        }
      }, 250);
    }
  }

  function initialiseSection(sectionEl) {
    if (!sectionEl) return;
    var sectionId = sectionEl.getAttribute('data-section-id');
    if (!sectionId) return;

    if (sectionEl.getAttribute('data-bless-chat-initialized') === 'true') {
      return;
    }

    sectionEl.setAttribute('data-bless-chat-initialized', 'true');

    var state = {
      id: sectionId,
      el: sectionEl,
      embedUrl: sectionEl.getAttribute('data-embed-url'),
      appProxyPath: sectionEl.getAttribute('data-app-proxy-path'),
      apiUrl: sectionEl.getAttribute('data-api-url'),
      placeholder: sectionEl.getAttribute('data-placeholder'),
      loadingMessage: sectionEl.getAttribute('data-loading-text'),
      errorText: sectionEl.getAttribute('data-error-text'),
      targetSelector: '#bless-chat-' + sectionId,
      statusEl: sectionEl.querySelector('[data-status]'),
      mountAttempts: 0,
      mountTimer: null,
      blessingHandler: null
    };

    manager.sections[sectionId] = state;
    loadEmbed(state);
    attachBlessingHandler(state);
  }

  function teardownSection(sectionEl) {
    if (!sectionEl) return;
    var sectionId = sectionEl.getAttribute('data-section-id');
    if (!sectionId) return;
    var state = manager.sections[sectionId];
    if (!state) return;

    if (state.mountTimer) {
      window.clearInterval(state.mountTimer);
      state.mountTimer = null;
    }

    if (state.blessingHandler) {
      window.removeEventListener('blessing:ready', state.blessingHandler);
      state.blessingHandler = null;
    }

    sectionEl.removeAttribute('data-bless-chat-initialized');
    delete manager.sections[sectionId];
  }

  function processAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var sections = scope.querySelectorAll('section[' + SECTION_ATTR + '="true"]');
    for (var i = 0; i < sections.length; i += 1) {
      initialiseSection(sections[i]);
    }
  }

  function teardownAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var sections = scope.querySelectorAll('section[' + SECTION_ATTR + '="true"]');
    for (var i = 0; i < sections.length; i += 1) {
      teardownSection(sections[i]);
    }
  }

  function start() {
    findNonce();
    processAll(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  document.addEventListener('shopify:section:load', function (event) {
    if (event && event.target) {
      processAll(event.target);
    }
  });

  document.addEventListener('shopify:section:unload', function (event) {
    if (event && event.target) {
      teardownAll(event.target);
    }
  });

  manager.refresh = function (root) {
    processAll(root || document);
  };

  manager.teardown = function (root) {
    teardownAll(root || document);
  };

  window.BlessChatSectionManager = manager;
})();
