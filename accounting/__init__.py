from flask import Blueprint
from flask_sqlalchemy import SQLAlchemy

accounting_bp = Blueprint('accounting', __name__)

db = SQLAlchemy()


def init_app(app):
    """Initialize accounting extensions and register blueprint."""
    db.init_app(app)
    # register routes under /api/accounting
    app.register_blueprint(accounting_bp, url_prefix='/api/accounting')


# make common imports available at package level
from . import routes  # noqa: E402,F401
from . import models  # noqa: E402,F401
