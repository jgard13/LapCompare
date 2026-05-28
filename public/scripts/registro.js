/* ---- Toast helper ---- */
function mostrarToast(mensaje, tipo = 'error') {
    let contenedor = document.getElementById('_toastContenedor');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = '_toastContenedor';
        contenedor.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 99999;
            display: flex; flex-direction: column; gap: 8px; pointer-events: none;
        `;
        document.body.appendChild(contenedor);
    }

    const colores = {
        error:   { bg: '#dc3545' },
        success: { bg: '#198754' },
        warning: { bg: '#fd7e14' },
        info:    { bg: '#0d6efd' }
    };
    const { bg } = colores[tipo] || colores.error;

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${bg}; color: #fff; padding: 10px 16px; border-radius: 8px;
        font-size: 13px; font-weight: 600; box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        display: flex; align-items: center; gap: 8px; max-width: 300px;
        pointer-events: auto; opacity: 0; transform: translateY(8px);
        transition: opacity 0.25s, transform 0.25s;
    `;
    toast.innerHTML = `<span>${mensaje}</span>`;
    contenedor.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/* ---- Lógica de registro ---- */
document.addEventListener('DOMContentLoaded', () => {
    const btnRegistro = document.getElementById('Registro');
    const tieneMayuscula = /[A-Z]/;
    const tieneMinuscula = /[a-z]/;
    const tieneNumero = /[0-9]/;
    const tieneEspecial = /[!@#$%^&*.+]/;
    const emailFormato = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const toggleIcon = document.getElementById('toggleIcon');
    const passwordInput = document.getElementById('regPassword');

    if (toggleIcon) {
        toggleIcon.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            toggleIcon.classList.toggle('bi-eye');
            toggleIcon.classList.toggle('bi-eye-slash');
        });
    }

    btnRegistro.addEventListener('click', async (e) => {
        e.preventDefault();

        const nombre = document.getElementById('regUsuario').value;
        const correo = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;

        if (!nombre || !correo || !password) {
            mostrarToast('Por favor, completa todos los campos.', 'warning');
            return;
        }
        if (nombre.length > 20) {
            mostrarToast('El nombre de usuario no puede tener más de 20 caracteres.', 'warning');
            return;
        }
        if (password.length < 8) {
            mostrarToast('La contraseña debe tener al menos 8 caracteres.', 'warning');
            return;
        }
        if (password.length > 12) {
            mostrarToast('La contraseña debe tener menos de 12 caracteres.', 'warning');
            return;
        }
        if (password.includes(' ')) {
            mostrarToast('La contraseña no debe contener espacios.', 'warning');
            return;
        }
        if (!tieneMayuscula.test(password)) {
            mostrarToast('La contraseña debe incluir una mayúscula.', 'warning');
            return;
        }
        if (!tieneMinuscula.test(password)) {
            mostrarToast('La contraseña debe incluir una minúscula.', 'warning');
            return;
        }
        if (!tieneNumero.test(password)) {
            mostrarToast('La contraseña debe incluir un número.', 'warning');
            return;
        }
        if (!tieneEspecial.test(password)) {
            mostrarToast('La contraseña debe incluir un carácter especial.', 'warning');
            return;
        }
        if (!emailFormato.test(correo)) {
            mostrarToast('El formato del correo no es válido.', 'warning');
            return;
        }

        try {
            const respuesta = await fetch('/registrar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, correo, password })
            });
            const datos = await respuesta.json();
            if (respuesta.ok) {
                mostrarToast('¡Usuario registrado con éxito!', 'success');
                setTimeout(() => {
                    window.location.href = 'InicioDeSesion.html';
                }, 1800);
            } else {
                mostrarToast(datos.error || 'No se pudo registrar.', 'error');
            }
        } catch (error) {
            console.error('Error en la petición:', error);
            mostrarToast('Hubo un error al conectar con el servidor.', 'error');
        }
    });
});