const express = require('express');
const router = express.Router();
const followUpService = require('../../services/FollowUpService');
const { Lead, FollowUpRule } = require('../../models');
const { authenticate } = require('../auth/auth.middleware');

// All routes require authentication
router.use(authenticate);


/**
 * GET /followup/rules
 * List all follow-up rules
 */
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

/**
 * POST /followup/rules
 * Create a new rule
 */
router.post('/rules', async (req, res) => {
    try {
        const rule = await FollowUpRule.create(req.body);
        res.status(201).json(rule);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * DELETE /followup/rules/:id
 * Delete a rule
 */
router.delete('/rules/:id', async (req, res) => {
    try {
        await FollowUpRule.destroy({ where: { id: req.params.id } });
        res.status(200).json({ message: 'Rule deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /followup/rules/:id
 * Update an existing rule
 */
router.put('/rules/:id', async (req, res) => {
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



/**
 * GET /followup/pending
 * Get leads that need follow-up (AI is active)
 */
router.get('/pending', async (req, res) => {
    try {
        const leads = await followUpService.getLeadsNeedingFollowup();
        res.status(200).json(leads);
    } catch (error) {
        console.error('[FollowUp] Error getting pending leads:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /followup/approval
 * Get leads needing operator approval (AI is paused)
 */
router.get('/approval', async (req, res) => {
    try {
        const leads = await followUpService.getLeadsNeedingApproval();
        res.status(200).json(leads);
    } catch (error) {
        console.error('[FollowUp] Error getting approval leads:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /followup/send/:leadId
 * Manually send follow-up to a specific lead
 */
router.post('/send/:leadId', async (req, res) => {
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

/**
 * POST /followup/approve/:leadId
 * Approve and send follow-up for a paused lead (reactivates AI)
 */
router.post('/approve/:leadId', async (req, res) => {
    try {
        const lead = await Lead.findByPk(req.params.leadId);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Reactivate AI
        lead.ai_status = 'active';
        lead.ai_paused_at = null;
        await lead.save();

        // Send follow-up
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

/**
 * PUT /followup/custom/:leadId
 * Set custom follow-up message for a specific lead
 */
router.put('/custom/:leadId', async (req, res) => {
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

/**
 * POST /followup/run
 * Manually trigger the follow-up job (admin only)
 */
router.post('/run', async (req, res) => {
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
