document.addEventListener('DOMContentLoaded', () => {
    const btnRegistro = document.getElementById('Registro');
    const tieneMayuscula = /[A-Z]/;
    const tieneMinuscula = /[a-z]/;
    const tieneNumero = /[0-9]/;
    const tieneEspecial = /[!@#$%^&*.]/;
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
        e.preventDefault(); // Evita que la página se recargue

        // Capturar los valores de los inputs
        const nombre = document.getElementById('regUsuario').value;
        const correo = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;

        // Validación simple antes de enviar
        if (!nombre || !correo || !password) {
            alert("Por favor, completa todos los campos.");
            return;
        }
        if(password.length < 8){
                alert("La contraseña debe tener al menos 8 caracteres.");
                return;
            }
        if(password.length > 12){
                alert("La contraseña debe tener menos de 12 caracteres.");
                return;
            }
        if(password.includes(" ")){
                alert("La contraseña no debe contener espacios.");
                return;
            }
        if(!tieneMayuscula.test(password)){
                alert("La contraseña debe incluir una mayuscula")
                return;
            }
        if(!tieneMinuscula.test(password)){
                alert("La contraseña debe incluir una minuscula")
                return;
            }
        if(!tieneNumero.test(password)){
                alert("La contraseña debe incluir un numero")
                return;
            }
        if(!tieneEspecial.test(password)){
                alert("La contraseña debe incluir un caracter especial")
                return;
            }
        if (!emailFormato.test(correo)) {
                alert("¡Error! El formato del correo no es válido.");
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
                alert("¡Usuario registrado con éxito!");
                window.location.href = "InicioDeSesion.html"; 
            } else {
                alert("Error: " + (datos.error || "No se pudo registrar"));
            }
        } catch (error) {
            console.error("Error en la petición:", error);
            alert("Hubo un error al conectar con el servidor.");
        } 
    });
}); 