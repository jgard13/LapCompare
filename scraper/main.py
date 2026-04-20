import os
import sys
import pandas as pd
import schedule
import time
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Scrapers
from sites import walmart, liverpool, ddtech, mercado_libre
import db_connection

def main():
    print("=" * 50)
    print("  LAPCOMPARE - INICIANDO SCRAPERS")
    print("=" * 50)

    all_laptops = []

    # 1. Walmart
    print("\n[1/4] Extrayendo de Walmart...")
    try:
        all_laptops.extend(walmart.scrape())
    except Exception as e:
        print(f"Error al ejecutar Walmart: {e}")

    # 2. DDTech
    print("\n[2/4] Extrayendo de DDTech...")
    try:
        all_laptops.extend(ddtech.scrape())
    except Exception as e:
        print(f"Error al ejecutar DDTech: {e}")

    # 3. Liverpool
    print("\n[3/4] Extrayendo de Liverpool...")
    try:
        all_laptops.extend(liverpool.scrape())
    except Exception as e:
        print(f"Error al ejecutar Liverpool: {e}")

    # 4. Mercado Libre
    print("\n[4/4] Extrayendo de Mercado Libre...")
    try:
        all_laptops.extend(mercado_libre.scrape())
    except Exception as e:
        print(f"Error al ejecutar Mercado Libre: {e}")

    # Resultados
    print("\n" + "=" * 50)
    print(f"  Total de laptops válidas: {len(all_laptops)}")
    print("=" * 50)

    if not all_laptops:
        print("No se recopilaron laptops. Revisa los errores.")
        return

    #Base de datos
    print("\n Insertando en base de datos PostgreSQL...")
    try:
        inserted = db_connection.insert_laptops(all_laptops)
        print(f" {inserted} laptops insertadas/actualizadas en la base de datos.")
    except Exception as e:
        print(f" Error al insertar en la base de datos: {e}")

    # Respaldo en CSV
    columnas = ["Tienda", "Nombre", "Precio", "Procesador", "RAM",
                "Almacenamiento", "Tarjeta Gráfica", "Link", "Imagen"]

    df = pd.DataFrame(all_laptops)
    for col in columnas:
        if col not in df.columns:
            df[col] = None
    df = df[columnas]

    csv_path = os.path.join(os.path.dirname(__file__), "all_laptops.csv")
    df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    print(f"[CSV] Backup guardado en: {csv_path}")

if __name__ == "__main__":
    # Si se pasa el argumento --now, se ejecuta inmediatamente y termina
    if "--now" in sys.argv:
        main()
    else:
        # Ejecucion diaria a la 1:00 AM
        schedule.every().day.at("01:00").do(main)
        
        print("  01:00 AM")
        print("  Manten esta ventana abierta para la ejecución diaria.")
        print("  (Usa 'python main.py --now' para correrlo ahora mismo)")

        while True:
            schedule.run_pending()
            time.sleep(60)
