from flask import Blueprint
from flask_sqlalchemy import SQLAlchemy

# Blueprint serves templates and static files from package directories
accounting_bp = Blueprint(
    'accounting',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/api/accounting/static',
)

db = SQLAlchemy()


def init_app(app):
    """Initialize accounting extensions and register blueprint."""
    db.init_app(app)
    # register routes under /api/accounting
    app.register_blueprint(accounting_bp, url_prefix='/api/accounting')


# make common imports available at package level
from . import routes  # noqa: E402,F401
from . import models  # noqa: E402,F401
