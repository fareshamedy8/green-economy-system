# Initialize SQLAlchemy tables using the app context
from app import app
from accounting.db import init_app, db

init_app(app)

with app.app_context():
    db.create_all()
    print('SQLAlchemy tables created (if not existing)')
