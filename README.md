# Pizarra Hockey 3D

App web para armar presentaciones tácticas de hockey sobre césped: slides con jugadas animadas en una cancha 3D, editor 2D y exportación a video, PNG y PDF.

## Cómo usarla

No necesita instalación ni build. Desde esta carpeta:

```
python3 -m http.server 5173
```

y abrí http://localhost:5173 (publicada en https://zsalts.github.io/PIZZARA-3D/).

## Funciones

- Slides con pasos animados (agregar, duplicar, reordenar)
- Editor 2D: jugadoras propias y rivales, bocha, conexiones, flechas, zonas y textos
- Sistemas tácticos: 4-3-3, 4-4-2, 3-3-3-1, 4-2-3-1 y corner corto, más los que guardes vos o cargues de un archivo
- Deshacer / rehacer, selección múltiple, copiar / pegar, zoom
- Visor 3D (vista de mangrullo detrás del arco) en 9:16 y 16:9, modo presentación con teclado
- Exportar video (WebM/MP4), PNG y PDF; guardar y abrir proyectos en JSON
- Notas del orador, tema claro/oscuro
- Funciona en celular y tablet (ver abajo)

## Sistemas tácticos

En el panel de la derecha (en el celular: botón de ajustes), sección **Sistemas**:

- **Tocá un sistema** para aplicarlo. Arriba elegís **Aplicar a: Propio / Rival** (al rival se le aplica espejado, atacando hacia el otro arco). Se deshace con ⌘Z o con el botón “Deshacer” del aviso.
- **Guardar como sistema**: pide un nombre y guarda las posiciones y etiquetas de las jugadoras propias **en el paso actual** (y sus conexiones). Aparece como un botón más; la **×** lo borra.
- **Cargar sistemas**: abre un `.json` con uno o varios sistemas (por ejemplo, el que te pasó otro entrenador) y los agrega. **Exportar** descarga los tuyos para compartirlos. Las dos cosas están también en el menú “⋯” del celular.
- Tus sistemas quedan en este navegador (biblioteca compartida por todos tus proyectos) y además viajan dentro del archivo del proyecto al usar “Guardar”: quien lo abra los recibe automáticamente.

Hay un ejemplo listo para cargar: [`sistemas-ejemplo.json`](sistemas-ejemplo.json) (3-4-3 presión alta y 4-1-4-1).

### Formato del archivo

```json
{
  "type": "pizarra-sistemas",
  "version": 1,
  "systems": [
    {
      "name": "3-4-3 presión alta",
      "players": [
        { "label": "ARQ", "role": "ARQ", "x": 27.5, "y": 87.5 },
        { "label": "LI",  "role": "LI",  "x": 13,   "y": 66 }
      ],
      "links": [["ARQ", "LI"]]
    }
  ]
}
```

- `x`, `y`: metros de la cancha, `x` de 0 a 55 (ancho) e `y` de 0 a 91,4 (largo), **del lado del equipo propio**: el propio defiende el arco de abajo (`y` = 91,4) y ataca hacia `y` = 0. Se aceptan hasta 3 m afuera de las líneas.
- `label`: lo que se ve en la ficha (hasta 4 caracteres). `role`: opcional, nombre del puesto (si falta, se usa `label`).
- `links`: opcional, pares de etiquetas (o roles) que se unen con una línea.
- Hasta 30 jugadoras por sistema. Si un sistema tiene un error (sin nombre, sin jugadoras, coordenadas fuera de la cancha…) se saltea y el aviso dice cuál y por qué; los demás se cargan igual.
- En el rival, las etiquetas que no son números se reemplazan por números (como con los sistemas incluidos).

## En el celular

- La cancha ocupa casi toda la pantalla; los slides quedan en una tira de miniaturas arriba (con “+” para agregar) y las herramientas en una barra fija abajo.
- **Gestos**: tocá para seleccionar o usar la herramienta, arrastrá para mover fichas, **mantené apretado** una ficha para sumarla o quitarla de la selección (como Shift), **doble toque** para editar la etiqueta, **pellizcá** para hacer zoom y usá **dos dedos** para desplazar la vista.
- El botón de ajustes (deslizadores) abre las propiedades como una hoja desde abajo; se cierra con la ×, tocando afuera o deslizándola hacia abajo.
- El menú **⋯** reúne Abrir, Guardar, Nube, Exportar, sistemas, duplicar / mover / eliminar slide, tema y ayuda.
- En el visor 3D: **deslizá** a los costados para cambiar de slide y **tocá** la imagen para pausar o seguir.
- También funciona con el celular horizontal (herramientas en una columna a la izquierda) y en tablet.
