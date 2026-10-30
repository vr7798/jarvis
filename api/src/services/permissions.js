const failure = message => Object.assign(new Error(message), { status: 400 });
const approvalPolicies = ['untrusted', 'on-request'];
const FULL_ACCESS = 'danger-full-access';

export function permissionOptions(config) {
  // A read-only server remains a hard ceiling even if the full-access flag is set.
  const allowFullAccess = config.allowFullAccess === true && config.sandbox !== 'read-only';
  const sandbox = config.sandbox === 'read-only' ? ['read-only'] : ['read-only', 'workspace-write', ...(allowFullAccess ? [FULL_ACCESS] : [])];
  const defaultSandbox = sandbox.includes(config.sandbox) ? config.sandbox : 'workspace-write';
  return {
    defaults: { sandbox: defaultSandbox, approvalPolicy: defaultSandbox === FULL_ACCESS ? 'never' : 'untrusted' },
    allowed: { sandbox, approvalPolicy: [...approvalPolicies, ...(allowFullAccess ? ['never'] : [])] },
  };
}

export function effectivePermissions(config, conversation) {
  const { defaults, allowed } = permissionOptions(config);
  const saved = conversation?.permissions;
  const sandbox = allowed.sandbox.includes(saved?.sandbox) ? saved.sandbox : defaults.sandbox;
  const approvalPolicy = sandbox === FULL_ACCESS ? 'never'
    : approvalPolicies.includes(saved?.approvalPolicy) ? saved.approvalPolicy
    : defaults.approvalPolicy === 'never' ? 'on-request' : defaults.approvalPolicy;
  return { sandbox, approvalPolicy };
}

export function validatePermissions(config, value, current) {
  if (value === undefined) return effectivePermissions(config, current);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['sandbox', 'approvalPolicy'].includes(key))) throw failure('Configuração de permissões inválida.');
  const previous = effectivePermissions(config, current);
  const result = { ...previous, ...value };
  const { allowed } = permissionOptions(config);
  if (!allowed.sandbox.includes(result.sandbox)) throw failure('Modo de acesso não permitido pelo servidor.');
  if (!allowed.approvalPolicy.includes(result.approvalPolicy)) throw failure('Política de aprovação inválida.');
  if (result.sandbox === FULL_ACCESS) return { sandbox: FULL_ACCESS, approvalPolicy: 'never' };
  if (result.approvalPolicy === 'never') {
    if (value.approvalPolicy !== undefined) throw failure('A aprovação automática sem solicitações está disponível apenas no modo de acesso total.');
    result.approvalPolicy = 'on-request';
  }
  return result;
}

export function sandboxPolicy(permissions, workspace) {
  if (permissions.sandbox === FULL_ACCESS) return { type: 'dangerFullAccess' };
  return permissions.sandbox === 'read-only'
    ? { type: 'readOnly', networkAccess: false }
    : { type: 'workspaceWrite', writableRoots: [workspace], networkAccess: false, excludeSlashTmp: true, excludeTmpdirEnvVar: true };
}
