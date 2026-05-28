import os
import sys
import pandas as pd
import schedule
import time
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Scrapers
from sites import walmart, liverpool, ddtech, mercado_libre, ebay
import db_connection

def main():
    print("=" * 50)
    print("  LAPCOMPARE - INICIANDO SCRAPERS")
    print("=" * 50)

    all_laptops = []
    scrapers_failed = 0
    scrapers_count = 5

    # 1. Walmart
    print("\n[1/5] Extrayendo de Walmart...")
    try:
        laptops_walmart = walmart.scrape()
        all_laptops.extend(laptops_walmart)
        db_connection.log_update_status("Walmart", "EXITOSO", f"Extraídas {len(laptops_walmart)} laptops con éxito.")
    except Exception as e:
        print(f"Error al ejecutar Walmart: {e}")
        scrapers_failed += 1
        db_connection.log_update_status("Walmart", "FALLIDO", str(e))

    # 2. DDTech
    print("\n[2/5] Extrayendo de DDTech...")
    try:
        laptops_ddtech = ddtech.scrape()
        all_laptops.extend(laptops_ddtech)
        db_connection.log_update_status("DDTech", "EXITOSO", f"Extraídas {len(laptops_ddtech)} laptops con éxito.")
    except Exception as e:
        print(f"Error al ejecutar DDTech: {e}")
        scrapers_failed += 1
        db_connection.log_update_status("DDTech", "FALLIDO", str(e))

    # 3. Liverpool
    print("\n[3/5] Extrayendo de Liverpool...")
    try:
        laptops_liverpool = liverpool.scrape()
        all_laptops.extend(laptops_liverpool)
        db_connection.log_update_status("Liverpool", "EXITOSO", f"Extraídas {len(laptops_liverpool)} laptops con éxito.")
    except Exception as e:
        print(f"Error al ejecutar Liverpool: {e}")
        scrapers_failed += 1
        db_connection.log_update_status("Liverpool", "FALLIDO", str(e))

    # 4. Mercado Libre
    print("\n[4/5] Extrayendo de Mercado Libre...")
    try:
        laptops_ml = mercado_libre.scrape()
        all_laptops.extend(laptops_ml)
        db_connection.log_update_status("Mercado Libre", "EXITOSO", f"Extraídas {len(laptops_ml)} laptops con éxito.")
    except Exception as e:
        print(f"Error al ejecutar Mercado Libre: {e}")
        scrapers_failed += 1
        db_connection.log_update_status("Mercado Libre", "FALLIDO", str(e))

    # 5. eBay (API)
    print("\n[5/5] Extrayendo de eBay...")
    try:
        laptops_ebay = ebay.scrape()
        all_laptops.extend(laptops_ebay)
        db_connection.log_update_status("eBay", "EXITOSO", f"Extraídas {len(laptops_ebay)} laptops con éxito.")
    except Exception as e:
        print(f"Error al ejecutar eBay: {e}")
        scrapers_failed += 1
        db_connection.log_update_status("eBay", "FALLIDO", str(e))

    # Resultados
    print("\n" + "=" * 50)
    print(f"  Total de laptops válidas: {len(all_laptops)}")
    print("=" * 50)

    # Si fallaron absolutamente todos los scrapers, es un error fatal
    if scrapers_failed == scrapers_count:
        print("Fallaron todos los scrapers del sistema.")
        return False

    if not all_laptops:
        print("No se recopilaron laptops. Revisa los errores.")
        return False

    # Base de datos
    print("\n Insertando en base de datos PostgreSQL...")
    try:
        inserted = db_connection.insert_laptops(all_laptops)
        print(f" {inserted} laptops insertadas/actualizadas en la base de datos.")
    except Exception as e:
        print(f"Error al insertar en la base de datos: {e}")
        return False

    # Respaldo en CSV
    try:
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
    except Exception as e:
        print(f"Error al guardar respaldo CSV: {e}")

    return True

def run_and_check():
    success = main()
    if not success:
        print("\nSe detectó un error fatal en el proceso. Se programará un reintento en 15 minutos.")
        # Programar un reintento único en 15 minutos
        schedule.every(15).minutes.do(retry_main).tag('retry')
    else:
        print("\nProceso diario completado con éxito.")

def retry_main():
    print("\nINICIANDO REINTENTO DE SCRAPERS (15 MIN)")
    success = main()
    if success:
        print("\nReintento exitoso. Cancelando programación de reintentos.")
        schedule.clear('retry')
        return schedule.CancelJob
    else:
        print("\nEl reintento volvió a fallar. Se intentará de nuevo en 15 minutos...")

if __name__ == "__main__":
    # Si se pasa el argumento --now, se ejecuta inmediatamente y termina
    if "--now" in sys.argv:
        main()
    else:
        # Ejecucion diaria a la 1:00 AM
        schedule.every().day.at("01:00").do(run_and_check)
        
        print("  01:00 AM")
        print("  Manten esta ventana abierta para la ejecución diaria.")
        print("  (Usa 'python main.py --now' para correrlo ahora mismo)")

        while True:
            schedule.run_pending()
            time.sleep(60)
