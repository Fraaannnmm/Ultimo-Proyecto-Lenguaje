const Espacio = require("./models/Espacio");

// Catalogo inicial: se inserta solo si la coleccion esta vacia
const espaciosIniciales = [
	{
		codigo: "LAB-01",
		nombre: "Laboratorio de Redes",
		tipo: "laboratorio",
		edificio: "Edificio de Ingenieria",
		piso: 2,
		capacidad: 30,
		descripcion:
			"Laboratorio con racks, switches y routers para practicas de redes.",
		equipamiento: ["Proyector", "Aire acondicionado", "Pizarra"],
		caracteristicas: {
			computadoras: 30,
			sistema_operativo: "Ubuntu 24.04",
			equipos_red: ["Cisco 2960", "Router 1941"],
			software: ["Packet Tracer", "Wireshark"],
		},
	},
	{
		codigo: "LAB-02",
		nombre: "Laboratorio de Programacion",
		tipo: "laboratorio",
		edificio: "Edificio de Ingenieria",
		piso: 2,
		capacidad: 35,
		descripcion:
			"Computadoras de alto rendimiento para desarrollo de software.",
		equipamiento: ["Proyector", "Aire acondicionado", "Pizarra"],
		caracteristicas: {
			computadoras: 35,
			sistema_operativo: "Windows 11 / WSL",
			software: ["VS Code", "Docker", "IntelliJ", "Go", "Node.js"],
		},
	},
	{
		codigo: "LAB-03",
		nombre: "Laboratorio de Electronica",
		tipo: "laboratorio",
		edificio: "Edificio de Ingenieria",
		piso: 1,
		capacidad: 20,
		descripcion: "Mesas de trabajo con instrumentos de medicion.",
		equipamiento: ["Aire acondicionado", "Pizarra"],
		caracteristicas: {
			mesas: 10,
			osciloscopios: 10,
			fuentes_poder: 10,
			kits: ["Arduino", "ESP32", "Raspberry Pi"],
		},
	},
	{
		codigo: "A-201",
		nombre: "Aula 201",
		tipo: "aula",
		edificio: "Edificio A",
		piso: 2,
		capacidad: 40,
		descripcion: "Aula de clases teoricas.",
		equipamiento: ["Video beam", "Pizarra acrilica", "Aire acondicionado"],
		caracteristicas: { pupitres: 40, tomas_corriente: 8 },
	},
	{
		codigo: "A-305",
		nombre: "Aula 305",
		tipo: "aula",
		edificio: "Edificio A",
		piso: 3,
		capacidad: 25,
		descripcion: "Aula pequena ideal para seminarios.",
		equipamiento: ["Smart TV", "Pizarra acrilica"],
		caracteristicas: { mesas_redondas: 5, pantalla_pulgadas: 65 },
	},
	{
		codigo: "AUD-01",
		nombre: "Auditorio Principal",
		tipo: "auditorio",
		edificio: "Edificio Central",
		piso: 1,
		capacidad: 200,
		descripcion: "Auditorio para conferencias, defensas y eventos.",
		equipamiento: [
			"Proyector laser",
			"Sonido",
			"Microfonos",
			"Aire acondicionado",
		],
		caracteristicas: {
			butacas: 200,
			microfonos_inalambricos: 4,
			tarima: true,
			transmision_en_vivo: true,
		},
	},
	{
		codigo: "SE-01",
		nombre: "Sala de Estudio Biblioteca",
		tipo: "sala_estudio",
		edificio: "Biblioteca",
		piso: 1,
		capacidad: 8,
		descripcion: "Sala silenciosa para trabajo en grupo.",
		equipamiento: ["Pizarra", "Wi-Fi"],
		caracteristicas: {
			mesa_grande: true,
			tomas_corriente: 6,
			silencio: true,
		},
	},
	{
		codigo: "SE-02",
		nombre: "Sala de Estudio Innovacion",
		tipo: "sala_estudio",
		edificio: "Edificio de Ingenieria",
		piso: 3,
		capacidad: 6,
		descripcion: "Sala con pantalla para proyectos y reuniones de equipo.",
		equipamiento: ["Smart TV", "Pizarra", "Wi-Fi"],
		caracteristicas: {
			pantalla_pulgadas: 55,
			camara_videoconferencia: true,
		},
	},
];

async function sembrarCatalogo() {
	const total = await Espacio.countDocuments();
	if (total > 0) return;
	await Espacio.insertMany(espaciosIniciales);
	console.log(`[seed] ${espaciosIniciales.length} espacios creados`);
}

module.exports = { sembrarCatalogo };
