# Small helper script to initialize accounting tables by executing the SQL file
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'green_economy.db')
SQL_FILE = os.path.join(os.path.dirname(__file__), '..', 'database', 'accounting_schema.sql')

if __name__ == '__main__':
    if not os.path.exists(DB_PATH):
        print('Database file not found:', DB_PATH)
    else:
        with open(SQL_FILE, 'r', encoding='utf-8') as f:
            sql = f.read()
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.executescript(sql)
            conn.commit()
            print('Accounting tables initialized in', DB_PATH)
        finally:
            conn.close()
