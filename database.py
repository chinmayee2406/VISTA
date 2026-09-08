import sqlite3
from datetime import datetime

DB_PATH = "vista.db"


def get_connection():
    return sqlite3.connect(DB_PATH)


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            customer_id TEXT,
            sender_type TEXT NOT NULL,
            message TEXT NOT NULL,
            language TEXT,
            response TEXT,
            timestamp TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


def save_conversation(
    session_id,
    message,
    response,
    language="en",
    sender_type="customer",
    customer_id=None
):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO conversations (
            session_id,
            customer_id,
            sender_type,
            message,
            language,
            response,
            timestamp
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        session_id,
        customer_id,
        sender_type,
        message,
        language,
        response,
        datetime.now().isoformat()
    ))

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("SQLite database initialized successfully.")