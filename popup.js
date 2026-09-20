/**
 * popup.js — Ahara Helper Extension Controller v5.1.6
 */

const API_BASE = 'https://aharahelper.vercel.app';

const PLANS = {
  trial:  { label: 'Trial (3 Days)',    days: 3   },
  micro:  { label: 'Micro (30 Days)',   days: 30  },
  small:  { label: 'Small (90 Days)',   days: 90  },
  medium: { label: 'Medium (180 Days)', days: 180 },
  large:  { label: 'Large (365 Days)',  days: 365 },
};

document.addEventListener('DOMContentLoaded', () => {

  const DEFAULTS = {
    mobileNumber:       '',
    role:               'owner',
    autoFillEnabled:    true,
    autoLoginEnabled:   true,
    rcPrefix:           '',
    extensionEnabled:   false,
    subscriptionActive: false,
    expiresAt:          null,
  };

  // DOM Elements
  const mobileInput          = document.getElementById('mobileNumber');
  const rcPrefixInput        = document.getElementById('rcPrefix');
  const extensionEnabledCheck = document.getElementById('extensionEnabled');
  const saveBtn              = document.getElementById('saveButton');
  const statusDiv            = document.getElementById('status');
  const statusMsgText        = document.getElementById('status-msg-text');

  const actionBtn            = document.getElementById('action-btn');
  const statusDot            = document.getElementById('status-dot');
  const statusText           = document.getElementById('status-text');

  // Shield elements
  const outerShield          = document.querySelector('.outer-shield');
  const midShield            = document.querySelector('.mid-shield');
  const innerShield          = document.querySelector('.inner-shield');
  const shieldGlow           = document.querySelector('.shield-glow');

  const subStatusBadge       = document.getElementById('sub-status-badge');
  const subPlanBadge         = document.getElementById('sub-plan-badge');
  const subExpiryBadge       = document.getElementById('sub-expiry-badge');
  const renewLink            = document.getElementById('renew-link');
  const subBlockedBanner     = document.getElementById('sub-blocked-banner');
  const subBlockedMobile     = document.getElementById('sub-blocked-mobile');

  const infoBtn              = document.getElementById('info-btn');
  const closeModalBtn        = document.getElementById('close-modal-btn');
  const infoModal            = document.getElementById('info-modal');
  const modalOverlay         = document.getElementById('modal-overlay');

  let connectionState = 'disconnected';
  let statusTimeout = null;

  // ── Info Modal ─────────────────────────────────────────────────────────────
  function toggleInfoModal(open) {
    if (open) {
      infoModal.classList.add('active');
      modalOverlay.classList.add('active');
    } else {
      infoModal.classList.remove('active');
      modalOverlay.classList.remove('active');
    }
  }

  if (infoBtn) infoBtn.addEventListener('click', () => toggleInfoModal(true));
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => toggleInfoModal(false));
  if (modalOverlay) modalOverlay.addEventListener('click', () => toggleInfoModal(false));

  // ── Visual state setters ───────────────────────────────────────────────────
  function setConnectedVisuals() {
    connectionState = 'connected';
    actionBtn.className = 'action-btn status-connected';
    statusDot.className = 'status-dot dot-connected';
    statusDot.style.backgroundColor = '';
    statusText.textContent = 'HELPER ACTIVE';
    statusText.className = 'status-text text-connected';
    statusText.style.color = '';
    outerShield.classList.add('connected-outer-shield');
    midShield.classList.add('connected-mid-shield');
    shieldGlow.classList.add('connected-shield-glow');
  }

  function setDisconnectedVisuals(label = 'HELPER DISABLED', color = '') {
    connectionState = 'disconnected';
    actionBtn.className = 'action-btn status-disconnected';
    statusDot.className = 'status-dot dot-disconnected';
    statusDot.style.backgroundColor = color;
    statusText.textContent = label;
    statusText.className = 'status-text text-disconnected';
    statusText.style.color = color;
    outerShield.classList.remove('connected-outer-shield');
    midShield.classList.remove('connected-mid-shield');
    shieldGlow.classList.remove('connected-shield-glow');
  }

  // ── Action Power Button Toggle ─────────────────────────────────────────────
  actionBtn.addEventListener('click', async () => {
    if (connectionState === 'disconnected') {
      const mobile = mobileInput.value.trim();
      if (!mobile || !/^\d{10}$/.test(mobile)) {
        if (statusTimeout) clearTimeout(statusTimeout);
        if (statusMsgText) statusMsgText.textContent = 'Enter 10-digit mobile & Save first';
        statusDiv.classList.add('show');
        statusTimeout = setTimeout(() => statusDiv.classList.remove('show'), 3000);
        mobileInput.focus();
        return;
      }
      const isSubscribed = await verifySubscription();
      if (!isSubscribed) return;
      setConnectedVisuals();
      if (extensionEnabledCheck) extensionEnabledCheck.checked = true;
      saveStorage({ extensionEnabled: true });
    } else {
      setDisconnectedVisuals();
      if (extensionEnabledCheck) extensionEnabledCheck.checked = false;
      saveStorage({ extensionEnabled: false });
    }
  });

  // ── Subscription Card UI ───────────────────────────────────────────────────
  function setSubCard(state, planLabel, expiry) {
    const stateMap = {
      active:      'Active ✓',
      expired:     'Expired ✗',
      not_found:   'Not Subscribed',
      offline:     'Offline (Cached)',
      unverified:  'Unverified',
      suspended:   'Suspended',
    };
    subStatusBadge.textContent = stateMap[state] || state;
    subStatusBadge.setAttribute('data-state', state);
    subPlanBadge.textContent   = planLabel || '—';
    subExpiryBadge.textContent = expiry    || '—';

    const showRenew = ['expired', 'not_found', 'suspended', 'unverified'].includes(state);
    renewLink.style.display = showRenew ? 'inline-block' : 'none';
  }

  function showSubscriptionRequired(mobile) {
    if (subBlockedBanner) {
      subBlockedBanner.style.display = 'block';
      if (subBlockedMobile) subBlockedMobile.textContent = mobile ? `Mobile: ${mobile}` : '';
    }
  }

  function hideBanners() {
    if (subBlockedBanner) subBlockedBanner.style.display = 'none';
  }

  // ── Storage Helpers ────────────────────────────────────────────────────────
  function saveStorage(data, callback) {
    chrome.storage.sync.get(['mobileNumber', 'rcPrefix', 'role'], (existing) => {
      const mobile = data.mobileNumber || existing.mobileNumber || '';
      const rcNo = data.rcPrefix || existing.rcPrefix || '540400';
      const role = data.role || existing.role || 'owner';

      const enriched = {
        ...data,
        active: 'default',
        profiles: {
          default: {
            mobile: mobile,
            rcNo: rcNo,
            userType: (role === 'admin' || role === 'assistant') ? 'A' : 'O',
            shopName: 'Ahara User',
            shortcut: 'a'
          }
        }
      };

      chrome.storage.sync.set(enriched, () => {
        chrome.storage.local.set(enriched, () => {
          if (callback) callback();
        });
      });
    });
  }

  // ── Verify Subscription ────────────────────────────────────────────────────
  async function verifySubscription() {
    const mobile = mobileInput.value.trim();

    if (!mobile || !/^\d{10}$/.test(mobile)) {
      setSubCard('unverified', null, null);
      hideBanners();
      setDisconnectedVisuals('HELPER DISABLED');
      saveStorage({ subscriptionActive: false });
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/api/subscription/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const plan    = PLANS[data.planType] || { label: data.planType?.toUpperCase() };
        const expDate = new Date(data.expiresAt);
        const isExpired = new Date() > expDate;

        if (isExpired) {
          const expStrFormatted = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          setSubCard('expired', plan.label, expStrFormatted);
          showSubscriptionRequired(mobile);
          setDisconnectedVisuals('SUBSCRIPTION EXPIRED', 'var(--color-danger)');
          saveStorage({ mobileNumber: mobile, subscriptionActive: false, expiresAt: data.expiresAt, lastVerifiedAt: Date.now() });
          return false;
        }

        const expStr = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        setSubCard('active', plan.label, expStr);
        hideBanners();
        saveStorage({ mobileNumber: mobile, subscriptionActive: true, expiresAt: data.expiresAt, role: data.role || 'owner', lastVerifiedAt: Date.now() });
        
        if (extensionEnabledCheck.checked) {
          setConnectedVisuals();
        } else {
          setDisconnectedVisuals('HELPER DISABLED');
        }
        return true;
      }

      // Not found / Expired / Suspended
      saveStorage({ mobileNumber: mobile, subscriptionActive: false, extensionEnabled: false, lastVerifiedAt: Date.now() });
      setSubCard(data.reason || 'not_found', null, null);
      showSubscriptionRequired(mobile);
      setDisconnectedVisuals('NOT SUBSCRIBED', 'var(--color-danger)');
      if (extensionEnabledCheck) extensionEnabledCheck.checked = false;
      return false;

    } catch (err) {
      console.warn('[Ahara Helper] Verification network check failed, using cached state:', err);
      return new Promise((resolve) => {
        chrome.storage.sync.get(['subscriptionActive', 'expiresAt', 'extensionEnabled', 'mobileNumber'], (res) => {
          const hasValidMobile = res.mobileNumber && /^\d{10}$/.test(res.mobileNumber);
          const isExpired = res.expiresAt ? (new Date() > new Date(res.expiresAt)) : true;
          if (hasValidMobile && res.subscriptionActive === true && !isExpired) {
            setSubCard('offline', null, null);
            hideBanners();
            if (res.extensionEnabled === true) setConnectedVisuals();
            else setDisconnectedVisuals('HELPER DISABLED');
            resolve(true);
          } else {
            setSubCard('unverified', null, null);
            setDisconnectedVisuals('HELPER DISABLED');
            saveStorage({ subscriptionActive: false, extensionEnabled: false });
            if (extensionEnabledCheck) extensionEnabledCheck.checked = false;
            resolve(false);
          }
        });
      });
    }
  }

  // ── Save & Verify Button ───────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const mobile     = mobileInput.value.trim();
    const rcPrefix   = rcPrefixInput.value.trim();
    const extEnabled = extensionEnabledCheck.checked;

    if (!mobile || !/^\d{10}$/.test(mobile)) {
      alert('Please enter a valid 10-digit Ahara mobile number.');
      return;
    }
    if (rcPrefix && (!/^\d+$/.test(rcPrefix) || rcPrefix.length < 3)) {
      alert('RC Prefix must be numeric (at least 3 digits, e.g., 540400).');
      return;
    }

    saveBtn.style.opacity = '0.7';
    saveBtn.textContent = 'Verifying...';

    const isSubscribed = await verifySubscription();

    saveStorage({
      mobileNumber:     mobile,
      rcPrefix:         rcPrefix,
      extensionEnabled: isSubscribed ? extEnabled : false,
      autoFillEnabled:  true,
      autoLoginEnabled: true,
    }, () => {
      saveBtn.style.opacity = '1';
      saveBtn.innerHTML = '<span>Save & Verify</span><div class="btn-glow"></div>';

      if (statusTimeout) clearTimeout(statusTimeout);
      if (statusMsgText) {
        statusMsgText.textContent = isSubscribed ? '✓ Settings Saved & Verified!' : '✓ Saved (Subscription Not Active)';
      }
      statusDiv.classList.add('show');
      statusTimeout = setTimeout(() => statusDiv.classList.remove('show'), 3000);
    });
  });

  // ── Input Live Filters ─────────────────────────────────────────────────────
  mobileInput.addEventListener('keypress', (e) => {
    if (!/[0-9]/.test(e.key)) e.preventDefault();
  });

  rcPrefixInput.addEventListener('keypress', (e) => {
    if (!/[0-9]/.test(e.key)) e.preventDefault();
  });

  mobileInput.addEventListener('input', () => {
    const val = mobileInput.value.trim();
    if (val.length === 10) {
      verifySubscription();
    }
  });

  // ── Initialize Popup ───────────────────────────────────────────────────────
  chrome.storage.sync.get(DEFAULTS, (syncSettings) => {
    chrome.storage.local.get((localSettings) => {
      const settings = { ...DEFAULTS, ...(syncSettings || {}) };
      if ((!settings.mobileNumber || !/^\d{10}$/.test(settings.mobileNumber)) && localSettings && /^\d{10}$/.test(localSettings.mobileNumber)) {
        settings.mobileNumber = localSettings.mobileNumber;
      }
      mobileInput.value             = settings.mobileNumber || '';
      rcPrefixInput.value           = settings.rcPrefix     || '';
      if (extensionEnabledCheck) {
        extensionEnabledCheck.checked = settings.extensionEnabled === true && settings.subscriptionActive === true;
      }

      if (settings.mobileNumber && settings.mobileNumber.length === 10) {
        verifySubscription();
      } else {
        setDisconnectedVisuals('HELPER DISABLED');
        if (extensionEnabledCheck) extensionEnabledCheck.checked = false;
        saveStorage({ extensionEnabled: false, subscriptionActive: false });
      }
    });
  });
});
