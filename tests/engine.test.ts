import { describe, it, expect } from 'vitest';
import { similarity, validateRow, normYear, parseRuleConfig, evaluate, runCrashTest, type Rule } from '../server/engine.js';
describe('engine', () => {
  it('normalises academic years and compares names', () => { expect(normYear('2026-2027')).toBe('2026-27'); expect(similarity('Aarav Verma', 'Zoya Ansari')).toBe(0); expect(similarity('Rohan Iyer (Synthetic)', 'rohan iyer')).toBe(1); });
  it('validates rule configs strictly', () => { expect(() => parseRuleConfig('intake_cap', { tolerance: 1, counted_statuses: ['Active'], excluded_categories: [], extra: 1 })).toThrow(); expect(parseRuleConfig('identifier_format', { length: 12 })).toEqual({ length: 12 }); });
  it('rejects a duplicate within a file and an unknown programme', () => {
    const refs = { insts: new Map([['I1', { id: 'i' }]]), progs: new Map([['I1|P', 'p']]), existing: new Set<string>(), hasApproval: () => true }; const seen = new Set<string>();
    const row = { apaar_id: '123456789012', student_name: 'A B', institution_code: 'i1', programme: 'P', academic_year: '2026-2027', category: 'general' };
    expect(validateRow(row, [], refs, seen).errors).toEqual([]); expect(validateRow(row, [], refs, seen).errors[0]).toMatch(/Duplicate/); expect(validateRow({ ...row, programme: 'Z' }, [], refs, seen).errors[0]).toMatch(/Unknown programme/);
  });
  it('is deterministic', () => { const rules: Rule[] = [{ key: 'c', version: 1, type: 'concurrent_enrolment', config: { statuses: ['Active'], grace_days: 0 } }]; expect(runCrashTest(rules).metrics).toEqual(runCrashTest(rules).metrics); expect(evaluate([], [], rules, new Date())).toEqual([]); });
});
