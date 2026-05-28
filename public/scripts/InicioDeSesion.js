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

/* ---- Lógica de inicio de sesión ---- */
document.addEventListener('DOMContentLoaded', () => {
    const btnLogin = document.getElementById('InicioSesion');
    const toggleIcon = document.getElementById('toggleIcon');
    const passwordInput = document.getElementById('Password');

    if (toggleIcon) {
        toggleIcon.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            toggleIcon.classList.toggle('bi-eye');
            toggleIcon.classList.toggle('bi-eye-slash');
        });
    }

    btnLogin.addEventListener('click', async (e) => {
        e.preventDefault();

        const nombre = document.getElementById('Usuario').value;
        const password = document.getElementById('Password').value;

        if (!nombre || !password) {
            mostrarToast('Ingresa usuario y contraseña.', 'warning');
            return;
        }

        try {
            const respuesta = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, password })
            });

            const datos = await respuesta.json();

            if (respuesta.ok) {
                localStorage.setItem('user', JSON.stringify(datos.usuario));
                localStorage.setItem('id', datos.usuario.id);
                mostrarToast('¡Bienvenido, ' + datos.usuario.usuario + '!', 'success');
                setTimeout(() => {
                    window.location.href = '/Vistas/index.html';
                }, 1500);
            } else {
                mostrarToast(datos.error || 'Credenciales inválidas.', 'error');
                document.getElementById('Usuario').value = '';
                document.getElementById('Password').value = '';
            }
        } catch (error) {
            console.error('Error en la petición:', error);
            mostrarToast('Hubo un error al conectar con el servidor.', 'error');
        }
    });
});