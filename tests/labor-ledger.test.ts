import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVerifiedContributionPlan } from '../lib/labor-ledger.ts';
const a = { id: 'a', region: '上海', regime: 'employee' as const, from: '2026-01', to: '2026-06', personalMonthlyCents: 123456, employerMonthlyCents: 234567 };
test('ledger sums inclusive months and separates self-paid regime', () => {
  const result = calculateVerifiedContributionPlan([a, { ...a, id: 'b', region: '深圳', regime: 'flexible', from: '2026-07', to: '2026-12', personalMonthlyCents: 300000, employerMonthlyCents: 0 }], true);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.lines.find((l) => l.id === 'ledger-employee-personal')?.amountCents, 740736);
  assert.equal(result.lines.find((l) => l.id === 'ledger-flexible-personal')?.amountCents, 1800000);
  assert.ok(result.lines.every((l) => l.sourceIds.length && l.formula));
});
test('ledger rejects overlap, unknown regime, unconfirmed and invalid date or precision', () => {
  for (const entries of [[a, { ...a, id: 'b' }], [{ ...a, regime: 'resident' as const }], [{ ...a, from: '2026-13' }], [{ ...a, personalMonthlyCents: 1.2 }], [{ ...a, regime: 'flexible' as const }]]) assert.equal(calculateVerifiedContributionPlan(entries, true).ok, false);
  assert.equal(calculateVerifiedContributionPlan([a], false).ok, false);
});
