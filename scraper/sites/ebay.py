import os
import requests
import base64
from dotenv import load_dotenv
import sys

# Ajustar path para importar regex_utils y otros módulos
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from scraper import regex_utils as RegEx

# Cargar variables de entorno desde el directorio del scraper
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

CLIENT_ID = os.getenv("EBAY_CLIENT_ID")
CLIENT_SECRET = os.getenv("EBAY_CLIENT_SECRET")

def get_access_token():
    #Obtiene el token OAuth2 de eBay usando Client Credentials.
    if not CLIENT_ID or not CLIENT_SECRET or CLIENT_ID == "TU_CLIENT_ID":
        print("Advertencia: Credenciales de eBay no configuradas o con valores por defecto en .env")
        return None
    
    auth_str = f"{CLIENT_ID}:{CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    
    url = "https://api.ebay.com/identity/v1/oauth2/token"
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": f"Basic {b64_auth}"
    }
    data = {
        "grant_type": "client_credentials",
        "scope": "https://api.ebay.com/oauth/api_scope"
    }
    
    try:
        response = requests.post(url, headers=headers, data=data)
        response.raise_for_status()
        return response.json().get('access_token')
    except Exception as e:
        print(f"Error al obtener token de eBay: {e}")
        return None

def scrape():
    #Extrae laptops de eBay utilizando la API.
    print("Iniciando scraper de eBay (API)...")
    token = get_access_token()
    if not token:
        print("Saltando eBay por falta de token.")
        return []

    # Endpoint de búsqueda de la Browse API
    base_url = "https://api.ebay.com/buy/browse/v1/item_summary/search"
    headers = {
        "Authorization": f"Bearer {token}",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"  # Usamos US como base global
    }
    
    # Parámetros de búsqueda
    params = {
        "q": "laptop",
        "category_ids": "177",  # Categoría de Laptops & Netbooks
        "limit": 50,            # Máximo por página
        "filter": "buyingOptions:{FIXED_PRICE},condition:{NEW}" # Solo nuevos y precio fijo
    }

    all_laptops = []

    try:
        response = requests.get(base_url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        
        items = data.get("itemSummaries", [])
        for item in items:
            try:
                title = item.get("title")
                price_data = item.get("price", {})
                price_val = float(price_data.get("value", 0))
                currency = price_data.get("currency", "USD")
                
                # Conversión a MXN si es necesario
                if currency == "USD":
                    price_val = round(price_val * 17.20, 2)
                
                link = item.get("itemWebUrl")
                image_data = item.get("image", {})
                image = image_data.get("imageUrl", "Sin imagen")
                
                # Extraer especificaciones usando la utilidad común
                specs = RegEx.especificaciones(title)
                
                # Construir objeto producto
                producto = {
                    "Nombre": title,
                    "Precio": price_val,
                    "Link": link,
                    "Imagen": image,
                    "Tienda": "eBay",
                    **specs
                }
                
                # Validar que tenga los campos mínimos requeridos
                if not RegEx.hay_None(specs):
                    all_laptops.append(producto)
            except Exception:
                continue

    except Exception as e:
        print(f"Error durante la llamada a la API de eBay: {e}")

    print(f"Laptops encontradas en eBay: {len(all_laptops)}")
    return all_laptops

if __name__ == "__main__":
    # Prueba rápida del scraper
    import json
    res = scrape()
    print(json.dumps(res, indent=2, ensure_ascii=False))
