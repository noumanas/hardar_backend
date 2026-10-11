import { SnakeNamingStrategy, toSnakeCase } from './snake-naming.strategy.js';

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it.each([
    ['phoneHash', 'phone_hash'],
    ['followUpSentAt', 'follow_up_sent_at'],
    ['WPSRules', 'wps_rules'],
    ['latencyMs', 'latency_ms'],
  ])('converts %s to %s', (input, expected) => {
    expect(toSnakeCase(input)).toBe(expected);
  });

  it('names tables, columns and relations in snake_case', () => {
    expect(strategy.tableName('ComplaintCase', undefined)).toBe('complaint_case');
    expect(strategy.tableName('ComplaintCase', 'complaint_cases')).toBe('complaint_cases');
    expect(strategy.columnName('lastMessageAt', undefined, [])).toBe('last_message_at');
    expect(strategy.columnName('ignored', 'customName', ['embedded'])).toBe('embedded_custom_name');
    expect(strategy.relationName('workerProfile')).toBe('worker_profile');
    expect(strategy.joinColumnName('worker', 'id')).toBe('worker_id');
  });
});
