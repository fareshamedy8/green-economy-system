# Update app.py to register accounting blueprint if available

from importlib import import_module

try:
    accounting_mod = import_module('accounting.routes')
    app.register_blueprint(accounting_mod.accounting_bp, url_prefix='/api')
    print('[INFO] accounting blueprint registered at /api')
except Exception as e:
    print(f'[WARN] accounting blueprint not registered: {e}')
