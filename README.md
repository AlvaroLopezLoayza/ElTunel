# EL TÚNEL

Experiencia web interactiva para un taller escolar guiado de salud mental. Su metáfora central es:

**campo de visión limitado → menos alternativas percibidas → apoyo externo → interrupción → perspectiva más amplia**

No es una herramienta clínica ni sustituye la atención profesional.

## Ejecutar

Requiere Node.js 18 o superior y no usa dependencias externas.

```bash
npm start
```

Abre `http://localhost:8080/host` en la computadora. El servidor mostrará en la consola la dirección de red que debe abrirse en el teléfono acompañante; la pantalla principal también la presenta junto al código de sala.

Para verificar el servidor y el contrato de acciones:

```bash
npm test
```

## Recorrido

1. El facilitador conecta el teléfono y completa la lista de seguridad.
2. El participante y su acompañante ensayan izquierda, arriba y derecha.
3. El participante responde con un paso, inclinación o micro-salto; el acompañante registra la misma dirección con un toque.
4. El campo visual se estrecha gradualmente y algunas alternativas quedan fuera del foco frontal.
5. Una moneda especial permite alcanzar la interrupción y abrir la perspectiva; si no se recoge, la secuencia no se activa.
6. El recorrido termina con el puntaje, el top 10 y los recursos de ayuda.

Todas las sesiones completan el recorrido. No existe un estado de derrota ni una puntuación mínima. El puntaje normalizado ofrece hasta 1000 puntos por las alternativas descubiertas y 250 adicionales por la moneda de interrupción.

## Scoreboard

Los últimos 100 resultados se guardan en `data/scores.json`; el cierre muestra el top 10 y resalta el resultado actual. El archivo no se versiona y puede ubicarse en otra ruta con la variable de entorno `SCORES_FILE`.

El servidor calcula el puntaje a partir del conteo de monedas, por lo que el navegador nunca envía un puntaje confiable. El facilitador puede borrar el ranking desde las opciones de configuración, después de una confirmación explícita.

## Seguridad y accesibilidad

- La actividad requiere una persona adulta facilitadora y un acompañante próximo.
- El área debe estar despejada. El visor solo limita la visión periférica y siempre deja visibles el centro y el suelo.
- La persona puede pausar o terminar cuando quiera y no tiene que compartir experiencias personales.
- Existe un modo de movimiento reducido, activado automáticamente desde la preferencia del sistema y disponible también como control manual.
- La velocidad del fondo puede ajustarse a 1×, 2× o 3× antes de comenzar; esto no modifica la velocidad ni la ventana de captura de las monedas.
- El sonido es opcional, empieza apagado y se genera localmente con Web Audio.
- Durante la interrupción, cualquier dirección del controlador móvil avanza el diálogo.
- También puede probarse sin teléfono usando las flechas del teclado; la barra espaciadora pausa.

Antes de utilizar la experiencia con estudiantes, los textos y el protocolo presencial deben ser revisados por el profesional de salud mental de la institución.

## Ayuda en Perú

La interfaz muestra la **Línea 113, opción 5**, que ofrece orientación psicológica gratuita las 24 horas, y el acceso a los Centros de Salud Mental Comunitaria: <https://www.gob.pe/saludmental>.

El facilitador puede añadir durante la preparación el nombre o ubicación del servicio de apoyo de su institución. Ese texto y el alias del participante permanecen únicamente en el navegador durante la sesión.

## Estructura

- `server.js`: servidor HTTP, salas en memoria e información de red local.
- `public/host.html` y `public/host.js`: preparación, Canvas, interrupción y debrief.
- `public/controller.html` y `public/controller.js`: controlador móvil de un toque.
- `public/styles.css`: sistema visual responsive y estados accesibles.
- `server.test.js`: prueba mínima del servidor, la interfaz y las acciones.
