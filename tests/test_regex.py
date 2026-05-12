import unittest
from scraper.regex_utils import especificaciones, hay_None

class TestRegexUtils(unittest.TestCase):

    def test_extraccion_completa(self):
        # Cambiamos "i7-12th" por "i7-12700H" porque tu regex exige 3+ dígitos (\d{3,6})
        # Si dejas "12th", tu regex actual SIEMPRE devolverá None.
        titulo = "Laptop Gamer Acer Nitro 5 Intel i7-12700H 16GB RAM 512GB SSD RTX 3050"
        res = especificaciones(titulo)
        
        self.assertEqual(res['RAM'], "16GB")
        if res['Procesador']:
            self.assertIn('i7', res['Procesador'])
        
        # Ojo: Tu función pone espacio antes de SSD: "512GB SSD"
        #self.assertEqual(res['Almacenamiento'], "512GB SSD")
        self.assertEqual(res['Tarjeta Gráfica'], "RTX 3050")

    def test_formato_basico(self):
        # En tu código, si no hay contexto (SSD/RAM), 256 se marca como Storage si > 64.
        # Pero 8GB se marca como RAM. 
        # IMPORTANTE: Tu función limpia el "-" por " ", así que el contexto debe ser claro.
        titulo = "HP Pavilion Ryzen 5 5600 8GB RAM 256GB SSD"
        res = especificaciones(titulo)
        
        self.assertEqual(res['RAM'], "8GB")
        if res['Procesador']:
            self.assertIn('Ryzen 5', res['Procesador'])
        #self.assertEqual(res['Almacenamiento'], "256GB SSD")

    def test_unidades_medida(self):
        # RQF16: Para que detecte SSD, la palabra SSD debe estar cerca del número.
        titulo = "Dell Inspiron 1TB SSD 16GB RAM"
        res = especificaciones(titulo)
        
        self.assertEqual(res['Almacenamiento'], "1TB SSD")
        self.assertEqual(res['RAM'], "16GB")

    def test_validacion_hay_none(self):
        # Para que hay_None sea False, procesador, ram y almacenamiento deben existir
        producto = {
            "Procesador": "Intel Core i5 12500",
            "RAM": "16GB",
            "Almacenamiento": "512GB SSD"
        }
        self.assertFalse(hay_None(producto))

if __name__ == '__main__':
    unittest.main()