package main

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	estadoActiva    = "ACTIVA"
	estadoCancelada = "CANCELADA"
)

type API struct {
	db          *gorm.DB
	hub         *Hub
	catalogo    *CatalogoClient
	internalKey string
	zona        *time.Location
}

func (a *API) hoy() string {
	return time.Now().In(a.zona).Format("2006-01-02")
}

// ---------- Salud ----------
func (a *API) health(c *gin.Context) {
	sqlDB, err := a.db.DB()
	if err != nil || sqlDB.Ping() != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"servicio": "go-reportes", "estado": "sin conexion a PostgreSQL"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"servicio":    "go-reportes",
		"estado":      "ok",
		"bd":          "postgresql",
		"ws_clientes": a.hub.Conectados(),
	})
}

// ---------- POST /eventos (llamado por Java) ----------
func (a *API) recibirEvento(c *gin.Context) {
	if c.GetHeader("X-Internal-Key") != a.internalKey {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Clave interna invalida"})
		return
	}
	var ev EventoIn
	if err := c.ShouldBindJSON(&ev); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}

	estado := estadoActiva
	if ev.Tipo == "CANCELADA" {
		estado = estadoCancelada
	}
	ocupacion := Ocupacion{
		ReservaID: ev.ReservaID, EspacioID: ev.EspacioID, EspacioCodigo: ev.EspacioCodigo,
		EspacioNombre: ev.EspacioNombre, EspacioTipo: ev.EspacioTipo, UsuarioID: ev.UsuarioID,
		UsuarioNombre: ev.UsuarioNombre, UsuarioRol: ev.UsuarioRol, Fecha: ev.Fecha,
		HoraInicio: ev.HoraInicio, HoraFin: ev.HoraFin, DuracionMinutos: ev.DuracionMinutos,
		Asistentes: ev.Asistentes, Estado: estado,
	}
	// Upsert: si la reserva ya existe (cancelacion) se actualiza la fila
	err := a.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "reserva_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"estado", "updated_at"}),
	}).Create(&ocupacion).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "No se pudo guardar el evento"})
		return
	}

	evento := Evento{
		Tipo: ev.Tipo, ReservaID: ev.ReservaID, EspacioCodigo: ev.EspacioCodigo,
		EspacioNombre: ev.EspacioNombre, UsuarioNombre: ev.UsuarioNombre, Fecha: ev.Fecha,
		HoraInicio: ev.HoraInicio, HoraFin: ev.HoraFin,
	}
	a.db.Create(&evento)

	tipoWS := "reserva_creada"
	if ev.Tipo == "CANCELADA" {
		tipoWS = "reserva_cancelada"
	}
	a.hub.Publicar(tipoWS, ev)

	c.JSON(http.StatusCreated, gin.H{"ok": true, "eventoId": evento.ID})
}

// ---------- GET /reportes/resumen ----------
func (a *API) resumen(c *gin.Context) {
	var activas, canceladas, usuarios, hoy, proximas int64
	var minutos int64
	activa := a.db.Model(&Ocupacion{}).Where("estado = ?", estadoActiva)

	activa.Session(&gorm.Session{}).Count(&activas)
	a.db.Model(&Ocupacion{}).Where("estado = ?", estadoCancelada).Count(&canceladas)
	activa.Session(&gorm.Session{}).Distinct("usuario_id").Count(&usuarios)
	activa.Session(&gorm.Session{}).Where("fecha = ?", a.hoy()).Count(&hoy)
	activa.Session(&gorm.Session{}).Where("fecha >= ?", a.hoy()).Count(&proximas)
	activa.Session(&gorm.Session{}).Select("COALESCE(SUM(duracion_minutos), 0)").Scan(&minutos)

	var top struct {
		EspacioNombre string
		Total         int64
	}
	activa.Session(&gorm.Session{}).Select("espacio_nombre, COUNT(*) AS total").
		Group("espacio_nombre").Order("total DESC").Limit(1).Scan(&top)

	var porRol []struct {
		UsuarioRol string `json:"rol"`
		Total      int64  `json:"total"`
	}
	activa.Session(&gorm.Session{}).Select("usuario_rol, COUNT(*) AS total").
		Group("usuario_rol").Order("total DESC").Scan(&porRol)

	respuesta := gin.H{
		"reservasActivas":     activas,
		"reservasCanceladas":  canceladas,
		"reservasHoy":         hoy,
		"reservasProximas":    proximas,
		"horasReservadas":     float64(minutos) / 60.0,
		"usuariosDistintos":   usuarios,
		"espacioMasReservado": gin.H{"nombre": top.EspacioNombre, "reservas": top.Total},
		"porRol":              porRol,
		"conectadosEnVivo":    a.hub.Conectados(),
	}

	// Comunicacion Go -> Node: datos del catalogo
	if espacios, err := a.catalogo.Espacios(); err == nil {
		disponibles := 0
		for _, e := range espacios {
			if e.Activo {
				disponibles++
			}
		}
		respuesta["totalEspacios"] = len(espacios)
		respuesta["espaciosActivos"] = disponibles
		respuesta["catalogoDisponible"] = true
	} else {
		respuesta["catalogoDisponible"] = false
	}
	c.JSON(http.StatusOK, respuesta)
}

// ---------- GET /reportes/ocupacion ----------
type filaOcupacion struct {
	EspacioID     string  `json:"espacioId"`
	EspacioCodigo string  `json:"codigo"`
	EspacioNombre string  `json:"nombre"`
	EspacioTipo   string  `json:"tipo"`
	Capacidad     int     `json:"capacidad"`
	Reservas      int64   `json:"reservas"`
	Minutos       int64   `json:"-"`
	Horas         float64 `json:"horas"`
	Porcentaje    float64 `json:"porcentaje"`
}

func (a *API) ocupacion(c *gin.Context) {
	var filas []filaOcupacion
	a.db.Model(&Ocupacion{}).Where("estado = ?", estadoActiva).
		Select("espacio_id, MAX(espacio_codigo) AS espacio_codigo, MAX(espacio_nombre) AS espacio_nombre, " +
			"MAX(espacio_tipo) AS espacio_tipo, COUNT(*) AS reservas, SUM(duracion_minutos) AS minutos").
		Group("espacio_id").Scan(&filas)

	porID := map[string]*filaOcupacion{}
	for i := range filas {
		porID[filas[i].EspacioID] = &filas[i]
	}

	// Se completan con el catalogo para mostrar tambien los espacios sin reservas
	espacios, err := a.catalogo.Espacios()
	if err == nil {
		for _, e := range espacios {
			if f, ok := porID[e.ID]; ok {
				f.EspacioCodigo, f.EspacioNombre, f.EspacioTipo, f.Capacidad = e.Codigo, e.Nombre, e.Tipo, e.Capacidad
			} else {
				filas = append(filas, filaOcupacion{EspacioID: e.ID, EspacioCodigo: e.Codigo,
					EspacioNombre: e.Nombre, EspacioTipo: e.Tipo, Capacidad: e.Capacidad})
			}
		}
	}

	var totalMin int64
	for _, f := range filas {
		totalMin += f.Minutos
	}
	for i := range filas {
		filas[i].Horas = float64(filas[i].Minutos) / 60.0
		if totalMin > 0 {
			filas[i].Porcentaje = float64(filas[i].Minutos) * 100 / float64(totalMin)
		}
	}
	sort.SliceStable(filas, func(i, j int) bool {
		if filas[i].Minutos != filas[j].Minutos {
			return filas[i].Minutos > filas[j].Minutos
		}
		return filas[i].EspacioCodigo < filas[j].EspacioCodigo
	})
	c.JSON(http.StatusOK, gin.H{"espacios": filas, "catalogoDisponible": err == nil})
}

// ---------- GET /reportes/horas-pico ----------
func aMinutos(hhmm string) int {
	partes := strings.Split(hhmm, ":")
	if len(partes) < 2 {
		return 0
	}
	h, _ := strconv.Atoi(partes[0])
	m, _ := strconv.Atoi(partes[1])
	return h*60 + m
}

func (a *API) horasPico(c *gin.Context) {
	var reservas []Ocupacion
	consulta := a.db.Select("hora_inicio, hora_fin").Where("estado = ?", estadoActiva)
	if fecha := c.Query("fecha"); fecha != "" {
		consulta = consulta.Where("fecha = ?", fecha)
	}
	consulta.Find(&reservas)

	type bloque struct {
		Hora     string `json:"hora"`
		Reservas int    `json:"reservas"`
	}
	resultado := []bloque{}
	for h := 7; h < 21; h++ {
		ini, fin := h*60, (h+1)*60
		total := 0
		for _, r := range reservas {
			if aMinutos(r.HoraInicio) < fin && aMinutos(r.HoraFin) > ini {
				total++
			}
		}
		resultado = append(resultado, bloque{Hora: time.Date(0, 1, 1, h, 0, 0, 0, time.UTC).Format("15:04"), Reservas: total})
	}
	c.JSON(http.StatusOK, resultado)
}

// ---------- GET /reportes/por-tipo ----------
func (a *API) porTipo(c *gin.Context) {
	var filas []struct {
		EspacioTipo string  `json:"tipo"`
		Reservas    int64   `json:"reservas"`
		Horas       float64 `json:"horas"`
	}
	a.db.Model(&Ocupacion{}).Where("estado = ?", estadoActiva).
		Select("espacio_tipo, COUNT(*) AS reservas, SUM(duracion_minutos) / 60.0 AS horas").
		Group("espacio_tipo").Order("reservas DESC").Scan(&filas)
	c.JSON(http.StatusOK, filas)
}

// ---------- GET /reportes/actividad ----------
func (a *API) actividad(c *gin.Context) {
	limite, err := strconv.Atoi(c.DefaultQuery("limite", "15"))
	if err != nil || limite < 1 || limite > 100 {
		limite = 15
	}
	var eventos []Evento
	a.db.Order("id DESC").Limit(limite).Find(&eventos)
	c.JSON(http.StatusOK, eventos)
}
