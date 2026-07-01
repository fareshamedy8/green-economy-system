const path = require('path');     // مكتبة إدارة مسارات الملفات
const fs = require('fs');         // مكتبة التعامل مع نظام الملفات
const express = require('express'); // إطار عمل الخادم
const sqlite3 = require('sqlite3').verbose(); // مكتبة قاعدة بيانات SQLite

const app = express();  // إنشاء تطبيق Express
const PORT = 6548;      // رقم المنفذ الذي يعمل عليه الخادم

function resolveDbPath() {
  // دالة للبحث عن ملف قاعدة البيانات في مسارين محتملين
  const primary = path.join(__dirname, 'database.db');                        // المسار الأول
  const fallback = path.join(__dirname, 'database', 'green_economy.db');      // المسار الثاني

  if (fs.existsSync(primary)) return primary;   // إذا وُجد الملف في المسار الأول استخدمه
  if (fs.existsSync(fallback)) return fallback; // إذا وُجد في المسار الثاني استخدمه

  throw new Error(  // إذا لم يُوجد في أيٍّ منهما ارمِ خطأ
    `لم يتم العثور على ملف قاعدة البيانات.\n` +
    `المسارات التي تم فحصها:\n- ${primary}\n- ${fallback}`
  );
}

let db; // متغير عام لحفظ اتصال قاعدة البيانات

function runAll(sql, params = []) {
  // تنفيذ استعلام SQL وإرجاع جميع الصفوف كـ Promise
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);  // في حالة خطأ ارفض الـ Promise
      resolve(rows);                // نجح الاستعلام، أرجع الصفوف
    });
  });
}

function runGet(sql, params = []) {
  // تنفيذ استعلام SQL وإرجاع صف واحد فقط كـ Promise
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);  // في حالة خطأ ارفض الـ Promise
      resolve(row);                 // أرجع الصف الأول
    });
  });
}

function quoteIdentifier(name) {
  // التحقق من اسم الجدول لمنع SQL Injection وإضافة علامات الاقتباس
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {  // إذا كان يحتوي على أحرف غير مسموحة
    throw new Error('اسم جدول غير صالح.');
  }
  return `"${name.replace(/"/g, '""')}"`;  // أضف علامات اقتباس للاسم
}

async function getTables() {
  // جلب قائمة الجداول الموجودة في قاعدة البيانات (باستثناء الجداول الداخلية)
  const rows = await runAll(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
     ORDER BY name COLLATE NOCASE`  // رتّب أبجدياً بدون حساسية للحالة
  );
  return rows.map((r) => r.name);  // أرجع فقط أسماء الجداول
}

app.use(express.json());  // تفعيل معالجة طلبات JSON
app.use(express.static(path.join(__dirname, 'public')));  // خدمة الملفات الثابتة من مجلد public

app.get('/', (_req, res) => {
  // المسار الرئيسي – أرسل ملف HTML لواجهة قاعدة البيانات
  res.sendFile(path.join(__dirname, 'public', 'database.html'));
});

app.get('/api/tables', async (_req, res) => {
  // API: جلب قائمة جداول قاعدة البيانات
  try {
    const tables = await getTables();  // اجلب أسماء الجداول
    res.json(tables);                  // أرسلها كـ JSON
  } catch (err) {
    res.status(500).json({             // في حالة خطأ
      error: 'حدث خطأ أثناء جلب الجداول.',
      details: err.message,
    });
  }
});

app.get('/api/table/:name', async (req, res) => {
  // API: جلب بيانات جدول معين باسمه
  const tableName = String(req.params.name || '').trim();  // اسم الجدول من الـ URL

  try {
    if (!tableName) {  // إذا لم يُرسل اسم
      return res.status(400).json({ error: 'اسم الجدول مطلوب.' });
    }

    const exists = await runGet(
      `SELECT name, sql
       FROM sqlite_master
       WHERE type = 'table' AND name = ?`,
      [tableName]
    );  // تحقق من وجود الجدول

    if (!exists) {  // إذا لم يوجد
      return res.status(404).json({ error: 'الجدول غير موجود.' });
    }

    const safeTableName = quoteIdentifier(tableName);  // آمّن اسم الجدول
    const infoRows = await runAll(`PRAGMA table_info(${safeTableName})`);  // جلب معلومات الأعمدة
    const columns = infoRows.map((c) => c.name);  // استخرج أسماء الأعمدة
    const rows = await runAll(`SELECT * FROM ${safeTableName}`);  // جلب كل الصفوف

    return res.json({
      columns,      // أسماء الأعمدة
      rows,         // البيانات
      createSql: exists.sql || '',  // استعلام إنشاء الجدول
    });
  } catch (err) {
    return res.status(500).json({  // في حالة خطأ
      error: 'حدث خطأ أثناء جلب بيانات الجدول.',
      details: err.message,
    });
  }
});

app.use((req, res) => {
  // معالج 404 – أي مسار غير معروف
  res.status(404).json({ error: 'المسار غير موجود.' });
});

const DB_PATH = resolveDbPath();  // حدد مسار قاعدة البيانات
db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  // افتح قاعدة البيانات بوضع القراءة فقط (لا تسمح بالتعديل)
  if (err) {
    console.error('تعذر الاتصال بقاعدة البيانات (READONLY):', err.message);
    process.exit(1);  // أنهِ البرنامج إذا فشل الاتصال
  }

  console.log(`تم الاتصال بقاعدة البيانات بوضع القراءة فقط: ${DB_PATH}`);
  app.listen(PORT, () => {
    console.log(`SQLite Database Viewer يعمل على http://localhost:${PORT}`);  // أبلغ أن الخادم يعمل
  });
});

process.on('SIGINT', () => {
  // عند الضغط على Ctrl+C أغلق قاعدة البيانات بشكل نظيف
  db.close(() => {
    process.exit(0);  // أنهِ البرنامج
  });
});
