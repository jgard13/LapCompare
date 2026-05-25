import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import time
import random
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from scraper import regex_utils as RegEx

def scrape():
    print("Iniciando scraper de Mercado Libre...")
    base_url = "https://listado.mercadolibre.com.mx/laptops#D[A:laptops]"

    options = uc.ChromeOptions()
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=es-MX,es")

    try:
        driver = uc.Chrome(options=options, version_main=148)
    except Exception as e:
        print(f"Error al iniciar Chrome para Mercado Libre: {e}")
        return []

    productos_finales = []
    
    all_products = []

    try:
        for page in range(1, 4):
            print(f"Scraping página {page} de Mercado Libre...")
            if page == 1:
                url = "https://listado.mercadolibre.com.mx/laptops#D[A:laptops]"
            else:
                offset = 50 * (page - 1) + 1
                url = f"https://listado.mercadolibre.com.mx/laptops_Desde_{offset}_NoIndex_True"
                
            driver.get(url)
            time.sleep(random.uniform(4, 6))

            try:
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, ".ui-search-result__wrapper, .poly-card"))
                )
            except Exception:
                pass

            soup = BeautifulSoup(driver.page_source, "html.parser")
            cards = soup.select(".ui-search-result__wrapper") or soup.select(".poly-card")
            
            if not cards:
                print("No se encontraron más productos en Mercado Libre. Terminando paginación.")
                break

            for card in cards:
                try:
                    title_elem = card.select_one("h2, .ui-search-item__title, .poly-component__title")
                    price_elem = card.select_one(".andes-money-amount__fraction")
                    link_elem = card.select_one("a.ui-search-link, a.poly-component__title")
                    img_elem = card.select_one("img.ui-search-result-image__element, img.poly-component__picture")

                    if not title_elem:
                        continue
                        
                    Nombre_Producto = title_elem.get_text(strip=True)
                    if not Nombre_Producto:
                        continue
                        
                    Precio_Producto = price_elem.get_text(strip=True) if price_elem else None
                    
                    Link_Producto = link_elem.get("href") if link_elem else "N/A"
                        
                    Imagen_Producto = "Sin imagen"
                    if img_elem:
                        Imagen_Producto = img_elem.get("data-src") or img_elem.get("src", "Sin imagen")
                        
                    especificaciones = RegEx.especificaciones(Nombre_Producto)
                    
                    producto = {
                        "Nombre": Nombre_Producto,
                        "Precio": Precio_Producto,
                        "Link": Link_Producto,
                        "Imagen": Imagen_Producto,
                        "Tienda": "Mercado Libre",
                        **especificaciones
                    }
                    
                    all_products.append(producto)
                    
                except Exception as e:
                    continue

        seen = set()
        unique_products = []
        for p in all_products:
            key = (p.get("Link", ""), p.get("Nombre", ""))
            if key not in seen:
                seen.add(key)
                unique_products.append(p)

        productos_finales = [p for p in unique_products if not RegEx.hay_None(p)]

    except Exception as e:
        print(f"Error durante scraping en Mercado Libre: {e}")
    finally:
        try:
            driver.quit()
        except OSError:
            pass
        driver.keep_user_data_dir = True

    print(f"Laptops encontradas en Mercado Libre: {len(productos_finales)}")
    return productos_finales

if __name__ == "__main__":
    import json
    res = scrape()
    print(json.dumps(res, indent=2, ensure_ascii=False))
