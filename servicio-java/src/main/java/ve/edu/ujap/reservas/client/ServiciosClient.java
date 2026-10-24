package ve.edu.ujap.reservas.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import ve.edu.ujap.reservas.exception.ApiException;

import java.util.Map;

/**
 * Comunicacion HTTP con los otros microservicios (por nombre de contenedor en la red Docker):
 *  - Python  -> valida el token y obtiene el usuario   (GET  /auth/me)
 *  - Node    -> verifica que el espacio exista         (GET  /espacios/{id})
 *  - Go      -> registra el evento para reportes y WS  (POST /eventos)
 */
@Component
public class ServiciosClient {

    private static final Logger log = LoggerFactory.getLogger(ServiciosClient.class);

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Usuario(Long id, String nombre, String email, String rol) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Espacio(@JsonProperty("_id") String id, String codigo, String nombre, String tipo,
                        Integer capacidad, Boolean activo) {
    }

    private final RestClient auth;
    private final RestClient catalogo;
    private final RestClient reportes;
    private final String internalKey;

    public ServiciosClient(@Value("${app.servicios.auth-url}") String authUrl,
                        @Value("${app.servicios.catalogo-url}") String catalogoUrl,
                        @Value("${app.servicios.reportes-url}") String reportesUrl,
                        @Value("${app.servicios.internal-key}") String internalKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(5000);
        this.auth = RestClient.builder().baseUrl(authUrl).requestFactory(factory).build();
        this.catalogo = RestClient.builder().baseUrl(catalogoUrl).requestFactory(factory).build();
        this.reportes = RestClient.builder().baseUrl(reportesUrl).requestFactory(factory).build();
        this.internalKey = internalKey;
    }

    /** Llama al servicio Python para validar el JWT. */
    public Usuario validarToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Falta el token de autenticacion");
        }
        try {
            return auth.get().uri("/auth/me")
                    .header("Authorization", authorization)
                    .retrieve()
                    .body(Usuario.class);
        } catch (HttpClientErrorException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Token expirado o invalido");
        } catch (RestClientException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "El servicio de usuarios no esta disponible");
        }
    }

    /** Llama al servicio Node para obtener el espacio desde MongoDB. */
    public Espacio obtenerEspacio(String espacioId) {
        try {
            return catalogo.get().uri("/espacios/{id}", espacioId)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new ApiException(HttpStatus.NOT_FOUND, "El espacio no existe en el catalogo");
                    })
                    .body(Espacio.class);
        } catch (RestClientException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "El servicio de catalogo no esta disponible");
        }
    }

    /** Avisa al servicio Go. Si Go no responde la reserva igual queda guardada. */
    public void notificarEvento(Map<String, Object> evento) {
        try {
            reportes.post().uri("/eventos")
                    .header("X-Internal-Key", internalKey)
                    .body(evento)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("No se pudo notificar al servicio de reportes: {}", e.getMessage());
        }
    }
}
