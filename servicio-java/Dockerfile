# ---------- Etapa 1: compilar con Maven ----------
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build

# Descarga dependencias primero (se cachea si el pom.xml no cambia)
COPY pom.xml .
RUN mvn -q -B dependency:go-offline

COPY src ./src
RUN mvn -q -B -DskipTests package

# ---------- Etapa 2: imagen liviana solo con el JRE ----------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

COPY --from=build /build/target/servicio-reservas.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
