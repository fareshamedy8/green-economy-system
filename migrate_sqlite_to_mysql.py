# -*- coding: utf-8 -*-
"""
سكريبت نقل البيانات من نسخة احتياطية SQLite (.db) إلى قاعدة بيانات MySQL (Aiven)
--------------------------------------------------------------------------------
طريقة الاستخدام:
1) حط الملف ده جوه مجلد المشروع بتاعك (green-economy-system)
2) اتأكد إن ملف .env عندك فيه DATABASE_URL بيشاور على MySQL بتاعك على Aiven
3) شغّل من الترمينال:
   python migrate_sqlite_to_mysql.py "green_economy_backup_20260623_134411.db"

السكريبت بيقرأ الباسورد وبيانات الاتصال من .env على جهازك فقط، ومفيش أي بيانات
حساسة بترسل لأي حد.
"""

import sys
import os
import sqlite3
from urllib.parse import urlparse, unquote
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
if not DATABASE_URL:
    print('[ERROR] DATABASE_URL مش موجود في .env — اتأكد إنه مضاف زي المستخدم على Vercel.')
    sys.exit(1)

try:
    import pymysql
except ImportError:
    print('[ERROR] مكتبة PyMySQL مش مثبتة. شغّل: pip install pymysql cryptography')
    sys.exit(1)

if len(sys.argv) < 2:
    print('طريقة الاستخدام: python migrate_sqlite_to_mysql.py path/to/backup.db')
    sys.exit(1)

SQLITE_PATH = sys.argv[1]
if not os.path.exists(SQLITE_PATH):
    print(f'[ERROR] الملف غير موجود: {SQLITE_PATH}')
    sys.exit(1)

# ── الاتصال بـ MySQL ─────────────────────────────────────────────
parsed = urlparse(DATABASE_URL)
mysql_conn = pymysql.connect(
    host=parsed.hostname,
    port=parsed.port or 3306,
    user=unquote(parsed.username) if parsed.username else 'root',
    password=unquote(parsed.password) if parsed.password else '',
    database=(parsed.path or '').lstrip('/'),
    ssl={'ssl': {}},  # Aiven بيطلب اتصال مشفّر
    cursorclass=pymysql.cursors.DictCursor,
)
mysql_cur = mysql_conn.cursor()

# ── الاتصال بـ SQLite ────────────────────────────────────────────
sq_conn = sqlite3.connect(SQLITE_PATH)
sq_conn.row_factory = sqlite3.Row
sq_cur = sq_conn.cursor()

print(f'[+] هتم نقل البيانات من: {SQLITE_PATH}')
print(f'[+] إلى قاعدة MySQL: {parsed.hostname}')
confirm = input('اكتب "yes" للمتابعة (هيتم إضافة البيانات فوق الموجود حاليًا): ').strip().lower()
if confirm != 'yes':
    print('تم الإلغاء.')
    sys.exit(0)

TABLES = ['users', 'institutions', 'settings', 'audit_log']

total_inserted = 0
for table in TABLES:
    try:
        sq_cur.execute(f'SELECT * FROM {table}')
    except sqlite3.OperationalError:
        print(f'  - تخطي {table} (غير موجود في ملف SQLite)')
        continue

    rows = sq_cur.fetchall()
    if not rows:
        print(f'  - {table}: مفيش بيانات')
        continue

    columns = rows[0].keys()
    col_list = ', '.join(f'`{c}`' for c in columns)
    placeholders = ', '.join(['%s'] * len(columns))
    update_clause = ', '.join(f'`{c}`=VALUES(`{c}`)' for c in columns if c != 'id')

    sql = f'INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {update_clause}'

    count = 0
    for row in rows:
        values = [row[c] for c in columns]
        try:
            mysql_cur.execute(sql, values)
            count += 1
        except Exception as e:
            print(f'    [!] تخطي صف بسبب خطأ: {e}')

    mysql_conn.commit()
    total_inserted += count
    print(f'  - {table}: تم نقل {count} صف')

print(f'\n[✓] تم الانتهاء. إجمالي الصفوف المنقولة: {total_inserted}')

mysql_cur.close()
mysql_conn.close()
sq_conn.close()
