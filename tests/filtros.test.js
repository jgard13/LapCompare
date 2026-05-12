const request = require('supertest');
const app = require('../api/index');
const pool = require('../api/db');

// Mock de la base de datos
jest.mock('../api/db');

describe('Modulo Filtros', () => {

    // Cerrar el pool al finalizar para que Jest no se quede colgado
    afterAll(async () => {
        if (pool && pool.end) {
            await pool.end();
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('RQF21: Debe filtrar laptops según etiquetas y precio (Exacta)', async () => {
        // Formatos de texto que el regex de api/index.js entiende perfectamente:
        // CPU: "i9-13" (para getCPUGen) y "i9" (para getCPUTier)
        // RAM: "64GB" (para parseRAM)
        // Memoria: "1024GB SSD" (para parseSSD)
        pool.query.mockResolvedValueOnce({
            rows: [
                {
                    id: 1,
                    nombre: 'Laptop Ultra Pro',
                    precio: 15000,
                    ram: '64GB',
                    cpu: 'Intel Core i9-13900K',
                    memoria: '1024GB SSD'
                }
            ]
        });

        const res = await request(app)
            .post('/api/laptops/filtrar')
            .send({
                etiquetas: ['Gaming'],
                precio_min: 10000,
                precio_max: 20000,
                modo: 'optimo'
            });

        // Si esto sigue saliendo como "Referencia", es que las etiquetas en filtros_specs.json 
        // tienen requisitos mayores a i9, 64GB RAM o 1TB SSD (poco probable).
        expect(res.body.tipo).toBe('Exacta');
        expect(res.body.laptops.length).toBeGreaterThan(0);
    });

    test('RQNF18: Debe aplicar tolerancia del 15% en el presupuesto', async () => {
        // Precio 1100 está fuera de 1000, pero dentro del 115% (1150)
        pool.query.mockResolvedValueOnce({
            rows: [
                {
                    id: 2,
                    nombre: 'Laptop Oficina Tolerancia',
                    precio: 1100,
                    ram: '32GB',
                    cpu: 'Intel Core i7-12700H',
                    memoria: '512GB SSD'
                }
            ]
        });

        const res = await request(app)
            .post('/api/laptops/filtrar')
            .send({
                etiquetas: ['Oficina'],
                precio_min: 0,
                precio_max: 1000,
                modo: 'optimo'
            });

        // Fase 1 fallará por precio (1100 > 1000), pero Fase 2B debería capturarla por el +15%
        expect(res.body.tipo).toBe('Presupuesto Ext');
    });

    test('RQF28: Caso de Referencia (Sin coincidencias ni en presupuesto extendido)', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { id: 3, nombre: 'Laptop Inalcanzable', precio: 99999, ram: '128GB', cpu: 'i9-14th', memoria: '4TB SSD' },
                { id: 4, nombre: 'Laptop Muy Basica', precio: 500, ram: '4GB', cpu: 'Celeron', memoria: '128GB SSD' }
            ]
        });

        const res = await request(app)
            .post('/api/laptops/filtrar')
            .send({
                etiquetas: ['Gaming'],
                precio_min: 1000,
                precio_max: 2000,
                modo: 'optimo'
            });

        expect(res.body.tipo).toBe('Referencia');
    });
});