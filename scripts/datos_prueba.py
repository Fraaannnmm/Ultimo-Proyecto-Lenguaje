"""
ReservaUJAP - Datos de prueba

Se ejecuta DENTRO del contenedor servicio-python (lo llaman los scripts
cargar-datos-prueba.* y quitar-datos-prueba.*), asi no hace falta instalar
Python en la computadora: solo Docker.

    python datos_prueba.py cargar   -> crea usuarios, espacios y reservas de prueba
    python datos_prueba.py quitar   -> borra SOLO los datos creados por "cargar"

Como se reconocen los datos de prueba:
    - Usuarios con email terminado en @prueba.ujap.edu.ve
    - Espacios con codigo que empieza por PRB-
    - Reservas hechas por esos usuarios o en esos espacios
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

AUTH = "http://servicio-python:8000"
CATALOGO = "http://servicio-node:3000"
RESERVAS = "http://servicio-java:8080"

DOMINIO = "@prueba.ujap.edu.ve"
PREFIJO_ESPACIO = "PRB-"
CLAVE_PRUEBA = "prueba2026"
VENEZUELA = timezone(timedelta(hours=-4))

USUARIOS = [
    # (usuario, nombre, rol, carrera)
    ("ana.rodriguez", "Ana Rodriguez", "estudiante", "Ingenieria en Computacion"),
    ("luis.martinez", "Luis Martinez", "estudiante", "Ingenieria en Computacion"),
    ("maria.gonzalez", "Maria Gonzalez", "estudiante", "Ingenieria Civil"),
    ("jose.perez", "Jose Perez", "estudiante", "Ingenieria en Computacion"),
    ("valentina.silva", "Valentina Silva", "estudiante", "Ingenieria Industrial"),
    ("diego.hernandez", "Diego Hernandez", "estudiante", "Ingenieria Electrica"),
    ("prof.ramirez", "Prof. Carlos Ramirez", "profesor", "Ingenieria en Computacion"),
    ("prof.torres", "Prof. Laura Torres", "profesor", "Ciencias Basicas"),
    ("prof.mendoza", "Prof. Andres Mendoza", "profesor", "Ingenieria en Computacion"),
]

ESPACIOS = [
    {
        "codigo": "PRB-LAB-IA", "nombre": "Laboratorio de Inteligencia Artificial", "tipo": "laboratorio",
        "edificio": "Edificio de Ingenieria", "piso": 3, "capacidad": 24,
        "descripcion": "Estaciones con GPU para entrenar modelos (espacio de prueba).",
        "equipamiento": ["Proyector", "Aire acondicionado", "Pizarra"],
        "caracteristicas": {"computadoras": 24, "gpus": ["RTX 4090", "RTX 4090", "A100", "A100"],
                            "software": ["Python", "Jupyter", "PyTorch"], "datos_prueba": True},
    },
    {
        "codigo": "PRB-AULA-01", "nombre": "Aula Hibrida", "tipo": "aula",
        "edificio": "Edificio B", "piso": 1, "capacidad": 30,
        "descripcion": "Aula con camaras para clases presenciales y en linea (espacio de prueba).",
        "equipamiento": ["Smart TV", "Camaras", "Microfono ambiental"],
        "caracteristicas": {"camaras": 2, "plataforma": "Google Meet", "datos_prueba": True},
    },
]

# (usuario, codigo del espacio, dias desde hoy, inicio, fin, asistentes, motivo)
RESERVAS_PRUEBA = [
    ("prof.ramirez", "LAB-02", 1, "08:00", "10:00", 30, "Programacion I - seccion 01"),
    ("prof.torres", "A-305", 1, "08:00", "11:00", 24, "Calculo II"),
    ("ana.rodriguez", "SE-01", 1, "09:00", "11:00", 5, "Estudio para el parcial de Fisica"),
    ("luis.martinez", "LAB-03", 1, "13:00", "15:00", 12, "Practica de subnetting"),
    ("prof.ramirez", "PRB-LAB-IA", 1, "13:00", "16:00", 20, "Introduccion a Machine Learning"),
    ("prof.mendoza", "AUD-01", 1, "14:00", "17:00", 150, "Charla: Microservicios con Docker"),
    ("maria.gonzalez", "SE-02", 1, "15:00", "17:00", 4, "Proyecto de Base de Datos"),
    ("jose.perez", "LAB-02", 1, "16:00", "18:00", 10, "Taller de Git y GitHub"),
    ("prof.torres", "LAB-03", 2, "08:00", "11:00", 18, "Laboratorio de Circuitos"),
    ("valentina.silva", "SE-01", 2, "10:00", "12:00", 6, "Repaso de Estructuras de Datos"),
    ("diego.hernandez", "A-305", 2, "14:00", "16:00", 15, "Ensayo de presentacion final"),
    ("ana.rodriguez", "LAB-02", 2, "14:00", "16:00", 8, "Practica de Java"),
    ("prof.mendoza", "LAB-01", 2, "15:00", "18:00", 28, "Redes II - practica de VLANs"),
    ("prof.ramirez", "A-201", 3, "08:00", "12:00", 40, "Programacion II - examen"),
    ("luis.martinez", "SE-02", 3, "09:00", "11:00", 4, "Grupo de estudio de Calculo"),
    ("jose.perez", "PRB-LAB-IA", 3, "10:00", "12:00", 8, "Entrenamiento de un modelo"),
    ("valentina.silva", "A-305", 3, "13:00", "15:00", 12, "Reunion del semillero de investigacion"),
    ("maria.gonzalez", "LAB-01", 3, "14:00", "16:00", 20, "Practica de Wireshark"),
    ("diego.hernandez", "LAB-02", 4, "08:00", "10:00", 15, "Practica de Docker"),
    ("prof.torres", "AUD-01", 4, "09:00", "12:00", 180, "Ensayo del acto de grado"),
    ("ana.rodriguez", "LAB-01", 4, "10:00", "12:00", 18, "Configuracion de routers"),
    ("prof.mendoza", "LAB-02", 4, "14:00", "18:00", 30, "Lenguajes de Programacion - proyecto final"),
    ("luis.martinez", "SE-01", 4, "15:00", "17:00", 6, "Estudio para el examen final"),
    ("maria.gonzalez", "A-201", 5, "09:00", "11:00", 30, "Exposicion de tesis"),
    ("valentina.silva", "LAB-03", 5, "10:00", "12:00", 10, "Practica con Arduino"),
    ("jose.perez", "SE-02", 5, "14:00", "16:00", 5, "Reunion de equipo"),
    ("prof.ramirez", "LAB-01", 5, "14:00", "18:00", 30, "Taller de ciberseguridad"),
    ("diego.hernandez", "PRB-AULA-01", 5, "15:00", "17:00", 20, "Clase de refuerzo"),
    ("prof.torres", "A-305", 6, "08:00", "10:00", 20, "Asesorias de Calculo"),
    ("prof.mendoza", "PRB-AULA-01", 6, "10:00", "12:00", 25, "Clase hibrida de Algoritmos"),
]

# Reservas que se cancelan despues de crearlas (para que haya cancelaciones en los reportes)
CANCELAR = [("jose.perez", "SE-02", 5), ("prof.ramirez", "LAB-01", 5)]

# ---------------- HTTP ----------------
def peticion(metodo, url, datos=None, token=None, formulario=False):
    headers = {}
    cuerpo = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if datos is not None:
        if formulario:
            cuerpo = urllib.parse.urlencode(datos).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            cuerpo = json.dumps(datos).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=cuerpo, headers=headers, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            texto = resp.read().decode()
            return resp.status, (json.loads(texto) if texto else None)
    except urllib.error.HTTPError as e:
        texto = e.read().decode()
        try:
            return e.code, json.loads(texto)
        except ValueError:
            return e.code, {"detail": texto}
    except urllib.error.URLError:
        return 503, {"detail": f"servicio no disponible ({url.split('/')[2]})"}

def login(email, password):
    status, datos = peticion("POST", f"{AUTH}/auth/login",
                            {"username": email, "password": password}, formulario=True)
    if status != 200:
        raise SystemExit(f"[error] No se pudo iniciar sesion como {email}: {datos.get('detail')}")
    return datos["access_token"]

def token_admin():
    return login("admin@ujap.edu.ve", os.environ.get("SEED_PASSWORD", "ujap2026"))

def espacios_por_codigo():
    status, datos = peticion("GET", f"{CATALOGO}/espacios")
    if status != 200:
        raise SystemExit("[error] El servicio de catalogo (Node) no responde")
    return {e["codigo"]: e for e in datos}

# ---------------- Cargar ----------------
def cargar():
    print("== Cargando datos de prueba ==")

    print("\n[1/4] Usuarios de prueba (servicio Python)")
    tokens = {}
    for usuario, nombre, rol, carrera in USUARIOS:
        email = usuario + DOMINIO
        status, datos = peticion("POST", f"{AUTH}/auth/registro", {
            "nombre": nombre, "email": email, "password": CLAVE_PRUEBA, "rol": rol, "carrera": carrera})
        estado = "creado" if status == 201 else ("ya existia" if status == 409 else f"error: {datos}")
        print(f"   {email:<40} {rol:<11} {estado}")
        tokens[usuario] = login(email, CLAVE_PRUEBA)

    print("\n[2/4] Espacios de prueba (servicio Node / MongoDB)")
    admin = token_admin()
    existentes = espacios_por_codigo()
    for espacio in ESPACIOS:
        if espacio["codigo"] in existentes:
            print(f"   {espacio['codigo']:<14} ya existia")
            continue
        status, datos = peticion("POST", f"{CATALOGO}/espacios", espacio, token=admin)
        print(f"   {espacio['codigo']:<14} {'creado' if status == 201 else 'error: ' + str(datos)}")
    espacios = espacios_por_codigo()

    print("\n[3/4] Reservas de prueba (servicio Java -> Python, Node y Go)")
    hoy = datetime.now(VENEZUELA).date()
    creadas = {}
    total_ok = 0
    for usuario, codigo, dias, inicio, fin, asistentes, motivo in RESERVAS_PRUEBA:
        fecha = (hoy + timedelta(days=dias)).isoformat()
        espacio = espacios.get(codigo)
        if not espacio:
            print(f"   {fecha} {inicio}-{fin} {codigo:<12} omitida: el espacio no existe")
            continue
        status, datos = peticion("POST", f"{RESERVAS}/reservas", {
            "espacioId": espacio["_id"], "fecha": fecha, "horaInicio": inicio, "horaFin": fin,
            "asistentes": asistentes, "motivo": motivo}, token=tokens[usuario])
        if status == 201:
            total_ok += 1
            creadas[(usuario, codigo, dias)] = datos["id"]
            print(f"   {fecha} {inicio}-{fin} {codigo:<12} ok        ({usuario})")
        else:
            print(f"   {fecha} {inicio}-{fin} {codigo:<12} omitida: {datos.get('detail')}")

    print("\n[4/4] Cancelaciones de prueba")
    for clave in CANCELAR:
        reserva_id = creadas.get(clave)
        if not reserva_id:
            continue
        status, _ = peticion("PATCH", f"{RESERVAS}/reservas/{reserva_id}/cancelar", token=tokens[clave[0]])
        print(f"   reserva {reserva_id} de {clave[0]}: {'cancelada' if status == 200 else 'no se pudo cancelar'}")

    print(f"\nListo: {total_ok} de {len(RESERVAS_PRUEBA)} reservas creadas.")
    print(f"Los usuarios de prueba entran con la clave: {CLAVE_PRUEBA}  (ej: ana.rodriguez{DOMINIO})")
    print("Las reservas omitidas chocaban con datos que ya existian; es normal si ejecutas el script dos veces.")

# ---------------- Quitar ----------------
def quitar():
    from sqlalchemy import create_engine, text

    print("== Quitando datos de prueba ==")
    engine = create_engine(os.environ["DATABASE_URL"])
    patron_email = "%" + DOMINIO
    patron_espacio = PREFIJO_ESPACIO + "%"

    with engine.begin() as db:
        def existe(tabla):
            return db.execute(text("SELECT to_regclass(:t)"), {"t": tabla}).scalar() is not None

        ids = []
        if existe("reservas"):
            ids = [fila[0] for fila in db.execute(text(
                "SELECT id FROM reservas WHERE usuario_email LIKE :e OR espacio_codigo LIKE :p"),
                {"e": patron_email, "p": patron_espacio})]

        if ids:
            for tabla in ("reportes_eventos", "reportes_ocupacion"):
                if existe(tabla):
                    n = db.execute(text(f"DELETE FROM {tabla} WHERE reserva_id = ANY(:ids)"), {"ids": ids}).rowcount
                    print(f"   {tabla:<20} {n} filas borradas (servicio Go)")
            n = db.execute(text("DELETE FROM reservas WHERE id = ANY(:ids)"), {"ids": ids}).rowcount
            print(f"   {'reservas':<20} {n} filas borradas (servicio Java)")
        else:
            print("   reservas             no habia reservas de prueba")

        n = db.execute(text("DELETE FROM usuarios WHERE email LIKE :e"), {"e": patron_email}).rowcount
        print(f"   {'usuarios':<20} {n} filas borradas (servicio Python)")

    admin = token_admin()
    borrados = 0
    for codigo, espacio in espacios_por_codigo().items():
        if codigo.startswith(PREFIJO_ESPACIO):
            status, _ = peticion("DELETE", f"{CATALOGO}/espacios/{espacio['_id']}", token=admin)
            borrados += status == 204
    print(f"   {'espacios (MongoDB)':<20} {borrados} documentos borrados (servicio Node)")

    print("\nListo: el sistema quedo sin datos de prueba. Los datos originales no se tocaron.")

if __name__ == "__main__":
    accion = sys.argv[1] if len(sys.argv) > 1 else ""
    if accion == "cargar":
        cargar()
    elif accion == "quitar":
        quitar()
    else:
        raise SystemExit("Uso: python datos_prueba.py [cargar|quitar]")
