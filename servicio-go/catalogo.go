package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// CatalogoClient: comunicacion HTTP con el servicio Node (catalogo de espacios)
type CatalogoClient struct {
	baseURL string
	http    *http.Client
}

func NewCatalogoClient(baseURL string) *CatalogoClient {
	return &CatalogoClient{baseURL: baseURL, http: &http.Client{Timeout: 3 * time.Second}}
}

func (c *CatalogoClient) Espacios() ([]EspacioCatalogo, error) {
	resp, err := c.http.Get(c.baseURL + "/espacios")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("catalogo respondio %d", resp.StatusCode)
	}
	var espacios []EspacioCatalogo
	if err := json.NewDecoder(resp.Body).Decode(&espacios); err != nil {
		return nil, err
	}
	return espacios, nil
}
