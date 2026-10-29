export function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Faça login para continuar.' });
  next();
}
export function sameOrigin(origin) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('origin') !== origin) return res.status(403).json({ error: 'Origem inválida. Acesse pelo endereço configurado em APP_ORIGIN.' });
    next();
  };
}
export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.session.csrfToken || req.get('X-CSRF-Token') !== req.session.csrfToken) return res.status(403).json({ error: 'Sessão inválida. Atualize a página e faça login novamente.' });
  next();
}
