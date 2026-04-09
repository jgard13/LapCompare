let laptopsSeleccionadas = [];
let radarChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    // RQNF34: Validar que el usuario esté identificado
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
        alert("Acceso denegado. Debes iniciar sesión para usar la comparación.");
        window.location.href = '/login.html'; // Ajusta la ruta de tu login
        return;
    }

    // Mostrar usuario en Header
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

    // Obtener IDs de la caché (RQNF32)
    const listaIds = JSON.parse(localStorage.getItem('listaComparar')) || [];
    
    if (listaIds.length === 0) {
        document.querySelector('main').innerHTML = `<div class="text-center mt-5"><h2>No hay dispositivos seleccionados.</h2><a href="/" class="btn btn-primary mt-3">Volver al catálogo</a></div>`;
        return;
    }

    await cargarYProcesar(listaIds);

    // Escuchar cambios en el filtro activo
    document.getElementById('filtroContexto').addEventListener('change', () => {
        ejecutarComparacion();
    });
});

async function cargarYProcesar(ids) {
    try {
        const res = await fetch('/Computadoras');
        const todas = await res.json();
        laptopsSeleccionadas = todas.filter(l => ids.includes(l.id));
        
        // RQF40 y RQNF35: Ejecutar comparación inicial validando el filtro por defecto (Promedio)
        ejecutarComparacion();
    } catch (e) {
        console.error("Error cargando laptops:", e);
    }
}

// RQNF36: El sistema valida qué etiqueta está seleccionada y procesa
function ejecutarComparacion() {
    const selector = document.getElementById('filtroContexto');
    
    // Validación de seguridad por si falla el HTML
    if (!selector || !selector.value) {
        console.warn("No hay etiqueta seleccionada, usando promedio por defecto.");
        selector.value = 'promedio'; 
    }
    
    const filtroActivo = selector.value;
    aplicarFiltroYReordenar(filtroActivo);
}

// RQF44 y RQF42: Lógica de ordenamiento
function aplicarFiltroYReordenar(criterio) {
    let ordenadas = [...laptopsSeleccionadas];

    if (criterio === 'promedio') {
        const avgPrecio = ordenadas.reduce((acc, l) => acc + Number(l.precio), 0) / ordenadas.length;
        ordenadas.sort((a, b) => Math.abs(a.precio - avgPrecio) - Math.abs(b.precio - avgPrecio));
    } 
    else if (criterio === 'precio') {
        ordenadas.sort((a, b) => a.precio - b.precio);
    } 
    else if (criterio === 'procesamiento') {
        ordenadas.sort((a, b) => puntuarCPU(b.cpu) - puntuarCPU(a.cpu));
    }
    else if (criterio === 'multitarea') {
        ordenadas.sort((a, b) => puntuarRAM(b.ram) - puntuarRAM(a.ram));
    }
    else if (criterio === 'graficos') {
        ordenadas.sort((a, b) => puntuarGPU(b.gpu) - puntuarGPU(a.gpu));
    }
    else if (criterio === 'espacio') {
        ordenadas.sort((a, b) => puntuarMemoria(b.memoria) - puntuarMemoria(a.memoria));
    }

    renderizarTodo(ordenadas);
}

function renderizarTodo(laptops) {
    renderizarTarjetas(laptops);
    renderizarGrafica(laptops);
    generarRecomendacion(laptops, document.getElementById('filtroContexto').value);
}

// --- TRADUCTORES DE TEXTO A PUNTOS (0-10) ---
function puntuarCPU(cpu) {
    if (!cpu) return 5;
    const txt = cpu.toLowerCase();
    if (txt.includes('i9') || txt.includes('ryzen 9') || txt.includes('m3')) return 10;
    if (txt.includes('i7') || txt.includes('ryzen 7') || txt.includes('m2')) return 8;
    if (txt.includes('i5') || txt.includes('ryzen 5') || txt.includes('m1')) return 6;
    if (txt.includes('i3') || txt.includes('ryzen 3')) return 4;
    return 5; 
}

function puntuarRAM(ram) {
    if (!ram) return 5;
    const gb = parseInt(ram.toString().match(/\d+/)?.[0] || 0);
    if (gb >= 32) return 10;
    if (gb >= 16) return 8;
    if (gb >= 8) return 6;
    return 4; 
}

function puntuarMemoria(memoria) {
    if (!memoria) return 5;
    const txt = memoria.toLowerCase();
    let gb = parseInt(txt.match(/\d+/)?.[0] || 0);
    if (txt.includes('tb')) gb *= 1024;
    if (gb >= 2000) return 10; 
    if (gb >= 1000) return 8;  
    if (gb >= 512) return 6;   
    if (gb >= 256) return 4;   
    return 3;
}

function puntuarGPU(gpu) {
    if (!gpu) return 4;
    const txt = gpu.toLowerCase();
    if (txt.includes('rtx 4080') || txt.includes('rtx 4090') || txt.includes('rx 7900')) return 10;
    if (txt.includes('rtx 4070') || txt.includes('rtx 3080') || txt.includes('rtx 4060')) return 8;
    if (txt.includes('rtx') || txt.includes('rx 6')) return 6;
    if (txt.includes('gtx') || txt.includes('arc')) return 5;
    return 4; 
}
// ---------------------------------------------

function renderizarTarjetas(laptops) {
    const contenedor = document.getElementById('contenedor-tarjetas');
    contenedor.innerHTML = laptops.map(lap => {
        let rawImg = lap.rutaimg || 'https://placehold.co/150x100?text=Laptop';
        // Usar Weserv para evitar bloqueos
        const img = `https://images.weserv.nl/?url=${encodeURIComponent(rawImg.replace('http://', 'https://'))}&w=200&fit=contain`;

        return `
            <div class="col">
                <div class="card-comparacion">
                    <div class="img-placeholder">
                        <img src="${img}" class="img-fluid" onerror="this.src='https://placehold.co/150x100?text=Error'">
                    </div>
                    <h5 class="modelo-nombre">${lap.nombre}</h5>
                    <p class="precio-texto">$${lap.precio}</p>
                    <button class="btn btn-eliminar" onclick="quitarDeComparacion(${lap.id})">Eliminar</button>
                </div>
            </div>`;
    }).join('');
}

function quitarDeComparacion(id) {
    let lista = JSON.parse(localStorage.getItem('listaComparar')) || [];
    lista = lista.filter(i => i !== id);
    localStorage.setItem('listaComparar', JSON.stringify(lista));
    
    laptopsSeleccionadas = laptopsSeleccionadas.filter(l => l.id !== id);
    if (laptopsSeleccionadas.length === 0) {
        location.reload();
    } else {
        ejecutarComparacion();
    }
}

function renderizarGrafica(laptops) {
    const ctx = document.getElementById('radarChart').getContext('2d');
    const colores = [
        { b: '#A076F9', f: 'rgba(160, 118, 249, 0.3)' },
        { b: '#E91E63', f: 'rgba(233, 30, 99, 0.3)' },
        { b: '#00B8D4', f: 'rgba(0, 184, 212, 0.3)' },
        { b: '#FF9800', f: 'rgba(255, 152, 0, 0.3)' }
    ];

    if (radarChartInstance) radarChartInstance.destroy();

    radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Procesador', 'Multitarea', 'Espacio', 'Gráficos', 'Precio'],
            datasets: laptops.map((l, i) => ({
                label: l.nombre.split(' ').slice(0,2).join(' '), 
                data: [
                    puntuarCPU(l.cpu),          
                    puntuarRAM(l.ram),          
                    puntuarMemoria(l.memoria),  
                    puntuarGPU(l.gpu),          
                    (10 - (l.precio / 6000))    
                ],
                borderColor: colores[i % 4].b,
                backgroundColor: colores[i % 4].f,
                borderWidth: 3
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: { min: 0, max: 10, ticks: { display: false }, pointLabels: { font: { size: 14, weight: 'bold' } } }
            }
        }
    });
}

// RQF44: La recomendación también se adapta a la etiqueta seleccionada
function generarRecomendacion(laptops, criterio) {
    if (laptops.length === 0) return;
    const mejor = laptops[0]; // Como ya vienen ordenadas, la primera siempre es la mejor para ese filtro
    
    let motivo = "es la más equilibrada del grupo";
    if (criterio === 'precio') motivo = "es la opción más económica";
    if (criterio === 'procesamiento') motivo = "tiene el procesador más potente";
    if (criterio === 'multitarea') motivo = "ofrece la mejor capacidad de memoria RAM";
    if (criterio === 'graficos') motivo = "cuenta con la mejor tarjeta de video";
    if (criterio === 'espacio') motivo = "ofrece la mayor capacidad de almacenamiento";

    document.getElementById('texto-recomendacion').innerHTML = 
        `<strong>Recomendación final:</strong> La <span class="fw-bold">${mejor.nombre}</span> ${motivo} según tu selección.`;
}