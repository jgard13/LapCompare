document.addEventListener('DOMContentLoaded', () => {
    // === 1. DATOS DEL USUARIO ===
    const usuario = localStorage.getItem('user');
    const usuarioId = localStorage.getItem('id'); // Este es el ID numérico
    const usuarioObj = usuario ? JSON.parse(usuario) : null;

    const cardNombreUsuario = document.getElementById('cardNombreUsuario');
    const cardCorreoUsuario = document.getElementById('cardCorreoUsuario');
    const avatarIniciales = document.getElementById('avatarIniciales');

    if (usuarioObj && cardNombreUsuario) {
        cardNombreUsuario.textContent = usuarioObj.usuario;
        if (avatarIniciales) {
            avatarIniciales.textContent = usuarioObj.usuario.substring(0, 2).toUpperCase();
        }
    }
    if (usuarioObj && usuarioObj.correo && cardCorreoUsuario) {
        cardCorreoUsuario.textContent = usuarioObj.correo;
    }

    // === 2. CERRAR SESIÓN ===
    const btnCerrarSesion = document.getElementById('BtnCerrarSes');
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', () => {
            localStorage.removeItem('user');
            localStorage.removeItem('id');
            window.location.href = '/Vistas/InicioDeSesion.html';
        });
    }

    // === 3. CONTENEDORES DE LAPTOPS ===
    const ListaFavoritos = document.getElementById('contenedorFavoritos');
    const ListaVistos = document.getElementById('contenedorVistos');

    // === 4. FUNCIONES PARA OBTENER DATOS DEL SERVIDOR ===
    const cargarFavoritos = async () => {
        if (!usuarioId) return; // Usamos el ID numérico

        try {
            const url = `/api/favoritos/${encodeURIComponent(usuarioId)}`;
            const respuesta = await fetch(url);

            if (!respuesta.ok) {
                const errorData = await respuesta.json();
                throw new Error(errorData.error || 'Error en el servidor');
            }

            const favoritos = await respuesta.json();

            if (Array.isArray(favoritos) && favoritos.length > 0) {
                ListaFavoritos.innerHTML = '';
                ListaFavoritos.className = 'd-flex flex-nowrap overflow-x-auto pb-4 pt-2 gap-3 w-100 px-2';

                favoritos.forEach(laptop => {
                    let rawImg = laptop.rutaimg || 'https://placehold.co/150x100?text=Sin+Imagen';
                    // Usar Weserv para evitar bloqueos
                    const rutaWeserv = `https://images.weserv.nl/?url=${encodeURIComponent(rawImg.replace('http://', 'https://'))}&w=160&fit=contain`;

                    // Tarjeta con efecto Hover Integrado y redirección
                    ListaFavoritos.innerHTML += `
                        <div class="card border rounded shadow-sm flex-shrink-0 position-relative overflow-hidden" 
                            style="width: 160px; height: 130px; cursor: pointer;"
                            onmouseenter="this.querySelector('.hover-info').style.opacity='1'" 
                            onmouseleave="this.querySelector('.hover-info').style.opacity='0'">
                            <div class="d-flex flex-column align-items-center text-center p-2 h-100 bg-white">
                                <img src="${rutaWeserv}" class="img-fluid rounded-3 mb-2 mt-2" style="height: 80px; object-fit: contain;" onerror="this.src='https://placehold.co/150x100?text=Error+Carga'">
                                <p class="mb-0 fw-bold text-dark w-100" style="font-size: 0.85rem; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                                    ${laptop.nombre || 'Nombre no disponible'}
                                </p>
                            </div>

                            <div class="hover-info position-absolute top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 text-white d-flex flex-column justify-content-center align-items-center p-2" 
                                style="opacity: 0; transition: opacity 0.3s ease;">
                                <p class="mb-1 text-center" style="font-size: 0.8rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                                    ${laptop.nombre || 'Laptop'}
                                </p>
                                <p class="fw-bold text-success mb-2" style="font-size: 1rem;">$${laptop.precio || '0.00'}</p>
                                <button class="btn btn-sm btn-primary fw-bold btnDetalles" onclick="window.location.href='detalles.html?id=${laptop.id}'">Detalles</button>
                            </div>
                        </div>
                    `;
                });
            }
        } catch (error) {
            console.error("Error cargando favoritos:", error.message);
            ListaFavoritos.innerHTML = '<p class="text-danger">Hubo un error al cargar tus favoritos.</p>';
        }
    };

    const cargarVistos = async () => {
        if (!usuarioId) return; // ID numérico

        try {
            const url = `/api/vistos/${encodeURIComponent(usuarioId)}`;
            const respuesta = await fetch(url);

            if (!respuesta.ok) {
                const errorData = await respuesta.json();
                throw new Error(errorData.error || 'Error en el servidor');
            }

            const vistos = await respuesta.json();

            if (Array.isArray(vistos) && vistos.length > 0) {
                ListaVistos.innerHTML = '';
                ListaVistos.className = 'd-flex flex-nowrap overflow-x-auto pb-4 pt-2 gap-3 w-100 px-2';

                vistos.forEach(laptop => {
                    let rawImg = laptop.rutaimg || 'https://placehold.co/150x100?text=Sin+Imagen';
                    // Usar Weserv para evitar bloqueos
                    const rutaWeserv = `https://images.weserv.nl/?url=${encodeURIComponent(rawImg.replace('http://', 'https://'))}&w=160&fit=contain`;

                    // Tarjeta con efecto Hover Integrado y redirección
                    ListaVistos.innerHTML += `
                        <div class="card border rounded shadow-sm flex-shrink-0 position-relative overflow-hidden" 
                            style="width: 160px; height: 130px; cursor: pointer;"
                            onmouseenter="this.querySelector('.hover-info').style.opacity='1'" 
                            onmouseleave="this.querySelector('.hover-info').style.opacity='0'">
                            <div class="d-flex flex-column align-items-center text-center p-2 h-100 bg-white">
                                <img src="${rutaWeserv}" class="img-fluid rounded-3 mb-2 mt-2" style="height: 80px; object-fit: contain;" onerror="this.src='https://placehold.co/150x100?text=Error+Carga'">
                                <p class="mb-0 fw-bold text-dark w-100" style="font-size: 0.85rem; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                                    ${laptop.nombre || 'Nombre no disponible'}
                                </p>
                            </div>

                            <div class="hover-info position-absolute top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 text-white d-flex flex-column justify-content-center align-items-center p-2" 
                                style="opacity: 0; transition: opacity 0.3s ease;">
                                <p class="mb-1 text-center" style="font-size: 0.8rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                                    ${laptop.nombre || 'Laptop'}
                                </p>
                                <p class="fw-bold text-success mb-2" style="font-size: 1rem;">$${laptop.precio || '0.00'}</p>
                                <button class="btn btn-sm btn-primary fw-bold btnDetalles" onclick="window.location.href='detalles.html?id=${laptop.id}'">Detalles</button>
                            </div>
                        </div>
                    `;
                });
            }
        } catch (error) {
            console.error("Error cargando historial:", error.message);
            ListaVistos.innerHTML = '<p class="text-danger">Hubo un error al cargar tu historial.</p>';
        }
    };

    // === 5. EJECUTAR LAS FUNCIONES ===
    if (usuarioId) {
        cargarFavoritos();
        cargarVistos();
    }
});