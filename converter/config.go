package main

import (
	"os"
	"strconv"
)

type Config struct {
	Port                 string
	S3Endpoint           string
	S3AccessKey          string
	S3SecretKey          string
	S3Region             string
	WebPDefaultQuality   int
	MaxDimension         uint32
}

func LoadConfig() *Config {
	return &Config{
		Port:                 getEnv("CONVERTER_PORT", "8000"),
		S3Endpoint:           getEnv("S3_ENDPOINT", "http://rustfs:9000"),
		S3AccessKey:          getEnv("S3_ACCESS_KEY", "rustfsadmin"),
		S3SecretKey:          getEnv("S3_SECRET_KEY", "rustfsadmin"),
		S3Region:             getEnv("S3_REGION", "us-east-1"),
		WebPDefaultQuality:   getEnvInt("WEBP_DEFAULT_QUALITY", 85),
		MaxDimension:         uint32(getEnvInt("MAX_DIMENSION", 4096)),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
