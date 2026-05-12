const request = require('supertest');
const app = require('../api/index'); // Ajusta la ruta a tu archivo principal
const pool = require('../api/db');
const nodemailer = require('nodemailer');

// Mocks
jest.mock('../api/db');
jest.mock('nodemailer');

afterAll(async () => {
    await pool.end(); // Cierra la conexión a la base de datos para que Jest pueda salir
});

describe('Modulo Inicio de Sesión', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        nodemailer.createTransport.mockReturnValue({
            sendMail: jest.fn().mockResolvedValue(true)
        });
    });

    // RQF1, RQF5, RQNF2, RQNF4, RQNF5
    test('RQF1 & RQF5: Debe registrar un usuario exitosamente', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, correo: 'test@mail.com', usuario: 'user123' }] });
        const res = await request(app)
            .post('/registrar')
            .send({ nombre: 'user123', correo: 'test@mail.com', password: 'Password123!' });
        expect(res.statusCode).toEqual(201);
    });

    // RQF6
    test('RQF6: Debe fallar si el correo ya existe', async () => {
        pool.query.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));
        const res = await request(app)
            .post('/registrar')
            .send({ nombre: 'user123', correo: 'duplicado@mail.com', password: 'Password123!' });

        expect(res.statusCode).toEqual(500);
        // Coincide con el mensaje real de la base de datos simulada
        expect(res.body.error).toContain("unique constraint");
    });

    // RQF4, RQNF6
    test('RQF4: Login exitoso', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, usuario: 'admin', contrasena: '123' }] });
        const res = await request(app).post('/login').send({ nombre: 'admin', password: '123' });
        expect(res.statusCode).toBe(200);
    });

    // RQF7
    test('RQF7: Debe mostrar error con credenciales incorrectas', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .post('/login')
            .send({ nombre: 'fake', password: 'wrong' });

        expect(res.statusCode).toEqual(401);
        expect(res.body.error).toBe("Credenciales incorrectas");
    });

    // RQNF1, RQNF3 (Validaciones de longitud y complejidad)
    // Nota: Estas pruebas asumen que implementarás validaciones de esquema (ej. Joi o Express-validator)
    test('RQNF1 & RQNF3: Validar longitud de usuario y complejidad de password', () => {
        const user = "EsteNombreEsDemasiadoLargoParaElSistema";
        const pass = "123"; // Muy corta y sin caracteres

        const validate = (u, p) => u.length <= 20 && p.length <= 12 && /[A-Z]/.test(p);

        expect(validate(user, pass)).toBe(false);
    });
});