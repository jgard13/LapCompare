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
   # Crear tabla computadora y control_actualizacion en caso de no existir
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
        cur.execute("""
            CREATE TABLE IF NOT EXISTS control_actualizacion (
                id       SERIAL PRIMARY KEY,
                fuente   VARCHAR(100) NOT NULL,
                fecha    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                estado   VARCHAR(50) NOT NULL,
                detalles TEXT
            );
        """)
    conn.commit()

def log_update_status(fuente: str, estado: str, detalles: str):
    """Registra en la tabla control_actualizacion el estado de una fuente de datos."""
    try:
        conn = get_connection()
        try:
            ensure_table(conn)
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO control_actualizacion (fuente, estado, detalles)
                    VALUES (%s, %s, %s)
                """, (fuente, estado, detalles))
            conn.commit()
            print(f"[Log DB] Estado guardado para {fuente}: {estado}")
        finally:
            conn.close()
    except Exception as e:
        print(f"Error al guardar log de control en BD: {e}")

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

import re

def levenshtein_distance(s1: str, s2: str) -> int:
    s1 = s1.lower()
    s2 = s2.lower()
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
        
    return previous_row[-1]

def levenshtein_similarity(s1: str, s2: str) -> float:
    distance = levenshtein_distance(s1, s2)
    max_length = max(len(s1), len(s2))
    if max_length == 0:
        return 1.0
    return 1.0 - (distance / max_length)

def get_tokens(s: str) -> set:
    if not s:
        return set()
    normalized = re.sub(r'[^a-z0-9\s]', '', s.lower())
    return set(filter(None, normalized.split()))

def jaccard_index(s1: str, s2: str) -> float:
    set1 = get_tokens(s1)
    set2 = get_tokens(s2)
    if not set1 and not set2:
        return 1.0
    intersection = set1.intersection(set2)
    union = set1.union(set2)
    return len(intersection) / len(union)

def are_similar(name1: str, name2: str) -> bool:
    if not name1 or not name2:
        return False
    if name1.lower() == name2.lower():
        return True
        
    jaccard = jaccard_index(name1, name2)
    levenshtein = levenshtein_similarity(name1, name2)
    combined_score = (jaccard + levenshtein) / 2
    return combined_score >= 0.75

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

    # 1. Intentar inserción local (siempre funciona)
    inserted_local = 0
    try:
        conn = get_connection()
        try:
            ensure_table(conn)
            with conn.cursor() as cur:
                # Obtener todas las laptops de la BD local en memoria
                cur.execute("SELECT id, nombre, tienda, link, precio FROM computadora")
                existing_laptops = []
                for row in cur.fetchall():
                    existing_laptops.append({
                        "id": row[0],
                        "nombre": row[1],
                        "tienda": row[2],
                        "link": row[3],
                        "precio": float(row[4]) if row[4] is not None else None
                    })

                for lap in laptops:
                    nombre = lap.get("Nombre")
                    precio = _parse_price(lap.get("Precio"))
                    cpu = lap.get("Procesador")
                    ram = lap.get("RAM")
                    memoria = lap.get("Almacenamiento")
                    gpu = lap.get("Tarjeta Gráfica")
                    tienda = lap.get("Tienda")
                    rutaimg = lap.get("Imagen")
                    link = lap.get("Link")

                    # Buscar similitud en memoria
                    existing = None
                    for el in existing_laptops:
                        if el["tienda"] == tienda and are_similar(el["nombre"], nombre):
                            existing = el
                            break

                    if existing:
                        existing_id = existing["id"]
                        existing_link = existing["link"]
                        existing_precio = existing["precio"]

                        # Determinar menor precio
                        final_precio = precio
                        if existing_precio is not None and precio is not None:
                            final_precio = min(float(existing_precio), float(precio))
                        elif existing_precio is not None:
                            final_precio = existing_precio

                        existing_is_ad = existing_link and ("click1.mercadolibre" in existing_link or "/mclics/" in existing_link)
                        new_is_ad = link and ("click1.mercadolibre" in link or "/mclics/" in link)

                        update_link = False
                        if not existing_link and link:
                            update_link = True
                        elif existing_link and link:
                            if existing_is_ad and not new_is_ad:
                                update_link = True
                            elif not existing_is_ad and new_is_ad:
                                update_link = False
                            elif len(link) < len(existing_link):
                                update_link = True

                        final_link = link if update_link else existing_link

                        cur.execute("""
                            UPDATE computadora SET
                                nombre = %s, precio = %s, cpu = %s, ram = %s, memoria = %s,
                                gpu = %s, rutaimg = %s, link = %s
                            WHERE id = %s
                        """, (nombre, final_precio, cpu, ram, memoria, gpu, rutaimg, final_link, existing_id))

                        # Actualizar caché en memoria
                        existing["nombre"] = nombre
                        existing["precio"] = final_precio
                        existing["link"] = final_link
                    else:
                        cur.execute("""
                            INSERT INTO computadora (nombre, precio, cpu, ram, memoria, gpu, tienda, rutaimg, link)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (link) DO NOTHING
                            RETURNING id
                        """, (nombre, precio, cpu, ram, memoria, gpu, tienda, rutaimg, link))
                        
                        row = cur.fetchone()
                        inserted_id = row[0] if row else None

                        existing_laptops.append({
                            "id": inserted_id,
                            "nombre": nombre,
                            "tienda": tienda,
                            "link": link,
                            "precio": float(precio) if precio is not None else None
                        })
                    inserted_local += 1
            conn.commit()
            print(f"Local: {inserted_local} laptops procesadas.")
        finally:
            conn.close()
    except Exception as e:
        print(f" Error en inserción local: {e}")

    # 2. Sincronizar con la nube (via HTTP para evitar bloqueos de puerto)
    sync_to_cloud(laptops)
    
    return inserted_local
