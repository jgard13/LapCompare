import unittest
from unittest.mock import MagicMock, patch
from bs4 import BeautifulSoup
from scraper.sites.ddtech import scrape

class TestDDTechScraper(unittest.TestCase):

    def test_parseo_html_estatico(self):
        # Simulamos un pedazo de HTML real de DDTech
        html_mock = """
        <div class="product-item">
            <h2 class="name">Laptop Asus Vivobook i5 12th 8GB 256GB</h2>
            <div class="price">$12,499.00</div>
            <a href="/producto/asus-vivobook-123"></a>
            <img src="foto.jpg">
        </div>
        """
        soup = BeautifulSoup(html_mock, 'html.parser')
        card = soup.select_one(".product-item")
        
        # Aquí probarías la lógica interna que extrae de la 'card'
        # (Nota: podrías refactorizar tu scraper para que la lógica de 
        # extracción de una "card" esté en una función pequeña)
        
        nombre = card.select_one(".name").get_text(strip=True)
        precio = card.select_one(".price").get_text(strip=True)
        
        self.assertIn("Asus Vivobook", nombre)
        self.assertIn("12,499", precio)

if __name__ == '__main__':
    unittest.main()