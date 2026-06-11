'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();

const { authenticate } = require('../middleware/authMiddleware');
const {
    listExpenses,
    getExpense,
    createExpense,
    updateExpense,
    deleteExpense,
    getExpenseSummary,
} = require('../controllers/expenseController');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', 'uploads', 'receipts'));
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, crypto.randomUUID() + ext);
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowed = /jpeg|jpg|png|gif|pdf/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error('الملف غير مدعوم. الأنواع المسموحة: صور (JPG, PNG, GIF) وملفات PDF.'));
        }
    },
});

router.get('/', authenticate, listExpenses);
router.get('/summary', authenticate, getExpenseSummary);
router.get('/:id', authenticate, getExpense);
router.post('/', authenticate, upload.single('receipt'), createExpense);
router.put('/:id', authenticate, updateExpense);
router.delete('/:id', authenticate, deleteExpense);

module.exports = router;
