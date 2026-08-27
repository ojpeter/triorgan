/* eslint-env jest */
import {
  PACKAGES,
  SCAN_PRICE,
  getPackageById,
  getMethodById,
  formatUGX,
  formatUSD,
  normalisePhone,
  isValidUgandanMobile,
} from '../payments';

describe('packages', () => {
  it('derives the discount from the arithmetic, so a badge cannot drift', () => {
    for (const pkg of PACKAGES) {
      const fullPrice = pkg.scans * SCAN_PRICE.UGX;
      const expected = Math.round(((fullPrice - pkg.ugx) / fullPrice) * 100);
      expect(pkg.savedPercent).toBe(expected);
      if (pkg.savedPercent > 0) {
        expect(pkg.badge).toBe(`Save ${expected}%`);
      }
    }
  });

  it('never prices a bundle above buying scans singly', () => {
    for (const pkg of PACKAGES) {
      expect(pkg.ugx).toBeLessThanOrEqual(pkg.scans * SCAN_PRICE.UGX);
    }
  });

  it('gets cheaper per scan as the bundle grows', () => {
    const perScan = PACKAGES.map((p) => p.perScanUgx);
    expect([...perScan].sort((a, b) => b - a)).toEqual(perScan);
  });

  it('has exactly one popular package', () => {
    expect(PACKAGES.filter((p) => p.popular)).toHaveLength(1);
  });

  it('resolves a package by id and returns null for an unknown one', () => {
    expect(getPackageById('pkg_5').scans).toBe(5);
    expect(getPackageById('pkg_free')).toBeNull();
  });

  it('exposes only available payment methods with the fields the UI reads', () => {
    const method = getMethodById('mtn_momo');
    expect(method).toMatchObject({ requiresPhone: true, currency: 'UGX' });
    expect(getMethodById('card').requiresPhone).toBe(false);
    expect(getMethodById('bitcoin')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats currency without throwing on null or undefined', () => {
    expect(formatUGX(2000)).toMatch(/2,000/);
    expect(formatUGX(null)).toMatch(/0/);
    expect(formatUSD(2)).toBe('$2.00');
    expect(formatUSD(undefined)).toBe('$0.00');
  });
});

describe('Ugandan mobile numbers', () => {
  it.each([
    ['0771234567', '771234567'],
    ['771234567', '771234567'],
    ['+256 771 234 567', '771234567'],
    ['256771234567', '771234567'],
    ['0701 234 567', '701234567'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each(['0771234567', '+256771234567', '0751234567', '0781234567'])(
    'accepts %s',
    (input) => expect(isValidUgandanMobile(input)).toBe(true)
  );

  it.each([
    ['too short', '07712345'],
    ['too long', '07712345678'],
    ['wrong prefix', '0891234567'],
    ['letters', 'not a number'],
    ['empty', ''],
    ['null', null],
  ])('rejects %s', (_label, input) => {
    expect(isValidUgandanMobile(input)).toBe(false);
  });
});
