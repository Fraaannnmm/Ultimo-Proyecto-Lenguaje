# ---------- Etapa 1: compilar ----------
FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /reportes .

# ---------- Etapa 2: imagen minima ----------
FROM alpine:3.20
WORKDIR /app

COPY --from=build /reportes /app/reportes

EXPOSE 8080

CMD ["/app/reportes"]
