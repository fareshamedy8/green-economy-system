from flask import Blueprint, request, jsonify
import json

from typing import List

# import the main app module (app.execute, app.query, app.log_audit)
import app as main_app

accounting_bp = Blueprint('accounting', __name__)

@accounting_bp.route('/accounts', methods=['GET'])
def list_accounts():
    try:
        rows = main_app.query('SELECT * FROM accounts ORDER BY code')
        result = [dict(r) for r in rows]
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@accounting_bp.route('/accounts', methods=['POST'])
def create_account():
    payload = request.get_json() or {}
    code = payload.get('code')
    name = payload.get('name')
    type_ = payload.get('type', 'asset')
    parent_id = payload.get('parent_id')
    currency = payload.get('currency')
    is_active = 1 if payload.get('is_active', True) else 0
    if not code or not name:
        return jsonify({'error': 'code and name required'}), 400
    try:
        cur = main_app.execute(
            'INSERT INTO accounts (code, name, type, parent_id, currency, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))',
            (code, name, type_, parent_id, currency, is_active),
        )
        main_app.log_audit('create_account', f'{code} - {name}')
        return jsonify({'id': getattr(cur, 'lastrowid', None) or None}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@accounting_bp.route('/transactions', methods=['POST'])
def create_transaction():
    data = request.get_json() or {}
    journal_id = data.get('journal_id')
    date = data.get('date') or datetime_now_sql()
    description = data.get('description', '')
    reference = data.get('reference')
    entries = data.get('entries', [])

    if not isinstance(entries, list) or len(entries) == 0:
        return jsonify({'error': 'entries list required'}), 400

    # validate sums
    total_debit = sum(float(e.get('debit', 0) or 0) for e in entries)
    total_credit = sum(float(e.get('credit', 0) or 0) for e in entries)
    if round(total_debit - total_credit, 6) != 0:
        return jsonify({'error': 'transaction not balanced', 'debit': total_debit, 'credit': total_credit}), 400

    try:
        # insert transaction
        cur = main_app.execute(
            "INSERT INTO transactions (journal_id, date, description, reference, created_by, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
            (journal_id, date, description, reference, main_app.session.get('username', 'system')),
        )
        tx_id = getattr(cur, 'lastrowid', None)
        # For Postgres/PyMySQL lastrowid differs; fetch last inserted id if None
        if tx_id is None:
            # try to fetch by row_unique combination - fallback
            rows = main_app.query('SELECT id FROM transactions WHERE reference=? ORDER BY created_at DESC', (reference,), one=True)
            tx_id = rows['id'] if rows else None

        for e in entries:
            acc = e.get('account_id')
            debit = float(e.get('debit', 0) or 0)
            credit = float(e.get('credit', 0) or 0)
            main_app.execute(
                'INSERT INTO entries (transaction_id, account_id, debit, credit, currency, amount_currency, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))',
                (tx_id, acc, debit, credit, e.get('currency'), e.get('amount_currency')),
            )

        main_app.log_audit('create_transaction', f'tx:{tx_id} desc:{description}')
        return jsonify({'transaction_id': tx_id}), 201
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500

@accounting_bp.route('/trial-balance', methods=['GET'])
def trial_balance():
    date = request.args.get('date')
    try:
        # simple trial balance up to date
        sql = """
        SELECT a.id as account_id, a.code, a.name,
            COALESCE(SUM(e.debit),0) as total_debit,
            COALESCE(SUM(e.credit),0) as total_credit
        FROM accounts a
        LEFT JOIN entries e ON e.account_id = a.id
        GROUP BY a.id, a.code, a.name
        ORDER BY a.code
        """
        rows = main_app.query(sql)
        result = [dict(r) for r in rows]
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def datetime_now_sql():
    # return SQL-friendly current datetime for inserts when needed
    import datetime
    return datetime.datetime.utcnow().isoformat()
