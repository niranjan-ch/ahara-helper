/**
 * ⚡ Ahara Helper Extension v5.1.6 — Karnataka Ahara FPS Automation & Quick Issue Helper
 * 
 * Integrated Architecture:
 * 1. Subscription & Paywall Gate:
 *    - Validates registered mobile against https://aharahelper.vercel.app/api/subscription/verify
 *    - Power switch gate (extensionEnabled), mobile identity gate, and active subscription gate
 *    - All automations strictly disabled without active subscription
 * 2. Superior Automation Modules (Window-driven):
 *    - window.runLogin() -> Login page, role auto-select, big captcha, 5-digit auto-submit, bio/iris auth, disclaimer bypass
 *    - window.runMainMenu() -> Server speed ping, ProcessSelection navigation, card type radio postback, RC prefix fill
 *    - window.runIssue() -> Print_Kero_Cupon_AB fast biometric & iris capture, adaptive RTT delay, auto verify
 *    - window.runEkyc() -> Validate_mbr demographic ViewState save/submit, member selection, bio capture, OTP auto-detect
 *    - window.AharaDeviceFallback -> Mantra RD port scan (11100-11120) and local helper port 3499
 * 3. Ahara Helper UI & Buttons:
 *    - ⚡ Quick Issue button on Main Menu (next to ctl00_lnkMain)
 *    - Floating Live Monthly Tracker overlay for issued coupons
 */

(function () {
  'use strict';

  // ── CONSTANTS & DEFAULTS ───────────────────────────────────────────────────
  const DEFAULTS = {
    mobileNumber: '',
    role: 'owner',
    autoFillEnabled: true,
    autoLoginEnabled: true,
    rcPrefix: '',
    extensionEnabled: false,
    subscriptionActive: false,
    expiresAt: null,
    lastVerifiedAt: 0
  };

  const API_BASE = 'https://aharahelper.vercel.app';

  let currentSettings = { ...DEFAULTS };
  let _cachedRcHistory = [];
  let _observer = null;
  let _observerDebounceTimer = null;
  let _modulesStarted = false;

  // ── 1. SUBSCRIPTION & PAYWALL GATE ─────────────────────────────────────────

  function isAutomationActive(settings) {
    const s = settings || currentSettings;
    if (!s) return false;
    // 1. Power Switch Gate: Helper must be switched ON
    if (s.extensionEnabled !== true) return false;
    // 2. Mobile Identity Gate: Must have a valid 10-digit registered mobile
    if (!s.mobileNumber || !/^\d{10}$/.test(String(s.mobileNumber).trim())) return false;
    // 3. Subscription Status Gate: Must have an active subscription
    if (s.subscriptionActive !== true) return false;
    // 4. Expiration Gate: If expiration timestamp exists, it must not be expired
    if (s.expiresAt) {
      const expDate = new Date(s.expiresAt);
      if (isNaN(expDate.getTime()) || new Date() > expDate) return false;
    }
    return true;
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (syncItems) => {
        chrome.storage.local.get(DEFAULTS, (localItems) => {
          const merged = { ...DEFAULTS, ...syncItems, ...localItems };
          resolve(merged);
        });
      });
    });
  }

  async function refreshSubscriptionFromDB() {
    if (!currentSettings.mobileNumber || !/^\d{10}$/.test(currentSettings.mobileNumber)) {
      currentSettings.subscriptionActive = false;
      currentSettings.extensionEnabled = false;
      return;
    }

    // ⚡ Performance Cache: If verified within the last 15 minutes, is active, and not expired,
    // reuse cached state to eliminate redundant HTTP requests on every ASP.NET postback.
    const SUB_CACHE_TTL_MS = 15 * 60 * 1000;
    const now = Date.now();
    const lastChecked = currentSettings.lastVerifiedAt || 0;
    const isCachedActive = currentSettings.subscriptionActive === true &&
      currentSettings.expiresAt && (new Date(currentSettings.expiresAt).getTime() > now);

    if (isCachedActive && (now - lastChecked < SUB_CACHE_TTL_MS)) {
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(`${API_BASE}/api/subscription/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: currentSettings.mobileNumber }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const isExpired = data.expiresAt ? (new Date() > new Date(data.expiresAt)) : false;
          const newRole = data.role || currentSettings.role || 'owner';
          currentSettings.subscriptionActive = !isExpired;
          currentSettings.expiresAt = data.expiresAt;
          currentSettings.role = newRole;
          currentSettings.lastVerifiedAt = Date.now();
          if (isExpired) {
            currentSettings.extensionEnabled = false;
          }

          const updateObj = {
            subscriptionActive: !isExpired,
            extensionEnabled: isExpired ? false : currentSettings.extensionEnabled,
            expiresAt: data.expiresAt,
            role: newRole,
            lastVerifiedAt: Date.now()
          };
          chrome.storage.local.set(updateObj);
          chrome.storage.sync.set(updateObj);
          console.log('[Ahara Helper v5.1.6] Synced subscription & role from DB:', { role: newRole, active: !isExpired });
        } else {
          console.warn('[Ahara Helper v5.1.6] Subscription inactive in DB:', data.reason || 'not_found');
          currentSettings.subscriptionActive = false;
          currentSettings.extensionEnabled = false;
          currentSettings.lastVerifiedAt = Date.now();
          const inactiveObj = { subscriptionActive: false, extensionEnabled: false, lastVerifiedAt: Date.now() };
          chrome.storage.local.set(inactiveObj);
          chrome.storage.sync.set(inactiveObj);
        }
      }
    } catch (e) {
      console.warn('[Ahara Helper v5.1.6] Background DB sync skipped (cached mode):', e.message);
    }
  }

  function showPaywallNotice() {
    if (isAutomationActive(currentSettings)) {
      document.getElementById('ahara-paywall-notice')?.remove();
      return;
    }
    if (document.getElementById('ahara-paywall-notice')) return;
    if (!window.location.hostname.includes('karnataka.gov.in')) return;

    const notice = document.createElement('div');
    notice.id = 'ahara-paywall-notice';
    notice.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 999999;
      background: #ffffff;
      border-left: 4px solid #ef4444;
      box-shadow: 0 4px 14px rgba(0,0,0,0.15);
      border-radius: 8px;
      padding: 10px 14px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      max-width: 280px;
      line-height: 1.4;
      color: #1f2937;
    `;
    notice.innerHTML = `
      <div style="font-weight: bold; color: #ef4444; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
        <span>🔒 Ahara Helper Inactive</span>
        <span id="ahara-close-paywall" style="cursor: pointer; color: #9ca3af; font-size: 14px; margin-left: 8px;">&times;</span>
      </div>
      <div style="color: #4b5563; font-size: 11px;">
        ${!currentSettings.extensionEnabled ? 'Helper power switch is OFF.' : 'Active subscription required for automation.'} Open the extension popup to activate.
      </div>
    `;
    document.body.appendChild(notice);
    notice.querySelector('#ahara-close-paywall')?.addEventListener('click', () => notice.remove());
  }

  // ── 2. MODULE DISPATCHER ───────────────────────────────────────────────────

  function runModulesIfActive() {
    if (!isAutomationActive(currentSettings)) {
      showPaywallNotice();
      return;
    }

    document.getElementById('ahara-paywall-notice')?.remove();

    if (!_modulesStarted) {
      _modulesStarted = true;
      console.log('🚀 [Ahara Helper v5.1.6] Subscription Verified -> Running Automation Modules');
      window.runLogin?.();
      window.runMainMenu?.();
      window.runIssue?.();
      window.runEkyc?.();
    }
  }

  // ── 3. BUTTON INJECTIONS ───────────────────────────────────────────────────

  function injectQuickButtons() {
    // Ensure any legacy new kyc button is removed
    document.getElementById('ahara-new-kyc-btn')?.remove();

    if (!isAutomationActive(currentSettings)) return;

    // Quick Issue Button (Placed on the exact side of Main Menu button)
    const mainMenuEl = document.getElementById('ctl00_lnkMain') || Array.from(document.querySelectorAll('a, button, input')).find(el => {
      const text = (el.textContent || el.value || '').toUpperCase();
      return text.includes('MAIN MENU') || text.includes('ಮುಖ್ಯ ಮೆನು');
    });

    if (mainMenuEl && !document.getElementById('ahara-quick-issue-btn')) {
      const td1 = mainMenuEl.closest('td') || mainMenuEl.parentElement;
      if (td1) {
        td1.style.whiteSpace = 'nowrap';
        td1.style.verticalAlign = 'middle';
      }
      mainMenuEl.style.display = 'inline-block';
      mainMenuEl.style.verticalAlign = 'middle';

      const btn = document.createElement('a');
      btn.href = '#';
      btn.id = 'ahara-quick-issue-btn';
      btn.title = '⚡ Quick Issue Ration (Auto-Process)';
      btn.style.cssText = 'margin-left: 8px; display: inline-block; vertical-align: middle; cursor: pointer; text-decoration: none; border: 0; line-height: 0; padding: 0;';
      
      const img = document.createElement('img');
      img.src = chrome.runtime.getURL('quick_issue.png');
      img.alt = '⚡ Quick Issue';
      img.style.cssText = 'width: 116px; height: 33px; display: inline-block; vertical-align: middle; border: 0; outline: none; object-fit: fill;';
      btn.appendChild(img);

      btn.addEventListener('mouseenter', () => { img.style.filter = 'brightness(1.1)'; });
      btn.addEventListener('mouseleave', () => { img.style.filter = 'none'; });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Ahara Helper v5.1.5] ⚡ Quick Issue clicked');

        chrome.storage.local.set({ automationActive: true }, () => {
          const match = window.location.pathname.match(/\/(shopowner_[a-z]server)\//i);
          const serverSeg = match ? match[1] : 'shopowner_bserver';
          window.location.href = `https://ahara.karnataka.gov.in/${serverSeg}/Reports/ProcessSelection.aspx`;
        });
      }, true);

      mainMenuEl.parentNode.insertBefore(btn, mainMenuEl.nextSibling);
    }
  }

  // ── 4. RECEIPT TRACKER & MONTHLY TOTAL OVERLAY ─────────────────────────────

  function isReceiptPage() {
    const path = window.location.pathname.toLowerCase();
    // ⚡ Fast URL Guard: Bail immediately if not a receipt/coupon/ack/print page
    const isCouponPath = path.includes('cupon') || path.includes('coupon') || path.includes('receipt') || path.includes('print') || path.includes('ack');
    if (!isCouponPath) return false;

    const hasPrintBtn = Array.from(document.querySelectorAll('input[type="button"], button, a, input[type="submit"]')).some(btn => {
      const text = (btn.value || btn.textContent || btn.id || '').toLowerCase();
      const onclick = (btn.getAttribute('onclick') || '').toLowerCase();
      return text.includes('print') || text.includes('ಮುದ್ರಣ') || onclick.includes('print');
    });

    if (!hasPrintBtn) return false;

    const bodyText = (document.body ? (document.body.innerText || document.body.textContent || '') : '').toLowerCase();
    const hasReceiptText = bodyText.includes('acknowledgement') || bodyText.includes('ಖರೀದಿ ರಶೀದಿ') || bodyText.includes('ಅಕ್ಕಿ') || bodyText.includes('ration receipt') || bodyText.includes('issued quantity') || bodyText.includes('ಪಡೆದ ಪ್ರಮಾಣ');

    return hasReceiptText || isCouponPath;
  }

  function extractRCNumber() {
    const rcInput = document.getElementById('ctl00_ContentPlaceHolder1_txt_rc_no') || document.querySelector('input[name*="rc_no"]');
    if (rcInput && rcInput.value && rcInput.value.trim().length >= 8) {
      return rcInput.value.trim();
    }
    const elements = Array.from(document.querySelectorAll('span, td, div, p, th, b, strong'));
    for (const el of elements) {
      const text = el.textContent.trim();
      const match = text.match(/(?:RC Number|ಪ\.ಚೀಟಿ ಸಂಖ್ಯೆ|RC No|Ration Card)\s*:\s*([A-Z0-9]+)/i);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  function extractRiceQuantity() {
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) continue;

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        for (const cell of cells) {
          const text = cell.textContent.trim();
          const match = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|ಕೆ\.ಜಿ)/i);
          if (match && parseFloat(match[1]) > 0) {
            return match[1];
          }
        }
      }
    }
    return null;
  }

  function getCurrentMonthKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function getCurrentMonthName() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[new Date().getMonth()];
  }

  async function saveTransaction(rc, rice) {
    if (!rc || !rice) return;
    chrome.storage.local.get({ rcHistory: [], monthlyTotal: { currentMonthKey: '', totalRice: 0 } }, (data) => {
      const history = data.rcHistory || [];
      if (history.length > 0 && history[0].rc === rc) return;

      const currentMonthKey = getCurrentMonthKey();
      let mt = data.monthlyTotal || { currentMonthKey: '', totalRice: 0 };
      const riceQty = parseFloat(rice) || 0;

      if (mt.currentMonthKey === currentMonthKey) {
        mt.totalRice += riceQty;
      } else {
        mt.currentMonthKey = currentMonthKey;
        mt.totalRice = riceQty;
      }

      const newHistory = [{ rc: rc, rice: rice, time: new Date().toLocaleTimeString() }, ...history].slice(0, 10);
      _cachedRcHistory = newHistory;
      chrome.storage.local.set({ rcHistory: newHistory, monthlyTotal: mt }, () => {
        renderOverlay(newHistory, mt);
      });
    });
  }

  function renderOverlay(history, monthlyTotal) {
    const existing = document.getElementById('ahara-tracker-overlay');
    if (existing) existing.remove();

    if (!history || history.length === 0) return;

    const overlay = document.createElement('div');
    overlay.id = 'ahara-tracker-overlay';
    overlay.style.cssText = 'position: fixed; top: 20px; right: 20px; width: 280px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1); color: #1e293b; font-family: system-ui, -apple-system, sans-serif; font-size: 12px; z-index: 999998; overflow: hidden;';

    let rowsHtml = history.map((item, i) => 
      '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9;">' +
      '<span style="font-family: monospace; font-size: 11px; color: #475569;"><b>' + (i+1) + '.</b> ' + item.rc + '</span>' +
      '<span style="font-weight: 700; color: #16a34a;">' + item.rice + ' kg</span>' +
      '</div>'
    ).join('');

    const totalVal = monthlyTotal ? Math.round(monthlyTotal.totalRice * 100) / 100 : 0;

    overlay.innerHTML = 
      '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700;">' +
      '<span>⚡ Ahara Helper Tracker</span>' +
      '<span id="ahara-close-tracker" style="cursor: pointer; color: #94a3b8; font-size: 14px;">&times;</span>' +
      '</div>' +
      '<div style="padding: 6px 12px; max-height: 220px; overflow-y: auto;">' +
      rowsHtml +
      '</div>' +
      '<div style="padding: 8px 12px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-weight: 600;">' +
      '<span>Total (' + getCurrentMonthName() + '):</span>' +
      '<span style="color: #0284c7; font-weight: 700;">' + totalVal + ' kg</span>' +
      '</div>';

    document.body.appendChild(overlay);
    document.getElementById('ahara-close-tracker').addEventListener('click', () => overlay.remove());
  }

  async function handleReceiptPage() {
    if (!isReceiptPage()) return;
    const rc = extractRCNumber();
    const rice = extractRiceQuantity();
    if (rc && rice) {
      saveTransaction(rc, rice);
    }
  }

  // ── 5. INITIALIZATION & REACTION LOOP ──────────────────────────────────────

  async function refreshUI() {
    if (!isAutomationActive(currentSettings)) {
      document.getElementById('ahara-quick-issue-btn')?.remove();
      document.getElementById('ahara-new-kyc-btn')?.remove();
      showPaywallNotice();
      return;
    }

    injectQuickButtons();
    handleReceiptPage();
    runModulesIfActive();
  }

  async function init() {
    currentSettings = await loadSettings();

    refreshSubscriptionFromDB().then(() => {
      refreshUI();
    });

    if (isAutomationActive(currentSettings)) {
      chrome.storage.local.get({ rcHistory: [], monthlyTotal: { currentMonthKey: '', totalRice: 0 } }, (items) => {
        _cachedRcHistory = items.rcHistory || [];
        if (items.rcHistory && items.rcHistory.length > 0) {
          renderOverlay(items.rcHistory, items.monthlyTotal);
        }
      });
    }

    refreshUI();

    // Debounced observer to maintain UI elements across ASP.NET updates
    _observer = new MutationObserver(() => {
      if (_observerDebounceTimer) clearTimeout(_observerDebounceTimer);
      _observerDebounceTimer = setTimeout(() => {
        refreshUI();
      }, 150);
    });

    const targetNode = document.documentElement || document.body || document;
    if (targetNode) {
      _observer.observe(targetNode, {
        childList: true,
        subtree: true
      });
    }
  }

  chrome.storage.onChanged.addListener(() => {
    loadSettings().then(s => {
      currentSettings = s;
      _modulesStarted = false; // allow re-trigger if state enabled
      refreshUI();
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
