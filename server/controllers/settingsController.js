'use strict';

const { getDatabase } = require('../database');

const VALID_KEYS = ['currency', 'billingDay', 'dueDay', 'fontSize', 'pinEnabled', 'companyName', 'phone', 'bankAccount'];

const ARABIC_LABELS = {
  currency: 'العملة',
  billingDay: 'يوم الفوترة',
  dueDay: 'يوم الاستحقاق',
  fontSize: 'حجم الخط',
  pinEnabled: 'رمز PIN',
  companyName: 'اسم الشركة',
  phone: 'رقم الجوال',
  bankAccount: 'الحساب البنكي',
};

function getSettings(req, res) {
  try {
    const db = getDatabase();
    const userId = req.user.userId;
    const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(userId);
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (err) {
    console.error('[Settings GET]', err);
    res.status(500).json({ success: false, message: 'حدث خطأ في جلب الإعدادات.' });
  }
}

function updateSettings(req, res) {
  try {
    const db = getDatabase();
    const userId = req.user.userId;
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(422).json({ success: false, message: 'يرجى تقديم إعدادات واحدة على الأقل.' });
    }

    const upsert = db.prepare(`
      INSERT INTO settings (user_id, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (!VALID_KEYS.includes(key)) continue;

        if (key === 'currency' && !['SAR', 'USD', 'AED'].includes(value)) {
          throw new Error('العملة غير مدعومة. العملات المدعومة: SAR, USD, AED');
        }
        if ((key === 'billingDay' || key === 'dueDay') && (!value || isNaN(value) || Number(value) < 1 || Number(value) > 28)) {
          throw new Error(`${ARABIC_LABELS[key]} يجب أن يكون بين 1 و 28.`);
        }
        if (key === 'fontSize' && !['small', 'medium', 'large', 'extraLarge'].includes(value)) {
          throw new Error('حجم الخط غير صالح.');
        }
        if (key === 'pinEnabled' && !['true', 'false'].includes(String(value))) {
          throw new Error('قيمة pinEnabled غير صالحة.');
        }

        upsert.run(userId, key, String(value));
      }
    });

    transaction();

    const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(userId);
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }

    res.status(200).json({
      success: true,
      message: '✓ تم حفظ الإعدادات بنجاح.',
      data: settings,
    });
  } catch (err) {
    if (err.message && (err.message.includes('غير مدعومة') || err.message.includes('يجب أن يكون') || err.message.includes('غير صالح'))) {
      return res.status(422).json({ success: false, message: err.message });
    }
    console.error('[Settings PUT]', err);
    res.status(500).json({ success: false, message: 'حدث خطأ في حفظ الإعدادات.' });
  }
}

module.exports = { getSettings, updateSettings };
