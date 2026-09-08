# EL TÚNEL

Prototipo web interactivo para una campaña escolar de prevención del suicidio, centrado en la metáfora segura de **campo de visión limitado → menos alternativas percibidas → apoyo externo → interrupción → perspectiva más amplia**.

## Requisitos

- Node.js 18 o superior.
- Computadora y teléfono conectados a la misma red Wi‑Fi/LAN.
- Navegador moderno.

No usa dependencias NPM externas.

## Ejecutar

```bash
node server.js
```

Luego abre en la computadora:

```text
http://localhost:8080/host
```

Para usar un teléfono en la misma red, identifica la IP LAN de la computadora (por ejemplo `192.168.1.20`) y abre:

```text
http://192.168.1.20:8080/control
```

Introduce en el teléfono el código de 4 dígitos mostrado por la pantalla principal.

## Controlador

1. El jugador realiza físicamente un salto a la izquierda, arriba o derecha.
2. El segundo estudiante pulsa la dirección correspondiente.
3. Debe pulsar **VALIDAR SALTO** antes de que finalice la ventana de 1 segundo.
4. Si no valida a tiempo, la acción se descarta.

El software no detecta el antifaz ni intenta detectar el movimiento físico; la validación la realiza el segundo estudiante.

## Modo demo

En la pantalla principal, selecciona **MODO DEMO**. Además del controlador móvil, puedes probar con:

- Flecha izquierda: salto izquierda.
- Flecha arriba: salto arriba.
- Flecha derecha: salto derecha.
- Espacio: pausa.
- `I`: activar la secuencia de INTERRUPCIÓN.

## Balance

El modo estándar de 3 minutos genera:

- Meta: 500 puntos.
- 88 monedas puntuables.
- 44 monedas de 5 puntos.
- 31 monedas de 10 puntos.
- 13 monedas de 15 puntos.
- Total potencial: **725 puntos**.
- 70 oportunidades temporales: 23 / 18 / 14 / 15 por fase. Varias oportunidades de las fases finales contienen grupos de monedas en la misma trayectoria.

Esto permite mantener aproximadamente la distribución 50/35/15 y, a la vez, alcanzar el rango global de 700–770 puntos sin exigir una secuencia perfecta. Los puntos potenciales por fase son 150 / 160 / 125 / 290.

## Nota de diseño sobre el documento fuente

El documento solicita simultáneamente un total potencial de 700–770 puntos y, por fase, un número de oportunidades que —si cada oportunidad fuera exactamente una moneda de 5/10/15 puntos— no permite llegar a ese total. También indica 12–15 oportunidades y 280–300 puntos en la fase 4, lo cual no es posible con una sola moneda de máximo 15 puntos por oportunidad.

El prototipo conserva el número aproximado de **oportunidades**, pero permite que algunas oportunidades sean **grupos de 2 monedas** en una misma trayectoria. Así se preserva el ritmo pedagógico y el balance global sin cambiar los valores 5/10/15.

## Estructura

- `server.js`: servidor HTTP + salas y eventos en memoria.
- `public/host.html`: pantalla principal / proyector.
- `public/controller.html`: controlador móvil.
- `public/host.js`: motor del juego, balance, fases, interrupción y debriefing.
- `public/controller.js`: conexión y validación de saltos.
- `public/styles.css`: diseño responsive.

## Producción

Para un evento real, conviene ejecutar el servidor en una laptop conectada a un router local estable. Si se desea acceso por Internet, se puede desplegar detrás de HTTPS y reemplazar el polling HTTP por WebSocket; el prototipo actual prioriza cero dependencias y facilidad de uso en red local.
