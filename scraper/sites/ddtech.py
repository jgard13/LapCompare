import undetected_chromedriver as uc
from bs4 import BeautifulSoup
import time
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from scraper import regex_utils as RegEx

def scrape():
    print("Iniciando scraper de DDTech...")
    base_url = "https://ddtech.mx/productos/computadoras/portatiles"
    DDTech_Link = "https://ddtech.mx"

    options = uc.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=es-MX,es")

    try:
        driver = uc.Chrome(options=options, version_main=145)
    except Exception as e:
        print(f"Error al iniciar Chrome para DDTech: {e}")
        return []

    productos_finales = []

    try:
        import random
        for page in range(1, 4):
            print(f"Scraping página {page} de DDTech...")
            time.sleep(random.uniform(2, 5))
            driver.get(f"{base_url}?pagina={page}")
            time.sleep(5) # Esperando Cloudflare
            
            # Scroll incremental para forzar la carga de imagenes en DDTech
            total_height = driver.execute_script("return document.body.scrollHeight")
            for i in range(1, total_height, 800):
                driver.execute_script(f"window.scrollTo(0, {i});")
                time.sleep(0.7)
                
            time.sleep(1) # Esperar al ultimo lote de imagenes
            driver.execute_script("window.scrollTo(0, 0);")

            soup = BeautifulSoup(driver.page_source, "html.parser")
            cards = soup.select("[class*='product']") or soup.select(".card") or soup.select("article")
            
            if not cards:
                print("No se encontraron más productos en DDTech. Terminando paginación.")
                break

            for card in cards:
                title_elem = card.select_one("h2, h3, h4, [class*='title'], [class*='name']")
                price_elem = card.select_one("[class*='price'], .amount")
                link_elem = card.select_one("a[href]")
                

                img_elem = card.select_one(".product-image img, .image img")
            
                if not title_elem:
                    continue
                
                Nombre_Producto = title_elem.get_text(strip=True)
                if not Nombre_Producto:
                    continue
                
                Precio_Producto = price_elem.get_text(strip=True) if price_elem else None

                Link_Producto = None
                if link_elem:
                    Link_Producto = link_elem.get("href")
                    if Link_Producto and not Link_Producto.startswith("http"):
                        Link_Producto = DDTech_Link + Link_Producto
                else:
                    Link_Producto = "N/A"
                
                Imagen_Producto = "Sin imagen"
                if img_elem:
                    Imagen_Producto = img_elem.get("data-src") or img_elem.get("src", "Sin imagen")

                especificaciones = RegEx.especificaciones(Nombre_Producto)
                
                producto = {
                    "Nombre": Nombre_Producto,
                    "Precio": Precio_Producto,
                    "Link": Link_Producto,
                    "Imagen": Imagen_Producto,
                    "Tienda": "DDTech",
                    **especificaciones
                }
                
                if not RegEx.hay_None(producto):
                    productos_finales.append(producto)

    except Exception as e:
        print(f"Error durante scraping en DDTech: {e}")
    finally:
        try:
            driver.quit()
        except OSError:
            pass
        driver.keep_user_data_dir = True

    # Deduplicar
    seen = set()
    unicos = []
    for p in productos_finales:
        k = (p["Link"], p["Nombre"])
        if k not in seen:
            seen.add(k)
            unicos.append(p)

    print(f"Laptops encontradas en DDTech: {len(unicos)}")
    return unicos

if __name__ == "__main__":
    import json
    res = scrape()
    print(json.dumps(res, indent=2, ensure_ascii=False))