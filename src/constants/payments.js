// ─────────────────────────────────────────────────────────────────────────────
// HeLiK — Pricing & payment methods. SINGLE SOURCE OF TRUTH.
//
// This previously existed three times (paymentService.js, walletService.js and
// here) with three different package sets and two different balance units, so
// the price a user saw depended on which screen they opened. Everything now
// imports from this file.
//
// These values are for DISPLAY. The server re-prices every transaction from its
// own copy — never trust a client-supplied amount. See BACKEND.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Price of a single organ screening. */
export const SCAN_PRICE = {
  UGX: 500,
  USD: 0.5,
};

function buildPackage({ id, scans, ugx, usd, popular = false }) {
  const fullPriceUgx = scans * SCAN_PRICE.UGX;
  const savedPercent = Math.round(((fullPriceUgx - ugx) / fullPriceUgx) * 100);
  return {
    id,
    scans,
    ugx,
    usd,
    popular,
    label: `${scans} Scan${scans === 1 ? '' : 's'}`,
    perScanUgx: Math.round(ugx / scans),
    savedPercent,
    // Derived, so a badge can never disagree with the arithmetic again.
    badge: savedPercent > 0 ? `Save ${savedPercent}%` : null,
  };
}

export const PACKAGES = [
  buildPackage({ id: 'pkg_1', scans: 1, ugx: 500, usd: 0.5 }),
  buildPackage({ id: 'pkg_5', scans: 5, ugx: 2000, usd: 2.0, popular: true }),
  buildPackage({ id: 'pkg_10', scans: 10, ugx: 3500, usd: 3.5 }),
  buildPackage({ id: 'pkg_20', scans: 20, ugx: 6000, usd: 6.0 }),
];

export const getPackageById = (id) => PACKAGES.find((p) => p.id === id) ?? null;

export const PAYMENT_METHODS = [
  {
    id: 'mtn_momo',
    name: 'MTN Mobile Money',
    short: 'MTN MoMo',
    icon: '📱',
    color: '#FFC200',
    textColor: '#1A1A1A',
    currency: 'UGX',
    requiresPhone: true,
    numberHint: 'Numbers starting 077 or 078',
    placeholder: '7XX XXX XXX',
    available: true,
  },
  {
    id: 'airtel_money',
    name: 'Airtel Money',
    short: 'Airtel Money',
    icon: '📲',
    color: '#E40000',
    textColor: '#FFFFFF',
    currency: 'UGX',
    requiresPhone: true,
    numberHint: 'Numbers starting 070 or 075',
    placeholder: '7XX XXX XXX',
    available: true,
  },
  {
    id: 'card',
    name: 'Visa / Mastercard',
    short: 'Card',
    icon: '💳',
    color: '#1A56DB',
    textColor: '#FFFFFF',
    currency: 'UGX',
    requiresPhone: false,
    numberHint: null,
    placeholder: null,
    available: true,
  },
];

export const getMethodById = (id) => PAYMENT_METHODS.find((m) => m.id === id) ?? null;

// ── Formatting ───────────────────────────────────────────────────────────────

export const formatUGX = (n) => `UGX ${Number(n ?? 0).toLocaleString('en-UG')}`;
export const formatUSD = (n) => `$${Number(n ?? 0).toFixed(2)}`;

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Ugandan mobile numbers are 9 digits after the +256 country code and start
 * with 7. Accepts a leading 0 (07XX...) and strips it, which is how people
 * actually type their number.
 */
export function normalisePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  const local = digits.startsWith('256') ? digits.slice(3) : digits.replace(/^0/, '');
  return local;
}

export function isValidUgandanMobile(input) {
  const local = normalisePhone(input);
  return /^7\d{8}$/.test(local);
}
