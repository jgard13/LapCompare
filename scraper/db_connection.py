import os
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

def get_connection():
    # En producción o local, priorizar DATABASE_URL para Supabase
    db_url = os.getenv("DATABASE_URL")
    
    if db_url:
        print(f"Conectando usando DATABASE_URL...")
        if "supabase" in db_url.lower() and "sslmode" not in db_url:
            separator = "&" if "?" in db_url else "?"
            db_url += f"{separator}sslmode=require"
        return psycopg2.connect(db_url)
    
    # Si no hay URL, usar parámetros individuales
    host = os.getenv("DB_HOST", "localhost")
    user = os.getenv("DB_USER", "postgres")
    port = os.getenv("DB_PORT", 5432)
    dbname = os.getenv("DB_NAME", "postgres")
    password = os.getenv("DB_PASSWORD", "")

    print(f"Conectando a {host}:{port} ({dbname}) como {user}...")
    
    return psycopg2.connect(
        host=host,
        port=int(port),
        dbname=dbname,
        user=user,
        password=password,
        sslmode='require' if "supabase" in host.lower() else 'prefer'
    )

def ensure_table(conn):
   #Crear tabla computadora en caso de no existir, solo como validacion
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
    #convertimos precio String a float
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    cleaned = str(raw).replace(",", "").replace("$", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None

import requests

def sync_to_cloud(laptops: list[dict]):
    """Sincroniza los datos con la base de datos en la nube a través de la API de Vercel."""
    if not laptops:
        return
    
    url_nube = "https://lap-compare.vercel.app/api/sincronizar"
    token = "lapcompare_sync_secret_2026"
    
    # Preparar datos en el formato que espera la API
    laptops_format = []
    for lap in laptops:
        laptops_format.append({
            "nombre": lap.get("Nombre"),
            "precio": _parse_price(lap.get("Precio")),
            "cpu": lap.get("Procesador"),
            "ram": lap.get("RAM"),
            "memoria": lap.get("Almacenamiento"),
            "gpu": lap.get("Tarjeta Gráfica"),
            "tienda": lap.get("Tienda"),
            "rutaimg": lap.get("Imagen"),
            "link": lap.get("Link")
        })

    print(f"Sincronizando {len(laptops_format)} laptops via API...")
    
    try:
        response = requests.post(url_nube, json={"laptops": laptops_format, "token": token}, timeout=60)
        
        if response.status_code == 404:
            url_alt = "https://lap-compare.vercel.app/sincronizar"
            response = requests.post(url_alt, json={"laptops": laptops_format, "token": token}, timeout=60)

        if response.ok:
            print("Sincronización exitosa")
        else:
            print(f"Error en sincronización: {response.status_code}")
    except Exception:
        pass

def insert_laptops(laptops: list[dict]) -> int:
    # Insercion a tabla local
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

    # 1. Intentar inserción local (siempre funciona)
    inserted_local = 0
    try:
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
                    ON CONFLICT (link) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        precio = EXCLUDED.precio,
                        cpu = EXCLUDED.cpu,
                        ram = EXCLUDED.ram,
                        memoria = EXCLUDED.memoria,
                        gpu = EXCLUDED.gpu,
                        tienda = EXCLUDED.tienda,
                        rutaimg = EXCLUDED.rutaimg
                    """,
                    rows
                )
                inserted_local = cur.rowcount
            conn.commit()
            print(f"Local: {inserted_local} laptops procesadas.")
        finally:
            conn.close()
    except Exception as e:
        print(f" Error en inserción local: {e}")

    # 2. Sincronizar con la nube (via HTTP para evitar bloqueos de puerto)
    sync_to_cloud(laptops)
    
    return inserted_local
