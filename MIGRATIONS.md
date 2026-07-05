SQLAlchemy and migration requirements for the accounting module.

Install with:

    pip install -r requirements-accounting.txt

Files added:
- accounting/db.py        -> SQLAlchemy init helper
- accounting/models_sqlalchemy.py -> SQLAlchemy models for Account/Party/JournalEntry/JournalLine

Next steps:
- Run scripts/init_sqlalchemy.py to create tables (for SQLite).
- Consider adding Flask-Migrate / Alembic for production migrations.
