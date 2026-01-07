require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cron = require('node-cron');
const http = require('http');
const { Server } = require('socket.io');

const { sequelize, User } = require('./src/models');
const routes = require('./src/routes');
const env = require('./src/config/env');
const bcrypt = require('bcryptjs');

// Import services for cron jobs
const taskService = require('./src/features/task/task.service');
const leadService = require('./src/features/lead/lead.service');
const whatsAppService = require('./src/services/WhatsAppService');

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
// Cron Jobs
// ===========================================

// Hourly SLA Check - runs every hour for critical alerts
cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Running hourly SLA check...');

    try {
        const overdueLeads = await leadService.getOverdueLeads();

        if (overdueLeads.length === 0) {
            console.log('[Cron] No overdue leads found');
            return;
        }

        // Filter leads stuck for 3+ days and send individual alerts
        const now = new Date();
        for (const lead of overdueLeads) {
            const lastInteraction = new Date(lead.last_interaction_at);
            const daysStuck = Math.floor((now - lastInteraction) / 86400000);

            if (daysStuck >= 3) {
                const alertMessage = `⚠️ *Alerta: Lead Parado*

O lead *${lead.name}* está parado na etapa "*${lead.pipeline?.title || 'Desconhecida'}*" há *${daysStuck} dias*.

📞 Telefone: ${lead.phone}
📅 Última interação: ${lastInteraction.toLocaleDateString('pt-BR')}

Por favor, verifique e tome uma ação!`;

                await whatsAppService.sendAdminAlert(alertMessage);
                console.log(`[Cron] Alert sent for lead ${lead.id} (${daysStuck} days)`);
            }
        }
    } catch (error) {
        console.error('[Cron] Error in hourly SLA check:', error.message);
    }
});

// Follow-up Job - runs every 2 hours during business hours (8AM-8PM)
const followUpService = require('./src/services/FollowUpService');

cron.schedule('0 8,10,12,14,16,18,20 * * *', async () => {
    console.log('[Cron] Running follow-up job...');

    try {
        const result = await followUpService.runFollowupJob();
        console.log(`[Cron] Follow-up job complete: ${result.sent}/${result.total} messages sent`);
    } catch (error) {
        console.error('[Cron] Error in follow-up job:', error.message);
    }
});

// Daily summary alert job - runs every day at 9:00 AM
cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Running daily summary alert job...');

    try {
        // Get overdue tasks
        const overdueTasks = await taskService.getOverdueTasks();

        // Get overdue leads (SLA estourado)
        const overdueLeads = await leadService.getOverdueLeads();

        if (overdueTasks.length === 0 && overdueLeads.length === 0) {
            console.log('[Cron] No alerts to send');
            return;
        }

        // Build alert message
        let alertMessage = '📋 *Resumo Diário de Alertas*\n\n';

        if (overdueTasks.length > 0) {
            alertMessage += `⚠️ *${overdueTasks.length} Tarefas Vencidas:*\n`;
            overdueTasks.slice(0, 5).forEach(task => {
                alertMessage += `• ${task.title} (${task.lead?.name || 'Lead desconhecido'})\n`;
            });
            if (overdueTasks.length > 5) {
                alertMessage += `... e mais ${overdueTasks.length - 5} tarefas\n`;
            }
            alertMessage += '\n';
        }

        if (overdueLeads.length > 0) {
            alertMessage += `🔴 *${overdueLeads.length} Leads com SLA Estourado:*\n`;
            overdueLeads.slice(0, 5).forEach(lead => {
                alertMessage += `• ${lead.name} - ${lead.pipeline?.title || 'Sem etapa'}\n`;
            });
            if (overdueLeads.length > 5) {
                alertMessage += `... e mais ${overdueLeads.length - 5} leads\n`;
            }
        }

        // Send alert via WhatsApp
        await whatsAppService.sendAdminAlert(alertMessage);
        console.log('[Cron] Daily summary alert sent successfully');
    } catch (error) {
        console.error('[Cron] Error in daily summary alert job:', error.message);
    }
});

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
            await sequelize.sync({ force: true });
            console.log('✅ Database synchronized (FORCE TRUE)');
        }

        // Create default admin user
        await createDefaultAdmin();

        // Seed default SystemSettings
        const { SystemSettings } = require('./src/models');
        await SystemSettings.seedDefaults();
        console.log('✅ System settings initialized');

        // Start server
        server.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📚 API available at http://localhost:${PORT}/api`);
            console.log(`🏥 Health check at http://localhost:${PORT}/health`);
            console.log(`🔌 Socket.io enabled`);
        });
    } catch (error) {
        console.error('❌ Unable to start server:', error.message);
        process.exit(1);
    }
}

startServer();

module.exports = app;
