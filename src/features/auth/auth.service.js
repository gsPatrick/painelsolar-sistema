const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../../models');
const env = require('../../config/env');

class AuthService {
    /**
     * Register a new user
     * @param {Object} data - { name, email, password, role }
     */
    async register(data) {
        const { name, email, password, role } = data;

        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            throw new Error('Email já cadastrado');
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({
            name,
            email,
            password_hash,
            role: role || 'sales',
        });

        // Generate token
        const token = this.generateToken(user);

        return {
            user: this.sanitizeUser(user),
            token,
        };
    }

    /**
     * Login user
     * @param {Object} data - { email, password }
     */
    async login(data) {
        const { email, password } = data;

        // Find user
        const user = await User.findOne({ where: { email } });
        if (!user) {
            throw new Error('Credenciais inválidas');
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw new Error('Credenciais inválidas');
        }

        // Generate token
        const token = this.generateToken(user);

        return {
            user: this.sanitizeUser(user),
            token,
        };
    }

    /**
     * Get user by ID
     * @param {string} userId
     */
    async getUserById(userId) {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('Usuário não encontrado');
        }
        return this.sanitizeUser(user);
    }

    /**
     * Get all users
     */
    async getAllUsers() {
        const users = await User.findAll({
            order: [['created_at', 'DESC']]
        });
        return users.map(user => this.sanitizeUser(user));
    }

    /**
     * Delete user
     * @param {string} userId
     */
    async deleteUser(userId) {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('Usuário não encontrado');
        }
        await user.destroy();
        return { success: true };
    }

    /**
     * Update user (can be used for password reset)
     * @param {string} userId
     * @param {Object} data
     */
    async updateUser(userId, data) {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('Usuário não encontrado');
        }

        const { name, email, password, role } = data;

        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;
        if (password) {
            user.password_hash = await bcrypt.hash(password, 10);
        }

        await user.save();
        return this.sanitizeUser(user);
    }

    /**
     * Generate JWT token
     */
    generateToken(user) {
        return jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            env.JWT_SECRET,
            { expiresIn: env.JWT_EXPIRES_IN }
        );
    }

    /**
     * Verify JWT token
     */
    verifyToken(token) {
        return jwt.verify(token, env.JWT_SECRET);
    }

    /**
     * Remove sensitive data from user object
     */
    sanitizeUser(user) {
        const { id, name, email, role, created_at } = user.toJSON();
        return { id, name, email, role, created_at };
    }
}

module.exports = new AuthService();
