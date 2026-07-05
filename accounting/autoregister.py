# This module will auto-register the accounting blueprint with the main app
try:
    from app import app
    from .routes import bp as accounting_bp
    app.register_blueprint(accounting_bp, url_prefix='/accounting')
except Exception:
    # registration will be attempted when imported from app.py
    pass
