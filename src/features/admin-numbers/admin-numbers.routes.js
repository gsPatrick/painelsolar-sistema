const express = require('express');
const router = express.Router();
const { AdminNumber } = require('../../models');
const authenticate = require('../../middleware/authenticate');

// All routes require authentication
router.use(authenticate);

// GET all admin numbers
router.get('/', async (req, res) => {
    try {
        const numbers = await AdminNumber.findAll({
            order: [['createdAt', 'DESC']],
        });
        res.json(numbers);
    } catch (error) {
        console.error('[AdminNumbers] Error fetching:', error);
        res.status(500).json({ error: 'Erro ao buscar números' });
    }
});

// POST create admin number
router.post('/', async (req, res) => {
    try {
        const { name, phone } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
        }

        // Format phone number (remove non-digits, ensure starts with 55)
        let formattedPhone = phone.replace(/\D/g, '');
        if (!formattedPhone.startsWith('55')) {
            formattedPhone = '55' + formattedPhone;
        }

        const adminNumber = await AdminNumber.create({
            name,
            phone: formattedPhone,
            active: true,
        });

        res.status(201).json(adminNumber);
    } catch (error) {
        console.error('[AdminNumbers] Error creating:', error);
        res.status(500).json({ error: 'Erro ao criar número' });
    }
});

// PUT update admin number
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, active } = req.body;

        const adminNumber = await AdminNumber.findByPk(id);
        if (!adminNumber) {
            return res.status(404).json({ error: 'Número não encontrado' });
        }

        if (name !== undefined) adminNumber.name = name;
        if (phone !== undefined) {
            let formattedPhone = phone.replace(/\D/g, '');
            if (!formattedPhone.startsWith('55')) {
                formattedPhone = '55' + formattedPhone;
            }
            adminNumber.phone = formattedPhone;
        }
        if (active !== undefined) adminNumber.active = active;

        await adminNumber.save();
        res.json(adminNumber);
    } catch (error) {
        console.error('[AdminNumbers] Error updating:', error);
        res.status(500).json({ error: 'Erro ao atualizar número' });
    }
});

// DELETE admin number
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const adminNumber = await AdminNumber.findByPk(id);
        if (!adminNumber) {
            return res.status(404).json({ error: 'Número não encontrado' });
        }

        await adminNumber.destroy();
        res.json({ message: 'Número excluído com sucesso' });
    } catch (error) {
        console.error('[AdminNumbers] Error deleting:', error);
        res.status(500).json({ error: 'Erro ao excluir número' });
    }
});

module.exports = router;
