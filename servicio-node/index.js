/**
 * ReservaUJAP — Servicio de Catalogo de Espacios (Node.js + Express)
 *
 * - CRUD de laboratorios, aulas, auditorios y salas de estudio
 * - Datos en MongoDB con Mongoose (documentos JSON flexibles)
 * - Lectura publica (la usan el frontend, Java y Go)
 * - Escritura solo para admin (JWT emitido por el servicio Python)
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const Espacio = require("./models/Espacio");
const { verificarToken, soloAdmin } = require("./middleware/auth");
const { sembrarCatalogo } = require("./seed");

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL || !process.env.SECRET_KEY) {
	console.error("Faltan variables de entorno MONGO_URL o SECRET_KEY");
	process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const CAMPOS_EDITABLES = [
	"codigo",
	"nombre",
	"tipo",
	"edificio",
	"piso",
	"capacidad",
	"descripcion",
	"equipamiento",
	"caracteristicas",
	"activo",
];

function soloCamposEditables(body) {
	const datos = {};
	for (const campo of CAMPOS_EDITABLES) {
		if (body[campo] !== undefined) datos[campo] = body[campo];
	}
	return datos;
}

function escaparRegex(texto) {
	return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Traduce los errores de Mongoose a respuestas HTTP claras
function manejarError(res, err) {
	if (err.name === "ValidationError") {
		const detalle = Object.values(err.errors)
			.map((e) => e.message)
			.join(", ");
		return res.status(422).json({ detail: detalle });
	}
	if (err.name === "CastError") {
		return res.status(404).json({ detail: "Espacio no encontrado" });
	}
	if (err.code === 11000) {
		return res
			.status(409)
			.json({ detail: "Ya existe un espacio con ese codigo" });
	}
	console.error(err);
	return res
		.status(500)
		.json({ detail: "Error interno del servicio de catalogo" });
}

// ---------- Salud ----------
app.get("/health", (req, res) => {
	const conectado = mongoose.connection.readyState === 1;
	res.status(conectado ? 200 : 503).json({
		servicio: "node-catalogo",
		estado: conectado ? "ok" : "sin conexion a MongoDB",
		bd: "mongodb",
	});
});

// ---------- Lectura publica ----------
// GET /espacios?tipo=laboratorio&q=redes&equipo=Proyector&activo=true
app.get("/espacios", async (req, res) => {
	try {
		const filtro = {};
		if (req.query.tipo) filtro.tipo = req.query.tipo;
		if (req.query.activo !== undefined)
			filtro.activo = req.query.activo === "true";
		if (req.query.equipo) filtro.equipamiento = req.query.equipo;
		if (req.query.q) {
			const re = new RegExp(escaparRegex(req.query.q), "i");
			filtro.$or = [
				{ nombre: re },
				{ codigo: re },
				{ edificio: re },
				{ descripcion: re },
			];
		}
		const espacios = await Espacio.find(filtro).sort({ codigo: 1 });
		res.json(espacios);
	} catch (err) {
		manejarError(res, err);
	}
});

app.get("/espacios/:id", async (req, res) => {
	try {
		const espacio = await Espacio.findById(req.params.id);
		if (!espacio)
			return res.status(404).json({ detail: "Espacio no encontrado" });
		res.json(espacio);
	} catch (err) {
		manejarError(res, err);
	}
});

// ---------- Escritura (solo admin) ----------
app.post("/espacios", verificarToken, soloAdmin, async (req, res) => {
	try {
		const espacio = new Espacio(soloCamposEditables(req.body));
		await espacio.save();
		res.status(201).json(espacio);
	} catch (err) {
		manejarError(res, err);
	}
});

app.put("/espacios/:id", verificarToken, soloAdmin, async (req, res) => {
	try {
		const espacio = await Espacio.findByIdAndUpdate(
			req.params.id,
			soloCamposEditables(req.body),
			{ new: true, runValidators: true },
		);
		if (!espacio)
			return res.status(404).json({ detail: "Espacio no encontrado" });
		res.json(espacio);
	} catch (err) {
		manejarError(res, err);
	}
});

app.delete("/espacios/:id", verificarToken, soloAdmin, async (req, res) => {
	try {
		const espacio = await Espacio.findByIdAndDelete(req.params.id);
		if (!espacio)
			return res.status(404).json({ detail: "Espacio no encontrado" });
		res.status(204).send();
	} catch (err) {
		manejarError(res, err);
	}
});

// ---------- Arranque ----------
async function conectarConReintentos(intentos = 10) {
	for (let i = 1; i <= intentos; i++) {
		try {
			await mongoose.connect(MONGO_URL);
			console.log("Conectado a MongoDB");
			return;
		} catch (err) {
			console.log(
				`MongoDB no disponible (intento ${i}/${intentos}): ${err.message}`,
			);
			await new Promise((r) => setTimeout(r, 3000));
		}
	}
	throw new Error("No se pudo conectar a MongoDB");
}

conectarConReintentos()
	.then(sembrarCatalogo)
	.then(() =>
		app.listen(PORT, () =>
			console.log(`Servicio de catalogo en puerto ${PORT}`),
		),
	)
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
