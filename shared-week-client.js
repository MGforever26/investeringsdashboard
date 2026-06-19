/*
  Delt madplansuge til statisk GitHub Pages app.

  Brugsmønster:
  1. Deploy apps-script/Code.gs som Google Apps Script Web App.
  2. Indsæt Web App URL herunder i MADPLAN_SHARE_CONFIG.apiUrl.
  3. Kald MadplanShare.shareCurrentWeek(...) fra knappen Del uge.
  4. Kald MadplanShare.loadFromUrl(...) ved app start.
  5. Kald MadplanShare.startAutoSave(...) når en delt uge er åben.

  Vigtigt:
  Apps Script POST bruges med mode no-cors, så klienten genererer selv id'et.
  Hentning sker via JSONP, så GitHub Pages undgår CORS-problemer.
*/

window.MADPLAN_SHARE_CONFIG = window.MADPLAN_SHARE_CONFIG || {
  apiUrl: 'PASTE_DEPLOYED_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE',
  urlParam: 'uge',
  autosaveDelayMs: 900
};

(function () {
  function getConfig() {
    return window.MADPLAN_SHARE_CONFIG || {};
  }

  function hasConfiguredApi() {
    const apiUrl = getConfig().apiUrl || '';
    return apiUrl && !apiUrl.includes('PASTE_DEPLOYED');
  }

  function createShareId() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let id = '';
    for (const byte of bytes) id += alphabet[byte % alphabet.length];
    return id;
  }

  function currentShareId() {
    const param = getConfig().urlParam || 'uge';
    const url = new URL(window.location.href);
    return url.searchParams.get(param) || '';
  }

  function setShareIdInUrl(id) {
    const param = getConfig().urlParam || 'uge';
    const url = new URL(window.location.href);
    url.searchParams.set(param, id);
    window.history.replaceState({}, '', url.toString());
    return url.toString();
  }

  function makeShareUrl(id, baseUrl) {
    const param = getConfig().urlParam || 'uge';
    const url = new URL(baseUrl || window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set(param, id);
    return url.toString();
  }

  function postFormNoCors(fields) {
    const apiUrl = getConfig().apiUrl;
    const body = new URLSearchParams();
    Object.keys(fields).forEach(function (key) {
      body.set(key, fields[key] == null ? '' : String(fields[key]));
    });

    return fetch(apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: body.toString()
    });
  }

  function saveSharedWeek(options) {
    if (!hasConfiguredApi()) {
      return Promise.reject(new Error('Google Apps Script Web App URL mangler i MADPLAN_SHARE_CONFIG.apiUrl'));
    }

    const state = options && options.state ? options.state : {};
    const id = options && options.id ? options.id : currentShareId() || createShareId();
    const editor = options && options.editor ? options.editor : '';
    const note = options && options.note ? options.note : '';

    return postFormNoCors({
      action: 'save',
      id: id,
      payload: JSON.stringify(state),
      editor: editor,
      note: note
    }).then(function () {
      return { ok: true, id: id };
    });
  }

  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      const callbackName = '__madplanShareCallback_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
      const script = document.createElement('script');
      const timeout = setTimeout(function () {
        cleanup();
        reject(new Error('Timeout ved hentning af delt uge'));
      }, 10000);

      function cleanup() {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[callbackName]; } catch (err) { window[callbackName] = undefined; }
      }

      window[callbackName] = function (data) {
        cleanup();
        resolve(data);
      };

      script.onerror = function () {
        cleanup();
        reject(new Error('Kunne ikke hente delt uge'));
      };

      script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + encodeURIComponent(callbackName);
      document.head.appendChild(script);
    });
  }

  function loadSharedWeek(id) {
    if (!hasConfiguredApi()) {
      return Promise.reject(new Error('Google Apps Script Web App URL mangler i MADPLAN_SHARE_CONFIG.apiUrl'));
    }

    const apiUrl = getConfig().apiUrl;
    const url = apiUrl + '?action=get&id=' + encodeURIComponent(id);
    return jsonp(url).then(function (response) {
      if (!response || !response.ok) throw new Error(response && response.error ? response.error : 'Ukendt fejl');
      if (!response.found) return null;
      return response.week;
    });
  }

  function copyOrShare(url, title, text) {
    if (navigator.share) {
      return navigator.share({ title: title || 'Madplan', text: text || 'Her er ugens madplan', url: url });
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url);
    }

    window.prompt('Kopiér linket til ugens madplan:', url);
    return Promise.resolve();
  }

  function shareCurrentWeek(options) {
    const getState = options && options.getState;
    if (typeof getState !== 'function') {
      return Promise.reject(new Error('shareCurrentWeek kræver getState funktion'));
    }

    const id = currentShareId() || createShareId();
    const state = getState();
    const editor = options && options.editor ? options.editor : '';
    const baseUrl = options && options.baseUrl ? options.baseUrl : window.location.href;
    const shareUrl = makeShareUrl(id, baseUrl);

    return saveSharedWeek({ id: id, state: state, editor: editor, note: 'manual share' })
      .then(function () {
        setShareIdInUrl(id);
        return copyOrShare(shareUrl, 'Madplan', 'Her er ugens madplan');
      })
      .then(function () {
        return { ok: true, id: id, url: shareUrl };
      });
  }

  function loadFromUrl(options) {
    const id = currentShareId();
    const applyState = options && options.applyState;
    if (!id) return Promise.resolve(null);
    if (typeof applyState !== 'function') {
      return Promise.reject(new Error('loadFromUrl kræver applyState funktion'));
    }

    return loadSharedWeek(id).then(function (week) {
      if (!week) return null;
      applyState(week.data || {}, week);
      return week;
    });
  }

  function startAutoSave(options) {
    const getState = options && options.getState;
    const editor = options && options.editor ? options.editor : '';
    const delayMs = options && options.delayMs ? options.delayMs : getConfig().autosaveDelayMs || 900;
    let timer = null;

    if (typeof getState !== 'function') {
      throw new Error('startAutoSave kræver getState funktion');
    }

    function schedule() {
      const id = currentShareId();
      if (!id) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        saveSharedWeek({ id: id, state: getState(), editor: editor, note: 'autosave' }).catch(function (err) {
          console.warn('Autosave fejlede:', err);
        });
      }, delayMs);
    }

    return { schedule: schedule };
  }

  window.MadplanShare = {
    createShareId: createShareId,
    currentShareId: currentShareId,
    makeShareUrl: makeShareUrl,
    saveSharedWeek: saveSharedWeek,
    loadSharedWeek: loadSharedWeek,
    shareCurrentWeek: shareCurrentWeek,
    loadFromUrl: loadFromUrl,
    startAutoSave: startAutoSave
  };
})();
