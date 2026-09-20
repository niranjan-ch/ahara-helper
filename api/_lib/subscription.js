const PLAN_MAP = {
  trial: { label: 'Trial', days: 3 },
  micro: { label: 'Micro', days: 30 },
  small: { label: 'Small', days: 90 },
  medium: { label: 'Medium', days: 180 },
  large: { label: 'Large', days: 365 },
};

function normalizeMobile(mobile) {
  if (!mobile) return '';
  return String(mobile).replace(/\D/g, '').slice(-10);
}

function buildDefaultPlan(planType) {
  const key = String(planType || 'trial').toLowerCase();
  return PLAN_MAP[key] || { label: 'Trial', days: 3 };
}

function parseExpiresAt(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function canonicalRecord(record) {
  if (!record) return null;
  const mobile = normalizeMobile(record.mobile);
  if (!mobile) return null;

  const planType = String(record.planType || record.plan || 'trial').toLowerCase();
  const role = String(record.role || 'owner').toLowerCase();
  const expiresAt = parseExpiresAt(record.expiresAt) || addDays(new Date(), buildDefaultPlan(planType).days);

  return {
    mobile,
    planType,
    role,
    expiresAt: expiresAt.toISOString(),
    status: record.status || 'active',
    updatedAt: record.updatedAt || new Date().toISOString(),
  };
}

function getStore() {
  if (!globalThis.__AHARA_SUBSCRIPTION_STORE__) {
    globalThis.__AHARA_SUBSCRIPTION_STORE__ = {};
  }
  return globalThis.__AHARA_SUBSCRIPTION_STORE__;
}

function saveSubscription({ mobile, planType = 'trial', expiresAt, role = 'owner', status = 'active' }) {
  const clean = canonicalRecord({ mobile, planType, expiresAt, role, status, updatedAt: new Date().toISOString() });
  if (!clean) return null;

  const store = getStore();
  store[clean.mobile] = clean;
  return clean;
}

function getSubscription(mobile) {
  const clean = normalizeMobile(mobile);
  if (!clean) return null;

  const store = getStore();
  const record = store[clean];
  if (!record) return null;

  return canonicalRecord(record);
}

function verifySubscription(mobile) {
  const clean = normalizeMobile(mobile);
  if (!clean) {
    return {
      success: false,
      reason: 'invalid_mobile',
      message: 'Mobile number must be a 10-digit Indian number.',
    };
  }

  const record = getSubscription(clean);
  if (!record) {
    return {
      success: false,
      reason: 'not_found',
      message: 'No subscription found for this mobile number.',
    };
  }

  const expiresAt = parseExpiresAt(record.expiresAt);
  const expired = !expiresAt || new Date() > expiresAt;

  if (expired) {
    return {
      success: false,
      reason: 'expired',
      message: 'Subscription expired.',
      mobile: clean,
      planType: record.planType,
      expiresAt: record.expiresAt,
      role: record.role,
    };
  }

  return {
    success: true,
    mobile: clean,
    planType: record.planType,
    expiresAt: record.expiresAt,
    role: record.role,
    message: 'Subscription is active.',
  };
}

module.exports = {
  normalizeMobile,
  saveSubscription,
  getSubscription,
  verifySubscription,
  PLAN_MAP,
};
