package ve.edu.ujap.reservas.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import ve.edu.ujap.reservas.client.ServiciosClient;
import ve.edu.ujap.reservas.client.ServiciosClient.Espacio;
import ve.edu.ujap.reservas.client.ServiciosClient.Usuario;
import ve.edu.ujap.reservas.dto.ReservaRequest;
import ve.edu.ujap.reservas.exception.ApiException;
import ve.edu.ujap.reservas.model.EstadoReserva;
import ve.edu.ujap.reservas.model.Reserva;
import ve.edu.ujap.reservas.repository.ReservaRepository;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Reglas de negocio de las reservas:
 * - Horario de la universidad: 07:00 a 21:00, bloques de 30 minutos
 * - Duracion maxima por rol: estudiante 2h, profesor 4h, admin 8h
 * - Los auditorios solo los reservan profesores y administradores
 * - Un estudiante puede tener como maximo 3 reservas activas a futuro
 * - Los asistentes no pueden superar la capacidad del espacio
 * - No puede haber choque de horario en el mismo espacio ni para el mismo
 * usuario
 * - Se reserva desde hoy hasta 30 dias de anticipacion
 */
@Service
public class ReservaService {

    private static final LocalTime APERTURA = LocalTime.of(7, 0);
    private static final LocalTime CIERRE = LocalTime.of(21, 0);
    private static final int DIAS_ANTICIPACION = 30;
    private static final int MAX_ACTIVAS_ESTUDIANTE = 3;
    private static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("HH:mm");

    private final ReservaRepository repo;
    private final ServiciosClient servicios;
    private final ZoneId zona;

    public ReservaService(ReservaRepository repo, ServiciosClient servicios,
            @Value("${app.zona-horaria}") String zonaHoraria) {
        this.repo = repo;
        this.servicios = servicios;
        this.zona = ZoneId.of(zonaHoraria);
    }

    public Usuario autenticar(String authorization) {
        return servicios.validarToken(authorization);
    }

    // synchronized: evita que dos peticiones simultaneas reserven el mismo bloque
    public synchronized Reserva crear(ReservaRequest req, Usuario usuario) {
        validarHorario(req);

        Espacio espacio = servicios.obtenerEspacio(req.espacioId());
        if (Boolean.FALSE.equals(espacio.activo())) {
            throw new ApiException(HttpStatus.CONFLICT, "El espacio esta fuera de servicio");
        }
        if ("auditorio".equals(espacio.tipo()) && "estudiante".equals(usuario.rol())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Los auditorios solo pueden reservarlos profesores");
        }
        if (espacio.capacidad() != null && req.asistentes() > espacio.capacidad()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "El espacio tiene capacidad para " + espacio.capacidad() + " personas");
        }

        long minutos = Duration.between(req.horaInicio(), req.horaFin()).toMinutes();
        int maximo = duracionMaxima(usuario.rol());
        if (minutos > maximo) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Con rol " + usuario.rol() + " puedes reservar maximo " + (maximo / 60) + " horas");
        }

        LocalDate hoy = LocalDate.now(zona);
        if ("estudiante".equals(usuario.rol())
                && repo.countByUsuarioIdAndEstadoAndFechaGreaterThanEqual(usuario.id(), EstadoReserva.ACTIVA,
                        hoy) >= MAX_ACTIVAS_ESTUDIANTE) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Ya tienes " + MAX_ACTIVAS_ESTUDIANTE + " reservas activas. Cancela una para reservar otra");
        }

        List<Reserva> choques = repo.buscarChoquesEspacio(espacio.id(), req.fecha(), req.horaInicio(),
                req.horaFin(), EstadoReserva.ACTIVA);
        if (!choques.isEmpty()) {
            Reserva c = choques.get(0);
            throw new ApiException(HttpStatus.CONFLICT, "El espacio ya esta reservado de "
                    + c.getHoraInicio().format(HORA) + " a " + c.getHoraFin().format(HORA));
        }
        if (!repo.buscarChoquesUsuario(usuario.id(), req.fecha(), req.horaInicio(), req.horaFin(),
                EstadoReserva.ACTIVA).isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "Ya tienes otra reserva en ese mismo horario");
        }

        Reserva r = new Reserva();
        r.setEspacioId(espacio.id());
        r.setEspacioCodigo(espacio.codigo());
        r.setEspacioNombre(espacio.nombre());
        r.setEspacioTipo(espacio.tipo());
        r.setUsuarioId(usuario.id());
        r.setUsuarioNombre(usuario.nombre());
        r.setUsuarioEmail(usuario.email());
        r.setUsuarioRol(usuario.rol());
        r.setFecha(req.fecha());
        r.setHoraInicio(req.horaInicio());
        r.setHoraFin(req.horaFin());
        r.setAsistentes(req.asistentes());
        r.setMotivo(req.motivo().trim());
        r.setCreadaEn(LocalDateTime.now(zona));
        Reserva guardada = repo.save(r);

        servicios.notificarEvento(evento("CREADA", guardada));
        return guardada;
    }

    public Reserva cancelar(Long id, Usuario usuario) {
        Reserva r = obtener(id, usuario);
        if (r.getEstado() == EstadoReserva.CANCELADA) {
            throw new ApiException(HttpStatus.CONFLICT, "La reserva ya estaba cancelada");
        }
        r.setEstado(EstadoReserva.CANCELADA);
        r.setCanceladaEn(LocalDateTime.now(zona));
        Reserva guardada = repo.save(r);

        servicios.notificarEvento(evento("CANCELADA", guardada));
        return guardada;
    }

    public Reserva obtener(Long id, Usuario usuario) {
        Reserva r = repo.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Reserva no encontrada"));
        if (!r.getUsuarioId().equals(usuario.id()) && !"admin".equals(usuario.rol())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Esta reserva pertenece a otro usuario");
        }
        return r;
    }

    public List<Reserva> delUsuario(Usuario usuario) {
        return repo.findByUsuarioIdOrderByFechaDescHoraInicioDesc(usuario.id());
    }

    public List<Reserva> todas(Usuario usuario) {
        if (!"admin".equals(usuario.rol())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Solo para administradores");
        }
        return repo.findAllByOrderByFechaDescHoraInicioDesc();
    }

    /**
     * Bloques ocupados de un espacio en una fecha (publico, sin datos personales
     * sensibles).
     */
    public List<Map<String, Object>> disponibilidad(String espacioId, LocalDate fecha) {
        return repo.findByEspacioIdAndFechaAndEstadoOrderByHoraInicio(espacioId, fecha, EstadoReserva.ACTIVA)
                .stream()
                .map(r -> Map.<String, Object>of(
                        "id", r.getId(),
                        "horaInicio", r.getHoraInicio().format(HORA),
                        "horaFin", r.getHoraFin().format(HORA),
                        "usuarioNombre", r.getUsuarioNombre(),
                        "motivo", r.getMotivo()))
                .toList();
    }

    // ---------- helpers ----------
    private void validarHorario(ReservaRequest req) {
        if (!req.horaFin().isAfter(req.horaInicio())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "La hora de fin debe ser despues de la de inicio");
        }
        if (req.horaInicio().isBefore(APERTURA) || req.horaFin().isAfter(CIERRE)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "El horario permitido es de 07:00 a 21:00");
        }
        if (req.horaInicio().getMinute() % 30 != 0 || req.horaFin().getMinute() % 30 != 0) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Las reservas son en bloques de 30 minutos");
        }
        LocalDate hoy = LocalDate.now(zona);
        if (req.fecha().isBefore(hoy)
                || (req.fecha().isEqual(hoy) && !req.horaInicio().isAfter(LocalTime.now(zona)))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "No puedes reservar en una fecha u hora pasada");
        }
        if (req.fecha().isAfter(hoy.plusDays(DIAS_ANTICIPACION))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Solo se puede reservar con " + DIAS_ANTICIPACION + " dias de anticipacion");
        }
    }

    private int duracionMaxima(String rol) {
        return switch (rol == null ? "" : rol) {
            case "admin" -> 8 * 60;
            case "profesor" -> 4 * 60;
            default -> 2 * 60;
        };
    }

    private Map<String, Object> evento(String tipo, Reserva r) {
        Map<String, Object> e = new HashMap<>();
        e.put("tipo", tipo);
        e.put("reservaId", r.getId());
        e.put("espacioId", r.getEspacioId());
        e.put("espacioCodigo", r.getEspacioCodigo());
        e.put("espacioNombre", r.getEspacioNombre());
        e.put("espacioTipo", r.getEspacioTipo());
        e.put("usuarioId", r.getUsuarioId());
        e.put("usuarioNombre", r.getUsuarioNombre());
        e.put("usuarioRol", r.getUsuarioRol());
        e.put("fecha", r.getFecha().toString());
        e.put("horaInicio", r.getHoraInicio().format(HORA));
        e.put("horaFin", r.getHoraFin().format(HORA));
        e.put("duracionMinutos", r.duracionMinutos());
        e.put("asistentes", r.getAsistentes());
        return e;
    }
}
