(function () {
  "use strict";

  const RD_PORT_START = 11100;
  const RD_PORT_END = 11120;
  const RD_HOSTS = ["127.0.0.1", "localhost"];
  const CACHE_KEY = "aharaDeviceInfoCache";
  const WORKING_PORT_KEY = "aharaLastWorkingRdPort";
  const CACHE_VALID_MS = 5 * 60 * 1000; // ⚡ 5 minutes cache during active session
  const BACKGROUND_CHECK_MS = 15000;

  let memoryCache = null;
  let refreshPromise = null;
  let lastBackgroundCheck = 0;

  async function fetchWithTimeout(url, options = {}, timeoutMs = 400) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  function parseDeviceInfo(xmlText, endpoint) {
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    const deviceInfo = xml.querySelector("DeviceInfo");
    if (!deviceInfo) return null;

    const getParam = (name) =>
      xml.querySelector(`Param[name="${name}"]`)?.getAttribute("value") || "";

    const modality = getParam("modality_type");
    const model = deviceInfo.getAttribute("mi") || "";
    const srno = getParam("srno");
    const sysid = getParam("sysid");
    const dc = deviceInfo.getAttribute("dc") || "";
    const deviceId = srno || dc || sysid || model || null;

    if (!deviceId) return null;

    return {
      source: "mantra-rd",
      selected: modality.toLowerCase().includes("iris") ? "IRIS" : "BIO",
      deviceId,
      srno,
      sysid,
      model,
      modality,
      deviceType: getParam("device_type"),
      dpId: deviceInfo.getAttribute("dpId") || "",
      rdsId: deviceInfo.getAttribute("rdsId") || "",
      rdsVer: deviceInfo.getAttribute("rdsVer") || "",
      endpoint
    };
  }

  function isUsableDevice(data) {
    return !!(data && data.deviceId && data.selected);
  }

  function withCacheTime(data) {
    return Object.assign({}, data, {
      cachedAt: Date.now()
    });
  }

  async function readCache() {
    if (memoryCache) return memoryCache;

    try {
      const obj = await chrome.storage.local.get([CACHE_KEY]);
      memoryCache = obj[CACHE_KEY] || null;
      return memoryCache;
    } catch (_) {
      return null;
    }
  }

  async function saveCache(data) {
    if (!isUsableDevice(data)) return null;

    const cached = withCacheTime(data);
    memoryCache = cached;

    try {
      await chrome.storage.local.set({ [CACHE_KEY]: cached });
    } catch (_) {}

    return cached;
  }

  async function clearCache() {
    memoryCache = null;

    try {
      await chrome.storage.local.remove([CACHE_KEY]);
    } catch (_) {}
  }

  function isCacheFresh(cache) {
    return !!(cache && Date.now() - (cache.cachedAt || 0) < CACHE_VALID_MS);
  }

  async function fetchHelper(helperUrl) {
    // ⚡ Fast timeout for optional port 3499 (fails in 250ms if not running)
    const res = await fetchWithTimeout(helperUrl, { cache: "no-store" }, 250);
    if (!res.ok) throw new Error("Helper returned " + res.status);

    const data = await res.json();
    if (!data || (!data.deviceId && !data.selected)) {
      throw new Error("Helper response missing device data");
    }

    return Object.assign({ source: "helper" }, data);
  }

  async function fetchRDInfo(url) {
    const res = await fetchWithTimeout(url, {
      method: "DEVICEINFO",
      cache: "no-store"
    }, 450);

    const text = await res.text();
    if (!text.includes("<DeviceInfo")) return null;

    return parseDeviceInfo(text, url);
  }

  async function fetchMantraRD() {
    // ⚡ Speed Optimization 1: Try last known working port first (<15ms)
    try {
      const cachedPort = sessionStorage.getItem(WORKING_PORT_KEY);
      if (cachedPort) {
        for (const host of RD_HOSTS) {
          const url = `http://${host}:${cachedPort}/rd/info`;
          try {
            const info = await fetchRDInfo(url);
            if (info) return info;
          } catch (_) {}
        }
      }
    } catch (_) {}

    // ⚡ Speed Optimization 2: Try default standard port 11100 first (99% of Mantra scanners)
    for (const host of RD_HOSTS) {
      const url = `http://${host}:11100/rd/info`;
      try {
        const info = await fetchRDInfo(url);
        if (info) {
          try { sessionStorage.setItem(WORKING_PORT_KEY, "11100"); } catch (_) {}
          return info;
        }
      } catch (_) {}
    }

    // Fallback: Scan remaining ports 11101-11120 in order
    for (let port = RD_PORT_START + 1; port <= RD_PORT_END; port++) {
      for (const host of RD_HOSTS) {
        const url = `http://${host}:${port}/rd/info`;
        try {
          const info = await fetchRDInfo(url);
          if (info) {
            try { sessionStorage.setItem(WORKING_PORT_KEY, String(port)); } catch (_) {}
            return info;
          }
        } catch (_) {}
      }
    }

    throw new Error("Mantra RD Service not found");
  }

  async function detectLiveDevice(options = {}) {
    const helperUrl = options.helperUrl || "http://localhost:3499/device";
    const tryHelper = options.tryHelper !== false;

    if (tryHelper) {
      try {
        return await fetchHelper(helperUrl);
      } catch (_) {}
    }

    return fetchMantraRD();
  }

  async function refreshCache(options = {}) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = detectLiveDevice(options)
      .then(saveCache)
      .catch(async (error) => {
        await clearCache();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  }

  function refreshInBackground(options = {}) {
    const now = Date.now();
    if (refreshPromise || now - lastBackgroundCheck < BACKGROUND_CHECK_MS) return;

    lastBackgroundCheck = now;
    refreshCache(options).catch(() => {});
  }

  async function getDevice(options = {}) {
    const useCache = options.useCache !== false;
    const forceRefresh = options.forceRefresh === true;

    if (useCache && !forceRefresh) {
      const cache = await readCache();

      if (isCacheFresh(cache)) {
        refreshInBackground(options);
        return cache;
      }
    }

    return refreshCache(options);
  }

  window.AharaDeviceFallback = {
    getDevice,
    fetchMantraRD,
    clearCache
  };
})();
