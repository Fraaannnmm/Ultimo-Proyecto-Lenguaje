package ve.edu.ujap.reservas.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ve.edu.ujap.reservas.client.ServiciosClient.Usuario;
import ve.edu.ujap.reservas.dto.ReservaRequest;
import ve.edu.ujap.reservas.model.Reserva;
import ve.edu.ujap.reservas.service.ReservaService;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/reservas")
public class ReservaController {

    private final ReservaService service;

    public ReservaController(ReservaService service) {
        this.service = service;
    }

    /** Publico: bloques ocupados de un espacio en una fecha. */
    @GetMapping("/disponibilidad")
    public List<Map<String, Object>> disponibilidad(@RequestParam String espacioId,
            @RequestParam LocalDate fecha) {
        return service.disponibilidad(espacioId, fecha);
    }

    /** Reservas del usuario autenticado. */
    @GetMapping("/mias")
    public List<Reserva> mias(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Usuario usuario = service.autenticar(authorization);
        return service.delUsuario(usuario);
    }

    /** Todas las reservas (solo admin). */
    @GetMapping
    public List<Reserva> listar(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Usuario usuario = service.autenticar(authorization);
        return service.todas(usuario);
    }

    @GetMapping("/{id}")
    public Reserva obtener(@PathVariable Long id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Usuario usuario = service.autenticar(authorization);
        return service.obtener(id, usuario);
    }

    @PostMapping
    public ResponseEntity<Reserva> crear(@Valid @RequestBody ReservaRequest req,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Usuario usuario = service.autenticar(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.crear(req, usuario));
    }

    @PatchMapping("/{id}/cancelar")
    public Reserva cancelar(@PathVariable Long id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Usuario usuario = service.autenticar(authorization);
        return service.cancelar(id, usuario);
    }
}
