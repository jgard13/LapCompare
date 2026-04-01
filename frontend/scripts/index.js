let listaComparar = JSON.parse(localStorage.getItem('listaComparar')) || [];
let ListaFavoritos = JSON.parse(localStorage.getItem('ListaFav')) || [];

// NUEVO: Variable global para guardar todas las laptops sin tener que volver a pedir al servidor
let todasLasLaptops = []; 

document.addEventListener('DOMContentLoaded', () => {
    // --- LÓGICA DE SESIÓN ---
    const btnIniciarSesion = document.getElementById('BtnIniciarSes');
    const storedUser = localStorage.getItem('user');
    const usuarioObj = storedUser ? JSON.parse(storedUser) : null;

    if (usuarioObj) {
        const contenedor = btnIniciarSesion.parentElement;
        contenedor.innerHTML = `
            <a href="../Vistas/usuario.html" class="text-white text-decoration-none fw-bold fs-4 d-flex align-items-center">
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

 // --- LÓGICA DEL SLIDER DUAL ---
    const minSlider = document.querySelector('.min-slider');
    const maxSlider = document.querySelector('.max-slider');
    const minValueDisplay = document.getElementById('slider-min-value');
    const maxValueDisplay = document.getElementById('slider-max-value');
    const sliderRange = document.getElementById('slider-range');
    const minGap = 1000; // Separación mínima entre las dos bolitas

    const updateSliders = (e) => {
        if (!minSlider || !maxSlider) return;
        
        let minVal = parseInt(minSlider.value);
        let maxVal = parseInt(maxSlider.value);

        // Evitar que las bolitas se crucen o queden pegadas
        if (maxVal - minVal < minGap) {
            if (e && e.target.classList.contains('min-slider')) {
                minSlider.value = maxVal - minGap;
                minVal = parseInt(minSlider.value);
            } else {
                maxSlider.value = minVal + minGap;
                maxVal = parseInt(maxSlider.value);
            }
        }

        // Actualizar los textos
        minValueDisplay.textContent = `$${minVal}`;
        maxValueDisplay.textContent = `$${maxVal}`;

        // Actualizar la barra morada en medio de ambas bolitas
        const minLimit = parseInt(minSlider.min);
        const maxLimit = parseInt(maxSlider.max);
        const minPercent = ((minVal - minLimit) / (maxLimit - minLimit)) * 100;
        const maxPercent = ((maxVal - minLimit) / (maxLimit - minLimit)) * 100;

        sliderRange.style.left = `${minPercent}%`;
        sliderRange.style.width = `${maxPercent - minPercent}%`;
        
        filtrarLaptopsPorRango(minVal, maxVal);
    };

    if (minSlider && maxSlider) {
        updateSliders(); // Inicializar visual
        minSlider.addEventListener('input', updateSliders);
        maxSlider.addEventListener('input', updateSliders);
    }

// --- NUEVA FUNCIÓN: Filtrar Laptops por Rango ---
function filtrarLaptopsPorRango(min, max) {
    if (!todasLasLaptops || todasLasLaptops.length === 0) return;

    // Ahora filtramos asegurando que el precio esté entre el mínimo y el máximo
    const laptopsFiltradas = todasLasLaptops.filter(lap => {
        const precio = parseFloat(lap.precio);
        return precio >= min && precio <= max;
    });
    
    renderizarLaptops(laptopsFiltradas);
}

    // --- CARGA DE LAPTOPS DESDE EL SERVIDOR ---
    const cargarLaptops = async () => {
        try {
            const response = await fetch('/Computadoras'); 
            const laptops = await response.json();
            
            // NUEVO: Guardamos los datos en la variable global
            todasLasLaptops = Array.isArray(laptops) ? laptops : laptops.laptops;
            
            // NUEVO: Aplicamos el filtro inicial (en caso de que el slider ya esté en un valor específico)
            updateSliders();
            
        } catch (error) {
            console.error('Error al cargar laptops:', error);
        }
    };
    
    cargarLaptops();
});

// --- NUEVA FUNCIÓN: Filtrar Laptops ---
function filtrarLaptopsPorPrecio() {
    const slider = document.querySelector('.custom-slider');
    if (!slider) return;

    const precioMaximo = parseFloat(slider.value);
    
    // Filtramos el arreglo global
    const laptopsFiltradas = todasLasLaptops.filter(lap => parseFloat(lap.precio) <= precioMaximo);
    
    // Mandamos a dibujar solo las que pasaron el filtro
    renderizarLaptops(laptopsFiltradas);
}

// --- NUEVA FUNCIÓN: Renderizar Laptops ---
function renderizarLaptops(laptopsParaMostrar) {
    const laptopsGrid = document.getElementById('LaptopsGrid');
    if (!laptopsGrid) return;
    
    laptopsGrid.innerHTML = ''; 

    // Mensaje por si el filtro es muy bajo y no hay laptops
    if (laptopsParaMostrar.length === 0) {
        laptopsGrid.innerHTML = '<p class="text-center w-100 mt-4 fw-bold text-muted">No se encontraron laptops en este rango de precio.</p>';
        return;
    }

    laptopsParaMostrar.forEach(lap => {
        let rutaRelativa = 'https://placehold.co/150x100?text=Sin+Imagen';
        if (lap.rutaimg) {
            if (lap.rutaimg.startsWith('http')) {
                rutaRelativa = lap.rutaimg;
            } else {
                const nombreImagen = lap.rutaimg.split('\\').pop(); 
                rutaRelativa = `/images/${nombreImagen}`;
            }
        }

        const estaEnComparacion = listaComparar.some(id => Number(id) === Number(lap.id));
        const fondoBotonComp = estaEnComparacion ? '#A076F9' : 'white';
        const colorTextoComp = estaEnComparacion ? 'white' : '#333333';
        const iconoComp = estaEnComparacion ? 'bi-check-lg' : 'bi-plus-lg';

        const esFavorito = ListaFavoritos.some(id => Number(id) === Number(lap.id));
        const fondoBotonFav = esFavorito ? '#A076F9' : 'white';
        const colorTextoFav = esFavorito ? 'white' : '#333333';
        const iconoFav = esFavorito ? 'bi-heart-fill' : 'bi-heart';

        const card = `
            <div class="card laptop-card text-center p-3 d-flex flex-column align-items-center position-relative" data-laptop-id="${lap.id}">
                <button class="btn-icon-card btn-add-plus" 
                        style="background-color: ${fondoBotonComp}; color: ${colorTextoComp};"
                        onclick="agregarAComparar(${lap.id})">
                    <i class="bi ${iconoComp}"></i>
                </button>
                
                <button class="btn-icon-card btn-heart-fav" 
                        style="background-color: ${fondoBotonFav}; color: ${colorTextoFav};"
                        onclick="toggleFavorito(${lap.id})">
                    <i class="bi ${iconoFav}"></i>
                </button>
                
                <img src="${rutaRelativa}" class="img-fluid rounded-3 mb-3" 
                    style="height: 120px; object-fit: contain;"
                    onerror="this.src='https://placehold.co/150x100?text=Error+Carga'">  
                <h5 class="card-title mb-2">${lap.nombre}</h5>
                <p class="precio-text mb-3">$${lap.precio}</p>
                <button class="btn btn-detalles fw-bold" onclick="verDetalles(${lap.id})">Detalles</button>
            </div>
        `;
        laptopsGrid.innerHTML += card;
    });
    actualizarInterfazComparar();
    sincronizarFavoritosDesdeDB();
}
async function sincronizarFavoritosDesdeDB() {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return; // Si no hay sesión iniciada, no hacemos nada

    const usuarioObj = JSON.parse(storedUser);
    const idUsuario = usuarioObj.id; // Usamos el ID numérico

    try {
        // Le preguntamos a la base de datos por los favoritos de este usuario
        const response = await fetch(`/api/favoritos/${idUsuario}`);
        
        if (response.ok) {
            const favoritosBD = await response.json();
            
            // 1. Extraemos solo los IDs de las computadoras y actualizamos el localStorage
            ListaFavoritos = favoritosBD.map(comp => comp.id);
            localStorage.setItem('ListaFav', JSON.stringify(ListaFavoritos));

            // 2. Buscamos esos corazones en la pantalla y los pintamos de morado
            ListaFavoritos.forEach(idComp => {
                const btnHeart = document.querySelector(`[data-laptop-id="${idComp}"] .btn-heart-fav`);
                if (btnHeart) {
                    const icon = btnHeart.querySelector('i');
                    btnHeart.style.backgroundColor = '#A076F9'; 
                    btnHeart.style.color = '#FFFFFF';            
                    icon.classList.replace('bi-heart', 'bi-heart-fill'); 
                }
            });
        }
    } catch (error) {
        console.error('Error al sincronizar favoritos:', error);
    }
}

// --- FUNCIONES GLOBALES ---

// 1. Favoritos
async function toggleFavorito(idComp) {
    const storedUser = localStorage.getItem('user');
    const usuarioObj = storedUser ? JSON.parse(storedUser) : null;
    
    if (!usuarioObj || !usuarioObj.correo) {
        alert("Debes iniciar sesión para agregar a favoritos.");
        return;
    }
    try {
        const response = await fetch('/favoritos/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id_usu: usuarioObj.id, // ID numérico
                id_comp: idComp 
            })
        });
        if (response.ok) {
            const data = await response.json();       
            const btnHeart = document.querySelector(`[data-laptop-id="${idComp}"] .btn-heart-fav`);
            const icon = btnHeart.querySelector('i');
            
            if (data.esfavorito) {
                btnHeart.style.backgroundColor = '#A076F9'; 
                btnHeart.style.color = '#FFFFFF';            
                icon.classList.replace('bi-heart', 'bi-heart-fill'); 
                
                if (!ListaFavoritos.some(id => Number(id) === Number(idComp))) {
                    ListaFavoritos.push(idComp);
                }
            } else {
                btnHeart.style.backgroundColor = 'white';    
                btnHeart.style.color = '#333333';            
                icon.classList.replace('bi-heart-fill', 'bi-heart'); 
                
                ListaFavoritos = ListaFavoritos.filter(id => Number(id) !== Number(idComp));
            }
            
            localStorage.setItem('ListaFav', JSON.stringify(ListaFavoritos));
        }
    } catch (error) {
        console.error('Error en favorito:', error);
    }
}

// 2. Comparar
function agregarAComparar(idComp) {
    const btnIndividual = document.querySelector(`[data-laptop-id="${idComp}"] .btn-add-plus`);
    const index = listaComparar.findIndex(id => Number(id) === Number(idComp));
    
    if (index === -1) {
        if (listaComparar.length >= 4) {
            const idQuitado = listaComparar.shift();
            const btnQuitado = document.querySelector(`[data-laptop-id="${idQuitado}"] .btn-add-plus`);
            if (btnQuitado) {
                btnQuitado.style.backgroundColor = 'white';
                btnQuitado.style.color = '#333333';
                btnQuitado.innerHTML = '<i class="bi bi-plus-lg"></i>';
            }
        }
        listaComparar.push(idComp);
        btnIndividual.style.backgroundColor = '#A076F9';
        btnIndividual.style.color = 'white';
        btnIndividual.innerHTML = '<i class="bi bi-check-lg"></i>';
    } else {
        listaComparar.splice(index, 1);
        btnIndividual.style.backgroundColor = 'white';
        btnIndividual.style.color = '#333333';
        btnIndividual.innerHTML = '<i class="bi bi-plus-lg"></i>';
    }
    localStorage.setItem('listaComparar', JSON.stringify(listaComparar));
    actualizarInterfazComparar();
}

function actualizarInterfazComparar() {
    const btnCompararPrincipal = document.getElementById('btn-comparar');
    if (!btnCompararPrincipal) return;
    if (listaComparar.length > 0) {
        btnCompararPrincipal.textContent = `Comparar (${listaComparar.length})`;
        btnCompararPrincipal.classList.replace('btn-outline-light', 'btn-light'); 
    } else {
        btnCompararPrincipal.textContent = 'Comparar';
        btnCompararPrincipal.classList.replace('btn-light', 'btn-outline-light');
    }
}

// 3. Ver Detalles
async function verDetalles(id) {
    const storedUser = localStorage.getItem('user');
    const usuarioObj = storedUser ? JSON.parse(storedUser) : null;

    if (usuarioObj && usuarioObj.id) {
        try {
            await fetch('/interaccion/vista', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_usu: usuarioObj.id, id_comp: id })
            });
        } catch (error) {
            console.error('Error al registrar vista:', error);
        }
    }
    window.location.href = `/Vistas/detalles.html?id=${id}`;
}

// Evento botón comparar
const BtnComparaNavegacion = document.getElementById('btn-comparar');
if (BtnComparaNavegacion) {
    BtnComparaNavegacion.addEventListener('click', () => {
        window.location.href = '/Vistas/comparar.html';
    });
}