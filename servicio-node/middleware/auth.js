const jwt = require("jsonwebtoken");

// Verifica el JWT emitido por el servicio Python (misma SECRET_KEY)
function verificarToken(req, res, next) {
	const header = req.headers.authorization || "";
	const [tipo, token] = header.split(" ");
	if (tipo !== "Bearer" || !token) {
		return res
			.status(401)
			.json({ detail: "Falta el token de autenticacion" });
	}
	try {
		req.usuario = jwt.verify(token, process.env.SECRET_KEY, {
			algorithms: ["HS256"],
		});
		next();
	} catch (err) {
		return res.status(401).json({ detail: "Token expirado o invalido" });
	}
}

function soloAdmin(req, res, next) {
	if (req.usuario?.rol !== "admin") {
		return res.status(403).json({ detail: "Solo para administradores" });
	}
	next();
}

module.exports = { verificarToken, soloAdmin };
