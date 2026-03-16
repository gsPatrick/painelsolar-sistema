const express = require('express');
const router = express.Router();
const followUpService = require('../../services/FollowUpService');
const { Lead, FollowUpRule } = require('../../models');
const { authenticate, checkReadOnly } = require('../auth/auth.middleware');

// All routes require authentication
router.use(authenticate);

// History and rules (GET)
router.get('/history', async (req, res) => {
    try {
        const history = await followUpService.getHistory();
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/rules', async (req, res) => {
    try {
        const rules = await FollowUpRule.findAll({
            order: [['pipeline_id', 'ASC'], ['step_number', 'ASC']],
            include: ['pipeline']
        });
        res.status(200).json(rules);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Write operations (POST/PUT/DELETE)
router.post('/rules', checkReadOnly, async (req, res) => {
    try {
        const rule = await FollowUpRule.create(req.body);
        res.status(201).json(rule);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/rules/:id', checkReadOnly, async (req, res) => {
    try {
        await FollowUpRule.destroy({ where: { id: req.params.id } });
        res.status(200).json({ message: 'Rule deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/rules/:id', checkReadOnly, async (req, res) => {
    try {
        const rule = await FollowUpRule.findByPk(req.params.id);
        if (!rule) {
            return res.status(404).json({ error: 'Rule not found' });
        }
        await rule.update(req.body);
        res.status(200).json(rule);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Pending/Approval (GET)
router.get('/pending', async (req, res) => {
    try {
        const leads = await followUpService.getLeadsNeedingFollowup();
        res.status(200).json(leads);
    } catch (error) {
        console.error('[FollowUp] Error getting pending leads:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.get('/approval', async (req, res) => {
    try {
        const leads = await followUpService.getLeadsNeedingApproval();
        res.status(200).json(leads);
    } catch (error) {
        console.error('[FollowUp] Error getting approval leads:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Write operations for leads
router.post('/send/:leadId', checkReadOnly, async (req, res) => {
    try {
        const lead = await Lead.findByPk(req.params.leadId);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const success = await followUpService.sendFollowup(lead);
        if (success) {
            res.status(200).json({ message: 'Follow-up sent successfully', lead });
        } else {
            res.status(500).json({ error: 'Failed to send follow-up' });
        }
    } catch (error) {
        console.error('[FollowUp] Error sending follow-up:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.post('/bulk-send', checkReadOnly, async (req, res) => {
    try {
        const { leadIds } = req.body;
        if (!leadIds || !Array.isArray(leadIds)) {
            return res.status(400).json({ error: 'leadIds array is required' });
        }

        followUpService.bulkSend(leadIds).catch(err =>
            console.error('[FollowUp] Error in background bulk send:', err)
        );

        res.status(200).json({
            message: 'Disparo em massa iniciado em segundo plano. Isso pode levar alguns minutos.',
            background: true
        });
    } catch (error) {
        console.error('[FollowUp] Error in bulk send:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.post('/bulk-mark-sent', checkReadOnly, async (req, res) => {
    try {
        const { leadIds } = req.body;
        if (!leadIds || !Array.isArray(leadIds)) {
            return res.status(400).json({ error: 'leadIds array is required' });
        }

        const result = await followUpService.bulkMarkAsSent(leadIds);
        res.json({ message: 'Bulk marked as sent', ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/mark-sent/:leadId', checkReadOnly, async (req, res) => {
    try {
        const { leadId } = req.params;
        const lead = await Lead.findByPk(leadId, {
            include: [{ model: require('../models').Pipeline, as: 'pipeline' }]
        });

        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        await followUpService.markAsSent(lead);
        res.json({ message: 'Lead marked as sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/approve/:leadId', checkReadOnly, async (req, res) => {
    try {
        const lead = await Lead.findByPk(req.params.leadId);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        lead.ai_status = 'active';
        lead.ai_paused_at = null;
        await lead.save();

        const success = await followUpService.sendFollowup(lead);

        res.status(200).json({
            message: success ? 'AI reactivated and follow-up sent' : 'AI reactivated, follow-up failed',
            lead
        });
    } catch (error) {
        console.error('[FollowUp] Error approving follow-up:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.put('/custom/:leadId', checkReadOnly, async (req, res) => {
    try {
        const { custom_followup_message } = req.body;

        const lead = await Lead.findByPk(req.params.leadId);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        lead.custom_followup_message = custom_followup_message || null;
        await lead.save();

        res.status(200).json({
            message: custom_followup_message ? 'Custom follow-up message set' : 'Custom follow-up message removed',
            lead
        });
    } catch (error) {
        console.error('[FollowUp] Error setting custom message:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.post('/run', checkReadOnly, async (req, res) => {
    try {
        const result = await followUpService.runFollowupJob();
        res.status(200).json({
            message: 'Follow-up job executed',
            ...result
        });
    } catch (error) {
        console.error('[FollowUp] Error running job:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
