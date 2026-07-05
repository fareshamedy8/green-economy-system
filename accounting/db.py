from flask_sqlalchemy import SQLAlchemy
import os

# SQLAlchemy instance
db = SQLAlchemy()


def get_sqlite_uri():
    here = os.path.dirname(os.path.dirname(__file__))
    db_path = os.path.join(here, 'database', 'green_economy.db')
    return f'sqlite:///{db_path}'


def init_app(app):
    # prefer DATABASE_URL if provided, otherwise use local sqlite DB_PATH
    database_url = os.environ.get('DATABASE_URL') or app.config.get('DATABASE_URL')
    if not database_url:
        database_url = get_sqlite_uri()
    app.config.setdefault('SQLALCHEMY_DATABASE_URI', database_url)
    app.config.setdefault('SQLALCHEMY_TRACK_MODIFICATIONS', False)
    db.init_app(app)
