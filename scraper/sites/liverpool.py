import undetected_chromedriver as uc
from bs4 import BeautifulSoup
import json
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from scraper import regex_utils as RegEx
import time

def find_key(obj, key):
    if isinstance(obj, dict):
        if key in obj: return obj[key]
        for k, v in obj.items():
            res = find_key(v, key)
            if res is not None: return res
    elif isinstance(obj, list):
        for item in obj:
            res = find_key(item, key)
            if res is not None: return res
    return None

def scrape():
    print("Iniciando scraper de Liverpool...")
    base_url = "https://www.liverpool.com.mx/tienda?s=laptops"
    
    options = uc.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=es-MX,es")

    try:
        driver = uc.Chrome(options=options, version_main=145)
    except Exception as e:
        print(f"Error al iniciar Chrome para Liverpool: {e}")
        return []

    productos_finales = []

    try:
        for page in range(1, 4):
            print(f"Scraping página {page} de Liverpool...")
            driver.get(f"{base_url}&page={page}")
            time.sleep(5)  # Wait for JS to render

            html = driver.page_source
            soup = BeautifulSoup(html, "html.parser")
            script = soup.select_one("script#__NEXT_DATA__")
            
            if not script:
                print("No se encontró __NEXT_DATA__ en Liverpool.")
                break

            datos = json.loads(script.string)
            
            # Uso de búsqueda recursiva en lugar de anidación estática propensa a errores
            Laptops = find_key(datos, 'records') or []
            
            if not Laptops:
                print("No se encontraron más 'records' en Liverpool. Terminando paginación.")
                break
            
            for Laptop in Laptops:
                try:
                    MetaLaptop = Laptop.get('allMeta', {})
                    Nombre_Producto = Laptop.get('_t')
                    
                    if not Nombre_Producto:
                        continue
                        
                    im_list = MetaLaptop.get('productImages', [])
                    Imagen_Producto = "Sin imagen"
                    if im_list and isinstance(im_list, list):
                        first_im = im_list[0]
                        Imagen_Producto = first_im.get('largeImage') or first_im.get('thumbnailImage') or first_im.get('smallImage') or "Sin imagen"
                    
                    Precio_Producto = MetaLaptop.get('maximumPromoPrice')
                    
                    Link_Producto = MetaLaptop.get('uri', "N/A")
                    
                    especificaciones = RegEx.especificaciones(Nombre_Producto)
                    
                    producto = {
                        "Nombre": Nombre_Producto,
                        "Precio": Precio_Producto,
                        "Link": Link_Producto,
                        "Imagen": Imagen_Producto,
                        "Tienda": "Liverpool",
                        **especificaciones
                    }
                    
                    if not RegEx.hay_None(producto):
                        productos_finales.append(producto)
                        
                except Exception as e:
                    continue

    except Exception as e:
        print(f"Error en scraper de Liverpool: {e}")
    finally:
        try:
            driver.quit()
        except OSError:
            pass
        driver.keep_user_data_dir = True

    print(f"Laptops encontradas en Liverpool: {len(productos_finales)}")
    return productos_finales

if __name__ == "__main__":
    res = scrape()
    print(json.dumps(res, indent=2, ensure_ascii=False))