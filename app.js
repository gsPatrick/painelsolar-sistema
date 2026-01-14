require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cron = require('node-cron');
const http = require('http');
const { Server } = require('socket.io');

const { sequelize, User, Pipeline } = require('./src/models');
const routes = require('./src/routes');
const env = require('./src/config/env');
const bcrypt = require('bcryptjs');

// Import services for cron jobs
const taskService = require('./src/features/task/task.service');
const leadService = require('./src/features/lead/lead.service');
const whatsAppService = require('./src/services/WhatsAppService');

// Check Meta Config
const metaToken = process.env.META_PAGE_ACCESS_TOKEN;
if (!metaToken) {
    console.warn('⚠️  AVISO: META_PAGE_ACCESS_TOKEN não configurado no .env. A integração com Facebook/Instagram não funcionará.');
} else {
    console.log('✅ Meta API Configurada (Token detectado)');
}

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.set('io', io);

// Initialize BulkSenderService with Socket.io
const bulkSenderService = require('./src/services/BulkSenderService');
bulkSenderService.setSocket(io);

// Socket.io event handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_chat', (data) => {
        socket.join(data.room);
        console.log(`User ${socket.id} joined room: ${data.room}`);
    });

    socket.on('send_message', (data) => {
        // Broadcast to everyone in the room except the sender
        socket.to(data.room).emit('receive_message', data);
    });

    socket.on('typing', (data) => {
        socket.to(data.room).emit('display_typing', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// ===========================================
// Middleware
// ===========================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/public', express.static('public'));

// ===========================================
// Routes
// ===========================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[Error]', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// ===========================================
// Default Admin User Creation
// ===========================================

async function createDefaultAdmin() {
    try {
        const adminEmail = 'admin@admin.com';
        const existingAdmin = await User.findOne({ where: { email: adminEmail } });

        if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await User.create({
                name: 'Administrador',
                email: adminEmail,
                password_hash: hashedPassword,
                role: 'admin',
            });
            console.log('✅ Default admin user created (admin@admin.com / admin123)');
        } else {
            console.log('ℹ️  Default admin user already exists');
        }
    } catch (error) {
        console.error('⚠️  Error creating default admin:', error.message);
    }
}

// ===========================================
// Default Pipelines Creation
// ===========================================

async function createDefaultPipelines() {
    try {
        const defaultPipelines = [
            { title: 'Entrada', color: '#64748B', order_index: 0, sla_limit_days: 1 },
            { title: 'Primeiro Contato', color: '#3B82F6', order_index: 1, sla_limit_days: 2 },
            { title: 'Aguardando Proposta', color: '#F59E0B', order_index: 2, sla_limit_days: 3 },
            { title: 'Proposta Enviada', color: '#8B5CF6', order_index: 3, sla_limit_days: 5 },
            { title: 'Agendamento', color: '#EC4899', order_index: 4, sla_limit_days: 7 },
            { title: 'Fechamento', color: '#10B981', order_index: 5, sla_limit_days: 10 },
            { title: 'Pós-Venda', color: '#6366F1', order_index: 6, sla_limit_days: 30 }
        ];

        for (const p of defaultPipelines) {
            const [pipeline, created] = await Pipeline.findOrCreate({
                where: { title: p.title },
                defaults: p
            });

            // Always update properties to ensure consistency
            if (!created) {
                pipeline.color = p.color;
                pipeline.order_index = p.order_index;
                pipeline.sla_limit_days = p.sla_limit_days;
                await pipeline.save();
            }

            console.log(`✅ Pipeline "${p.title}" verificado/atualizado`);
        }

        // REMOVE DEPRECATED PIPELINES
        const { Op } = require('sequelize');
        const allowedTitles = defaultPipelines.map(p => p.title);

        // Also keep TEMP_SEGURO if it exists temporarily
        allowedTitles.push('TEMP_SEGURO');

        const deletedCount = await Pipeline.destroy({
            where: {
                title: { [Op.notIn]: allowedTitles }
            }
        });

        if (deletedCount > 0) {
            console.log(`🧹 Removidos ${deletedCount} pipelines obsoletos`);
        }

        console.log('ℹ️  Pipelines padrão verificados e sincronizados');
    } catch (error) {
        console.error('⚠️  Error creating default pipelines:', error.message);
    }
}

// ===========================================
// Cron Jobs (Managed by CronService)
// ===========================================
const cronService = require('./src/services/CronService');


// ===========================================
// Database Sync & Server Start
// ===========================================

const PORT = env.PORT || 3000;

async function startServer() {
    try {
        // Test database connection
        await sequelize.authenticate();
        console.log('✅ Database connected successfully');

        // Sync models (in development, use { alter: true })
        if (env.NODE_ENV === 'development') {
            await sequelize.sync({ alter: true });
            console.log('✅ Database synchronized (ALTER)');
        }

        // Create default admin user
        await createDefaultAdmin();

        // Seed default SystemSettings
        const { SystemSettings } = require('./src/models');
        await SystemSettings.seedDefaults();
        console.log('✅ System settings initialized');

        // Create default pipelines
        await createDefaultPipelines();

        // Start server
        server.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📚 API available at http://localhost:${PORT}/api`);
            console.log(`🏥 Health check at http://localhost:${PORT}/health`);
            console.log(`🔌 Socket.io enabled`);

            // Initialize Cron Jobs
            cronService.init();

            // Execute Follow-up Job on Startup to process overdue leads
            setTimeout(() => {
                console.log('🔄 [Startup] Processing backlog of leads for follow-up...');
                const followUpService = require('./src/services/FollowUpService');
                followUpService.runFollowupJob()
                    .then(res => console.log(`✅ [Startup] Backlog processed: ${res.sent} messages sent to ${res.total} leads.`))
                    .catch(e => console.error('❌ [Startup] Error processing backlog:', e.message));
            }, 10000); // 10s delay to ensure full startup
        });
    } catch (error) {
        console.error('❌ Unable to start server:', error.message);
        process.exit(1);
    }
}

startServer();

module.exports = app;
