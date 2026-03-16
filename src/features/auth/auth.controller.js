const authService = require('./auth.service');

class AuthController {
    /**
     * POST /auth/register
     */
    async register(req, res) {
        try {
            const { name, email, password, role } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
            }

            const result = await authService.register({ name, email, password, role });
            res.status(201).json(result);
        } catch (error) {
            console.error('[AuthController] Register error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * POST /auth/login
     */
    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email e senha são obrigatórios' });
            }

            const result = await authService.login({ email, password });
            res.status(200).json(result);
        } catch (error) {
            console.error('[AuthController] Login error:', error.message);
            res.status(401).json({ error: error.message });
        }
    }

    /**
     * GET /auth/me
     */
    async me(req, res) {
        try {
            const user = await authService.getUserById(req.user.id);
            res.status(200).json({ user });
        } catch (error) {
            console.error('[AuthController] Me error:', error.message);
            res.status(404).json({ error: error.message });
        }
    }

    /**
     * PUT /auth/me
     */
    async updateMe(req, res) {
        try {
            const { name, email, password } = req.body;
            const user = await authService.updateUser(req.user.id, { name, email, password });
            res.status(200).json({ user });
        } catch (error) {
            console.error('[AuthController] Update error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * GET /auth/users
     * Admin only check should be in routes
     */
    async index(req, res) {
        try {
            const users = await authService.getAllUsers();
            res.status(200).json({ users });
        } catch (error) {
            console.error('[AuthController] Index error:', error.message);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * PUT /auth/users/:id
     * Used for admin to update user (including password reset)
     */
    async updateUser(req, res) {
        try {
            const { id } = req.params;
            const { name, email, password, role } = req.body;
            const user = await authService.updateUser(id, { name, email, password, role });
            res.status(200).json({ user });
        } catch (error) {
            console.error('[AuthController] UpdateUser error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * DELETE /auth/users/:id
     */
    async deleteUser(req, res) {
        try {
            const { id } = req.params;
            const result = await authService.deleteUser(id);
            res.status(200).json(result);
        } catch (error) {
            console.error('[AuthController] Delete error:', error.message);
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new AuthController();
