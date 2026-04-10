import undetected_chromedriver as uc
from bs4 import BeautifulSoup
import json
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from scraper import regex_utils as RegEx
import time

def scrape():
    print("Iniciando scraper de Walmart...")
    base_url = "https://www.walmart.com.mx/search?q=laptops"
    
    options = uc.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=es-MX,es")

    try:
        driver = uc.Chrome(options=options, version_main=145)
    except Exception as e:
        print(f"Error al iniciar Chrome para Walmart: {e}")
        return []

    productos_finales = []

    try:
        import random
        for page in range(1, 4):
            print(f"Scraping página {page} de Walmart...")
            # Random delay before navigation
            time.sleep(random.uniform(2, 5))
            
            driver.get(f"{base_url}&page={page}")
            time.sleep(random.uniform(6, 10)) # Aumentamos espera para bypass inicial
            
            # Movimiento de scroll "más humano"
            for _ in range(3):
                driver.execute_script(f"window.scrollBy(0, {random.randint(300, 700)});")
                time.sleep(random.uniform(0.5, 1.5))
            
            html = driver.page_source
            soup = BeautifulSoup(html, "html.parser")
            script = soup.select_one("script#__NEXT_DATA__")
            
            if not script:
                print(f"No se encontró __NEXT_DATA__ en Walmart página {page}. Posible bloqueo.")
                if "Mantén presionado" in html or "verification" in html.lower():
                    print("Bloqueo de PerimeterX (Presionar y mantener) detectado.")
                break

            try:
                datos = json.loads(script.string)
                Laptops = datos['props']['pageProps']['initialData']['searchResult']['itemStacks'][0]['items']
            except (json.JSONDecodeError, KeyError, IndexError) as e:
                print(f"Error procesando JSON de Walmart página {page}: {e}")
                break
            
            if not Laptops:
                print("No se encontraron más laptops en Walmart. Terminando paginación.")
                break
            
            Walmart_Link = "https://walmart.com.mx"

            for Laptop in Laptops:
                try:
                    Nombre_Producto = Laptop.get('name')
                    if not Nombre_Producto:
                        continue
                    
                    Imagen = Laptop.get('imageInfo', {})
                    Imagen_Producto = Imagen.get('thumbnailUrl', "Sin imagen") if Imagen else "Sin imagen"
                    
                    Precio_Producto = Laptop.get('price')
                    
                    Link = Laptop.get('canonicalUrl')
                    Link_Producto = Walmart_Link + Link if Link else "N/A"
                    
                    especificaciones = RegEx.especificaciones(Nombre_Producto) 
                    
                    producto = {
                        "Nombre": Nombre_Producto,
                        "Precio": Precio_Producto,
                        "Link": Link_Producto,
                        "Imagen": Imagen_Producto,
                        "Tienda": "Walmart",
                        **especificaciones
                    }
                    
                    if not RegEx.hay_None(producto):
                        productos_finales.append(producto)
                        
                except Exception as e:
                    continue
                
    except Exception as e:
        print(f"Error en scraper de Walmart: {e}")
    finally:
        try:
            driver.quit()
        except OSError:
            pass
        driver.keep_user_data_dir = True

    print(f"Laptops encontradas en Walmart: {len(productos_finales)}")
    return productos_finales

if __name__ == "__main__":
    res = scrape()
    print(json.dumps(res, indent=2, ensure_ascii=False))
