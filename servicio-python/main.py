"""
ReservaUJAP — Servicio de Autenticacion y Usuarios (Python + FastAPI)

- Registro e inicio de sesion con JWT (python-jose + bcrypt)
- Usuarios guardados en PostgreSQL con SQLAlchemy
- El servicio Java llama a GET /auth/me para validar el token de cada reserva
"""
import os
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import create_token, get_current_user, hash_password, require_admin, verify_password
from database import Base, SessionLocal, Usuario, engine, get_db

load_dotenv()

ROLES_PUBLICOS = {"estudiante", "profesor"}
ROLES_VALIDOS = ROLES_PUBLICOS | {"admin"}

def crear_usuarios_iniciales():
    """Crea las cuentas de prueba si la tabla esta vacia."""
    password = os.getenv("SEED_PASSWORD")
    if not password:
        print("[seed] SEED_PASSWORD no definida: no se crean usuarios de prueba")
        return
    iniciales = [
        ("Administrador UJAP", "admin@ujap.edu.ve", "admin", "Coordinacion de Espacios"),
        ("Prof. Maria Garcia", "profesor@ujap.edu.ve", "profesor", "Ingenieria en Computacion"),
        ("Carlos Estudiante", "estudiante@ujap.edu.ve", "estudiante", "Ingenieria en Computacion"),
    ]
    with SessionLocal() as db:
        if db.query(Usuario).count() > 0:
            return
        for nombre, email, rol, carrera in iniciales:
            db.add(Usuario(nombre=nombre, email=email, rol=rol, carrera=carrera,
                        hashed_password=hash_password(password)))
        db.commit()
        print("[seed] usuarios de prueba creados")

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    crear_usuarios_iniciales()
    yield

app = FastAPI(
    title="ReservaUJAP — Servicio de Usuarios",
    description="Autenticacion JWT y gestion de usuarios (FastAPI + SQLAlchemy + PostgreSQL)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Esquemas ----------
class RegistroIn(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=6, max_length=72)
    rol: str = "estudiante"
    carrera: Optional[str] = None

class CambioRolIn(BaseModel):
    rol: str

# ---------- Rutas publicas ----------
@app.get("/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"servicio": "python-usuarios", "estado": "ok", "bd": "postgresql"}

@app.post("/auth/registro", status_code=201)
def registro(datos: RegistroIn, db: Session = Depends(get_db)):
    email = datos.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="Email invalido")
    if datos.rol not in ROLES_PUBLICOS:
        raise HTTPException(status_code=422, detail="El rol debe ser estudiante o profesor")
    if db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email")

    usuario = Usuario(nombre=datos.nombre.strip(), email=email, rol=datos.rol,
                    carrera=datos.carrera, hashed_password=hash_password(datos.password))
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario.to_dict()

@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == form.username.strip().lower()).first()
    if not usuario or not verify_password(form.password, usuario.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    token = create_token({
        "sub": usuario.email,
        "id": usuario.id,
        "nombre": usuario.nombre,
        "rol": usuario.rol,
    })
    return {"access_token": token, "token_type": "bearer", "usuario": usuario.to_dict()}

# ---------- Rutas protegidas ----------
@app.get("/auth/me")
def me(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Valida el token y devuelve el usuario actual (lo usa el servicio Java)."""
    usuario = db.get(Usuario, user.get("id"))
    if not usuario:
        raise HTTPException(status_code=401, detail="El usuario del token ya no existe")
    return usuario.to_dict()

@app.get("/usuarios")
def listar_usuarios(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return [u.to_dict() for u in db.query(Usuario).order_by(Usuario.id).all()]

@app.get("/usuarios/{usuario_id}")
def obtener_usuario(usuario_id: int, _: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return usuario.to_dict()

@app.patch("/usuarios/{usuario_id}/rol")
def cambiar_rol(usuario_id: int, datos: CambioRolIn, _: dict = Depends(require_admin),
                db: Session = Depends(get_db)):
    if datos.rol not in ROLES_VALIDOS:
        raise HTTPException(status_code=422, detail="Rol invalido")
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    usuario.rol = datos.rol
    db.commit()
    return usuario.to_dict()
