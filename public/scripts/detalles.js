document.addEventListener('DOMContentLoaded', async () => {

    //hola

    // -- Variables iniciales --
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
                    let rutaOriginal = laptopInfo.rutaimg || 'https://placehold.co/150x100?text=Sin+Imagen';

                    // Usar DuckDuckGo Proxy para saltar el bloqueo de DD Tech
                    const rutaFinal = `https://proxy.duckduckgo.com/iu/?u=${encodeURIComponent(rutaOriginal.replace('http://', 'https://'))}`;

                    imgElement.src = rutaFinal;

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

                // renderizar grafica
                renderizarGraficaAraña(laptopInfo);

                // CARGAR VIDEO RESEÑA DE YOUTUBE
                cargarVideoReseña(laptopInfo.nombre);

                // CARGAR RESEÑA IA
                cargarResenaIA(laptopInfo.id);

                // Botón "Ver reseñas del sitio original"
                const btnResenasSitio = document.getElementById('btnResenasSitio');
                if (btnResenasSitio && laptopInfo.link) {
                    btnResenasSitio.addEventListener('click', async () => {
                        const modalElement = document.getElementById('modalResenas');
                        const modal = new bootstrap.Modal(modalElement);
                        const listaResenas = document.getElementById('listaResenas');
                        const loadingResenas = document.getElementById('loadingResenas');

                        modal.show();

                        // Reiniciar vista
                        listaResenas.style.display = 'none';
                        loadingResenas.style.display = 'block';
                        listaResenas.innerHTML = '';

                        // Detectar nombre de la tienda para el mensaje
                        const link = laptopInfo.link || '';
                        let tiendaNombre = 'la tienda';
                        let tiendaIcono = 'bi-shop';
                        if (link.includes('mercadolibre')) { tiendaNombre = 'Mercado Libre'; tiendaIcono = 'bi-bag-check'; }
                        else if (link.includes('liverpool')) { tiendaNombre = 'Liverpool'; tiendaIcono = 'bi-bag-heart'; }
                        else if (link.includes('walmart')) { tiendaNombre = 'Walmart'; tiendaIcono = 'bi-cart3'; }
                        else if (link.includes('ddtech')) { tiendaNombre = 'DD Tech'; tiendaIcono = 'bi-cpu'; }

                        try {
                            const response = await fetch(`/api/computadora/${laptopInfo.id}/reviews`);
                            const data = await response.json();

                            loadingResenas.style.display = 'none';
                            listaResenas.style.display = 'block';

                            if (data.reviews && data.reviews.length > 0) {
                                data.reviews.forEach(rev => {
                                    const rating = Math.max(1, Math.min(5, Math.round(rev.rating || 5)));
                                    const stars = '<i class="bi bi-star-fill text-warning"></i>'.repeat(rating)
                                        + '<i class="bi bi-star text-warning opacity-50"></i>'.repeat(5 - rating);
                                    listaResenas.innerHTML += `
                                        <div class="review-item mb-4 pb-3 border-bottom">
                                            <div class="d-flex justify-content-between align-items-center mb-2">
                                                <span class="fw-bold"><i class="bi bi-person-circle me-2"></i>${rev.author}</span>
                                                <div class="stars">${stars}</div>
                                            </div>
                                            <p class="text-muted mb-0" style="font-size: 0.95rem; line-height: 1.5;">"${rev.text}"</p>
                                        </div>
                                    `;
                                });
                            } else {
                                // Mensaje informativo cuando no hay reseñas disponibles
                                const status = data.status || 'ok';
                                let mensajePrincipal = '';
                                let mensajeSecundario = '';

                                if (status === 'no_reviews_system') {
                                    mensajePrincipal = `${tiendaNombre} no cuenta con un sistema de reseñas de clientes en su sitio.`;
                                    mensajeSecundario = 'Puedes consultar el producto directamente en su sitio web.';
                                } else if (status === 'blocked') {
                                    mensajePrincipal = `Las reseñas de ${tiendaNombre} están protegidas y no se pueden cargar automáticamente desde nuestro servidor.`;
                                    mensajeSecundario = 'Puedes verlas directamente en el sitio de la tienda.';
                                } else {
                                    // status === 'ok' pero con 0 reseñas
                                    mensajePrincipal = `Aún no hay reseñas disponibles para esta computadora en ${tiendaNombre}.`;
                                    mensajeSecundario = 'Puedes consultar la información o escribir una reseña directamente en la tienda.';
                                }

                                listaResenas.innerHTML = `
                                    <div class="text-center py-4">
                                        <i class="bi ${tiendaIcono} text-muted" style="font-size: 3rem;"></i>
                                        <p class="mt-3 fw-bold text-muted mb-1">${mensajePrincipal}</p>
                                        <p class="text-muted small mb-3">${mensajeSecundario}</p>
                                        <a href="${link}" target="_blank" rel="noopener noreferrer"
                                           class="btn btn-outline-primary btn-sm">
                                            <i class="bi bi-box-arrow-up-right me-1"></i>
                                            Ver en ${tiendaNombre}
                                        </a>
                                    </div>
                                `;
                            }
                        } catch (error) {
                            console.error("Error al obtener reseñas:", error);
                            loadingResenas.style.display = 'none';
                            listaResenas.style.display = 'block';
                            listaResenas.innerHTML = `
                                <div class="text-center py-4">
                                    <i class="bi bi-wifi-off text-muted" style="font-size: 2.5rem;"></i>
                                    <p class="mt-3 text-muted">No se pudo conectar con el servidor. Intenta de nuevo.</p>
                                </div>
                            `;
                        }
                    });
                }

            }
        } catch (error) {
            console.error('Error al cargar la información de la computadora:', error);
        }
    }



    // Iniciar Sesion / Mostrar usuario en Header
    const btnIniciarSesion = document.getElementById('BtnIniciarSes');
    const containerUser = document.getElementById('UserContainer');

    if (storedUser) {
        const usuarioObj = JSON.parse(storedUser);
        if (containerUser) {
            containerUser.innerHTML = `
                <a href="/Vistas/Usuario.html" class="text-white text-decoration-none fw-bold fs-4 d-flex align-items-center justify-content-center">
                    <span class="d-none d-sm-inline">${usuarioObj.usuario}</span>
                    <i class="bi bi-person-circle ms-2 px-2"></i>
                </a>
            `;
        }
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

//Grafica de radar

function renderizarGraficaAraña(info) {
    const ctx = document.getElementById('radarChart');
    if (!ctx) return;

    //Normalización de Datos (0 a 10)

    // Velocidad (CPU Tier + RAM)
    const ramVal = parseRAM(info.ram);
    const cpuTier = getCPUTier(info.cpu);
    const scoreVelocidad = ((ramVal / 32) * 5) + ((cpuTier / 9) * 5); // Max 10

    // Gráficos (GPU Tier)
    const gpuTier = getGPUTier(info.gpu);
    const scoreGraficos = (gpuTier / 10) * 10;

    // Capacidad (SSD)
    const ssdVal = parseSSD(info.memoria);
    const scoreCapacidad = Math.min((ssdVal / 1024) * 10, 10);

    // Precio (Inverso: Mas barato = Mas puntos)
    const precio = parseFloat(info.precio);
    let scorePrecio = 0;
    if (precio < 10000) scorePrecio = 10;
    else if (precio < 20000) scorePrecio = 8;
    else if (precio < 30000) scorePrecio = 6;
    else if (precio < 45000) scorePrecio = 4;
    else scorePrecio = 2;

    // Batería (Estimada por Potencia)
    let scoreBateria = 8; // Default buen promedio
    if (gpuTier > 5 || cpuTier > 7) scoreBateria = 4;
    else if (gpuTier > 3 || cpuTier > 5) scoreBateria = 6;

    const data = {
        labels: ['Velocidad', 'Batería', 'Capacidad', 'Gráficos', 'Precio'],
        datasets: [{
            label: 'Desempeño',
            data: [
                Math.min(scoreVelocidad, 10).toFixed(1),
                scoreBateria,
                scoreCapacidad.toFixed(1),
                scoreGraficos.toFixed(1),
                scorePrecio
            ],
            fill: true,
            backgroundColor: 'rgba(160, 118, 249, 0.2)',
            borderColor: '#A076F9',
            pointBackgroundColor: '#A076F9',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#A076F9'
        }]
    };

    const config = {
        type: 'radar',
        data: data,
        options: {
            elements: {
                line: { borderWidth: 2 }
            },
            scales: {
                r: {
                    angleLines: { display: true },
                    suggestedMin: 0,
                    suggestedMax: 10,
                    ticks: { display: false, stepSize: 2 }
                }
            },
            plugins: {
                legend: { display: false }
            },
            maintainAspectRatio: false
        }
    };

    new Chart(ctx, config);
}

// Helpers de Parseo
function parseRAM(ramStr) {
    if (!ramStr) return 8;
    const match = ramStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 8;
}

function parseSSD(memStr) {
    if (!memStr) return 256;
    const match = memStr.match(/(\d+)\s*(GB|TB)/i);
    if (!match) return 256;
    let valor = parseInt(match[1]);
    if (match[2].toUpperCase() === 'TB' || match[1] == "1") {
        if (match[1] == "1" && !memStr.toUpperCase().includes("GB")) valor = 1024;
        else if (match[2].toUpperCase() === 'TB') valor *= 1024;
    }
    return valor;
}

function getCPUTier(cpuStr) {
    if (!cpuStr) return 5;
    cpuStr = cpuStr.toLowerCase();
    if (cpuStr.includes('i9') || cpuStr.includes('ryzen 9')) return 9;
    if (cpuStr.includes('i7') || cpuStr.includes('ryzen 7')) return 7;
    if (cpuStr.includes('i5') || cpuStr.includes('ryzen 5')) return 5;
    if (cpuStr.includes('i3') || cpuStr.includes('ryzen 3')) return 3;
    return 2;
}

function getGPUTier(gpuStr) {
    if (!gpuStr) return 2; // Integrada basica
    gpuStr = gpuStr.toLowerCase();
    if (gpuStr.includes('4090') || gpuStr.includes('4080')) return 10;
    if (gpuStr.includes('4070') || gpuStr.includes('3080')) return 9;
    if (gpuStr.includes('4060') || gpuStr.includes('3070')) return 8;
    if (gpuStr.includes('4050') || gpuStr.includes('3060')) return 7;
    if (gpuStr.includes('3050') || gpuStr.includes('1650')) return 5;
    if (gpuStr.includes('rtx')) return 6;
    if (gpuStr.includes('gtx')) return 4;
    return 3; // dedicada basia o integrada fuerte
}

//YOUTUBE

async function cargarVideoReseña(nombreLaptop) {
    const videoContainer = document.getElementById('videoContainer');
    if (!videoContainer) return;

    try {
        const response = await fetch(`/api/search-video?q=${encodeURIComponent(nombreLaptop)}`);
        if (!response.ok) throw new Error('No se encontró video');

        const data = await response.json();
        const videoId = data.videoId;

        if (videoId) {
            videoContainer.innerHTML = `
                <iframe
                    width="100%"
                    height="100%"
                    src="https://www.youtube.com/embed/${videoId}"
                    title="YouTube video player"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerpolicy="strict-origin-when-cross-origin"
                    allowfullscreen>
                </iframe>
            `;
        }
    } catch (error) {
        console.error('Error al cargar video de YouTube:', error);
        videoContainer.innerHTML = `
            <div class="text-center p-3">
                <i class="bi bi-exclamation-triangle mb-2" style="font-size: 2rem; color: #888;"></i>
                <p style="font-size: 11px; color: #666;">No pudimos cargar la video reseña para este modelo.</p>
            </div>
        `;
    }
}

// RESEÑA IA

async function cargarResenaIA(id) {
    const resenaContainer = document.getElementById('resenaIAContent');
    if (!resenaContainer) return;

    console.log('Cargando reseña IA para ID:', id);

    try {
        const response = await fetch(`/api/computadora/${id}/resumen`);
        console.log('Status response:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Datos recibidos:', data);

        if (data.resumen) {
            resenaContainer.innerHTML = `
                <div class="resena-ia-content p-3" style="background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #A076F9;">
                    <div class="d-flex align-items-start mb-2">
                        <i class="bi bi-robot me-2" style="font-size: 1.2rem; color: #A076F9;"></i>
                        <strong>Análisis del Asistente:</strong>
                    </div>
                    <p class="mb-0" style="font-size: 14px; line-height: 1.6; color: #333;">${data.resumen}</p>
                </div>
            `;
        } else if (data.error) {
            resenaContainer.innerHTML = `
                <div class="p-3" style="background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #ffc107;">
                    <p class="mb-0" style="font-size: 14px; color: #666;">Error: ${data.error}</p>
                </div>
            `;
        } else {
            resenaContainer.innerHTML = `
                <div class="p-3" style="background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #ccc;">
                    <p class="mb-0" style="font-size: 14px; color: #666;">No se recibió análisis del servidor.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al cargar reseña IA:', error);
        resenaContainer.innerHTML = `
            <div class="p-3" style="background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #ccc;">
                <p class="mb-0" style="font-size: 14px; color: #666;">No pudimos obtener el análisis IA en este momento.</p>
            </div>
        `;
    }
}
