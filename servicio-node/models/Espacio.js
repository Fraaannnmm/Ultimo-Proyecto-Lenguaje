const mongoose = require("mongoose");

// Cada espacio tiene un equipamiento distinto: un laboratorio guarda
// sus PCs y software, un auditorio su sonido y tarima. Por eso usamos
// MongoDB: "caracteristicas" es un documento JSON flexible.
const espacioSchema = new mongoose.Schema(
	{
		codigo: {
			type: String,
			required: true,
			unique: true,
			uppercase: true,
			trim: true,
		},
		nombre: { type: String, required: true, trim: true },
		tipo: {
			type: String,
			required: true,
			enum: ["laboratorio", "aula", "auditorio", "sala_estudio"],
		},
		edificio: { type: String, required: true },
		piso: { type: Number, default: 1 },
		capacidad: { type: Number, required: true, min: 1 },
		descripcion: String,
		equipamiento: { type: [String], default: [] },
		caracteristicas: { type: mongoose.Schema.Types.Mixed, default: {} },
		activo: { type: Boolean, default: true },
	},
	{ timestamps: true, minimize: false },
);

module.exports = mongoose.model("Espacio", espacioSchema);
