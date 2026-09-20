window.runIssue = function() {

  // ⚡ Ration Fast is only meant for the ration-issue screen. Its
  // "FAST" button anchors next to ctl00_ContentPlaceHolder1_btn_mbrs,
  // an element ID that also exists on the eKYC pages — so without this
  // guard it was injecting itself there too. Bail out entirely on any
  // eKYC page.
  if (/Validate_mbr(?:_process)?\.aspx|RC_AMENDMENT_WITH_EKYC\.aspx|AMEND_ACK\.aspx/i.test(location.pathname)) {
    console.log('⚡ Ration Fast — skipped (eKYC page)');
    return;
  }




// ⚡ RATION FAST - ULTRA STABLE BUILD (ELITE INTERNALS)
// Architecture 100% Preserved

(function () {
'use strict';

console.log('⚡ Ration Fast Ultra Stable Loaded');

/* ================= CONFIG ================= */

const STORAGE_KEY = 'rationFastState';
const SESSION_KEY = 'rationFastSession';
const HELPER_URL = 'http://localhost:3499/device';

const MAX_CAPTURE_RETRY = 3;
const HELPER_RETRY = 5;
const IRIS_DEVICE_TIMEOUT = 8000;

/* ================= DEV LOG SYSTEM ================= */

const LOG_KEY = 'rationFastLogs';

function devLog(type, message) {
    const entry = {
        time: new Date().toISOString(),
        type,
        message
    };
    const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    logs.push(entry);
    if (logs.length > 300) logs.shift();
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

/* ================= TRUE ADAPTIVE DELAY ================= */

let adaptiveDelay = 150;
let lastActionTime = 0;
let measuredRTT = 150;

function measureServerResponse() {
    if (!lastActionTime) return;

    const rtt = Date.now() - lastActionTime;
    measuredRTT = rtt;

    if (rtt > 3000) adaptiveDelay = 800;
    else if (rtt > 1500) adaptiveDelay = 400;
    else adaptiveDelay = 150;

    devLog('info', 'RTT: ' + rtt + 'ms | Delay: ' + adaptiveDelay);
}

/* ================= PHASE DETECTION ================= */

let currentPhase = 'IDLE';

function detectPhase() {
    if ($('ctl00_ContentPlaceHolder1_btnmantra') || $('ctl00_ContentPlaceHolder1_btnIrisMantra'))
        currentPhase = 'CAPTURE_READY';
    else if ($('ctl00_ContentPlaceHolder1_hidBioInfo') || $('ctl00_ContentPlaceHolder1_hidirisInfo'))
        currentPhase = 'WAITING_RESPONSE';
    else
        currentPhase = 'AUTH_SELECTION';
}

/* ================= PARALLEL DOM OBSERVER ================= */

const observer = new MutationObserver(() => {
    detectPhase();

    if (currentPhase === 'WAITING_RESPONSE') {
        measureServerResponse();
    }

    lastProgressTime = Date.now();
});

observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true
});

/* ================= ENGINE LOCK ================= */

let engineLocked = false;
let lastProgressTime = Date.now();

/* ================= STATE ================= */

let state = {
    device: null,
    retry: 0,
    retryPhase: 'idle',
    irisDeviceClicked: false,
    irisDeviceClickTime: 0,
    monitoring: false,
    stop: false
};

let captureRetryTimer = null;

const $ = id => document.getElementById(id);

/* ================= STORAGE ================= */

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return false;
    state = JSON.parse(s);
    return true;
}

function resetAll() {

    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);

    state = {
        device: null,
        retry: 0,
        retryPhase: 'idle',
        irisDeviceClicked: false,
        irisDeviceClickTime: 0,
        monitoring: false,
        stop: false
    };

    if (captureRetryTimer) {
        clearTimeout(captureRetryTimer);
        captureRetryTimer = null;
    }

    engineLocked = false;

    devLog('info', 'Automation Reset');
}

/* ================= ELITE WATCHDOG ================= */

setInterval(() => {
    const idleTime = Date.now() - lastProgressTime;

    if (idleTime > 20000) {
        devLog('error', 'Watchdog Recovery Triggered');
        state.retry = 0;
        state.retryPhase = 'idle';
        state.monitoring = false;
        saveState();
        lastProgressTime = Date.now();
    }
}, 4000);

/* ================= MESSAGE ================= */

function msg(text, error = false, t = 2000) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = `
        position:fixed;bottom:20px;right:20px;
        background:${error ? '#e74c3c' : '#2ecc71'};
        color:#fff;padding:8px 12px;
        font-size:12px;font-weight:bold;
        border-radius:4px;z-index:99999;
    `;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), t);
}

/* ================= HELPER DETECTION ================= */

async function detectDevice() {

    for (let i = 0; i < HELPER_RETRY; i++) {
        try {
            const j = await window.AharaDeviceFallback.getDevice({
                helperUrl: HELPER_URL,
                forceRefresh: i > 0
            });

            if (j.selected === 'BIO' || j.selected === 'IRIS') {
                devLog('info', j.source + ' selected: ' + j.selected);
                return j.selected;
            }
        } catch {
            devLog('error', 'Device fetch failed');
        }

        await new Promise(r => setTimeout(r, 400));
    }

    msg('Device not detected', true, 3000);
    return null;
}

/* ================= FAST BUTTON ================= */

function addFastButton() {

    if ($('fastBtn')) return;

    const go = $('ctl00_ContentPlaceHolder1_btn_mbrs');
    if (!go) return;

    const b = document.createElement('button');
b.type = 'button';   // 🔥 IMPORTANT

      
    b.id = 'fastBtn';
    b.textContent = '⚡ FAST';
    b.style.cssText = 'margin-left:6px;padding:4px 8px;font-weight:bold;cursor:pointer;';

    b.onclick = async () => {

        try {

            if (engineLocked) {
                console.warn("FAST blocked: engine already locked");
                return;
            }

            engineLocked = true;

            state.device = 'PENDING';
            state.retry = 0;
            state.retryPhase = 'idle';
            state.monitoring = false;
            state.stop = false;

            saveState();
            sessionStorage.setItem(SESSION_KEY, 'ACTIVE');

            const detected = await detectDevice();

            if (!detected) {
                console.warn("Device detection failed");
                resetAll();
                return;
            }

            state.device = detected;
            saveState();

            // 🔥 ASP.NET Safe Trigger
            if (typeof window.__doPostBack === 'function') {
                window.__doPostBack('ctl00$ContentPlaceHolder1$btn_mbrs', '');
            } else {
                go.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
            }

        } catch (err) {
            console.error("FAST button error:", err);
            resetAll();
        }
    };

    go.parentElement.appendChild(b);
}


/* ================= RETRY ENGINE ================= */

function scheduleRetry(clickFn, label) {

    if (state.retryPhase === 'waiting') return;

    if (state.retry >= MAX_CAPTURE_RETRY) {
        msg(`${label} failed after ${MAX_CAPTURE_RETRY} retries`, true, 4000);
        devLog('error', label + ' Max Retry Hit');
        resetAll();
        return;
    }

    state.retry++;
    state.retryPhase = 'waiting';
    saveState();

    msg(`${label} Retry ${state.retry}/${MAX_CAPTURE_RETRY}`, true, 1500);

    captureRetryTimer = setTimeout(() => {
        state.retryPhase = 'idle';
        saveState();
        lastActionTime = Date.now();
        clickFn();
    }, adaptiveDelay);
}

/* ================= BIO FLOW ================= */

function bioFlow() {

    detectPhase();
    lastProgressTime = Date.now();

    const seq = [
        'ctl00_ContentPlaceHolder1_rbl_auth_type_2',
        'ctl00_ContentPlaceHolder1_RadioButtonList1_0',
        'ctl00_ContentPlaceHolder1_rbl_single_multiple_0',
        'ctl00_ContentPlaceHolder1_rdbldevice_0'
    ];

    for (const id of seq) {
        const el = $(id);
        if (el && !el.checked) {
            el.click();
            return;
        }
    }

    const cap = $('ctl00_ContentPlaceHolder1_btnmantra');
    if (cap && !state.monitoring) {
        state.monitoring = true;
        state.retry = 0;
        saveState();
        lastActionTime = Date.now();
        cap.click();
    }

    const info = $('ctl00_ContentPlaceHolder1_hidBioInfo')?.value || '';

    if (info.includes('Success')) {
        $('ctl00_ContentPlaceHolder1_btn_verify')?.click();
        resetAll();
    }

    if (info && !info.includes('Success')) {
        scheduleRetry(() => cap.click(), 'BIO');
    }
}

/* ================= IRIS FLOW ================= */

function irisFlow() {

    detectPhase();
    lastProgressTime = Date.now();

    const auth = $('ctl00_ContentPlaceHolder1_rbl_auth_type_3');
    if (auth && !auth.checked) { auth.click(); return; }

    const yes = $('ctl00_ContentPlaceHolder1_RadioButtonList1_0');
    if (yes && !yes.checked) { yes.click(); return; }

    const irisBtn = $('ctl00_ContentPlaceHolder1_btnIrisMantra');

    if (!state.irisDeviceClicked) {
        const devRadio = $('ctl00_ContentPlaceHolder1_rbl_device_type_2');
        if (devRadio) {
            devRadio.click();
            state.irisDeviceClicked = true;
            state.irisDeviceClickTime = Date.now();
            saveState();
        }
        return;
    }

    if (!irisBtn && Date.now() - state.irisDeviceClickTime > IRIS_DEVICE_TIMEOUT) {
        msg('IRIS load timeout', true, 4000);
        devLog('error', 'IRIS Timeout');
        resetAll();
        return;
    }

    if (irisBtn && !state.monitoring) {
        state.monitoring = true;
        state.retry = 0;
        saveState();
        lastActionTime = Date.now();
        irisBtn.click();
        return;
    }

    const info = $('ctl00_ContentPlaceHolder1_hidirisInfo')?.value || '';

    if (info.includes('Success')) {
        $('ctl00_ContentPlaceHolder1_btn_iris_verify')?.click();
        resetAll();
    }

    if (info && !info.includes('Success')) {
        scheduleRetry(() => irisBtn.click(), 'IRIS');
    }
}

/* ================= MAIN LOOP ================= */

function tick() {

    if (engineLocked && state.device === 'PENDING') return;

    if (location.href.includes('MainMenu.aspx')) {
        resetAll();
        return;
    }

    addFastButton();

    if (!loadState()) return;

    if (!sessionStorage.getItem(SESSION_KEY)) {
        sessionStorage.setItem(SESSION_KEY, 'ACTIVE');
    }

    if (state.device === 'PENDING') return;

    if (state.device === 'BIO') bioFlow();
    if (state.device === 'IRIS') irisFlow();
}

setInterval(tick, 150);

})();

}
