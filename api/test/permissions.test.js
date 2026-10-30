import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionOptions, effectivePermissions, validatePermissions, sandboxPolicy } from '../src/services/permissions.js';
import { loadConfig } from '../src/config/env.js';

const standard = { sandbox: 'workspace-write', allowFullAccess: false };
const enabled = { ...standard, allowFullAccess: true };
const full = { sandbox: 'danger-full-access', approvalPolicy: 'never' };
const env = { JARVIS_PASSWORD_HASH: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`, SESSION_SECRET: 's'.repeat(64), CODEX_MODE: 'mock' };

test('full access remains opt-in and defaults preserve existing restricted behavior', () => {
  assert.deepEqual(permissionOptions(standard), { defaults: { sandbox: 'workspace-write', approvalPolicy: 'untrusted' }, allowed: { sandbox: ['read-only', 'workspace-write'], approvalPolicy: ['untrusted', 'on-request'] } });
  assert.throws(() => validatePermissions(standard, { sandbox: 'danger-full-access' }), { status: 400 });
  assert.throws(() => validatePermissions(standard, { approvalPolicy: 'never' }), { status: 400 });
  const options = permissionOptions(enabled);
  assert.deepEqual(options.defaults, permissionOptions(standard).defaults);
  assert.ok(options.allowed.sandbox.includes('danger-full-access'));
  assert.ok(options.allowed.approvalPolicy.includes('never'));
});

test('full access normalizes approval to never and uses native unrestricted sandbox policy', () => {
  assert.deepEqual(validatePermissions(enabled, { sandbox: 'danger-full-access' }), full);
  assert.deepEqual(validatePermissions(enabled, { sandbox: 'danger-full-access', approvalPolicy: 'untrusted' }), full);
  assert.deepEqual(validatePermissions(enabled, full), full);
  assert.deepEqual(sandboxPolicy(full, '/workspace'), { type: 'dangerFullAccess' });
  assert.throws(() => validatePermissions(enabled, { ...full, approvalPolicy: 'invalid' }), { status: 400 });
  assert.throws(() => validatePermissions(enabled, { ...full, networkAccess: true }), { status: 400 });
});

test('leaving full mode restores prompts and disallows never on a restricted sandbox', () => {
  const current = { permissions: full };
  assert.deepEqual(validatePermissions(enabled, { sandbox: 'workspace-write' }, current), { sandbox: 'workspace-write', approvalPolicy: 'on-request' });
  assert.deepEqual(validatePermissions(enabled, { sandbox: 'read-only' }, current), { sandbox: 'read-only', approvalPolicy: 'on-request' });
  assert.deepEqual(validatePermissions(enabled, { sandbox: 'workspace-write', approvalPolicy: 'untrusted' }, current), { sandbox: 'workspace-write', approvalPolicy: 'untrusted' });
  assert.throws(() => validatePermissions(enabled, { sandbox: 'workspace-write', approvalPolicy: 'never' }, current), { status: 400 });
  assert.throws(() => validatePermissions(enabled, { approvalPolicy: 'never' }), { status: 400 });
});

test('server read-only ceiling and revoked full-access flag override saved conversation permissions', () => {
  const floor = { sandbox: 'read-only', allowFullAccess: true };
  assert.deepEqual(permissionOptions(floor).allowed, { sandbox: ['read-only'], approvalPolicy: ['untrusted', 'on-request'] });
  assert.throws(() => validatePermissions(floor, full), { status: 400 });
  assert.deepEqual(effectivePermissions(floor, { permissions: full }), { sandbox: 'read-only', approvalPolicy: 'untrusted' });
  assert.deepEqual(effectivePermissions(standard, { permissions: full }), { sandbox: 'workspace-write', approvalPolicy: 'untrusted' });
  assert.deepEqual(effectivePermissions(enabled, { permissions: { sandbox: 'workspace-write', approvalPolicy: 'never' } }), { sandbox: 'workspace-write', approvalPolicy: 'untrusted' });
});

test('config full-access flag requires explicit true and explicit unrestricted default requires the flag', () => {
  assert.equal(loadConfig(env).allowFullAccess, false);
  assert.equal(loadConfig({ ...env, CODEX_ALLOW_FULL_ACCESS: '1' }).allowFullAccess, false);
  assert.equal(loadConfig({ ...env, CODEX_ALLOW_FULL_ACCESS: 'true' }).allowFullAccess, true);
  assert.throws(() => loadConfig({ ...env, CODEX_SANDBOX: 'danger-full-access' }), /CODEX_ALLOW_FULL_ACCESS/);
  const config = loadConfig({ ...env, CODEX_ALLOW_FULL_ACCESS: 'true', CODEX_SANDBOX: 'danger-full-access' });
  assert.deepEqual(permissionOptions(config).defaults, full);
});
