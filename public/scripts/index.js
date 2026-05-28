let listaComparar = JSON.parse(localStorage.getItem('listaComparar')) || [];
let ListaFavoritos = JSON.parse(localStorage.getItem('ListaFav')) || [];
let todasLasLaptops = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Sesion
    const btnIniciarSesion = document.getElementById('BtnIniciarSes');
    const containerUser = document.getElementById('UserContainer');

    const storedUser = localStorage.getItem('user');
    const usuarioObj = storedUser ? JSON.parse(storedUser) : null;

    if (usuarioObj) {
        if (containerUser) {
            containerUser.innerHTML = `
                <a href="../Vistas/Usuario.html" class="text-white text-decoration-none fw-bold fs-4 d-flex align-items-center justify-content-center">
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

    // 2. Inicializar Sliders y Filtros
    const minSlider = document.querySelector('.min-slider');
    const maxSlider = document.querySelector('.max-slider');
    const toggleModo = document.getElementById('toggleModo');
    const labelModo = document.getElementById('labelModo');
    const checkboxes = document.querySelectorAll('.check-categoria');
    const btnCompararPrincipal = document.getElementById('btn-comparar');

    if (minSlider && maxSlider) {
        minSlider.addEventListener('input', updateSliders);
        maxSlider.addEventListener('input', updateSliders);
    }

    if (toggleModo) {
        toggleModo.addEventListener('change', () => {
            labelModo.textContent = toggleModo.checked ? 'Óptimo' : 'Mínimo';
            updateSliders();
        });
    }

    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateSliders);
    });

    if (btnCompararPrincipal) {
        btnCompararPrincipal.addEventListener('click', () => {
            window.location.href = '/Vistas/comparar.html';
        });
    }

    // 3. Menú Hamburguesa para Móviles (Filtros)
    const btnToggleFiltros = document.getElementById('btnToggleFiltros');
    const sidebarFiltros = document.getElementById('sidebarFiltros');
    const overlayFiltros = document.getElementById('overlayFiltros');

    if (btnToggleFiltros && sidebarFiltros && overlayFiltros) {
        btnToggleFiltros.addEventListener('click', () => {
            sidebarFiltros.classList.add('open');
            overlayFiltros.classList.add('active');
        });

        overlayFiltros.addEventListener('click', () => {
            sidebarFiltros.classList.remove('open');
            overlayFiltros.classList.remove('active');
        });
    }

    // 4. Carga inicial
    cargarLaptops();
    actualizarInterfazComparar();
});

// --- FUNCIONES GLOBALES ---

function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Función robusta para limpiar y parsear precios
function parsePrecio(p) {
    if (typeof p === 'number') return p;
    if (!p) return 0;
    const limpio = p.toString().replace(/[^0-9.]/g, '');
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
}

async function cargarLaptops() {
    // 1. Intentar cargar desde sessionStorage para carga instantánea al volver al catálogo
    const cached = sessionStorage.getItem('todasLasLaptops');
    const cachedFiltradas = sessionStorage.getItem('laptopsFiltradas');
    if (cached && cachedFiltradas) {
        try {
            const laptops = JSON.parse(cached);
            const filtradas = JSON.parse(cachedFiltradas);
            const metadata = JSON.parse(sessionStorage.getItem('laptopsMetadata') || 'null');
            if (Array.isArray(laptops) && laptops.length > 0) {
                todasLasLaptops = laptops;
                restaurarEstadoCatalogo();
                renderizarLaptops(filtradas, metadata, false);
                console.log('[Cache] Catálogo y listado filtrado restaurados instantáneamente');
                
                // Hacemos el fetch en segundo plano para actualizar la caché de forma silenciosa
                actualizarLaptopsEnSegundoPlano();
                return;
            }
        } catch (e) {
            console.error('Error al restaurar catálogo desde caché:', e);
        }
    } else if (cached) {
        try {
            const laptops = JSON.parse(cached);
            if (Array.isArray(laptops) && laptops.length > 0) {
                todasLasLaptops = laptops;
                restaurarEstadoCatalogo();
                configurarSlidersYRender();
                actualizarLaptopsEnSegundoPlano();
                return;
            }
        } catch (e) {
            console.error('Error al leer caché de laptops:', e);
        }
    }

    // 2. Si no hay caché, cargar de forma normal con un indicador de carga
    const grid = document.getElementById('LaptopsGrid');
    if (grid && grid.children.length === 0) {
        grid.innerHTML = '<div class="text-center w-100 mt-4 text-white"><span class="spinner-border spinner-border-sm me-2"></span>Cargando catálogo...</div>';
    }

    try {
        await actualizarLaptopsEnSegundoPlano();
    } catch (error) {
        console.error('Error al cargar laptops:', error);
        if (grid) {
            grid.innerHTML = `<p class="text-center w-100 mt-4 fw-bold text-danger">⚠️ ${error.message}</p>`;
        }
    }
}

function configurarSlidersYRender() {
    if (todasLasLaptops.length > 0) {
        const precios = todasLasLaptops.map(l => parsePrecio(l.precio)).filter(p => p > 0);
        const maxPrice = precios.length > 0 ? Math.ceil(Math.max(...precios)) : 60000;
        const minSlider = document.querySelector('.min-slider');
        const maxSlider = document.querySelector('.max-slider');
        if (minSlider && maxSlider) {
            minSlider.max = maxPrice;
            maxSlider.max = maxPrice;
            
            // Si hay un valor restaurado de la caché, mantenerlo. Si no, poner maxPrice.
            const stateStr = sessionStorage.getItem('catalogoFiltroEstado');
            if (stateStr) {
                try {
                    const state = JSON.parse(stateStr);
                    if (state.maxVal !== null) maxSlider.value = state.maxVal;
                    else maxSlider.value = maxPrice;
                    if (state.minVal !== null) minSlider.value = state.minVal;
                } catch (_) {
                    maxSlider.value = maxPrice;
                }
            } else {
                maxSlider.value = maxPrice;
            }
        }
    } else {
        const minSlider = document.querySelector('.min-slider');
        const maxSlider = document.querySelector('.max-slider');
        if (minSlider && maxSlider) {
            minSlider.max = 60000;
            maxSlider.max = 60000;
            maxSlider.value = 60000;
        }
    }
    updateSliders(); // Render inicial o actualizado
}

async function actualizarLaptopsEnSegundoPlano() {
    const response = await fetch('/Computadoras');
    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'No se pudo leer el error' }));
        throw new Error(`Error del servidor: ${response.status} - ${errorBody.error}`);
    }
    const laptops = await response.json();

    let nuevasLaptops = [];
    if (Array.isArray(laptops)) {
        nuevasLaptops = laptops;
    } else if (laptops && Array.isArray(laptops.laptops)) {
        nuevasLaptops = laptops.laptops;
    }

    // Comprobar si los datos realmente cambiaron antes de re-renderizar
    const dataChanged = JSON.stringify(todasLasLaptops) !== JSON.stringify(nuevasLaptops);
    if (dataChanged || todasLasLaptops.length === 0) {
        todasLasLaptops = nuevasLaptops;
        sessionStorage.setItem('todasLasLaptops', JSON.stringify(todasLasLaptops));
        // Si no hay estado guardado o si la lista estaba vacía, renderizar
        const stateStr = sessionStorage.getItem('catalogoFiltroEstado');
        if (!stateStr || todasLasLaptops.length === nuevasLaptops.length) {
            configurarSlidersYRender();
        }
        console.log('[Cache] Catálogo actualizado en segundo plano');
    }
}

// Versión debounced del filtrado
const filtrarDebounced = debounce(async (params) => {
    const { etiquetas, minVal, maxVal, modo } = params;

    // Filtrado local (si no hay etiquetas)
    if (etiquetas.length === 0) {
        const filtradas = todasLasLaptops.filter(lap => {
            const p = parsePrecio(lap.precio);
            return p >= minVal && p <= maxVal;
        });
        renderizarLaptops(filtradas);
        return;
    }

    // Filtrado remoto (si hay etiquetas)
    try {
        const res = await fetch('/api/laptops/filtrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                etiquetas,
                precio_min: minVal,
                precio_max: maxVal,
                modo
            })
        });
        const data = await res.json();
        renderizarLaptops(data.laptops, data, true);

        if (data.laptops.length > 0) {
            cargarFeedbackAsistente(data.laptops.slice(0, 3), { etiquetas, precio_min: minVal, precio_max: maxVal });
        }
    } catch (error) {
        console.error("Error filtrando:", error);
    }
}, 300);

async function updateSliders(e) {
    const minSlider = document.querySelector('.min-slider');
    const maxSlider = document.querySelector('.max-slider');
    const toggleModo = document.getElementById('toggleModo');
    const checkboxes = document.querySelectorAll('.check-categoria:checked');
    const sliderRange = document.getElementById('slider-range');

    if (!minSlider || !maxSlider) return;

    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);
    const minGap = 1000;

    // Lógica de cruce de sliders
    if (e) {
        if (maxVal - minVal < minGap) {
            if (e.target.classList.contains('min-slider')) {
                minSlider.value = maxVal - minGap;
                minVal = parseInt(minSlider.value);
            } else {
                maxSlider.value = minVal + minGap;
                maxVal = parseInt(maxSlider.value);
            }
        }
    }

    // Actualizar visual del track (barra morada)
    if (sliderRange) {
        const minLimit = parseInt(minSlider.min);
        const maxLimit = parseInt(maxSlider.max);
        const minPercent = ((minVal - minLimit) / (maxLimit - minLimit)) * 100;
        const maxPercent = ((maxVal - minLimit) / (maxLimit - minLimit)) * 100;
        sliderRange.style.left = `${minPercent}%`;
        sliderRange.style.width = `${maxPercent - minPercent}%`;
    }

    // Actualizar etiquetas de texto
    const minDisplay = document.getElementById('slider-min-value');
    const maxDisplay = document.getElementById('slider-max-value');
    if (minDisplay) minDisplay.textContent = `$${minVal}`;
    if (maxDisplay) {
        if (maxVal === parseInt(maxSlider.max)) {
            maxDisplay.textContent = "Máx.";
        } else {
            maxDisplay.textContent = `$${maxVal}`;
        }
    }

    const etiquetas = Array.from(checkboxes).map(cb => cb.value);
    const modo = toggleModo && toggleModo.checked ? 'optimo' : 'minimo';

    // Ejecutar el filtrado con debounce
    filtrarDebounced({ etiquetas, minVal, maxVal, modo });
}

function renderizarLaptops(laptopsParaMostrar, metadata = null, esperandoFeedback = false) {
    const laptopsGrid = document.getElementById('LaptopsGrid');
    if (!laptopsGrid) return;

    // Guardar en caché local para restauración instantánea al volver
    sessionStorage.setItem('laptopsFiltradas', JSON.stringify(laptopsParaMostrar));
    if (metadata) {
        sessionStorage.setItem('laptopsMetadata', JSON.stringify(metadata));
    } else {
        sessionStorage.removeItem('laptopsMetadata');
    }

    laptopsGrid.innerHTML = '';

    if (metadata && metadata.mensaje) {
        laptopsGrid.innerHTML += `<div class="mensaje-sistema">${metadata.mensaje}</div>`;
    }

    if (metadata && metadata.sugerencia) {
        const lap = metadata.sugerencia;
        let imgRaw = lap.rutaimg || 'https://placehold.co/150x100?text=Sin+Imagen';
        // Usar DuckDuckGo Proxy
        const img = `https://proxy.duckduckgo.com/iu/?u=${encodeURIComponent(imgRaw.replace('http://', 'https://'))}`;

        laptopsGrid.innerHTML += `
            <div class="sugerencia-container w-100" style="grid-column: 1 / -1;">
                <span class="sugerencia-badge">Echa un vistazo a este dispositivo, te puede interesar</span>
                <div class="row align-items-center">
                    <div class="col-md-3 text-center">
                        <img src="${img}" style="height: 150px; object-fit: contain;" onerror="this.src='https://placehold.co/150x100?text=Error+Carga'">
                    </div>
                    <div class="col-md-9 text-white">
                        <h3 class="fw-bold">${lap.nombre}</h3>
                        <p class="fs-5">Cumple con tus requerimientos óptimos al mejor precio: <strong>$${lap.precio}</strong></p>
                        <button class="btn btn-light fw-bold" onclick="verDetalles(${lap.id})">Ver Detalles</button>
                    </div>
                </div>
            </div>
        `;
    }

    // Sección de feedback del asistente
    if (esperandoFeedback || (metadata && metadata.feedback)) {
        const contenido = (metadata && metadata.feedback)
            ? metadata.feedback
            : 'Analizando especificaciones técnicas... <span class="spinner-border spinner-border-sm ms-2" role="status"></span>';

        laptopsGrid.innerHTML += `
            <div id="AssistantFeedback" class="feedback-llm w-100" style="grid-column: 1 / -1;">
                <i class="bi bi-robot me-2"></i><strong>Análisis del Asistente:</strong> 
                <span id="FeedbackArea">${contenido}</span>
            </div>
        `;
    }

    if (laptopsParaMostrar.length === 0) {
        laptopsGrid.innerHTML += '<p class="text-center w-100 mt-4 fw-bold text-muted">No se encontraron laptops con estos criterios.</p>';
        return;
    }

    laptopsParaMostrar.forEach(lap => {
        let rawImg = lap.rutaimg || 'https://placehold.co/150x100?text=Sin+Imagen';
        // Usar DuckDuckGo Proxy con seguridad
        const imgSafe = (typeof rawImg === 'string') ? rawImg.replace('http://', 'https://') : rawImg;
        const rutaFinal = `https://proxy.duckduckgo.com/iu/?u=${encodeURIComponent(imgSafe)}`;

        const card = `
            <div class="card laptop-card text-center p-3 d-flex flex-column align-items-center position-relative" data-laptop-id="${lap.id}">
                <button class="btn-icon-card btn-add-plus" onclick="agregarAComparar(${lap.id})"><i class="bi bi-plus-lg"></i></button>
                <button class="btn-icon-card btn-heart-fav" onclick="toggleFavorito(${lap.id})"><i class="bi bi-heart"></i></button>
                <img src="${rutaFinal}" class="img-fluid rounded-3 mb-3" style="height: 120px; object-fit: contain;" onerror="this.src='https://placehold.co/150x100?text=Error+Carga'">  
                <h5 class="card-title mb-2">${lap.nombre}</h5>
                <p class="precio-text mb-3">$${lap.precio}</p>
                <button class="btn btn-detalles fw-bold" onclick="verDetalles(${lap.id})">Detalles</button>
            </div>
        `;
        laptopsGrid.innerHTML += card;
    });

    sincronizarFavoritosDesdeDB();
    marcarBotonesComparacion();

    // Restaurar el scroll de forma instantánea si regresamos al catálogo
    const stateStr = sessionStorage.getItem('catalogoFiltroEstado');
    if (stateStr) {
        try {
            const state = JSON.parse(stateStr);
            if (state.scrollPos) {
                setTimeout(() => {
                    window.scrollTo({
                        top: state.scrollPos,
                        behavior: 'instant'
                    });
                    // Consumir el scroll para que no vuelva a aplicar en futuros renders
                    state.scrollPos = 0;
                    sessionStorage.setItem('catalogoFiltroEstado', JSON.stringify(state));
                }, 50);
            }
        } catch (e) {}
    }
}

//funcion para cargar el feedback de forma asincrona
async function cargarFeedbackAsistente(laptops, userReq) {
    const feedbackArea = document.getElementById('FeedbackArea');
    if (!feedbackArea) return;

    try {
        const res = await fetch('/api/laptops/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ laptops, userReq })
        });
        const data = await res.json();
        if (data.feedback) {
            feedbackArea.innerHTML = data.feedback;
        }
    } catch (error) {
        console.error("Error cargando feedback:", error);
        feedbackArea.innerHTML = "No pudimos obtener el análisis en este momento.";
    }
}

// --- INTERACCIONES ---

async function verDetalles(id) {
    guardarEstadoCatalogo();

    const storedUser = localStorage.getItem('user');
    const usuarioObj = storedUser ? JSON.parse(storedUser) : null;
    if (usuarioObj && usuarioObj.id) {
        try {
            await fetch('/interaccion/vista', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_usu: usuarioObj.id, id_comp: id })
            });
        } catch (e) { }
    }
    window.location.href = `/Vistas/detalles.html?id=${id}`;
}

async function toggleFavorito(idComp) {
    const storedUser = localStorage.getItem('user');
    const usuarioObj = storedUser ? JSON.parse(storedUser) : null;
    if (!usuarioObj || !usuarioObj.id) {
        alert("Debes iniciar sesión para agregar a favoritos.");
        return;
    }
    try {
        const response = await fetch('/favoritos/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_usu: usuarioObj.id, id_comp: idComp })
        });
        if (response.ok) {
            const data = await response.json();
            actualizarUIPorFavorito(idComp, data.esfavorito);
            
            if (data.esfavorito) {
                mostrarNotificacion("Agregado a favoritos", true);
            } else {
                mostrarNotificacion("Eliminado de favoritos", false);
            }
        }
    } catch (error) {
        console.error('Error en favorito:', error);
    }
}

function actualizarUIPorFavorito(idComp, esfavorito) {
    const btnHeart = document.querySelector(`[data-laptop-id="${idComp}"] .btn-heart-fav`);
    if (!btnHeart) return;
    const icon = btnHeart.querySelector('i');
    if (esfavorito) {
        btnHeart.style.backgroundColor = '#A076F9';
        btnHeart.style.color = '#FFFFFF';
        icon.classList.replace('bi-heart', 'bi-heart-fill');
        if (!ListaFavoritos.includes(idComp)) ListaFavoritos.push(idComp);
    } else {
        btnHeart.style.backgroundColor = 'white';
        btnHeart.style.color = '#333333';
        icon.classList.replace('bi-heart-fill', 'bi-heart');
        ListaFavoritos = ListaFavoritos.filter(id => id !== idComp);
    }
    localStorage.setItem('ListaFav', JSON.stringify(ListaFavoritos));
}

async function sincronizarFavoritosDesdeDB() {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return;
    const usuarioObj = JSON.parse(storedUser);
    try {
        const res = await fetch(`/api/favoritos/${usuarioObj.id}`);
        if (res.ok) {
            const favs = await res.json();
            ListaFavoritos = favs.map(f => f.id);
            localStorage.setItem('ListaFav', JSON.stringify(ListaFavoritos));
            ListaFavoritos.forEach(id => actualizarUIPorFavorito(id, true));
        }
    } catch (e) { }
}

function marcarBotonComparacion(idComp, activo) {
    const btn = document.querySelector(`[data-laptop-id="${idComp}"] .btn-add-plus`);
    if (!btn) return;
    if (activo) {
        btn.style.backgroundColor = '#A076F9';
        btn.style.color = 'white';
        btn.innerHTML = '<i class="bi bi-check-lg"></i>';
    } else {
        btn.style.backgroundColor = 'white';
        btn.style.color = '#333333';
        btn.innerHTML = '<i class="bi bi-plus-lg"></i>';
    }
}

function marcarBotonesComparacion() {
    listaComparar.forEach(id => marcarBotonComparacion(id, true));
}

function actualizarInterfazComparar() {
    const btn = document.getElementById('btn-comparar');
    if (!btn) return;
    if (listaComparar.length > 0) {
        btn.textContent = `Comparar (${listaComparar.length})`;
        btn.classList.replace('btn-outline-light', 'btn-light');
    } else {
        btn.textContent = 'Comparar';
        btn.classList.replace('btn-light', 'btn-outline-light');
    }
}

// --- FUNCIÓN DE COMPARACIÓN ACTUALIZADA (FIFO) ---

function agregarAComparar(idComp) {
    // 1. Leer siempre la lista más reciente de localStorage
    let listaComparar = JSON.parse(localStorage.getItem('listaComparar')) || [];
    const index = listaComparar.indexOf(idComp);

    if (index === -1) {
        // 2. El elemento NO está en la lista, lo agregamos

        // Comportamiento circular: Si ya hay 4, sacamos el más antiguo (el primero)
        if (listaComparar.length >= 4) {
            const idRemovido = listaComparar.shift();
            marcarBotonComparacion(idRemovido, false);
        }

        // Agregamos el nuevo al final
        listaComparar.push(idComp);
        marcarBotonComparacion(idComp, true);

    } else {
        // 3. El elemento YA está en la lista, lo quitamos (Toggle)
        listaComparar.splice(index, 1);
        marcarBotonComparacion(idComp, false);
    }

    // 4. Guardamos los cambios y actualizamos la interfaz
    localStorage.setItem('listaComparar', JSON.stringify(listaComparar));
    actualizarInterfazComparar();
}

// Función para mostrar el mini modal / toast de notificación
function mostrarNotificacion(mensaje, esAgregado) {
    // 1. Buscar o crear el contenedor de notificaciones
    let contenedor = document.getElementById('notificaciones-container');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'notificaciones-container';
        // Posicionamiento fijo en la esquina inferior derecha
        contenedor.style.position = 'fixed';
        contenedor.style.bottom = '20px';
        contenedor.style.right = '20px';
        contenedor.style.zIndex = '1050';
        contenedor.style.display = 'flex';
        contenedor.style.flexDirection = 'column';
        contenedor.style.gap = '10px';
        document.body.appendChild(contenedor);
    }

    // 2. Crear el Toast
    const miniModal = document.createElement('div');
    miniModal.className = 'animate__animated animate__fadeInRight shadow-lg border-0 rounded-3 p-3 text-white d-flex align-items-center';
    
    // Cambiar color de fondo según la acción (Morado si agrega, Gris oscuro si elimina)
    miniModal.style.backgroundColor = esAgregado ? '#A076F9' : '#495057';
    miniModal.style.minWidth = '220px';
    miniModal.style.transition = 'all 0.4s ease';
    miniModal.style.opacity = '0';
    miniModal.style.transform = 'translateY(20px)';

    // Icono dinámico de Bootstrap Icons
    const icono = esAgregado ? 'bi-heart-fill' : 'bi-heartbreak-fill';
    
    miniModal.innerHTML = `
        <i class="bi ${icono} me-2 fs-5"></i>
        <span class="fw-bold" style="font-size: 0.9rem;">${mensaje}</span>
    `;

    contenedor.appendChild(miniModal);

    // Pequeño delay para activar la animación de entrada smoothly
    setTimeout(() => {
        miniModal.style.opacity = '1';
        miniModal.style.transform = 'translateY(0)';
    }, 50);

    // 3. Desvanecer y remover automáticamente después de 2.5 segundos
    setTimeout(() => {
        miniModal.style.opacity = '0';
        miniModal.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            miniModal.remove();
        }, 400);
    }, 2500);
}

// --- PERSISTENCIA DE ESTADO Y SCROLL ---

function guardarEstadoCatalogo() {
    const minSlider = document.querySelector('.min-slider');
    const maxSlider = document.querySelector('.max-slider');
    const toggleModo = document.getElementById('toggleModo');
    const checkboxes = document.querySelectorAll('.check-categoria:checked');
    
    const estado = {
        minVal: minSlider ? minSlider.value : null,
        maxVal: maxSlider ? maxSlider.value : null,
        modoChecked: toggleModo ? toggleModo.checked : false,
        etiquetas: Array.from(checkboxes).map(cb => cb.value),
        scrollPos: window.scrollY
    };
    sessionStorage.setItem('catalogoFiltroEstado', JSON.stringify(estado));
}

function restaurarEstadoCatalogo() {
    const stateStr = sessionStorage.getItem('catalogoFiltroEstado');
    if (!stateStr) return;

    try {
        const state = JSON.parse(stateStr);
        
        const minSlider = document.querySelector('.min-slider');
        const maxSlider = document.querySelector('.max-slider');
        if (minSlider && state.minVal !== null) minSlider.value = state.minVal;
        if (maxSlider && state.maxVal !== null) maxSlider.value = state.maxVal;

        const toggleModo = document.getElementById('toggleModo');
        const labelModo = document.getElementById('labelModo');
        if (toggleModo && state.modoChecked !== undefined) {
            toggleModo.checked = state.modoChecked;
            if (labelModo) labelModo.textContent = toggleModo.checked ? 'Óptimo' : 'Mínimo';
        }

        const checkboxes = document.querySelectorAll('.check-categoria');
        checkboxes.forEach(cb => {
            cb.checked = state.etiquetas.includes(cb.value);
        });
    } catch (e) {
        console.error('Error restaurando filtros:', e);
    }
}