/* =========================================================
  ReservaUJAP — Frontend (HTML + CSS + JavaScript puro)
  Todas las llamadas pasan por el API Gateway (Nginx):
    /api/auth, /api/usuarios -> Python   /api/espacios -> Node
    /api/reservas            -> Java     /api/reportes -> Go
    /ws                      -> Go (WebSocket)
   ========================================================= */

// Si se abre desde el contenedor del frontend (puerto 3000) se apunta al gateway en el puerto 80
const DESDE_FRONTEND = location.port === "3000";
const GATEWAY = DESDE_FRONTEND
	? `${location.protocol}//${location.hostname}`
	: "";
const API = `${GATEWAY}/api`;
const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${DESDE_FRONTEND ? location.hostname : location.host}/ws`;

const TIPOS = {
	laboratorio: "Laboratorio",
	aula: "Aula",
	auditorio: "Auditorio",
	sala_estudio: "Sala de estudio",
};
const ICONOS_TIPO = {
	laboratorio: "🖥️",
	aula: "🏫",
	auditorio: "🎤",
	sala_estudio: "📚",
};
const MAX_HORAS = { estudiante: 2, profesor: 4, admin: 8 };
const MESES = [
	"ene",
	"feb",
	"mar",
	"abr",
	"may",
	"jun",
	"jul",
	"ago",
	"sep",
	"oct",
	"nov",
	"dic",
];

const estado = {
	token: null,
	usuario: null,
	espacios: [],
	filtroTipo: "",
	busqueda: "",
	vista: "espacios",
	bloquesAgenda: [],
	ws: null,
	wsIntentos: 0,
};

// ---------------- Utilidades ----------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function esc(valor) {
	return String(valor ?? "").replace(
		/[&<>"']/g,
		(c) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[c],
	);
}

function hoyISO() {
	return new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local
}

function sumarDias(iso, dias) {
	const d = new Date(`${iso}T12:00:00`);
	d.setDate(d.getDate() + dias);
	return d.toLocaleDateString("en-CA");
}

function aMin(hhmm) {
	const [h, m] = hhmm.split(":").map(Number);
	return h * 60 + m;
}

function aHora(min) {
	return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function minutosAhora() {
	const d = new Date();
	return d.getHours() * 60 + d.getMinutes();
}

function fechaLarga(iso) {
	const d = new Date(`${iso}T12:00:00`);
	return d.toLocaleDateString("es-VE", {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

function hace(fechaISO) {
	const seg = Math.max(0, (Date.now() - new Date(fechaISO).getTime()) / 1000);
	if (seg < 60) return "hace unos segundos";
	if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
	if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
	return new Date(fechaISO).toLocaleString("es-VE");
}

function toast(mensaje, tipo = "") {
	const el = document.createElement("div");
	el.className = `toast ${tipo}`;
	el.textContent = mensaje;
	$("#toasts").appendChild(el);
	setTimeout(() => el.remove(), 4500);
}

function decodificarToken(token) {
	try {
		return JSON.parse(
			atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
		);
	} catch {
		return null;
	}
}

// ---------------- Cliente HTTP ----------------
async function api(ruta, { method = "GET", body, form } = {}) {
	const headers = {};
	if (estado.token) headers.Authorization = `Bearer ${estado.token}`;
	let payload;
	if (form) {
		headers["Content-Type"] = "application/x-www-form-urlencoded";
		payload = new URLSearchParams(form);
	} else if (body !== undefined) {
		headers["Content-Type"] = "application/json";
		payload = JSON.stringify(body);
	}

	let resp;
	try {
		resp = await fetch(`${API}${ruta}`, { method, headers, body: payload });
	} catch {
		throw new Error("No hay conexión con el API Gateway");
	}
	if (resp.status === 204) return null;

	const texto = await resp.text();
	let datos = null;
	try {
		datos = texto ? JSON.parse(texto) : null;
	} catch {
		datos = null;
	}

	if (!resp.ok) {
		if (
			resp.status === 401 &&
			estado.token &&
			!ruta.startsWith("/auth/login")
		) {
			cerrarSesion();
			throw new Error("Tu sesión expiró. Inicia sesión de nuevo");
		}
		let detalle = datos?.detail ?? `Error ${resp.status}`;
		if (Array.isArray(detalle))
			detalle = detalle.map((d) => d.msg).join(", ");
		if (resp.status === 502 || resp.status === 504)
			detalle = "El microservicio no está disponible en este momento";
		throw new Error(detalle);
	}
	return datos;
}

// ---------------- Sesion ----------------
function guardarSesion(token, usuario) {
	estado.token = token;
	estado.usuario = usuario;
	try {
		localStorage.setItem("ujap_token", token);
		localStorage.setItem("ujap_usuario", JSON.stringify(usuario));
	} catch {
		/* almacenamiento bloqueado: la sesion dura solo esta pestana */
	}
}

function cargarSesionGuardada() {
	try {
		const token = localStorage.getItem("ujap_token");
		const usuario = JSON.parse(
			localStorage.getItem("ujap_usuario") || "null",
		);
		const payload = token && decodificarToken(token);
		if (payload && usuario && payload.exp * 1000 > Date.now()) {
			estado.token = token;
			estado.usuario = usuario;
			return true;
		}
	} catch {
		/* sin sesion guardada */
	}
	return false;
}

function cerrarSesion() {
	estado.token = null;
	estado.usuario = null;
	try {
		localStorage.removeItem("ujap_token");
		localStorage.removeItem("ujap_usuario");
	} catch {
		/* nada que limpiar */
	}
	if (estado.ws) {
		estado.ws.onclose = null;
		estado.ws.close();
		estado.ws = null;
	}
	$("#vista-app").classList.add("oculto");
	$("#vista-login").classList.remove("oculto");
}

async function iniciarSesion(email, password) {
	const datos = await api("/auth/login", {
		method: "POST",
		form: { username: email, password },
	});
	guardarSesion(datos.access_token, datos.usuario);
	entrar();
}

function entrar() {
	const u = estado.usuario;
	$("#vista-login").classList.add("oculto");
	$("#vista-app").classList.remove("oculto");
	$("#usuario-nombre").textContent = u.nombre;
	$("#usuario-rol").textContent = u.rol;
	$("#avatar").textContent = u.nombre.trim().charAt(0).toUpperCase();
	$$(".solo-admin").forEach((el) =>
		el.classList.toggle("oculto", u.rol !== "admin"),
	);
	renderReglas();
	conectarWS();
	cargarEspacios().then(() => mostrarVista("espacios"));
}

// ---------------- Navegacion ----------------
function mostrarVista(nombre) {
	estado.vista = nombre;
	$$(".vista").forEach((v) => v.classList.add("oculto"));
	$(`#vista-${nombre}`).classList.remove("oculto");
	$$(".nav-item").forEach((b) =>
		b.classList.toggle("activo", b.dataset.vista === nombre),
	);

	if (nombre === "espacios") renderEspacios();
	if (nombre === "reservar") prepararReserva();
	if (nombre === "mias") cargarMias();
	if (nombre === "panel") cargarPanel();
	if (nombre === "admin") cargarAdmin();
}

// =========================================================
//  CATALOGO (servicio Node)
// =========================================================
async function cargarEspacios() {
	try {
		estado.espacios = await api("/espacios");
	} catch (err) {
		estado.espacios = [];
		toast(`Catálogo: ${err.message}`, "error");
	}
}

function renderCaracteristicas(obj) {
	const entradas = Object.entries(obj || {});
	if (!entradas.length) return "";
	const filas = entradas.map(([k, v]) => {
		let valor = v;
		if (Array.isArray(v)) valor = v.join(", ");
		else if (typeof v === "boolean") valor = v ? "Sí" : "No";
		else if (v && typeof v === "object") valor = JSON.stringify(v);
		return `<div><dt>${esc(k.replace(/_/g, " "))}</dt><dd>${esc(valor)}</dd></div>`;
	});
	return `<dl class="caracteristicas">${filas.join("")}</dl>`;
}

function renderEspacios() {
	const q = estado.busqueda.toLowerCase();
	const lista = estado.espacios.filter((e) => {
		if (estado.filtroTipo && e.tipo !== estado.filtroTipo) return false;
		if (!q) return true;
		return [e.nombre, e.codigo, e.edificio, e.descripcion].some((t) =>
			(t || "").toLowerCase().includes(q),
		);
	});

	if (!lista.length) {
		$("#lista-espacios").innerHTML =
			'<p class="vacio">No hay espacios que coincidan con la búsqueda.</p>';
		return;
	}
	$("#lista-espacios").innerHTML = lista
		.map(
			(e) => `
    <article class="tarjeta espacio ${e.activo ? "" : "inactivo"}">
      <div class="espacio-cab">
        <span class="espacio-codigo">${esc(e.codigo)}</span>
        ${
			e.activo
				? `<span class="badge">${ICONOS_TIPO[e.tipo] || ""} ${esc(TIPOS[e.tipo] || e.tipo)}</span>`
				: '<span class="badge badge-danger">Fuera de servicio</span>'
		}
      </div>
      <h4>${esc(e.nombre)}</h4>
      <div class="espacio-meta">
        <span>📍 ${esc(e.edificio)} · piso ${esc(e.piso)}</span>
        <span>👥 ${esc(e.capacidad)} personas</span>
      </div>
      ${e.descripcion ? `<p class="sub" style="margin:0">${esc(e.descripcion)}</p>` : ""}
      <div class="equipos">${(e.equipamiento || []).map((x) => `<span class="equipo">${esc(x)}</span>`).join("")}</div>
      ${renderCaracteristicas(e.caracteristicas)}
      <button class="btn btn-primario btn-bloque" data-reservar="${esc(e._id)}" ${e.activo ? "" : "disabled"}>Reservar</button>
    </article>`,
		)
		.join("");
}

// =========================================================
//  RESERVAR (servicio Java) + AGENDA EN VIVO
// =========================================================
function renderReglas() {
	const rol = estado.usuario?.rol || "estudiante";
	const reglas = [
		"Horario: 07:00 a 21:00 en bloques de 30 minutos",
		`Con tu rol (${rol}) puedes reservar hasta ${MAX_HORAS[rol] || 2} horas seguidas`,
		"Se reserva desde hoy hasta 30 días de anticipación",
		"Los asistentes no pueden superar la capacidad del espacio",
	];
	if (rol === "estudiante") {
		reglas.push("Máximo 3 reservas activas a la vez");
		reglas.push("Los auditorios solo los reservan profesores");
	}
	$("#reglas").innerHTML =
		`<strong>Reglas de reserva</strong><ul>${reglas.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
}

function prepararReserva(espacioId) {
	const sel = $("#sel-espacio");
	const actual = espacioId || sel.value;
	const activos = estado.espacios.filter((e) => e.activo);
	sel.innerHTML = activos
		.map(
			(e) =>
				`<option value="${esc(e._id)}">${esc(e.codigo)} — ${esc(e.nombre)}</option>`,
		)
		.join("");
	if (actual && activos.some((e) => e._id === actual)) sel.value = actual;

	const fecha = $("#inp-fecha");
	fecha.min = hoyISO();
	fecha.max = sumarDias(hoyISO(), 30);
	if (!fecha.value || fecha.value < fecha.min) fecha.value = hoyISO();

	llenarHorasInicio();
	renderInfoEspacio();
	cargarAgenda();
}

function espacioSeleccionado() {
	return estado.espacios.find((e) => e._id === $("#sel-espacio").value);
}

function renderInfoEspacio() {
	const e = espacioSeleccionado();
	if (!e) {
		$("#info-espacio").innerHTML = "";
		return;
	}
	$("#info-espacio").innerHTML =
		`${ICONOS_TIPO[e.tipo] || ""} ${esc(TIPOS[e.tipo])} · ${esc(e.edificio)} · capacidad <strong>${esc(e.capacidad)}</strong>`;
	$("#inp-asistentes").max = e.capacidad;
}

function llenarHorasInicio() {
	const sel = $("#sel-inicio");
	const previo = sel.value;
	const opciones = [];
	for (let m = 7 * 60; m < 21 * 60; m += 30) opciones.push(aHora(m));
	sel.innerHTML = opciones
		.map((h) => `<option value="${h}">${h}</option>`)
		.join("");
	if (previo && opciones.includes(previo)) {
		sel.value = previo;
	} else if ($("#inp-fecha").value === hoyISO()) {
		// Primer bloque futuro de hoy
		const siguiente = opciones.find((h) => aMin(h) > minutosAhora());
		if (siguiente) sel.value = siguiente;
	}
	llenarHorasFin();
}

function llenarHorasFin() {
	const inicio = aMin($("#sel-inicio").value || "07:00");
	const maxMin = (MAX_HORAS[estado.usuario?.rol] || 2) * 60;
	const sel = $("#sel-fin");
	const previo = sel.value;
	const opciones = [];
	for (let m = inicio + 30; m <= Math.min(21 * 60, inicio + maxMin); m += 30)
		opciones.push(aHora(m));
	sel.innerHTML = opciones
		.map((h) => `<option value="${h}">${h}</option>`)
		.join("");
	if (previo && opciones.includes(previo)) sel.value = previo;
	else sel.value = opciones[Math.min(1, opciones.length - 1)] || "";
	marcarSeleccion();
}

async function cargarAgenda(resaltar = false) {
	const espacio = espacioSeleccionado();
	const fecha = $("#inp-fecha").value;
	if (!espacio || !fecha) {
		$("#agenda").innerHTML = '<p class="vacio">Selecciona un espacio</p>';
		return;
	}
	$("#agenda-titulo").textContent =
		`${espacio.codigo} · ${fechaLarga(fecha)}`;
	try {
		estado.bloquesAgenda = await api(
			`/reservas/disponibilidad?espacioId=${encodeURIComponent(espacio._id)}&fecha=${fecha}`,
		);
	} catch (err) {
		estado.bloquesAgenda = [];
		toast(`Agenda: ${err.message}`, "error");
	}
	renderAgenda(resaltar);
}

function renderAgenda(resaltar) {
	const fecha = $("#inp-fecha").value;
	const esHoy = fecha === hoyISO();
	const ahora = minutosAhora();
	let html = "";
	for (let m = 7 * 60; m < 21 * 60; m += 30) {
		const bloque = estado.bloquesAgenda.find(
			(b) => aMin(b.horaInicio) <= m && aMin(b.horaFin) > m,
		);
		let clase = "libre";
		let texto = "";
		if (bloque) {
			const mio = bloque.usuarioNombre === estado.usuario?.nombre;
			clase = `ocupado${mio ? " mio" : ""}${resaltar ? " flash" : ""}`;
			if (aMin(bloque.horaInicio) === m) {
				texto = `${bloque.horaInicio}–${bloque.horaFin} · ${mio ? "Tu reserva" : esc(bloque.usuarioNombre)} · ${esc(bloque.motivo)}`;
			}
		} else if (esHoy && m <= ahora) {
			clase = "pasado";
		}
		html += `<div class="agenda-hora">${aHora(m)}</div><div class="agenda-slot ${clase}" data-min="${m}">${texto}</div>`;
	}
	$("#agenda").innerHTML = html;
	marcarSeleccion();
}

function marcarSeleccion() {
	const ini = aMin($("#sel-inicio").value || "00:00");
	const fin = aMin($("#sel-fin").value || "00:00");
	$$(".agenda-slot").forEach((s) => {
		const m = Number(s.dataset.min);
		s.classList.toggle(
			"seleccion",
			s.classList.contains("libre") && m >= ini && m < fin,
		);
	});
}

async function enviarReserva(ev) {
	ev.preventDefault();
	const f = new FormData(ev.target);
	const body = {
		espacioId: f.get("espacioId"),
		fecha: f.get("fecha"),
		horaInicio: f.get("horaInicio"),
		horaFin: f.get("horaFin"),
		asistentes: Number(f.get("asistentes")),
		motivo: f.get("motivo"),
	};
	const boton = ev.target.querySelector('button[type="submit"]');
	boton.disabled = true;
	try {
		const r = await api("/reservas", { method: "POST", body });
		toast(
			`Reserva confirmada: ${r.espacioCodigo} ${r.horaInicio}–${r.horaFin}`,
			"ok",
		);
		ev.target.motivo.value = "";
		cargarAgenda();
	} catch (err) {
		toast(err.message, "error");
	} finally {
		boton.disabled = false;
	}
}

// =========================================================
//  MIS RESERVAS
// =========================================================
function reservaFutura(r) {
	return (
		r.fecha > hoyISO() ||
		(r.fecha === hoyISO() && aMin(r.horaInicio) > minutosAhora())
	);
}

async function cargarMias() {
	let reservas = [];
	try {
		reservas = await api("/reservas/mias");
	} catch (err) {
		toast(err.message, "error");
	}
	if (!reservas.length) {
		$("#lista-mias").innerHTML =
			'<p class="vacio tarjeta">Todavía no tienes reservas. Ve a <strong>Espacios</strong> y aparta uno.</p>';
		return;
	}
	$("#lista-mias").innerHTML = reservas
		.map((r) => {
			const d = new Date(`${r.fecha}T12:00:00`);
			const activa = r.estado === "ACTIVA";
			const cancelable = activa && reservaFutura(r);
			let badge = '<span class="badge badge-danger">Cancelada</span>';
			if (activa)
				badge = reservaFutura(r)
					? '<span class="badge badge-ok">Activa</span>'
					: '<span class="badge">Finalizada</span>';
			return `
      <article class="tarjeta reserva ${activa ? "" : "cancelada"}">
        <div class="reserva-fecha"><div class="dia">${d.getDate()}</div><div class="mes">${MESES[d.getMonth()]}</div></div>
        <div>
          <h4>${esc(r.espacioCodigo)} — ${esc(r.espacioNombre)}</h4>
          <div class="reserva-meta">
            <span>🕒 ${esc(r.horaInicio)}–${esc(r.horaFin)}</span>
            <span>👥 ${esc(r.asistentes)}</span>
            <span>📝 ${esc(r.motivo)}</span>
          </div>
        </div>
        <div class="reserva-acciones">
          ${badge}
          ${cancelable ? `<button class="btn btn-peligro btn-chico" data-cancelar="${r.id}">Cancelar</button>` : ""}
        </div>
      </article>`;
		})
		.join("");
}

async function cancelarReserva(id) {
	if (!confirm("¿Seguro que quieres cancelar esta reserva?")) return;
	try {
		await api(`/reservas/${id}/cancelar`, { method: "PATCH" });
		toast("Reserva cancelada", "ok");
		if (estado.vista === "mias") cargarMias();
		if (estado.vista === "admin") cargarAdmin();
	} catch (err) {
		toast(err.message, "error");
	}
}

// =========================================================
//  PANEL (servicio Go)
// =========================================================
async function cargarPanel() {
	const [resumen, ocupacion, horas, actividad] = await Promise.allSettled([
		api("/reportes/resumen"),
		api("/reportes/ocupacion"),
		api("/reportes/horas-pico"),
		api("/reportes/actividad?limite=15"),
	]);
	if (resumen.status === "fulfilled") renderStats(resumen.value);
	else
		$("#stats").innerHTML =
			`<p class="vacio tarjeta">Reportes no disponibles: ${esc(resumen.reason.message)}</p>`;
	if (ocupacion.status === "fulfilled")
		renderOcupacion(ocupacion.value.espacios || []);
	if (horas.status === "fulfilled") renderHoras(horas.value);
	if (actividad.status === "fulfilled") renderActividad(actividad.value);
	cargarServicios();
}

function renderStats(r) {
	const tarjetas = [
		{
			valor: r.reservasActivas,
			label: "Reservas activas",
			extra: r.espacioMasReservado?.nombre
				? `Más pedido: ${r.espacioMasReservado.nombre}`
				: `${r.reservasProximas} próximas`,
		},
		{
			valor: r.reservasHoy,
			label: "Reservas para hoy",
			extra: fechaLarga(hoyISO()),
		},
		{
			valor: (r.horasReservadas || 0).toFixed(1),
			label: "Horas reservadas",
			extra: `${r.usuariosDistintos} usuarios distintos`,
		},
		{
			valor: r.espaciosActivos ?? "—",
			label: "Espacios disponibles",
			extra: `de ${r.totalEspacios ?? "—"} en el catálogo`,
		},
		{
			valor: r.reservasCanceladas,
			label: "Cancelaciones",
			extra: "reservas liberadas",
		},
		{
			valor: r.conectadosEnVivo,
			label: "Conectados en vivo",
			extra: "vía WebSocket",
		},
	];
	$("#stats").innerHTML = tarjetas
		.map(
			(t) => `
    <div class="stat">
      <div class="stat-valor">${esc(t.valor)}</div>
      <div class="stat-label">${esc(t.label)}</div>
      <div class="stat-extra">${esc(t.extra)}</div>
    </div>`,
		)
		.join("");
}

function renderOcupacion(espacios) {
	if (!espacios.length) {
		$("#graf-ocupacion").innerHTML = '<p class="vacio">Sin datos</p>';
		return;
	}
	const max = Math.max(...espacios.map((e) => e.horas), 1);
	$("#graf-ocupacion").innerHTML = espacios
		.map(
			(e) => `
    <div class="barra" title="${esc(e.nombre)} · ${e.reservas} reservas">
      <span class="barra-nombre"><strong>${esc(e.codigo)}</strong> ${esc(e.nombre)}</span>
      <div class="barra-pista"><div class="barra-relleno" style="width:${(e.horas / max) * 100}%"></div></div>
      <span class="barra-valor">${e.horas.toFixed(1)} h</span>
    </div>`,
		)
		.join("");
}

function renderHoras(horas) {
	const max = Math.max(...horas.map((h) => h.reservas), 1);
	const pico = Math.max(...horas.map((h) => h.reservas));
	$("#graf-horas").innerHTML = horas
		.map(
			(h) => `
    <div class="columna ${h.reservas === pico && pico > 0 ? "pico" : ""}" title="${h.hora}: ${h.reservas} reservas">
      <span class="columna-valor">${h.reservas || ""}</span>
      <div class="columna-barra" style="height:${(h.reservas / max) * 100}%"></div>
      <span class="columna-hora">${h.hora.slice(0, 2)}</span>
    </div>`,
		)
		.join("");
}

function itemActividad(e, nuevo = false) {
	const creada = e.tipo === "CREADA";
	return `
    <li class="${creada ? "creada" : "cancelada"} ${nuevo ? "nuevo" : ""}">
      <span class="icono">${creada ? "✚" : "✕"}</span>
      <div>
        <strong>${esc(e.usuarioNombre)}</strong> ${creada ? "reservó" : "canceló"}
        <strong>${esc(e.espacioCodigo)}</strong> el ${esc(e.fecha)} de ${esc(e.horaInicio)} a ${esc(e.horaFin)}
        <time>${hace(e.CreatedAt || e.hora || new Date().toISOString())}</time>
      </div>
    </li>`;
}

function renderActividad(eventos) {
	$("#actividad").innerHTML = eventos.length
		? eventos.map((e) => itemActividad(e)).join("")
		: "<li>Sin actividad todavía. Las reservas aparecerán aquí en tiempo real.</li>";
}

async function cargarServicios() {
	const servicios = [
		{ id: "python", nombre: "Python · FastAPI", bd: "PostgreSQL" },
		{ id: "node", nombre: "Node · Express", bd: "MongoDB" },
		{ id: "java", nombre: "Java · Spring Boot", bd: "PostgreSQL" },
		{ id: "go", nombre: "Go · Gin", bd: "PostgreSQL + WS" },
		{ id: "gateway", nombre: "Nginx · Gateway", bd: "puerto 80" },
	];
	const resultados = await Promise.all(
		servicios.map(async (s) => {
			const t0 = performance.now();
			try {
				const r = await fetch(`${API}/health/${s.id}`);
				return {
					...s,
					ok: r.ok,
					ms: Math.round(performance.now() - t0),
				};
			} catch {
				return { ...s, ok: false, ms: null };
			}
		}),
	);
	$("#servicios").innerHTML = resultados
		.map(
			(s) => `
    <div class="servicio ${s.ok ? "ok" : "error"}">
      <span class="punto"></span>
      <div><strong>${esc(s.nombre)}</strong><span>${esc(s.bd)} · ${s.ok ? `${s.ms} ms` : "sin respuesta"}</span></div>
    </div>`,
		)
		.join("");
}

// =========================================================
//  ADMINISTRACION
// =========================================================
async function cargarAdmin() {
	await cargarEspacios();
	renderAdminEspacios();
	const [usuarios, reservas] = await Promise.allSettled([
		api("/usuarios"),
		api("/reservas"),
	]);

	$("#admin-usuarios").innerHTML =
		usuarios.status === "fulfilled"
			? `<table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th></tr></thead><tbody>
        ${usuarios.value.map((u) => `<tr><td>${esc(u.nombre)}</td><td>${esc(u.email)}</td><td><span class="badge">${esc(u.rol)}</span></td></tr>`).join("")}
      </tbody></table>`
			: `<p class="vacio">${esc(usuarios.reason.message)}</p>`;

	$("#admin-reservas").innerHTML =
		reservas.status === "fulfilled"
			? reservas.value.length
				? `<table><thead><tr><th>Fecha</th><th>Horario</th><th>Espacio</th><th>Usuario</th><th>Estado</th><th></th></tr></thead><tbody>
        ${reservas.value
			.map(
				(r) => `<tr>
          <td>${esc(r.fecha)}</td><td>${esc(r.horaInicio)}–${esc(r.horaFin)}</td>
          <td>${esc(r.espacioCodigo)}</td><td>${esc(r.usuarioNombre)}</td>
          <td><span class="badge ${r.estado === "ACTIVA" ? "badge-ok" : "badge-danger"}">${esc(r.estado)}</span></td>
          <td>${r.estado === "ACTIVA" && reservaFutura(r) ? `<button class="btn btn-peligro btn-chico" data-cancelar="${r.id}">Cancelar</button>` : ""}</td>
        </tr>`,
			)
			.join("")}
      </tbody></table>`
				: '<p class="vacio">No hay reservas registradas.</p>'
			: `<p class="vacio">${esc(reservas.reason.message)}</p>`;
}

function renderAdminEspacios() {
	$("#admin-espacios").innerHTML =
		`<table><thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Cap.</th><th>Estado</th><th></th></tr></thead><tbody>
    ${estado.espacios
		.map(
			(e) => `<tr>
      <td><strong>${esc(e.codigo)}</strong></td><td>${esc(e.nombre)}</td><td>${esc(TIPOS[e.tipo])}</td><td>${esc(e.capacidad)}</td>
      <td><span class="badge ${e.activo ? "badge-ok" : "badge-danger"}">${e.activo ? "Activo" : "Inactivo"}</span></td>
      <td><div class="acciones">
        <button class="btn btn-fantasma btn-chico" data-editar="${esc(e._id)}">Editar</button>
        <button class="btn btn-fantasma btn-chico" data-toggle="${esc(e._id)}">${e.activo ? "Desactivar" : "Activar"}</button>
        <button class="btn btn-peligro btn-chico" data-eliminar="${esc(e._id)}">Eliminar</button>
      </div></td>
    </tr>`,
		)
		.join("")}
  </tbody></table>`;
}

function limpiarFormEspacio() {
	const f = $("#form-espacio");
	f.reset();
	f.id.value = "";
	$("#titulo-form-espacio").textContent = "Nuevo espacio";
}

function editarEspacio(id) {
	const e = estado.espacios.find((x) => x._id === id);
	if (!e) return;
	const f = $("#form-espacio");
	f.id.value = e._id;
	f.codigo.value = e.codigo;
	f.tipo.value = e.tipo;
	f.nombre.value = e.nombre;
	f.edificio.value = e.edificio;
	f.piso.value = e.piso;
	f.capacidad.value = e.capacidad;
	f.descripcion.value = e.descripcion || "";
	f.equipamiento.value = (e.equipamiento || []).join(", ");
	f.caracteristicas.value = Object.keys(e.caracteristicas || {}).length
		? JSON.stringify(e.caracteristicas, null, 2)
		: "";
	f.activo.checked = e.activo;
	$("#titulo-form-espacio").textContent = `Editando ${e.codigo}`;
	f.scrollIntoView({ behavior: "smooth" });
}

async function guardarEspacio(ev) {
	ev.preventDefault();
	const f = ev.target;
	let caracteristicas = {};
	if (f.caracteristicas.value.trim()) {
		try {
			caracteristicas = JSON.parse(f.caracteristicas.value);
		} catch {
			toast("Las características deben ser un JSON válido", "error");
			return;
		}
	}
	const body = {
		codigo: f.codigo.value,
		tipo: f.tipo.value,
		nombre: f.nombre.value,
		edificio: f.edificio.value,
		piso: Number(f.piso.value),
		capacidad: Number(f.capacidad.value),
		descripcion: f.descripcion.value,
		equipamiento: f.equipamiento.value
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		caracteristicas,
		activo: f.activo.checked,
	};
	try {
		if (f.id.value)
			await api(`/espacios/${f.id.value}`, { method: "PUT", body });
		else await api("/espacios", { method: "POST", body });
		toast(`Espacio ${body.codigo.toUpperCase()} guardado`, "ok");
		limpiarFormEspacio();
		await cargarEspacios();
		renderAdminEspacios();
	} catch (err) {
		toast(err.message, "error");
	}
}

async function alternarEspacio(id) {
	const e = estado.espacios.find((x) => x._id === id);
	try {
		await api(`/espacios/${id}`, {
			method: "PUT",
			body: { activo: !e.activo },
		});
		await cargarEspacios();
		renderAdminEspacios();
	} catch (err) {
		toast(err.message, "error");
	}
}

async function eliminarEspacio(id) {
	const e = estado.espacios.find((x) => x._id === id);
	if (!confirm(`¿Eliminar ${e.codigo} del catálogo?`)) return;
	try {
		await api(`/espacios/${id}`, { method: "DELETE" });
		toast(`Espacio ${e.codigo} eliminado`, "ok");
		await cargarEspacios();
		renderAdminEspacios();
	} catch (err) {
		toast(err.message, "error");
	}
}

// =========================================================
//  WEBSOCKET (servicio Go)
// =========================================================
function conectarWS() {
	if (estado.ws) return;
	const ws = new WebSocket(WS_URL);
	estado.ws = ws;

	ws.onopen = () => {
		estado.wsIntentos = 0;
		$("#estado-ws").classList.add("conectado");
		$("#texto-ws").textContent = "En vivo";
	};

	ws.onmessage = (event) => {
		let msg;
		try {
			msg = JSON.parse(event.data);
		} catch {
			return;
		}
		if (msg.tipo === "conectados") {
			const n = msg.data.total;
			$("#texto-ws").textContent =
				`En vivo · ${n} ${n === 1 ? "conectado" : "conectados"}`;
			return;
		}
		if (msg.tipo === "reserva_creada" || msg.tipo === "reserva_cancelada")
			manejarEventoReserva(msg);
	};

	ws.onclose = () => {
		estado.ws = null;
		$("#estado-ws").classList.remove("conectado");
		$("#texto-ws").textContent = "Reconectando…";
		if (!estado.token) return;
		const espera = Math.min(15000, 1000 * 2 ** estado.wsIntentos++);
		setTimeout(conectarWS, espera);
	};
}

function manejarEventoReserva(msg) {
	const d = msg.data;
	const creada = msg.tipo === "reserva_creada";
	const propio = d.usuarioNombre === estado.usuario?.nombre;
	if (!propio) {
		toast(
			`${d.usuarioNombre} ${creada ? "reservó" : "liberó"} ${d.espacioCodigo} (${d.horaInicio}–${d.horaFin})`,
			"vivo",
		);
	}

	if (
		estado.vista === "reservar" &&
		d.espacioId === $("#sel-espacio").value &&
		d.fecha === $("#inp-fecha").value
	) {
		cargarAgenda(true);
	}
	if (estado.vista === "panel") {
		const lista = $("#actividad");
		if (
			lista.firstElementChild &&
			!lista.firstElementChild.classList.length
		)
			lista.innerHTML = "";
		lista.insertAdjacentHTML(
			"afterbegin",
			itemActividad(
				{ ...d, tipo: creada ? "CREADA" : "CANCELADA", hora: msg.hora },
				true,
			),
		);
		cargarPanel();
	}
	if (estado.vista === "mias" && propio) cargarMias();
	if (estado.vista === "admin") cargarAdmin();
}

// =========================================================
//  EVENTOS DE LA INTERFAZ
// =========================================================
function registrarEventos() {
	// Login / registro
	$$(".tab-login").forEach((tab) =>
		tab.addEventListener("click", () => {
			$$(".tab-login").forEach((t) =>
				t.classList.toggle("activo", t === tab),
			);
			$("#form-login").classList.toggle(
				"oculto",
				tab.dataset.tab !== "login",
			);
			$("#form-registro").classList.toggle(
				"oculto",
				tab.dataset.tab !== "registro",
			);
		}),
	);

	$$("[data-demo]").forEach((b) =>
		b.addEventListener("click", () => {
			$("#form-login").username.value = b.dataset.demo;
			$("#form-login").password.value = "ujap2026";
		}),
	);

	$("#form-login").addEventListener("submit", async (ev) => {
		ev.preventDefault();
		const f = ev.target;
		try {
			await iniciarSesion(f.username.value, f.password.value);
		} catch (err) {
			toast(err.message, "error");
		}
	});

	$("#form-registro").addEventListener("submit", async (ev) => {
		ev.preventDefault();
		const f = ev.target;
		try {
			await api("/auth/registro", {
				method: "POST",
				body: {
					nombre: f.nombre.value,
					email: f.email.value,
					password: f.password.value,
					rol: f.rol.value,
					carrera: f.carrera.value || null,
				},
			});
			toast("Cuenta creada. ¡Bienvenido!", "ok");
			await iniciarSesion(f.email.value, f.password.value);
		} catch (err) {
			toast(err.message, "error");
		}
	});

	$("#btn-salir").addEventListener("click", cerrarSesion);

	// Navegacion
	$$(".nav-item").forEach((b) =>
		b.addEventListener("click", () => mostrarVista(b.dataset.vista)),
	);

	// Catalogo
	$("#buscar-espacio").addEventListener("input", (ev) => {
		estado.busqueda = ev.target.value;
		renderEspacios();
	});
	$$("#filtros-tipo .chip").forEach((chip) =>
		chip.addEventListener("click", () => {
			$$("#filtros-tipo .chip").forEach((c) =>
				c.classList.toggle("activo", c === chip),
			);
			estado.filtroTipo = chip.dataset.tipo;
			renderEspacios();
		}),
	);
	$("#lista-espacios").addEventListener("click", (ev) => {
		const id = ev.target.closest("[data-reservar]")?.dataset.reservar;
		if (id) {
			mostrarVista("reservar");
			prepararReserva(id);
		}
	});

	// Reserva
	$("#sel-espacio").addEventListener("change", () => {
		renderInfoEspacio();
		cargarAgenda();
	});
	$("#inp-fecha").addEventListener("change", () => {
		llenarHorasInicio();
		cargarAgenda();
	});
	$("#sel-inicio").addEventListener("change", llenarHorasFin);
	$("#sel-fin").addEventListener("change", marcarSeleccion);
	$("#agenda").addEventListener("click", (ev) => {
		const slot = ev.target.closest(
			".agenda-slot.libre, .agenda-slot.seleccion",
		);
		if (!slot) return;
		$("#sel-inicio").value = aHora(Number(slot.dataset.min));
		llenarHorasFin();
	});
	$("#form-reserva").addEventListener("submit", enviarReserva);

	// Cancelaciones (mis reservas y admin)
	document.addEventListener("click", (ev) => {
		const id = ev.target.closest("[data-cancelar]")?.dataset.cancelar;
		if (id) cancelarReserva(id);
	});

	// Admin
	$("#form-espacio").addEventListener("submit", guardarEspacio);
	$("#btn-cancelar-edicion").addEventListener("click", limpiarFormEspacio);
	$("#admin-espacios").addEventListener("click", (ev) => {
		const b = ev.target.closest("button");
		if (!b) return;
		if (b.dataset.editar) editarEspacio(b.dataset.editar);
		if (b.dataset.toggle) alternarEspacio(b.dataset.toggle);
		if (b.dataset.eliminar) eliminarEspacio(b.dataset.eliminar);
	});
}

// ---------------- Inicio ----------------
registrarEventos();
if (cargarSesionGuardada()) entrar();
else $("#vista-login").classList.remove("oculto");
