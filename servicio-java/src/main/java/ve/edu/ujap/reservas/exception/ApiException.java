package ve.edu.ujap.reservas.exception;

import org.springframework.http.HttpStatus;

/** Error de negocio con su codigo HTTP (se responde como {"detail": "..."}). */
public class ApiException extends RuntimeException {

    private final HttpStatus status;

    public ApiException(HttpStatus status, String mensaje) {
        super(mensaje);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
