package ve.edu.ujap.reservas.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import ve.edu.ujap.reservas.repository.ReservaRepository;

import java.util.Map;

@RestController
public class HealthController {

    private final ReservaRepository repo;

    public HealthController(ReservaRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        try {
            long total = repo.count();
            return ResponseEntity.ok(Map.of("servicio", "java-reservas", "estado", "ok",
                    "bd", "postgresql", "reservas", total));
        } catch (Exception e) {
            return ResponseEntity.status(503).body(Map.of("servicio", "java-reservas",
                    "estado", "sin conexion a PostgreSQL"));
        }
    }
}
