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

    // Lógica de inicio de sesión
    btnLogin.addEventListener('click', async (e) => {
        e.preventDefault();

        const nombre = document.getElementById('Usuario').value;
        const password = document.getElementById('Password').value;

        if (!nombre || !password) {
            alert("Ingresa usuario y contraseña.");
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
                alert("¡Bienvenido, " + datos.usuario.usuario + "!");
                localStorage.setItem('user', JSON.stringify(datos.usuario));
                localStorage.setItem('id', datos.usuario.id); // Guardamos el ID numérico
                window.location.href = "/Vistas/index.html"; 
            } else {
                alert("Error: " + (datos.error || "Credenciales inválidas"));
            }
        } catch (error) {
            console.error("Error en la petición:", error);
            alert("Hubo un error al conectar con el servidor.");
        }   
    });
});