package main

import (
	"time"

	"gorm.io/gorm"
)

// Ocupacion: una fila por reserva, alimentada por los eventos del servicio Java.
// Sobre esta tabla se calculan todos los reportes.
type Ocupacion struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	ReservaID       uint      `gorm:"uniqueIndex" json:"reservaId"`
	EspacioID       string    `gorm:"index" json:"espacioId"`
	EspacioCodigo   string    `json:"espacioCodigo"`
	EspacioNombre   string    `json:"espacioNombre"`
	EspacioTipo     string    `json:"espacioTipo"`
	UsuarioID       uint      `gorm:"index" json:"usuarioId"`
	UsuarioNombre   string    `json:"usuarioNombre"`
	UsuarioRol      string    `json:"usuarioRol"`
	Fecha           string    `gorm:"index" json:"fecha"`
	HoraInicio      string    `json:"horaInicio"`
	HoraFin         string    `json:"horaFin"`
	DuracionMinutos int       `json:"duracionMinutos"`
	Asistentes      int       `json:"asistentes"`
	Estado          string    `gorm:"index" json:"estado"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func (Ocupacion) TableName() string { return "reportes_ocupacion" }

// Evento: historial de actividad (lo que se ve en el "log en vivo")
type Evento struct {
	gorm.Model
	Tipo          string `json:"tipo"`
	ReservaID     uint   `json:"reservaId"`
	EspacioCodigo string `json:"espacioCodigo"`
	EspacioNombre string `json:"espacioNombre"`
	UsuarioNombre string `json:"usuarioNombre"`
	Fecha         string `json:"fecha"`
	HoraInicio    string `json:"horaInicio"`
	HoraFin       string `json:"horaFin"`
}

func (Evento) TableName() string { return "reportes_eventos" }

// EventoIn: lo que envia el servicio Java a POST /eventos
type EventoIn struct {
	Tipo            string `json:"tipo" binding:"required,oneof=CREADA CANCELADA"`
	ReservaID       uint   `json:"reservaId" binding:"required"`
	EspacioID       string `json:"espacioId"`
	EspacioCodigo   string `json:"espacioCodigo"`
	EspacioNombre   string `json:"espacioNombre"`
	EspacioTipo     string `json:"espacioTipo"`
	UsuarioID       uint   `json:"usuarioId"`
	UsuarioNombre   string `json:"usuarioNombre"`
	UsuarioRol      string `json:"usuarioRol"`
	Fecha           string `json:"fecha"`
	HoraInicio      string `json:"horaInicio"`
	HoraFin         string `json:"horaFin"`
	DuracionMinutos int    `json:"duracionMinutos"`
	Asistentes      int    `json:"asistentes"`
}

// EspacioCatalogo: lo que devuelve el servicio Node en GET /espacios
type EspacioCatalogo struct {
	ID        string `json:"_id"`
	Codigo    string `json:"codigo"`
	Nombre    string `json:"nombre"`
	Tipo      string `json:"tipo"`
	Capacidad int    `json:"capacidad"`
	Activo    bool   `json:"activo"`
}
