package ve.edu.ujap.reservas.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "reservas", indexes = {
        @Index(name = "idx_reserva_espacio_fecha", columnList = "espacioId, fecha"),
        @Index(name = "idx_reserva_usuario", columnList = "usuarioId")
})
public class Reserva {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Datos del espacio (vienen del servicio Node / MongoDB)
    @Column(nullable = false, length = 40)
    private String espacioId;
    private String espacioCodigo;
    private String espacioNombre;
    private String espacioTipo;

    // Datos del usuario (vienen del servicio Python / JWT)
    @Column(nullable = false)
    private Long usuarioId;
    private String usuarioNombre;
    private String usuarioEmail;
    private String usuarioRol;

    @Column(nullable = false)
    private LocalDate fecha;

    @JsonFormat(pattern = "HH:mm")
    @Column(nullable = false)
    private LocalTime horaInicio;

    @JsonFormat(pattern = "HH:mm")
    @Column(nullable = false)
    private LocalTime horaFin;

    private Integer asistentes;

    @Column(length = 200)
    private String motivo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EstadoReserva estado = EstadoReserva.ACTIVA;

    private LocalDateTime creadaEn;
    private LocalDateTime canceladaEn;

    @PrePersist
    void alCrear() {
        if (creadaEn == null) creadaEn = LocalDateTime.now();
    }

    public int duracionMinutos() {
        return (int) java.time.Duration.between(horaInicio, horaFin).toMinutes();
    }

    // ---------- getters y setters ----------
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEspacioId() { return espacioId; }
    public void setEspacioId(String espacioId) { this.espacioId = espacioId; }

    public String getEspacioCodigo() { return espacioCodigo; }
    public void setEspacioCodigo(String espacioCodigo) { this.espacioCodigo = espacioCodigo; }

    public String getEspacioNombre() { return espacioNombre; }
    public void setEspacioNombre(String espacioNombre) { this.espacioNombre = espacioNombre; }

    public String getEspacioTipo() { return espacioTipo; }
    public void setEspacioTipo(String espacioTipo) { this.espacioTipo = espacioTipo; }

    public Long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(Long usuarioId) { this.usuarioId = usuarioId; }

    public String getUsuarioNombre() { return usuarioNombre; }
    public void setUsuarioNombre(String usuarioNombre) { this.usuarioNombre = usuarioNombre; }

    public String getUsuarioEmail() { return usuarioEmail; }
    public void setUsuarioEmail(String usuarioEmail) { this.usuarioEmail = usuarioEmail; }

    public String getUsuarioRol() { return usuarioRol; }
    public void setUsuarioRol(String usuarioRol) { this.usuarioRol = usuarioRol; }

    public LocalDate getFecha() { return fecha; }
    public void setFecha(LocalDate fecha) { this.fecha = fecha; }

    public LocalTime getHoraInicio() { return horaInicio; }
    public void setHoraInicio(LocalTime horaInicio) { this.horaInicio = horaInicio; }

    public LocalTime getHoraFin() { return horaFin; }
    public void setHoraFin(LocalTime horaFin) { this.horaFin = horaFin; }

    public Integer getAsistentes() { return asistentes; }
    public void setAsistentes(Integer asistentes) { this.asistentes = asistentes; }

    public String getMotivo() { return motivo; }
    public void setMotivo(String motivo) { this.motivo = motivo; }

    public EstadoReserva getEstado() { return estado; }
    public void setEstado(EstadoReserva estado) { this.estado = estado; }

    public LocalDateTime getCreadaEn() { return creadaEn; }
    public void setCreadaEn(LocalDateTime creadaEn) { this.creadaEn = creadaEn; }

    public LocalDateTime getCanceladaEn() { return canceladaEn; }
    public void setCanceladaEn(LocalDateTime canceladaEn) { this.canceladaEn = canceladaEn; }
}
