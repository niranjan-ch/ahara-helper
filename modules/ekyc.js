/* =====================================================================
   AHARA eKYC MODULE
   Handles: Validate_mbr.aspx -> RC_AMENDMENT_WITH_EKYC.aspx -> AMEND_ACK.aspx
   Architecture mirrors login.js / issue.js (tick-based engine, guarded).
   ===================================================================== */

window.runEkyc = function () {
  'use strict';

  console.log('🪪 Ahara eKYC Module Loaded');

  /* ================= CONFIG =================
     ⚠️ TWO IDs BELOW ARE PLACEHOLDERS — NOT CONFIRMED FROM YOUR HTML.
     Please verify these against the live page and correct if wrong.
  ================================ */
  const HELPER_URL = 'http://localhost:3499/device';

  // ⚠️ CONFIRM: real id/name of the mobile number textbox that appears
  // after the eKYC demographic grid (Grd_uid_demo) is shown.
  const MOBILE_INPUT_ID = 'ctl00_ContentPlaceHolder1_txt_mob';

  // ⚠️ CONFIRM: real id/name of the OTP textbox (appears after GO/btnMobileNo).
  const OTP_INPUT_ID = 'ctl00_ContentPlaceHolder1_text_otp';

  const MAX_CAPTURE_RETRY = 1;
  const RETRY_DELAY_MS = 900;
  const CAPTURE_RESULT_WAIT_MS = 4500;
  const TICK_MS = 120;

  const PHONE_MAP_KEY = 'aharaEkycPhoneMap';     // chrome.storage.local — persists across sessions
  const PHONE_MAP_LIMIT = 500;
  const SESSION_KEY = 'aharaEkycSession';        // sessionStorage — persists across real page nav in this tab
  const GRID_STATE_KEY = 'aharaEkycMemberGridState';

  const $ = (id) => document.getElementById(id);

  /* ================= SMALL TOAST/MSG UI ================= */
  function toast(text, isError = false, ms = 2500) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = `
      position:fixed;bottom:20px;right:20px;z-index:999999;
      background:${isError ? '#e74c3c' : '#2ecc71'};color:#fff;
      padding:8px 12px;font-size:12px;font-weight:bold;
      border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,.25);
      font-family:Arial,sans-serif;
    `;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  /* ================= SESSION STATE (persists across real nav) ================= */
  function loadSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || defaultSession();
    } catch {
      return defaultSession();
    }
  }
  function defaultSession() {
    return {
      rcNo: null,           // ration card number currently being processed
      stage: 'IDLE',        // state machine stage
      active: false,        // true only after the user presses FAST
      device: null,         // 'BIO' | 'IRIS'
      retry: 0,
      captureClicked: false,
      captureStartedAt: 0,
      retryScheduled: false,
      verifyClicked: false,
      manualCapture: false,
      irisDeviceClicked: false,
      otpVerified: false,
      nextClicked: false,
      fastNextAttempts: 0,
      fastNextAt: 0,
      saveClicked: false,
      verifyPending: false  // true from the moment Verify is clicked until
                             // the auth-radio table is confirmed gone —
                             // prevents re-clicking Capture on stale DOM
    };
  }
  function saveSession(s) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
  }
  let S = loadSession();
  let mainMenuResetDone = false;

  function resetStage(newStage = 'IDLE') {
    S.stage = newStage;
    S.retry = 0;
    S.captureClicked = false;
    S.captureStartedAt = 0;
    S.retryScheduled = false;
    S.verifyClicked = false;
    S.manualCapture = false;
    S.irisDeviceClicked = false;
    S.otpVerified = false;
    S.nextClicked = false;
    S.fastNextAttempts = 0;
    S.fastNextAt = 0;
    S.saveClicked = false;
    saveSession(S);
  }

  function startFastRun() {
    S = Object.assign(defaultSession(), {
      rcNo: S.rcNo,
      stage: 'FAST_STARTED',
      active: true
    });
    saveSession(S);
  }

  function finishFastRun(newStage = 'COMPLETE') {
    S.active = false;
    S.stage = newStage;
    S.retry = 0;
    S.captureClicked = false;
    S.captureStartedAt = 0;
    S.retryScheduled = false;
    S.verifyClicked = false;
    S.manualCapture = false;
    S.irisDeviceClicked = false;
    S.nextClicked = false;
    S.fastNextAttempts = 0;
    S.fastNextAt = 0;
    S.verifyPending = false;
    saveSession(S);
  }

  /* ================= PERSISTENT RC -> PHONE MAP ================= */
  async function getSavedPhone(rcNo) {
    if (!rcNo) return null;
    try {
      const obj = await chrome.storage.local.get([PHONE_MAP_KEY]);
      const map = obj[PHONE_MAP_KEY] || {};
      const entry = map[rcNo];
      return typeof entry === 'string' ? entry : (entry?.mobile || null);
    } catch {
      return null;
    }
  }
  async function savePhone(rcNo, phone) {
    if (!rcNo || !phone) return;
    try {
      const obj = await chrome.storage.local.get([PHONE_MAP_KEY]);
      const map = obj[PHONE_MAP_KEY] || {};
      map[rcNo] = { mobile: phone, updatedAt: Date.now() };

      const entries = Object.entries(map);
      if (entries.length > PHONE_MAP_LIMIT) {
        entries
          .sort((a, b) => ((a[1]?.updatedAt || 0) - (b[1]?.updatedAt || 0)))
          .slice(0, entries.length - PHONE_MAP_LIMIT)
          .forEach(([key]) => delete map[key]);
      }

      await chrome.storage.local.set({ [PHONE_MAP_KEY]: map });
    } catch (e) {
      console.warn('Failed saving phone map', e);
    }
  }

  /* ================= DEVICE DETECTION (BIO / IRIS) ================= */
  async function detectDevice() {
    try {
      const data = await window.AharaDeviceFallback.getDevice({ helperUrl: HELPER_URL });
      if (data.selected === 'BIO' || data.selected === 'IRIS') return data.selected;
    } catch (e) {
      console.warn('Device detect failed', e);
    }
    return null;
  }

  /* ================= GENERIC CLICK HELPER ================= */
  function click(id) {
    const el = $(id);
    if (!el) return false;
    el.click();
    return true;
  }

  function isMemberGridReady() {
    return !!$('ctl00_ContentPlaceHolder1_grd_all_mbrs');
  }

  function isCleanMemberGridView() {
    return isMemberGridReady() &&
      !$('ctl00_ContentPlaceHolder1_rbl_auth_type') &&
      !$('ctl00_ContentPlaceHolder1_Grd_uid_demo') &&
      !$('ctl00_ContentPlaceHolder1_btnMantra') &&
      !$('ctl00_ContentPlaceHolder1_btnIrisMantra') &&
      !$('ctl00_ContentPlaceHolder1_btn_verify') &&
      !$('ctl00_ContentPlaceHolder1_btn_save');
  }

  function isAuthOrDeviceField(el) {
    const key = `${el.id || ''} ${el.name || ''}`;
    return /hidBioInfo|hidirisInfo|hidirisDeviceInfo|rbl_auth_type|rblAadhaarConsent|rbl_single_multiple|rbl_Bio|rbl_device_type|btn_verify|btn_save|txt_otp|txt_mobileno|txt_mob|btnMobileNo/i.test(key);
  }

  function saveMemberGridState() {
    const grid = $('ctl00_ContentPlaceHolder1_grd_all_mbrs');
    const form = document.forms.aspnetForm || document.getElementById('aspnetForm');
    if (!grid || !form || !isCleanMemberGridView()) return;

    const fields = [];
    for (const el of Array.from(form.elements)) {
      if (!el.name || el.disabled) continue;
      if (/^(submit|button|image|file|reset)$/i.test(el.type || '')) continue;
      if (isAuthOrDeviceField(el)) continue;
      if (/^(checkbox|radio)$/i.test(el.type || '') && !el.checked) continue;

      if (el.tagName === 'SELECT' && el.multiple) {
        for (const opt of Array.from(el.selectedOptions)) {
          fields.push({ name: el.name, value: opt.value });
        }
        continue;
      }

      fields.push({ name: el.name, value: el.value || '' });
    }

    const members = Array.from(grid.querySelectorAll('a[href*="__doPostBack"]'))
      .map((a) => {
        const match = a.getAttribute('href').match(/__doPostBack\('([^']+)','([^']*)'\)/);
        const row = a.closest('tr');
        const cells = row ? Array.from(row.cells).map((cell) => cell.textContent.trim()) : [];
        return match
          ? {
              target: match[1],
              argument: match[2],
              label: cells[1] || a.textContent.trim() || match[2]
            }
          : null;
      })
      .filter(Boolean);

    try {
      sessionStorage.setItem(GRID_STATE_KEY, JSON.stringify({
        action: new URL(form.getAttribute('action') || location.href, location.href).href,
        fields,
        members,
        rcNo: S.rcNo || '',
        savedAt: Date.now()
      }));
    } catch (e) {
      console.warn('Failed saving eKYC member grid state', e);
    }
  }

  function getMemberGridState() {
    try {
      return JSON.parse(sessionStorage.getItem(GRID_STATE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function submitSavedGridState(eventTarget = '', eventArgument = '') {
    const saved = getMemberGridState();
    if (!saved || !saved.fields || !saved.action) {
      toast('⚠️ Member list state not saved. Open member list once and try again.', true, 5000);
      return false;
    }

    const form = document.createElement('form');
    form.method = 'post';
    form.action = saved.action;
    form.style.display = 'none';

    for (const field of saved.fields) {
      if (field.name === '__EVENTTARGET' || field.name === '__EVENTARGUMENT') continue;

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = field.name;
      input.value = field.value || '';
      form.appendChild(input);
    }

    const target = document.createElement('input');
    target.type = 'hidden';
    target.name = '__EVENTTARGET';
    target.value = eventTarget;
    form.appendChild(target);

    const argument = document.createElement('input');
    argument.type = 'hidden';
    argument.name = '__EVENTARGUMENT';
    argument.value = eventArgument;
    form.appendChild(argument);

    document.body.appendChild(form);
    form.submit();
    return true;
  }

  function addQuickEkycButton() {
    if (document.getElementById('ahara-quick-ekyc-btn')) return;

    const homeImg = document.querySelector('img[src*="home.png" i]');
    if (!homeImg) return;

    const btn = document.createElement('input');
    btn.type = 'button';
    btn.id = 'ahara-quick-ekyc-btn';
    btn.value = 'Quick eKYC';
    btn.style.cssText = 'width:auto;padding:0 10px;height:26px;margin-left:8px;background:#f44336;color:#fff;border:0;border-radius:4px;font-weight:bold;cursor:pointer;';
    btn.onclick = () => {
      const ekycLink = document.querySelector('a[href*="Reports/Validate_mbr.aspx" i], a[href*="Validate_mbr.aspx" i]');
      if (ekycLink) {
        ekycLink.click();
        return;
      }
      window.location.href = new URL('../Reports/Validate_mbr.aspx', window.location.href).href;
    };

    const anchor = homeImg.closest('a') || homeImg;
    anchor.insertAdjacentElement('afterend', btn);
  }

  function resetEkycOnValidateEntry() {
    if (!/Validate_mbr(?:_process)?\.aspx/i.test(location.pathname)) return;

    const key = 'aharaEkycValidateResetPath';
    const current = `${location.pathname}${location.search}`;
    if (sessionStorage.getItem(key) === current) return;

    sessionStorage.setItem(key, current);
    S = defaultSession();
    saveSession(S);
  }

  function resetEkycOnMainMenuEntry() {
    if (!/MainMenu\.aspx/i.test(location.pathname)) return;
    if (mainMenuResetDone) return;

    mainMenuResetDone = true;
    S = defaultSession();
    saveSession(S);
  }

  function removeRcSelectAnotherMemberButton() {
    document.getElementById('ahara-rc-select-another-holder')?.remove();
  }
  function addEkycFastButton() {
    if (document.getElementById('ahara-ekyc-fast-btn')) return;

    const go = $('ctl00_ContentPlaceHolder1_btn_mbrs');
    if (!go) return;

    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'ahara-ekyc-fast-btn';
    b.textContent = '⚡ FAST';
    b.style.cssText = 'margin-left:6px;padding:4px 8px;font-weight:bold;cursor:pointer;background:#f44336;color:#fff;border:0;border-radius:4px;';

    b.onclick = async () => {
      const onValidatePage = /Validate_mbr(?:_process)?\.aspx/i.test(location.pathname);
      const authVisible = !!$('ctl00_ContentPlaceHolder1_rbl_auth_type');
      if (S.active && !authVisible && !onValidatePage) {
        console.warn('eKYC FAST blocked: run already active');
        return;
      }

      const rcInput = $('ctl00_ContentPlaceHolder1_txt_rc_no');
      if (rcInput && rcInput.value.trim()) {
        S.rcNo = rcInput.value.trim();
      }

      startFastRun();
      S.nextClicked = true;
      S.fastNextAttempts = 1;
      S.fastNextAt = Date.now();
      saveSession(S);

      if (authVisible || go.disabled) {
        runAuthCaptureIfPresent();
        return;
      }

      triggerMembersNext(go);
      setTimeout(ensureValidateFastProgress, 450);
    };

    go.parentElement.appendChild(b);
  }

  function triggerMembersNext(go) {
    try {
      go.click();
      return;
    } catch (e) {
      console.warn('btn_mbrs click failed, trying postback fallback', e);
    }

    try {
      if (typeof window.WebForm_DoPostBackWithOptions === 'function' &&
          typeof window.WebForm_PostBackOptions === 'function') {
        window.WebForm_DoPostBackWithOptions(
          new window.WebForm_PostBackOptions(
            'ctl00$ContentPlaceHolder1$btn_mbrs',
            '',
            true,
            '',
            '',
            false,
            false
          )
        );
        return;
      }
    } catch (e) {
      console.warn('WebForm postback failed, trying __doPostBack fallback', e);
    }

    if (typeof window.__doPostBack === 'function') {
      window.__doPostBack('ctl00$ContentPlaceHolder1$btn_mbrs', '');
      return;
    }

    go.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  function ensureValidateFastProgress() {
    if (!S.active) return;
    if (!/Validate_mbr(?:_process)?\.aspx|RC_AMENDMENT_WITH_EKYC\.aspx/i.test(location.pathname)) return;
    if ($('ctl00_ContentPlaceHolder1_rbl_auth_type')) {
      runAuthCaptureIfPresent();
      return;
    }

    const go = $('ctl00_ContentPlaceHolder1_btn_mbrs');
    if (!go || go.disabled) return;

    const now = Date.now();
    if (S.nextClicked && S.fastNextAttempts >= 3) return;
    if (S.fastNextAt && now - S.fastNextAt < 900) return;

    S.fastNextAttempts = (S.fastNextAttempts || 0) + 1;
    S.fastNextAt = now;
    S.nextClicked = true;
    saveSession(S);
    triggerMembersNext(go);
  }

  /* =====================================================================
     PAGE 1: Validate_mbr.aspx
     Light touch only — auto-fill RC number from saved profile (optional
     convenience). Member selection + "Next" click stays manual (per spec).
     ===================================================================== */
  function handleValidateMbrPage() {
    resetEkycOnValidateEntry();
    addEkycFastButton();

    // If we got here via the "Select Another Member" button, auto-click
    // the card-type radio (same type as last time — assumed "S") so the
    // RC number field appears without the user needing to click it again.
    // The RC number itself is NEVER auto-filled — always typed manually.
    if (S.stage === 'RESUME_VALIDATE') {
      const cardTypeS = $('ctl00_ContentPlaceHolder1_rbl_card_type_0');
      if (!cardTypeS) return; // page still loading — wait
      if (!cardTypeS.checked) {
        cardTypeS.click();
        return; // postback will re-render; next tick continues
      }
      finishFastRun('IDLE'); // already checked — hand back to manual entry
    }

    const rcInput = $('ctl00_ContentPlaceHolder1_txt_rc_no');
    if (!rcInput) return; // card-type not yet selected — leave to user

    // RC number is always typed manually by the user. The bot only
    // tracks the value (for the phone-number-per-RC memory feature) —
    // it never writes to this field.
    if (rcInput.value && rcInput.value.trim() !== S.rcNo) {
      S.rcNo = rcInput.value.trim();
      saveSession(S);
    }

    // ---- Stage 1 of eKYC ----
    // After the user manually picks a member from ddl_mems_detls and
    // clicks Next (btn_mbrs), THIS SAME PAGE reveals the auth-type
    // radios via a partial postback (no navigation yet). Run the same
    // shared engine used on page 2 — the element IDs are identical.
    if (S.active) {
      ensureValidateFastProgress();
      runAuthCaptureIfPresent();
    }
  }

  /* ---------------- SHARED: run auth+capture engine if its UI is showing ---------------- */
  function runAuthCaptureIfPresent() {
    if (!S.active) return;

    const authTable = $('ctl00_ContentPlaceHolder1_rbl_auth_type');
    const grdUidDemo = $('ctl00_ContentPlaceHolder1_Grd_uid_demo');
    if (authTable && !grdUidDemo) {
      runAuthAndCaptureEngine();
    }
  }

  /* =====================================================================
     PAGE 2: RC_AMENDMENT_WITH_EKYC.aspx
     Has THREE distinct sub-views on the same URL (partial postbacks):
       a) Member grid (grd_all_mbrs)      -> manual "Select" click by user
       b) Auth-type / capture / verify    -> AUTOMATED (this is the core bot)
       c) eKYC demo grid + mobile + OTP   -> semi-automated (suggest phone,
                                              wait for manual entry/OTP,
                                              auto-continue after OTP verified)
     ===================================================================== */
  function onRcAmendmentPage() {
    addEkycFastButton();
    ensureVerifyRetryButton();
    removeRcSelectAnotherMemberButton();
    keepVerifyEnabledAfterNotVerified();

    // Keep RC number tracked (field is present but disabled on this page)
    const rcField = $('ctl00_ContentPlaceHolder1_txt_rc_no');
    if (rcField && rcField.value) S.rcNo = rcField.value.trim();

    if (isCleanMemberGridView()) {
      saveMemberGridState();
      if (S.active) ensureValidateFastProgress();
      return;
    }

    ensureOtpAlertHooked();
    detectOtpVerifiedFromPage();
    if (S.otpVerified) finishDeclarationAndSave();

    const grdUidDemo = $('ctl00_ContentPlaceHolder1_Grd_uid_demo');
    const mobileField = getMobileField();
    const otpField = getOtpField();

    // ---- Sub-view (b): Auth type radios visible -> run capture engine
    if (S.active) runAuthCaptureIfPresent();
    if (!grdUidDemo) return; // still on member grid or mid auth/capture

    // ---- Sub-view (c): eKYC demo grid visible -> phone suggestion + OTP watch
    if (mobileField) runPhoneAndOtpStage(mobileField, otpField);
  }

  /* ---------------- AUTH TYPE + CONSENT + CAPTURE + VERIFY ---------------- */
  let engineBusy = false;

  async function runAuthAndCaptureEngine() {
    if (engineBusy) return;
    if (S.verifyClicked || S.manualCapture) return;

    // Step 1: choose auth type based on detected device
    const authB = $('ctl00_ContentPlaceHolder1_rbl_auth_type_0'); // Bio
    const authI = $('ctl00_ContentPlaceHolder1_rbl_auth_type_1'); // Iris

    if (authB?.checked && S.device !== 'BIO') {
      S.device = 'BIO';
      saveSession(S);
    } else if (authI?.checked && S.device !== 'IRIS') {
      S.device = 'IRIS';
      saveSession(S);
    }

    if (authB && !authB.checked && authI && !authI.checked) {
      if (S.device === null) {
        engineBusy = true;
        S.device = await detectDevice();
        saveSession(S);
        engineBusy = false;
        if (!S.device) {
          toast('⚠️ No BIO/IRIS device detected', true, 4000);
          return;
        }
      }
      if (S.device === 'BIO') authB.click(); else authI.click();
      return; // postback will refresh DOM; next tick continues
    }

    // Step 2: Aadhaar consent = Yes
    const consent = $('ctl00_ContentPlaceHolder1_rblAadhaarConsent_0');
    if (consent && !consent.checked) {
      consent.click();
      return;
    }

    if (S.device === 'BIO') {
      await bioCaptureFlow();
    } else if (S.device === 'IRIS') {
      await irisCaptureFlow();
    }
  }

  async function bioCaptureFlow() {
    // Step 3: Single Bio verification
    const single = $('ctl00_ContentPlaceHolder1_rbl_single_multiple_0');
    if (single && !single.checked) {
      single.click();
      return;
    }

    // Step 4: Bio Mantra device radio
    const bioMantra = $('ctl00_ContentPlaceHolder1_rbl_Bio_1');
    if (bioMantra && !bioMantra.checked) {
      bioMantra.click();
      return;
    }

    // Step 5: capture button (only once, retry logic handles re-clicks)
    const btnMantra = $('ctl00_ContentPlaceHolder1_btnMantra');
    if (!btnMantra) return;

    if (!S.captureClicked) {
      clickCaptureButton(btnMantra, 'ctl00_ContentPlaceHolder1_hidBioInfo');
      return;
    }

    // Step 6/7: watch hidBioInfo for success
    checkCaptureResult('ctl00_ContentPlaceHolder1_hidBioInfo', () => btnMantra.click(), 'ctl00_ContentPlaceHolder1_btn_verify');
  }

  async function irisCaptureFlow() {
    // Step: Mantra IRIS device radio
    const irisDevice = $('ctl00_ContentPlaceHolder1_rbl_device_type_1');
    if (irisDevice && !irisDevice.checked) {
      irisDevice.click();
      S.irisDeviceClicked = true;
      saveSession(S);
      return;
    }

    const btnIris = $('ctl00_ContentPlaceHolder1_btnIrisMantra');
    if (!btnIris) return;

    if (!S.captureClicked) {
      clickCaptureButton(btnIris, 'ctl00_ContentPlaceHolder1_hidirisInfo');
      return;
    }

    checkCaptureResult('ctl00_ContentPlaceHolder1_hidirisInfo', () => btnIris.click(), 'ctl00_ContentPlaceHolder1_btnIrisVerify');
  }

  function clickCaptureButton(btn, hiddenFieldId) {
    if (!btn || S.verifyClicked || S.manualCapture || S.retryScheduled) return;

    const hidden = $(hiddenFieldId);
    if (hidden) hidden.value = '';

    S.captureClicked = true;
    S.captureStartedAt = Date.now();
    saveSession(S);
    btn.click();
  }

  function checkCaptureResult(hiddenFieldId, retryClickFn, verifyButtonId) {
    if (S.verifyClicked || S.manualCapture || S.retryScheduled) return;

    const info = $(hiddenFieldId)?.value || '';
    if (!info) {
      if (S.captureStartedAt && Date.now() - S.captureStartedAt > CAPTURE_RESULT_WAIT_MS) {
        handleCaptureFailure(retryClickFn, 'No response', hiddenFieldId);
      }
      return;
    }

    const success = info.includes('errCode="0"') && /success/i.test(info);

    if (success) {
      const verifyBtn = $(verifyButtonId) || $('ctl00_ContentPlaceHolder1_btn_verify');
      enableVerifyButton(verifyBtn);
      if (verifyBtn) {
        toast('✅ Capture success — verifying…');
        S.verifyClicked = true;
        S.retryScheduled = false;
        S.manualCapture = false;
        S.stage = 'VERIFY_CLICKED';
        S.verifyPending = true;
        saveSession(S);
        verifyBtn.click();
        // Do NOT reset captureClicked/retry here — the old auth-radio
        // DOM can still be present for a moment during the postback/
        // navigation. Just mark verifyPending; the central tick() guard
        // will do the reset only once that table is confirmed gone.
      }
      return;
    }

    handleCaptureFailure(retryClickFn, 'Capture error', hiddenFieldId);
  }

  function handleCaptureFailure(retryClickFn, reason, hiddenFieldId) {
    if (S.verifyClicked || S.manualCapture || S.retryScheduled) return;

    if (S.retry >= MAX_CAPTURE_RETRY) {
      S.manualCapture = true;
      S.captureClicked = true;
      S.retryScheduled = false;
      S.stage = 'MANUAL_CAPTURE';
      saveSession(S);
      toast(`❌ ${reason}. Manual capture needed`, true, 5000);
      return;
    }

    S.retry += 1;
    S.retryScheduled = true;
    S.captureClicked = true;
    saveSession(S);
    toast(`Retry ${S.retry}/${MAX_CAPTURE_RETRY}…`, true, 1500);

    setTimeout(() => {
      if (!S.active || S.verifyPending || S.verifyClicked || S.manualCapture) return;
      const hidden = $(hiddenFieldId);
      if (hidden) hidden.value = '';

      S.retryScheduled = false;
      S.captureClicked = true;
      S.captureStartedAt = Date.now();
      saveSession(S);
      retryClickFn();
    }, RETRY_DELAY_MS);
  }

  /* ---------------- PHONE SUGGESTION + OTP WATCH ---------------- */
  let phoneBoxShown = false;
  let phoneAutofillRc = null;
  let alertHooked = false;

  async function runPhoneAndOtpStage(mobileField, otpField) {
    ensureOtpAlertHooked();
    detectOtpVerifiedFromPage();
    hookMobileGoSave(mobileField);

    const rcNo = getCurrentRcNo();
    if (mobileField && rcNo && phoneAutofillRc !== rcNo) {
      phoneBoxShown = true;
      phoneAutofillRc = rcNo;
      const saved = await getSavedPhone(rcNo);
      if (saved && !mobileField.value.trim()) {
        autoFillSavedPhone(mobileField, saved);
      }
    }

    if (S.otpVerified) {
      finishDeclarationAndSave();
    }
  }

  function autoFillSavedPhone(mobileField, savedNumber) {
    mobileField.value = savedNumber;
    mobileField.style.backgroundColor = '#d9f7d9';
    mobileField.style.borderColor = '#4CAF50';
    mobileField.title = 'Saved mobile auto-filled for this RC';
    mobileField.dispatchEvent(new Event('input', { bubbles: true }));
    mobileField.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function hookMobileGoSave(mobileField) {
    if (!mobileField) return;
    const goBtn = $('ctl00_ContentPlaceHolder1_btnMobileNo');
    if (!goBtn || goBtn.dataset.aharaPhoneSaveHooked === '1') return;

    goBtn.dataset.aharaPhoneSaveHooked = '1';
    goBtn.addEventListener('click', () => {
      const currentMobileField = getMobileField();
      const rcNo = getCurrentRcNo();
      const phone = (currentMobileField?.value || mobileField.value || '').trim();
      if (/^\d{10}$/.test(phone) && rcNo) savePhone(rcNo, phone);
    }, true);
  }

  function getCurrentRcNo() {
    const rcField = $('ctl00_ContentPlaceHolder1_txt_rc_no');
    const rcNo = (rcField?.value || S.rcNo || '').trim();
    if (rcNo && rcNo !== S.rcNo) {
      S.rcNo = rcNo;
      saveSession(S);
    }
    return rcNo;
  }

  function hookAlertForOtp() {
    const originalAlert = window.alert.bind(window);
    window.alert = function (msg) {
      if (typeof msg === 'string' && /otp\s*verified/i.test(msg)) {
        console.log('✅ OTP Verified detected — continuing automatically');
        S.otpVerified = true;
        saveSession(S);
        setTimeout(finishDeclarationAndSave, 0);
        // Suppress the blocking native dialog for this specific message
        // so the bot can continue immediately.
        return;
      }
      // Any other alert (errors, warnings) — show it normally to the user
      originalAlert(msg);
    };
  }

  function ensureOtpAlertHooked() {
    if (alertHooked) return;
    hookAlertForOtp();
    alertHooked = true;
  }

  function detectOtpVerifiedFromPage() {
    if (S.otpVerified) return;

    const pageText = `${document.documentElement?.textContent || ''} ${document.documentElement?.innerHTML || ''}`;
    if (/alert\s*\(\s*["']\s*OTP\s+Verified\s*["']\s*\)|OTP\s+Verified/i.test(pageText)) {
      S.otpVerified = true;
      saveSession(S);
      finishDeclarationAndSave();
    }
  }

  function keepVerifyEnabledAfterNotVerified() {
    const verifyBtn = $('ctl00_ContentPlaceHolder1_btn_verify');
    if (!verifyBtn) return;

    const pageText = `${document.documentElement?.textContent || ''} ${document.documentElement?.innerHTML || ''}`;
    if (/Not\s+Verified/i.test(pageText)) {
      S.verifyPending = false;
      S.verifyClicked = false;
      S.manualCapture = true;
      saveSession(S);
      enableVerifyButton(verifyBtn);
    }
  }

  function enableVerifyButton(verifyBtn) {
    if (!verifyBtn) return false;
    verifyBtn.disabled = false;
    verifyBtn.removeAttribute('disabled');
    if (verifyBtn.getAttribute('disabled') !== null) verifyBtn.removeAttribute('disabled');
    return !verifyBtn.disabled && verifyBtn.getAttribute('disabled') === null;
  }

  function ensureVerifyRetryButton() {
    const verifyBtn = $('ctl00_ContentPlaceHolder1_btn_verify');
    if (!verifyBtn) return;

    let retryBtn = document.getElementById('ahara-verify-retry');
    if (!retryBtn) {
      retryBtn = document.createElement('input');
      retryBtn.type = 'button';
      retryBtn.id = 'ahara-verify-retry';
      retryBtn.value = 'retry';
      retryBtn.style.cssText = 'width:auto;padding:0 10px;height:25px;margin-left:6px;background:#f44336;color:#fff;border:0;border-radius:4px;font-weight:bold;cursor:pointer;font-size:small;';
    }

    retryBtn.onclick = () => {
      const currentVerifyBtn = $('ctl00_ContentPlaceHolder1_btn_verify');
      enableVerifyButton(currentVerifyBtn);

      const bioBtn = $('ctl00_ContentPlaceHolder1_btnMantra');
      const irisBtn = $('ctl00_ContentPlaceHolder1_btnIrisMantra');
      const btn = bioBtn || irisBtn;
      const hiddenFieldId = bioBtn ? 'ctl00_ContentPlaceHolder1_hidBioInfo' : 'ctl00_ContentPlaceHolder1_hidirisInfo';

      S.active = true;
      S.retry = 0;
      S.captureClicked = false;
      S.captureStartedAt = 0;
      S.retryScheduled = false;
      S.verifyPending = false;
      S.verifyClicked = false;
      S.manualCapture = false;
      S.stage = 'RETRY_CAPTURE';
      saveSession(S);
      enableVerifyButton(currentVerifyBtn);

      if (btn) {
        clickCaptureButton(btn, hiddenFieldId);
      } else {
        runAuthCaptureIfPresent();
      }
    };

    if (retryBtn.previousElementSibling !== verifyBtn) {
      verifyBtn.insertAdjacentElement('afterend', retryBtn);
    }
  }

  function finishDeclarationAndSave() {
    if (S.saveClicked) return;

    const decl = findDeclarationControl();
    if (decl && !decl.checked) {
      decl.click();
      decl.checked = true;
      decl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const saveBtn = $('ctl00_ContentPlaceHolder1_btn_save');
    if ((!decl || decl.checked) && saveBtn && !saveBtn.disabled) {
      toast('💾 Saving eKYC…');
      S.saveClicked = true;
      saveSession(S);
      saveBtn.click();
      finishFastRun('SAVED');
    }
  }

  function getMobileField() {
    return $('ctl00_ContentPlaceHolder1_txt_mob') ||
      $(MOBILE_INPUT_ID) ||
      document.querySelector('input[type="text"][id*="mob" i], input[type="text"][name*="mob" i]');
  }

  function getOtpField() {
    return $(OTP_INPUT_ID) ||
      $('ctl00_ContentPlaceHolder1_txt_otp') ||
      document.querySelector('input[type="text"][id*="otp" i], input[type="text"][name*="otp" i]');
  }

  function findDeclarationControl() {
    const candidates = [
      'ctl00_ContentPlaceHolder1_declaration_chk',
      'ctl00_ContentPlaceHolder1_rbl_declaration_0',
      'ctl00_ContentPlaceHolder1_rblDeclaration_0',
      'ctl00_ContentPlaceHolder1_chkDeclaration',
      'ctl00_ContentPlaceHolder1_chk_declaration'
    ];

    for (const id of candidates) {
      const el = $(id);
      if (el && !el.disabled) return el;
    }

    return document.querySelector(
      'input[type="radio"][id*="declaration" i]:not(:disabled),' +
      'input[type="checkbox"][id*="declaration" i]:not(:disabled)'
    );
  }

  /* =====================================================================
     PAGE 3: AMEND_ACK.aspx
     Inject a green "Select Another Member" button next to Exit.

    CONFIRMED (by testing): the server session does NOT retain RC
     context on a direct nav to RC_AMENDMENT_WITH_EKYC.aspx — it bounces
     to MainMenu instead. The RC-level biometric auth on Validate_mbr.aspx
     must be redone every time.

     So this button posts the last saved ASP.NET member-grid ViewState
     back to RC_AMENDMENT_WITH_EKYC.aspx. No browser back, refresh, or
     fixed history count is used.
     ===================================================================== */
  function onAckPage() {
    if (document.getElementById('ahara-select-another')) return; // already injected

    const exitBtn = document.getElementById('btnExit');
    if (!exitBtn) return;

    const btn = document.createElement('input');
    btn.type = 'button';
    btn.id = 'ahara-select-another';
    btn.value = '➕ Select Another Member';
    btn.style.cssText = `
      width:auto;padding:0 10px;height:26px;margin-left:8px;
      background:#4CAF50;color:#fff;border:0;border-radius:4px;
      font-weight:bold;cursor:pointer;
    `;

    btn.onclick = () => {
      S = Object.assign(defaultSession(), {
        rcNo: S.rcNo,
        stage: 'WAITING_MEMBER_SELECT',
        active: true
      });
      saveSession(S);
      submitSavedGridState('', '');
    };

    exitBtn.parentElement.appendChild(btn);
  }

  /* ================= MAIN TICK / ROUTER ================= */
  function tick() {
    ensureOtpAlertHooked();
    addQuickEkycButton();
    const path = window.location.pathname;

    if (!/MainMenu\.aspx/i.test(path)) mainMenuResetDone = false;
    resetEkycOnMainMenuEntry();

    if (/RC_AMENDMENT_WITH_EKYC\.aspx/i.test(path)) {
      removeRcSelectAnotherMemberButton();
      ensureVerifyRetryButton();
      detectOtpVerifiedFromPage();
      if (S.otpVerified) finishDeclarationAndSave();
      keepVerifyEnabledAfterNotVerified();
    }

    // Global guard: right after Verify is clicked, the auth-radio table
    // can remain in the DOM for a moment while the postback/navigation
    // completes. Do nothing at all until it's confirmed gone — this is
    // what stops the bot from re-clicking Capture on a dying page.
    if (S.verifyPending) {
      const authStillThere = document.getElementById('ctl00_ContentPlaceHolder1_rbl_auth_type');
      if (authStillThere) return; // still transitioning — wait
      S.verifyPending = false;
      S.stage = 'WAITING_OTP';
      S.captureClicked = true;
      S.verifyClicked = true;
      S.retryScheduled = false;
      saveSession(S);
    }

    if (/Validate_mbr(?:_process)?\.aspx/i.test(path)) {
      handleValidateMbrPage();
    } else if (/RC_AMENDMENT_WITH_EKYC\.aspx/i.test(path)) {
      onRcAmendmentPage();
    } else if (/AMEND_ACK(?:_EXEMPT)?\.aspx/i.test(path)) {
      onAckPage();
    }
  }

  setInterval(tick, TICK_MS);
  new MutationObserver(tick).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  tick();
};
