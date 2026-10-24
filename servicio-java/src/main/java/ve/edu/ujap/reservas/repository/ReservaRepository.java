package ve.edu.ujap.reservas.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ve.edu.ujap.reservas.model.EstadoReserva;
import ve.edu.ujap.reservas.model.Reserva;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Repository
public interface ReservaRepository extends JpaRepository<Reserva, Long> {

  // Reservas que se cruzan con el horario [inicio, fin) en el mismo espacio
  @Query("""
      SELECT r FROM Reserva r
      WHERE r.espacioId = :espacioId AND r.fecha = :fecha AND r.estado = :estado
        AND r.horaInicio < :fin AND r.horaFin > :inicio
      """)
  List<Reserva> buscarChoquesEspacio(@Param("espacioId") String espacioId,
      @Param("fecha") LocalDate fecha,
      @Param("inicio") LocalTime inicio,
      @Param("fin") LocalTime fin,
      @Param("estado") EstadoReserva estado);

  // Reservas del mismo usuario que se cruzan con el horario (no puede estar en
  // dos sitios)
  @Query("""
      SELECT r FROM Reserva r
      WHERE r.usuarioId = :usuarioId AND r.fecha = :fecha AND r.estado = :estado
        AND r.horaInicio < :fin AND r.horaFin > :inicio
      """)
  List<Reserva> buscarChoquesUsuario(@Param("usuarioId") Long usuarioId,
      @Param("fecha") LocalDate fecha,
      @Param("inicio") LocalTime inicio,
      @Param("fin") LocalTime fin,
      @Param("estado") EstadoReserva estado);

  List<Reserva> findByEspacioIdAndFechaAndEstadoOrderByHoraInicio(String espacioId, LocalDate fecha,
      EstadoReserva estado);

  List<Reserva> findByUsuarioIdOrderByFechaDescHoraInicioDesc(Long usuarioId);

  long countByUsuarioIdAndEstadoAndFechaGreaterThanEqual(Long usuarioId, EstadoReserva estado,
      LocalDate desde);

  List<Reserva> findAllByOrderByFechaDescHoraInicioDesc();
}
