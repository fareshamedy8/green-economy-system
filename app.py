import sys   # لإدارة مسارات Python وإنهاء البرنامج
import os    # للتعامل مع الملفات والمسارات ومتغيرات البيئة
from urllib.parse import urlparse, unquote

# ── إضافة مسار المكتبات المحلية تلقائياً عند تشغيل الملف مباشرةً ──────────
_base_dir = os.path.dirname(os.path.abspath(__file__))          # مسار المجلد الذي يوجد فيه app.py
_local_sp = os.path.join(_base_dir, 'python', 'Lib', 'site-packages')  # مسار المكتبات المحلية المرفقة مع المشروع
if os.path.isdir(_local_sp) and _local_sp not in sys.path:      # إذا كان المجلد موجوداً ولم يُضَف بعد
    sys.path.insert(0, _local_sp)                               # أضفه في أول قائمة مسارات Python

try:
    from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash, g, send_from_directory
    # ↑ استيراد أدوات Flask الأساسية: الإطار - تصيير HTML - الطلب - JSON - إعادة التوجيه - الرابط - الجلسة - الفلاش - السيا[...]
    from werkzeug.security import generate_password_hash, check_password_hash  # لتشفير كلمات المرور والتحقق منها
    from functools import wraps      # للحفاظ على اسم الدالة عند استخدام المُزخرفات (decorators)
    from dotenv import load_dotenv   # لتحميل متغيرات البيئة من ملف .env
except ImportError as e:
    print(f'\n[ERROR] مكتبة ناقصة: {e}')  # طباعة اسم المكتبة الناقصة
    print('       شغّل التطبيق من run.bat أو ثبّت المكتبات: pip install -r requirements.txt')
    input('\nاضغط Enter للإغلاق ...')      # توقف حتى يقرأ المستخدم الرسالة
    sys.exit(1)

import sqlite3              # للتعامل مع قاعدة بيانات SQLite المدمجة في Python
import io                   # للتعامل مع البيانات في الذاكرة كملفات وهمية (للـ PDF والـ Excel)
import datetime             # للحصول على التاريخ والوقت الحالي
import time                 # للحصول على الوقت بالثواني (مستخدم في Rate Limiting)
import shutil               # لنسخ ونقل الملفات (للنسخ الاحتياطية)
from collections import defaultdict  # قاموس يعطي قيمة افتراضية إذا لم يوجد المفتاح (مستخدم في Rate Limiting)

load_dotenv()  # تحميل متغيرات البيئة من ملف .env الموجود في نفس المجلد

app = Flask(__name__)  # إنشاء تطبيق Flask وتحديد اسمه من اسم الملف الحالي
app.secret_key = os.environ.get('SECRET_KEY', 'green-economy-secret-key-2024')
# ↑ المفتاح السري لتشفير الجلسات – يُقرأ من .env وإلا يستخدم القيمة الافتراضية

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'green_economy.db')  # المسار الكامل لملف قاعدة البيانات
CARBON_ALERT_THRESHOLD = float(os.environ.get('CARBON_ALERT_THRESHOLD', '1000'))  # الحد الافتراضي للتنبيه على انبعاثات الكربون (1000 طن)

# ── إعدادات البريد الإلكتروني ──────────────────────────────────────────────
MAIL_ENABLED  = os.environ.get('MAIL_ENABLED', 'false').lower() == 'true'  # هل إرسال البريد مفعّل؟ (true/false)
MAIL_SERVER   = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')            # عنوان خادم البريد الصادر
MAIL_PORT     = int(os.environ.get('MAIL_PORT', '587'))                    # منفذ خادم البريد (587 للـ TLS)
MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')                        # البريد الإلكتروني المُرسِل
MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')                        # كلمة مرور البريد المُرسِل
MAIL_TO       = os.environ.get('MAIL_TO', '')                              # البريد الإلكتروني المُستقبِل للتنبيهات

# ── قاعدة البيانات: SQLite أو PostgreSQL أو MySQL/MariaDB ─────────────────
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
_db_scheme = ''
if DATABASE_URL:
    try:
        _db_scheme = urlparse(DATABASE_URL).scheme.split('+', 1)[0].lower()
    except Exception as _url_err:
        print(f'[ERROR] DATABASE_URL غير صالح: {_url_err}')
        _db_scheme = ''
USE_POSTGRES = _db_scheme in ('postgres', 'postgresql')
USE_MYSQL = _db_scheme in ('mysql', 'mariadb')
USE_SQLITE = not (USE_POSTGRES or USE_MYSQL)
DB_TYPE_LABEL = 'PostgreSQL' if USE_POSTGRES else 'MySQL/MariaDB' if USE_MYSQL else 'SQLite'
SETTINGS_KEY_COL = 'setting_key' if USE_MYSQL else 'key'

# إذا تم اختيار PostgreSQL وتوصيلة DATABASE_URL لا تحتوي على sslmode فاضفها تلقائياً (مفيد لربط Supabase)
if USE_POSTGRES and DATABASE_URL:
    lower = DATABASE_URL.lower()
    if 'sslmode=' not in lower and 'ssl=true' not in lower and 'sslmode' not in lower:
        # أضف ? أو & حسب وجود query string
        if '?' in DATABASE_URL:
            DATABASE_URL = DATABASE_URL + '&sslmode=require'
        else:
            DATABASE_URL = DATABASE_URL + '?sslmode=require'
        print('[INFO] تمت إضافة sslmode=require تلقائياً إلى DATABASE_URL لتوافق Supabase/Postgres')


# ════════════════════════════════════════════════════════════════��[...]
# اتصال قاعدة البيانات (SQLite / PostgreSQL / MySQL)
# ════════════════════════════════════════════════════════════════��[...]

if USE_POSTGRES:  # إذا كان المشروع مضبوطاً على PostgreSQL
    import psycopg
    from psycopg.rows import dict_row

    def get_db():
        """ يُرجع اتصال PostgreSQL الخاص بالطلب الحالي """
        if 'db' not in g:  # إذا لم يكن هناك اتصال مفتوح في هذا الطلب
            try:
                # psycopg.connect يقبل سلسلة الاتصال (DSN). Supabase يتطلب SSL غالبًا.
                g.db = psycopg.connect(DATABASE_URL)
                g.db.autocommit = False  # عطّل autocommit حتى نتحكم يدوياً في الحفظ
            except Exception as e:
                print(f"[ERROR] فشل الاتصال بPostgreSQL: {e}")
                # اطرح الخطأ ليظهر في لوجات الخادم — نريد فشل واضح في حالة إعدادات بيئة خاطئة
                raise
        return g.db  # أرجع الاتصال المخزّن في g (سياق الطلب)

    @app.teardown_appcontext          # تُنفّذ تلقائياً بعد انتهاء كل طلب HTTP
    def close_db(exc=None):
        db = g.pop('db', None)  # اسحب الاتصال من سياق الطلب
        if db:  # إذا كان مفتوحاً
            db.close()  # أغلقه لتحرير الموارد

    def query(sql, params=(), one=False):
        """ تنفيذ استعلام SELECT وإرجاع النتائج """
        sql = sql.replace('?', '%s').replace("datetime('now')", 'NOW()')  # تحويل صيغة SQLite إلى PostgreSQL
        cur = get_db().cursor(row_factory=dict_row)  # cursor يُرجع كل صف كقاموس
        cur.execute(sql, params)  # تنفيذ الاستعلام
        rows = cur.fetchall()     # جلب كل الصفوف
        return (rows[0] if rows else None) if one else rows  # إذا one=True أرجع صفاً واحداً فقط

    def execute(sql, params=()):
        """ تنفيذ استعلام INSERT/UPDATE/DELETE """
        sql = sql.replace('?', '%s').replace("datetime('now')", 'NOW()')  # تحويل الصيغة
        db = get_db()        # اجلب اتصال قاعدة البيانات
        cur = db.cursor()    # افتح cursor
        cur.execute(sql, params)  # تنفيذ الاستعلام
        db.commit()          # حفظ التغييرات في قاعدة البيانات
        return cur           # أرجع الـ cursor (المستدعي يقدر يتحقق من lastrowid)

    def init_db():
        """ إنشاء الجداول في PostgreSQL إذا لم تكن موجودة """
        try:
            db = psycopg.connect(DATABASE_URL)  # اتصال مباشر لإنشاء الجداول
            cur = db.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id            SERIAL PRIMARY KEY,
                    username      TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role          TEXT NOT NULL DEFAULT 'viewer',
                    created_at    TIMESTAMP DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS institutions (
                    id                          SERIAL PRIMARY KEY,
                    name                        TEXT    NOT NULL,
                    year                        INTEGER NOT NULL,
                    energy_consumption          REAL    NOT NULL,
                    renewable_energy_percentage REAL    NOT NULL,
                    carbon_emissions            REAL    NOT NULL,
                    green_projects              INTEGER NOT NULL DEFAULT 0,
                    water_usage                 REAL    NOT NULL DEFAULT 0,
                    waste_recycling_percentage  REAL    NOT NULL DEFAULT 0,
                    created_at  TIMESTAMP DEFAULT NOW(),
                    updated_at  TIMESTAMP DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS settings (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS audit_log (
                    id         SERIAL PRIMARY KEY,
                    username   TEXT    NOT NULL,
                    action     TEXT    NOT NULL,
                    details    TEXT    DEFAULT '',
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """)
            db.commit()   # حفظ إنشاء الجداول
            db.close()    # أغلق الاتصال بعد الإنشاء
        except Exception as e:
            print(f"[ERROR] init_db() فشل أثناء إنشاء الجداول على Postgres: {e}")
            raise

elif USE_MYSQL:  # إذا كان المشروع مضبوطاً على MySQL/MariaDB
    import pymysql
    import pymysql.cursors

    _MYSQL_CFG = None

    def _parse_mysql_url(url):
        parsed = urlparse(url)
        db_name = (parsed.path or '').lstrip('/')
        if not db_name:
            raise ValueError('DATABASE_URL يجب أن يحتوي على اسم قاعدة البيانات')
        return {
            'host': parsed.hostname or 'localhost',
            'user': unquote(parsed.username) if parsed.username else 'root',
            'password': unquote(parsed.password) if parsed.password else '',
            'database': db_name,
            'port': parsed.port or 3306,
            'charset': 'utf8mb4',
            'cursorclass': pymysql.cursors.DictCursor,
        }

    def _get_mysql_config():
        global _MYSQL_CFG
        if _MYSQL_CFG is None:
            _MYSQL_CFG = _parse_mysql_url(DATABASE_URL)
        return dict(_MYSQL_CFG)

    def _ensure_mysql_database():
        cfg = _get_mysql_config()
        db_name = cfg.get('database')
        server_cfg = {k: v for k, v in cfg.items() if k != 'database'}
        db = pymysql.connect(**server_cfg)
        cur = db.cursor()
        cur.execute(
            f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"
        )
        db.commit()
        db.close()

    def get_db():
        """ يُرجع اتصال MySQL الخاص بالطلب الحالي """
        if 'db' not in g:
            cfg = _get_mysql_config()
            g.db = pymysql.connect(**cfg)
            g.db.autocommit(False)
        return g.db

    @app.teardown_appcontext          # تُنفّذ تلقائياً بعد انتهاء كل طلب HTTP
    def close_db(exc=None):
        db = g.pop('db', None)  # اسحب الاتصال من سياق الطلب
        if db:  # إذا كان مفتوحاً
            db.close()  # أغلقه لتحرير الموارد

    def query(sql, params=(), one=False):
        """ تنفيذ استعلام SELECT وإرجاع النتائج """
        sql = sql.replace('?', '%s').replace("datetime('now')", 'NOW()')
        cur = get_db().cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        return (rows[0] if rows else None) if one else rows

    def execute(sql, params=()):
        """ تنفيذ استعلام INSERT/UPDATE/DELETE """
        sql = sql.replace('?', '%s').replace("datetime('now')", 'NOW()')
        db = get_db()
        cur = db.cursor()
        cur.execute(sql, params)
        db.commit()
        return cur

    def init_db():
        """ إنشاء الجداول في MySQL إذا لم تكن موجودة """
        _ensure_mysql_database()
        cfg = _get_mysql_config()
        db = pymysql.connect(**cfg)
        cur = db.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                username      VARCHAR(150) NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role          VARCHAR(20) NOT NULL DEFAULT 'viewer',
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS institutions (
                id                          INT AUTO_INCREMENT PRIMARY KEY,
                name                        VARCHAR(255) NOT NULL,
                year                        INT NOT NULL,
                energy_consumption          DOUBLE NOT NULL,
                renewable_energy_percentage DOUBLE NOT NULL,
                carbon_emissions            DOUBLE NOT NULL,
                green_projects              INT NOT NULL DEFAULT 0,
                water_usage                 DOUBLE NOT NULL DEFAULT 0,
                waste_recycling_percentage  DOUBLE NOT NULL DEFAULT 0,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                setting_key VARCHAR(64) PRIMARY KEY,
                value TEXT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                username   VARCHAR(150) NOT NULL,
                action     TEXT NOT NULL,
                details    TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        db.commit()
        db.close()

else:  # وضع SQLite الافتراضي للتشغيل المحلي
    def get_db():
        """ يُرجع اتصال SQLite الخاص بالطلب الحالي """
        if 'db' not in g:  # إذا لم يكن هناك اتصال مفتوح
            g.db = sqlite3.connect(DB_PATH)  # افتح ملف قاعدة البيانات
            g.db.row_factory = sqlite3.Row   # جعل كل صف قابلاً للوصول بالاسم row['column']
            g.db.execute('PRAGMA journal_mode=WAL')  # تفعيل WAL لأداء أفضل عند الكتابة المتزامنة
            g.db.execute('PRAGMA foreign_keys=ON')   # تفعيل قيود المفاتيح الخارجية
        return g.db  # أرجع الاتصال

    @app.teardown_appcontext          # تُنفّذ تلقائياً بعد انتهاء كل طلب
    def close_db(exc=None):
        db = g.pop('db', None)  # اسحب الاتصال من سياق الطلب
        if db:                  # إذا كان مفتوحاً
            db.close()          # أغلقه لتحرير الموارد

    def query(sql, params=(), one=False):
        """ تنفيذ استعلام SELECT وإرجاع النتائج """
        cur = get_db().execute(sql, params)  # تنفيذ استعلام SQL
        rows = cur.fetchall()               # جلب كل الصفوف
        return (rows[0] if rows else None) if one else rows  # إذا one=True أرجع صفاً واحداً فقط

    def execute(sql, params=()):
        """ تنفيذ استعلام INSERT/UPDATE/DELETE """
        db = get_db()        # اجلب اتصال قاعدة البيانات
        cur = db.execute(sql, params)  # تنفيذ الاستعلام
        db.commit()          # حفظ التغييرات
        return cur           # أرجع الـ cursor

    def init_db():
        """ إنشاء ملف SQLite وجداوله إذا لم تكن موجودة """
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)  # أنشئ مجلد database/ إن لم يكن موجوداً
        db = sqlite3.connect(DB_PATH)  # افتح/أنشئ ملف قاعدة البيانات
        db.row_factory = sqlite3.Row   # جعل الصفوف قابلة للوصول بااسم العمود
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL DEFAULT 'viewer',
                created_at    TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS institutions (
                id                          INTEGER PRIMARY KEY AUTOINCREMENT,
                name                        TEXT    NOT NULL,
                year                        INTEGER NOT NULL,
                energy_consumption          REAL    NOT NULL,
                renewable_energy_percentage REAL    NOT NULL,
                carbon_emissions            REAL    NOT NULL,
                green_projects              INTEGER NOT NULL DEFAULT 0,
                water_usage                 REAL    NOT NULL DEFAULT 0,
                waste_recycling_percentage  REAL    NOT NULL DEFAULT 0,
                created_at  TEXT DEFAULT (datetime('now')),
                updated_at  TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT    NOT NULL,
                action     TEXT    NOT NULL,
                details    TEXT    DEFAULT '',
                created_at TEXT    DEFAULT (datetime('now'))
            );
        """)
        db.commit()   # حفظ إنشاء الجداول
        db.close()    # أغلق الاتصال بعد الإنشاء

        # ── Migrations: إضافة أعمدة قد تكون ناقصة في قواعد بيانات قديمة ──
        db = sqlite3.connect(DB_PATH)  # افتح اتصال جديد لتنفيذ الـ Migrations
        existing_cols = {row[1] for row in db.execute('PRAGMA table_info(users)').fetchall()}  # اجلب أسماء الأعمدة الحالية
        if 'role' not in existing_cols:  # إذا لم يكن عمود role موجوداً
            db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'")  # أضف عمود الدور
            db.execute("UPDATE users SET role='admin' WHERE id=(SELECT MIN(id) FROM users)")  # اجعل أول مستخدم مسؤولاً
            db.commit()  # حفظ
        existing_cols = {row[1] for row in db.execute('PRAGMA table_info(institutions)').fetchall()}  # أعمدة جدول institutions
        if 'water_usage' not in existing_cols:  # إذا لم يوجد عمود استهلاك المياه
            db.execute('ALTER TABLE institutions ADD COLUMN water_usage REAL NOT NULL DEFAULT 0')  # أضف العمود
            db.commit()  # حفظ
        if 'waste_recycling_percentage' not in existing_cols:  # إذا لم يوجد عمود نسبة إعادة التدوير
            db.execute('ALTER TABLE institutions ADD COLUMN waste_recycling_percentage REAL NOT NULL DEFAULT 0')  # أضف العمود
            db.commit()  # حفظ
        db.close()  # أغلق الاتصال بعد المـ Migrations


# ── إدارة إعدادات النظام ─────────────────────────────────────────────────[...]
def upsert_setting(key, value):
    """ حفظ إعداد مع دعم لجميع أنواع قواعد البيانات """
    if USE_POSTGRES:
        sql = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value'
    elif USE_MYSQL:
        sql = f'INSERT INTO settings ({SETTINGS_KEY_COL}, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)'
    else:
        sql = 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    execute(sql, (key, value))


# ── حد الكربون الديناميكي وسجل التدقيق ─────────────────────────────────────
def get_carbon_threshold():
    """يقرأ حد انبعاثات الكربون من إعدادات قاعدة البيانات """
    try:
        row = query(f'SELECT value FROM settings WHERE {SETTINGS_KEY_COL}=?', ('carbon_threshold',), one=True)  # ابحث عن الحد في جدول settings
        if row and row['value']:       # إذا وُجدت قيمة
            return float(row['value'])  # أرجعها كرقم
    except Exception:
        pass  # تجاهل أي خطأ
    return CARBON_ALERT_THRESHOLD  # أرجع القيمة الافتراضية


def log_audit(action, details=''):
    """يُسجِّل عملية في سجل التدقيق"""
    try:
        username = session.get('username', 'system')
        execute('INSERT INTO audit_log (username, action, details) VALUES (?,?,?)',
                (username, action, details))
    except Exception:
        pass

# (باقي الملف لم يتغير)
