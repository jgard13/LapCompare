"""
db_connection.py
Handles PostgreSQL connection and laptop insertion for the LapCompare scraper.
"""
import os
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

def get_connection():
    """Create and return a new PostgreSQL connection."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME", "BDLap-Compare"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "")
    )

def ensure_table(conn):
    """
    Create the 'computadora' table if it does not already exist.
    Matches the schema expected by the LapCompare Node.js backend.
    """
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS computadora (
                id       SERIAL PRIMARY KEY,
                nombre   TEXT,
                precio   NUMERIC(12, 2),
                cpu      TEXT,
                ram      TEXT,
                memoria  TEXT,
                gpu      TEXT,
                tienda   TEXT,
                rutaimg  TEXT,
                link     TEXT UNIQUE
            );
        """)
    conn.commit()

def _parse_price(raw) -> float | None:
    """Convert a raw price string or number to a float."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    cleaned = str(raw).replace(",", "").replace("$", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None

def insert_laptops(laptops: list[dict]) -> int:
    """
    Insert a list of laptop dicts into the 'computadora' table.
    Skips rows whose 'link' already exists (ON CONFLICT DO NOTHING).
    Returns the number of rows actually inserted.
    """
    if not laptops:
        return 0

    rows = []
    for lap in laptops:
        rows.append((
            lap.get("Nombre"),
            _parse_price(lap.get("Precio")),
            lap.get("Procesador"),
            lap.get("RAM"),
            lap.get("Almacenamiento"),
            lap.get("Tarjeta Gráfica"),
            lap.get("Tienda"),
            lap.get("Imagen"),
            lap.get("Link"),
        ))

    conn = get_connection()
    try:
        ensure_table(conn)
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO computadora
                    (nombre, precio, cpu, ram, memoria, gpu, tienda, rutaimg, link)
                VALUES %s
                ON CONFLICT (link) DO NOTHING
                """,
                rows
            )
            inserted = cur.rowcount
        conn.commit()
        return inserted
    finally:
        conn.close()
