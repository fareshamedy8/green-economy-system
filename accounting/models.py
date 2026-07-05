from datetime import datetime
from . import db

class Account(db.Model):
    __tablename__ = 'accounts'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(128), unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(64), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('accounts.id'), nullable=True)
    currency = db.Column(db.String(8), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    parent = db.relationship('Account', remote_side=[id], backref='children')

class Journal(db.Model):
    __tablename__ = 'journals'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Transaction(db.Model):
    __tablename__ = 'transactions'

    id = db.Column(db.Integer, primary_key=True)
    journal_id = db.Column(db.Integer, db.ForeignKey('journals.id'), nullable=True)
    date = db.Column(db.Date, nullable=False)
    description = db.Column(db.Text)
    reference = db.Column(db.String(255))
    created_by = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    journal = db.relationship('Journal', backref='transactions')
    entries = db.relationship('Entry', backref='transaction', cascade='all, delete-orphan')

class Entry(db.Model):
    __tablename__ = 'entries'

    id = db.Column(db.Integer, primary_key=True)
    transaction_id = db.Column(db.Integer, db.ForeignKey('transactions.id'), nullable=False)
    account_id = db.Column(db.Integer, db.ForeignKey('accounts.id'), nullable=False)
    debit = db.Column(db.Numeric, default=0, nullable=False)
    credit = db.Column(db.Numeric, default=0, nullable=False)
    currency = db.Column(db.String(8), nullable=True)
    amount_currency = db.Column(db.Numeric, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    account = db.relationship('Account', backref='entries')

class Party(db.Model):
    __tablename__ = 'parties'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(64), nullable=False)
    contact = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Invoice(db.Model):
    __tablename__ = 'invoices'

    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(128), unique=True, nullable=False)
    date = db.Column(db.Date, nullable=False)
    due_date = db.Column(db.Date, nullable=True)
    party_id = db.Column(db.Integer, db.ForeignKey('parties.id'), nullable=True)
    total_amount = db.Column(db.Numeric, nullable=False)
    tax_amount = db.Column(db.Numeric, default=0, nullable=False)
    status = db.Column(db.String(64), default='draft', nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    party = db.relationship('Party', backref='invoices')

class TaxRate(db.Model):
    __tablename__ = 'tax_rates'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    percent = db.Column(db.Numeric, nullable=False)

class Currency(db.Model):
    __tablename__ = 'currencies'

    code = db.Column(db.String(8), primary_key=True)
    name = db.Column(db.String(255))
    rate_to_base = db.Column(db.Numeric, default=1)
