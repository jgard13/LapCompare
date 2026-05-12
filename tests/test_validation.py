import unittest
from scraper import regex_utils as RegEx

class TestValidation(unittest.TestCase):

    def test_producto_invalido(self):
        # Un accesorio que no es laptop y no tiene specs
        producto = {
            "Nombre": "Mochila para Laptop 15 pulgadas",
            "RAM": None,
            "CPU": None
        }
        # La función hay_None debería retornar True (indicando que falta algo)
        self.assertTrue(RegEx.hay_None(producto))

    def test_producto_valido(self):
        producto = {
        "Nombre": "Laptop Lenovo i3",
        "Precio": 8000,
        "Link": "https://ddtech.mx/producto/laptop-lenovo",
        "Imagen": "https://ddtech.mx/img/laptop.jpg",
        "Tienda": "DDTech",
        # LLAVES CORREGIDAS PARA QUE COINCIDAN CON hay_None:
        "RAM": "8GB",
        "Procesador": "i3-1215U", # Antes decía "CPU"
        "Almacenamiento": "256GB" # Antes decía "SSD"
    }
    
    # Ahora sí: 
    # specs.get("Procesador") -> "i3-1215U" (No es None)
    # specs.get("RAM")        -> "8GB"      (No es None)
    # specs.get("Almacenamiento") -> "256GB" (No es None)
    # Resultado de hay_None: False
        self.assertFalse(RegEx.hay_None(producto))

if __name__ == '__main__':
    unittest.main()