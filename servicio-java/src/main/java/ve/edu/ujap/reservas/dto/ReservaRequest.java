package ve.edu.ujap.reservas.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalTime;

public record ReservaRequest(
        @NotBlank(message = "es obligatorio") String espacioId,
        @NotNull(message = "es obligatoria") LocalDate fecha,
        @NotNull(message = "es obligatoria") @JsonFormat(pattern = "HH:mm") LocalTime horaInicio,
        @NotNull(message = "es obligatoria") @JsonFormat(pattern = "HH:mm") LocalTime horaFin,
        @NotNull(message = "es obligatorio") @Min(value = 1, message = "debe ser al menos 1") Integer asistentes,
        @NotBlank(message = "es obligatorio") @Size(max = 200, message = "maximo 200 caracteres") String motivo
) {
}
