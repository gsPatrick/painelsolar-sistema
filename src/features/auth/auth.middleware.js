const authService = require('./auth.service');

/**
 * JWT Authentication Middleware
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token não fornecido' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = authService.verifyToken(token);

        req.user = decoded;
        next();
    } catch (error) {
        console.error('[AuthMiddleware] Error:', error.message);
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};

/**
 * Role-based Authorization Middleware
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        next();
    };
};

module.exports = {
    authenticate,
    authorize,
};
