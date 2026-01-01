package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	// Health check mode for Docker healthcheck
	healthcheck := flag.Bool("healthcheck", false, "Run health check and exit")
	flag.Parse()

	if *healthcheck {
		config := LoadConfig()
		resp, err := http.Get(fmt.Sprintf("http://localhost:%s/health", config.Port))
		if err != nil {
			os.Exit(1)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		os.Exit(0)
	}
	// Load configuration
	config := LoadConfig()

	log.Printf("Starting soeji-converter on port %s", config.Port)
	log.Printf("S3 endpoint: %s", config.S3Endpoint)

	// Initialize S3 client
	s3Client, err := NewS3Client(config)
	if err != nil {
		log.Fatalf("Failed to initialize S3 client: %v", err)
	}

	// Create app state
	state := &AppState{
		Config:   config,
		S3Client: s3Client,
	}

	// Setup routes with a custom mux for proper routing
	mux := http.NewServeMux()
	mux.HandleFunc("/health", state.HealthHandler)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			state.RootHandler(w, r)
		} else {
			state.ImageHandler(w, r)
		}
	})

	// Start server
	addr := fmt.Sprintf(":%s", config.Port)
	log.Printf("Listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
