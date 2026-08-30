const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};

const requirePermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthenticated' });
    const userPerms = req.user.permissions || [];
    const hasAll = permissions.every(p => userPerms.includes(p) || req.user.role === 'super_admin');
    if (!hasAll) return res.status(403).json({ message: 'Missing required permissions' });
    next();
  };
};

module.exports = { requireRole, requirePermissions };