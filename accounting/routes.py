from flask import Blueprint, request, jsonify
from datetime import datetime

bp = Blueprint('accounting', __name__)

# Import DB helpers from main app
try:
    from app import query, execute, login_required, role_required, log_audit
except Exception:
    # If import fails (during tests), define stubs to avoid hard crash
    def query(*a, **k):
        return []
    def execute(*a, **k):
        return None
    def login_required(f):
        return f
    def role_required(*r):
        def dec(f):
            return f
        return dec
    def log_audit(action, details=''):
        pass


@bp.route('/accounts', methods=['GET'])
@login_required
def get_accounts():
    rows = query('SELECT id, code, name, type, parent_id, is_active FROM accounts ORDER BY code')
    return jsonify([dict(r) for r in rows])


@bp.route('/accounts', methods=['POST'])
@login_required
@role_required('admin', 'user')
def add_account():
    data = request.get_json(silent=True) or {}
    code = str(data.get('code','')).strip()
    name = str(data.get('name','')).strip()
    atype = str(data.get('type','')).strip()
    parent = data.get('parent_id')
    if not code or not name or atype not in ('Asset','Liability','Equity','Revenue','Expense'):
        return jsonify({'error':'بيانات حساب غير صالحة'}), 400
    # check duplicate code
    if query('SELECT id FROM accounts WHERE code=?', (code,), one=True):
        return jsonify({'error':'كود الحساب موجود بالفعل'}), 409
    cur = execute('INSERT INTO accounts (code,name,type,parent_id,is_active) VALUES (?,?,?,?,?)', (code,name,atype,parent or None,1))
    account = dict(query('SELECT * FROM accounts WHERE id=?', (cur.lastrowid,), one=True)) if cur is not None else {'code':code,'name':name}
    log_audit('Add account', f'{code} - {name}')
    return jsonify({'message':'تم إنشاء الحساب','data':account}), 201


@bp.route('/parties', methods=['GET'])
@login_required
def get_parties():
    rows = query('SELECT id, name, party_type, contact_info FROM parties ORDER BY name')
    return jsonify([dict(r) for r in rows])


@bp.route('/parties', methods=['POST'])
@login_required
@role_required('admin','user')
def add_party():
    data = request.get_json(silent=True) or {}
    name = str(data.get('name','')).strip()
    ptype = str(data.get('party_type','customer')).strip()
    contact = str(data.get('contact_info','')).strip()
    if not name:
        return jsonify({'error':'اسم الطرف مطلوب'}), 400
    cur = execute('INSERT INTO parties (name, party_type, contact_info) VALUES (?,?,?)', (name, ptype, contact))
    party = dict(query('SELECT * FROM parties WHERE id=?', (cur.lastrowid,), one=True)) if cur is not None else {'name':name}
    log_audit('Add party', f'{name} ({ptype})')
    return jsonify({'message':'تم إنشاء الطرف','data':party}), 201


@bp.route('/journal-entries', methods=['POST'])
@login_required
@role_required('admin','user')
def add_journal_entry():
    data = request.get_json(silent=True) or {}
    date = data.get('date') or datetime.now().strftime('%Y-%m-%d')
    reference = data.get('reference','')
    description = data.get('description','')
    lines = data.get('lines') or []
    if not lines or not isinstance(lines, list):
        return jsonify({'error':'القيود غير صالحة'}), 400
    total_debit = 0.0
    total_credit = 0.0
    for ln in lines:
        d = float(ln.get('debit') or 0)
        c = float(ln.get('credit') or 0)
        if d < 0 or c < 0:
            return jsonify({'error':'القيم لا يمكن أن تكون سالبة'}), 400
        total_debit += d
        total_credit += c
    if round(total_debit,2) != round(total_credit,2):
        return jsonify({'error':'القيود غير متوازنة: مجموع المدين يختلف عن مجموع الدائن'}), 400
    # create journal entry
    cur = execute('INSERT INTO journal_entries (date, reference, description, created_at) VALUES (?,?,?,datetime(\'now\'))', (date, reference, description))
    je_id = getattr(cur, 'lastrowid', None)
    if not je_id:
        # try to fetch last inserted id for sqlite
        je = query('SELECT id FROM journal_entries ORDER BY id DESC LIMIT 1', (), one=True)
        je_id = je['id'] if je else None
    # insert lines
    for ln in lines:
        account_id = int(ln.get('account_id'))
        debit = float(ln.get('debit') or 0)
        credit = float(ln.get('credit') or 0)
        party_id = ln.get('party_id')
        desc = ln.get('description','')
        execute('INSERT INTO journal_lines (journal_id, account_id, debit, credit, party_id, description) VALUES (?,?,?,?,?,?)', (je_id, account_id, debit, credit, party_id, desc))
    log_audit('Add journal entry', f'ID={je_id}')
    entry = query('SELECT * FROM journal_entries WHERE id=?', (je_id,), one=True)
    return jsonify({'message':'تم إضافة قيد يومي','data': dict(entry) if entry else {'id':je_id}}), 201


@bp.route('/journal-entries', methods=['GET'])
@login_required
def list_journal_entries():
    rows = query('SELECT id, date, reference, description, created_at FROM journal_entries ORDER BY date DESC, id DESC LIMIT 200')
    return jsonify([dict(r) for r in rows])


@bp.route('/reports/trial-balance', methods=['GET'])
@login_required
def trial_balance():
    rows = query('SELECT a.id, a.code, a.name, a.type, '
                 'COALESCE(SUM(j.debit),0) AS debit, COALESCE(SUM(j.credit),0) AS credit '
                 'FROM accounts a LEFT JOIN journal_lines j ON a.id=j.account_id '
                 'GROUP BY a.id, a.code, a.name, a.type ORDER BY a.code')
    result = []
    total_debit = 0.0
    total_credit = 0.0
    for r in rows:
        d = float(r['debit'] or 0)
        c = float(r['credit'] or 0)
        total_debit += d
        total_credit += c
        result.append({**dict(r), 'debit': round(d,2), 'credit': round(c,2)})
    return jsonify({'data': result, 'total_debit': round(total_debit,2), 'total_credit': round(total_credit,2)})
