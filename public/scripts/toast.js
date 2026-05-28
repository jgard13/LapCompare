/* ---- Toast helper compartido ---- */
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
/* ---- Toast centrado — acceso denegado ---- */
function mostrarToastCentro(mensaje) {
    const prev = document.getElementById('_toastCentro');
    if (prev) prev.remove();

    const overlay = document.createElement('div');
    overlay.id = '_toastCentro';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.4); pointer-events: auto;
    `;

    const caja = document.createElement('div');
    caja.style.cssText = `
        background: #dc3545; color: #fff; border-radius: 12px;
        padding: 24px 30px; max-width: 320px; text-align: center;
        font-size: 14px; font-weight: 600; line-height: 1.5;
        box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        opacity: 0; transform: scale(0.9);
        transition: opacity 0.2s ease, transform 0.2s ease;
        pointer-events: auto;
    `;
    caja.textContent = mensaje;

    overlay.appendChild(caja);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        caja.style.opacity = '1';
        caja.style.transform = 'scale(1)';
    });

    const cerrar = () => {
        caja.style.opacity = '0';
        caja.style.transform = 'scale(0.9)';
        setTimeout(() => overlay.remove(), 220);
    };

    overlay.addEventListener('click', cerrar);
    setTimeout(cerrar, 3500);
}
