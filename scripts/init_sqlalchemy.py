# Minimal script to initialize SQLAlchemy models (create_all) and optionally seed COA

import os
import sys
from importlib import import_module

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

app_mod = import_module('app')
flask_app = getattr(app_mod, 'app', None)
if flask_app is None:
    raise RuntimeError('Could not find Flask app object in app.py (expected variable `app`)')

from accounting import init_app, db
from accounting.models import Account


def seed_chart_of_accounts():
    # basic 5-group chart seed
    coa = [
        ('1000', 'Cash', 'asset'),
        ('1100', 'Bank', 'asset'),
        ('2000', 'Accounts Payable', 'liability'),
        ('3000', 'Equity', 'equity'),
        ('4000', 'Revenue', 'revenue'),
        ('5000', 'Expenses', 'expense'),
    ]
    for code, name, t in coa:
        if not Account.query.filter_by(code=code).first():
            a = Account(code=code, name=name, type=t)
            db.session.add(a)
    db.session.commit()


with flask_app.app_context():
    init_app(flask_app)
    db.create_all()
    seed_chart_of_accounts()
    print('[OK] SQLAlchemy models created and seeded (if not present)')
