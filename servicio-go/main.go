// ReservaUJAP — Servicio de Reportes y Tiempo Real (Go + Gin)
//
//   - Recibe los eventos de reservas del servicio Java (POST /eventos)
//   - Guarda la ocupacion en PostgreSQL con GORM
//   - Calcula reportes (consulta el catalogo del servicio Node)
//   - Transmite los cambios en vivo por WebSocket (GET /ws)
package main

import (
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	_ "time/tzdata" // zonas horarias embebidas (la imagen alpine no las trae)
)

func conectarBD(dsn string) *gorm.DB {
	var db *gorm.DB
	var err error
	for intento := 1; intento <= 10; intento++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Warn)})
		if err == nil {
			return db
		}
		log.Printf("PostgreSQL no disponible (intento %d/10): %v", intento, err)
		time.Sleep(3 * time.Second)
	}
	log.Fatal("No se pudo conectar a PostgreSQL")
	return nil
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func main() {
	// En Docker las variables vienen de docker-compose, fuera de Docker del .env
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("Falta la variable de entorno DATABASE_URL")
	}
	internalKey := os.Getenv("INTERNAL_API_KEY")
	if internalKey == "" {
		log.Fatal("Falta la variable de entorno INTERNAL_API_KEY")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	zona, err := time.LoadLocation(getenv("APP_TIMEZONE", "America/Caracas"))
	if err != nil {
		zona = time.UTC
	}

	db := conectarBD(dsn)
	if err := db.AutoMigrate(&Ocupacion{}, &Evento{}); err != nil {
		log.Fatal("Error en AutoMigrate: ", err)
	}

	hub := newHub()
	go hub.run()

	api := &API{
		db:          db,
		hub:         hub,
		catalogo:    NewCatalogoClient(getenv("CATALOGO_SERVICE_URL", "http://servicio-node:3000")),
		internalKey: internalKey,
		zona:        zona,
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{SkipPaths: []string{"/health"}}), gin.Recovery(), corsMiddleware())

	r.GET("/health", api.health)
	r.POST("/eventos", api.recibirEvento) // interno: solo lo llama Java (no pasa por el gateway)

	reportes := r.Group("/reportes")
	{
		reportes.GET("/resumen", api.resumen)
		reportes.GET("/ocupacion", api.ocupacion)
		reportes.GET("/horas-pico", api.horasPico)
		reportes.GET("/por-tipo", api.porTipo)
		reportes.GET("/actividad", api.actividad)
	}

	r.GET("/ws", func(c *gin.Context) { hub.wsHandler(c.Writer, c.Request) })

	log.Printf("Servicio de reportes en puerto %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func getenv(clave, porDefecto string) string {
	if v := os.Getenv(clave); v != "" {
		return v
	}
	return porDefecto
}
