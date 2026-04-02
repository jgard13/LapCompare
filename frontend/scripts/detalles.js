document.addEventListener('DOMContentLoaded', async () => {

    // -- Variables iniciales --
    const btnIniciarSesion = document.getElementById('BtnIniciarSe');
    const storedUser = localStorage.getItem('user');
    const usuarioObj = storedUser ? JSON.parse(storedUser) : null;
    const urlParams = new URLSearchParams(window.location.search);
    const idActual = urlParams.get('id') || '';

    // =========================================================================
    // Cargar datos desde el servidor: Imagen, Nombre, Precio y Tabla For Nerds
    // =========================================================================
    if (idActual) {
        try {
            const response = await fetch('/Computadoras');
            const computadoras = await response.json();

            // Buscamos la laptop que coincida con el ID de la URL
            const laptopInfo = computadoras.find(comp => comp.id == idActual);

            if (laptopInfo) {
                // 1. MODIFICAR IMAGEN, NOMBRE Y PRECIO
                const imgElement = document.getElementById('imagenPrincipal');
                const nombreElement = document.getElementById('nombreLaptop');
                const precioElement = document.getElementById('precioLaptop');

                // Lógica de la ruta de la imagen
                if (imgElement) {
                    let rutaRelativa = 'https://placehold.co/150x100?text=Sin+Imagen';
                    if (laptopInfo.rutaimg) {
                        if (laptopInfo.rutaimg.startsWith('http')) {
                            rutaRelativa = laptopInfo.rutaimg;
                        } else {
                            const nombreImagen = laptopInfo.rutaimg.split('\\').pop();
                            rutaRelativa = `/images/${nombreImagen}`;
                        }
                    }
                    imgElement.src = rutaRelativa;
                    imgElement.onerror = function () {
                        this.src = 'https://placehold.co/150x100?text=Error+Carga';
                    };
                }

                if (nombreElement && laptopInfo.nombre) nombreElement.textContent = laptopInfo.nombre;
                if (precioElement && laptopInfo.precio) precioElement.textContent = `$${laptopInfo.precio}`;

                // 2. LÓGICA DEL ENLACE "FOR NERDS" (Pequeñita y Reversible)
                const linkForNerds = document.getElementById('linkForNerds');
                const contenedorTabla = document.getElementById('contenedorEspecificaciones');

                let tablaVisible = false; // Variable para controlar si está abierta o cerrada

                if (linkForNerds && contenedorTabla) {
                    linkForNerds.addEventListener('click', (e) => {
                        e.preventDefault(); // Evita que la página salte hacia arriba al hacer clic

                        if (tablaVisible) {
                            // Si está visible, la vaciamos (la ocultamos)
                            contenedorTabla.innerHTML = '';
                            tablaVisible = false;
                        } else {
                            // Si no está visible, la creamos pequeñita (table-sm y font-size: 12px)
                            contenedorTabla.innerHTML = `
                                <div class="table-responsive mt-2">
                                    <table class="table table-bordered table-striped table-sm shadow-sm" style="font-size: 12px;">
                                        <thead class="table-dark">
                                            <tr>
                                                <th colspan="2" class="text-center py-1"><i class="bi bi-cpu"></i> Especificaciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr><td class="fw-bold w-50 py-1">Procesador</td><td class="py-1">${laptopInfo.cpu || 'N/A'}</td></tr>
                                            <tr><td class="fw-bold py-1">RAM</td><td class="py-1">${laptopInfo.ram || 'N/A'}</td></tr>
                                            <tr><td class="fw-bold py-1">Almacenamiento</td><td class="py-1">${laptopInfo.memoria || 'N/A'}</td></tr>
                                            <tr><td class="fw-bold py-1">Gráfica</td><td class="py-1">${laptopInfo.gpu || 'N/A'}</td></tr>
                                            <tr><td class="fw-bold py-1">Marca</td><td class="py-1">${laptopInfo.marca || 'N/A'}</td></tr>
                                            
                                        </tbody>
                                    </table>
                                </div>
                            `;
                            tablaVisible = true;
                            // Hace un scroll suave si la tabla queda muy abajo
                            contenedorTabla.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    });
                }

                //Redirección dinámica al sitio de compra
                const btnIrAlSitio = document.getElementById('btnIrAlSitio');
                if (btnIrAlSitio && laptopInfo.link) {
                    btnIrAlSitio.href = laptopInfo.link;
                }
            }
        } catch (error) {
            console.error('Error al cargar la información de la computadora:', error);
        }
    }



    //Iniciar Sesion / Mostrar Usuario
    if (usuarioObj) {
        const contenedor = btnIniciarSesion.parentElement;
        contenedor.innerHTML = `
            <a href="/Vistas/usuario.html" class="text-white text-decoration-none fw-bold fs-4 d-flex align-items-center">
                <span>${usuarioObj.usuario}</span>
                <i class="bi bi-person-circle ms-2 px-2"></i>
            </a>
        `;
    } else {
        if (btnIniciarSesion) {
            btnIniciarSesion.addEventListener('click', () => {
                window.location.href = '/Vistas/InicioDeSesion.html';
            });
        }
    }

    // A) Volver al Catálogo
    const btnVolver = Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Volver al Catálogo'));
    if (btnVolver) {
        btnVolver.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/Vistas/index.html';
        });
    }

    // B) Botón "Agregar a Comparación +"
    const btnComparacion = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Agregar a Comparación +'));
    if (btnComparacion) {
        btnComparacion.addEventListener('click', () => {
            let comparaciones = JSON.parse(localStorage.getItem('comparaciones')) || [];

            if (idActual !== '' && !comparaciones.includes(idActual)) {
                comparaciones.push(idActual);
                localStorage.setItem('comparaciones', JSON.stringify(comparaciones));
                alert('¡Laptop agregada a tu lista de comparación exitosamente!');
            } else if (idActual === '') {
                alert('No se pudo identificar el ID de esta laptop.');
            } else {
                alert('Esta laptop ya está en tu lista de comparación.');
            }
        });
    }

    // C) Botón "Ir al sitio de compra" (ELIMINADO AQUÍ, MOVIDO ARRIBA PARA SER DINÁMICO)

    // D) Botón "Ver reseñas del sitio"
    const btnResenas = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Ver reseñas del sitio'));
    if (btnResenas) {
        btnResenas.addEventListener('click', () => {
            alert('Cargando más reseñas del sitio...');
        });
    }

    // E) Icono de Favoritos (Corazón)
    const iconoCorazon = document.querySelector('.bi-heart');
    if (iconoCorazon) {
        const contenedorCorazon = iconoCorazon.parentElement;
        contenedorCorazon.style.cursor = 'pointer';

        contenedorCorazon.addEventListener('click', () => {
            if (iconoCorazon.classList.contains('bi-heart')) {
                iconoCorazon.classList.replace('bi-heart', 'bi-heart-fill');
                iconoCorazon.classList.replace('text-secondary', 'text-danger');
            } else {
                iconoCorazon.classList.replace('bi-heart-fill', 'bi-heart');
                iconoCorazon.classList.replace('text-danger', 'text-secondary');
            }
        });
    }

});