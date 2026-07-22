# Design Document: GESCOM

## 1. Contexto del Proyecto

GESCOM es una aplicación web de gestión para complejos turísticos de departamentos/cabañas en Argentina. La usa el **dueño o administrador del complejo** para administrar sus unidades, reservas, pagos y finanzas. Es un sistema multiusuario: cada administrador ve únicamente sus propios departamentos, reservas y movimientos.

### 1.1. Roles del Sistema

*   **Administrador (único rol):** gestiona departamentos (ABM), reservas (alta, edición, cancelación, consulta con filtros), pagos y seña de cada reserva, disponibilidad por calendario y finanzas del complejo.

### 1.2. Flujo Principal de una Reserva

1.  Alta de reserva: cliente, departamento, fechas de ingreso/egreso, monto (en USD o ARS), seña opcional y descuento opcional.
2.  El sistema consulta el **tipo de cambio real** (dólar oficial venta, dolarapi.com) y calcula automáticamente el equivalente en la otra moneda.
3.  Transición de estados según la cuenta corriente: `Pendiente` → `Parcial` (hay pagos, no cubren el total) → `Pagado` (saldo cero). `Cancelado` es una baja lógica que libera las fechas.
4.  Sobre cada reserva se registran pagos (fecha, monto USD/ARS, medio de pago, concepto) y se descarga un comprobante PDF.

### 1.3. Particularidades del Dominio

*   **Bimonetario:** todos los importes conviven en USD y ARS. El USD es la moneda canónica; los importes en ARS se convierten con el tipo de cambio congelado al momento de crear la reserva.
*   **Saldo calculado:** saldo = total (monto − descuento + cargos) − pagos. Nunca se persiste; la UI siempre muestra el valor actual.
*   **Advertencia de excedente:** si un pago supera el saldo pendiente, el sistema pide confirmación explícita antes de registrarlo.
*   **Sin solapamiento:** un departamento no admite dos reservas activas con fechas superpuestas (egreso = ingreso de la siguiente sí es válido).

---

## 2. Sistema de Diseño (Design System)

### 2.1. Paleta de Colores (existente — respetar los valores exactos)

Estilo general: cálido y sereno, evoca hospitalidad costera. Fondo crema, azul petróleo institucional y acentos dorados.

*   **Primario:** azul petróleo `#00526d` (botones primarios, links activos, títulos de marca). Variante container `#1a6b8a`; hover/tint `#106685`.
*   **Fondo general:** crema cálido `#F5F0E8`. Superficies de tarjetas: blanco `#ffffff` con sombra suave `0 2px 12px rgba(28,45,47,0.08)` ("shadow-warm"). Superficie alternativa `#FDFAF4`.
*   **Acento secundario:** ámbar/dorado — container `#fedb9c`, texto sobre container `#785f2b`. Se usa para ítem activo del sidebar y toggles seleccionados.
*   **Bordes de inputs y tablas:** dorado translúcido `#C8A96E` al 30% de opacidad (10% para divisores de filas).
*   **Texto:** principal `#0d1e20` (on-surface), secundario `#40484d` (on-surface-variant), terciario/deshabilitado `#70787e` (outline).
*   **Colores de Estado (Semánticos) — siempre acompañados de etiqueta de texto:**
    *   **Pagado / Éxito / Activo:** verde `#00573d` (tertiary), fondo `verde al 10%`.
    *   **Pendiente / Alerta:** ámbar `#735b28` (secondary), fondo al 10%.
    *   **Parcial / Informativo:** azul `#00526d` (primary), fondo al 10%.
    *   **Cancelado / Error:** rojo `#ba1a1a` (error), fondo al 10%; container de error `#ffdad6`. Acciones destructivas usan `#C86A5E`.

### 2.2. Accesibilidad (WCAG 2.1 AA — Prioridad Alta)

*   **Contraste:** mínimo 4.5:1 en texto normal y 3:1 en texto grande/componentes.
*   **Área táctil:** botones e inputs con altura mínima de 40–44px.
*   **Legibilidad:** texto base 15–16px; nunca menor a 12px (solo captions).
*   **Identificación visual:**
    *   Botones diferenciados del fondo con relleno, borde o sombra (no depender solo del color).
    *   Estados de foco (`focus`) visibles con borde/outline para navegación por teclado.
    *   Iconografía (Material Symbols Outlined) siempre con texto adyacente o `aria-label`.
    *   El color nunca es el único indicador de estado: los badges llevan la etiqueta escrita ("Pendiente", "Parcial", "Pagado", "Cancelado").
*   **Formularios:** labels siempre visibles (mayúsculas, 13px, tracking amplio); los placeholders son ejemplos, nunca reemplazan al label. Errores en banner con ícono + texto.

### 2.3. Tipografía y Layout

*   **Tipografía:** Plus Jakarta Sans (sans-serif). Jerarquía: H1 32px/700, H2 24px/600, H3 20px/600, cuerpo 16px (regular/medium/semibold), texto grande 18px, caption 13px, labels 13px/600 en mayúsculas con letter-spacing 0.05em.
*   **Estructura fija:** sidebar izquierdo de 256px (navegación: Dashboard, Reservas, Departamentos, Disponibilidad, Finanzas; "Cerrar sesión" abajo; el logotipo es solo el texto "GESCOM" — **sin isotipo ni ícono al lado**) + topbar de 80px con título de la pantalla, notificaciones y usuario.
*   **Espaciado — generoso (feedback explícito del usuario):**
    *   Unidad base 8px; separación entre secciones (gutter) 24px; margen de página 32px; ancho máximo de contenido 1440px.
    *   **Modales amplios:** ancho mínimo `max-w-3xl` (~768px) para modales con tablas o formularios (ej. pagos de una reserva), padding interno de 32px, y respiración vertical entre bloques (24px). Evitar modales angostos y comprimidos.
    *   Tarjetas y tablas con celdas de padding cómodo (16px vertical, 24px horizontal).
*   **Carga cognitiva:**
    *   Un objetivo principal por pantalla; máximo 2–3 acciones primarias visibles.
    *   Listados en tarjeta contenedora blanca con filtros arriba, tabla al centro y paginación abajo.
    *   Los cálculos automáticos (conversión de moneda, total con descuento, saldo) se muestran en paneles de solo lectura claramente diferenciados de los inputs.
*   **Bordes redondeados:** 8px en inputs/botones, 12px en tarjetas y modales.
*   **Idioma:** toda la UI en español (Argentina). Moneda: `$ 1.510,00` para ARS (separador de miles con punto) y `USD 1,510.00` para USD. Fechas `dd/mm/aaaa`.

### 2.4. Componentes Recurrentes

*   **Badge de estado:** píldora con fondo al 10% del color semántico + etiqueta de texto.
*   **Toggle de moneda USD/ARS:** segmentado, adosado al input de monto; opción activa con fondo ámbar.
*   **Panel de conversión:** caja gris/celeste suave de solo lectura con el tipo de cambio vigente (fuente y hora de dolarapi.com) y los montos equivalentes.
*   **Tabla de datos:** header con labels en mayúsculas 13px, hover de fila, columna de acciones a la derecha con botones de ícono (editar, cancelar, PDF, pagos) con tooltip; filas canceladas atenuadas.
*   **Filtros de listado:** barra en tarjeta con búsqueda por texto, rango de fechas, selects de departamento y estado.
*   **Confirmaciones:** las acciones destructivas o con consecuencias (cancelar reserva, eliminar pago, pago que excede el saldo) abren un diálogo de confirmación propio del sistema (nunca `window.confirm` del navegador): ícono de advertencia, título, mensaje con consecuencias, botón secundario para volver y botón primario (rojo si es destructivo).
*   **Toasts de notificación:** feedback de éxito/error en tarjetas flotantes arriba a la derecha, con borde izquierdo del color semántico, ícono, mensaje y cierre; se descartan solas a los 4 segundos. Toda acción exitosa (reserva creada, pago registrado, cambios guardados) muestra un toast.

---

## 3. Inventario de Pantallas y Vistas

### Bloque 0: Autenticación

*   **Iniciar Sesión:** usuario y contraseña, "recordarme", link de recuperación, manejo accesible de errores. Imagen/hero lateral opcional con estética de complejo turístico.
*   **Recuperación de Contraseña:** solicitud por correo y vista de reseteo.

### Bloque 1: Operación Diaria (implementado — rediseñar respetando funcionalidad)

*   **Dashboard (Resumen General):** tarjetas KPI (reservas activas, ingresos del mes, ocupación, saldos pendientes), próximos ingresos/egresos, accesos rápidos.
*   **Listado de Reservas:** filtros (cliente, rango de fechas, departamento, estado) + botón "Nueva Reserva". Tabla: cliente, departamento, ingreso, egreso, monto ARS, monto USD (totales con descuento aplicado, con indicador cuando hay descuento), badge de estado, acciones (registrar pago, editar, cancelar, descargar PDF). Paginación.
*   **Alta / Edición de Reserva (página completa):** formulario en tarjeta centrada (~800px): cliente, departamento (select), fechas de ingreso/egreso, monto con toggle USD/ARS, seña (solo en alta), descuento (tipo % o monto USD + valor), observaciones. Panel lateral de solo lectura: tipo de cambio actual (real, con fuente y hora) y conversión automática a pesos/dólares, más línea de descuento y total cuando aplica. Acciones: Cancelar / Guardar.
*   **Modal de Pagos de una Reserva (CU02):** amplio (ver 2.3). Resumen superior en tres tarjetas: Total / Pagado / Saldo pendiente (en USD y ARS). Historial de movimientos (fecha, concepto, medio, monto, eliminar con confirmación). Formulario de registro: fecha, monto con toggle USD/ARS, medio de pago (Efectivo, Transferencia, Tarjeta, Otro), concepto. Si el pago excede el saldo → advertencia de confirmación. Si el saldo es cero → mensaje de éxito en lugar del formulario.
*   **Listado de Departamentos:** búsqueda + filtro Activos/Inactivos + "Nuevo Departamento". Tabla: nombre, descripción, capacidad máxima, estado, acciones (editar, activar/desactivar). Modal de alta/edición: nombre, descripción, capacidad.

### Bloque 2: Próximas Pantallas (diseñar coherentes con el resto)

*   **Disponibilidad (Calendario):** vista mensual con los departamentos como filas (o grilla), bloques de reservas coloreados por estado, navegación entre meses, click en un bloque abre el detalle de la reserva, click en hueco libre inicia una reserva con fechas precargadas.
*   **Finanzas:** resumen de ingresos/egresos por período y por departamento, registro de movimientos (tipo, categoría, descripción, monto), gráficos simples de evolución mensual y exportación.

---

## 4. Reglas de Negocio Visibles en la UI

*   El tipo de cambio se muestra siempre que haya montos bimonetarios, con su fuente ("dolarapi.com — oficial venta") y fecha de actualización.
*   Al editar una reserva se conserva y muestra el tipo de cambio original de esa reserva (no el del día).
*   El estado de la reserva nunca se edita a mano: lo deriva el sistema de los pagos y el saldo.
*   Reservas canceladas: fila atenuada, sin acciones de edición/cancelación/pago; el PDF sigue disponible.
*   El descuento pertenece a la reserva (no a un pago) y aplica sobre el total; el porcentaje se recalcula si cambia el monto.
