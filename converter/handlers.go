package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type AppState struct {
	Config   *Config
	S3Client *S3Client
}

func (s *AppState) RootHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		w.Header().Set("Cache-Control", "public, no-store")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Image Converter Service is running.\n"))
		return
	}
	http.NotFound(w, r)
}

func (s *AppState) HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

func (s *AppState) ImageHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse path: /{bucket}/{key}
	bucket, key, err := parsePath(r.URL.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Parse query parameters
	query := r.URL.Query()

	// Check for download mode (passthrough without conversion)
	if query.Get("download") == "1" {
		s.handleDownload(w, r, ctx, bucket, key)
		return
	}

	var width, height *uint32
	if widthStr := query.Get("w"); widthStr != "" {
		val, err := strconv.ParseUint(widthStr, 10, 32)
		if err != nil || val == 0 {
			http.Error(w, "invalid width parameter", http.StatusBadRequest)
			return
		}
		if val > uint64(s.Config.MaxDimension) {
			http.Error(w, fmt.Sprintf("width %d exceeds maximum %d", val, s.Config.MaxDimension), http.StatusBadRequest)
			return
		}
		w32 := uint32(val)
		width = &w32
	}

	if heightStr := query.Get("h"); heightStr != "" {
		val, err := strconv.ParseUint(heightStr, 10, 32)
		if err != nil || val == 0 {
			http.Error(w, "invalid height parameter", http.StatusBadRequest)
			return
		}
		if val > uint64(s.Config.MaxDimension) {
			http.Error(w, fmt.Sprintf("height %d exceeds maximum %d", val, s.Config.MaxDimension), http.StatusBadRequest)
			return
		}
		h32 := uint32(val)
		height = &h32
	}

	quality := s.Config.WebPDefaultQuality
	if q := query.Get("q"); q != "" {
		val, err := strconv.Atoi(q)
		if err != nil || val < 1 || val > 100 {
			http.Error(w, "quality must be between 1 and 100", http.StatusBadRequest)
			return
		}
		quality = val
	}

	fitMode := FitModeCover
	if fit := query.Get("fit"); fit != "" {
		fitMode = ParseFitMode(fit)
	}

	// Determine output format from Accept header
	outputFormat := determineFormat(r.Header.Get("Accept"))

	// Fetch image from S3
	log.Printf("Fetching image from S3: bucket=%s, key=%s", bucket, key)
	originFetchStart := time.Now()
	data, err := s.S3Client.GetObject(ctx, bucket, key)
	originFetchDuration := time.Since(originFetchStart)
	if err != nil {
		if _, ok := err.(*NotFoundError); ok {
			http.Error(w, "Image not found", http.StatusNotFound)
			return
		}
		log.Printf("S3 error: %v", err)
		http.Error(w, "Failed to fetch image from storage", http.StatusBadGateway)
		return
	}

	// Convert image
	log.Printf("Converting image: w=%v, h=%v, q=%d, format=%d", width, height, quality, outputFormat)
	result, err := Convert(&ConversionRequest{
		Data:         data,
		Width:        width,
		Height:       height,
		OutputFormat: outputFormat,
		Quality:      quality,
		FitMode:      fitMode,
	})
	if err != nil {
		log.Printf("Image processing error: %v", err)
		http.Error(w, "Failed to process image", http.StatusInternalServerError)
		return
	}

	log.Printf("Conversion complete: %dx%d -> %dx%d",
		result.OriginalWidth, result.OriginalHeight,
		result.OutputWidth, result.OutputHeight)

	// Set response headers
	w.Header().Set("Content-Type", result.ContentType)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Vary", "Accept")
	w.Header().Set("X-Origin-Fetch-Time", fmt.Sprintf("%.2fms", float64(originFetchDuration.Microseconds())/1000.0))
	w.WriteHeader(http.StatusOK)
	w.Write(result.Data)
}

func parsePath(path string) (bucket, key string, err error) {
	path = strings.TrimPrefix(path, "/")

	idx := strings.Index(path, "/")
	if idx == -1 {
		return "", "", fmt.Errorf("path must be in format: /{bucket}/{key}")
	}

	bucket = path[:idx]
	key = path[idx+1:]

	if bucket == "" {
		return "", "", fmt.Errorf("bucket name is empty")
	}
	if key == "" {
		return "", "", fmt.Errorf("object key is empty")
	}

	return bucket, key, nil
}

func determineFormat(accept string) OutputFormat {
	if strings.Contains(accept, "image/webp") {
		return OutputFormatWebP
	}
	return OutputFormatPNG
}

func (s *AppState) handleDownload(w http.ResponseWriter, r *http.Request, ctx context.Context, bucket, key string) {
	// Fetch image from S3 without any conversion
	log.Printf("Download request: bucket=%s, key=%s", bucket, key)
	data, err := s.S3Client.GetObject(ctx, bucket, key)
	if err != nil {
		if _, ok := err.(*NotFoundError); ok {
			http.Error(w, "Image not found", http.StatusNotFound)
			return
		}
		log.Printf("S3 error: %v", err)
		http.Error(w, "Failed to fetch image from storage", http.StatusBadGateway)
		return
	}

	// Determine content type from file extension
	contentType := "application/octet-stream"
	if strings.HasSuffix(strings.ToLower(key), ".png") {
		contentType = "image/png"
	} else if strings.HasSuffix(strings.ToLower(key), ".jpg") || strings.HasSuffix(strings.ToLower(key), ".jpeg") {
		contentType = "image/jpeg"
	} else if strings.HasSuffix(strings.ToLower(key), ".webp") {
		contentType = "image/webp"
	} else if strings.HasSuffix(strings.ToLower(key), ".gif") {
		contentType = "image/gif"
	}

	// Extract filename from key (last segment after /)
	// This is safe as the key comes from S3, not user input
	parts := strings.Split(key, "/")
	downloadFilename := parts[len(parts)-1]

	// Set headers for download
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", downloadFilename))
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, private")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}
