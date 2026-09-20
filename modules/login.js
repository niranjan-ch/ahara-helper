window.runLogin = function () {

  console.log("Ahara Auto Bot started");

  /* ===============================
     DISCLAIMER PAGE AUTO-BYPASS
  ================================ */
  if (window.location.href.includes("Disclaimer.aspx") || window.location.pathname.toLowerCase().includes("disclaimer.aspx")) {
    console.log("Disclaimer page detected. Navigating to Main Menu.");

    // Remove big captcha if exists
    document.getElementById("bigCaptchaBox")?.remove();

    function bypassDisclaimer() {
      const match = window.location.pathname.match(/\/(shopowner_[a-z]server)\//i);
      if (match) {
        console.log("⚡ Instant redirect to MainMenu.aspx from Disclaimer...");
        window.location.replace(`https://ahara.karnataka.gov.in/${match[1]}/main/MainMenu.aspx`);
        return true;
      }

      const link = document.getElementById('ctl00_lnkMain') || 
                   document.querySelector('a[id*="lnkMain"]') ||
                   document.querySelector('a[href*="MainMenu.aspx"]') ||
                   Array.from(document.querySelectorAll('a')).find(a => {
                     const t = (a.textContent || '').toUpperCase();
                     const h = (a.getAttribute('href') || '').toLowerCase();
                     return t.includes('MAIN MENU') || t.includes('ಮುಖ್ಯ ಮೆನು') || h.includes('mainmenu');
                   });
      if (link) {
        console.log("Found Main Menu link on Disclaimer page. Clicking...");
        link.click();
        return true;
      }
      return false;
    }

    if (!bypassDisclaimer()) {
      setTimeout(bypassDisclaimer, 400);
    }
    return;
  }

  /* ===============================
     LOGIN + CAPTCHA SECTION
  ================================ */
  (function () {
    const NEXT_URL = "admin/bioLogin.aspx";

    document.addEventListener("keydown", function (e) {
      if (!e.altKey || e.repeat) return;

      const pressedKey = e.key.toLowerCase();
      if (!pressedKey.match(/^[a-z]$/)) return;

      chrome.storage.sync.get(["profiles"], function (res) {
        const profiles = res.profiles || {};

        for (const profileName in profiles) {
          if (profiles[profileName].shortcut === pressedKey) {
            chrome.storage.sync.set({ active: profileName }, function () {
              window.location.reload();
            });
            break;
          }
        }
      });
    });

    chrome.storage.sync.get(["profiles", "active", "mobileNumber", "role"], function (res) {
      let profile = res.profiles && res.profiles[res.active];
      if (!profile && res.mobileNumber) {
        profile = {
          mobile: res.mobileNumber,
          userType: (res.role === "admin" || res.role === "assistant" || res.role === "A") ? "A" : "O",
          shopName: "Ahara User"
        };
      }
      if (!profile) return;

      if (isProfileDisplayPage()) {
        showActiveProfileWhenReady(profile);
      }

      const isAssistant = profile.userType === "A" || profile.userType === "assistant" || profile.role === "admin" || profile.role === "assistant";
      if (isAssistant) {
        document.getElementById("ctl00_ContentPlaceHolder1_rblSeluser_1")?.click();
      } else {
        document.getElementById("ctl00_ContentPlaceHolder1_rblSeluser_0")?.click();
      }

      const mobileInput = document.getElementById("ctl00_ContentPlaceHolder1_txtMobile");
      if (mobileInput && (profile.mobile || res.mobileNumber)) {
        mobileInput.value = profile.mobile || res.mobileNumber;
        mobileInput.dispatchEvent(new Event('input', { bubbles: true }));
        mobileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const captchaImg = document.getElementById("ctl00_ContentPlaceHolder1_Image2");
      if (captchaImg) {
        showBigCaptcha(captchaImg);
        captchaImg.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      const captchaInput = document.getElementById("ctl00_ContentPlaceHolder1_txt_captcha");
      if (captchaInput) {
        captchaInput.focus();
        captchaInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            setTimeout(checkLoginResult, 3000);
          }
        });
        captchaInput.addEventListener("input", function (e) {
          if (captchaInput.value && captchaInput.value.trim().length === 5) {
            const loginBtn = document.getElementById("ctl00_ContentPlaceHolder1_btnPrint");
            if (loginBtn) {
              loginBtn.click();
              setTimeout(checkLoginResult, 3000);
            }
          }
        });
      }
    });

    function showActiveProfile(profile) {
      const label = document.getElementById("ctl00_ContentPlaceHolder1_Label1");
      if (!label) return false;

      let box = document.getElementById("ahara-active-profile-box");
      if (!box) {
        box = document.createElement("div");
        box.id = "ahara-active-profile-box";
        box.style.cssText = `
          display: inline-block;
          margin: 6px 0;
          padding: 6px 10px;
          background: #fff8d8;
          border: 1px solid #d6b656;
          border-radius: 4px;
          color: #222;
          font-family: Cambria, Arial, sans-serif;
          font-size: 12px;
          font-weight: bold;
          line-height: 1.4;
        `;
        label.parentNode.insertBefore(box, label);
      }

      const shopName = profile.shopName || "Shop name not set";
      const mobile = profile.mobile || "Mobile not set";
      box.textContent = `${shopName} | ${mobile}`;
      return true;
    }

    function showActiveProfileWhenReady(profile) {
      let tries = 0;
      const maxTries = 20;

      if (showActiveProfile(profile)) return;

      const timer = setInterval(() => {
        tries++;
        if (showActiveProfile(profile) || tries >= maxTries) {
          clearInterval(timer);
        }
      }, 250);
    }

    function isProfileDisplayPage() {
      const path = window.location.pathname.toLowerCase();
      return /^\/shopowner_[bkm]server\/(?:shoplogin\.aspx)?$/.test(path);
    }

    function showBigCaptcha(img) {
      let box = document.getElementById("bigCaptchaBox");
      if (box) box.remove();

      box = document.createElement("div");
      box.id = "bigCaptchaBox";
      box.style.position = "fixed";
      box.style.top = "50%";
      box.style.left = "50%";
      box.style.transform = "translate(-50%, -50%)";
      box.style.zIndex = "99999";
      box.style.background = "#ffffff";
      box.style.padding = "14px";
      box.style.border = "3px solid #000";
      box.style.borderRadius = "8px";
      box.style.boxShadow = "0 0 25px rgba(0,0,0,0.4)";
      box.style.pointerEvents = "none";

      const bigImg = img.cloneNode(true);
      bigImg.style.width = "300px";

      box.appendChild(bigImg);
      document.body.appendChild(box);
    }

    function checkLoginResult() {
      if (window.location.href.includes(NEXT_URL)) {
        document.getElementById("bigCaptchaBox")?.remove();
      } else {
        document.getElementById("ctl00_ContentPlaceHolder1_txt_captcha")?.focus();
      }
    }
  })();

  /* ===============================
     CONFIG
  ================================ */
  const HELPER_URL = "http://localhost:3499/device";
  const MAX_RETRY = 1; // 🔥 ONLY ONE TRY
  const SUCCESS_WAIT_MS = 2500; // ✅ wait 2.5 sec for success code

  // ✅ SESSION LOCK (prevents IRIS infinite capture across reload/postback)
  const CAPTURE_LOCK_KEY = "__ahara_capture_lock__";
  function isCaptureLocked() {
    try { return sessionStorage.getItem(CAPTURE_LOCK_KEY) === "1"; }
    catch { return false; }
  }
  function setCaptureLock() {
    try { sessionStorage.setItem(CAPTURE_LOCK_KEY, "1"); }
    catch {}
  }
  function clearCaptureLock() {
    try { sessionStorage.removeItem(CAPTURE_LOCK_KEY); }
    catch {}
  }

  /* ===============================
     GLOBAL GUARD (prevents parallel runs + unlimited capture)
     (kept lightweight, no architecture change)
  ================================ */
  window.__AHARA_LOGIN_GUARD__ = window.__AHARA_LOGIN_GUARD__ || {
    running: false,
    done: false,
    captureClicked: false,
    mode: null
  };

  /* ===============================
     HELPERS
  ================================ */
  function $(id) {
    return document.querySelector(id);
  }

  function click(id, label) {
    const el = $(id);
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.style.outline = "3px solid lime";
    el.click();
    console.log("Clicked:", label);
    return true;
  }

  function waitFor(id, timeout = 6000) {
    return new Promise((resolve, reject) => {
      if ($(id)) return resolve();

      const obs = new MutationObserver(() => {
        if ($(id)) {
          obs.disconnect();
          resolve();
        }
      });

      obs.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        obs.disconnect();
        reject();
      }, timeout);
    });
  }

  function waitForSuccess(getValue, timeout = SUCCESS_WAIT_MS) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      const timer = setInterval(() => {
        const val = getValue() || "";

        // ✅ SUCCESS DETECT (errCode="0" + success)
        if (val.includes('errCode="0"') && val.toLowerCase().includes("success")) {
          clearInterval(timer);
          resolve(true);
          return;
        }

        if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject(false);
        }
      }, 100);
    });
  }

  async function getMode() {
    try {
      const j = await window.AharaDeviceFallback.getDevice({
        helperUrl: HELPER_URL
      });
      return j.selected;
    } catch {
      return null;
    }
  }

  /* ===============================
     BIO FLOW (ONLY 1 TRY + MANUAL AFTER)
  ================================ */
  async function runBIO() {
    console.log("BIO flow start");

    click("#ctl00_ContentPlaceHolder1_rbl_bio_otp_auth_0", "BIO AUTH");
    await waitFor("#ctl00_ContentPlaceHolder1_RadioButtonList1_0");
    click("#ctl00_ContentPlaceHolder1_RadioButtonList1_0", "YES");
    await waitFor("#ctl00_ContentPlaceHolder1_rdbldevice_0");
    click("#ctl00_ContentPlaceHolder1_rdbldevice_0", "BIO MANTRA");
    await waitFor("#ctl00_ContentPlaceHolder1_btnmantra");

    // ✅ CAPTURE ONLY ONCE TOTAL (prevents unlimited capture)
    if (window.__AHARA_LOGIN_GUARD__.captureClicked || isCaptureLocked()) {
      console.warn("Capture already clicked once. Manual mode.");
      window.__AHARA_LOGIN_GUARD__.done = true;
      return;
    }
    window.__AHARA_LOGIN_GUARD__.captureClicked = true;
    setCaptureLock();

    click("#ctl00_ContentPlaceHolder1_btnmantra", "BIO CAPTURE");

    try {
      await waitForSuccess(() => $("#ctl00_ContentPlaceHolder1_hidBioInfo")?.value);

      await waitFor("#ctl00_ContentPlaceHolder1_btn_verify");
      click("#ctl00_ContentPlaceHolder1_btn_verify", "BIO VERIFY");

      clearCaptureLock();

      // ✅ STOP EVERYTHING AFTER SUCCESS
      window.__AHARA_LOGIN_GUARD__.done = true;
      window.__AHARA_BOT_STOPPED__ = true;
      console.log("✅ BIO Success + Verify clicked. Bot stopped.");

    } catch {
      console.warn("BIO failed (or timeout). Manual retry allowed.");
      // ✅ After 1 try, stop auto engine (manual only)
      window.__AHARA_LOGIN_GUARD__.done = true;
    }
  }

  /* ===============================
     IRIS FLOW (ONLY 1 TRY + MANUAL AFTER)
  ================================ */
  async function runIRIS() {
    console.log("IRIS flow start");

    click("#ctl00_ContentPlaceHolder1_rbl_bio_otp_auth_1", "IRIS AUTH");
    await waitFor("#ctl00_ContentPlaceHolder1_RadioButtonList1_0");
    click("#ctl00_ContentPlaceHolder1_RadioButtonList1_0", "YES");
    await waitFor("#ctl00_ContentPlaceHolder1_rbl_device_type_2");
    click("#ctl00_ContentPlaceHolder1_rbl_device_type_2", "MANTRA IRIS");
    await waitFor("#ctl00_ContentPlaceHolder1_btnIrisMantra");

    // ✅ CAPTURE ONLY ONCE TOTAL (prevents unlimited capture)
    if (window.__AHARA_LOGIN_GUARD__.captureClicked || isCaptureLocked()) {
      console.warn("Capture already clicked once. Manual mode.");
      window.__AHARA_LOGIN_GUARD__.done = true;
      return;
    }
    window.__AHARA_LOGIN_GUARD__.captureClicked = true;
    setCaptureLock();

    click("#ctl00_ContentPlaceHolder1_btnIrisMantra", "IRIS CAPTURE");

    try {
      await waitForSuccess(() => $("#ctl00_ContentPlaceHolder1_hidirisInfo")?.value);

      await waitFor("#ctl00_ContentPlaceHolder1_btnIrisVerify");
      click("#ctl00_ContentPlaceHolder1_btnIrisVerify", "IRIS VERIFY");

      clearCaptureLock();

      // ✅ STOP EVERYTHING AFTER SUCCESS
      window.__AHARA_LOGIN_GUARD__.done = true;
      window.__AHARA_BOT_STOPPED__ = true;
      console.log("✅ IRIS Success + Verify clicked. Bot stopped.");

    } catch {
      console.warn("IRIS failed (or timeout). Manual retry allowed.");
      // ✅ After 1 try, stop auto engine (manual only)
      window.__AHARA_LOGIN_GUARD__.done = true;
    }
  }

  /* ===============================
     START BOT (guarded)
  ================================ */
  async function startBot() {
    if (window.__AHARA_BOT_STOPPED__) return;

    // ✅ prevent parallel runs / re-injections
    if (window.__AHARA_LOGIN_GUARD__.done) return;
    if (window.__AHARA_LOGIN_GUARD__.running) return;

    if (!location.href.includes("bioLogin.aspx")) return;

    const mode = await getMode();
    if (!mode) {
      setTimeout(startBot, 500);
      return;
    }

    window.__AHARA_LOGIN_GUARD__.running = true;
    window.__AHARA_LOGIN_GUARD__.mode = mode;

    try {
      if (mode === "BIO") await runBIO();
      if (mode === "IRIS") await runIRIS();
    } finally {
      // allow no further auto loops
      window.__AHARA_LOGIN_GUARD__.running = false;
    }
  }

  startBot();
};
