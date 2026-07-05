from flask import Blueprint, request, jsonify, current_app, render_template
from . import db
from .models import Account, Transaction, Entry, Journal
from decimal import Decimal
from datetime import date, datetime

bp = Blueprint('accounting_routes', __name__)

# expose the blueprint object expected by package-level init
accounting_bp = bp

@bp.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'module': 'accounting'})

@bp.route('/', methods=['GET'])
def ui_index():
    """Serve the simple single-page frontend for the accounting module."""
    return render_template('accounting/index.html')

@bp.route('/accounts', methods=['GET'])
def list_accounts():
    q = Account.query.order_by(Account.code).all()
    result = []
    for a in q:
        result.append({
            'id': a.id,
            'code': a.code,
            'name': a.name,
            'type': a.type,
            'parent_id': a.parent_id,
            'currency': a.currency,
            'is_active': bool(a.is_active),
            'created_at': a.created_at.isoformat() if a.created_at else None,
        })
    return jsonify(result)

@bp.route('/accounts', methods=['POST'])
def create_account():
    payload = request.get_json() or {}
    code = payload.get('code')
    name = payload.get('name')
    type_ = payload.get('type', 'asset')
    parent_id = payload.get('parent_id')
    currency = payload.get('currency')
    is_active = bool(payload.get('is_active', True))
    if not code or not name:
        return jsonify({'error': 'code and name required'}), 400
    if Account.query.filter_by(code=code).first():
        return jsonify({'error': 'account code already exists'}), 400
    acc = Account(code=code, name=name, type=type_, parent_id=parent_id, currency=currency, is_active=is_active)
    db.session.add(acc)
    db.session.commit()
    return jsonify({'id': acc.id}), 201

@bp.route('/transactions', methods=['POST'])
def create_transaction():
    data = request.get_json() or {}
    journal_id = data.get('journal_id')
    tx_date = data.get('date')
    if tx_date:
        try:
            tx_date = datetime.fromisoformat(tx_date).date()
        except Exception:
            try:
                tx_date = datetime.strptime(tx_date, '%Y-%m-%d').date()
            except Exception:
                return jsonify({'error': 'invalid date format'}), 400
    else:
        tx_date = date.today()
    description = data.get('description', '')
    reference = data.get('reference')
    entries = data.get('entries', [])

    if not isinstance(entries, list) or len(entries) == 0:
        return jsonify({'error': 'entries list required'}), 400

    total_debit = sum(Decimal(str(e.get('debit', 0) or 0)) for e in entries)
    total_credit = sum(Decimal(str(e.get('credit', 0) or 0)) for e in entries)
    if total_debit != total_credit:
        return jsonify({'error': 'transaction not balanced', 'debit': str(total_debit), 'credit': str(total_credit)}), 400

    try:
        tx = Transaction(journal_id=journal_id, date=tx_date, description=description, reference=reference, created_by=current_app.config.get('DEFAULT_USER','system'))
        db.session.add(tx)
        db.session.flush()
        for e in entries:
            acc_id = e.get('account_id')
            debit = Decimal(str(e.get('debit', 0) or 0))
            credit = Decimal(str(e.get('credit', 0) or 0))
            en = Entry(transaction_id=tx.id, account_id=acc_id, debit=debit, credit=credit, currency=e.get('currency'), amount_currency=e.get('amount_currency'))
            db.session.add(en)
        db.session.commit()
        return jsonify({'transaction_id': tx.id}), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 500

@bp.route('/trial-balance', methods=['GET'])
def trial_balance():
    # aggregate debits/credits per account
    rows = db.session.query(
        Account.id.label('account_id'),
        Account.code, Account.name,
        db.func.coalesce(db.func.sum(Entry.debit), 0).label('total_debit'),
        db.func.coalesce(db.func.sum(Entry.credit), 0).label('total_credit')
    ).outerjoin(Entry, Entry.account_id == Account.id).group_by(Account.id, Account.code, Account.name).order_by(Account.code).all()

    result = []
    for r in rows:
        result.append({
            'account_id': r.account_id,
            'code': r.code,
            'name': r.name,
            'total_debit': str(r.total_debit),
            'total_credit': str(r.total_credit),
        })
    return jsonify(result)
