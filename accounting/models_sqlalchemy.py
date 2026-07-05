from .db import db

class Account(db.Model):
    __tablename__ = 'accounts'
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(64), unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(32), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('accounts.id'), nullable=True)
    is_active = db.Column(db.Boolean, default=True)

    parent = db.relationship('Account', remote_side=[id], backref='children')

    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'type': self.type,
            'parent_id': self.parent_id,
            'is_active': self.is_active,
        }


class Party(db.Model):
    __tablename__ = 'parties'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    party_type = db.Column(db.String(32), nullable=False, default='customer')
    contact_info = db.Column(db.Text)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'party_type': self.party_type, 'contact_info': self.contact_info}


class JournalEntry(db.Model):
    __tablename__ = 'journal_entries'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    reference = db.Column(db.String(255))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())

    lines = db.relationship('JournalLine', backref='journal', cascade='all, delete-orphan')

    def to_dict(self):
        return {'id': self.id, 'date': self.date.isoformat(), 'reference': self.reference, 'description': self.description, 'created_at': self.created_at}


class JournalLine(db.Model):
    __tablename__ = 'journal_lines'
    id = db.Column(db.Integer, primary_key=True)
    journal_id = db.Column(db.Integer, db.ForeignKey('journal_entries.id'), nullable=False)
    account_id = db.Column(db.Integer, db.ForeignKey('accounts.id'), nullable=False)
    debit = db.Column(db.Numeric(14,2), default=0)
    credit = db.Column(db.Numeric(14,2), default=0)
    party_id = db.Column(db.Integer, db.ForeignKey('parties.id'))
    description = db.Column(db.Text)

    account = db.relationship('Account')
    party = db.relationship('Party')

    def to_dict(self):
        return {'id': self.id, 'journal_id': self.journal_id, 'account_id': self.account_id, 'debit': float(self.debit), 'credit': float(self.credit), 'party_id': self.party_id, 'description': self.description}
