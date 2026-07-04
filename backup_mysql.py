# -*- coding: utf-8 -*-
"""
سكريبت أخذ نسخة احتياطية من قاعدة بيانات MySQL (Aiven) وحفظها كملف JSON على جهازك
--------------------------------------------------------------------------------
طريقة الاستخدام:
1) حط الملف ده جوه مجلد المشروع بتاعك (green-economy-system)
2) اتأكد إن ملف .env عندك فيه DATABASE_URL بيشاور على MySQL بتاعك على Aiven
3) شغّل من الترمينال:
   python backup_mysql.py

هيتحفظلك ملف زي: green_economy_backup_20260703_161200.json
جوه نفس المجلد، وفيه كل بيانات الجداول (users, institutions, settings, audit_log).

ملحوظة: كلمات المرور المُشفّرة (password_hash) بتترحّل زي ما هي، عشان لو
عايز تستعيد النسخة تقدر تسجّل دخول بنفس الباسورد القديم من غير ما يتغير.
"""

import os
import json
import datetime
from urllib.parse import urlparse, unquote
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
if not DATABASE_URL:
    print('[ERROR] DATABASE_URL مش موجود في .env')
    raise SystemExit(1)

try:
    import pymysql
except ImportError:
    print('[ERROR] مكتبة PyMySQL مش مثبتة. شغّل: pip install pymysql cryptography')
    raise SystemExit(1)

parsed = urlparse(DATABASE_URL)
conn = pymysql.connect(
    host=parsed.hostname,
    port=parsed.port or 3306,
    user=unquote(parsed.username) if parsed.username else 'root',
    password=unquote(parsed.password) if parsed.password else '',
    database=(parsed.path or '').lstrip('/'),
    ssl={'ssl': {}},  # Aiven بيطلب اتصال مشفّر
    cursorclass=pymysql.cursors.DictCursor,
)
cur = conn.cursor()

TABLES = ['users', 'institutions', 'settings', 'audit_log']

backup_data = {
    'created_at': datetime.datetime.now().isoformat(),
    'source': 'mysql',
    'tables': {}
}

total_rows = 0
for table in TABLES:
    try:
        cur.execute(f'SELECT * FROM `{table}`')
        rows = cur.fetchall()
    except Exception as e:
        print(f'  - تخطي {table} (خطأ: {e})')
        continue

    # تحويل أي قيم تاريخ/وقت لنص عشان JSON يقدر يحفظها
    clean_rows = []
    for row in rows:
        clean_row = {}
        for k, v in row.items():
            if isinstance(v, (datetime.datetime, datetime.date)):
                clean_row[k] = v.isoformat()
            else:
                clean_row[k] = v
        clean_rows.append(clean_row)

    backup_data['tables'][table] = clean_rows
    total_rows += len(clean_rows)
    print(f'  - {table}: {len(clean_rows)} صف')

cur.close()
conn.close()

timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
filename = f'green_economy_backup_{timestamp}.json'

# ── الحفظ في مجلد التحميلات (Downloads) بدل مجلد المشروع ──
downloads_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
os.makedirs(downloads_dir, exist_ok=True)  # لو مش موجود لأي سبب، أنشئه
filepath = os.path.join(downloads_dir, filename)

with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(backup_data, f, ensure_ascii=False, indent=2)

print(f'\n[✓] تم حفظ النسخة الاحتياطية في: {filepath}')
print(f'[✓] إجمالي الصفوف المحفوظة: {total_rows}')
