package main

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"

	"github.com/chai2010/webp"
	"github.com/disintegration/imaging"
	"github.com/gen2brain/avif"
)

type OutputFormat int

const (
	OutputFormatPNG OutputFormat = iota
	OutputFormatAVIF
	OutputFormatWebP
	OutputFormatJPEG
)

type FitMode int

const (
	FitModeCover FitMode = iota
	FitModeContain
	FitModeFill
)

func (f FitMode) String() string {
	switch f {
	case FitModeCover:
		return "cover"
	case FitModeContain:
		return "contain"
	case FitModeFill:
		return "fill"
	default:
		return "cover"
	}
}

func ParseFitMode(s string) FitMode {
	switch s {
	case "cover":
		return FitModeCover
	case "contain":
		return FitModeContain
	case "fill":
		return FitModeFill
	default:
		return FitModeCover
	}
}

type ConversionRequest struct {
	Data         []byte
	Width        *uint32
	Height       *uint32
	OutputFormat OutputFormat
	Quality      int
	FitMode      FitMode
}

type ConversionResult struct {
	Data           []byte
	ContentType    string
	OriginalWidth  uint32
	OriginalHeight uint32
	OutputWidth    uint32
	OutputHeight   uint32
}

func Convert(req *ConversionRequest) (*ConversionResult, error) {
	// Decode image
	img, _, err := image.Decode(bytes.NewReader(req.Data))
	if err != nil {
		return nil, fmt.Errorf("failed to decode image: %w", err)
	}

	bounds := img.Bounds()
	originalWidth := uint32(bounds.Dx())
	originalHeight := uint32(bounds.Dy())

	// Resize if dimensions are specified
	resized := resizeImage(img, req.Width, req.Height, req.FitMode)
	resizedBounds := resized.Bounds()
	outputWidth := uint32(resizedBounds.Dx())
	outputHeight := uint32(resizedBounds.Dy())

	// Encode to output format
	data, contentType, err := encodeImage(resized, req.OutputFormat, req.Quality)
	if err != nil {
		return nil, err
	}

	return &ConversionResult{
		Data:           data,
		ContentType:    contentType,
		OriginalWidth:  originalWidth,
		OriginalHeight: originalHeight,
		OutputWidth:    outputWidth,
		OutputHeight:   outputHeight,
	}, nil
}

func resizeImage(img image.Image, width, height *uint32, fitMode FitMode) image.Image {
	if width == nil && height == nil {
		return img
	}

	bounds := img.Bounds()
	origWidth := uint32(bounds.Dx())
	origHeight := uint32(bounds.Dy())

	var newWidth, newHeight int

	if width != nil && height != nil {
		// Both dimensions specified
		switch fitMode {
		case FitModeCover:
			// Resize to fill, cropping if necessary
			return imaging.Fill(img, int(*width), int(*height), imaging.Center, imaging.Lanczos)
		case FitModeContain:
			// Resize to fit within bounds, maintaining aspect ratio
			return imaging.Fit(img, int(*width), int(*height), imaging.Lanczos)
		case FitModeFill:
			// Resize exactly, ignoring aspect ratio
			return imaging.Resize(img, int(*width), int(*height), imaging.Lanczos)
		}
	} else if width != nil {
		// Only width specified - maintain aspect ratio
		ratio := float64(*width) / float64(origWidth)
		newWidth = int(*width)
		newHeight = int(float64(origHeight) * ratio)
	} else {
		// Only height specified - maintain aspect ratio
		ratio := float64(*height) / float64(origHeight)
		newHeight = int(*height)
		newWidth = int(float64(origWidth) * ratio)
	}

	return imaging.Resize(img, newWidth, newHeight, imaging.Lanczos)
}

func encodeImage(img image.Image, format OutputFormat, quality int) ([]byte, string, error) {
	var buf bytes.Buffer

	switch format {
	case OutputFormatPNG:
		if err := imaging.Encode(&buf, img, imaging.PNG); err != nil {
			return nil, "", fmt.Errorf("failed to encode PNG: %w", err)
		}
		return buf.Bytes(), "image/png", nil

	case OutputFormatAVIF:
		// gen2brain/avif Quality: 0-100, higher is better (100 = lossless)
		// Use YCbCrSubsampleRatio444 to preserve color accuracy
		opts := avif.Options{
			Quality:           quality,
			QualityAlpha:      quality,
			Speed:             6,
			ChromaSubsampling: image.YCbCrSubsampleRatio444, // Full chroma for better color
		}
		if err := avif.Encode(&buf, img, opts); err != nil {
			return nil, "", fmt.Errorf("failed to encode AVIF: %w", err)
		}
		return buf.Bytes(), "image/avif", nil

	case OutputFormatWebP:
		if err := webp.Encode(&buf, img, &webp.Options{Quality: float32(quality)}); err != nil {
			return nil, "", fmt.Errorf("failed to encode WebP: %w", err)
		}
		return buf.Bytes(), "image/webp", nil

	case OutputFormatJPEG:
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
			return nil, "", fmt.Errorf("failed to encode JPEG: %w", err)
		}
		return buf.Bytes(), "image/jpeg", nil

	default:
		return nil, "", fmt.Errorf("unsupported output format")
	}
}
